import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, loadAppointments } from '../supabase-client.mjs';
import { parseCents, formatCents, describeBalance, loadAppliedPayments } from '../finance.mjs';
import { auditBackup } from '../audit-backup.mjs';
import { inventoryNumber, stockMessage, loadInventoryPurchases, formatConsumption, projectStock } from '../inventory.mjs';

test('manual supplies keep counted stock and generate no projected events', () => {
  const now = new Date(2026, 10, 16, 9).getTime();
  const item = { id: 'manual', kind: 'sup', base_quantity: 4.5, consumptions: [], patients: { name: 'Ficha' } };
  const domain = { calc: () => { throw new Error('El conteo manual no se proyecta'); } };
  assert.deepEqual(projectStock(domain, item, now), { rem: 4.5, manual: true });
  assert.equal(stockMessage(domain, { rem: 4.5, manual: true }), 'Conteo manual');
  assert.equal(buildCalendarEvents({ from: '2026-11-01', until: '2026-12-01',
    appointments: [], shifts: [], inventory: [item] }, domain, now).size, 0);
});
import { buildCalendarEvents, monthRange, upcomingCalendarDays } from '../calendar.mjs';

test('calendar shortcuts show the first three upcoming days including today', () => {
  const entries = new Map([26, 7, 20, 16, 17].map(day => ['2026-11-' + String(day).padStart(2, '0'), []]));
  assert.deepEqual(upcomingCalendarDays(entries, '2026-11-16').map(([day]) => day),
    ['2026-11-16', '2026-11-17', '2026-11-20']);
  assert.deepEqual(upcomingCalendarDays(entries, '2026-12-01'), []);
});

test('calendar groups scheduled events and estimated inventory events by local day', () => {
  const now = new Date(2026, 10, 16, 9).getTime();
  const tomorrow = new Date(2026, 10, 17, 9).getTime();
  const domain = { num: String, calc: () => ({ rem: 1, left: 1, now: true, end: tomorrow }) };
  const result = buildCalendarEvents({
    from: '2026-11-01', until: '2026-12-01',
    appointments: [
      { appointment_day: '2026-11-16', appointment_time: '08:30:00', patient_name: 'Ficha', location: 'Consulta' },
      { appointment_day: null, legacy_day: '2026-02-30' }
    ],
    shifts: [{ service_day: '2026-11-16', modality: 'half', nurses: { name: 'Enfermería' }, patients: { name: 'Ficha' } }],
    inventory: [{ name: 'Artículo', patients: { name: 'Ficha' } }]
  }, domain, now);
  assert.deepEqual(result.get('2026-11-16').map(event => event.kind), ['appointment', 'shift', 'stock']);
  assert.equal(result.get('2026-11-16')[0].details, '08:30 · Consulta');
  assert.equal(result.get('2026-11-17')[0].kind, 'depletion');
  assert.equal(result.has('2026-02-30'), false);
  const february = monthRange(new Date(2028, 1, 28));
  assert.equal(february.days, 29);
  assert.equal(february.first.getDate(), 1);
  assert.equal(february.next.getMonth(), 2);
  assert.equal(february.lead, 1);
});

test('inventory describes each schedule using its own dose, frequency and hours', () => {
  const domain = { num: n => String(n).replace('.', ','), schedText: schedule => schedule.type };
  assert.equal(formatConsumption(domain, { dose: 0.5, times: ['08:00', '20:00'], schedule: { type: 'daily' } }),
    '0,5 unidades · daily · 08:00, 20:00');
  assert.equal(formatConsumption(domain, { dose: 1, times: ['09:30'],
    schedule: { type: 'interval', start: new Date(2026, 10, 16).getTime() } }),
  '1 unidad · interval desde 2026-11-16 · 09:30');
});

test('purchase history filters the joined inventory item before applying its limit', async () => {
  const calls = [];
  const client = { select(table, filter) { calls.push({ table, ...filter }); return []; } };
  await loadInventoryPurchases(client, 'fixture-family');
  await loadInventoryPurchases(client, 'fixture-family', 'fixture-patient');
  assert.ok(calls.every(call => call.table === 'inventory_purchases' && call.family_id === 'eq.fixture-family'
    && call.limit === 20 && call.select.includes('inventory_items!inner')));
  assert.equal(calls[0]['inventory_items.patient_id'], undefined);
  assert.equal(calls[1]['inventory_items.patient_id'], 'eq.fixture-patient');
});

test('inventory distinguishes depleted, insufficient and replenishment states', () => {
  const domain = { fmt: () => 'martes 17 de noviembre' };
  assert.equal(stockMessage(domain, { rem: 0, left: 0 }), 'Agotado');
  assert.equal(stockMessage(domain, { rem: 0.25, left: 0 }), 'Existencias insuficientes');
  assert.equal(stockMessage(domain, { rem: 2, left: 2, st: 'red' }), 'Comprar hoy');
  assert.equal(stockMessage(domain, { rem: 2, left: 2, st: 'amber', now: false }), 'Comprar antes del martes 17 de noviembre');
  assert.equal(stockMessage(domain, { rem: 20, left: 20, st: 'green' }), 'Existencias suficientes');
});

test('inventory decimal fields preserve fractional stock and reject partial numeric input', () => {
  assert.equal(inventoryNumber('12,5', 'la cantidad', true), 12.5);
  assert.equal(inventoryNumber('0', 'la cantidad'), 0);
  assert.equal(inventoryNumber('.25', 'la cantidad', true), 0.25);
  for (const invalid of ['', '-1', '3 cajas', '1e4', '0']) {
    assert.throws(() => inventoryNumber(invalid, 'la cantidad', true));
  }
});

test('appointment history keeps its legacy dates and scopes each list before limiting', async () => {
  const filters = [];
  const client = { select(table, filter) {
    assert.equal(table, 'appointment_details');
    filters.push(filter);
    return filter.appointment_day === 'is.null' ? [{ legacy_day: '2026-02-30' }] : [];
  } };
  assert.deepEqual(await loadAppointments(client, 'fixture-family', '2026-11-16'),
    { upcoming: [], past: [], legacy: [{ legacy_day: '2026-02-30' }] });
  assert.deepEqual(filters.map(filter => filter.appointment_day), ['gte.2026-11-16', 'lt.2026-11-16', 'is.null']);
  assert.ok(filters.every(filter => filter.family_id === 'eq.fixture-family' && filter.limit === 20));
  assert.ok(filters.every(filter => !('patient_id' in filter)));
  filters.length = 0;
  await loadAppointments(client, 'fixture-family', '2026-11-16', 'fixture-patient');
  assert.ok(filters.every(filter => filter.patient_id === 'eq.fixture-patient'));
});

test('backup diagnostics use the PWA validation and report generic failures without echoing content', () => {
  assert.deepEqual(auditBackup('dato ficticio sensible'), { estado: 'rechazado', motivo: 'json-no-valido' });
  assert.deepEqual(auditBackup(' '.repeat(10 * 1024 * 1024 + 1)), { estado: 'rechazado', motivo: 'limite-de-tamaño' });
  assert.deepEqual(auditBackup('{"p":[]}'), { estado: 'rechazado', motivo: 'estructura-o-relaciones-no-validas-para-la-pwa' });
});

test('shift history accumulates allocations across pages without skipping a shared payment', async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({
    shift_id: 'first', payment_id: String(i).padStart(4, '0'), amount_cents: 1
  }));
  const calls = [];
  const client = { select(table, filter) {
    calls.push({ table, ...filter });
    return calls.length === 1 ? rows : [{ shift_id: 'second', payment_id: '0499', amount_cents: 2 }];
  } };
  const result = await loadAppliedPayments(client, 'family', [{ id: 'first' }, { id: 'second' }, { id: 'third' }]);
  assert.deepEqual(result, new Map([['first', 500n], ['second', 2n]]));
  assert.equal(calls[0].family_id, 'eq.family');
  assert.equal(calls[0].shift_id, 'in.(first,second,third)');
  assert.equal(calls[1].or, '(payment_id.gt.0499,and(payment_id.eq.0499,shift_id.gt.first))');
});

test('pilot distinguishes credit, exact payment and an outstanding balance', () => {
  assert.deepEqual(describeBalance('-10000'), { label: 'Saldo a favor', amount: '+$100.00 MXN' });
  assert.deepEqual(describeBalance('0'), { label: 'Sin saldo pendiente', amount: '$0.00 MXN' });
  assert.deepEqual(describeBalance('10000'), { label: 'Saldo pendiente', amount: '−$100.00 MXN' });
});

test('pilot amounts preserve cent precision and reject invalid input', () => {
  assert.equal(parseCents('65,01'), '6501');
  assert.equal(parseCents('0', true), '0');
  assert.equal(parseCents('', true), null);
  assert.equal(parseCents('90071992547409.91'), '9007199254740991');
  for (const invalid of ['0', '-1', '1.001', '1e2', '90071992547409.92']) {
    assert.throws(() => parseCents(invalid));
  }
  assert.equal(formatCents('-1500'), '−$15.00 MXN');
  assert.equal(formatCents('900719925474099123'), '$9,007,199,254,740,991.23 MXN');
});

test('pilot client only points to the loopback API and drops the token after logout fails', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith('/token?grant_type=password')) {
      return Response.json({ access_token: 'synthetic-token', user: { id: 'synthetic-account' } });
    }
    if (url.includes('/logout')) return Response.json({ code: 'test' }, { status: 503 });
    return Response.json([]);
  });
  assert.throws(() => createClient('sb_secret_synthetic'));
  const client = createClient('sb_publishable_synthetic');
  assert.equal(await client.signIn('owner@acompana.test', 'synthetic-password'), 'synthetic-account');
  await client.select('patients', { family_id: 'eq.synthetic-family' });
  await assert.rejects(client.signOut(), { status: 503 });
  await client.select('families');
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.url.startsWith('http://127.0.0.1:54321/')));
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].headers.Authorization, 'Bearer synthetic-token');
  assert.equal(calls[2].headers.Authorization, 'Bearer synthetic-token');
  assert.equal(calls[3].headers.Authorization, undefined);
  assert.equal(calls[1].headers.apikey, 'sb_publishable_synthetic');
  assert.equal(calls[1].cache, 'no-store');
});
