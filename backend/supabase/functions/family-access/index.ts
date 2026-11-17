import { createAccessHandler } from '../../../access-service.mjs';

Deno.serve(createAccessHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigin: Deno.env.get('ACOMPANA_ALLOWED_ORIGIN')
}));
