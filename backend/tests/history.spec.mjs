import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHistoryWindow, historyCursor } from '../history.mjs';
import { readInventoryHistory } from '../inventory.mjs';
import { loadAppliedPayments, loadReceiptCancellations } from '../finance.mjs';

const id = value => String(value).padStart(6, '0');
function split(expression) {
  let depth = 0, quoted = false, escaped = false, start = 0;
  const parts = [];
  for (let index = 0; index < expression.length; index++) {
    const ch = expression[index];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quoted) { escaped = true; continue; }
    if (ch === '"') quoted = !quoted;
    if (quoted) continue;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { parts.push(expression.slice(start, index)); start = index + 1; }
  }
  parts.push(expression.slice(start)); return parts;
}
function matches(row, expression) {
  if (expression.startsWith('and(')) return split(expression.slice(4, -1)).every(part => matches(row, part));
  const [, field, op, raw] = expression.match(/^([a-z_]+)\.(eq|gt|lt|is|not\.is)\.(.*)$/) ?? [];
  assert.ok(field, 'El cursor debe usar una expresión PostgREST reconocida.');
  if (op === 'is') return row[field] == null;
  if (op === 'not.is') return row[field] != null;
  const value = raw.startsWith('"') ? JSON.parse(raw) : Number(raw);
  return op === 'eq' ? row[field] === value : row[field] != null && (op === 'gt' ? row[field] > value : row[field] < value);
}
function fixture(tables, onSelect) {
  const calls = [];
  return { calls, async select(table, params) {
    calls.push({ table, ...params });
    const rows = [...tables[table]];
    const keys = params.order.split(',').map(value => value.split('.'));
    rows.sort((a, b) => {
      for (const [key, direction, nulls] of keys) {
        if (a[key] === b[key]) continue;
        if (a[key] == null || b[key] == null) return (a[key] == null ? -1 : 1) * ((nulls ?? (direction === 'desc' ? 'nullsfirst' : 'nullslast')) === 'nullsfirst' ? 1 : -1);
        return (a[key] < b[key] ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    const result = rows.filter(row => !params.or || split(params.or.slice(1, -1)).some(expression => matches(row, expression))).slice(0, params.limit);
    onSelect?.(calls.length, tables);
    return result;
  } };
}

test('history reaches beyond 1000 rows with same-date ties and bounded keyset requests', async () => {
  const rows = Array.from({length: 1205}, (_, index) => ({ id: id(index), paid_on: '2026-11-18' }));
  const client = fixture({ receipts: rows });
  const result = await readHistoryWindow(client, 'receipts', {family_id:'eq.family',order:'paid_on.desc,id.desc',select:'id,paid_on'}, 1200);
  assert.equal(result.rows.length, 1200); assert.equal(result.hasMore, true);
  assert.deepEqual(result.rows.map(row => row.id), rows.toReversed().slice(0,1200).map(row=>row.id));
  assert.ok(client.calls.every(call => call.limit <= 200 && call.family_id === 'eq.family' && call.offset === undefined));
});

test('new rows inserted above the cursor do not duplicate or skip the loaded historical prefix', async () => {
  const rows = Array.from({length: 250}, (_, index) => ({id:id(index),day:'2026-11-18'}));
  const client = fixture({ rows:[...rows] }, (call, tables) => {
    if(call===1) tables.rows.push({id:'999999',day:'2026-11-19'});
  });
  const result = await readHistoryWindow(client,'rows',{order:'day.desc,id.desc'},220);
  assert.deepEqual(result.rows.map(row=>row.id),rows.toReversed().slice(0,220).map(row=>row.id));
  assert.equal(new Set(result.rows.map(row=>row.id)).size,220);
});

test('nullable appointment times keep nulls last across page boundaries and preserve filters', async () => {
  const rows = Array.from({length: 450}, (_, index) => ({id:id(index),day:'2026-11-18',at:index<210?'09:00':null}));
  const client = fixture({ rows });
  const result = await readHistoryWindow(client,'rows',{order:'day.asc,at.asc.nullslast,id.asc',family_id:'eq.family',patient_id:'eq.patient'},430);
  assert.deepEqual(result.rows.map(row=>row.id),rows.slice(0,430).map(row=>row.id));
  assert.ok(client.calls.every(call=>call.patient_id==='eq.patient'&&call.family_id==='eq.family'));
  assert.ok(client.calls.some(call=>call.or?.includes('at.is.null')));
});

test('history distinguishes an exact last page from a page with one more record and rejects stalled servers', async () => {
  for(const length of [0,20,21]) {
    const client=fixture({rows:Array.from({length},(_,i)=>({id:id(i)}))});
    const result=await readHistoryWindow(client,'rows',{order:'id.asc'});
    assert.equal(result.rows.length,Math.min(20,length));assert.equal(result.hasMore,length>20);
  }
  const rows=Array.from({length:200},(_,i)=>({id:id(i)}));
  await assert.rejects(readHistoryWindow({select:async()=>rows},'rows',{order:'id.asc'},220),/cambió/);
  assert.throws(()=>historyCursor('date.desc',{date:'2026-11-18'}),/identificador/);
});

test('cursor quotes commas, parentheses and quotes rather than interpreting historical values as filters', () => {
  const row={legacy_day:'fecha, extra ("texto")',id:'stable'};
  const cursor=historyCursor('legacy_day.desc,id.desc',row);
  assert.equal(split(cursor.slice(1,-1)).some(expression=>matches(row,expression)),false);
  assert.equal(split(cursor.slice(1,-1)).some(expression=>matches({...row,id:'earlier'},expression)),true);
});

test('inventory merges two complete source windows without hiding older purchases or quotes', async () => {
  const purchases=Array.from({length:35},(_,i)=>({id:id(i),purchased_on:'2026-11-18',observed_at:i+1}));
  const quotes=Array.from({length:25},(_,i)=>({id:id(100+i),quoted_on:'2026-11-18'}));
  const client=fixture({inventory_purchases:purchases,inventory_quotes:quotes});
  const first=await readInventoryHistory(client,'family','patient',20);
  assert.equal(first.rows.length,20);assert.equal(first.hasMore,true);
  const all=await readInventoryHistory(client,'family','patient',60);
  assert.equal(all.rows.length,60);assert.equal(all.hasMore,false);
  assert.equal(all.rows.filter(row=>row.purchased_on).length,35);
  assert.equal(all.rows.filter(row=>row.quoted_on).length,25);
  assert.deepEqual(all.rows.filter(row=>row.purchased_on).map(row=>row.observed_at),purchases.toReversed().map(row=>row.observed_at));
  assert.ok(client.calls.every(call=>call['inventory_items.patient_id']==='eq.patient'&&call.select.includes('inventory_items!inner')));
});

test('allocation lookups bound the list of shift IDs when long history windows are loaded', async () => {
  const calls=[];
  const result=await loadAppliedPayments({select:async(table,params)=>{calls.push(params);return []; }},'family',Array.from({length:250},(_,i)=>({id:id(i)})));
  assert.equal(result.size,0);assert.equal(calls.length,3);
  assert.ok(calls.every(call=>call.shift_id.slice(4,-1).split(',').length<=100));
});

test('old receipt cancellations remain visible with bounded sequential lookups', async () => {
  let inFlight=0,maxInFlight=0;
  const calls=[];
  const client={async select(table,params){
    assert.equal(table,'receipt_cancellations');assert.equal(params.family_id,'eq.family');
    calls.push(params);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
    await Promise.resolve();inFlight--;
    return params.receipt_id.slice(4,-1).split(',').map(receipt_id=>({receipt_id,cancelled_on:'2026-11-18'}));
  }};
  const receipts=Array.from({length:250},(_,i)=>({id:id(i)}));
  const rows=await loadReceiptCancellations(client,'family',receipts);
  assert.equal(rows.length,250);assert.equal(calls.length,3);assert.equal(maxInFlight,1);
  assert.deepEqual(rows.map(row=>row.receipt_id),receipts.map(row=>row.id));
});
