import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminAccess, temporaryAccessState } from '../admin-access.mjs';

function fixture(t, { onChange = async () => {} } = {}) {
  class Element {
    hidden = false;
    value = '';
    children = [];
    listeners = new Map();
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this[name] = value; }
    reset() { this.elements.expires.value = ''; }
    focus() {}
  }
  const ids = new Map();
  const get = id => {
    if (!ids.has(id)) ids.set(id, new Element());
    return ids.get(id);
  };
  get('create-temporary-access').elements = { expires: new Element() };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: get, createElement: () => new Element() } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const rendered = [];
  const notices = [];
  const controller = createAdminAccess({
    run: action => action,
    status: (...notice) => notices.push(notice),
    actionButton: (name, label, action) => ({ name, label, action }),
    renderTable: (body, rows) => { body.replaceChildren(...rows); rendered.push(rows); },
    onChange
  });
  return { get, rendered, controller, notices };
}

const row = (id, name) => ({ id, display_name: name, revision: 1, state: 'active',
  expires_at: '2035-12-31T23:59:59Z', revoked_at: null, user_id: 'synthetic-user' });

test('admin panel does not request names or codes for caregivers and disabled environments', async t => {
  const { controller, get } = fixture(t);
  const client = { temporaryAccessEnabled: true, select: () => { throw new Error('must not read private rows'); } };
  await controller.load(client, 'family-a', false);
  await controller.load({ ...client, temporaryAccessEnabled: false }, 'family-a', true);
  assert.equal(get('admin-access-controls').hidden, true);
  assert.equal(get('temporary-access-code').value, '');
  assert.deepEqual(get('temporary-access-list').children, []);
});

test('switching families clears a displayed activation and ignores the previous response', async t => {
  const { controller, get, rendered } = fixture(t);
  let finishPrevious;
  const client = {
    temporaryAccessEnabled: true,
    select: async (table, params) => {
      assert.equal(table, 'temporary_accesses');
      assert.ok(!params.select.includes('hash'));
      if(params.offset>0)return [];
      if (params.family_id === 'eq.family-a') return new Promise(resolve => { finishPrevious = resolve; });
      assert.equal(params.family_id, 'eq.family-b');
      return [row('b', '<img src=x onerror=alert(1)>')];
    }
  };
  const previous = controller.load(client, 'family-a', true);
  get('temporary-access-code').value = 'secret-from-family-a';
  get('temporary-access-login').value = 'temp-family-a';
  const next = controller.load(client, 'family-b', true);
  assert.equal(get('temporary-access-code').value, '');
  assert.equal(get('temporary-access-login').value, '');
  await next;
  finishPrevious([row('a', 'Wrong family')]);
  await previous;
  assert.equal(rendered.length, 1);
  // The renderer receives a text value, never HTML or a constructed element for a name.
  assert.equal(rendered[0][0][0], '<img src=x onerror=alert(1)>');
  assert.equal(get('temporary-access-list').children[0][0], '<img src=x onerror=alert(1)>');
});

test('losing ownership during a request leaves no stale administrative rows', async t => {
  const { controller, get, rendered } = fixture(t);
  let resolveRows;
  const client = { temporaryAccessEnabled: true, select: (table,params) => params.offset>0?[]:new Promise(resolve => { resolveRows = resolve; }) };
  const loading = controller.load(client, 'family-a', true);
  await controller.load(client, 'family-a', false);
  resolveRows([row('a', 'Private caregiver')]);
  await loading;
  assert.equal(rendered.length, 0);
  assert.equal(get('admin-access-controls').hidden, true);
  assert.deepEqual(get('temporary-access-list').children, []);
});

test('expired active accesses are displayed as expired independently of stored state', () => {
  assert.equal(temporaryAccessState({ state: 'active', expires_at: '2026-11-16T12:00:00Z' }, Date.parse('2026-11-17T12:00:00Z')), 'Vencido');
  assert.equal(temporaryAccessState({ state: 'active', expires_at: '2026-11-18T12:00:00Z' }, Date.parse('2026-11-17T12:00:00Z')), 'Activo');
  assert.equal(temporaryAccessState({ state: 'pending', expires_at: '2026-11-18T12:00:00Z' }, Date.parse('2026-11-17T12:00:00Z')), 'Pendiente de activación');
  assert.equal(temporaryAccessState({ state: 'active', revoked_at: '2026-11-16T12:00:00Z', expires_at: '2026-11-18T12:00:00Z' }), 'Revocado');
});

test('a confirmed access keeps its activation code when the following list refresh fails', async t => {
  const {controller,get,notices}=fixture(t,{onChange:async()=>{throw Error('lost read');}});
  const original=globalThis.FormData;
  globalThis.FormData=class {get(name){return {name:'Persona ficticia',expires:'2035-12-31'}[name];}};
  t.after(()=>{globalThis.FormData=original;});
  let issued=0;
  const client={temporaryAccessEnabled:true,select:async()=>[],access:async()=>{
    issued++;return {code:'fixture-one-time-code',login:'temp-fixture'};
  }};
  await controller.load(client,'family-a',true);
  await get('create-temporary-access').listeners.get('submit')({currentTarget:get('create-temporary-access')});
  assert.equal(issued,1);
  assert.equal(get('temporary-access-result').hidden,false);
  assert.equal(get('temporary-access-code').value,'fixture-one-time-code');
  assert.match(notices.at(-1)[0],/Acceso creado.*no repitas/);
  assert.equal(notices.at(-1)[1],'warning');
});

test('a confirmed reset retains the new activation and reports success separately from failed refresh', async t => {
  const {controller,get,notices}=fixture(t,{onChange:async()=>{throw Error('lost read');}});
  const previous=globalThis.confirm;globalThis.confirm=()=>true;
  t.after(()=>previous===undefined?delete globalThis.confirm:globalThis.confirm=previous);
  let resets=0;
  const client={temporaryAccessEnabled:true,select:async(table,params)=>params.offset>0?[]:[row('a','Persona ficticia')],access:async(action)=>{
    assert.equal(action,'reset');resets++;return {code:'fixture-new-code',login:'temp-fixture'};
  }};
  await controller.load(client,'family-a',true);
  const actions=get('temporary-access-list').children[0][2].children;
  await actions.find(action=>action.label==='Restablecer acceso').action();
  assert.equal(resets,1);
  assert.equal(get('temporary-access-code').value,'fixture-new-code');
  assert.match(notices.at(-1)[0],/Recuperación preparada.*No repitas/);
  assert.equal(notices.at(-1)[1],'warning');
});
