begin;

alter table public.appointments add column doctor text check (char_length(doctor) <= 160);
alter table public.appointment_edits add column doctor text check (char_length(doctor) <= 160);
alter table public.receipts add column concept text check (char_length(concept) <= 160);
alter table public.individual_payments add column concept text check (char_length(concept) <= 160);

create or replace view public.appointment_details with (security_invoker = true) as
  select a.family_id, a.id, a.patient_id, p.name as patient_name,
    coalesce(e.revision, 1) as revision,
    a.legacy_day, coalesce(e.appointment_day, a.appointment_day) as appointment_day,
    case when e.id is null then a.appointment_time else e.appointment_time end as appointment_time,
    coalesce(e.location, a.location) as location, coalesce(e.notes, a.notes) as notes,
    coalesce(e.doctor, a.doctor, '') as doctor
  from public.appointments a
  join public.patients p on p.family_id = a.family_id and p.id = a.patient_id
  left join public.appointment_edits e on e.family_id = a.family_id and e.id = a.id;

create function public.add_appointment(family uuid, request_id uuid, patient uuid, day date,
  at_time time, place text, details text, doctor_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved uuid;
  doctor_text text := btrim(coalesce(doctor_name, ''));
begin
  saved := public.add_appointment(family, request_id, patient, day, at_time, place, details);
  update public.appointments set doctor = doctor_text where family_id = family and id = saved
    and (doctor is null or doctor = doctor_text);
  if not found then raise exception using errcode = 'PT409', message = 'request id already used'; end if;
  return saved;
end
$$;

create function public.edit_appointment(family uuid, appointment uuid, expected_revision integer,
  day date, at_time time, place text, details text, doctor_name text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  saved integer;
begin
  saved := public.edit_appointment(family, appointment, expected_revision, day, at_time, place, details);
  update public.appointment_edits set doctor = btrim(coalesce(doctor_name, ''))
    where family_id = family and id = appointment and revision = saved;
  return saved;
end
$$;

create function public.record_receipt(family uuid, request_id uuid, day date, cents bigint, concept_text text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved uuid;
  description text := btrim(coalesce(concept_text, ''));
begin
  saved := public.record_receipt(family, request_id, day, cents);
  update public.receipts set concept = description where family_id = family and id = saved
    and (concept is null or concept = description);
  if not found then raise exception using errcode = 'PT409', message = 'request id already used'; end if;
  return saved;
end
$$;

create function public.record_individual_payment(family uuid, request_id uuid, nurse uuid,
  day date, cents bigint, concept_text text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved uuid;
  description text := btrim(coalesce(concept_text, ''));
begin
  saved := public.record_individual_payment(family, request_id, nurse, day, cents);
  update public.individual_payments set concept = description where family_id = family and id = saved
    and (concept is null or concept = description);
  if not found then raise exception using errcode = 'PT409', message = 'request id already used'; end if;
  return saved;
end
$$;

revoke execute on function public.add_appointment(uuid,uuid,uuid,date,time,text,text,text),
  public.edit_appointment(uuid,uuid,integer,date,time,text,text,text),
  public.record_receipt(uuid,uuid,date,bigint,text), public.record_individual_payment(uuid,uuid,uuid,date,bigint,text)
  from public, anon, authenticated;
grant execute on function public.add_appointment(uuid,uuid,uuid,date,time,text,text,text),
  public.edit_appointment(uuid,uuid,integer,date,time,text,text,text),
  public.record_receipt(uuid,uuid,date,bigint,text), public.record_individual_payment(uuid,uuid,uuid,date,bigint,text)
  to authenticated;

commit;
