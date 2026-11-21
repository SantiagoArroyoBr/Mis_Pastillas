begin;

-- Copia literal del origen local: no convierte cobertura ni turnos ambiguos en dinero.
create function acompana_private.valid_legacy_snapshot(raw text, source_hash text, source_commit text, report jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare value jsonb;
begin
  if raw is null or octet_length(raw)>10485760 or source_hash is null
    or source_hash !~ '^[0-9a-f]{64}$'
    or source_hash<>encode(sha256(convert_to(raw,'UTF8')),'hex')
    or (source_commit is not null and source_commit !~ '^[0-9a-f]{40}$')
    or jsonb_typeof(report) is distinct from 'object' or octet_length(report::text)>100000 then return false; end if;
  begin value:=raw::jsonb; exception when others then return false; end;
  if jsonb_typeof(value) is distinct from 'object'
    or jsonb_typeof(value->'p') is distinct from 'array'
    or jsonb_array_length(value->'p') not between 1 and 2000
    or (value ? 'pay' and jsonb_typeof(value->'pay') is distinct from 'object')
    or (value ? 'appts' and jsonb_typeof(value->'appts') is distinct from 'array')
    or exists(select 1 from jsonb_object_keys(value) k where k not in ('sel','last','p','mode','appts','pay','exportedAt')) then return false; end if;
  -- Los backups locales no tienen capacidades Auth. Rechazarlas también anidadas.
  if (value::text||report::text) ~* '"(access_token|refresh_token|password|service_role|service_role_key|apikey|activation_hash|activation_code|token_valid_after)"[[:space:]]*:' then return false; end if;
  return true;
end $$;
revoke execute on function acompana_private.valid_legacy_snapshot(text,text,text,jsonb) from public,anon,authenticated;

create table public.legacy_snapshots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  source_sha text not null,
  source_commit text,
  original_json text not null,
  report jsonb not null,
  imported_at timestamptz not null default now(),
  actor_id uuid not null references auth.users(id),
  check(acompana_private.valid_legacy_snapshot(original_json,source_sha,source_commit,report))
);
create index legacy_snapshots_family on public.legacy_snapshots(family_id,imported_at,id);
alter table public.legacy_snapshots enable row level security;
revoke all on public.legacy_snapshots from public,anon,authenticated;
grant select on public.legacy_snapshots to authenticated;
create policy legacy_snapshot_owner_read on public.legacy_snapshots for select to authenticated
  using(acompana_private.family_role(family_id)='owner');

-- Restauración genérica existente remapea id/familia/autor; original_json queda literal.
create or replace function acompana_private.family_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'patients','nurses','shifts','receipts','receipt_cancellations','individual_payments',
  'individual_allocations','appointments','appointment_edits','inventory_items',
  'inventory_profiles','inventory_purchases','inventory_quotes','care_tasks','care_notes','legacy_snapshots']::text[] $$;

-- Se mantienen nombres de función: sus cuerpos usan parámetros calificados por nombre.
create schema acompana_backup_v2;
revoke all on schema acompana_backup_v2 from public,anon,authenticated;
alter function public.export_family_backup(uuid) set schema acompana_backup_v2;
alter function public.restore_family_backup(jsonb,text,uuid) set schema acompana_backup_v2;
revoke execute on function acompana_backup_v2.export_family_backup(uuid),acompana_backup_v2.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;

-- Una copia convertida puede no tener recovery_history. JSON null no es SQL NULL:
-- el agregado previo añadía un elemento null y la siguiente restauración fallaba.
create or replace function acompana_private.export_family_backup(family uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare tables jsonb:='{}'; table_name text; info jsonb; administration jsonb;
begin
  perform acompana_private.require_member(family,true);
  select jsonb_build_object('id',f.id,'name',f.name,'created_at',f.created_at) into strict info
    from public.families f where f.id=family;
  foreach table_name in array acompana_private.family_backup_tables() loop
    tables:=tables||jsonb_build_object(table_name,acompana_private.family_backup_rows(table_name,family));
  end loop;
  select jsonb_build_object(
    'accesses',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'display_name',t.display_name,
      'expires_at',t.expires_at,'revoked_at',t.revoked_at,'revision',t.revision,'state',t.state,'created_at',t.created_at) order by t.id)
      from public.temporary_accesses t where t.family_id=family),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('access_id',e.access_id,'action',e.action,'happened_at',e.happened_at) order by e.id)
      from public.temporary_access_events e where e.family_id=family),'[]'::jsonb),
    'membership_states',coalesce((select jsonb_agg(jsonb_build_object('role',m.role,'revoked_at',m.revoked_at) order by m.role,m.revoked_at)
      from public.family_members m where m.family_id=family),'[]'::jsonb),
    'recovery_history',coalesce((select jsonb_agg(jsonb_build_object('source_family',r.archive->'family',
       'restored_at',r.restored_at,'administration',(r.archive->'administration')-'recovery_history'))
       ||coalesce(nullif(jsonb_agg(r.archive->'administration'->'recovery_history')->0,'null'::jsonb),'[]'::jsonb)
       from acompana_private.family_restore_requests r where r.restored_family=family),'[]'::jsonb)) into administration;
  return jsonb_build_object('format','acompana-family','version',1,'exported_at',now(),
    'family',info,'tables',tables,'administration',administration);
end $$;
revoke execute on function acompana_private.export_family_backup(uuid) from public,anon,authenticated;

create function public.export_family_backup(family uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare archive jsonb;
begin
  archive:=acompana_backup_v2.export_family_backup(family);
  return jsonb_set(archive,'{version}','3'::jsonb);
end $$;

create function public.restore_family_backup(archive jsonb,family_name text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare canonical jsonb; prior jsonb; saved acompana_private.family_restore_requests;
begin
  if auth.uid() is null or request_id is null or exists(select 1 from public.temporary_accesses t where t.user_id=auth.uid()) then
    raise exception using errcode='42501',message='personal account required'; end if;
  if jsonb_typeof(archive) is distinct from 'object' or archive->'version' is null
    or archive->'version' not in ('1'::jsonb,'2'::jsonb,'3'::jsonb)
    or jsonb_typeof(archive->'tables') is distinct from 'object' then
    raise exception using errcode='22023',message='unsupported backup version'; end if;
  if archive->'version'='3'::jsonb and jsonb_typeof(archive->'tables'->'legacy_snapshots') is distinct from 'array' then
    raise exception using errcode='22023',message='missing legacy table'; end if;
  if archive->'version' in ('1'::jsonb,'2'::jsonb) and archive->'tables' ? 'legacy_snapshots' then
    raise exception using errcode='22023',message='legacy rows require format3'; end if;
  if archive->'version' in ('2'::jsonb,'3'::jsonb)
    and (not(archive->'tables' ? 'care_tasks') or not(archive->'tables' ? 'care_notes')) then
    raise exception using errcode='22023',message='missing care tables'; end if;
  canonical:=jsonb_set(archive,'{version}','1'::jsonb);
  if not(canonical->'tables' ? 'care_tasks') then canonical:=jsonb_set(canonical,'{tables,care_tasks}','[]'::jsonb); end if;
  if not(canonical->'tables' ? 'care_notes') then canonical:=jsonb_set(canonical,'{tables,care_notes}','[]'::jsonb); end if;
  if not(canonical->'tables' ? 'legacy_snapshots') then canonical:=jsonb_set(canonical,'{tables,legacy_snapshots}','[]'::jsonb); end if;
  -- Conservar reintentos de restauraciones confirmadas antes de los formatos2/3.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':restore:'||request_id::text,0));
  select * into saved from acompana_private.family_restore_requests r where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id;
  if found then
    prior:=jsonb_set(saved.archive,'{version}','1'::jsonb);
    if not(prior->'tables' ? 'care_tasks') then prior:=jsonb_set(prior,'{tables,care_tasks}','[]'::jsonb); end if;
    if not(prior->'tables' ? 'care_notes') then prior:=jsonb_set(prior,'{tables,care_notes}','[]'::jsonb); end if;
    if not(prior->'tables' ? 'legacy_snapshots') then prior:=jsonb_set(prior,'{tables,legacy_snapshots}','[]'::jsonb); end if;
    if prior is distinct from canonical or saved.restored_name is distinct from btrim(family_name) then
      raise exception using errcode='PT409',message='restore request changed'; end if;
    if saved.restored_family is not null then return saved.restored_family; end if;
  end if;
  return acompana_backup_v2.restore_family_backup(jsonb_set(canonical,'{version}','2'::jsonb),family_name,request_id);
end $$;
revoke execute on function public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) to authenticated;

commit;
