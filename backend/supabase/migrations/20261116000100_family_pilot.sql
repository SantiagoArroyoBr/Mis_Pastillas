begin;

create schema acompana_private;
revoke all on schema acompana_private from public, anon, authenticated;
grant usage on schema acompana_private to authenticated;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'caregiver')),
  revoked_at timestamptz,
  primary key (family_id, user_id)
);
create index family_members_active_by_user on public.family_members(user_id, family_id) where revoked_at is null;

create table acompana_private.invitations (
  code uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  recipient_email text not null check (char_length(recipient_email) between 3 and 320 and position('@' in recipient_email) > 1),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  revision integer not null default 1 check (revision > 0),
  unique (family_id, id)
);

create table public.nurses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  full_cents bigint check (full_cents between 0 and 9007199254740991),
  half_cents bigint check (half_cents between 0 and 9007199254740991),
  check (full_cents is not null or half_cents is not null),
  unique (family_id, id)
);

create table public.shifts (
  family_id uuid not null references public.families(id),
  id uuid not null,
  patient_id uuid not null,
  nurse_id uuid not null,
  service_day date not null,
  modality text not null check (modality in ('full', 'half')),
  cost_cents bigint not null check (cost_cents between 0 and 9007199254740991),
  actor_id uuid not null references auth.users(id),
  primary key (family_id, id),
  foreign key (family_id, patient_id) references public.patients(family_id, id),
  foreign key (family_id, nurse_id) references public.nurses(family_id, id)
);

create table public.receipts (
  family_id uuid not null references public.families(id),
  id uuid not null,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  actor_id uuid not null references auth.users(id),
  primary key (family_id, id)
);

create table public.receipt_cancellations (
  family_id uuid not null,
  id uuid not null,
  receipt_id uuid not null,
  cancelled_on date not null,
  actor_id uuid not null references auth.users(id),
  primary key (family_id, id),
  unique (family_id, receipt_id),
  foreign key (family_id, receipt_id) references public.receipts(family_id, id)
);

create function acompana_private.family_role(family uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.family_members
  where family_id = family and user_id = auth.uid() and revoked_at is null
$$;

create function acompana_private.require_member(family uuid, owner_only boolean default false) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  member_role text;
begin
  select role into member_role from public.family_members
  where family_id = family and user_id = auth.uid() and revoked_at is null
  for share;
  if member_role is null or (owner_only and member_role <> 'owner') then
    raise exception using errcode = '42501', message = 'access denied';
  end if;
end
$$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.patients enable row level security;
alter table public.nurses enable row level security;
alter table public.shifts enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_cancellations enable row level security;

create policy family_read on public.families for select to authenticated
using (acompana_private.family_role(id) is not null);
create policy membership_read on public.family_members for select to authenticated
using (acompana_private.family_role(family_id) is not null
       and (user_id = (select auth.uid()) or acompana_private.family_role(family_id) = 'owner'));
create policy patient_read on public.patients for select to authenticated
using (acompana_private.family_role(family_id) is not null);
create policy nurse_read on public.nurses for select to authenticated
using (acompana_private.family_role(family_id) = 'owner');
create policy shift_read on public.shifts for select to authenticated
using (acompana_private.family_role(family_id) = 'owner');
create policy receipt_read on public.receipts for select to authenticated
using (acompana_private.family_role(family_id) = 'owner');
create policy cancellation_read on public.receipt_cancellations for select to authenticated
using (acompana_private.family_role(family_id) = 'owner');

revoke all on public.families, public.family_members, public.patients, public.nurses,
  public.shifts, public.receipts, public.receipt_cancellations from public, anon, authenticated;
grant select on public.families, public.family_members, public.patients,
  public.nurses, public.shifts, public.receipts, public.receipt_cancellations to authenticated;

create function public.create_family(family_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  family uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'access denied';
  end if;
  insert into public.families(name) values (btrim(family_name)) returning id into family;
  insert into public.family_members(family_id, user_id, role) values (family, auth.uid(), 'owner');
  return family;
end
$$;

create function public.create_invite(family uuid, invite_email text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invitation uuid;
begin
  perform acompana_private.require_member(family, true);
  insert into acompana_private.invitations(family_id, recipient_email)
  values (family, lower(btrim(invite_email))) returning code into invitation;
  return invitation;
end
$$;

create function public.revoke_invite(family uuid, invitation uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform acompana_private.require_member(family, true);
  update acompana_private.invitations set revoked_at = now()
  where family_id = family and code = invitation and accepted_at is null and revoked_at is null;
end
$$;

create function public.accept_invite(invitation uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  family uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'access denied';
  end if;
  update acompana_private.invitations set accepted_at = now()
  where code = invitation and accepted_at is null and revoked_at is null and expires_at > now()
    and recipient_email = (select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null)
  returning family_id into family;
  if family is null then
    raise exception using errcode = '22023', message = 'invalid or expired invitation';
  end if;
  insert into public.family_members(family_id, user_id, role) values (family, auth.uid(), 'caregiver')
  on conflict (family_id, user_id) do update set revoked_at = null
  where public.family_members.role = 'caregiver';
  return family;
end
$$;

create function public.revoke_caregiver(family uuid, member uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform acompana_private.require_member(family, true);
  update public.family_members set revoked_at = now()
  where family_id = family and user_id = member and role = 'caregiver' and revoked_at is null;
end
$$;

create function public.add_patient(family uuid, patient_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  patient uuid;
begin
  perform acompana_private.require_member(family);
  insert into public.patients(family_id, name) values (family, btrim(patient_name)) returning id into patient;
  return patient;
end
$$;

create function public.rename_patient(family uuid, patient uuid, expected_revision integer, patient_name text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  next_revision integer;
begin
  perform acompana_private.require_member(family);
  update public.patients set name = btrim(patient_name), revision = revision + 1
  where family_id = family and id = patient and revision = expected_revision
  returning revision into next_revision;
  if next_revision is null then
    raise exception using errcode = 'PT409', message = 'record changed or unavailable';
  end if;
  return next_revision;
end
$$;

create function public.add_nurse(family uuid, nurse_name text, full_rate bigint, half_rate bigint) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  nurse uuid;
begin
  perform acompana_private.require_member(family, true);
  insert into public.nurses(family_id, name, full_cents, half_cents)
  values (family, btrim(nurse_name), full_rate, half_rate) returning id into nurse;
  return nurse;
end
$$;

create function public.record_shift(family uuid, request_id uuid, patient uuid, nurse uuid, day date, shift_type text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  rate bigint;
  saved public.shifts;
begin
  perform acompana_private.require_member(family, true);
  select * into saved from public.shifts where family_id = family and id = request_id;
  if not found then
    select case shift_type when 'full' then full_cents when 'half' then half_cents end
      into rate from public.nurses where family_id = family and id = nurse;
    if rate is null then
      raise exception using errcode = '22023', message = 'rate unavailable';
    end if;
    insert into public.shifts(family_id, id, patient_id, nurse_id, service_day, modality, cost_cents, actor_id)
    values (family, request_id, patient, nurse, day, shift_type, rate, auth.uid())
    on conflict (family_id, id) do nothing;
    select * into strict saved from public.shifts where family_id = family and id = request_id;
  end if;
  if (saved.patient_id, saved.nurse_id, saved.service_day, saved.modality, saved.actor_id)
     is distinct from (patient, nurse, day, shift_type, auth.uid()) then
    raise exception using errcode = 'PT409', message = 'request id already used';
  end if;
  return saved.id;
end
$$;

create function public.record_receipt(family uuid, request_id uuid, day date, cents bigint) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  saved public.receipts;
begin
  perform acompana_private.require_member(family, true);
  insert into public.receipts(family_id, id, paid_on, amount_cents, actor_id)
  values (family, request_id, day, cents, auth.uid())
  on conflict (family_id, id) do nothing;
  select * into strict saved from public.receipts where family_id = family and id = request_id;
  if (saved.paid_on, saved.amount_cents, saved.actor_id) is distinct from (day, cents, auth.uid()) then
    raise exception using errcode = 'PT409', message = 'request id already used';
  end if;
  return saved.id;
end
$$;

create function public.cancel_receipt(family uuid, request_id uuid, receipt uuid, day date) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  saved public.receipt_cancellations;
begin
  perform acompana_private.require_member(family, true);
  if not exists (select 1 from public.receipts where family_id = family and id = receipt and paid_on <= day) then
    raise exception using errcode = '22023', message = 'receipt or date unavailable';
  end if;
  insert into public.receipt_cancellations(family_id, id, receipt_id, cancelled_on, actor_id)
  values (family, request_id, receipt, day, auth.uid())
  on conflict do nothing;
  select * into saved from public.receipt_cancellations where family_id = family and id = request_id;
  if not found or (saved.receipt_id, saved.cancelled_on, saved.actor_id)
     is distinct from (receipt, day, auth.uid()) then
    raise exception using errcode = 'PT409', message = 'receipt already cancelled or request id used';
  end if;
  return saved.id;
end
$$;

revoke execute on function acompana_private.family_role(uuid), acompana_private.require_member(uuid,boolean)
from public, anon, authenticated;
grant execute on function acompana_private.family_role(uuid) to authenticated;

revoke execute on function public.create_family(text), public.create_invite(uuid,text), public.revoke_invite(uuid,uuid), public.accept_invite(uuid),
  public.revoke_caregiver(uuid,uuid), public.add_patient(uuid,text), public.rename_patient(uuid,uuid,integer,text),
  public.add_nurse(uuid,text,bigint,bigint), public.record_shift(uuid,uuid,uuid,uuid,date,text),
  public.record_receipt(uuid,uuid,date,bigint), public.cancel_receipt(uuid,uuid,uuid,date)
  from public, anon, authenticated;
grant execute on function public.create_family(text), public.create_invite(uuid,text), public.revoke_invite(uuid,uuid), public.accept_invite(uuid),
  public.revoke_caregiver(uuid,uuid), public.add_patient(uuid,text), public.rename_patient(uuid,uuid,integer,text),
  public.add_nurse(uuid,text,bigint,bigint), public.record_shift(uuid,uuid,uuid,uuid,date,text),
  public.record_receipt(uuid,uuid,date,bigint), public.cancel_receipt(uuid,uuid,uuid,date) to authenticated;

commit;
