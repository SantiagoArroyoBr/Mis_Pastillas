begin;

create table public.inventory_profiles (
  family_id uuid not null,
  item_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  consumptions jsonb not null check (acompana_private.valid_consumptions(consumptions)),
  primary key (family_id,item_id),
  foreign key (family_id,item_id) references public.inventory_items(family_id,id)
);

create table public.inventory_quotes (
  family_id uuid not null,
  id uuid not null,
  item_id uuid not null,
  quantity numeric not null check (quantity between 5e-324 and 1.7976931348623157e308),
  total_price numeric not null check (total_price between 0 and 1.7976931348623157e308),
  quoted_on date not null check (isfinite(quoted_on)),
  shop text not null check (char_length(shop) <= 40),
  actor_id uuid not null references auth.users(id),
  primary key (family_id,id),
  foreign key (family_id,item_id) references public.inventory_items(family_id,id)
);

alter table public.inventory_profiles enable row level security;
alter table public.inventory_quotes enable row level security;
create policy inventory_profiles_read on public.inventory_profiles for select to authenticated
  using (acompana_private.family_role(family_id) is not null);
create policy inventory_quotes_read on public.inventory_quotes for select to authenticated
  using (acompana_private.family_role(family_id) is not null);
revoke all on public.inventory_profiles, public.inventory_quotes from public, anon, authenticated;
grant select on public.inventory_profiles, public.inventory_quotes to authenticated;

create function public.edit_inventory_item(family uuid, item uuid, expected_revision integer,
  item_name text, quantity numeric, counted_at bigint, schedules jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  current_item public.inventory_items;
begin
  perform acompana_private.require_member(family);
  select * into current_item from public.inventory_items where family_id = family and id = item for update;
  if not found then raise exception using errcode = 'PT422', message = 'inventory item unavailable'; end if;
  perform acompana_private.require_active_patient(family,current_item.patient_id);
  if current_item.revision is distinct from expected_revision or counted_at < current_item.base_at then
    raise exception using errcode = 'PT409', message = 'inventory revision changed';
  end if;
  insert into public.inventory_profiles(family_id,item_id,name,consumptions)
  values (family,item,btrim(item_name),schedules)
  on conflict (family_id,item_id) do update set name = excluded.name, consumptions = excluded.consumptions;
  update public.inventory_items set base_quantity = quantity, base_at = counted_at, revision = revision + 1
    where family_id = family and id = item;
  return current_item.revision + 1;
end
$$;

create function public.record_inventory_quote(family uuid, request_id uuid, item uuid,
  quantity numeric, price numeric, day date, shop_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  saved public.inventory_quotes;
  patient uuid;
begin
  perform acompana_private.require_member(family);
  shop_name := btrim(coalesce(shop_name,''));
  select * into saved from public.inventory_quotes where family_id = family and id = request_id;
  if not found then
    select patient_id into patient from public.inventory_items where family_id = family and id = item;
    perform acompana_private.require_active_patient(family,patient);
    insert into public.inventory_quotes(family_id,id,item_id,quantity,total_price,quoted_on,shop,actor_id)
    values (family,request_id,item,quantity,price,day,shop_name,auth.uid())
    on conflict (family_id,id) do nothing;
    select * into strict saved from public.inventory_quotes where family_id = family and id = request_id;
  end if;
  if (saved.item_id,saved.quantity,saved.total_price,saved.quoted_on,saved.shop,saved.actor_id)
    is distinct from (item,quantity,price,day,shop_name,auth.uid()) then
    raise exception using errcode = 'PT409', message = 'request id already used';
  end if;
  return saved.id;
end
$$;

revoke execute on function public.edit_inventory_item(uuid,uuid,integer,text,numeric,bigint,jsonb),
  public.record_inventory_quote(uuid,uuid,uuid,numeric,numeric,date,text) from public, anon, authenticated;
grant execute on function public.edit_inventory_item(uuid,uuid,integer,text,numeric,bigint,jsonb),
  public.record_inventory_quote(uuid,uuid,uuid,numeric,numeric,date,text) to authenticated;

commit;
