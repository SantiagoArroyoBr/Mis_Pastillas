const genericRequestMessage = 'Si existe una cuenta principal con ese correo, recibirás un enlace para restablecer su contraseña. Revisa también la carpeta de correo no deseado.';
const authKeys = ['access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at', 'type', 'error', 'error_code', 'error_description'];

function decodeClaims(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return undefined;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), value => value.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return undefined; }
}

// Read only a recovery capability. It is never used as the ordinary application session.
// URL removal occurs before token parsing; no token is written to storage, logs or DOM.
export function consumeRecoveryLocation(location, history, now = Date.now()) {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const hasFragment = authKeys.some(key => fragment.has(key));
  const hasCode = url.searchParams.has('code');
  const hasQueryError = ['error', 'error_code', 'error_description'].some(key => url.searchParams.has(key));
  if (!hasFragment && !hasCode && !hasQueryError) return { kind: 'none' };
  if (hasFragment) url.hash = '';
  for (const key of [...authKeys, 'code']) url.searchParams.delete(key);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  if (hasCode) return { kind: 'unsupported-code' };
  if (fragment.has('error') || hasQueryError) return { kind: 'invalid' };
  if (fragment.get('type') !== 'recovery') return { kind: 'confirmation' };
  const accessToken = fragment.get('access_token') ?? '';
  if (!accessToken || accessToken.length > 8192) return { kind: 'invalid' };
  const claims = decodeClaims(accessToken);
  if (!claims || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)
    || typeof claims.iss !== 'string' || typeof claims.sub !== 'string') return { kind: 'invalid' };
  const expiresAt = claims.exp * 1000;
  if (!Number.isFinite(expiresAt)) return { kind: 'invalid' };
  if (expiresAt <= now) return { kind: 'expired' };
  return { kind: 'recovery', accessToken, expiresAt, issuer: claims.iss };
}

export function recoveryCooldownSeconds(until, now = Date.now()) {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export function createAccountRecovery({ getClient, link, onModeChange = () => {}, now = Date.now,
  schedule = setInterval, unschedule = clearInterval }) {
  const $ = id => document.getElementById(id);
  const requestForm = $('request-account-recovery');
  const passwordForm = $('complete-account-recovery');
  const requestButton = $('request-account-recovery-button');
  const saveButton = $('complete-account-recovery-button');
  const feedback = $('account-recovery-status');
  let recovery = link.kind === 'recovery' ? link : undefined;
  let busy = false, cooldownUntil = 0, timer, expiryTimer, requestGeneration = 0;

  function clearPasswords() {
    passwordForm.elements.password.value = '';
    passwordForm.elements.confirmation.value = '';
  }

  function updateCountdown() {
    const seconds = recoveryCooldownSeconds(cooldownUntil, now());
    requestButton.disabled = busy || seconds > 0;
    requestButton.textContent = seconds ? 'Volver a solicitar en ' + seconds + ' s' : 'Enviar enlace de recuperación';
    if (!seconds && timer !== undefined) { unschedule(timer); timer = undefined; }
  }

  function showMessage(message) { feedback.textContent = message; }

  function mode() {
    $('account-recovery-completion').hidden = !recovery;
    $('account-recovery-request').hidden = Boolean(recovery);
    onModeChange(Boolean(recovery));
    if (recovery && expiryTimer === undefined) expiryTimer = schedule(() => {
      if (!busy && recovery?.expiresAt <= now()) invalidate('El enlace de recuperación venció. Solicita uno nuevo.');
    }, 1000);
    if (!recovery && expiryTimer !== undefined) { unschedule(expiryTimer); expiryTimer = undefined; }
  }

  function invalidate(message) {
    recovery = undefined;
    clearPasswords();
    mode();
    showMessage(message);
  }

  async function request(event) {
    event?.preventDefault();
    if (busy || recoveryCooldownSeconds(cooldownUntil, now())) return;
    const email = requestForm.elements.email.value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@acompana.invalid')) {
      showMessage('Escribe el correo de tu cuenta principal. Los accesos temporales los recupera quien administra la familia.');
      return;
    }
    const generation = ++requestGeneration;
    busy = true;
    updateCountdown();
    showMessage('Solicitando el enlace de recuperación…');
    try {
      await getClient().requestRecovery(email);
      if (generation !== requestGeneration) return;
      cooldownUntil = now() + 60000;
      showMessage(genericRequestMessage);
    } catch (error) {
      if (generation !== requestGeneration) return;
      if (error.status === 429) {
        cooldownUntil = now() + 60000;
        showMessage('Hay demasiadas solicitudes. Espera antes de pedir otro enlace.');
      } else if (error.status >= 400 && error.status < 500) {
        // Do not reveal whether the address exists or repeat remote account details.
        cooldownUntil = now() + 60000;
        showMessage(genericRequestMessage);
      } else showMessage('No se pudo solicitar el enlace. Comprueba tu conexión y vuelve a intentar.');
    } finally {
      if (generation === requestGeneration) {
        busy = false;
        updateCountdown();
        if (recoveryCooldownSeconds(cooldownUntil, now()) && timer === undefined) timer = schedule(updateCountdown, 1000);
      }
    }
  }

  async function complete(event) {
    event?.preventDefault();
    if (busy || !recovery) return;
    const password = passwordForm.elements.password.value;
    const confirmation = passwordForm.elements.confirmation.value;
    if (password.length < 12 || password.length > 128 || password !== confirmation) {
      clearPasswords();
      showMessage('Usa entre 12 y 128 caracteres y repite la misma contraseña en ambos campos.');
      return;
    }
    if (recovery.expiresAt <= now()) {
      invalidate('El enlace de recuperación venció. Solicita uno nuevo.');
      return;
    }
    busy = true;
    saveButton.disabled = true;
    showMessage('Guardando tu nueva contraseña…');
    try {
      await getClient().completeRecovery(recovery.accessToken, password);
      recovery = undefined;
      mode();
      showMessage('Contraseña actualizada. Inicia sesión con tu correo y la nueva contraseña.');
    } catch (error) {
      if ([400, 401, 403, 422].includes(error.status) && error.code !== 'weak_password' && error.code !== 'same_password') {
        invalidate('El enlace ya no es válido o venció. Solicita uno nuevo.');
      } else if (['weak_password', 'same_password'].includes(error.code)) {
        showMessage('Elige una contraseña distinta, de al menos 12 caracteres, que cumpla los requisitos de seguridad.');
      } else showMessage('No se pudo guardar la contraseña. Vuelve a intentar mientras el enlace siga vigente.');
    } finally {
      busy = false;
      saveButton.disabled = false;
      clearPasswords();
    }
  }

  requestForm.addEventListener('submit', request);
  passwordForm.addEventListener('submit', complete);
  $('cancel-account-recovery').addEventListener('click', () => {
    if (!busy) invalidate('Puedes iniciar sesión o solicitar otro enlace de recuperación.');
  });
  mode();
  if (['invalid', 'expired', 'unsupported-code'].includes(link.kind)) {
    showMessage(link.kind === 'unsupported-code' ? 'Este enlace requiere otro flujo de verificación. Solicita aquí un nuevo enlace de recuperación.'
      : 'El enlace de recuperación no es válido o venció. Solicita uno nuevo.');
  } else if (link.kind === 'confirmation') showMessage('Vuelve a iniciar sesión con tu cuenta. Si necesitas recuperar la contraseña, solicita un enlace aquí.');
  else if (recovery) showMessage('Elige una nueva contraseña para tu cuenta principal.');
  link = { kind: 'none' };

  return { request, complete, dispose() {
    requestGeneration++;
    if (timer !== undefined) unschedule(timer);
    if (expiryTimer !== undefined) unschedule(expiryTimer);
    recovery = undefined;
    clearPasswords();
  } };
}
