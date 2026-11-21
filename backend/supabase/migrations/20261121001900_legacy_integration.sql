begin;

-- Un nombre antiguo no aporta por sí solo una tarifa. Se conserva su identidad
-- por archivo e índices; dos nombres iguales nunca se fusionan automáticamente.
alter table public.nurses add column revision integer not null default 1 check(revision>0);
alter table public.nurses add column rates_valid_from date;
alter table public.nurses add column patient_id uuid;
alter table public.nurses add column legacy_source_sha text;
alter table public.nurses add column legacy_patient_index integer;
alter table public.nurses add column legacy_staff_index integer;
alter table public.nurses add column legacy_patient_name text;
alter table public.nurses add foreign key(family_id,patient_id) references public.patients(family_id,id);
alter table public.nurses drop constraint nurses_check;
alter table public.nurses add constraint nurse_legacy_source_valid check(
  (legacy_source_sha is null and legacy_patient_index is null and legacy_staff_index is null and legacy_patient_name is null)
  or (legacy_source_sha is not null and legacy_source_sha ~ '^[0-9a-f]{64}$'
    and legacy_patient_index is not null and legacy_patient_index>=0 and legacy_staff_index is not null and legacy_staff_index>=0
    and legacy_patient_name is not null and char_length(legacy_patient_name) between 1 and 80));
alter table public.nurses add constraint nurse_rates_or_legacy check(
  full_cents is not null or half_cents is not null or legacy_source_sha is not null);
create unique index nurse_legacy_identity on public.nurses(family_id,legacy_source_sha,legacy_patient_index,legacy_staff_index)
  where legacy_source_sha is not null;

create function public.integrate_legacy_nurse(family uuid,snapshot uuid,patient_index integer,staff_index integer,patient uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare source public.legacy_snapshots; raw jsonb; person jsonb; result uuid; prior public.nurses;
begin
  perform acompana_private.require_member(family,true);
  select * into source from public.legacy_snapshots s where s.id=snapshot and s.family_id=family;
  if not found or patient_index is null or staff_index is null or patient_index<0 or staff_index<0 or patient is null then
    raise exception using errcode='PT422',message='legacy source and destination required'; end if;
  raw:=source.original_json::jsonb;
  person:=raw->'pay'->'nurses'->patient_index->staff_index;
  if jsonb_typeof(person) is distinct from 'object' or jsonb_typeof(person->'n') is distinct from 'string'
    or char_length(btrim(person->>'n')) not between 1 and 80
    or jsonb_typeof(raw->'p'->patient_index->'name') is distinct from 'string' then
    raise exception using errcode='PT422',message='legacy person unavailable'; end if;
  perform 1 from public.patients p where p.family_id=family and p.id=patient for share;
  if not found then raise exception using errcode='PT422',message='destination patient unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(family::text||':'||source.source_sha||':'||patient_index||':'||staff_index,0));
  select * into prior from public.nurses n where n.family_id=family and n.legacy_source_sha=source.source_sha
    and n.legacy_patient_index=patient_index and n.legacy_staff_index=staff_index;
  if found then
    if prior.patient_id is distinct from patient then raise exception using errcode='PT409',message='legacy destination already confirmed'; end if;
    return prior.id;
  end if;
  insert into public.nurses(family_id,name,full_cents,half_cents,patient_id,legacy_source_sha,legacy_patient_index,legacy_staff_index,legacy_patient_name)
    values(family,btrim(person->>'n'),null,null,patient,source.source_sha,patient_index,staff_index,raw->'p'->patient_index->>'name') returning id into result;
  return result;
end $$;

create function public.configure_nurse_rates(family uuid,nurse uuid,expected_revision integer,full_rate bigint,half_rate bigint,valid_from date) returns integer
language plpgsql security definer set search_path='' as $$
declare prior public.nurses;
begin
  perform acompana_private.require_member(family,true);
  if valid_from is null or (full_rate is null and half_rate is null)
    or full_rate<0 or half_rate<0 or full_rate>9007199254740991 or half_rate>9007199254740991 then
    raise exception using errcode='PT422',message='verified rates and effective date required'; end if;
  select * into prior from public.nurses n where n.family_id=family and n.id=nurse for update;
  if not found then raise exception using errcode='PT422',message='nurse unavailable'; end if;
  if prior.revision is distinct from expected_revision then raise exception using errcode='PT409',message='nurse changed'; end if;
  update public.nurses n set full_cents=full_rate,half_cents=half_rate,rates_valid_from=valid_from,revision=n.revision+1
    where n.family_id=family and n.id=nurse returning n.revision into expected_revision;
  return expected_revision;
end $$;

create schema acompana_legacy_v3;
revoke all on schema acompana_legacy_v3 from public,anon,authenticated;
alter function public.record_shift(uuid,uuid,uuid,uuid,date,text) set schema acompana_legacy_v3;
revoke execute on function acompana_legacy_v3.record_shift(uuid,uuid,uuid,uuid,date,text) from public,anon,authenticated;
create function public.record_shift(family uuid,request_id uuid,patient uuid,nurse uuid,day date,shift_type text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rate public.nurses;
begin
  perform acompana_private.require_member(family,true);
  if not exists(select 1 from public.shifts s where s.family_id=family and s.id=request_id) then
    select * into rate from public.nurses n where n.family_id=family and n.id=nurse for share;
    if not found or (rate.rates_valid_from is not null and day<rate.rates_valid_from)
      or (case shift_type when 'full' then rate.full_cents when 'half' then rate.half_cents end) is null then
      raise exception using errcode='PT422',message='verified rate unavailable for this day'; end if;
  end if;
  return acompana_legacy_v3.record_shift(family,request_id,patient,nurse,day,shift_type);
end $$;

-- Formato4 añade procedencia/tarifas a nurses. Los formatos previos se completan
-- sólo con valores explícitamente neutros y conservan sus tickets ya confirmados.
create function acompana_private.with_legacy_nurse_fields(archive jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_set(archive,'{tables,nurses}',coalesce((select jsonb_agg(
    jsonb_build_object('revision',1,'rates_valid_from',null,'patient_id',null,'legacy_source_sha',null,
      'legacy_patient_index',null,'legacy_staff_index',null,'legacy_patient_name',null)||row.value)
    from jsonb_array_elements(archive->'tables'->'nurses') row),'[]'::jsonb))
$$;
revoke execute on function acompana_private.with_legacy_nurse_fields(jsonb) from public,anon,authenticated;
alter function public.export_family_backup(uuid) set schema acompana_legacy_v3;
alter function public.restore_family_backup(jsonb,text,uuid) set schema acompana_legacy_v3;
revoke execute on function acompana_legacy_v3.export_family_backup(uuid),acompana_legacy_v3.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;
create function public.export_family_backup(family uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin return jsonb_set(acompana_legacy_v3.export_family_backup(family),'{version}','4'::jsonb); end $$;
create function public.restore_family_backup(archive jsonb,family_name text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare converted jsonb; prior jsonb; canonical jsonb; saved acompana_private.family_restore_requests; name text;
begin
  if auth.uid() is null or request_id is null or exists(select 1 from public.temporary_accesses t where t.user_id=auth.uid()) then
    raise exception using errcode='42501',message='personal account required'; end if;
  if jsonb_typeof(archive) is distinct from 'object' or archive->'version' is null
    or archive->'version' not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb)
    or jsonb_typeof(archive->'tables'->'nurses') is distinct from 'array' then
    raise exception using errcode='22023',message='unsupported backup version'; end if;
  converted:=case when archive->'version'='4'::jsonb then jsonb_set(archive,'{version}','3'::jsonb)
    else acompana_private.with_legacy_nurse_fields(archive) end;
  canonical:=jsonb_set(converted,'{version}','1'::jsonb);
  foreach name in array array['care_tasks','care_notes','legacy_snapshots'] loop
    if not(canonical->'tables' ? name) then canonical:=jsonb_set(canonical,array['tables',name],'[]'::jsonb); end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':restore:'||request_id::text,0));
  select * into saved from acompana_private.family_restore_requests r where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id;
  if found then
    prior:=jsonb_set(acompana_private.with_legacy_nurse_fields(saved.archive),'{version}','1'::jsonb);
    foreach name in array array['care_tasks','care_notes','legacy_snapshots'] loop
      if not(prior->'tables' ? name) then prior:=jsonb_set(prior,array['tables',name],'[]'::jsonb); end if;
    end loop;
    if prior is distinct from canonical or saved.restored_name is distinct from btrim(family_name) then
      raise exception using errcode='PT409',message='restore request changed'; end if;
    if saved.restored_family is not null then return saved.restored_family; end if;
  end if;
  return acompana_legacy_v3.restore_family_backup(converted,family_name,request_id);
end $$;
revoke execute on function public.integrate_legacy_nurse(uuid,uuid,integer,integer,uuid),public.configure_nurse_rates(uuid,uuid,integer,bigint,bigint,date),
  public.record_shift(uuid,uuid,uuid,uuid,date,text),public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.integrate_legacy_nurse(uuid,uuid,integer,integer,uuid),public.configure_nurse_rates(uuid,uuid,integer,bigint,bigint,date),
  public.record_shift(uuid,uuid,uuid,uuid,date,text),public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) to authenticated;

commit;
