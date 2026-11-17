begin;

-- Contadores compartidos por todas las instancias. No almacenar correos ni códigos.
create table acompana_private.request_limits (
  bucket text primary key,
  last_at timestamptz,
  hour_start timestamptz not null default now(),
  hour_count integer not null default 0,
  day_start timestamptz not null default now(),
  day_count integer not null default 0
);
revoke all on acompana_private.request_limits from public,anon,authenticated;

create function acompana_private.reserve_bucket(bucket_name text, seconds integer, hourly integer, daily integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare saved acompana_private.request_limits; moment timestamptz := clock_timestamp();
begin
  insert into acompana_private.request_limits(bucket) values(bucket_name) on conflict do nothing;
  select * into saved from acompana_private.request_limits where bucket=bucket_name for update;
  if moment >= saved.hour_start + interval '1 hour' then saved.hour_start:=moment; saved.hour_count:=0; end if;
  if moment >= saved.day_start + interval '1 day' then saved.day_start:=moment; saved.day_count:=0; end if;
  if (saved.last_at is not null and moment < saved.last_at + make_interval(secs=>seconds))
    or saved.hour_count>=hourly or saved.day_count>=daily then return false; end if;
  update acompana_private.request_limits set last_at=moment,hour_start=saved.hour_start,
    hour_count=saved.hour_count+1,day_start=saved.day_start,day_count=saved.day_count+1 where bucket=bucket_name;
  return true;
end $$;
revoke execute on function acompana_private.reserve_bucket(text,integer,integer,integer) from public,anon,authenticated;

create function public.reserve_access_request(bucket_hash text,purpose text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if bucket_hash is null or bucket_hash !~ '^[0-9a-f]{64}$' or purpose is null
    or purpose not in ('auth_mail','activation','admin') then
    raise exception using errcode='22023',message='invalid quota request'; end if;
  -- Bloqueo global primero. Si falla una cuota, revertir ambas reservas.
  begin
  if purpose='auth_mail' then
    if not acompana_private.reserve_bucket('global:mail',0,100,250)
      or not acompana_private.reserve_bucket(purpose||':'||bucket_hash,60,3,5) then
      raise exception using errcode='PT429',message='quota'; end if;
  elsif purpose='activation' then
    if not acompana_private.reserve_bucket('global:activation',0,120,1000)
      or not acompana_private.reserve_bucket(purpose||':'||bucket_hash,0,20,50) then
      raise exception using errcode='PT429',message='quota'; end if;
  else
    if not acompana_private.reserve_bucket(purpose||':'||bucket_hash,2,30,100) then
      raise exception using errcode='PT429',message='quota'; end if;
  end if;
  return true;
  exception when sqlstate 'PT429' then return false;
  end;
end $$;
revoke execute on function public.reserve_access_request(text,text) from public,anon,authenticated;
grant execute on function public.reserve_access_request(text,text) to service_role;

commit;
