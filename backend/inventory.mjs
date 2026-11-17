const $ = id => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('sv-SE');
const projectionFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export function inventoryNumber(input, label, positive = false) {
  const value = input.trim();
  const number = Number(value.replace(',', '.'));
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value) || !Number.isFinite(number) || (positive && number === 0)) {
    throw new Error('Revisa ' + label + '.');
  }
  return number;
}

function projectStock(domain, item, now) {
  return domain.calc({ base: item.base_quantity, t0: item.base_at, cons: item.consumptions }, now);
}

export function remainingStock(domain, item, now) {
  return projectStock(domain, item, now).rem;
}

export function stockMessage(domain, stock) {
  if (stock.rem === 0) return 'Agotado';
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

function loadInventoryQuotes(client, family, patient) {
  return client.select('inventory_quotes', {
    family_id: 'eq.' + family, ...(patient && { 'inventory_items.patient_id': 'eq.' + patient }),
    select: 'quantity,total_price,quoted_on,shop,inventory_items!inner(id,name,patient_id,patients(name))',
    order: 'quoted_on.desc,id.desc', limit: 20
  });
}

export function createInventory({ run, status }) {
  const add = $('add-inventory');
  const buy = $('inventory-purchase');
  const purchaseItem = buy.elements.namedItem('item');
  const schedules = $('inventory-schedules');
  const history = $('inventory-purchases');
  const patientFilter = $('inventory-filter');
  const toggle = $('inventory-price-toggle');
  let client, family, patients = [], items = [], pendingAdd, pendingBuy, timer;
  let visiblePatient = '', patientNames = new Map();
  let editDraft;
  const openDetails = new Set();
  const patientLabel = (id, name) => name + (patientNames.get(name) > 1 ? ' · ' + id.slice(0, 8) : '');

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
    frequency.addEventListener('change', () => {
      for (const group of row.querySelectorAll('[data-group]')) group.hidden = group.dataset.group !== frequency.value;
    });
    if (consumption) {
      const { dose, times, schedule } = consumption;
      row.querySelector('[data-field=dose]').value = dose;
      row.querySelector('[data-field=times]').value = times.join(', ');
      frequency.value = schedule.type;
      frequency.dispatchEvent(new Event('change'));
      for (const field of row.querySelectorAll('[type=checkbox]')) field.checked = schedule.days?.includes(Number(field.value)) ?? false;
      if (schedule.type === 'interval') {
        row.querySelector('[data-field=interval]').value = schedule.n;
        row.querySelector('[data-field=start]').value = dateFormat.format(schedule.start);
      }
    }
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
    editDraft = undefined;
    add.reset();
    add.elements.patient.disabled = add.elements.kind.disabled = false;
    $('cancel-inventory-edit').hidden = true;
    $('save-inventory').textContent = 'Guardar artículo';
    schedules.replaceChildren();
    addSchedule();
  }

  function startEdit(item, stock) {
    if (editDraft && !confirm('¿Descartar el borrador de inventario abierto?')) return;
    editDraft = { item: item.id, revision: item.revision };
    add.elements.patient.value = item.patient_id;
    add.elements.kind.value = item.kind;
    add.elements.patient.disabled = add.elements.kind.disabled = true;
    add.elements.name.value = item.name;
    add.elements.quantity.value = stock.rem;
    schedules.replaceChildren();
    for (const consumption of item.consumptions) addSchedule(false, consumption);
    $('save-inventory').textContent = 'Guardar cambios';
    $('cancel-inventory-edit').hidden = false;
    add.elements.name.focus();
  }

  async function movements(patient) {
    const [purchases, quotes] = await Promise.all([
      loadInventoryPurchases(client, family, patient), loadInventoryQuotes(client, family, patient)
    ]);
    return [...purchases, ...quotes].sort((a, b) =>
      (b.purchased_on ?? b.quoted_on).localeCompare(a.purchased_on ?? a.quoted_on));
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
    showPrices(false);
  }

  async function load(nextClient, nextFamily, nextPatients) {
    scope(nextFamily);
    client = nextClient;
    patients = nextPatients;
    const filter = { family_id: 'eq.' + family };
    const [available, purchases] = await Promise.all([
      client.select('inventory_items', { ...filter,
        select: 'id,patient_id,name,kind,base_quantity,base_at,consumptions,revision,patients(name,archived_at),inventory_profiles(name,consumptions)',
        order: 'name.asc,id.asc' }),
      movements(visiblePatient)
    ]);
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
    const oldItem = purchaseItem.value;
    const purchasable = items.filter(row => !row.patients.archived_at);
    purchaseItem.replaceChildren(...purchasable.map(row => new Option(
      row.name + ' · ' + patientLabel(row.patient_id, row.patients.name) + ' · ' + row.id.slice(0, 8), row.id
    )));
    if (purchasable.some(row => row.id === oldItem)) purchaseItem.value = oldItem;
    buy.querySelector('button').disabled = !purchasable.length;
    renderLists(purchases);
  }

  function renderLists(purchases) {
    const domain = window.AcompanaDomain;
    const now = Date.now();
    const visible = visiblePatient ? items.filter(row => row.patient_id === visiblePatient) : items;
    const stockRows = visible.map(row => {
      const item = document.createElement('li');
      const count = row.consumptions.length;
      const stock = projectStock(domain, row, now);
      item.textContent = row.name + ' · ' + patientLabel(row.patient_id, row.patients.name)
        + (row.patients.archived_at ? ' (archivada)' : '') + ' · ' + stock.rem
        + ' unidades · ' + count + (count === 1 ? ' pauta' : ' pautas');
      if (!row.patients.archived_at) item.append(' · ' + stockMessage(domain, stock));
      const details = document.createElement('details');
      details.open = openDetails.has(row.id);
      const summary = document.createElement('summary');
      summary.textContent = 'Ver pautas';
      summary.setAttribute('aria-label', 'Ver pautas de ' + row.name + ' · ' + patientLabel(row.patient_id, row.patients.name));
      const list = document.createElement('ul');
      list.replaceChildren(...row.consumptions.map(consumption => {
        const entry = document.createElement('li');
        entry.textContent = formatConsumption(domain, consumption);
        return entry;
      }));
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
      item.append(details);
      if (!row.patients.archived_at) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Editar artículo';
        edit.addEventListener('click', run(() => startEdit(row, projectStock(domain, row, Date.now()))));
        item.append(edit);
      }
      return item;
    });
    const purchaseRows = purchases.map(row => {
      const item = document.createElement('li');
      const product = row.inventory_items;
      const name = items.find(entry => entry.id === product.id)?.name ?? product.name;
      item.textContent = [row.purchased_on ?? row.quoted_on, row.quoted_on ? 'Cotización' : 'Compra', name,
        patientLabel(product.patient_id, product.patients.name),
        row.quantity + ' unidades', row.shop]
        .filter(Boolean).join(' · ');
      if (row.total_price !== null) {
        const price = document.createElement('span');
        price.dataset.price = row.total_price;
        item.append(' · ', price);
      }
      return item;
    });
    for (const [list, rows, emptyText] of [
      [$('inventory-items'), stockRows, 'No hay artículos para esta selección.'],
      [history, purchaseRows, 'No hay compras ni cotizaciones para esta selección.']
    ]) {
      if (!rows.length) {
        const empty = document.createElement('li');
        empty.textContent = emptyText;
        rows.push(empty);
      }
      list.replaceChildren(...rows);
    }
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
  $('cancel-inventory-edit').addEventListener('click', resetAdd);
  buy.elements.mode.addEventListener('change', () => {
    $('save-inventory-movement').textContent = buy.elements.mode.value === 'quote' ? 'Guardar cotización' : 'Registrar compra';
  });
  patientFilter.addEventListener('change', run(async () => {
    const chosen = patientFilter.value;
    try {
      const purchases = await movements(chosen);
      visiblePatient = chosen;
      renderLists(purchases);
      status('Inventario filtrado.');
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
    $('save-inventory-movement').textContent = 'Registrar compra';
    await refreshAfterWrite(isQuote ? 'Cotización guardada.' : 'Compra registrada.');
  }));
  return { load, scope };
}
