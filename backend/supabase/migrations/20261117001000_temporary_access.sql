begin;

-- Las identidades temporales se conservan para mantener sus referencias históricas.
create table public.temporary_accesses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  user_id uuid unique references auth.users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revision integer not null default 1,
  state text not null default 'pending' check (state in ('pending','active','revoked')),
  created_by uuid not null references auth.users(id),
  token_valid_after timestamptz not null default date_trunc('second',now()) + interval '1 second',
  created_at timestamptz not null default now()
);
create table acompana_private.temporary_activation (
  access_id uuid primary key references public.temporary_accesses(id),
  activation_hash text unique not null check (activation_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '15 minutes',
  claim_id uuid unique,
  claimed_at timestamptz
);
create table public.temporary_access_events (
  id bigint generated always as identity primary key,
  access_id uuid not null references public.temporary_accesses(id),
  family_id uuid not null references public.families(id),
  action text not null,
  actor_id uuid references auth.users(id),
  happened_at timestamptz not null default now()
);
alter table public.temporary_accesses enable row level security;
alter table public.temporary_access_events enable row level security;
revoke all on public.temporary_accesses, public.temporary_access_events from public,anon,authenticated;
grant select on public.temporary_accesses, public.temporary_access_events to authenticated;

create or replace function acompana_private.family_role(family uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.family_members m
  where m.family_id = family and m.user_id = auth.uid() and m.revoked_at is null
    and (not exists (select 1 from public.temporary_accesses t where t.user_id = auth.uid())
      or exists (select 1 from public.temporary_accesses t where t.user_id = auth.uid()
        and t.family_id = family and t.state = 'active' and t.revoked_at is null and t.expires_at > now()
        and case when (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat') ~ '^[0-9]{1,12}$'
          then (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat')::numeric >= extract(epoch from t.token_valid_after)
          else false end
        and exists (select 1 from auth.sessions s where s.user_id=auth.uid() and s.created_at>=t.token_valid_after
          and s.id=case when (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
            ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid else null end)))
$$;
create or replace function acompana_private.require_member(family uuid, owner_only boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare member_role text;
begin
  perform 1 from public.family_members where family_id = family and user_id = auth.uid() for share;
  member_role := acompana_private.family_role(family);
  if member_role is null or (owner_only and member_role <> 'owner') then
    raise exception using errcode = '42501', message = 'access denied';
  end if;
end $$;
create policy temporary_access_owner_read on public.temporary_accesses for select to authenticated
  using (acompana_private.family_role(family_id) = 'owner');
create policy temporary_events_owner_read on public.temporary_access_events for select to authenticated
  using (acompana_private.family_role(family_id) = 'owner');

create index temporary_events_quota on public.temporary_access_events(family_id,action,happened_at);
create function acompana_private.require_temporary_quota(family uuid, access uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare recent integer; hourly integer; daily integer;
begin
  -- Bloqueo común para impedir que solicitudes simultáneas gasten el mismo cupo.
  perform 1 from public.families where id=family for update;
  if access is null then
    select count(*) filter(where happened_at>now()-interval '2 seconds'),
      count(*) filter(where happened_at>now()-interval '1 hour'), count(*)
      into recent,hourly,daily from public.temporary_access_events
      where family_id=family and action='issued' and happened_at>now()-interval '1 day';
    if recent>=1 or hourly>=30 or daily>=100 then
      raise exception using errcode='PT429',message='temporary issuance limit'; end if;
  else
    select count(*) filter(where happened_at>now()-interval '60 seconds'),
      count(*) filter(where happened_at>now()-interval '1 hour'),count(*)
      into recent,hourly,daily from public.temporary_access_events
      where family_id=family and access_id=access and action='reset' and happened_at>now()-interval '1 day';
    if recent>=1 or hourly>=3 or daily>=5 then
      raise exception using errcode='PT429',message='temporary reset limit'; end if;
  end if;
end $$;
revoke execute on function acompana_private.require_temporary_quota(uuid,uuid) from public,anon,authenticated;

-- La gestión de accesos exige una sesión reciente comprobada en Auth, no solo iat.
create function acompana_private.require_access_admin(family uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform acompana_private.require_member(family,true);
  if not exists(select 1 from auth.sessions s where s.user_id=auth.uid()
    and s.created_at>now()-interval '15 minutes'
    and s.id=case when (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid else null end) then
    raise exception using errcode='PT401',message='recent sign in required';
  end if;
end $$;
revoke execute on function acompana_private.require_access_admin(uuid) from public,anon,authenticated;

-- Las funciones existentes conservan sus firmas y contratos para cuentas personales.
create or replace function public.create_family(family_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare family uuid;
begin
  if auth.uid() is null or exists (select 1 from public.temporary_accesses where user_id = auth.uid())
    or exists(select 1 from auth.users where id=auth.uid() and lower(email) like '%@acompana.invalid') then
    raise exception using errcode = '42501', message = 'personal account required';
  end if;
  insert into public.families(name) values (btrim(family_name)) returning id into family;
  insert into public.family_members(family_id,user_id,role) values (family,auth.uid(),'owner');
  return family;
end $$;
create or replace function public.accept_invite(invitation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare family uuid;
begin
  if auth.uid() is null or exists (select 1 from public.temporary_accesses where user_id = auth.uid())
    or exists(select 1 from auth.users where id=auth.uid() and lower(email) like '%@acompana.invalid') then
    raise exception using errcode = '42501', message = 'personal account required';
  end if;
  update acompana_private.invitations set accepted_at = now()
  where code = invitation and accepted_at is null and revoked_at is null and expires_at > now()
    and recipient_email = (select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null)
  returning family_id into family;
  if family is null then raise exception using errcode = '22023', message = 'invalid or expired invitation'; end if;
  insert into public.family_members(family_id,user_id,role) values(family,auth.uid(),'caregiver')
  on conflict(family_id,user_id) do update set revoked_at = null where public.family_members.role = 'caregiver';
  return family;
end $$;

create function public.issue_temporary_access(family uuid, display_name text, access_expires_at timestamptz, activation_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare access uuid;
begin
  perform acompana_private.require_access_admin(family);
  if access_expires_at is null or access_expires_at <= now() or access_expires_at > now()+interval '366 days' then
    raise exception using errcode = '22023', message = 'invalid expiry';
  end if;
  perform acompana_private.require_temporary_quota(family);
  insert into public.temporary_accesses(family_id,display_name,expires_at,created_by)
    values(family,btrim(display_name),access_expires_at,auth.uid()) returning id into access;
  insert into acompana_private.temporary_activation(access_id,activation_hash) values(access,activation_hash);
  insert into public.temporary_access_events(access_id,family_id,action,actor_id) values(access,family,'issued',auth.uid());
  return access;
end $$;

create function public.reset_temporary_access(family uuid, access uuid, expected_revision integer, activation_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare saved public.temporary_accesses;
begin
  perform acompana_private.require_access_admin(family);
  select * into saved from public.temporary_accesses where id=access and family_id=family for update;
  if not found or saved.revision <> expected_revision then raise exception using errcode='PT409', message='access changed'; end if;
  if saved.state='revoked' or saved.expires_at <= now() then raise exception using errcode='22023',message='access unavailable'; end if;
  if exists(select 1 from acompana_private.temporary_activation where access_id=access and claim_id is not null and expires_at>now()) then
    raise exception using errcode='PT409',message='activation in progress';
  end if;
  perform acompana_private.require_temporary_quota(family,access);
  update public.temporary_accesses set state='pending', revision=revision+1,
    token_valid_after=date_trunc('second',now())+interval '1 second' where id=access;
  update public.family_members set revoked_at=now() where family_id=family and user_id=saved.user_id;
  delete from acompana_private.temporary_activation where access_id=access;
  insert into acompana_private.temporary_activation(access_id,activation_hash) values(access,activation_hash);
  insert into public.temporary_access_events(access_id,family_id,action,actor_id) values(access,family,'reset',auth.uid());
end $$;

create function public.renew_temporary_access(family uuid, access uuid, expected_revision integer, access_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare saved public.temporary_accesses;
begin
  perform acompana_private.require_access_admin(family);
  select * into saved from public.temporary_accesses where id=access and family_id=family for update;
  if not found or saved.revision<>expected_revision then raise exception using errcode='PT409',message='access changed'; end if;
  if access_expires_at is null or access_expires_at <= now() or access_expires_at > now()+interval '366 days' or saved.state='revoked' then
    raise exception using errcode='22023',message='invalid expiry';
  end if;
  if exists(select 1 from acompana_private.temporary_activation where access_id=access and claim_id is not null and expires_at>now()) then
    raise exception using errcode='PT409',message='activation in progress'; end if;
  update public.temporary_accesses set expires_at=access_expires_at,revision=revision+1 where id=access;
  insert into public.temporary_access_events(access_id,family_id,action,actor_id) values(access,family,'renewed',auth.uid());
end $$;

create function public.revoke_temporary_access(family uuid, access uuid, expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare saved public.temporary_accesses;
begin
  perform acompana_private.require_access_admin(family);
  select * into saved from public.temporary_accesses where id=access and family_id=family for update;
  if not found or saved.revision<>expected_revision then raise exception using errcode='PT409',message='access changed'; end if;
  update public.temporary_accesses set state='revoked',revoked_at=now(),revision=revision+1 where id=access;
  update public.family_members set revoked_at=now() where family_id=family and user_id=saved.user_id;
  delete from acompana_private.temporary_activation where access_id=access;
  insert into public.temporary_access_events(access_id,family_id,action,actor_id) values(access,family,'revoked',auth.uid());
end $$;

-- Solo el gateway con credencial de servidor puede reclamar y vincular una identidad Auth.
create function public.claim_temporary_access(activation_hash text, claim_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved public.temporary_accesses; activation acompana_private.temporary_activation; access uuid;
begin
  if claim_id is null then raise exception using errcode='22023',message='invalid claim'; end if;
  select access_id into access from acompana_private.temporary_activation t where t.activation_hash=claim_temporary_access.activation_hash;
  select * into saved from public.temporary_accesses where id=access for update;
  select * into activation from acompana_private.temporary_activation where access_id=access for update;
  if saved.id is null or saved.state<>'pending' or saved.revoked_at is not null or saved.expires_at<=now()
     or activation.expires_at<=now() or activation.claim_id is not null then
    raise exception using errcode='22023',message='invalid activation'; end if;
  update acompana_private.temporary_activation set claim_id=claim_temporary_access.claim_id,claimed_at=now() where access_id=access;
  return jsonb_build_object('id',saved.id,'user_id',saved.user_id,'login_email','temp-'||saved.id::text||'@acompana.invalid','revision',saved.revision,'not_before',saved.token_valid_after);
end $$;

create function public.complete_temporary_access(access uuid, claim_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare saved public.temporary_accesses;
begin
  select * into saved from public.temporary_accesses where id=access for update;
  if not found or saved.state<>'pending' or saved.revoked_at is not null or saved.expires_at<=now()
    or not exists(select 1 from acompana_private.temporary_activation t where t.access_id=access and t.claim_id=complete_temporary_access.claim_id and t.expires_at>now())
    or (saved.user_id is not null and saved.user_id<>complete_temporary_access.user_id)
    or not exists(select 1 from auth.users u where u.id=complete_temporary_access.user_id and lower(u.email)='temp-'||access::text||'@acompana.invalid')
    or exists(select 1 from public.family_members m where m.user_id=complete_temporary_access.user_id and (m.family_id<>saved.family_id or m.role='owner')) then
    raise exception using errcode='42501',message='invalid identity or claim'; end if;
  update public.temporary_accesses set user_id=complete_temporary_access.user_id,state='active',revision=revision+1 where id=access;
  insert into public.family_members(family_id,user_id,role) values(saved.family_id,complete_temporary_access.user_id,'caregiver')
    on conflict on constraint family_members_pkey do update set revoked_at=null where public.family_members.role='caregiver';
  delete from acompana_private.temporary_activation where access_id=access;
  insert into public.temporary_access_events(access_id,family_id,action,actor_id) values(access,saved.family_id,'activated',complete_temporary_access.user_id);
end $$;

create function public.abandon_temporary_access_claim(access uuid, claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.temporary_accesses where id=access for update;
  update acompana_private.temporary_activation t set claim_id=null,claimed_at=null
    where t.access_id=access and t.claim_id=abandon_temporary_access_claim.claim_id;
end $$;

-- La revocación legada también debe invalidar activaciones temporales en curso.
create or replace function public.revoke_caregiver(family uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare saved public.temporary_accesses;
begin
  perform acompana_private.require_member(family,true);
  select * into saved from public.temporary_accesses where family_id=family and user_id=member for update;
  if found then
    perform public.revoke_temporary_access(family,saved.id,saved.revision);
  else
    update public.family_members set revoked_at=now()
      where family_id=family and user_id=member and role='caregiver' and revoked_at is null;
  end if;
end $$;

revoke execute on function public.issue_temporary_access(uuid,text,timestamptz,text),public.reset_temporary_access(uuid,uuid,integer,text),
  public.renew_temporary_access(uuid,uuid,integer,timestamptz),public.revoke_temporary_access(uuid,uuid,integer),
  public.claim_temporary_access(text,uuid),public.complete_temporary_access(uuid,uuid,uuid),public.abandon_temporary_access_claim(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.issue_temporary_access(uuid,text,timestamptz,text),public.reset_temporary_access(uuid,uuid,integer,text),
  public.renew_temporary_access(uuid,uuid,integer,timestamptz),public.revoke_temporary_access(uuid,uuid,integer) to authenticated;
grant execute on function public.claim_temporary_access(text,uuid),public.complete_temporary_access(uuid,uuid,uuid),public.abandon_temporary_access_claim(uuid,uuid)
  to service_role;

commit;
