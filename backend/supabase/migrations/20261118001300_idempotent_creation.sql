begin;

create table acompana_private.creation_requests (
  user_id uuid not null references auth.users(id),
  operation text not null check (operation in ('family','patient')),
  request_id uuid not null,
  payload jsonb not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation, request_id)
);
revoke all on acompana_private.creation_requests from public,anon,authenticated;
alter table acompana_private.creation_requests enable row level security;

create function public.create_family_once(request_id uuid, family_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved acompana_private.creation_requests; result uuid;
  desired jsonb := jsonb_build_object('name',btrim(family_name));
begin
  if auth.uid() is null or request_id is null then
    raise exception using errcode='42501',message='access denied';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':family:'||request_id::text,0));
  select * into saved from acompana_private.creation_requests r
    where r.user_id=auth.uid() and r.operation='family' and r.request_id=create_family_once.request_id;
  if found then
    perform acompana_private.require_member(saved.result_id,true);
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  result := public.create_family(family_name);
  insert into acompana_private.creation_requests values(auth.uid(),'family',request_id,desired,result,now());
  return result;
end $$;

create function public.add_patient_once(family uuid, request_id uuid, patient_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved acompana_private.creation_requests; result uuid;
  desired jsonb := jsonb_build_object('family',family,'name',btrim(patient_name));
begin
  perform acompana_private.require_member(family);
  if request_id is null then raise exception using errcode='PT422',message='request required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':patient:'||request_id::text,0));
  select * into saved from acompana_private.creation_requests r
    where r.user_id=auth.uid() and r.operation='patient' and r.request_id=add_patient_once.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  result := public.add_patient(family,patient_name);
  insert into acompana_private.creation_requests values(auth.uid(),'patient',request_id,desired,result,now());
  return result;
end $$;

revoke execute on function public.create_family_once(uuid,text),public.add_patient_once(uuid,uuid,text) from public,anon;
grant execute on function public.create_family_once(uuid,text),public.add_patient_once(uuid,uuid,text) to authenticated;

commit;
