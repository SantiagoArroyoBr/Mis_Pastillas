const prefix = 'acompana-auth-v1:';
const refreshQueues = new Map();

function browserStorage(name) {
  try { return globalThis[name]; } catch { return undefined; }
}

export function tokenExpiry(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    const claims = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
    return Number.isFinite(claims.exp) && claims.exp > 0 ? claims.exp * 1000 : undefined;
  } catch { return undefined; }
}

export function sessionFromAuth(auth, preferences = {}, now = Date.now()) {
  if (!auth || typeof auth.access_token !== 'string' || !auth.access_token
      || auth.access_token.length > 16384 || typeof auth.user?.id !== 'string' || !auth.user.id) {
    throw new Error('La sesión recibida no es válida.');
  }
  const jwtExpiry = tokenExpiry(auth.access_token);
  const statedExpiry = Number.isFinite(auth.expires_at) ? auth.expires_at * 1000
    : Number.isFinite(auth.expires_in) ? now + auth.expires_in * 1000 : undefined;
  const expiresAt = jwtExpiry && statedExpiry ? Math.min(jwtExpiry, statedExpiry) : jwtExpiry ?? statedExpiry;
  return {
    version: 1, accessToken: auth.access_token,
    refreshToken: typeof auth.refresh_token === 'string' && auth.refresh_token.length <= 16384 ? auth.refresh_token : undefined,
    userId: auth.user.id, temporary: auth.user.app_metadata?.family_temporary === true,
    expiresAt, remember: preferences.remember === true, offlineCache: preferences.offlineCache === true
  };
}

function storedSession(value, now) {
  if (!value || value.version !== 1 || typeof value.userId !== 'string' || !value.userId
      || typeof value.accessToken !== 'string' || value.accessToken.length > 16384
      || typeof value.refreshToken !== 'string' || !value.refreshToken || value.refreshToken.length > 16384
      || !Number.isFinite(value.expiresAt)) return undefined;
  // Un valor expiresAt alterado no puede prolongar el JWT para lectura offline.
  const expiresAt = tokenExpiry(value.accessToken);
  if (!expiresAt) return undefined;
  return { version: 1, userId: value.userId, accessToken: value.accessToken,
    refreshToken: value.refreshToken, expiresAt: Math.min(expiresAt, value.expiresAt),
    temporary: value.temporary === true, remember: value.remember === true, offlineCache: value.offlineCache === true };
}

export function createSessionState(api, options = {}) {
  const tab = options.sessionStorage ?? browserStorage('sessionStorage');
  const local = options.localStorage ?? browserStorage('localStorage');
  const key = prefix + api;
  const now = options.now ?? Date.now;
  function remove(storage) { try { storage?.removeItem(key); } catch {} }
  function readStorage(storage) {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return undefined;
      const saved = storedSession(JSON.parse(raw), now());
      if (!saved) remove(storage);
      return saved;
    } catch { remove(storage); return undefined; }
  }
  return {
    read() { return readStorage(tab) ?? readStorage(local); },
    readFor(remember) { return readStorage(remember ? local : tab); },
    save(session) {
      if (!storedSession(session, now())) { remove(tab); remove(local); return false; }
      const target = session.remember ? local : tab;
      try {
        if (!target) return false;
        target.setItem(key, JSON.stringify(session));
        remove(session.remember ? tab : local);
        return true;
      } catch { remove(tab); remove(local); return false; }
    },
    clear() { remove(tab); remove(local); }
  };
}

// Una cola por API evita rotar dos veces un refresh token en la misma pestaña;
// Web Locks añade exclusión entre pestañas cuando está disponible.
export async function serializeRefresh(api, task, locks = globalThis.navigator?.locks) {
  const previous = refreshQueues.get(api) ?? Promise.resolve();
  const queued = previous.catch(() => {}).then(() => locks?.request
    ? locks.request('acompana-auth-refresh:' + api, task) : task());
  refreshQueues.set(api, queued);
  try { return await queued; }
  finally { if (refreshQueues.get(api) === queued) refreshQueues.delete(api); }
}
