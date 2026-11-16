import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '../supabase-client.mjs';
import { parseCents, formatCents, describeBalance, loadAppliedPayments } from '../finance.mjs';

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
