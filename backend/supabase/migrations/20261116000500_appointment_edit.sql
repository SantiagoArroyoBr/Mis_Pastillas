begin;

create table public.appointment_edits (
  family_id uuid not null,
  id uuid not null,
  revision integer not null check (revision > 1),
  appointment_day date not null check (isfinite(appointment_day)),
  appointment_time time,
  location text not null check (char_length(location) <= 160),
  notes text not null check (char_length(notes) <= 500),
  primary key (family_id, id),
  foreign key (family_id, id) references public.appointments(family_id, id)
);

alter table public.appointment_edits enable row level security;
create policy appointment_edits_read on public.appointment_edits for select to authenticated
  using (acompana_private.family_role(family_id) is not null);
revoke all on public.appointment_edits from public, anon, authenticated;
grant select on public.appointment_edits to authenticated;

create view public.appointment_details with (security_invoker = true) as
  select a.family_id, a.id, a.patient_id, p.name as patient_name,
    coalesce(e.revision, 1) as revision,
    a.legacy_day, coalesce(e.appointment_day, a.appointment_day) as appointment_day,
    case when e.id is null then a.appointment_time else e.appointment_time end as appointment_time,
    coalesce(e.location, a.location) as location, coalesce(e.notes, a.notes) as notes
  from public.appointments a
  join public.patients p on p.family_id = a.family_id and p.id = a.patient_id
  left join public.appointment_edits e on e.family_id = a.family_id and e.id = a.id;
revoke all on public.appointment_details from public, anon, authenticated;
grant select on public.appointment_details to authenticated;

create function public.edit_appointment(family uuid, appointment uuid, expected_revision integer,
  day date, at_time time, place text, details text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  original public.appointments;
  current_revision integer;
begin
  perform acompana_private.require_member(family);
  if expected_revision is null or day is null or not isfinite(day) or at_time = '24:00'::time then
    raise exception using errcode = '22023', message = 'valid appointment date, time and revision required';
  end if;
  select * into original from public.appointments
    where family_id = family and id = appointment for update;
  if not found then
    raise exception using errcode = 'PT422', message = 'appointment unavailable';
  end if;
  if original.legacy_day is not null then
    raise exception using errcode = 'PT422', message = 'appointment unavailable';
  end if;
  perform acompana_private.require_active_patient(family, original.patient_id);
  select revision into current_revision from public.appointment_edits where family_id = family and id = appointment;
  current_revision := coalesce(current_revision, 1);
  if current_revision <> expected_revision then
    raise exception using errcode = 'PT409', message = 'appointment revision changed';
  end if;
  insert into public.appointment_edits(family_id,id,revision,appointment_day,appointment_time,location,notes)
  values (family,appointment,current_revision + 1,day,at_time,btrim(coalesce(place,'')),btrim(coalesce(details,'')))
  on conflict (family_id,id) do update
    set revision = excluded.revision, appointment_day = excluded.appointment_day,
      appointment_time = excluded.appointment_time, location = excluded.location, notes = excluded.notes;
  return current_revision + 1;
end
$$;
revoke execute on function public.edit_appointment(uuid,uuid,integer,date,time,text,text) from public, anon, authenticated;
grant execute on function public.edit_appointment(uuid,uuid,integer,date,time,text,text) to authenticated;

commit;
