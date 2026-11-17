import { connections } from './connection-config.mjs';

export async function loadAppointments(client, family, today, patient = '') {
  const fields = {
    family_id: 'eq.' + family,
    ...(patient && { patient_id: 'eq.' + patient }),
    select: 'id,patient_id,patient_name,revision,appointment_day,legacy_day,appointment_time,location,notes,doctor',
    limit: 20
  };
  const [upcoming, past, legacy] = await Promise.all([
    client.select('appointment_details', { ...fields, appointment_day: 'gte.' + today,
      order: 'appointment_day.asc,appointment_time.asc.nullslast,id.asc' }),
    client.select('appointment_details', { ...fields, appointment_day: 'lt.' + today,
      order: 'appointment_day.desc,appointment_time.desc.nullslast,id.desc' }),
    client.select('appointment_details', { ...fields, appointment_day: 'is.null',
      order: 'legacy_day.desc,id.desc' })
  ]);
  return { upcoming, past, legacy };
}

export function createClient(key, api = (connections.local ?? connections.cloud).url) {
  if (!Object.values(connections).some(connection => connection.url === api)) {
    throw new Error('El destino de Supabase no está configurado.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Usa la clave publicable del proyecto seleccionado.');
  }
  let token;

  async function request(path, body) {
    let response;
    try {
      response = await fetch(api + path, {
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
      throw new Error(api === connections.local?.url
        ? 'No se pudo conectar con Supabase local. Revisa que esté iniciado.'
        : 'No se pudo conectar con Supabase. Revisa tu conexión.');
    }
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    if (!response.ok) {
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
