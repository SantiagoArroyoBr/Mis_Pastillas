import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccessSandbox} from '../access-sandbox.mjs';

test('nurse creation retries preserve one record, isolate owners and keep intentional duplicate names',async t=>{
  const sandbox=await createAccessSandbox();t.after(()=>sandbox.close());
  const send=async(path,body,token)=>{const r=await sandbox.handle(new Request('http://127.0.0.1:4180'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token&&{Authorization:'Bearer '+token})},...(body&&{body:JSON.stringify(body)})}));return {status:r.status,data:await r.json()};};
  const login=async(email)=>(await send('/auth/v1/token',{email,password:'Acompana-demo-2026!'})).data.access_token;
  const owner=await login('admin@acompana.test'),other=await login('otra@acompana.test');
  const family=(await send('/rest/v1/families',null,owner)).data[0].id;
  const params={family,request_id:crypto.randomUUID(),nurse_name:'Enfermería ficticia',full_rate:'30000',half_rate:'15000'};
  const first=await send('/rest/v1/rpc/add_nurse_once',params,owner);
  assert.equal(first.status,200);
  assert.equal((await send('/rest/v1/rpc/add_nurse_once',params,owner)).data,first.data);
  assert.equal((await send('/rest/v1/rpc/add_nurse_once',{...params,full_rate:'40000'},owner)).status,409);
  assert.equal((await send('/rest/v1/rpc/add_nurse_once',params,other)).status,403);
  assert.equal((await send('/rest/v1/rpc/add_nurse_once',params)).status,403);
  assert.notEqual((await send('/rest/v1/rpc/add_nurse_once',{...params,request_id:crypto.randomUUID()},owner)).data,first.data);
  const rows=(await send('/rest/v1/nurses?family_id=eq.'+family,null,owner)).data;
  assert.equal(rows.length,2);assert.ok(rows.every(row=>String(row.full_cents)==='30000'));
});
