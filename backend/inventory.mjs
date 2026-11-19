import { readHistoryWindow, createHistoryControl, readCatalog } from './history.mjs';
const $ = id => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('sv-SE');
const projectionFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const itemFields = 'id,patient_id,name,kind,base_quantity,base_at,consumptions,revision,patients(name,archived_at),inventory_profiles(name,consumptions)';

export function inventoryNumber(input, label, positive = false) {
  const value = input.trim();
  const number = Number(value.replace(',', '.'));
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value) || !Number.isFinite(number) || (positive && number === 0)) {
    throw new Error('Revisa ' + label + '.');
  }
  return number;
}

export function projectStock(domain, item, now) {
  if (item.kind === 'sup' && !item.consumptions.length) {
    return { rem: Number(item.base_quantity), manual: true };
  }
  return domain.calc({ base: item.base_quantity, t0: item.base_at, cons: item.consumptions }, now);
}

export function remainingStock(domain, item, now) {
  return projectStock(domain, item, now).rem;
}

export function stockMessage(domain, stock) {
  if (stock.rem === 0) return 'Agotado';
  if (stock.manual) return 'Conteo manual';
  if (!stock.left) return 'Existencias insuficientes';
  if (stock.st === 'red') return 'Comprar hoy';
  if (stock.st === 'amber') return stock.now ? 'Comprar pronto' : 'Comprar antes del ' + domain.fmt(stock.buy);
  return 'Existencias suficientes';
}

export function formatConsumption(domain, row) {
  const { dose, times, schedule } = row;
  const start = schedule.type === 'interval' ? ' desde ' + dateFormat.format(schedule.start) : '';
  return domain.num(dose) + (dose === 1 ? ' unidad' : ' unidades') + ' · '
    + domain.schedText(schedule) + start + ' · ' + times.join(', ');
}

export function loadInventoryPurchases(client, family, patient = '') {
  return client.select('inventory_purchases', {
    family_id: 'eq.' + family,
    ...(patient && { 'inventory_items.patient_id': 'eq.' + patient }),
    select: 'quantity,total_price,purchased_on,shop,inventory_items!inner(id,name,patient_id,patients(name))',
    order: 'purchased_on.desc,observed_at.desc,id.desc', limit: 20
  });
}

export async function readInventoryHistory(client, family, patient = '', count = 20) {
  const filter = { family_id: 'eq.' + family, ...(patient && { 'inventory_items.patient_id': 'eq.' + patient }) };
  const join = 'inventory_items!inner(id,name,patient_id,patients(name))';
  const [purchases, quotes] = await Promise.all([
    readHistoryWindow(client, 'inventory_purchases', { ...filter,
      select: 'id,quantity,total_price,purchased_on,observed_at,shop,' + join,
      order: 'purchased_on.desc,observed_at.desc,id.desc' }, count),
    readHistoryWindow(client, 'inventory_quotes', { ...filter,
      select: 'id,quantity,total_price,quoted_on,shop,' + join, order: 'quoted_on.desc,id.desc' }, count)
  ]);
  const rows = [...purchases.rows, ...quotes.rows].sort((a, b) => {
    const observedA = BigInt(a.observed_at ?? 0), observedB = BigInt(b.observed_at ?? 0);
    return (b.purchased_on ?? b.quoted_on).localeCompare(a.purchased_on ?? a.quoted_on)
      || Number(Boolean(b.quoted_on)) - Number(Boolean(a.quoted_on))
      || (observedA === observedB ? 0 : observedA < observedB ? 1 : -1)
      || b.id.localeCompare(a.id);
  });
  return { rows: rows.slice(0, count), hasMore: rows.length > count || purchases.hasMore || quotes.hasMore };
}

export function createInventory({ run, status, renderTable, onChange }) {
  const add = $('add-inventory');
  const buy = $('inventory-purchase');
  const purchaseItem = buy.elements.namedItem('item');
  const schedules = $('inventory-schedules');
  const history = $('inventory-purchases');
  const patientFilter = $('inventory-filter');
  const toggle = $('inventory-price-toggle');
  const medicineButton = $('open-inventory-medicine');
  const supplyButton = $('open-inventory-supply');
  const manual = $('inventory-manual-stock');
  const calendarSelection = $('calendar-opened-item');
  let client, family, patients = [], items = [], pendingAdd, pendingBuy, timer;
  let visiblePatient = '', patientNames = new Map();
  let editDraft;
  const openDetails = new Set();
  const patientLabel = (id, name) => name + (patientNames.get(name) > 1 ? ' · ' + id.slice(0, 8) : '');
  const movementPages = createHistoryControl(history, 'compras y cotizaciones', run,
    next => load(client, family, patients, next));

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

  function addSchedule(focus = false, consumption) {
    const row = $('inventory-schedule').content.firstElementChild.cloneNode(true);
    const frequency = row.querySelector('[data-field=frequency]');
    const updateFrequency = () => {
      for (const group of row.querySelectorAll('[data-group]')) group.hidden = group.dataset.group !== frequency.value;
    };
    frequency.addEventListener('change', updateFrequency);
    const supply = add.elements.kind.value === 'sup';
    if (supply) {
      row.querySelector('legend').textContent = 'Uso estimado';
      row.querySelector('[data-usage-label]').textContent = 'Piezas por uso';
      row.querySelector('[data-frequency-label]').textContent = 'Frecuencia estimada de uso';
      row.querySelector('[data-times-label]').hidden = true;
      frequency.value = 'interval';
      row.querySelector('[data-field=start]').value = dateFormat.format(new Date());
    }
    if (consumption) {
      const { dose, times, schedule } = consumption;
      row.querySelector('[data-field=dose]').value = dose;
      row.querySelector('[data-field=times]').value = times.join(', ');
      frequency.value = schedule.type;
      for (const field of row.querySelectorAll('[type=checkbox]')) field.checked = schedule.days?.includes(Number(field.value)) ?? false;
      if (schedule.type === 'interval') {
        row.querySelector('[data-field=interval]').value = schedule.n;
        row.querySelector('[data-field=start]').value = dateFormat.format(schedule.start);
      }
    }
    updateFrequency();
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
    if (add.elements.kind.value === 'sup' && manual.checked) return [];
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

  function updateStockMode() {
    const manualMode = add.elements.kind.value === 'sup' && manual.checked;
    $('inventory-schedule-entry').hidden = manualMode;
    for (const field of schedules.querySelectorAll('input, select')) field.disabled = manualMode;
  }

  function resetAdd() {
    editDraft = undefined;
    add.reset();
    add.elements.patient.disabled = false;
    add.hidden = true;
    medicineButton.setAttribute('aria-expanded', 'false');
    supplyButton.setAttribute('aria-expanded', 'false');
    schedules.replaceChildren();
    updateStockMode();
  }

  function openEntry(kind, editing = false) {
    const supply = kind === 'sup';
    add.elements.kind.value = kind;
    add.hidden = false;
    medicineButton.setAttribute('aria-expanded', String(!supply));
    supplyButton.setAttribute('aria-expanded', String(supply));
    $('inventory-entry-heading').textContent = (editing ? 'Editar ' : 'Nueva ') + (supply ? (editing ? 'insumo' : 'entrada de insumo') : 'medicina');
    $('inventory-entry-name').textContent = supply ? 'Nombre del insumo' : 'Nombre de la medicina';
    $('inventory-entry-quantity').textContent = supply ? 'Piezas disponibles' : 'Cantidad actual';
    $('save-inventory').textContent = editing ? 'Guardar cambios' : supply ? 'Guardar insumo' : 'Guardar medicina';
    $('inventory-manual-label').hidden = !supply;
    manual.checked = supply && !editing;
    updateStockMode();
  }

  function startEdit(item, stock) {
    if (!add.hidden && (editDraft || add.elements.name.value || add.elements.quantity.value)
        && !confirm('¿Descartar el borrador de inventario abierto?')) return;
    editDraft = { item: item.id, revision: item.revision };
    openEntry(item.kind, true);
    add.elements.patient.value = item.patient_id;
    add.elements.patient.disabled = true;
    add.elements.name.value = item.name;
    add.elements.quantity.value = stock.rem;
    schedules.replaceChildren();
    for (const consumption of item.consumptions) addSchedule(false, consumption);
    if (!item.consumptions.length) addSchedule();
    manual.checked = item.kind === 'sup' && !item.consumptions.length;
    updateStockMode();
    add.elements.name.focus();
  }

  async function movements(patient, count = movementPages.count) {
    return readInventoryHistory(client, family, patient, count);
  }

  function scope(nextFamily) {
    if (nextFamily === family) return;
    family = nextFamily;
    client = pendingAdd = pendingBuy = undefined;
    items = patients = [];
    visiblePatient = '';
    patientNames.clear();
    openDetails.clear();
    resetAdd();
    buy.reset();
    $('save-inventory-movement').textContent = 'Registrar compra';
    add.elements.patient.replaceChildren();
    purchaseItem.replaceChildren();
    patientFilter.replaceChildren();
    $('inventory-items').replaceChildren();
    history.replaceChildren();
    movementPages.reset();
    clearCalendarSelection();
    showPrices(false);
  }

  async function load(nextClient, nextFamily, nextPatients, count) {
    scope(nextFamily);
    client = nextClient;
    patients = nextPatients;
    const filter = { family_id: 'eq.' + family };
    const requested = count ?? movementPages.count;
    const [available, purchasePage] = await Promise.all([
      readCatalog(client,'inventory_items', { ...filter,
        select: itemFields,
        order: 'name.asc,id.asc' }),
      movements(visiblePatient, requested)
    ]);
    if (family !== nextFamily || client !== nextClient) return;
    items = available.map(row => ({ ...row, ...row.inventory_profiles }));
    const active = patients.filter(patient => !patient.archived_at);
    patientNames = new Map();
    for (const patient of patients) patientNames.set(patient.name, (patientNames.get(patient.name) ?? 0) + 1);
    patientFilter.replaceChildren(new Option('Todas las fichas', ''), ...patients.map(row => new Option(
      patientLabel(row.id, row.name) + (row.archived_at ? ' (archivada)' : ''), row.id
    )));
    patientFilter.value = visiblePatient;
    const oldPatient = add.elements.patient.value;
    add.elements.patient.replaceChildren(...active.map(row => new Option(patientLabel(row.id, row.name), row.id)));
    if (active.some(row => row.id === oldPatient)) add.elements.patient.value = oldPatient;
    $('save-inventory').disabled = !active.length;
    medicineButton.disabled = supplyButton.disabled = !active.length;
    const oldItem = purchaseItem.value;
    const purchasable = items.filter(row => !row.patients.archived_at);
    purchaseItem.replaceChildren(...purchasable.map(row => new Option(
      row.name + ' · ' + patientLabel(row.patient_id, row.patients.name) + ' · ' + row.id.slice(0, 8), row.id
    )));
    if (purchasable.some(row => row.id === oldItem)) purchaseItem.value = oldItem;
    buy.querySelector('button').disabled = !purchasable.length;
    renderLists(purchasePage.rows);
    movementPages.update(purchasePage, requested);
  }

  async function openItem(id, navigate) {
    const [row] = await client.select('inventory_items', { family_id: 'eq.' + family, id: 'eq.' + id, select: itemFields });
    if (!row) throw new Error('El artículo ya no está disponible.');
    const item = { ...row, ...row.inventory_profiles };
    if (!item.patients.archived_at && purchaseItem.value !== item.id) {
      const hasDraft = buy.elements.quantity.value || buy.elements.price.value || buy.elements.shop.value;
      if (hasDraft && !confirm('¿Descartar el borrador de la compra abierta?')) return;
      buy.reset();
      $('save-inventory-movement').textContent = 'Registrar compra';
    }
    items = [...items.filter(entry => entry.id !== item.id), item];
    const label = item.name + ' · ' + patientLabel(item.patient_id, item.patients.name);
    const selection = calendarSelection;
    selection.textContent = label + ' · ' + window.AcompanaDomain.num(remainingStock(window.AcompanaDomain, item, Date.now()))
      + ' unidades' + (item.patients.archived_at ? ' · Ficha archivada' : '');
    selection.hidden = false;
    navigate();
    if (!item.patients.archived_at) {
      if (!Array.from(purchaseItem.options).some(option => option.value === item.id)) {
        purchaseItem.add(new Option(label, item.id));
      }
      purchaseItem.value = item.id;
      buy.querySelector('button').disabled = false;
      purchaseItem.focus();
    } else {
      selection.tabIndex = -1;
      selection.focus();
    }
  }

  function clearCalendarSelection() {
    calendarSelection.hidden = true;
    calendarSelection.textContent = '';
  }

  function renderLists(purchases) {
    const domain = window.AcompanaDomain;
    const now = Date.now();
    const visible = visiblePatient ? items.filter(row => row.patient_id === visiblePatient) : items;
    const stockRows = visible.map(row => {
      const stock = projectStock(domain, row, now);
      const actions = document.createElement('div');
      const details = document.createElement('details');
      details.open = openDetails.has(row.id);
      const summary = document.createElement('summary');
      summary.textContent = stock.manual ? 'Ver conteo' : 'Ver pautas';
      summary.setAttribute('aria-label', summary.textContent + ' de ' + row.name + ' · ' + patientLabel(row.patient_id, row.patients.name));
      const list = document.createElement('ul');
      list.replaceChildren(...row.consumptions.map(consumption => {
        const entry = document.createElement('li');
        entry.textContent = formatConsumption(domain, consumption);
        return entry;
      }));
      if (stock.manual) {
        const entry = document.createElement('li');
        entry.textContent = 'Existencias contadas: ' + domain.num(stock.rem) + ' piezas.';
        list.append(entry);
      }
      details.append(summary, list);
      if (!row.patients.archived_at && stock.end) {
        const projection = document.createElement('p');
        projection.textContent = (row.kind === 'sup' ? 'Último uso completo proyectado: ' : 'Última toma completa proyectada: ')
          + projectionFormat.format(stock.end);
        details.append(projection);
      }
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) openDetails.add(row.id);
        else openDetails.delete(row.id);
      });
      actions.append(details);
      if (!row.patients.archived_at) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.dataset.icon = '✎';
        edit.textContent = 'Editar artículo';
        edit.addEventListener('click', run(() => startEdit(row, projectStock(domain, row, Date.now()))));
        actions.append(edit);
      }
      return [row.name, patientLabel(row.patient_id, row.patients.name), stock.rem + ' unidades',
        row.patients.archived_at ? 'Ficha archivada' : stockMessage(domain, stock), actions];
    });
    const purchaseRows = purchases.map(row => {
      const product = row.inventory_items;
      const name = items.find(entry => entry.id === product.id)?.name ?? product.name;
      let amount = 'Sin precio';
      if (row.total_price !== null) {
        amount = document.createElement('span');
        amount.dataset.price = row.total_price;
      }
      return [row.purchased_on ?? row.quoted_on, row.quoted_on ? 'Cotización' : 'Compra', name,
        patientLabel(product.patient_id, product.patients.name), row.quantity + ' unidades', row.shop || '—', amount];
    });
    renderTable($('inventory-items'), stockRows, 'No hay artículos para esta selección.');
    renderTable(history, purchaseRows, 'No hay compras ni cotizaciones para esta selección.');
    toggle.disabled = !purchases.some(row => row.total_price !== null);
    showPrices(false);
  }

  async function refreshAfterWrite(message) {
    try {
      await load(client, family, patients);
      await onChange();
      status(message);
    } catch {
      buy.querySelector('button').disabled = true;
      status(message + ' Usa Actualizar fichas para recargar el inventario.', 'warning');
    }
  }

  $('add-schedule').addEventListener('click', () => addSchedule(true));
  manual.addEventListener('change', updateStockMode);
  purchaseItem.addEventListener('change', clearCalendarSelection);
  $('cancel-inventory-edit').addEventListener('click', resetAdd);
  for (const [button, kind] of [[medicineButton, 'medicine'], [supplyButton, 'sup']]) {
    button.addEventListener('click', () => {
      if (!add.hidden && add.elements.kind.value === kind && !editDraft) return;
      if (!add.hidden && (editDraft || add.elements.name.value || add.elements.quantity.value)
          && !confirm('¿Descartar el borrador de inventario abierto?')) return;
      resetAdd();
      openEntry(kind);
      addSchedule();
      updateStockMode();
      add.elements.name.focus();
    });
  }
  buy.elements.mode.addEventListener('change', () => {
    $('save-inventory-movement').textContent = buy.elements.mode.value === 'quote' ? 'Guardar cotización' : 'Registrar compra';
  });
  patientFilter.addEventListener('change', run(async () => {
    const chosen = patientFilter.value;
    try {
      const purchases = await movements(chosen, 20);
      visiblePatient = chosen;
      renderLists(purchases.rows);
      movementPages.update(purchases, 20);
      status('Inventario filtrado.', 'info');
    } catch (error) {
      patientFilter.value = visiblePatient;
      throw error;
    }
  }));
  toggle.addEventListener('click', () => showPrices(!timer));
  add.addEventListener('submit', run(async () => {
    const form = new FormData(add);
    const args = {
      family, patient: form.get('patient'), item_name: form.get('name').trim(), item_kind: form.get('kind'),
      quantity: inventoryNumber(form.get('quantity'), 'la cantidad actual'), schedules: readSchedules()
    };
    if (!args.item_name) throw new Error('Escribe el nombre del artículo.');
    if (editDraft) {
      const { item, revision } = editDraft;
      await client.rpc('edit_inventory_item', {
        family, item, expected_revision: revision, item_name: args.item_name, quantity: args.quantity,
        counted_at: Date.now(), schedules: args.schedules
      });
      resetAdd();
      await refreshAfterWrite('Artículo actualizado.');
      return;
    }
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
    const isQuote = form.get('mode') === 'quote';
    if (isQuote && !price) throw new Error('Indica el precio total de la cotización.');
    const args = { family, item: item.id, quantity: inventoryNumber(form.get('quantity'), 'la cantidad comprada', true),
      price: price ? inventoryNumber(price, 'el precio total') : null, shop_name: form.get('shop').trim() };
    const key = JSON.stringify([isQuote, args]);
    if (pendingBuy?.key !== key) {
      const now = Date.now();
      pendingBuy = { key, args: { ...args, request_id: crypto.randomUUID(), day: dateFormat.format(now),
        ...(!isQuote && { counted_at: now, expected_revision: item.revision,
          remaining: remainingStock(window.AcompanaDomain, item, now) }) } };
    }
    try {
      await client.rpc(isQuote ? 'record_inventory_quote' : 'record_inventory_purchase', pendingBuy.args);
    } catch (error) {
      if (error.status === 409 || error.code === 'PT409') pendingBuy = undefined;
      throw error;
    }
    pendingBuy = undefined;
    buy.reset();
    clearCalendarSelection();
    $('save-inventory-movement').textContent = 'Registrar compra';
    await refreshAfterWrite(isQuote ? 'Cotización guardada.' : 'Compra registrada.');
  }));
  return { load, scope, openItem };
}
