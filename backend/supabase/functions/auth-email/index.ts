import { createEmailHook } from '../../../email-hook.mjs';

Deno.serve(createEmailHook({
  supabaseUrl:Deno.env.get('SUPABASE_URL'),
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  hookSecret:Deno.env.get('AUTH_EMAIL_HOOK_SECRET'),
  brevoApiKey:Deno.env.get('BREVO_API_KEY'),
  senderEmail:Deno.env.get('AUTH_EMAIL_SENDER'),
  senderName:'Acompaña',
  redirectUrl:Deno.env.get('ACOMPANA_ALLOWED_ORIGIN')+'/'
}));
