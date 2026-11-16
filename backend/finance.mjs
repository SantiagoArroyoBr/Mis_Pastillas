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

export function createFinance({ run, status, itemWithButton }) {
  const panel = $('finance');
  const toggle = $('finance-toggle');
  const shift = $('record-shift');
  const receipt = $('record-receipt');
  const cancel = $('cancel-receipt');
  const history = $('finance-receipts');
  const historyToggle = $('receipt-toggle');
  const pending = new Map();
  let family, client, patients, balance, selected, timer, historyTimer;

  function hideAmounts() {
    clearTimeout(timer);
    timer = undefined;
    toggle.textContent = 'Ver montos';
    toggle.setAttribute('aria-pressed', 'false');
    $('finance-balance-label').textContent = 'Saldo';
    for (const field of ['cost', 'received', 'balance']) $('finance-' + field).textContent = '••••';
  }

  function showHistoryAmounts(show) {
    clearTimeout(historyTimer);
    historyTimer = show ? setTimeout(() => showHistoryAmounts(false), 30000) : undefined;
    historyToggle.textContent = show ? 'Ocultar montos' : 'Ver montos';
    historyToggle.setAttribute('aria-pressed', String(show));
    for (const amount of history.querySelectorAll('[data-cents]')) {
      amount.textContent = show ? formatCents(amount.dataset.cents) : '••••';
    }
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
    showHistoryAmounts(false);
    dismissCancellation();
    history.replaceChildren();
    $('add-nurse').reset();
    shift.reset();
    receipt.reset();
    shift.elements.patient.replaceChildren();
    shift.elements.nurse.replaceChildren();
  }

  function options(select, rows) {
    const previous = select.value;
    select.replaceChildren(...rows.map(row => new Option(row.name, row.id)));
    if (rows.some(row => row.id === previous)) select.value = previous;
  }

  async function load(nextClient, nextFamily, nextPatients) {
    scope(nextFamily);
    client = nextClient;
    patients = nextPatients;
    const today = dateFormat.format(new Date());
    const filter = { family_id: 'eq.' + family };
    const [nurses, receipts, totals] = await Promise.all([
      client.select('nurses', { ...filter, select: 'id,name', order: 'name.asc,id.asc' }),
      client.select('receipts', { ...filter, select: 'id,paid_on,amount_cents', order: 'paid_on.desc,id.desc', limit: 20 }),
      client.rpc('financial_balance', { family, as_of: today })
    ]);
    const cancellations = receipts.length ? await client.select('receipt_cancellations', {
      ...filter, select: 'receipt_id,cancelled_on', receipt_id: 'in.(' + receipts.map(row => row.id).join(',') + ')'
    }) : [];
    const cancelled = new Map(cancellations.map(row => [row.receipt_id, row.cancelled_on]));
    balance = totals[0];
    hideAmounts();
    options(shift.elements.patient, patients);
    options(shift.elements.nurse, nurses);
    shift.querySelector('button').disabled = !patients.length || !nurses.length;
    for (const form of [shift, receipt]) form.elements.day.value ||= today;
    history.replaceChildren(...receipts.map(row => {
      const amount = document.createElement('span');
      amount.dataset.cents = row.amount_cents;
      if (cancelled.has(row.id)) {
        const item = document.createElement('li');
        item.append(row.paid_on + ' · Cancelado el ' + cancelled.get(row.id) + ' · ', amount);
        return item;
      }
      const item = itemWithButton('Abono del ' + row.paid_on + ' · ' + row.id.slice(0, 8), 'Cancelar abono', () => {
        selected = row.id;
        $('cancel-receipt-detail').textContent = 'Abono del ' + row.paid_on + ' · ' + row.id.slice(0, 8);
        cancel.elements.day.value = today;
        cancel.hidden = false;
        cancel.elements.day.focus();
      });
      item.append(' · ', amount);
      return item;
    }));
    showHistoryAmounts(false);
    panel.hidden = false;
  }

  function register(id, rpc, payload, message, repeatable = true) {
    const form = $(id);
    form.addEventListener('submit', run(async () => {
      const args = { family, ...payload(new FormData(form)) };
      if (repeatable) {
        const key = JSON.stringify([rpc, args]);
        if (!pending.has(key)) pending.set(key, crypto.randomUUID());
        args.request_id = pending.get(key);
        await client.rpc(rpc, args);
        pending.delete(key);
      } else {
        await client.rpc(rpc, args);
      }
      if (form === cancel) dismissCancellation();
      else form.reset();
      try {
        await load(client, family, patients);
        status(message);
      } catch {
        scope(undefined);
        status(message + ' Usa Actualizar para consultar los datos.');
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
  historyToggle.addEventListener('click', () => showHistoryAmounts(!historyTimer));
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
    day: values.get('day'), cents: parseCents(values.get('amount'))
  }), 'Abono registrado.');
  register('cancel-receipt', 'cancel_receipt', values => ({
    receipt: selected, day: values.get('day')
  }), 'Cancelación registrada.');
  return { load, scope };
}
