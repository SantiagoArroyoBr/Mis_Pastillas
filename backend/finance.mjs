import { readHistoryWindow, createHistoryControl, readCatalog } from './history.mjs';
import { durableRequest } from './durable-requests.mjs';
const $ = id => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('sv-SE');
const integerFormat = new Intl.NumberFormat('es-MX');

export function parseCents(input, optional = false) {
  const value = input.trim();
  if (!value && optional) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    throw new Error('Escribe un monto con hasta dos decimales, sin separador de miles.');
  }
  const [whole, fraction = ''] = value.split(/[.,]/);
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || (!optional && cents === 0n)) {
    throw new Error('El monto está fuera del rango permitido.');
  }
  return cents.toString();
}

export function formatCents(value) {
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  return (cents < 0n ? '−' : '') + '$' + integerFormat.format(absolute / 100n)
    + '.' + (absolute % 100n).toString().padStart(2, '0') + ' MXN';
}

export function describeBalance(value) {
  const cents = BigInt(value);
  if (cents < 0n) return { label: 'Saldo a favor', amount: '+' + formatCents(-cents) };
  return {
    label: cents > 0n ? 'Saldo pendiente' : 'Sin saldo pendiente',
    amount: formatCents(-cents)
  };
}

function historyAmounts(list, button) {
  let timer;
  function show(visible) {
    clearTimeout(timer);
    timer = visible ? setTimeout(() => show(false), 30000) : undefined;
    button.textContent = visible ? 'Ocultar montos' : 'Ver montos';
    button.setAttribute('aria-pressed', String(visible));
    for (const amount of list.querySelectorAll('[data-cents]')) {
      amount.textContent = visible ? formatCents(amount.dataset.cents) : '••••';
    }
  }
  button.addEventListener('click', () => show(!timer));
  return () => show(false);
}

function historyAmount(cents) {
  const amount = document.createElement('span');
  amount.dataset.cents = cents;
  return amount;
}

export async function loadAppliedPayments(client, family, shifts) {
  const totals = new Map();
  if (!shifts.length) return totals;
  for (let offset = 0; offset < shifts.length; offset += 100) {
    const filter = {
      family_id: 'eq.' + family,
      shift_id: 'in.(' + shifts.slice(offset, offset + 100).map(shift => shift.id).join(',') + ')',
      select: 'payment_id,shift_id,amount_cents',
      order: 'payment_id.asc,shift_id.asc',
      limit: 500
    };
    let page;
    do {
      page = await client.select('individual_allocations', filter);
      for (const row of page) {
        totals.set(row.shift_id, (totals.get(row.shift_id) ?? 0n) + BigInt(row.amount_cents));
      }
      if (page.length) {
        const { payment_id: payment, shift_id: shift } = page.at(-1);
        filter.or = '(payment_id.gt.' + payment + ',and(payment_id.eq.' + payment + ',shift_id.gt.' + shift + '))';
      }
    } while (page.length === filter.limit);
  }
  return totals;
}

export async function loadReceiptCancellations(client, family, receipts) {
  const rows = [];
  for (let offset = 0; offset < receipts.length; offset += 100) {
    rows.push(...await client.select('receipt_cancellations', {
      family_id: 'eq.' + family, select: 'receipt_id,cancelled_on',
      receipt_id: 'in.(' + receipts.slice(offset, offset + 100).map(row => row.id).join(',') + ')'
    }));
  }
  return rows;
}

export function createFinance({ run, status, actionButton, renderTable, onChange, getRequestScope }) {
  const panel = $('finance');
  const toggle = $('finance-toggle');
  const shift = $('record-shift');
  const receipt = $('record-receipt');
  const individual = $('record-individual-payment');
  const cancel = $('cancel-receipt');
  const history = $('finance-receipts');
  const shiftHistory = $('finance-shifts');
  const individualHistory = $('finance-individual-payments');
  const rates = $('finance-rates');
  const hideReceiptAmounts = historyAmounts(history, $('receipt-toggle'));
  const hideShiftAmounts = historyAmounts(shiftHistory, $('shift-toggle'));
  const hideIndividualAmounts = historyAmounts(individualHistory, $('individual-toggle'));
  const hideRates = historyAmounts(rates, $('rates-toggle'));
  const receiptPages = createHistoryControl(history, 'abonos generales', run,
    next => load(client, family, patients, { receipts: next }));
  const shiftPages = createHistoryControl(shiftHistory, 'jornadas', run,
    next => load(client, family, patients, { shifts: next }));
  const individualPages = createHistoryControl(individualHistory, 'abonos individuales', run,
    next => load(client, family, patients, { individual: next }));
  const pending = new Map();
  let family, client, patients, balance, selected, timer;

  function hideAmounts() {
    clearTimeout(timer);
    timer = undefined;
    toggle.textContent = 'Ver montos';
    toggle.setAttribute('aria-pressed', 'false');
    $('finance-balance-label').textContent = 'Saldo';
    for (const field of ['cost', 'received', 'balance']) $('finance-' + field).textContent = '••••';
  }

  function dismissCancellation() {
    selected = undefined;
    cancel.hidden = true;
    cancel.reset();
    $('cancel-receipt-detail').textContent = '';
  }

  function scope(nextFamily) {
    if (family === nextFamily) return;
    family = nextFamily;
    panel.hidden = true;
    balance = undefined;
    pending.clear();
    hideAmounts();
    hideReceiptAmounts();
    hideShiftAmounts();
    hideIndividualAmounts();
    hideRates();
    dismissCancellation();
    history.replaceChildren();
    shiftHistory.replaceChildren();
    individualHistory.replaceChildren();
    rates.replaceChildren();
    receiptPages.reset(); shiftPages.reset(); individualPages.reset();
    $('add-nurse').reset();
    shift.reset();
    receipt.reset();
    individual.reset();
    individual.elements.nurse.replaceChildren();
    shift.elements.patient.replaceChildren();
    shift.elements.nurse.replaceChildren();
  }

  function options(select, rows) {
    const previous = select.value;
    select.replaceChildren(...rows.map(row => new Option(row.name, row.id)));
    if (rows.some(row => row.id === previous)) select.value = previous;
  }

  async function load(nextClient, nextFamily, nextPatients, requested = {}) {
    scope(nextFamily);
    client = nextClient;
    patients = nextPatients;
    const today = dateFormat.format(new Date());
    const filter = { family_id: 'eq.' + family };
    const counts = { receipts: requested.receipts ?? receiptPages.count,
      shifts: requested.shifts ?? shiftPages.count, individual: requested.individual ?? individualPages.count };
    const [nurses, receiptPage, totals, shiftPage, individualPage] = await Promise.all([
      readCatalog(client,'nurses', { ...filter, select: 'id,name,full_cents,half_cents', order: 'name.asc,id.asc' }),
      readHistoryWindow(client, 'receipts', { ...filter, select: 'id,paid_on,amount_cents,concept', order: 'paid_on.desc,id.desc' }, counts.receipts),
      client.rpc('financial_balance', { family, as_of: today }),
      readHistoryWindow(client, 'shifts', {
        ...filter, select: 'id,service_day,modality,cost_cents,patients(name),nurses(name)',
        order: 'service_day.desc,id.desc'
      }, counts.shifts),
      readHistoryWindow(client, 'individual_payments', {
        ...filter, select: 'id,paid_on,amount_cents,concept,nurses(name)', order: 'paid_on.desc,id.desc'
      }, counts.individual)
    ]);
    if (family !== nextFamily || client !== nextClient) return;
    const receipts = receiptPage.rows, shifts = shiftPage.rows, individualPayments = individualPage.rows;
    const [cancellations, applied] = await Promise.all([
      loadReceiptCancellations(client, family, receipts),
      loadAppliedPayments(client, family, shifts)
    ]);
    if (family !== nextFamily || client !== nextClient) return;
    const cancelled = new Map(cancellations.map(row => [row.receipt_id, row.cancelled_on]));
    balance = totals[0];
    hideAmounts();
    options(shift.elements.patient, patients);
    options(shift.elements.nurse, nurses);
    options(individual.elements.nurse, nurses);
    shift.querySelector('button').disabled = !patients.length || !nurses.length;
    individual.querySelector('button').disabled = !nurses.length;
    for (const form of [shift, receipt, individual]) form.elements.day.value ||= today;
    renderTable(rates, nurses.map(row => [
      row.name, row.full_cents === null ? 'Sin tarifa' : historyAmount(row.full_cents),
      row.half_cents === null ? 'Sin tarifa' : historyAmount(row.half_cents)
    ]), 'Aún no hay tarifas registradas.');
    $('rates-toggle').disabled = !nurses.length;
    hideRates();
    renderTable(individualHistory, individualPayments.map(row => [
      row.paid_on, row.nurses.name, row.concept || '—', historyAmount(row.amount_cents)
    ]), 'Aún no hay abonos individuales.');
    $('individual-toggle').disabled = !individualPayments.length;
    hideIndividualAmounts();
    renderTable(shiftHistory, shifts.map(row => {
      const modality = row.modality === 'half' ? 'Media jornada' : 'Jornada completa';
      const date = row.service_day + (row.service_day > today ? ' (programada)' : '');
      const paid = applied.get(row.id) ?? 0n;
      const remaining = BigInt(row.cost_cents) - paid;
      return [date, row.patients.name, row.nurses.name, modality,
        historyAmount(row.cost_cents), historyAmount(paid), historyAmount(remaining)];
    }), 'Aún no hay jornadas registradas.');
    $('shift-toggle').disabled = !shifts.length;
    hideShiftAmounts();
    renderTable(history, receipts.map(row => {
      const amount = historyAmount(row.amount_cents);
      const title = 'Abono del ' + row.paid_on + (row.concept ? ' · ' + row.concept : '');
      if (cancelled.has(row.id)) {
        return [row.paid_on, row.concept || '—', amount, 'Cancelado el ' + cancelled.get(row.id), '—'];
      }
      const button = actionButton(title, 'Cancelar abono', () => {
        selected = row.id;
        $('cancel-receipt-detail').textContent = title;
        cancel.elements.day.value = today;
        cancel.hidden = false;
        cancel.elements.day.focus();
      });
      return [row.paid_on, row.concept || '—', amount, 'Activo', button];
    }), 'Aún no hay abonos generales.');
    hideReceiptAmounts();
    receiptPages.update(receiptPage, counts.receipts);
    shiftPages.update(shiftPage, counts.shifts);
    individualPages.update(individualPage, counts.individual);
    panel.hidden = false;
  }

  function register(id, rpc, payload, message, repeatable = true) {
    const form = $(id);
    form.addEventListener('submit', run(async () => {
      const args = { family, ...payload(new FormData(form)) };
      let writeWarning;
      if (rpc === 'add_nurse') {
        let storage;try{storage=localStorage;}catch{}
        const scope=getRequestScope?.();
        if(!scope)throw Error('No se pudo identificar la cuenta. Vuelve a iniciar sesión antes de registrar enfermería.');
        try { await durableRequest({storage,scope,operation:'nurse',payload:args,send:payload=>client.rpc('add_nurse_once',payload)}); }
        catch(error){if(!error.saved)throw error;writeWarning=error.message;}
      } else if (repeatable) {
        const key = JSON.stringify([rpc, args]);
        if (!pending.has(key)) pending.set(key, crypto.randomUUID());
        args.request_id = pending.get(key);
        try {
          await client.rpc(rpc, args);
        } catch (error) {
          if (rpc === 'record_individual_payment' && error.code === 'PT422') {
            throw new Error('El abono supera el monto pendiente de este enfermero hasta la fecha indicada.');
          }
          throw error;
        }
        pending.delete(key);
      } else {
        try { await client.rpc(rpc, args); }
        catch (error) {
          if (rpc === 'add_nurse' && (error.network || error.status >= 500)) {
            throw new Error('No se pudo confirmar el alta de enfermería. Puede haberse guardado. Pulsa Actualizar fichas y revisa las tarifas antes de volver a agregarla.');
          }
          throw error;
        }
      }
      if (form === cancel) dismissCancellation();
      else form.reset();
      try {
        await load(client, family, patients);
        await onChange();
        status(writeWarning??message,writeWarning?'warning':undefined);
      } catch {
        scope(undefined);
        status(message + ' Usa Actualizar para consultar los datos.', 'warning');
      }
    }));
  }

  toggle.addEventListener('click', () => {
    if (!balance || timer) return hideAmounts();
    $('finance-cost').textContent = formatCents(balance.cost_cents);
    $('finance-received').textContent = formatCents(balance.received_cents);
    const { label, amount } = describeBalance(balance.balance_cents);
    $('finance-balance-label').textContent = label;
    $('finance-balance').textContent = amount;
    toggle.textContent = 'Ocultar montos';
    toggle.setAttribute('aria-pressed', 'true');
    timer = setTimeout(hideAmounts, 30000);
  });
  $('dismiss-cancel-receipt').addEventListener('click', dismissCancellation);
  register('add-nurse', 'add_nurse', values => {
    const full = parseCents(values.get('full'), true);
    const half = parseCents(values.get('half'), true);
    if (full === null && half === null) throw new Error('Indica al menos una tarifa.');
    return { nurse_name: values.get('name'), full_rate: full, half_rate: half };
  }, 'Enfermero/a agregado/a.', false);
  register('record-shift', 'record_shift', values => ({
    patient: values.get('patient'), nurse: values.get('nurse'),
    day: values.get('day'), shift_type: values.get('modality')
  }), 'Jornada registrada.');
  register('record-receipt', 'record_receipt', values => ({
    day: values.get('day'), cents: parseCents(values.get('amount')), concept_text: values.get('concept')
  }), 'Abono registrado.');
  register('record-individual-payment', 'record_individual_payment', values => ({
    nurse: values.get('nurse'), day: values.get('day'), cents: parseCents(values.get('amount')), concept_text: values.get('concept')
  }), 'Abono individual registrado.');
  register('cancel-receipt', 'cancel_receipt', values => ({
    receipt: selected, day: values.get('day')
  }), 'Cancelación registrada.');
  return { load, scope };
}
