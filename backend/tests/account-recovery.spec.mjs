import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeRecoveryLocation, recoveryCooldownSeconds, createAccountRecovery } from '../account-recovery.mjs';

const now = Date.parse('2026-11-17T12:00:00Z');
function jwt(claims = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'HS256' }) + '.' + encode({ exp: (now + 60000) / 1000,
    iss: 'https://test.supabase.co/auth/v1', sub: 'synthetic-account', ...claims }) + '.synthetic-signature';
}
function consume(url, time = now) {
  const calls = [];
  const result = consumeRecoveryLocation({ href: url }, { state: { fixture: true }, replaceState: (...args) => calls.push(args) }, time);
  return { result, calls };
}

test('recovery callback removes access and refresh capabilities from URL while retaining only recovery data in memory', () => {
  const token = jwt();
  const { result, calls } = consume('https://acompana.test/?fixture=1#access_token=' + token
    + '&refresh_token=private-refresh&expires_in=3600&type=recovery&token_type=bearer');
  assert.equal(result.kind, 'recovery');
  assert.equal(result.accessToken, token);
  assert.equal(result.expiresAt, now + 60000);
  assert.equal(result.issuer, 'https://test.supabase.co/auth/v1');
  assert.deepEqual(calls, [[{ fixture: true }, '', '/?fixture=1']]);
  assert.ok(!JSON.stringify(result).includes('private-refresh'));
});

test('normal navigation is preserved, confirmation tokens cannot become recovery sessions and PKCE codes are scrubbed safely', () => {
  assert.deepEqual(consume('https://acompana.test/#finance'), { result: { kind: 'none' }, calls: [] });
  const signup = consume('https://acompana.test/#type=signup&access_token=' + jwt() + '&refresh_token=private');
  assert.deepEqual(signup.result, { kind: 'confirmation' });
  assert.equal(signup.calls[0][2], '/');
  const pkce = consume('https://acompana.test/?code=private-pkce&fixture=1');
  assert.deepEqual(pkce.result, { kind: 'unsupported-code' });
  assert.equal(pkce.calls[0][2], '/?fixture=1');
});

test('expired, malformed and rejected recovery links never retain a token or remote error details', () => {
  const expired = consume('https://acompana.test/#type=recovery&access_token=' + jwt({ exp: now / 1000 - 1 }));
  assert.deepEqual(expired.result, { kind: 'expired' });
  const invalid = consume('https://acompana.test/#type=recovery&access_token=invalid');
  assert.deepEqual(invalid.result, { kind: 'invalid' });
  const rejected = consume('https://acompana.test/?error=access_denied&error_description=private-account');
  assert.deepEqual(rejected.result, { kind: 'invalid' });
  assert.equal(rejected.calls[0][2], '/');
});

function fixture(t, client, link = { kind: 'none' }) {
  class Element {
    value = '';
    hidden = false;
    disabled = false;
    textContent = '';
    listeners = new Map();
    addEventListener(name, callback) { this.listeners.set(name, callback); }
  }
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('request-account-recovery').elements = { email: new Element() };
  get('complete-account-recovery').elements = { password: new Element(), confirmation: new Element() };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: get } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  let time = now;
  const timers = new Set(), modes = [];
  const controller = createAccountRecovery({ getClient: () => client, link, now: () => time,
    onModeChange: active => modes.push(active),
    schedule: callback => { timers.add(callback); return callback; }, unschedule: callback => timers.delete(callback) });
  t.after(() => controller.dispose());
  return { get, controller, modes, requestForm: get('request-account-recovery'),
    passwordForm: get('complete-account-recovery'), feedback: get('account-recovery-status'),
    advance(milliseconds) { time += milliseconds; for (const callback of [...timers]) callback(); } };
}

test('recovery requests use one generic outcome for known and unknown accounts and enforce a visible cooldown', async t => {
  let calls = 0, unknown = false;
  const f = fixture(t, { requestRecovery: async email => {
    assert.equal(email, 'principal@example.test');
    calls++;
    if (unknown) throw Object.assign(new Error('account does not exist: private'), { status: 404 });
  } });
  f.requestForm.elements.email.value = 'Principal@example.test';
  await f.controller.request();
  const accepted = f.feedback.textContent;
  assert.match(accepted, /Si existe una cuenta principal/);
  assert.equal(f.get('request-account-recovery-button').disabled, true);
  assert.match(f.get('request-account-recovery-button').textContent, /60 s/);
  await f.controller.request();
  assert.equal(calls, 1);
  f.advance(60001);
  assert.equal(f.get('request-account-recovery-button').disabled, false);
  unknown = true;
  await f.controller.request();
  assert.equal(calls, 2);
  assert.equal(f.feedback.textContent, accepted);
  assert.ok(!f.feedback.textContent.includes('private'));
  assert.equal(recoveryCooldownSeconds(now + 1001, now), 2);
});

test('successful password recovery never signs into the ordinary session and clears password fields', async t => {
  const updates = [];
  const token = jwt();
  const f = fixture(t, {
    completeRecovery: async (...args) => updates.push(args),
    signIn: () => { throw new Error('must not sign in'); }
  }, { kind: 'recovery', accessToken: token, expiresAt: now + 60000 });
  f.passwordForm.elements.password.value = f.passwordForm.elements.confirmation.value = 'new-fixture-password';
  assert.equal(f.get('account-recovery-completion').hidden, false);
  await f.controller.complete();
  assert.deepEqual(updates, [[token, 'new-fixture-password']]);
  assert.equal(f.passwordForm.elements.password.value, '');
  assert.equal(f.passwordForm.elements.confirmation.value, '');
  assert.equal(f.get('account-recovery-completion').hidden, true);
  assert.deepEqual(f.modes, [true, false]);
  assert.match(f.feedback.textContent, /Inicia sesión/);
  assert.ok(!f.feedback.textContent.includes(token));
  await f.controller.complete();
  assert.equal(updates.length, 1);
});

test('expiration and revoked recovery authorization discard the capability and require a new link', async t => {
  let updates = 0;
  const f = fixture(t, { completeRecovery: async () => { updates++; } },
    { kind: 'recovery', accessToken: jwt(), expiresAt: now + 1000 });
  f.passwordForm.elements.password.value = f.passwordForm.elements.confirmation.value = 'new-fixture-password';
  f.advance(1001);
  await f.controller.complete();
  assert.equal(updates, 0);
  assert.equal(f.get('account-recovery-completion').hidden, true);
  assert.equal(f.passwordForm.elements.password.value, '');
  assert.match(f.feedback.textContent, /venció/);
});

test('Auth rejection clears fields and ends recovery without rendering the remote message', async t => {
  const f = fixture(t, { completeRecovery: async () => { throw Object.assign(new Error('private-token-account'), { status: 401 }); } },
    { kind: 'recovery', accessToken: jwt(), expiresAt: now + 60000 });
  f.passwordForm.elements.password.value = f.passwordForm.elements.confirmation.value = 'new-fixture-password';
  await f.controller.complete();
  assert.equal(f.passwordForm.elements.password.value, '');
  assert.equal(f.get('account-recovery-completion').hidden, true);
  assert.match(f.feedback.textContent, /Solicita uno nuevo/);
  assert.ok(!f.feedback.textContent.includes('private'));
});

test('duplicate recovery submits cannot change a password twice while a request is pending', async t => {
  let finish, calls = 0;
  const f = fixture(t, { completeRecovery: () => { calls++; return new Promise(resolve => { finish = resolve; }); } },
    { kind: 'recovery', accessToken: jwt(), expiresAt: now + 60000 });
  f.passwordForm.elements.password.value = f.passwordForm.elements.confirmation.value = 'new-fixture-password';
  const pending = f.controller.complete();
  await f.controller.complete();
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.equal(f.get('complete-account-recovery-button').disabled, false);
});
