begin;

alter table public.patients add column archived_at timestamptz;

create table public.appointments (
  family_id uuid not null,
  id uuid not null,
  patient_id uuid not null,
  appointment_day date,
  legacy_day text,
  appointment_time time,
  location text not null check (char_length(location) <= 160),
  notes text not null check (char_length(notes) <= 500),
  actor_id uuid not null references auth.users(id),
  primary key (family_id, id),
  foreign key (family_id, patient_id) references public.patients(family_id, id),
  check ((appointment_day is not null and isfinite(appointment_day) and legacy_day is null)
    or (appointment_day is null and legacy_day is not null and legacy_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
);

alter table public.appointments enable row level security;
create policy appointment_read on public.appointments for select to authenticated
  using (acompana_private.family_role(family_id) is not null);
revoke all on public.appointments from public, anon, authenticated;
grant select on public.appointments to authenticated;

create function public.set_patient_archived(family uuid, patient uuid, expected_revision integer, archived boolean)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  saved public.patients;
begin
  perform acompana_private.require_member(family, true);
  if expected_revision is null or archived is null then
    raise exception using errcode = '22023', message = 'archive state and revision required';
  end if;
  select * into saved from public.patients where family_id = family and id = patient for update;
  if not found or saved.revision <> expected_revision then
    raise exception using errcode = 'PT409', message = 'patient revision changed';
  end if;
  if (saved.archived_at is not null) = archived then
    return saved.revision;
  end if;
  update public.patients set archived_at = case when archived then now() else null end, revision = revision + 1
    where family_id = family and id = patient returning revision into saved.revision;
  return saved.revision;
end
$$;

create function acompana_private.require_active_patient(family uuid, patient uuid)
returns void language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.patients
    where family_id = family and id = patient and archived_at is null for share;
  if not found then
    raise exception using errcode = 'PT422', message = 'active patient unavailable';
  end if;
end
$$;

create function acompana_private.check_shift_patient() returns trigger language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.patients where family_id = new.family_id and id = new.patient_id for share;
  if exists (select 1 from public.patients
    where family_id = new.family_id and id = new.patient_id and archived_at is not null) then
    raise exception using errcode = 'PT422', message = 'active patient unavailable';
  end if;
  return new;
end
$$;
create trigger shift_active_patient before insert on public.shifts
  for each row execute function acompana_private.check_shift_patient();

create function public.add_appointment(family uuid, request_id uuid, patient uuid, day date,
  at_time time, place text, details text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved public.appointments;
begin
  perform acompana_private.require_member(family);
  if day is null or not isfinite(day) or (at_time is not null and at_time = '24:00'::time) then
    raise exception using errcode = '22023', message = 'valid appointment date and time required';
  end if;
  place := btrim(coalesce(place, ''));
  details := btrim(coalesce(details, ''));
  select * into saved from public.appointments where family_id = family and id = request_id;
  if not found then
    perform acompana_private.require_active_patient(family, patient);
    insert into public.appointments(family_id,id,patient_id,appointment_day,appointment_time,location,notes,actor_id)
    values (family,request_id,patient,day,at_time,place,details,auth.uid())
    on conflict (family_id,id) do nothing;
    select * into strict saved from public.appointments where family_id = family and id = request_id;
  end if;
  if (saved.patient_id,saved.appointment_day,saved.appointment_time,saved.location,saved.notes,saved.actor_id)
    is distinct from (patient,day,at_time,place,details,auth.uid()) then
    raise exception using errcode = 'PT409', message = 'request id already used';
  end if;
  return saved.id;
end
$$;

revoke execute on function acompana_private.require_active_patient(uuid,uuid), acompana_private.check_shift_patient()
  from public, anon, authenticated;
revoke execute on function public.set_patient_archived(uuid,uuid,integer,boolean),
  public.add_appointment(uuid,uuid,uuid,date,time,text,text) from public, anon, authenticated;
grant execute on function public.set_patient_archived(uuid,uuid,integer,boolean),
  public.add_appointment(uuid,uuid,uuid,date,time,text,text) to authenticated;

commit;
