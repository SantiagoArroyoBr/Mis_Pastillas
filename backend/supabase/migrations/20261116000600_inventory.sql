begin;

create function acompana_private.valid_consumptions(entries jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  entry jsonb;
  schedule jsonb;
  weekday jsonb;
  hour text;
begin
  if jsonb_typeof(entries) is distinct from 'array' then return false; end if;
  if jsonb_array_length(entries) = 0 then return false; end if;
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry->'dose') is distinct from 'number'
       or jsonb_typeof(entry->'times') is distinct from 'array' then return false; end if;
    if (entry->>'dose')::numeric not between 5e-324 and 1.7976931348623157e308
       or jsonb_array_length(entry->'times') = 0 then return false; end if;
    for hour in select value from jsonb_array_elements_text(entry->'times') loop
      if hour is null or hour !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    end loop;
    schedule := entry->'schedule';
    case schedule->>'type'
      when 'daily' then null;
      when 'weekdays' then
        if jsonb_typeof(schedule->'days') is distinct from 'array' then return false; end if;
        if jsonb_array_length(schedule->'days') = 0 then return false; end if;
        for weekday in select value from jsonb_array_elements(schedule->'days') loop
          if weekday::text !~ '^[0-6]$' then return false; end if;
        end loop;
      when 'interval' then
        if coalesce((schedule->'n')::text, '') !~ '^[1-9][0-9]*$'
           or coalesce((schedule->'start')::text, '') !~ '^[1-9][0-9]*$' then return false; end if;
        if (schedule->>'n')::numeric > 9007199254740991
           or (schedule->>'start')::numeric > 8640000000000000 then return false; end if;
      else return false;
    end case;
  end loop;
  return true;
end
$$;

create table public.inventory_items (
  family_id uuid not null,
  id uuid not null,
  patient_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  kind text not null check (kind in ('medicine','sup')),
  initial_quantity numeric not null check (initial_quantity between 0 and 1.7976931348623157e308),
  initial_at bigint not null check (initial_at between 1 and 8640000000000000),
  base_quantity numeric not null check (base_quantity between 0 and 1.7976931348623157e308),
  base_at bigint not null check (base_at between 1 and 8640000000000000),
  consumptions jsonb not null check (acompana_private.valid_consumptions(consumptions)),
  revision integer not null default 1 check (revision > 0),
  actor_id uuid not null references auth.users(id),
  primary key (family_id,id),
  foreign key (family_id,patient_id) references public.patients(family_id,id)
);

create table public.inventory_purchases (
  family_id uuid not null,
  id uuid not null,
  item_id uuid not null,
  quantity numeric not null check (quantity between 5e-324 and 1.7976931348623157e308),
  total_price numeric check (total_price between 0 and 1.7976931348623157e308),
  purchased_on date not null check (isfinite(purchased_on)),
  shop text not null check (char_length(shop) <= 40),
  prior_revision integer not null check (prior_revision > 0),
  stock_before numeric not null check (stock_before between 0 and 1.7976931348623157e308),
  observed_at bigint not null check (observed_at between 1 and 8640000000000000),
  actor_id uuid not null references auth.users(id),
  primary key (family_id,id),
  foreign key (family_id,item_id) references public.inventory_items(family_id,id)
);

alter table public.inventory_items enable row level security;
alter table public.inventory_purchases enable row level security;
create policy inventory_items_read on public.inventory_items for select to authenticated
  using (acompana_private.family_role(family_id) is not null);
create policy inventory_purchases_read on public.inventory_purchases for select to authenticated
  using (acompana_private.family_role(family_id) is not null);
revoke all on public.inventory_items, public.inventory_purchases from public, anon, authenticated;
grant select on public.inventory_items, public.inventory_purchases to authenticated;

create function public.add_inventory_item(family uuid, request_id uuid, patient uuid,
  item_name text, item_kind text, quantity numeric, counted_at bigint, schedules jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved public.inventory_items;
begin
  perform acompana_private.require_member(family);
  select * into saved from public.inventory_items where family_id = family and id = request_id;
  if not found then
    perform acompana_private.require_active_patient(family,patient);
    insert into public.inventory_items(family_id,id,patient_id,name,kind,initial_quantity,initial_at,
      base_quantity,base_at,consumptions,actor_id)
    values (family,request_id,patient,btrim(item_name),item_kind,quantity,counted_at,quantity,counted_at,schedules,auth.uid())
    on conflict (family_id,id) do nothing;
    select * into strict saved from public.inventory_items where family_id = family and id = request_id;
  end if;
  if (saved.patient_id,saved.name,saved.kind,saved.initial_quantity,saved.initial_at,saved.consumptions,saved.actor_id)
     is distinct from (patient,btrim(item_name),item_kind,quantity,counted_at,schedules,auth.uid()) then
    raise exception using errcode = 'PT409', message = 'request id already used';
  end if;
  return saved.id;
end
$$;

create function public.record_inventory_purchase(family uuid, request_id uuid, item uuid,
  expected_revision integer, quantity numeric, price numeric, day date, shop_name text,
  remaining numeric, counted_at bigint)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  current_item public.inventory_items;
  saved public.inventory_purchases;
begin
  perform acompana_private.require_member(family);
  if expected_revision is null or remaining is null or counted_at is null then
    raise exception using errcode = '22023', message = 'stock observation and revision required';
  end if;
  shop_name := btrim(coalesce(shop_name,''));
  select * into current_item from public.inventory_items where family_id = family and id = item for update;
  if not found then raise exception using errcode = 'PT422', message = 'inventory item unavailable'; end if;
  insert into public.inventory_purchases(family_id,id,item_id,quantity,total_price,purchased_on,shop,
    prior_revision,stock_before,observed_at,actor_id)
  values (family,request_id,item,quantity,price,day,shop_name,expected_revision,remaining,counted_at,auth.uid())
  on conflict (family_id,id) do nothing;
  if not found then
    select * into strict saved from public.inventory_purchases where family_id = family and id = request_id;
    if (saved.item_id,saved.quantity,saved.total_price,saved.purchased_on,saved.shop,
        saved.prior_revision,saved.stock_before,saved.observed_at,saved.actor_id)
       is distinct from (item,quantity,price,day,shop_name,expected_revision,remaining,counted_at,auth.uid()) then
      raise exception using errcode = 'PT409', message = 'request id already used';
    end if;
    return saved.id;
  end if;
  perform acompana_private.require_active_patient(family,current_item.patient_id);
  if current_item.revision <> expected_revision or counted_at < current_item.base_at then
    raise exception using errcode = 'PT409', message = 'inventory revision changed';
  end if;
  if remaining > round(current_item.base_quantity, 2) then
    raise exception using errcode = '22023', message = 'stock observation exceeds checkpoint';
  end if;
  update public.inventory_items set base_quantity = remaining + quantity, base_at = counted_at, revision = revision + 1
    where family_id = family and id = item;
  return request_id;
end
$$;

revoke execute on function acompana_private.valid_consumptions(jsonb) from public, anon, authenticated;
revoke execute on function public.add_inventory_item(uuid,uuid,uuid,text,text,numeric,bigint,jsonb),
  public.record_inventory_purchase(uuid,uuid,uuid,integer,numeric,numeric,date,text,numeric,bigint) from public, anon, authenticated;
grant execute on function public.add_inventory_item(uuid,uuid,uuid,text,text,numeric,bigint,jsonb),
  public.record_inventory_purchase(uuid,uuid,uuid,integer,numeric,numeric,date,text,numeric,bigint) to authenticated;

commit;
