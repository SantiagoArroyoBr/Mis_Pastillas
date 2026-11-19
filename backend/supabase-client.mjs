import { connections } from './connection-config.mjs';
import { createSessionState, sessionFromAuth, serializeRefresh, tokenExpiry } from './session-state.mjs';
import { createOfflineCache, cacheableSelect } from './offline-cache.mjs';
import { readHistoryWindow } from './history.mjs';

// Una lectura fallida después del commit no debe invitar a repetir el alta.
export async function saveAndRefresh({ write, reset, refresh, notify, message }) {
  let result, warning;
  try{result=await write();}catch(error){
    if(!error.saved)throw error;
    result=error.result;warning=error.message;
  }
  reset();
  try {
    await refresh(result);
    notify(warning??message,warning?'warning':undefined);
  } catch {
    notify(message + ' No se pudo actualizar la vista. Pulsa Actualizar fichas; no repitas el alta.', 'warning');
  }
  return result;
}

export async function loadAppointments(client, family, today, patient = '', counts = {}) {
  const fields = {
    family_id: 'eq.' + family,
    ...(patient && { patient_id: 'eq.' + patient }),
    select: 'id,patient_id,patient_name,revision,appointment_day,legacy_day,appointment_time,location,notes,doctor'
  };
  const [upcoming, past, legacy] = await Promise.all([
    readHistoryWindow(client, 'appointment_details', { ...fields, appointment_day: 'gte.' + today,
      order: 'appointment_day.asc,appointment_time.asc.nullslast,id.asc' }, counts.upcoming ?? 20),
    readHistoryWindow(client, 'appointment_details', { ...fields, appointment_day: 'lt.' + today,
      order: 'appointment_day.desc,appointment_time.desc.nullslast,id.desc' }, counts.past ?? 20),
    readHistoryWindow(client, 'appointment_details', { ...fields, appointment_day: 'is.null',
      order: 'legacy_day.desc,id.desc' }, counts.legacy ?? 20)
  ]);
  return { upcoming: upcoming.rows, past: past.rows, legacy: legacy.rows,
    pagination: { upcoming, past, legacy } };
}

export function createClient(key, api = (connections.local ?? connections.cloud).url, accessUrl, options = {}) {
  if (!Object.values(connections).some(connection => connection.url === api)) {
    throw new Error('El destino de Supabase no está configurado.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Usa la clave publicable del proyecto seleccionado.');
  }
  if (accessUrl && accessUrl !== api + '/functions/v1/family-access'
    && !(new URL(api).hostname === '127.0.0.1' && new URL(api).protocol === 'http:' && accessUrl === api+'/api/access')) {
    throw new Error('El servicio de accesos no está configurado.');
  }
  let token, temporary = false, session, offline = false, persisted = false, sessionGeneration = 0;
  const now = options.now ?? Date.now;
  const vault = createSessionState(api, options);
  const cache = createOfflineCache(api, { storage: options.localStorage, now });
  let refreshPromise;
  function report() {
    try { options.onStatus?.({ offline, readOnly: offline, persisted,
      lastSync: session && cache.lastSync(session.userId), remember: session?.remember === true,
      offlineEnabled: session?.offlineCache === true && !session?.temporary }); } catch {}
  }
  function clearSession() {
    sessionGeneration++;
    token = session = undefined; temporary = offline = persisted = false;
    vault.clear(); cache.clear(); report();
  }
  function install(auth, preferences = options) {
    const next = sessionFromAuth(auth, preferences, now());
    const identityChanged = session?.userId !== next.userId || temporary !== next.temporary;
    if (session?.userId !== next.userId) cache.retainUser(next.userId);
    session = next; token = next.accessToken; temporary = next.temporary;
    // Rotar el token de la misma identidad no invalida lecturas ya autorizadas.
    // Cierre/cambio de cuenta sí avanza la generación y descarta respuestas tardías.
    if (identityChanged) sessionGeneration++;
    persisted = vault.save(session); report();
  }
  function offlineAllowed() {
    return Boolean(session?.offlineCache && !temporary && Number.isFinite(session.expiresAt)
      && session.expiresAt > now() && tokenExpiry(token) > now());
  }
  function cachedResult(path, error) {
    if (!error.network || !offlineAllowed() || !cacheableSelect(path)) throw error;
    const saved = cache.get(session.userId, path);
    if (!saved) throw error;
    offline = true; report();
    return saved.data;
  }
  async function ensureFresh() {
    if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt - now() > 30000) return;
    if (!session.refreshToken) {
      if (session.expiresAt > now()) return;
      clearSession(); throw Object.assign(new Error('La sesión terminó. Vuelve a iniciar sesión.'), { status: 401 });
    }
    if (!refreshPromise) refreshPromise = serializeRefresh(api, async () => {
      // Otra pestaña puede haber rotado el token mientras esperábamos el lock.
      const saved = vault.readFor(session.remember);
      if (saved && saved.userId === session.userId && saved.accessToken !== token && saved.expiresAt - now() > 30000) {
        const identityChanged = temporary !== saved.temporary;
        session = saved; token = saved.accessToken; temporary = saved.temporary;
        if (identityChanged) sessionGeneration++;
        report(); return;
      }
      const previousUser = session.userId;
      const generation = sessionGeneration;
      try {
        const result = await request('/auth/v1/token?grant_type=refresh_token',
          { refresh_token: session.refreshToken }, api, { skipSession: true, noAuth: true, guardIdentity: true });
        if (generation !== sessionGeneration || session?.userId !== previousUser) {
          throw Object.assign(new Error('La sesión cambió.'), { status: 401, stale: true });
        }
        if (result?.user?.id !== previousUser) {
          clearSession(); throw Object.assign(new Error('La sesión cambió. Vuelve a iniciar sesión.'), { status: 401 });
        }
        install(result, session);
      } catch (error) {
        if (!error.network && !error.stale) clearSession();
        throw error;
      }
    }, options.locks).finally(() => { refreshPromise = undefined; });
    await refreshPromise;
  }

  async function request(path, body, destination = api, overrides = {}) {
    const selected = body === undefined && destination === api && cacheableSelect(path);
    const protectedCall = token && !overrides.skipSession && !path.startsWith('/auth/');
    const guardedCall = protectedCall || overrides.guardIdentity;
    const generation = sessionGeneration;
    function requireCurrentSession() {
      if (guardedCall && generation !== sessionGeneration) {
        throw Object.assign(new Error('La sesión cambió. Vuelve a consultar los datos.'), { status: 401, stale: true });
      }
    }
    function networkFailure() {
      requireCurrentSession();
      const error = Object.assign(new Error(api === connections.local?.url
        ? 'No se pudo conectar con Supabase local. Revisa que esté iniciado.'
        : 'No se pudo conectar con Supabase. Revisa tu conexión.'), { network: true });
      if (selected) return cachedResult(path, error);
      throw error;
    }
    if (protectedCall && offline && body !== undefined) {
      throw Object.assign(new Error('Estás consultando sin conexión. Reconecta antes de guardar cambios.'), { offline: true });
    }
    if (protectedCall) {
      try { await ensureFresh(); }
      catch (error) { requireCurrentSession(); if (selected) return cachedResult(path, error); throw error; }
      requireCurrentSession();
    }
    let response;
    try {
      response = await fetch(destination + path, {
        method: overrides.method ?? (body === undefined ? 'GET' : 'POST'),
        headers: {
          apikey: key,
          ...(!overrides.noAuth && (overrides.token ?? token) && { Authorization: 'Bearer ' + (overrides.token ?? token) }),
          ...(body !== undefined && { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
    } catch { return networkFailure(); }
    let text;
    try { text = await response.text(); }
    catch { if (response.ok) return networkFailure(); text = ''; }
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    requireCurrentSession();
    if (!response.ok) {
      if (response.status === 401 || (response.status === 403 && path.startsWith('/auth/'))) clearSession();
      else if (response.status === 403) { cache.clear(); offline = false; report(); }
      const responseCode = typeof result?.error_code === 'string' ? result.error_code
        : typeof result?.code === 'string' ? result.code : undefined;
      let message = 'La operación fue rechazada.';
      if (responseCode === 'PGRST205' || responseCode === 'PGRST202') {
        message = 'Falta inicializar o actualizar el esquema de Acompaña en este proyecto.';
      } else if (responseCode === 'email_not_confirmed') {
        message = 'Confirma tu correo antes de iniciar sesión.';
      } else if (responseCode === 'invalid_credentials') {
        message = 'Revisa tu correo y contraseña.';
      } else if (responseCode === 'email_address_not_authorized') {
        message = 'Supabase todavía no permite enviar confirmaciones a este correo. Falta configurar el servicio de correo del proyecto.';
      } else if (responseCode === 'over_email_send_rate_limit') {
        message = 'Se alcanzó el límite de correos de confirmación. Espera antes de solicitar otro.';
      } else if (responseCode === 'over_request_rate_limit' || response.status === 429) {
        message = 'Hay demasiados intentos. Espera unos minutos antes de volver a intentar.';
      } else if (responseCode === 'email_address_invalid') {
        message = 'Supabase no acepta este correo. Revisa la dirección y usa un buzón al que tengas acceso.';
      } else if (responseCode === 'weak_password') {
        message = 'La contraseña no cumple los requisitos del proyecto. Usa una contraseña más larga y exclusiva para esta cuenta.';
      } else if (responseCode === 'signup_disabled' || responseCode === 'email_provider_disabled') {
        message = 'El registro con correo está deshabilitado en este proyecto de Supabase.';
      } else if (path.startsWith('/auth/')) {
        const code = /^[a-z][a-z0-9_]{0,63}$/.test(responseCode ?? '') ? responseCode : 'sin_codigo';
        message = 'Supabase rechazó el acceso (HTTP ' + response.status + ', ' + code + ').';
      }
      const error = new Error(message);
      error.status = response.status;
      error.code = responseCode;
      throw error;
    }
    if (selected && offlineAllowed() && Array.isArray(result)) { cache.set(session.userId, path, result); report(); }
    return result;
  }

  return {
    get temporaryAccessEnabled() { return Boolean(accessUrl); },
    get isTemporary() { return temporary; },
    get offline() { return offline; },
    get readOnly() { return offline; },
    get lastSync() { return session && cache.lastSync(session.userId); },
    get remember() { return session?.remember === true; },
    get offlineEnabled() { return session?.offlineCache === true && !temporary; },
    get persistenceAvailable() { return persisted; },
    async restoreSession() {
      const saved = vault.read();
      if (!saved) { cache.clear(); return undefined; }
      session = saved; token = saved.accessToken; temporary = saved.temporary; persisted = true;
      sessionGeneration++;
      const generation = sessionGeneration;
      const requireRestoringSession = () => {
        if (generation !== sessionGeneration) throw Object.assign(new Error('La sesión cambió. Vuelve a consultar los datos.'), {status:401,stale:true});
      };
      cache.retainUser(saved.userId);
      try {
        await ensureFresh();
        requireRestoringSession();
        const user = await request('/auth/v1/user', undefined, api, { skipSession: true, guardIdentity: true });
        if (user?.id !== session?.userId) { clearSession(); return undefined; }
        offline = false; report(); return user.id;
      } catch (error) {
        if (error.stale) throw error;
        // Un error de una recuperación anterior no puede borrar la nueva cuenta.
        if (generation !== sessionGeneration && session) requireRestoringSession();
        if (error.network && offlineAllowed() && cache.lastSync(session.userId)) {
          offline = true; report(); return session.userId;
        }
        clearSession();
        if (error.network) return undefined;
        throw error;
      }
    },
    async reconnect() {
      if (!session) return undefined;
      const generation = sessionGeneration;
      await ensureFresh();
      if (generation !== sessionGeneration) throw Object.assign(new Error('La sesión cambió. Vuelve a consultar los datos.'), {status:401,stale:true});
      const user = await request('/auth/v1/user', undefined, api, { skipSession: true, guardIdentity: true });
      if (user?.id !== session?.userId) { clearSession(); throw new Error('La sesión cambió. Vuelve a entrar.'); }
      offline = false; report(); return user.id;
    },
    access(action, payload) {
      if (!accessUrl) return Promise.reject(new Error('Los accesos temporales no están habilitados en este entorno.'));
      return request('', { ...payload, action }, accessUrl);
    },
    signUp(email, password) {
      if (accessUrl && (typeof password !== 'string' || password.length < 12 || password.length > 128)) {
        return Promise.reject(new Error('Usa una contraseña de entre 12 y 128 caracteres para crear la cuenta.'));
      }
      return accessUrl ? request('', { action: 'auth-email', kind: 'signup', email, password }, accessUrl)
        : request('/auth/v1/signup', { email, password });
    },
    requestRecovery(email) {
      return accessUrl ? request('', { action: 'auth-email', kind: 'recover', email }, accessUrl)
        : request('/auth/v1/recover', { email });
    },
    async completeRecovery(accessToken, password) {
      if (typeof accessToken !== 'string' || accessToken.length > 8192
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) {
        throw new Error('El enlace de recuperación no es válido. Solicita uno nuevo.');
      }
      if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
        throw new Error('Usa una contraseña de entre 12 y 128 caracteres.');
      }
      await request('/auth/v1/user', { password }, api, { method: 'PUT', token: accessToken });
      await request('/auth/v1/logout?scope=global', {}, api, { token: accessToken }).catch(() => {});
      clearSession();
    },
    async signIn(email, password) {
      clearSession();
      const generation = sessionGeneration;
      if (/^temp-[0-9a-f-]{36}$/i.test(email)) email = email.toLowerCase() + '@acompana.invalid';
      const auth = await request('/auth/v1/token?grant_type=password', { email, password }, api, { noAuth: true });
      if (generation !== sessionGeneration) throw new Error('La sesión cambió. Vuelve a iniciar sesión.');
      install(auth);
      return auth.user.id;
    },
    async signOut() {
      try {
        if (token) await request('/auth/v1/logout?scope=local', {}, api, { skipSession: true });
      } finally {
        clearSession();
      }
    },
    select: (table, params = {}) => request('/rest/v1/' + table + '?' + new URLSearchParams(params)),
    rpc: (name, args) => request('/rest/v1/rpc/' + name, args)
  };
}
