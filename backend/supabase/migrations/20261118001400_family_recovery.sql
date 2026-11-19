begin;

-- Procedencia de restauraciones: nunca contiene capacidades de acceso.
create table acompana_private.family_restore_requests (
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  archive jsonb not null,
  restored_family uuid references public.families(id),
  restored_name text not null,
  restored_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
revoke all on acompana_private.family_restore_requests from public,anon,authenticated;
alter table acompana_private.family_restore_requests enable row level security;

create function acompana_private.family_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'patients','nurses','shifts','receipts','receipt_cancellations','individual_payments',
  'individual_allocations','appointments','appointment_edits','inventory_items',
  'inventory_profiles','inventory_purchases','inventory_quotes']::text[] $$;
revoke execute on function acompana_private.family_backup_tables() from public,anon,authenticated;

create function acompana_private.family_backup_rows(table_name text, source_family uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; patch text;
begin
  if not(table_name=any(acompana_private.family_backup_tables())) then
    raise exception using errcode='22023',message='unsupported backup table'; end if;
  -- Los numeric se transportan como texto para conservar decimales exactos.
  select string_agg(format('%L,t.%I::text',a.attname,a.attname),',') into patch
    from pg_catalog.pg_attribute a join pg_catalog.pg_type ty on ty.oid=a.atttypid
    where a.attrelid=format('public.%I',table_name)::regclass and a.attnum>0
      and not a.attisdropped and ty.typname='numeric';
  execute format('select coalesce(jsonb_agg((to_jsonb(t)-''family_id''-''actor_id'') %s order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where t.family_id=$1',
    case when patch is null then '' else '||jsonb_build_object('||patch||')' end,table_name)
    into result using source_family;
  return result;
end $$;
revoke execute on function acompana_private.family_backup_rows(text,uuid) from public,anon,authenticated;

create function acompana_private.valid_backup_administration(value jsonb, depth integer default 0) returns boolean
language plpgsql immutable set search_path='' as $$
declare entry jsonb; section text; allowed text[];
begin
  if depth>2 or jsonb_typeof(value) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(value) k where k not in ('accesses','events','membership_states','recovery_history')) then return false; end if;
  foreach section in array array['accesses','events','membership_states','recovery_history'] loop
    if section='recovery_history' and not(value ? section) then continue; end if;
    if jsonb_typeof(value->section) is distinct from 'array' or jsonb_array_length(value->section)>50000 then return false; end if;
    allowed:=case section
      when 'accesses' then array['id','display_name','expires_at','revoked_at','revision','state','created_at']
      when 'events' then array['access_id','action','happened_at']
      when 'membership_states' then array['role','revoked_at']
      else array['source_family','restored_at','administration'] end;
    for entry in select j.value from jsonb_array_elements(value->section) j loop
      if jsonb_typeof(entry) is distinct from 'object'
        or exists(select 1 from jsonb_object_keys(entry) k where not(k=any(allowed)))
        or exists(select 1 from unnest(allowed) k where not(entry ? k)) then return false; end if;
      if section='membership_states' and coalesce(entry->>'role','') not in ('owner','caregiver') then return false; end if;
      if section='accesses' and (coalesce(entry->>'state','') not in ('pending','active','revoked')
        or jsonb_typeof(entry->'display_name') is distinct from 'string'
        or char_length(entry->>'display_name') not between 1 and 80) then return false; end if;
      if section='recovery_history' and (not acompana_private.valid_backup_administration(entry->'administration',depth+1)
        or jsonb_typeof(entry->'source_family') is distinct from 'object'
        or exists(select 1 from jsonb_object_keys(entry->'source_family') k where k not in ('id','name','created_at'))) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
revoke execute on function acompana_private.valid_backup_administration(jsonb,integer) from public,anon,authenticated;

create function public.export_family_backup(family uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
       ||coalesce(jsonb_agg(r.archive->'administration'->'recovery_history')->0,'[]'::jsonb)
       from acompana_private.family_restore_requests r where r.restored_family=family),'[]'::jsonb)) into administration;
  return jsonb_build_object('format','acompana-family','version',1,'exported_at',now(),
    'family',info,'tables',tables,'administration',administration);
end $$;

create function public.restore_family_backup(archive jsonb, family_name text, request_id uuid) returns uuid
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
      foreach fk in array array['patient_id','nurse_id','receipt_id','payment_id','shift_id','item_id'] loop
        if row_data ? fk then
          relation:=case fk when 'patient_id' then 'patients' when 'nurse_id' then 'nurses'
            when 'receipt_id' then 'receipts' when 'payment_id' then 'individual_payments'
            when 'shift_id' then 'shifts' when 'item_id' then 'inventory_items' end;
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
  update acompana_private.family_restore_requests r set restored_family=new_family
    where r.actor_id=auth.uid() and r.request_id=restore_family_backup.request_id;
  return new_family;
end $$;
revoke execute on function public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.export_family_backup(uuid),public.restore_family_backup(jsonb,text,uuid) to authenticated;

commit;
