begin;

create function public.financial_balance(family uuid, as_of date)
returns table(cost_cents text, received_cents text, balance_cents text)
language plpgsql security definer set search_path = ''
as $$
begin
  perform acompana_private.require_member(family, true);
  if as_of is null then
    raise exception using errcode = '22023', message = 'cutoff date required';
  end if;
  return query
    with costs as (
      select coalesce(sum(s.cost_cents), 0) as amount
      from public.shifts s
      where s.family_id = family and s.service_day <= as_of
    ), payments as (
      select coalesce(sum(r.amount_cents), 0) as amount
      from public.receipts r
      where r.family_id = family and not exists (
        select 1 from public.receipt_cancellations c
        where c.family_id = r.family_id and c.receipt_id = r.id
      )
    )
    select costs.amount::text, payments.amount::text, (costs.amount - payments.amount)::text
    from costs cross join payments;
end
$$;

revoke execute on function public.financial_balance(uuid,date) from public, anon, authenticated;
grant execute on function public.financial_balance(uuid,date) to authenticated;

commit;
