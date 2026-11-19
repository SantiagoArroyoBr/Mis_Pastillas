begin;

alter table acompana_private.creation_requests drop constraint creation_requests_operation_check;
alter table acompana_private.creation_requests add constraint creation_requests_operation_check
  check (operation in ('family','patient','nurse'));

create function public.add_nurse_once(family uuid, request_id uuid, nurse_name text, full_rate bigint, half_rate bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved acompana_private.creation_requests; result uuid;
  desired jsonb := jsonb_build_object('family',family,'name',btrim(nurse_name),'full_rate',full_rate,'half_rate',half_rate);
begin
  perform acompana_private.require_member(family,true);
  if request_id is null then raise exception using errcode='PT422',message='request required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':nurse:'||request_id::text,0));
  select * into saved from acompana_private.creation_requests r
    where r.user_id=auth.uid() and r.operation='nurse' and r.request_id=add_nurse_once.request_id;
  if found then
    if saved.payload is distinct from desired then raise exception using errcode='PT409',message='request changed'; end if;
    return saved.result_id;
  end if;
  result := public.add_nurse(family,nurse_name,full_rate,half_rate);
  insert into acompana_private.creation_requests values(auth.uid(),'nurse',request_id,desired,result,now());
  return result;
end $$;

revoke execute on function public.add_nurse_once(uuid,uuid,text,bigint,bigint) from public,anon;
grant execute on function public.add_nurse_once(uuid,uuid,text,bigint,bigint) to authenticated;

commit;
