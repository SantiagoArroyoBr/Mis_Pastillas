begin;

-- PostgREST ejecuta RPC STABLE en transacciones de sólo lectura, incluso vía POST.
-- Estos RPC consultan datos pero require_member usa FOR SHARE para comprobar
-- permisos frente a una revocación concurrente. Requieren transacción read-write.
-- No cambian cuerpos, permisos, políticas, datos ni reglas de negocio.
alter function public.list_care_members(uuid) volatile;
alter function public.export_family_backup(uuid) volatile;

commit;
