// Solo servidor: este módulo no forma parte del artefacto público.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function hashAccessValue(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createAccessHandler(config, fetcher = fetch) {
  const { supabaseUrl, publishableKey, serviceKey, allowedOrigin } = config;
  if (!supabaseUrl || !publishableKey || !serviceKey || !allowedOrigin) throw new Error('Configuración privada incompleta.');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': allowedOrigin, 'Vary': 'Origin' };
  const reply = (status, data) => Response.json(data, { status, headers });
  const fault = status => { throw Object.assign(new Error('Solicitud rechazada.'), { status }); };
  async function call(path, body, token, admin = false, method) {
    const response = await fetcher(supabaseUrl + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { apikey: admin ? serviceKey : publishableKey,
        ...((admin || token) && { Authorization: 'Bearer ' + (admin ? serviceKey : token) }), 'Content-Type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const status = response.status === 404 ? 404 : result?.code === 'PT401' ? 401 : result?.code === '42501' ? 403
        : result?.code === 'PT429' ? 429 : result?.code === 'PT409' ? 409 : response.status >= 500 ? 503 : response.status;
      fault(status);
    }
    return result;
  }
  const rpc = (name, body, token, admin = false) => call('/rest/v1/rpc/' + name, body, token, admin);
  async function reserve(value, purpose) {
    const accepted = await rpc('reserve_access_request', {
      bucket_hash: await hashAccessValue(purpose + ':' + value), purpose
    }, null, true);
    if (!accepted) fault(429);
  }
  return async request => {
    // CORS no sustituye Auth: las acciones administrativas verifican el JWT con Auth.
    if (request.headers.get('Origin') !== allowedOrigin) return reply(403, { error: 'Origen no permitido.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey'
    } });
    if (request.method !== 'POST') return reply(405, { error: 'Método no permitido.' });
    let claimed, claimId;
    try {
      const reader = request.body?.getReader();
      if (!reader) fault(400);
      let size = 0; const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); fault(413); }
        chunks.push(value);
      }
      const data = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { data.set(chunk,offset); offset+=chunk.byteLength; }
      let input;
      try { input = JSON.parse(new TextDecoder().decode(data)); } catch { fault(400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) fault(400);
      const { action } = input;
      if (action === 'auth-email') {
        if (!['signup','recover','resend'].includes(input.kind) || typeof input.email !== 'string'
          || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
          || input.email.toLowerCase().endsWith('@acompana.invalid')) fault(400);
        const email = input.email.trim().toLowerCase();
        if (input.kind === 'signup' && (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128)) fault(400);
        if (!config.centralEmailHook) await reserve(email, 'auth_mail');
        await call('/auth/v1/' + input.kind + '?redirect_to=' + encodeURIComponent(allowedOrigin + '/'), {
          email, ...(input.kind === 'signup' && { password: input.password }),
          ...(input.kind === 'resend' && { type: 'signup' }),
          ...(input.captchaToken && { gotrue_meta_security: { captcha_token: input.captchaToken } })
        });
        return reply(200, { confirmationRequired: true });
      }
      if (action === 'activate') {
        if (!/^[0-9a-f-]{73}$/i.test(input.code ?? '') || typeof input.password !== 'string'
          || input.password.length < 12 || input.password.length > 128) fault(400);
        const activationHash = await hashAccessValue(input.code);
        await reserve(activationHash, 'activation');
        claimId = crypto.randomUUID();
        claimed = await rpc('claim_temporary_access', { activation_hash: activationHash, claim_id: claimId }, null, true);
        if (!claimed?.id || !uuid.test(claimed.id) || claimed.login_email !== 'temp-' + claimed.id + '@acompana.invalid') fault(403);
        const target = claimed.user_id ?? claimed.id;
        let current;
        try { current = await call('/auth/v1/admin/users/' + target, undefined, null, true); }
        catch (error) { if (error.status !== 404) throw error; }
        let account;
        if (current) {
          if (current.email !== claimed.login_email || current.app_metadata?.family_temporary !== true) fault(403);
          account = await call('/auth/v1/admin/users/' + target, { password: input.password }, null, true, 'PUT');
        } else {
          if (claimed.user_id) fault(403);
          account = await call('/auth/v1/admin/users', {
            id: claimed.id, email: claimed.login_email, password: input.password, email_confirm: true,
            app_metadata: { family_temporary: true, temporary_access_id: claimed.id }
          }, null, true);
        }
        if (account?.id !== target) fault(503);
        await rpc('complete_temporary_access', { access: claimed.id, claim_id: claimId, user_id: target }, null, true);
        const completed = claimed;
        claimed = undefined;
        // Un JWT anterior a una recuperación no debe volver a servir al reactivar.
        const wait = Math.min(1100, Math.max(0, Date.parse(completed.not_before ?? '') - Date.now()));
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        return reply(200, { login: 'temp-' + completed.id });
      }
      const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (!bearer) fault(401);
      const actor = await call('/auth/v1/user', undefined, bearer);
      if (!actor?.id || actor.app_metadata?.family_temporary) fault(403);
      if (!uuid.test(input.family ?? '')) fault(400);
      await reserve(actor.id + ':' + input.family, 'admin');
      if (action === 'issue' || action === 'reset') {
        const code = crypto.randomUUID() + '-' + crypto.randomUUID();
        const activation_hash = await hashAccessValue(code);
        let id;
        if (action === 'issue') {
          if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) fault(400);
          id = await rpc('issue_temporary_access', { family: input.family, display_name: input.name.trim(),
            access_expires_at: input.expiresAt, activation_hash }, bearer);
        } else {
          if (!uuid.test(input.access ?? '') || !Number.isSafeInteger(input.revision)) fault(400);
          await rpc('reset_temporary_access', { family: input.family, access: input.access,
            expected_revision: input.revision, activation_hash }, bearer);
          id = input.access;
        }
        return reply(200, { id, code, login: 'temp-' + id });
      }
      if (!['renew', 'revoke'].includes(action) || !uuid.test(input.access ?? '') || !Number.isSafeInteger(input.revision)) fault(400);
      await rpc(action === 'renew' ? 'renew_temporary_access' : 'revoke_temporary_access', {
        family: input.family, access: input.access, expected_revision: input.revision,
        ...(action === 'renew' && { access_expires_at: input.expiresAt })
      }, bearer);
      return reply(200, { ok: true });
    } catch (error) {
      if (claimed?.id && claimId) {
        // Nunca conceder acceso si Auth o el enlace de membresía quedaron incompletos.
        await rpc('abandon_temporary_access_claim', { access: claimed.id, claim_id: claimId }, null, true).catch(() => {});
      }
      const status = [400, 401, 403, 404, 409, 413, 429].includes(error.status) ? error.status : 503;
      return reply(status, { error: status === 429 ? 'Demasiadas solicitudes. Espera antes de volver a intentar.'
        : status === 409 ? 'El acceso cambió. Actualiza el panel.' : 'No se pudo completar la solicitud.' });
    }
  };
}
