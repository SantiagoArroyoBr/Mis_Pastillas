begin;

-- Solo hashes: nunca guardar direcciones, tokens OTP ni contenido del correo.
create table acompana_private.auth_email_deliveries (
  event_hash text primary key check(event_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  recipient_hash text not null check(recipient_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null default gen_random_uuid(),
  state text not null default 'new' check(state in ('new','sending','sent','failed','uncertain','denied')),
  created_at timestamptz not null default clock_timestamp(),
  last_attempt_at timestamptz,
  attempts integer not null default 0
);
revoke all on acompana_private.auth_email_deliveries from public,anon,authenticated;

create function public.claim_auth_email(event_hash text,payload_hash text,recipient_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved acompana_private.auth_email_deliveries; moment timestamptz:=clock_timestamp();
begin
  if event_hash is null or event_hash !~ '^[0-9a-f]{64}$' or payload_hash is null or payload_hash !~ '^[0-9a-f]{64}$'
    or recipient_hash is null or recipient_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid hook reservation'; end if;
  insert into acompana_private.auth_email_deliveries(event_hash,payload_hash,recipient_hash)
    values(event_hash,payload_hash,recipient_hash) on conflict on constraint auth_email_deliveries_pkey do nothing;
  select * into saved from acompana_private.auth_email_deliveries d where d.event_hash=claim_auth_email.event_hash for update;
  if saved.payload_hash<>payload_hash or saved.recipient_hash<>recipient_hash then
    raise exception using errcode='42501',message='hook identity conflict'; end if;
  if saved.state='sent' then return jsonb_build_object('status','sent'); end if;
  if saved.state='denied' then return jsonb_build_object('status','denied'); end if;
  -- Brevo documenta 30 minutos de deduplicación; nunca reenviar ambiguos fuera de 20.
  if saved.attempts>=3 or moment>=saved.created_at+interval '20 minutes'
    or (saved.last_attempt_at is not null and moment<saved.last_attempt_at+interval '2 seconds') then
    return jsonb_build_object('status','busy'); end if;
  if saved.state='new' and not public.reserve_access_request(recipient_hash,'auth_mail') then
    update acompana_private.auth_email_deliveries d set state='denied' where d.event_hash=claim_auth_email.event_hash;
    return jsonb_build_object('status','denied'); end if;
  update acompana_private.auth_email_deliveries d set state='sending',attempts=attempts+1,last_attempt_at=moment
    where d.event_hash=claim_auth_email.event_hash;
  return jsonb_build_object('status','send','idempotency_key',saved.idempotency_key);
end $$;

create function public.finish_auth_email(event_hash text,payload_hash text,delivered boolean,uncertain boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  update acompana_private.auth_email_deliveries d
    set state=case when delivered then 'sent' when uncertain then 'uncertain' else 'failed' end
    where d.event_hash=finish_auth_email.event_hash and d.payload_hash=finish_auth_email.payload_hash
      and d.state in ('sending','uncertain','failed');
end $$;
revoke execute on function public.claim_auth_email(text,text,text),public.finish_auth_email(text,text,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.claim_auth_email(text,text,text),public.finish_auth_email(text,text,boolean,boolean) to service_role;

commit;
