const API = 'http://127.0.0.1:54321';

export function createClient(key) {
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Usa la clave publicable del Supabase local.');
  }
  let token;

  async function request(path, body) {
    let response;
    try {
      response = await fetch(API + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: key,
          ...(token && { Authorization: 'Bearer ' + token }),
          ...(body !== undefined && { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw new Error('No se pudo conectar con Supabase local. Revisa que esté iniciado.');
    }
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    if (!response.ok) {
      const error = new Error('La operación fue rechazada.');
      error.status = response.status;
      error.code = result?.code;
      throw error;
    }
    return result;
  }

  return {
    signUp: (email, password) => request('/auth/v1/signup', { email, password }),
    async signIn(email, password) {
      const session = await request('/auth/v1/token?grant_type=password', { email, password });
      if (!session?.access_token || !session?.user?.id) throw new Error('La sesión recibida no es válida.');
      token = session.access_token;
      return session.user.id;
    },
    async signOut() {
      try {
        if (token) await request('/auth/v1/logout?scope=local', {});
      } finally {
        token = undefined;
      }
    },
    select: (table, params = {}) => request('/rest/v1/' + table + '?' + new URLSearchParams(params)),
    rpc: (name, args) => request('/rest/v1/rpc/' + name, args)
  };
}
