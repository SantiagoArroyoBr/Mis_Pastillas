const $ = id => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('sv-SE');

export function inventoryNumber(input, label, positive = false) {
  const value = input.trim();
  const number = Number(value.replace(',', '.'));
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value) || !Number.isFinite(number) || (positive && number === 0)) {
    throw new Error('Revisa ' + label + '.');
  }
  return number;
}

export function remainingStock(domain, item, now) {
  return domain.calc({ base: item.base_quantity, t0: item.base_at, cons: item.consumptions }, now).rem;
}

export function createInventory({ run, status }) {
  const add = $('add-inventory');
  const buy = $('inventory-purchase');
  const purchaseItem = buy.elements.namedItem('item');
  const schedules = $('inventory-schedules');
  const history = $('inventory-purchases');
  const toggle = $('inventory-price-toggle');
  let client, family, patients = [], items = [], pendingAdd, pendingBuy, timer;

  function showPrices(visible) {
    clearTimeout(timer);
    timer = visible ? setTimeout(() => showPrices(false), 30000) : undefined;
    toggle.textContent = visible ? 'Ocultar montos' : 'Ver montos';
    toggle.setAttribute('aria-pressed', String(visible));
    for (const price of history.querySelectorAll('[data-price]')) {
      price.textContent = visible ? window.AcompanaDomain.money(Number(price.dataset.price)) : '••••';
    }
  }

  function updateRemoveButtons() {
    for (const button of schedules.querySelectorAll('[data-remove]')) button.disabled = schedules.childElementCount <= 1;
  }

  function addSchedule(focus = false) {
    const row = $('inventory-schedule').content.firstElementChild.cloneNode(true);
    const frequency = row.querySelector('[data-field=frequency]');
    frequency.addEventListener('change', () => {
      for (const group of row.querySelectorAll('[data-group]')) group.hidden = group.dataset.group !== frequency.value;
    });
    row.querySelector('[data-remove]').addEventListener('click', () => {
      row.remove();
      updateRemoveButtons();
      $('add-schedule').focus();
    });
    schedules.append(row);
    updateRemoveButtons();
    if (focus) row.querySelector('[data-field=dose]').focus();
  }

  function readSchedules() {
    const domain = window.AcompanaDomain;
    return Array.from(schedules.children, row => {
      const value = name => row.querySelector('[data-field=' + name + ']').value;
      const dose = inventoryNumber(value('dose'), 'la cantidad por toma', true);
      const times = domain.parseTimes(value('times'));
      if (!times?.length) throw new Error('Escribe horas válidas separadas por comas.');
      const type = value('frequency');
      const schedule = { type };
      if (type === 'weekdays') {
        schedule.days = Array.from(row.querySelectorAll('input:checked'), input => Number(input.value));
        if (!schedule.days.length) throw new Error('Elige al menos un día de la semana.');
      } else if (type === 'interval') {
        schedule.n = Number(value('interval'));
        schedule.start = domain.pd(value('start')).getTime();
        if (!Number.isSafeInteger(schedule.n) || schedule.n < 1 || !(schedule.start > 0)) {
          throw new Error('Indica un intervalo y una fecha de inicio válidos.');
        }
      }
      return { dose, times, schedule };
    });
  }

  function resetAdd() {
    add.reset();
    schedules.replaceChildren();
    addSchedule();
  }

  function scope(nextFamily) {
    if (nextFamily === family) return;
    family = nextFamily;
    client = pendingAdd = pendingBuy = undefined;
    items = patients = [];
    resetAdd();
    buy.reset();
    add.elements.patient.replaceChildren();
    purchaseItem.replaceChildren();
    $('inventory-items').replaceChildren();
    history.replaceChildren();
    showPrices(false);
  }

  async function load(nextClient, nextFamily, nextPatients) {
    scope(nextFamily);
    client = nextClient;
    patients = nextPatients;
    const filter = { family_id: 'eq.' + family };
    const [available, purchases] = await Promise.all([
      client.select('inventory_items', { ...filter,
        select: 'id,patient_id,name,kind,base_quantity,base_at,consumptions,revision,patients(name,archived_at)',
        order: 'name.asc,id.asc' }),
      client.select('inventory_purchases', { ...filter, select: 'quantity,total_price,purchased_on,shop,inventory_items(name,patients(name))',
        order: 'purchased_on.desc,observed_at.desc,id.desc', limit: 20 })
    ]);
    items = available;
    const domain = window.AcompanaDomain;
    const now = Date.now();
    const active = patients.filter(patient => !patient.archived_at);
    const patientNames = new Map();
    for (const patient of patients) patientNames.set(patient.name, (patientNames.get(patient.name) ?? 0) + 1);
    const patientLabel = (id, name) => name + (patientNames.get(name) > 1 ? ' · ' + id.slice(0, 8) : '');
    const oldPatient = add.elements.patient.value;
    add.elements.patient.replaceChildren(...active.map(row => new Option(patientLabel(row.id, row.name), row.id)));
    if (active.some(row => row.id === oldPatient)) add.elements.patient.value = oldPatient;
    $('save-inventory').disabled = !active.length;
    const oldItem = purchaseItem.value;
    const purchasable = items.filter(row => !row.patients.archived_at);
    purchaseItem.replaceChildren(...purchasable.map(row => new Option(
      row.name + ' · ' + patientLabel(row.patient_id, row.patients.name) + ' · ' + row.id.slice(0, 8), row.id
    )));
    if (purchasable.some(row => row.id === oldItem)) purchaseItem.value = oldItem;
    buy.querySelector('button').disabled = !purchasable.length;
    $('inventory-items').replaceChildren(...items.map(row => {
      const item = document.createElement('li');
      const count = row.consumptions.length;
      item.textContent = row.name + ' · ' + patientLabel(row.patient_id, row.patients.name)
        + (row.patients.archived_at ? ' (archivada)' : '') + ' · ' + remainingStock(domain, row, now)
        + ' unidades · ' + count + (count === 1 ? ' pauta' : ' pautas');
      return item;
    }));
    history.replaceChildren(...purchases.map(row => {
      const item = document.createElement('li');
      const product = row.inventory_items;
      item.textContent = [row.purchased_on, product.name, product.patients.name, row.quantity + ' unidades', row.shop]
        .filter(Boolean).join(' · ');
      if (row.total_price !== null) {
        const price = document.createElement('span');
        price.dataset.price = row.total_price;
        item.append(' · ', price);
      }
      return item;
    }));
    toggle.disabled = !purchases.some(row => row.total_price !== null);
    showPrices(false);
  }

  async function refreshAfterWrite(message) {
    try {
      await load(client, family, patients);
      status(message);
    } catch {
      buy.querySelector('button').disabled = true;
      status(message + ' Usa Actualizar fichas para recargar el inventario.');
    }
  }

  $('add-schedule').addEventListener('click', () => addSchedule(true));
  toggle.addEventListener('click', () => showPrices(!timer));
  add.addEventListener('submit', run(async () => {
    const form = new FormData(add);
    const args = {
      family, patient: form.get('patient'), item_name: form.get('name').trim(), item_kind: form.get('kind'),
      quantity: inventoryNumber(form.get('quantity'), 'la cantidad actual'), schedules: readSchedules()
    };
    if (!args.item_name) throw new Error('Escribe el nombre del artículo.');
    const key = JSON.stringify(args);
    if (pendingAdd?.key !== key) pendingAdd = { key, id: crypto.randomUUID(), stamp: Date.now() };
    await client.rpc('add_inventory_item', { ...args, counted_at: pendingAdd.stamp, request_id: pendingAdd.id });
    pendingAdd = undefined;
    resetAdd();
    await refreshAfterWrite('Artículo guardado.');
  }));
  buy.addEventListener('submit', run(async () => {
    const form = new FormData(buy);
    const item = items.find(row => row.id === form.get('item'));
    if (!item) return;
    const price = form.get('price').trim();
    const args = { family, item: item.id, quantity: inventoryNumber(form.get('quantity'), 'la cantidad comprada', true),
      price: price ? inventoryNumber(price, 'el precio total') : null, shop_name: form.get('shop').trim() };
    const key = JSON.stringify(args);
    if (pendingBuy?.key !== key) {
      const now = Date.now();
      pendingBuy = { key, args: { ...args, request_id: crypto.randomUUID(), counted_at: now, day: dateFormat.format(now),
        expected_revision: item.revision, remaining: remainingStock(window.AcompanaDomain, item, now) } };
    }
    try {
      await client.rpc('record_inventory_purchase', pendingBuy.args);
    } catch (error) {
      if (error.status === 409 || error.code === 'PT409') pendingBuy = undefined;
      throw error;
    }
    pendingBuy = undefined;
    buy.reset();
    await refreshAfterWrite('Compra registrada.');
  }));
  return { load, scope };
}
