import {test} from 'node:test';
import assert from 'node:assert/strict';
import {durableRequest} from '../durable-requests.mjs';
import {createAccessSandbox} from '../access-sandbox.mjs';

const storage = () => {const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};

test('lost commit reply reuses a durable ID across callers, while a new intentional creation gets a new ID',async()=>{
  const store=storage(),ids=[],result=crypto.randomUUID();
  const args={storage:store,scope:'fixture-owner/project',operation:'patient',payload:{family:'fixture',patient_name:'fixture-name'}};
  await assert.rejects(durableRequest({...args,send:async p=>{ids.push(p.request_id);throw Error('lost reply');}}),/lost reply/);
  assert.ok(!JSON.stringify([...store.values]).includes('fixture-name'));
  await durableRequest({...args,send:async p=>{ids.push(p.request_id);return result;}});
  await durableRequest({...args,send:async p=>{ids.push(p.request_id);return result;}});
  assert.equal(ids[0],ids[1]);assert.notEqual(ids[1],ids[2]);assert.equal(store.values.size,0);
});

test('failed durable storage never submits a creation',async()=>{
  let sent=false;
  await assert.rejects(durableRequest({storage:{getItem(){throw Error();}},scope:'fixture',operation:'family',payload:{},send:async()=>{sent=true;}}),/no se envió/);
  assert.equal(sent,false);
});

test('failed removal leaves a confirmed ticket, so another intentional creation uses a fresh id',async()=>{
  const store=storage();store.removeItem=()=>{throw Error('read-only removal');};const ids=[];
  const args={storage:store,scope:'fixture',operation:'patient',payload:{name:'fixture'},send:async p=>{ids.push(p.request_id);return crypto.randomUUID();}};
  await durableRequest(args);await durableRequest(args);assert.notEqual(ids[0],ids[1]);
});

test('unacknowledgeable confirmed writes report their committed result instead of pretending a new creation succeeded',async()=>{
  const store=storage(),original=store.setItem;const result=crypto.randomUUID();
  store.setItem=(key,value)=>{if(JSON.parse(value).state==='confirmed')throw Error('denied');return original(key,value);};
  store.removeItem=()=>{throw Error('denied');};
  await assert.rejects(durableRequest({storage:store,scope:'fixture',operation:'patient',payload:{},send:async()=>result}),error=>error.saved===true&&error.result===result);
});

test('SQL creation requests preserve legitimate duplicates, reject changed payload and isolate owners',async t=>{
  const sandbox=await createAccessSandbox();t.after(()=>sandbox.close());
  const send=async(path,body,token)=>{const r=await sandbox.handle(new Request('http://127.0.0.1:4180'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token&&{Authorization:'Bearer '+token})},...(body&&{body:JSON.stringify(body)})}));return {status:r.status,data:await r.json()};};
  const login=async email=>(await send('/auth/v1/token',{email,password:'Acompana-demo-2026!'})).data.access_token;
  const owner=await login('admin@acompana.test'),other=await login('otra@acompana.test');
  const family=(await send('/rest/v1/families',null,owner)).data[0].id;
  const params={family,request_id:crypto.randomUUID(),patient_name:'Ficha ficticia'};
  const a=await send('/rest/v1/rpc/add_patient_once',params,owner);
  const b=await send('/rest/v1/rpc/add_patient_once',params,owner);
  assert.equal(a.status,200);assert.equal(b.data,a.data);
  assert.equal((await send('/rest/v1/rpc/add_patient_once',{...params,patient_name:'Cambio'},owner)).status,409);
  assert.equal((await send('/rest/v1/rpc/add_patient_once',params,other)).status,403);
  const intentional=await send('/rest/v1/rpc/add_patient_once',{...params,request_id:crypto.randomUUID()},owner);
  assert.notEqual(intentional.data,a.data);
  const f={request_id:crypto.randomUUID(),family_name:'Familia ficticia'};
  const first=await send('/rest/v1/rpc/create_family_once',f,owner);
  assert.equal(first.status,200);assert.equal((await send('/rest/v1/rpc/create_family_once',f,owner)).data,first.data);
});
