begin;

alter table public.shifts add unique (family_id, nurse_id, id);

create table public.individual_payments (
  family_id uuid not null,
  id uuid not null,
  nurse_id uuid not null,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  actor_id uuid not null references auth.users(id),
  primary key (family_id, id),
  unique (family_id, nurse_id, id),
  foreign key (family_id, nurse_id) references public.nurses(family_id, id)
);

create table public.individual_allocations (
  family_id uuid not null,
  nurse_id uuid not null,
  payment_id uuid not null,
  shift_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  primary key (family_id, payment_id, shift_id),
  foreign key (family_id, nurse_id, payment_id) references public.individual_payments(family_id, nurse_id, id),
  foreign key (family_id, nurse_id, shift_id) references public.shifts(family_id, nurse_id, id)
);

create index individual_allocations_by_shift on public.individual_allocations(family_id, shift_id);
alter table public.individual_payments enable row level security;
alter table public.individual_allocations enable row level security;
create policy individual_payments_read on public.individual_payments for select to authenticated
  using (acompana_private.family_role(family_id) = 'owner');
create policy individual_allocations_read on public.individual_allocations for select to authenticated
  using (acompana_private.family_role(family_id) = 'owner');
revoke all on public.individual_payments, public.individual_allocations from public, anon, authenticated;
grant select on public.individual_payments, public.individual_allocations to authenticated;

create function public.record_individual_payment(family uuid, request_id uuid, nurse uuid, day date, cents bigint)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved public.individual_payments;
  remaining bigint := cents;
  applied bigint;
  eligible record;
begin
  perform acompana_private.require_member(family, true);
  -- Serialize allocation for this nurse before reading any outstanding amounts.
  perform 1 from public.nurses where family_id = family and id = nurse for update;
  if not found then
    raise exception using errcode = '22023', message = 'nurse unavailable';
  end if;
  insert into public.individual_payments(family_id, id, nurse_id, paid_on, amount_cents, actor_id)
  values (family, request_id, nurse, day, cents, auth.uid())
  on conflict (family_id, id) do nothing;
  if not found then
    select * into strict saved from public.individual_payments where family_id = family and id = request_id;
    if (saved.nurse_id, saved.paid_on, saved.amount_cents, saved.actor_id)
      is distinct from (nurse, day, cents, auth.uid()) then
      raise exception using errcode = 'PT409', message = 'request id already used';
    end if;
    return saved.id;
  end if;

  for eligible in
    select s.id, (s.cost_cents - coalesce(sum(a.amount_cents), 0))::bigint as due
    from public.shifts s
    left join public.individual_allocations a on a.family_id = s.family_id and a.shift_id = s.id
    where s.family_id = family and s.nurse_id = nurse and s.service_day <= day
    group by s.id, s.service_day, s.cost_cents
    having s.cost_cents > coalesce(sum(a.amount_cents), 0)
    order by s.service_day, s.id
  loop
    applied := least(eligible.due, remaining);
    insert into public.individual_allocations(family_id, nurse_id, payment_id, shift_id, amount_cents)
    values (family, nurse, request_id, eligible.id, applied);
    remaining := remaining - applied;
    exit when remaining = 0;
  end loop;
  if remaining <> 0 then
    raise exception using errcode = 'PT422', message = 'payment exceeds eligible balance';
  end if;
  return request_id;
end
$$;

revoke execute on function public.record_individual_payment(uuid,uuid,uuid,date,bigint) from public, anon, authenticated;
grant execute on function public.record_individual_payment(uuid,uuid,uuid,date,bigint) to authenticated;

commit;
