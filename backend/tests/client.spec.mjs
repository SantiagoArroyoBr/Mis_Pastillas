import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '../supabase-client.mjs';

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
