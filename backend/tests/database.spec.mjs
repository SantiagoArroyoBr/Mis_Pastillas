import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { auditBackup } from '../audit-backup.mjs';
import { remainingStock } from '../inventory.mjs';

const directory = new URL('../supabase/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, directory), 'utf8')));

async function currentPwa() {
  const context = createContext({ window: {} });
  for (const script of ['compatibility.js', 'payments.js', 'domain.js']) {
    const url = new URL('../../' + script, import.meta.url);
    runInContext(await readFile(url, 'utf8'), context, { filename: script });
  }
  return context.window;
}

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  // Supabase provides these roles and auth.uid(). PostgreSQL itself enforces the grants and policies below.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
  `);
  for (const migration of migrations) await db.exec(migration);
  return db;
}

function actor(db, id) {
  return (sql, params = []) => db.transaction(async tx => {
    await tx.exec('set local role ' + (id ? 'authenticated' : 'anon'));
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
    return (await tx.query(sql, params)).rows;
  });
}

async function addUser(db) {
  const id = randomUUID();
  const email = id + '@acompana.test';
  await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [id, email]);
  return { id, email, query: actor(db, id) };
}

async function rpc(query, call, params) {
  return (await query('select public.' + call + ' as result', params))[0].result;
}

test('archiving preserves appointments and shifts and rejects new activity for that patient', async t => {
  const db = await database(t);
  const owner = await addUser(db);
  const caregiver = await addUser(db);
  const outsider = await addUser(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia A']);
  const otherFamily = await rpc(outsider.query, 'create_family($1)', ['Familia B']);
  const patient = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha ficticia']);
  const duplicate = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha ficticia']);
  const foreign = await rpc(outsider.query, 'add_patient($1,$2)', [otherFamily, 'Ficha ficticia']);
  const invitation = await rpc(owner.query, 'create_invite($1,$2)', [family, caregiver.email]);
  await rpc(caregiver.query, 'accept_invite($1)', [invitation]);
  const nurse = await rpc(owner.query, 'add_nurse($1,$2,$3,$4)', [family, 'Enfermería', 10000, null]);
  const day = '2026-11-16', appointmentId = randomUUID(), shift = randomUUID();
  const appointment = 'add_appointment($1,$2,$3,$4,$5,$6,$7)';
  const archive = 'set_patient_archived($1,$2,$3,$4)';
  const recordShift = 'record_shift($1,$2,$3,$4,$5,$6)';
  const args = [family, appointmentId, patient, day, '08:00', 'Consultorio ficticio', ''];
  assert.equal(await rpc(caregiver.query, appointment, args), appointmentId);
  await rpc(owner.query, recordShift, [family, shift, patient, nurse, day, 'full']);
  await assert.rejects(rpc(owner.query, appointment, [family, randomUUID(), foreign, day, null, '', '']), { code: 'PT422' });
  await assert.rejects(rpc(owner.query, appointment, [family, randomUUID(), duplicate, '2026-02-30', null, '', '']), { code: '22008' });
  const legacy = randomUUID();
  const edit = 'edit_appointment($1,$2,$3,$4,$5,$6,$7)';
  await db.query(`insert into public.appointments(family_id,id,patient_id,legacy_day,location,notes,actor_id)
    values ($1,$2,$3,'2026-02-30','','',$4)`, [family, legacy, patient, owner.id]);
  await assert.rejects(rpc(owner.query, edit, [family, legacy, 1, day, null, '', '']), { code: 'PT422' });
  await assert.rejects(rpc(outsider.query, edit, [family, appointmentId, 1, day, null, '', '']), { code: '42501' });
  assert.deepEqual(await outsider.query('select id from public.appointment_details where family_id = $1', [family]), []);
  await assert.rejects(rpc(caregiver.query, archive, [family, patient, 1, true]), { code: '42501' });
  assert.equal(await rpc(owner.query, archive, [family, patient, 1, true]), 2);
  await assert.rejects(rpc(owner.query, edit, [family, appointmentId, 1, day, null, '', '']), { code: 'PT422' });
  await assert.rejects(rpc(owner.query, archive, [family, patient, 1, false]), { code: 'PT409' });
  assert.deepEqual(await caregiver.query('select id from public.patients where archived_at is null'), [{ id: duplicate }]);
  assert.equal(await rpc(caregiver.query, appointment, args), appointmentId);
  await assert.rejects(rpc(caregiver.query, appointment, [family, randomUUID(), ...args.slice(2)]), { code: 'PT422' });
  assert.equal(await rpc(owner.query, recordShift, [family, shift, patient, nurse, day, 'full']), shift);
  await assert.rejects(rpc(owner.query, recordShift, [family, randomUUID(), patient, nurse, day, 'full']), { code: 'PT422' });
  assert.deepEqual(await caregiver.query('select patient_id,legacy_day from public.appointments order by legacy_day nulls first'),
    [{ patient_id: patient, legacy_day: null }, { patient_id: patient, legacy_day: '2026-02-30' }]);
  assert.deepEqual(await outsider.query('select id from public.appointments'), []);
  await assert.rejects(caregiver.query('delete from public.appointments'), { code: '42501' });
  assert.equal(await rpc(owner.query, archive, [family, patient, 2, false]), 3);
  assert.equal((await caregiver.query('select id from public.patients where archived_at is null')).length, 2);
});

test('inventory keeps independent schedules on one stock and purchases rebase atomically', async t => {
  const { AcompanaDomain: domain } = await currentPwa();
  const db = await database(t);
  const owner = await addUser(db);
  const outsider = await addUser(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia ficticia']);
  const foreignFamily = await rpc(outsider.query, 'create_family($1)', ['Otra familia']);
  const patient = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha ficticia']);
  const foreignPatient = await rpc(outsider.query, 'add_patient($1,$2)', [foreignFamily, 'Ficha ficticia']);
  const item = randomUUID(), other = randomUUID(), purchaseId = randomUUID();
  const start = new Date(2026, 10, 16, 7).getTime();
  const current = new Date(2026, 10, 17, 13).getTime();
  const schedules = [
    { dose: 1, times: ['08:00'], schedule: { type: 'daily' } },
    { dose: 0.5, times: ['12:00'], schedule: { type: 'interval', n: 2, start } },
    { dose: 0.25, times: ['08:00'], schedule: { type: 'weekdays', days: [1] } }
  ];
  const add = 'add_inventory_item($1,$2,$3,$4,$5,$6,$7,$8)';
  const purchase = 'record_inventory_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
  const args = [family, item, patient, 'Registro ficticio', 'medicine', 20, start, schedules];
  assert.equal(await rpc(owner.query, add, args), item);
  await rpc(owner.query, add, [family, other, ...args.slice(2)]);
  await assert.rejects(rpc(owner.query, add, [family, randomUUID(), foreignPatient, ...args.slice(3)]), { code: 'PT422' });
  await assert.rejects(rpc(owner.query, add, [family, randomUUID(), ...args.slice(2, 7),
    [{ dose: 1, times: ['25:00'], schedule: { type: 'daily' } }]]), { code: '23514' });
  const rows = () => owner.query('select id,base_quantity::text,base_at::text,consumptions,revision from public.inventory_items');
  const stored = (await rows()).find(row => row.id === item);
  assert.deepEqual(stored.consumptions, schedules);
  const stock = remainingStock(domain, {
    ...stored, base_quantity: Number(stored.base_quantity), base_at: Number(stored.base_at)
  }, current);
  assert.equal(stock, 17.25);
  const buy = [family, purchaseId, item, 1, '12.5', '180.125', '2026-11-17', 'Farmacia ficticia', stock, current];
  assert.equal(await rpc(owner.query, purchase, buy), purchaseId);
  assert.equal(await rpc(owner.query, purchase, buy), purchaseId);
  assert.equal(await rpc(owner.query, add, args), item);
  await assert.rejects(rpc(owner.query, purchase, [family, randomUUID(), ...buy.slice(2)]), { code: 'PT409' });
  await assert.rejects(rpc(owner.query, purchase, [family, randomUUID(), item, 2, 1, -1, ...buy.slice(6)]), { code: '23514' });
  await assert.rejects(rpc(outsider.query, purchase, buy), { code: '42501' });
  const items = new Map((await rows()).map(row => [row.id, [row.base_quantity, row.revision]]));
  assert.deepEqual(items, new Map([[item, ['29.75', 2]], [other, ['20', 1]]]));
  assert.deepEqual(await owner.query('select quantity::text,total_price::text from public.inventory_purchases'),
    [{ quantity: '12.5', total_price: '180.125' }]);
  assert.deepEqual(await outsider.query('select id from public.inventory_items'), []);
  assert.deepEqual(await outsider.query('select id from public.inventory_purchases'), []);
  await assert.rejects(owner.query('delete from public.inventory_purchases'), { code: '42501' });
  const large = randomUUID();
  const overflow = randomUUID();
  await rpc(owner.query, add, [family, large, patient, 'Otro producto ficticio', 'medicine', '1e308', start, schedules]);
  await assert.rejects(rpc(owner.query, purchase,
    [family, overflow, large, 1, '1e308', null, '2026-11-17', '', '1e308', current]), { code: '23514' });
  assert.deepEqual(await owner.query('select id from public.inventory_purchases where id = $1', [overflow]), []);
  assert.deepEqual(await owner.query('select revision from public.inventory_items where id = $1', [large]), [{ revision: 1 }]);
});

test('families protect data from anonymous users, other families and revoked members', async t => {
  const db = await database(t);
  const owner = await addUser(db);
  const caregiver = await addUser(db);
  const outsider = await addUser(db);
  const anonymous = actor(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia A']);
  const foreign = await rpc(outsider.query, 'create_family($1)', ['Familia B']);
  const patient = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha ficticia A']);
  await rpc(outsider.query, 'add_patient($1,$2)', [foreign, 'Ficha ficticia B']);

  assert.deepEqual(await outsider.query('select id from public.patients where id = $1', [patient]), []);
  assert.deepEqual(await outsider.query('select name from public.patients'), [{ name: 'Ficha ficticia B' }]);
  await assert.rejects(rpc(outsider.query, 'rename_patient($1,$2,$3,$4)', [family, patient, 1, 'Cambio']), { code: '42501' });
  await assert.rejects(anonymous('select * from public.patients'), { code: '42501' });
  await assert.rejects(rpc(anonymous, 'create_family($1)', ['Sin sesión']), { code: '42501' });

  const cancelled = await rpc(owner.query, 'create_invite($1,$2)', [family, caregiver.email]);
  await rpc(owner.query, 'revoke_invite($1,$2)', [family, cancelled]);
  await assert.rejects(rpc(caregiver.query, 'accept_invite($1)', [cancelled]), { code: '22023' });
  const code = await rpc(owner.query, 'create_invite($1,$2)', [family, caregiver.email.toUpperCase()]);
  await assert.rejects(rpc(outsider.query, 'accept_invite($1)', [code]), { code: '22023' });
  assert.equal(await rpc(caregiver.query, 'accept_invite($1)', [code]), family);
  await assert.rejects(rpc(caregiver.query, 'accept_invite($1)', [code]), { code: '22023' });
  await assert.rejects(rpc(caregiver.query, 'create_invite($1,$2)', [family, outsider.email]), { code: '42501' });
  await assert.rejects(caregiver.query("update public.family_members set role = 'owner'"), { code: '42501' });
  await assert.rejects(caregiver.query('select * from acompana_private.invitations'), { code: '42501' });

  assert.deepEqual(await caregiver.query('select id, revision from public.patients'), [{ id: patient, revision: 1 }]);
  assert.equal(await rpc(caregiver.query, 'rename_patient($1,$2,$3,$4)', [family, patient, 1, 'Cambio A']), 2);
  await assert.rejects(rpc(owner.query, 'rename_patient($1,$2,$3,$4)', [family, patient, 1, 'Borrador B']), { code: 'PT409' });
  assert.deepEqual(await owner.query('select name, revision from public.patients'), [{ name: 'Cambio A', revision: 2 }]);
  await rpc(owner.query, 'revoke_caregiver($1,$2)', [family, caregiver.id]);
  assert.deepEqual(await caregiver.query('select * from public.patients'), []);
  await assert.rejects(rpc(caregiver.query, 'add_patient($1,$2)', [family, 'Bloqueado']), { code: '42501' });
});

test('shifts and receipts preserve cents, ownership, family links and idempotency', async t => {
  const db = await database(t);
  const owner = await addUser(db);
  const caregiver = await addUser(db);
  const another = await addUser(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia A']);
  const foreign = await rpc(another.query, 'create_family($1)', ['Familia B']);
  const patient = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha A']);
  const foreignPatient = await rpc(another.query, 'add_patient($1,$2)', [foreign, 'Ficha B']);
  const nurse = await rpc(owner.query, 'add_nurse($1,$2,$3,$4)', [family, 'Enfermería A', 12000, 6500]);
  const day = '2026-11-16';
  const shift = randomUUID();
  assert.equal(await rpc(owner.query, 'record_shift($1,$2,$3,$4,$5,$6)', [family, shift, patient, nurse, day, 'half']), shift);
  assert.equal(await rpc(owner.query, 'record_shift($1,$2,$3,$4,$5,$6)', [family, shift, patient, nurse, day, 'half']), shift);
  await assert.rejects(rpc(owner.query, 'record_shift($1,$2,$3,$4,$5,$6)', [family, randomUUID(), foreignPatient, nurse, day, 'half']), { code: '23503' });
  assert.deepEqual(await owner.query('select cost_cents from public.shifts'), [{ cost_cents: 6500 }]);
  const tomorrow = '2026-11-17';
  await rpc(owner.query, 'record_shift($1,$2,$3,$4,$5,$6)', [family, randomUUID(), patient, nurse, tomorrow, 'full']);
  const balance = 'select * from public.financial_balance($1,$2)';

  const receipt = randomUUID();
  const payment = [family, receipt, tomorrow, 5000];
  assert.equal(await rpc(owner.query, 'record_receipt($1,$2,$3,$4)', payment), receipt);
  assert.equal(await rpc(owner.query, 'record_receipt($1,$2,$3,$4)', payment), receipt);
  await assert.rejects(rpc(owner.query, 'record_receipt($1,$2,$3,$4)', [family, receipt, day, 9000]), { code: 'PT409' });
  assert.deepEqual(await another.query('select id from public.receipts'), []);
  const invitation = await rpc(owner.query, 'create_invite($1,$2)', [family, caregiver.email]);
  await rpc(caregiver.query, 'accept_invite($1)', [invitation]);
  await assert.rejects(rpc(caregiver.query, 'record_receipt($1,$2,$3,$4)', payment), { code: '42501' });
  assert.deepEqual(await caregiver.query('select id from public.receipts'), []);
  await assert.rejects(caregiver.query(balance, [family, day]), { code: '42501' });
  await assert.rejects(another.query(balance, [family, day]), { code: '42501' });
  assert.deepEqual(await owner.query(balance, [family, '2026-11-15']), [{ cost_cents: '0', received_cents: '5000', balance_cents: '-5000' }]);
  assert.deepEqual(await owner.query(balance, [family, day]), [{ cost_cents: '6500', received_cents: '5000', balance_cents: '1500' }]);
  assert.deepEqual(await owner.query(balance, [family, tomorrow]), [{ cost_cents: '18500', received_cents: '5000', balance_cents: '13500' }]);
  await assert.rejects(owner.query('delete from public.receipts'), { code: '42501' });

  const cancellation = randomUUID();
  const cancel = [family, cancellation, receipt, tomorrow];
  assert.equal(await rpc(owner.query, 'cancel_receipt($1,$2,$3,$4)', cancel), cancellation);
  assert.equal(await rpc(owner.query, 'cancel_receipt($1,$2,$3,$4)', cancel), cancellation);
  await assert.rejects(rpc(owner.query, 'cancel_receipt($1,$2,$3,$4)', [family, randomUUID(), receipt, tomorrow]), { code: 'PT409' });
  assert.deepEqual(await owner.query('select amount_cents from public.receipts'), [{ amount_cents: 5000 }]);
  assert.deepEqual(await owner.query('select receipt_id from public.receipt_cancellations'), [{ receipt_id: receipt }]);
  assert.deepEqual(await owner.query(balance, [family, day]), [{ cost_cents: '6500', received_cents: '0', balance_cents: '6500' }]);
});

test('individual payments allocate oldest eligible shifts and roll back overpayments', async t => {
  const db = await database(t);
  const owner = await addUser(db);
  const outsider = await addUser(db);
  const anonymous = actor(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia ficticia']);
  const patient = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha']);
  const nurse = await rpc(owner.query, 'add_nurse($1,$2,$3,$4)', [family, 'Enfermero A', 10000, null]);
  const other = await rpc(owner.query, 'add_nurse($1,$2,$3,$4)', [family, 'Enfermero B', 10000, null]);
  const early = '2026-11-15', day = '2026-11-16';
  const [first, second] = [randomUUID(), randomUUID()];
  for (const [id, staff, date] of [
    [second, nurse, day], [first, nurse, early], [randomUUID(), nurse, '2026-11-17'], [randomUUID(), other, day]
  ]) {
    await rpc(owner.query, 'record_shift($1,$2,$3,$4,$5,$6)', [family, id, patient, staff, date, 'full']);
  }
  const call = 'record_individual_payment($1,$2,$3,$4,$5)';
  const payment = randomUUID();
  const args = [family, payment, nurse, day, 15000];
  assert.equal(await rpc(owner.query, call, args), payment);
  assert.equal(await rpc(owner.query, call, args), payment);
  await assert.rejects(rpc(owner.query, call, [family, payment, nurse, day, 1]), { code: 'PT409' });
  for (const [date, amount] of [[early, 1], [day, 5001]]) {
    await assert.rejects(rpc(owner.query, call, [family, randomUUID(), nurse, date, amount]), { code: 'PT422' });
  }
  await assert.rejects(rpc(outsider.query, call, args), { code: '42501' });
  await assert.rejects(rpc(anonymous, call, args), { code: '42501' });
  await assert.rejects(anonymous('select id from public.individual_payments'), { code: '42501' });
  await assert.rejects(owner.query('delete from public.individual_allocations'), { code: '42501' });
  assert.deepEqual(await outsider.query('select * from public.individual_allocations'), []);
  assert.deepEqual(await owner.query('select id from public.individual_payments'), [{ id: payment }]);
  assert.deepEqual(await owner.query('select shift_id, amount_cents from public.individual_allocations order by amount_cents desc'),
    [{ shift_id: first, amount_cents: 10000 }, { shift_id: second, amount_cents: 5000 }]);
  assert.deepEqual(await owner.query('select * from public.financial_balance($1,$2)', [family, day]),
    [{ cost_cents: '30000', received_cents: '0', balance_cents: '30000' }]);
});

test('PostgreSQL and the current PWA agree on the same individual and general ledgers', async t => {
  const pwa = (await currentPwa()).AcompanaPayments.create({});
  const db = await database(t);
  const owner = await addUser(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia de comparación']);
  const patient = await rpc(owner.query, 'add_patient($1,$2)', [family, 'Ficha ficticia']);
  const nurse = await rpc(owner.query, 'add_nurse($1,$2,$3,$4)', [family, 'Enfermería ficticia', 12000, 6500]);
  const [first, today, later] = ['2026-11-15', '2026-11-16', '2026-11-17'];
  const services = [];
  for (const [date, modality, amountCents] of [[today, 'full', 12000], [first, 'half', 6500], [later, 'full', 12000]]) {
    const id = randomUUID();
    await rpc(owner.query, 'record_shift($1,$2,$3,$4,$5,$6)', [family, id, patient, nurse, date, modality]);
    services.push({ id, nurseId: nurse, date, amountCents });
  }
  const individual = [];
  const pay = 'record_individual_payment($1,$2,$3,$4,$5)';
  for (const [date, amount] of [[today, 7000], [today, 2500], [first, 1], [today, 9001]]) {
    const expected = pwa.allocatePayment(services, individual, nurse, amount, date);
    const id = randomUUID();
    if (expected) {
      await rpc(owner.query, pay, [family, id, nurse, date, amount]);
      const rows = await owner.query(
        'select shift_id, amount_cents from public.individual_allocations where payment_id = $1', [id]
      );
      assert.deepEqual(new Map(rows.map(row => [row.shift_id, row.amount_cents])),
        new Map(expected.map(row => [row.serviceId, row.amountCents])));
      individual.push({ nurseId: nurse, amountCents: amount, allocations: expected });
    } else {
      await assert.rejects(rpc(owner.query, pay, [family, id, nurse, date, amount]), { code: 'PT422' });
      assert.deepEqual(await owner.query('select id from public.individual_payments where id = $1', [id]), []);
    }
  }

  const receipt = randomUUID();
  await rpc(owner.query, 'record_receipt($1,$2,$3,$4)', [family, receipt, today, 20000]);
  const general = [{ id: receipt, type: 'receipt', amountCents: 20000 }];
  async function compareBalance() {
    for (const cutoff of [first, today, later]) {
      const { costCents, receivedCents, balanceCents } = pwa.generalSummary(services, general, cutoff);
      assert.deepEqual(await owner.query('select * from public.financial_balance($1,$2)', [family, cutoff]), [{
        cost_cents: String(costCents), received_cents: String(receivedCents), balance_cents: String(balanceCents)
      }]);
    }
  }
  await compareBalance();
  await rpc(owner.query, 'cancel_receipt($1,$2,$3,$4)', [family, randomUUID(), receipt, today]);
  general.push({ type: 'cancellation', originalId: receipt });
  await compareBalance();
});

test('a synthetic JSON backup preserves historical amounts and relations in a disposable SQL rehearsal', async t => {
  const { AcompanaCompatibility: compatibility } = await currentPwa();
  const day = '2026-11-16';
  const raw = JSON.stringify({
    sel: 0, mode: 'home', last: '',
    p: [
      { name: 'Ficha ficticia', meds: [{ name: 'Medicamento ficticio', base: 20, t0: 1700000000000, cons: [] }] },
      { name: 'Ficha ficticia', meds: [], archived: true }
    ],
    appts: [{ id: 'cita', i: 0, d: day, t: '08:00', w: 'Consulta ficticia', n: '' }],
    pay: {
      cfg: [{ base: day, pays: [{ d: day, n: 1, a: 40, old: false }] }],
      nurses: [[{ id: 'staff', n: 'Enfermería ficticia', ratesCents: { full: 12000, half: 6500 } }], []],
      v: { [day]: { 0: [{ n: 'Enfermería ficticia',
        service: { id: 'service', nurseId: 'staff', type: 'half', amountCents: 5000 } }] } },
      ledger: [{ id: 'payment', patientIndex: 0, nurseId: 'staff', date: day, amountCents: 1800,
        allocations: [{ serviceId: 'service', amountCents: 1800 }] }],
      generalLedger: [
        { id: 'receipt', type: 'receipt', date: day, amountCents: 2500, concept: 'Nota ficticia' },
        { id: 'reversed', type: 'receipt', date: day, amountCents: 1000 },
        { id: 'cancel', type: 'cancellation', originalId: 'reversed', date: day, amountCents: 1000 }
      ]
    }
  });
  const source = JSON.parse(raw);
  compatibility.validateMigrationInput(source);
  assert.deepEqual(auditBackup(raw), {
    estado: 'diagnostico',
    registros: { fichas: 2, personal: 1, jornadasConCosto: 1, abonosIndividuales: 1, abonosGenerales: 2, cancelacionesGenerales: 1 },
    hallazgosConocidos: {
      fichasArchivadas: 1, fichasConNombreRepetido: 1, medicinas: 1, citas: 1,
      prepagosDeCobertura: 1, movimientosConConcepto: 1
    }
  });
  const wrongPatient = JSON.parse(raw);
  wrongPatient.pay.ledger[0].patientIndex = 1;
  assert.throws(() => compatibility.validateMigrationInput(wrongPatient), /otra persona o ficha/);
  assert.equal(auditBackup(JSON.stringify(wrongPatient)).estado, 'rechazado');
  const historicDate = JSON.parse(raw);
  historicDate.pay.generalLedger[0].date = '2026-02-30';
  compatibility.validateMigrationInput(historicDate);
  assert.equal(compatibility.isValidDateOnly(historicDate.pay.generalLedger[0].date), false);
  assert.equal(auditBackup(JSON.stringify(historicDate)).hallazgosConocidos.fechasFinancierasInvalidas, 1);

  const db = await database(t);
  const owner = await addUser(db);
  const outsider = await addUser(db);
  const family = await rpc(owner.query, 'create_family($1)', ['Familia de ensayo']);
  const patientIds = source.p.map(() => randomUUID());
  const staff = source.pay.nurses[0][0];
  const service = source.pay.v[day][0][0].service;
  const movement = source.pay.ledger[0];
  const mapped = new Map([staff, service, movement, ...source.pay.generalLedger].map(row => [row.id, randomUUID()]));

  // These writes are confined to an in-memory fixture of the current destination schema.
  function rehearse(snapshot) {
    return db.transaction(async tx => {
      for (const [index, patient] of source.p.entries()) {
        await tx.query('insert into public.patients (family_id,id,name) values ($1,$2,$3)',
          [family, patientIds[index], patient.name]);
      }
      await tx.query('insert into public.nurses (family_id,id,name,full_cents,half_cents) values ($1,$2,$3,$4,$5)',
        [family, mapped.get(staff.id), staff.n, staff.ratesCents.full, staff.ratesCents.half]);
      await tx.query('insert into public.shifts values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [family, mapped.get(service.id), patientIds[0], mapped.get(service.nurseId), day, service.type, service.amountCents, owner.id]);
      await tx.query('insert into public.individual_payments values ($1,$2,$3,$4,$5,$6)',
        [family, mapped.get(movement.id), mapped.get(movement.nurseId), movement.date, movement.amountCents, owner.id]);
      for (const row of movement.allocations) {
        await tx.query('insert into public.individual_allocations values ($1,$2,$3,$4,$5)',
          [family, mapped.get(movement.nurseId), mapped.get(movement.id), mapped.get(row.serviceId), row.amountCents]);
      }
      for (const row of snapshot.pay.generalLedger) {
        if (row.type === 'receipt') {
          await tx.query('insert into public.receipts values ($1,$2,$3,$4,$5)',
            [family, mapped.get(row.id), row.date, row.amountCents, owner.id]);
        } else {
          await tx.query('insert into public.receipt_cancellations values ($1,$2,$3,$4,$5)',
            [family, mapped.get(row.id), mapped.get(row.originalId), row.date, owner.id]);
        }
      }
    });
  }
  await assert.rejects(rehearse(historicDate), { code: '22008' });
  assert.deepEqual(await owner.query('select id from public.patients where family_id = $1', [family]), []);
  assert.deepEqual(await owner.query('select payment_id from public.individual_allocations where family_id = $1', [family]), []);
  await rehearse(source);
  assert.deepEqual(new Set((await owner.query('select id from public.patients where family_id = $1', [family]))
    .map(row => row.id)), new Set(patientIds));
  assert.deepEqual(await owner.query('select patient_id,nurse_id,cost_cents from public.shifts'), [
    { patient_id: patientIds[0], nurse_id: mapped.get(staff.id), cost_cents: 5000 }
  ]);
  assert.deepEqual(await owner.query('select payment_id,shift_id,amount_cents from public.individual_allocations'), [
    { payment_id: mapped.get(movement.id), shift_id: mapped.get(service.id), amount_cents: 1800 }
  ]);
  assert.deepEqual(await owner.query('select receipt_id from public.receipt_cancellations'), [{ receipt_id: mapped.get('reversed') }]);
  assert.deepEqual(await owner.query('select * from public.financial_balance($1,$2)', [family, day]), [
    { cost_cents: '5000', received_cents: '2500', balance_cents: '2500' }
  ]);
  assert.deepEqual(await outsider.query('select payment_id from public.individual_allocations'), []);
  await assert.rejects(rehearse(source), { code: '23505' });
  assert.deepEqual(await owner.query('select count(*)::int as total from public.shifts'), [{ total: 1 }]);
  assert.equal(JSON.stringify(source), raw);
});
