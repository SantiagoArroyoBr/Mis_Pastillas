import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {legacyHistoryRows,createLegacyHistory} from '../legacy-history.mjs';

test('historical tables distinguish homonyms, hide amounts and page without losing original rows',async()=>{
  const source=JSON.parse(await readFile(new URL('./fixtures/main-backup.json',import.meta.url),'utf8'));
  const rows=legacyHistoryRows(source,2);
  assert.deepEqual(rows.total,{coverage:3,assignments:5,staff:3});
  assert.equal(rows.more,true);assert.equal(rows.coverage.length,2);
  assert.ok(rows.coverage.every(row=>['••••','No registrado'].includes(row[3])));
  const all=legacyHistoryRows(source,20,true);
  assert.equal(all.more,false);assert.equal(all.assignments.length,5);
  assert.ok(all.coverage.every(row=>row[3].endsWith(' MXN')||row[3]==='No registrado'));
  assert.ok(all.staff.some(row=>row[0].endsWith('ficha 1')));
  assert.ok(all.staff.some(row=>row[0].endsWith('ficha 2')));
  assert.equal(JSON.stringify(source).includes('••••'),false,'Privacy masking never mutates the backup.');
});

function ui(t){
  class Element{
    hidden=false;disabled=false;value='';textContent='';children=[];listeners=new Map();
    addEventListener(name,fn){this.listeners.set(name,fn);}
    setAttribute(name,value){this[name]=value;}
    replaceChildren(...values){this.children=values;}
    append(...values){this.children.push(...values);}
  }
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const originals=['document','window'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:get,createElement:()=>new Element()}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{AcompanaCompatibility:{prepareMigratedState:x=>x}}});
  t.after(()=>{for(const [key,descriptor]of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];});
  const controller=createLegacyHistory({run:fn=>fn,status:()=>{},renderTable:(body,rows)=>body.replaceChildren(...rows)});
  return {get,controller};
}
test('owner history ignores delayed former-family results and never requests privileged data offline or as caregiver',async t=>{
  const {controller,get}=ui(t);let resolve,calls=0;
  const client={select:()=>{calls++;return new Promise(r=>resolve=r);}};
  await controller.load(client,'family-a',false);await controller.load({...client,readOnly:true},'family-a',true);
  assert.equal(calls,0);
  const pending=controller.load(client,'family-a',true);controller.clear();resolve([]);await pending;
  assert.equal(get('legacy-history').hidden,true);assert.equal(get('download-legacy-original').disabled,true);
});
test('every preserved source can be selected and switching it hides previously revealed amounts',async t=>{
  const {controller,get}=ui(t);
  const raw=await readFile(new URL('./fixtures/main-backup.json',import.meta.url),'utf8');
  const rows=[0,1].map(i=>({id:String(i),original_json:raw,imported_at:'2026-11-20T12:00:00Z'}));
  await controller.load({select:async(table,params)=>params.offset?[]:rows},'family-a',true);
  assert.equal(get('legacy-source-label').hidden,false);assert.equal(get('legacy-source').children.length,2);
  get('legacy-amount-toggle').listeners.get('click')();
  assert.equal(get('legacy-amount-toggle')['aria-pressed'],'true');
  get('legacy-source').value='1';get('legacy-source').listeners.get('change')();
  assert.equal(get('legacy-amount-toggle')['aria-pressed'],'false');
  assert.ok(get('legacy-coverage').children.every(row=>['••••','No registrado'].includes(row[3])));
  controller.clear();
});

test('staff integration requires an explicit destination and retries the same source identity without copying ambiguous rates',async t=>{
 const {controller,get}=ui(t);
 const oldConfirm=Object.getOwnPropertyDescriptor(globalThis,'confirm');Object.defineProperty(globalThis,'confirm',{configurable:true,value:()=>true});
 t.after(()=>oldConfirm?Object.defineProperty(globalThis,'confirm',oldConfirm):delete globalThis.confirm);
 const raw=await readFile(new URL('./fixtures/main-backup.json',import.meta.url),'utf8');let reject=true;const requests=[];
 const client={select:async(table,params)=>table==='legacy_snapshots'&&!params.offset?[{id:'source-a',source_sha:'f'.repeat(64),original_json:raw,imported_at:'2026-11-21'}]:[],
 rpc:async(name,args)=>{requests.push({name,args});if(reject)throw Error('network');return 'integrated-id';}};
 await controller.load(client,'family-a',true,[{id:'patient-a',name:'Ficha ficticia'}]);
 const action=get('legacy-staff').children[0][3],select=action.children[0],button=action.children[1];
 await assert.rejects(button.listeners.get('click')(),/Selecciona/);
 assert.equal(requests.length,0);select.value='patient-a';
 await assert.rejects(button.listeners.get('click')(),/network/);reject=false;await button.listeners.get('click')();
 assert.deepEqual(requests[0],requests[1]);
 assert.deepEqual(requests[0].args,{family:'family-a',snapshot:'source-a',patient_index:0,staff_index:0,patient:'patient-a'});
 controller.clear();
});
