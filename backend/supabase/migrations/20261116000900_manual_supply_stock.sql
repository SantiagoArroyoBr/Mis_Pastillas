begin;

alter table public.inventory_items drop constraint inventory_items_consumptions_check;
alter table public.inventory_items add constraint inventory_items_consumptions_check
  check (acompana_private.valid_consumptions(consumptions) or (kind = 'sup' and consumptions = '[]'::jsonb));

alter table public.inventory_profiles drop constraint inventory_profiles_consumptions_check;
alter table public.inventory_profiles add constraint inventory_profiles_consumptions_check
  check (acompana_private.valid_consumptions(consumptions) or consumptions = '[]'::jsonb);

create function acompana_private.require_supply_for_manual_stock()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.consumptions = '[]'::jsonb and not exists (
    select 1 from public.inventory_items i
    where i.family_id = new.family_id and i.id = new.item_id and i.kind = 'sup'
  ) then
    raise exception using errcode = '23514', message = 'only supplies permit manual stock';
  end if;
  return new;
end
$$;
revoke execute on function acompana_private.require_supply_for_manual_stock() from public, anon, authenticated;
create trigger inventory_profile_manual_stock before insert or update on public.inventory_profiles
  for each row execute function acompana_private.require_supply_for_manual_stock();

commit;
