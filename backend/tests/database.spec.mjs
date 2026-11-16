import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const directory = new URL('../supabase/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, directory), 'utf8')));

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
  const context = createContext({ window: {} });
  for (const script of ['compatibility.js', 'payments.js']) {
    const url = new URL('../../' + script, import.meta.url);
    runInContext(await readFile(url, 'utf8'), context, { filename: script });
  }
  const pwa = context.window.AcompanaPayments.create({});
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
