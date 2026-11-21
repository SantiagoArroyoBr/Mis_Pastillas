begin;

-- Se conserva la zona elegida, también al restaurar. La ida/vuelta rechaza las
-- horas civiles que no existieron por un adelanto del reloj (DST).
create function acompana_private.valid_care_clock(start_local timestamp,end_local timestamp,actual_end_local timestamp,care_zone text) returns boolean
language plpgsql stable set search_path='' as $$
begin
  if care_zone is null or char_length(care_zone)>80
    or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=care_zone)
    or start_local is null or end_local is null or not isfinite(start_local) or not isfinite(end_local)
    or end_local<=start_local then return false; end if;
  return ((start_local at time zone care_zone) at time zone care_zone)=start_local
    and ((end_local at time zone care_zone) at time zone care_zone)=end_local
    and (end_local at time zone care_zone)>(start_local at time zone care_zone)
    and (actual_end_local is null or (isfinite(actual_end_local)
      and ((actual_end_local at time zone care_zone) at time zone care_zone)=actual_end_local
      and (actual_end_local at time zone care_zone)>=(start_local at time zone care_zone)));
exception when others then return false;
end $$;
revoke execute on function acompana_private.valid_care_clock(timestamp,timestamp,timestamp,text) from public,anon,authenticated;

-- Horarios civiles elegidos por la familia. No se convierten en cargos financieros.
create table public.care_shifts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  patient_id uuid not null,
  nurse_id uuid not null,
  start_local timestamp without time zone not null,
  end_local timestamp without time zone not null,
  care_zone text not null default 'America/Mexico_City',
  actual_end_local timestamp without time zone,
  closed_at timestamptz,
  revision integer not null default 1 check(revision>0),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(family_id,id),
  unique(family_id,id,patient_id),
  foreign key(family_id,patient_id) references public.patients(family_id,id),
  foreign key(family_id,nurse_id) references public.nurses(family_id,id),
  check(isfinite(start_local) and isfinite(end_local) and end_local>start_local),
  check(acompana_private.valid_care_clock(start_local,end_local,actual_end_local,care_zone)),
  check(actual_end_local is null or (isfinite(actual_end_local) and actual_end_local>=start_local)),
  check(closed_at is not null or actual_end_local is null)
);
create table public.paper_care_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  patient_id uuid not null,
  nurse_id uuid,
  care_shift_id uuid,
  log_day date not null check(isfinite(log_day)),
  completed boolean not null,
  location text not null default '' check(char_length(location)<=200),
  note text not null default '' check(char_length(note)<=2000),
  revision integer not null default 1 check(revision>0),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(family_id,id),
  unique(family_id,care_shift_id),
  foreign key(family_id,patient_id) references public.patients(family_id,id),
  foreign key(family_id,nurse_id) references public.nurses(family_id,id),
  foreign key(family_id,care_shift_id,patient_id) references public.care_shifts(family_id,id,patient_id),
  check(not completed or nurse_id is not null)
);
create table public.paper_care_log_edits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  paper_log_id uuid not null,
  nurse_id uuid,
  previous_revision integer not null check(previous_revision>0),
  completed boolean not null,
  location text not null check(char_length(location)<=200),
  note text not null check(char_length(note)<=2000),
  actor_id uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  unique(family_id,paper_log_id,previous_revision),
  foreign key(family_id,paper_log_id) references public.paper_care_logs(family_id,id),
  foreign key(family_id,nurse_id) references public.nurses(family_id,id)
);
create index care_shifts_family_end on public.care_shifts(family_id,end_local,id);
create index paper_care_logs_family_day on public.paper_care_logs(family_id,log_day,id);
alter table public.care_shifts enable row level security;
alter table public.paper_care_logs enable row level security;
alter table public.paper_care_log_edits enable row level security;
revoke all on public.care_shifts,public.paper_care_logs,public.paper_care_log_edits from public,anon,authenticated;
grant select on public.care_shifts,public.paper_care_logs,public.paper_care_log_edits to authenticated;
create policy care_shifts_read on public.care_shifts for select to authenticated using(acompana_private.family_role(family_id) is not null);
create policy paper_logs_read on public.paper_care_logs for select to authenticated using(acompana_private.family_role(family_id) is not null);
create policy paper_log_edits_read on public.paper_care_log_edits for select to authenticated using(acompana_private.family_role(family_id) is not null);

create table acompana_private.shift_care_requests (
  actor_id uuid not null references auth.users(id),
  operation text not null check(operation in ('schedule','close','paper')),
  request_id uuid not null,
  payload jsonb not null,
  result_id uuid not null,
  primary key(actor_id,operation,request_id)
);
revoke all on acompana_private.shift_care_requests from public,anon,authenticated;
alter table acompana_private.shift_care_requests enable row level security;

create function acompana_private.require_shift_nurse(family uuid,nurse uuid,optional boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if nurse is null and optional then return; end if;
  perform 1 from public.nurses n where n.family_id=family and n.id=nurse for share;
  if not found then raise exception using errcode='PT422',message='family nurse required'; end if;
end $$;
revoke execute on function acompana_private.require_shift_nurse(uuid,uuid,boolean) from public,anon,authenticated;

create function public.list_shift_nurses(family uuid) returns table(id uuid,name text)
language plpgsql volatile security definer set search_path='' as $$
begin
  perform acompana_private.require_member(family);
  return query select n.id,n.name from public.nurses n where n.family_id=family order by n.name,n.id;
end $$;

create function public.schedule_care_shift(family uuid,patient uuid,nurse uuid,start_local timestamp,end_local timestamp,request_id uuid,care_zone text default 'America/Mexico_City') returns uuid
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.shift_care_requests;result uuid;
  desired jsonb:=jsonb_build_object('family',family,'patient',patient,'nurse',nurse,'start',start_local,'end',end_local)
    ||case when care_zone='America/Mexico_City' then '{}'::jsonb else jsonb_build_object('care_zone',care_zone) end;
begin
  perform acompana_private.require_member(family);
  if request_id is null then raise exception using errcode='PT422',message='request required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':schedule:'||request_id::text,0));
  select * into saved from acompana_private.shift_care_requests r where r.actor_id=auth.uid() and r.operation='schedule' and r.request_id=schedule_care_shift.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  if patient is null or not acompana_private.valid_care_clock(start_local,end_local,null,care_zone) then
    raise exception using errcode='PT422',message='explicit valid start and end required'; end if;
  perform acompana_private.require_care_patient(family,patient);
  perform acompana_private.require_shift_nurse(family,nurse);
  insert into public.care_shifts(family_id,patient_id,nurse_id,start_local,end_local,care_zone,actor_id)
    values(family,patient,nurse,start_local,end_local,care_zone,auth.uid()) returning id into result;
  insert into acompana_private.shift_care_requests values(auth.uid(),'schedule',request_id,desired,result);
  return result;
end $$;

create function public.record_paper_care_log(family uuid,patient uuid,nurse uuid,day date,completed boolean,location_text text,note text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.shift_care_requests;result uuid;
  desired jsonb:=jsonb_build_object('family',family,'patient',patient,'nurse',nurse,'day',day,'completed',completed,'location',coalesce(location_text,''),'note',coalesce(note,''));
begin
  perform acompana_private.require_member(family);
  if request_id is null then raise exception using errcode='PT422',message='request required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':paper:'||request_id::text,0));
  select * into saved from acompana_private.shift_care_requests r where r.actor_id=auth.uid() and r.operation='paper' and r.request_id=record_paper_care_log.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  if patient is null or day is null or not isfinite(day) or completed is null or (completed and nurse is null) then
    raise exception using errcode='PT422',message='valid log and filled by required'; end if;
  perform acompana_private.require_care_patient(family,patient);
  perform acompana_private.require_shift_nurse(family,nurse,true);
  insert into public.paper_care_logs(family_id,patient_id,nurse_id,log_day,completed,location,note,actor_id)
    values(family,patient,nurse,day,completed,coalesce(location_text,''),coalesce(note,''),auth.uid()) returning id into result;
  insert into acompana_private.shift_care_requests values(auth.uid(),'paper',request_id,desired,result);
  return result;
end $$;

create function public.close_care_shift(family uuid,shift uuid,expected_revision integer,actual_end_local timestamp,filled_by uuid,log_completed boolean,log_location text,note text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.shift_care_requests;current public.care_shifts;
  desired jsonb:=jsonb_build_object('family',family,'shift',shift,'revision',expected_revision,'end',actual_end_local,'filled_by',filled_by,'completed',log_completed,'location',coalesce(log_location,''),'note',coalesce(note,''));
begin
  perform acompana_private.require_member(family);
  if request_id is null then raise exception using errcode='PT422',message='request required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':close:'||request_id::text,0));
  select * into saved from acompana_private.shift_care_requests r where r.actor_id=auth.uid() and r.operation='close' and r.request_id=close_care_shift.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  select * into current from public.care_shifts s where s.family_id=family and s.id=shift for update;
  if not found then raise exception using errcode='PT422',message='shift unavailable'; end if;
  if current.revision is distinct from expected_revision or current.closed_at is not null then raise exception using errcode='PT409',message='shift changed'; end if;
  if log_completed is null or (log_completed and filled_by is null)
    or not acompana_private.valid_care_clock(current.start_local,current.end_local,actual_end_local,current.care_zone) then
    raise exception using errcode='PT422',message='valid closure and filled by required'; end if;
  perform acompana_private.require_care_patient(family,current.patient_id);
  perform acompana_private.require_shift_nurse(family,filled_by,true);
  update public.care_shifts s set actual_end_local=close_care_shift.actual_end_local,closed_at=now(),revision=s.revision+1 where s.id=shift;
  insert into public.paper_care_logs(family_id,patient_id,nurse_id,care_shift_id,log_day,completed,location,note,actor_id)
    values(family,current.patient_id,filled_by,shift,current.start_local::date,log_completed,coalesce(log_location,''),coalesce(note,''),auth.uid());
  insert into acompana_private.shift_care_requests values(auth.uid(),'close',request_id,desired,shift);
  return shift;
end $$;

create function public.update_paper_care_log(family uuid,log uuid,expected_revision integer,nurse uuid,completed boolean,location_text text,note text) returns integer
language plpgsql security definer set search_path='' as $$
declare current public.paper_care_logs;
begin
  perform acompana_private.require_member(family);
  select * into current from public.paper_care_logs l where l.family_id=family and l.id=log for update;
  if not found then raise exception using errcode='PT422',message='log unavailable'; end if;
  if current.revision is distinct from expected_revision then raise exception using errcode='PT409',message='log changed'; end if;
  if completed is null or (completed and nurse is null) then raise exception using errcode='PT422',message='filled by required'; end if;
  perform acompana_private.require_care_patient(family,current.patient_id);
  perform acompana_private.require_shift_nurse(family,nurse,true);
  insert into public.paper_care_log_edits(family_id,paper_log_id,nurse_id,previous_revision,completed,location,note,actor_id)
    values(family,log,current.nurse_id,current.revision,current.completed,current.location,current.note,auth.uid());
  update public.paper_care_logs l set nurse_id=nurse,completed=update_paper_care_log.completed,
    location=coalesce(location_text,''),note=coalesce(update_paper_care_log.note,''),revision=l.revision+1 where l.id=log;
  return current.revision+1;
end $$;
revoke execute on function public.list_shift_nurses(uuid),public.schedule_care_shift(uuid,uuid,uuid,timestamp,timestamp,uuid,text),public.close_care_shift(uuid,uuid,integer,timestamp,uuid,boolean,text,text,uuid),public.record_paper_care_log(uuid,uuid,uuid,date,boolean,text,text,uuid),public.update_paper_care_log(uuid,uuid,integer,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.list_shift_nurses(uuid),public.schedule_care_shift(uuid,uuid,uuid,timestamp,timestamp,uuid,text),public.close_care_shift(uuid,uuid,integer,timestamp,uuid,boolean,text,text,uuid),public.record_paper_care_log(uuid,uuid,uuid,date,boolean,text,text,uuid),public.update_paper_care_log(uuid,uuid,integer,uuid,boolean,text,text) to authenticated;


-- Formato4, aún no publicado antes de este lote, incluye turnos y hojas impresas.
create or replace function acompana_private.family_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'patients','nurses','shifts','receipts','receipt_cancellations','individual_payments',
  'individual_allocations','appointments','appointment_edits','inventory_items',
  'inventory_profiles','inventory_purchases','inventory_quotes','care_tasks','care_notes','legacy_snapshots',
  'care_shifts','paper_care_logs','paper_care_log_edits']::text[] $$;

-- Mismo restaurador transaccional auditado: se amplía únicamente el mapa de FK.
create or replace function acompana_private.restore_family_backup(archive jsonb, family_name text, request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.family_restore_requests; new_family uuid; table_name text;
  row_data jsonb; mapped jsonb; ids jsonb:='{}'; old_id text; new_id uuid; expected_keys text[];
  key text; relation text; fk text; total integer:=0; count_rows integer;
begin
  if auth.uid() is null or request_id is null or exists(select 1 from public.temporary_accesses t where t.user_id=auth.uid()) then
    raise exception using errcode='42501',message='personal account required'; end if;
  if archive is null or jsonb_typeof(archive)<>'object' or octet_length(archive::text)>10485760
     or archive->>'format' is distinct from 'acompana-family' or archive->'version' is distinct from '1'::jsonb
     or jsonb_typeof(archive->'tables') is distinct from 'object'
     or jsonb_typeof(archive->'family') is distinct from 'object'
     or not acompana_private.valid_backup_administration(archive->'administration') then
    raise exception using errcode='22023',message='invalid family backup'; end if;
  if exists(select 1 from jsonb_object_keys(archive) k where k not in ('format','version','exported_at','family','tables','administration'))
     or exists(select 1 from jsonb_object_keys(archive->'family') k where k not in ('id','name','created_at'))
     or exists(select 1 from jsonb_object_keys(archive->'tables') k where not(k=any(acompana_private.family_backup_tables()))) then
    raise exception using errcode='22023',message='unknown backup fields'; end if;
  if (archive->'family'->>'id')::uuid is null
    or jsonb_typeof(archive->'family'->'name') is distinct from 'string'
    or char_length(btrim(archive->'family'->>'name')) not between 1 and 80
    or (archive->'family'->>'created_at')::timestamptz is null
    or (archive->>'exported_at')::timestamptz is null then
    raise exception using errcode='22023',message='invalid backup identity'; end if;
  -- La solicitud es idempotente incluso si el cliente pierde la respuesta del commit.
  insert into acompana_private.family_restore_requests(actor_id,request_id,archive,restored_name)
    values(auth.uid(),request_id,archive,btrim(family_name)) on conflict do nothing;
  select * into strict saved from acompana_private.family_restore_requests r
    where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id for update;
  if saved.archive is distinct from archive or saved.restored_name is distinct from btrim(family_name) then
    raise exception using errcode='PT409',message='restore request changed'; end if;
  if saved.restored_family is not null then return saved.restored_family; end if;
  -- create_family conserva las reglas de cuenta personal y nombre.
  new_family:=public.create_family(family_name);
  foreach table_name in array acompana_private.family_backup_tables() loop
    if jsonb_typeof(archive->'tables'->table_name) is distinct from 'array' then
      raise exception using errcode='22023',message='missing backup table'; end if;
    count_rows:=jsonb_array_length(archive->'tables'->table_name); total:=total+count_rows;
    if count_rows>50000 or total>100000 then raise exception using errcode='22023',message='backup row limit'; end if;
    if table_name in ('individual_allocations','inventory_profiles','appointment_edits') then continue; end if;
    for row_data in select value from jsonb_array_elements(archive->'tables'->table_name) loop
      old_id:=(row_data->>'id')::uuid::text;
      if old_id is null or ids ? (table_name||':'||old_id) then
        raise exception using errcode='22023',message='duplicate or missing backup id'; end if;
      ids:=ids||jsonb_build_object(table_name||':'||old_id,gen_random_uuid());
    end loop;
  end loop;
  foreach table_name in array acompana_private.family_backup_tables() loop
    select array_agg(a.attname::text) into expected_keys from pg_catalog.pg_attribute a
      where a.attrelid=format('public.%I',table_name)::regclass and a.attnum>0 and not a.attisdropped
        and a.attname not in ('family_id','actor_id');
    for row_data in select value from jsonb_array_elements(archive->'tables'->table_name) loop
      if jsonb_typeof(row_data) is distinct from 'object'
         or exists(select 1 from jsonb_object_keys(row_data) k where not(k=any(expected_keys)))
         or exists(select 1 from unnest(expected_keys) k where not(row_data ? k)) then
        raise exception using errcode='22023',message='invalid backup row fields'; end if;
      mapped:=row_data||jsonb_build_object('family_id',new_family);
      -- Insertar relaciones históricas antes de recuperar el estado archivado.
      -- No se deshabilitan triggers y el estado intermedio nunca sale de la transacción.
      if table_name='patients' then mapped:=mapped||jsonb_build_object('archived_at',null); end if;
      if row_data ? 'id' then
        relation:=case when table_name='appointment_edits' then 'appointments' else table_name end;
        mapped:=mapped||jsonb_build_object('id',(ids->>(relation||':'||(row_data->>'id')::uuid::text))::uuid);
      end if;
      foreach fk in array array['patient_id','nurse_id','receipt_id','payment_id','shift_id','item_id','care_shift_id','paper_log_id'] loop
        if row_data ? fk then
          relation:=case fk when 'patient_id' then 'patients' when 'nurse_id' then 'nurses'
            when 'receipt_id' then 'receipts' when 'payment_id' then 'individual_payments'
            when 'shift_id' then 'shifts' when 'item_id' then 'inventory_items'
            when 'care_shift_id' then 'care_shifts' when 'paper_log_id' then 'paper_care_logs' end;
          if row_data->>fk is not null and not(ids ? (relation||':'||(row_data->>fk)::uuid::text)) then
            raise exception using errcode='22023',message='unmapped backup relation'; end if;
          mapped:=mapped||jsonb_build_object(fk,(ids->>(relation||':'||(row_data->>fk)::uuid::text))::uuid);
        end if;
      end loop;
      if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',table_name)::regclass and a.attname='actor_id' and not a.attisdropped) then
        mapped:=mapped||jsonb_build_object('actor_id',auth.uid());
      end if;
      execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',table_name,table_name) using mapped;
    end loop;
  end loop;
  for row_data in select value from jsonb_array_elements(archive->'tables'->'patients') loop
    update public.patients p set archived_at=(row_data->>'archived_at')::timestamptz
      where p.family_id=new_family and p.id=(ids->>('patients:'||(row_data->>'id')::uuid::text))::uuid;
  end loop;
  if exists(select 1 from public.individual_payments p left join public.individual_allocations a
      on a.family_id=p.family_id and a.payment_id=p.id where p.family_id=new_family
      group by p.id,p.amount_cents having coalesce(sum(a.amount_cents),0)<>p.amount_cents)
    or exists(select 1 from public.shifts s join public.individual_allocations a on a.family_id=s.family_id and a.shift_id=s.id
      where s.family_id=new_family group by s.id,s.cost_cents having sum(a.amount_cents)>s.cost_cents) then
    raise exception using errcode='22023',message='inconsistent individual allocation'; end if;
  if exists(select 1 from public.care_shifts s left join public.paper_care_logs l
      on l.family_id=s.family_id and l.care_shift_id=s.id where s.family_id=new_family
      group by s.id,s.closed_at having (s.closed_at is null and count(l.id)<>0)
        or (s.closed_at is not null and count(l.id)<>1))
    or exists(select 1 from public.paper_care_logs l join public.care_shifts s
      on s.family_id=l.family_id and s.id=l.care_shift_id where l.family_id=new_family and l.log_day<>s.start_local::date) then
    raise exception using errcode='22023',message='inconsistent shift closure'; end if;
  update acompana_private.family_restore_requests r set restored_family=new_family
    where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id;
  return new_family;
end $$;
revoke execute on function acompana_private.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;

create or replace function public.restore_family_backup(archive jsonb,family_name text,request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare canonical jsonb;prior jsonb;saved acompana_private.family_restore_requests;name text;
begin
  if auth.uid() is null or request_id is null or exists(select 1 from public.temporary_accesses t where t.user_id=auth.uid()) then
    raise exception using errcode='42501',message='personal account required'; end if;
  if jsonb_typeof(archive) is distinct from 'object' or archive->'version' is null
    or archive->'version' not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb)
    or jsonb_typeof(archive->'tables') is distinct from 'object' then
    raise exception using errcode='22023',message='unsupported backup version'; end if;
  if archive->'version' in ('1'::jsonb,'2'::jsonb) and archive->'tables' ? 'legacy_snapshots' then
    raise exception using errcode='22023',message='legacy rows require format3'; end if;
  if archive->'version' in ('2'::jsonb,'3'::jsonb,'4'::jsonb)
    and (jsonb_typeof(archive->'tables'->'care_tasks') is distinct from 'array' or jsonb_typeof(archive->'tables'->'care_notes') is distinct from 'array') then
    raise exception using errcode='22023',message='missing care tables'; end if;
  if archive->'version' in ('3'::jsonb,'4'::jsonb) and jsonb_typeof(archive->'tables'->'legacy_snapshots') is distinct from 'array' then
    raise exception using errcode='22023',message='missing legacy table'; end if;
  foreach name in array array['care_shifts','paper_care_logs','paper_care_log_edits'] loop
    if archive->'version'='4'::jsonb and jsonb_typeof(archive->'tables'->name) is distinct from 'array' then
      raise exception using errcode='22023',message='missing shift care table'; end if;
    if archive->'version'<>'4'::jsonb and archive->'tables' ? name then
      raise exception using errcode='22023',message='shift care rows require format4'; end if;
  end loop;
  canonical:=jsonb_set(case when archive->'version'='4'::jsonb then archive else acompana_private.with_legacy_nurse_fields(archive) end,'{version}','1'::jsonb);
  foreach name in array array['care_tasks','care_notes','legacy_snapshots','care_shifts','paper_care_logs','paper_care_log_edits'] loop
    if not(canonical->'tables' ? name) then canonical:=jsonb_set(canonical,array['tables',name],'[]'::jsonb); end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(canonical->'tables'->'care_tasks') t where t->'assignee_id' is distinct from 'null'::jsonb) then
    raise exception using errcode='22023',message='backup cannot assign accounts'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':restore:'||request_id::text,0));
  select * into saved from acompana_private.family_restore_requests r where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id;
  if found then
    prior:=jsonb_set(acompana_private.with_legacy_nurse_fields(saved.archive),'{version}','1'::jsonb);
    foreach name in array array['care_tasks','care_notes','legacy_snapshots','care_shifts','paper_care_logs','paper_care_log_edits'] loop
      if not(prior->'tables' ? name) then prior:=jsonb_set(prior,array['tables',name],'[]'::jsonb); end if;
    end loop;
    if prior is distinct from canonical or saved.restored_name is distinct from btrim(family_name) then
      raise exception using errcode='PT409',message='restore request changed'; end if;
    if saved.restored_family is not null then return saved.restored_family; end if;
  end if;
  return acompana_private.restore_family_backup(canonical,family_name,request_id);
end $$;
revoke execute on function public.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.restore_family_backup(jsonb,text,uuid) to authenticated;

commit;
