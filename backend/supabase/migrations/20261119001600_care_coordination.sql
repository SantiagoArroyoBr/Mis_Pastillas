begin;

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  patient_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text not null default '' check (char_length(details)<=2000),
  due_on date,
  assignee_id uuid references auth.users(id),
  completed_at timestamptz,
  revision integer not null default 1 check (revision>0),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (family_id,patient_id) references public.patients(family_id,id)
);
create table public.care_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  patient_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (family_id,patient_id) references public.patients(family_id,id)
);
create index care_tasks_family_due on public.care_tasks(family_id,due_on,id);
create index care_notes_family_time on public.care_notes(family_id,created_at,id);
alter table public.care_tasks enable row level security;
alter table public.care_notes enable row level security;
revoke all on public.care_tasks,public.care_notes from public,anon,authenticated;
grant select on public.care_tasks,public.care_notes to authenticated;
create policy care_task_read on public.care_tasks for select to authenticated
  using(acompana_private.family_role(family_id) is not null);
create policy care_note_read on public.care_notes for select to authenticated
  using(acompana_private.family_role(family_id) is not null);

create table acompana_private.care_requests (
  actor_id uuid not null references auth.users(id),
  operation text not null check(operation in ('task','note')),
  request_id uuid not null,
  payload jsonb not null,
  result_id uuid not null,
  primary key(actor_id,operation,request_id)
);
revoke all on acompana_private.care_requests from public,anon,authenticated;
alter table acompana_private.care_requests enable row level security;

create function acompana_private.require_care_patient(family uuid,patient uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if patient is null then return; end if;
  perform 1 from public.patients p where p.family_id=family and p.id=patient and p.archived_at is null for share;
  if not found then raise exception using errcode='PT422',message='active patient required'; end if;
end $$;
revoke execute on function acompana_private.require_care_patient(uuid,uuid) from public,anon,authenticated;

create function public.create_care_task(family uuid,request_id uuid,patient uuid,task_title text,task_details text,day date,assignee uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.care_requests; result uuid;
  desired jsonb:=jsonb_build_object('family',family,'patient',patient,'title',btrim(task_title),'details',coalesce(task_details,''),'day',day,'assignee',assignee);
begin
  perform acompana_private.require_member(family);
  if request_id is null then raise exception using errcode='PT422',message='request required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':task:'||request_id::text,0));
  select * into saved from acompana_private.care_requests r where r.actor_id=auth.uid() and r.operation='task' and r.request_id=create_care_task.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  perform acompana_private.require_care_patient(family,patient);
  if assignee is not null then
    perform 1 from public.family_members m where m.family_id=family and m.user_id=assignee and m.revoked_at is null
      and (not exists(select 1 from public.temporary_accesses t where t.user_id=assignee)
        or exists(select 1 from public.temporary_accesses t where t.user_id=assignee and t.family_id=family
          and t.state='active' and t.revoked_at is null and t.expires_at>now())) for share;
    if not found then raise exception using errcode='PT422',message='active assignee required'; end if;
  end if;
  insert into public.care_tasks(family_id,patient_id,title,details,due_on,assignee_id,actor_id)
    values(family,patient,btrim(task_title),coalesce(task_details,''),day,assignee,auth.uid()) returning id into result;
  insert into acompana_private.care_requests values(auth.uid(),'task',request_id,desired,result);
  return result;
end $$;

create function public.add_care_note(family uuid,request_id uuid,patient uuid,note_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.care_requests; result uuid;
  desired jsonb:=jsonb_build_object('family',family,'patient',patient,'body',btrim(note_body));
begin
  perform acompana_private.require_member(family);
  if request_id is null or patient is null then raise exception using errcode='PT422',message='request and patient required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':note:'||request_id::text,0));
  select * into saved from acompana_private.care_requests r where r.actor_id=auth.uid() and r.operation='note' and r.request_id=add_care_note.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  perform acompana_private.require_care_patient(family,patient);
  insert into public.care_notes(family_id,patient_id,body,actor_id)
    values(family,patient,btrim(note_body),auth.uid()) returning id into result;
  insert into acompana_private.care_requests values(auth.uid(),'note',request_id,desired,result);
  return result;
end $$;

create function public.set_care_task_completed(family uuid,task uuid,expected_revision integer,completed boolean) returns integer
language plpgsql security definer set search_path='' as $$
declare saved public.care_tasks;
begin
  perform acompana_private.require_member(family);
  select * into saved from public.care_tasks t where t.family_id=family and t.id=task for update;
  if not found then raise exception using errcode='PT422',message='task unavailable'; end if;
  if expected_revision is distinct from saved.revision then raise exception using errcode='PT409',message='task changed'; end if;
  if completed is null then raise exception using errcode='PT422',message='completion required'; end if;
  perform acompana_private.require_care_patient(family,saved.patient_id);
  if (saved.completed_at is not null)=completed then return saved.revision; end if;
  update public.care_tasks t set completed_at=case when completed then now() else null end,revision=t.revision+1 where t.id=task;
  return saved.revision+1;
end $$;
revoke execute on function public.create_care_task(uuid,uuid,uuid,text,text,date,uuid),public.add_care_note(uuid,uuid,uuid,text),public.set_care_task_completed(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.create_care_task(uuid,uuid,uuid,text,text,date,uuid),public.add_care_note(uuid,uuid,uuid,text),public.set_care_task_completed(uuid,uuid,integer,boolean) to authenticated;

create function public.list_care_members(family uuid) returns table(user_id uuid,label text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform acompana_private.require_member(family);
  return query select m.user_id,coalesce(t.display_name,case m.role when 'owner' then 'Administración' else 'Cuenta cuidadora' end)
    from public.family_members m left join public.temporary_accesses t on t.user_id=m.user_id and t.family_id=m.family_id
    where m.family_id=family and m.revoked_at is null
      and (not exists(select 1 from public.temporary_accesses a where a.user_id=m.user_id)
        or (t.state='active' and t.revoked_at is null and t.expires_at>now()))
    order by m.role,m.user_id;
end $$;
revoke execute on function public.list_care_members(uuid) from public,anon,authenticated;
grant execute on function public.list_care_members(uuid) to authenticated;

-- Formato2: conserva datos operativos y elimina asignaciones a cuentas del origen.
-- Las funciones v1 se conservan en esquema privado, con los mismos nombres para
-- mantener las referencias de parámetros calificadas de sus cuerpos originales.
create or replace function acompana_private.family_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'patients','nurses','shifts','receipts','receipt_cancellations','individual_payments',
  'individual_allocations','appointments','appointment_edits','inventory_items',
  'inventory_profiles','inventory_purchases','inventory_quotes','care_tasks','care_notes']::text[] $$;

alter function public.export_family_backup(uuid) set schema acompana_private;
alter function public.restore_family_backup(jsonb,text,uuid) set schema acompana_private;
revoke execute on function acompana_private.export_family_backup(uuid),acompana_private.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;

create function public.export_family_backup(family uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare archive jsonb; tasks jsonb;
begin
  archive:=acompana_private.export_family_backup(family);
  select coalesce(jsonb_agg(t.value||jsonb_build_object('assignee_id',null)),'[]'::jsonb) into tasks
    from jsonb_array_elements(archive->'tables'->'care_tasks') t;
  return jsonb_set(jsonb_set(archive,'{version}','2'::jsonb),'{tables,care_tasks}',tasks);
end $$;

create function public.restore_family_backup(archive jsonb,family_name text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare canonical jsonb; prior jsonb; saved acompana_private.family_restore_requests;
begin
  if auth.uid() is null or request_id is null or exists(select 1 from public.temporary_accesses t where t.user_id=auth.uid()) then
    raise exception using errcode='42501',message='personal account required'; end if;
  if archive->'version' not in ('1'::jsonb,'2'::jsonb) or archive->'version' is null then
    raise exception using errcode='22023',message='unsupported backup version'; end if;
  if archive->'version'='2'::jsonb and (not(archive->'tables' ? 'care_tasks') or not(archive->'tables' ? 'care_notes')) then
    raise exception using errcode='22023',message='missing care tables'; end if;
  canonical:=jsonb_set(archive,'{version}','1'::jsonb);
  if not(canonical->'tables' ? 'care_tasks') then canonical:=jsonb_set(canonical,'{tables,care_tasks}','[]'::jsonb); end if;
  if not(canonical->'tables' ? 'care_notes') then canonical:=jsonb_set(canonical,'{tables,care_notes}','[]'::jsonb); end if;
  if exists(select 1 from jsonb_array_elements(canonical->'tables'->'care_tasks') t where t->'assignee_id' is distinct from 'null'::jsonb) then
    raise exception using errcode='22023',message='backup cannot assign accounts'; end if;
  -- Compatibilidad con reintentos de restauraciones confirmadas antes de esta migración.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':restore:'||request_id::text,0));
  select * into saved from acompana_private.family_restore_requests r where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id;
  if found then
    prior:=jsonb_set(saved.archive,'{version}','1'::jsonb);
    if not(prior->'tables' ? 'care_tasks') then prior:=jsonb_set(prior,'{tables,care_tasks}','[]'::jsonb); end if;
    if not(prior->'tables' ? 'care_notes') then prior:=jsonb_set(prior,'{tables,care_notes}','[]'::jsonb); end if;
    if prior is distinct from canonical or saved.restored_name is distinct from btrim(family_name) then
      raise exception using errcode='PT409',message='restore request changed'; end if;
    if saved.restored_family is not null then return saved.restored_family; end if;
  end if;
  return acompana_private.restore_family_backup(canonical,family_name,request_id);
end $$;
revoke execute on function public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) to authenticated;

commit;
