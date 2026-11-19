import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccessSandbox } from '../access-sandbox.mjs';
import { readHistoryWindow } from '../history.mjs';

test('sandbox REST preserves dates, stable cursor history, nested RLS relationships and pagination',async t=>{
  const origin='http://127.0.0.1:4180',sandbox=await createAccessSandbox(origin);
  t.after(()=>sandbox.close());
  const send=async(path,token,body)=>{
    const response=await sandbox.handle(new Request(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token&&{Authorization:'Bearer '+token})},...(body&&{body:JSON.stringify(body)})}));
    return {status:response.status,data:await response.json()};
  };
  const login=async email=>(await send('/auth/v1/token',undefined,{email,password:'Acompana-demo-2026!'})).data;
  const owner=await login('admin@acompana.test'),outsider=await login('otra@acompana.test');
  const families=(await send('/rest/v1/families',owner.access_token)).data;
  const family=families[0].id,patient=crypto.randomUUID(),item=crypto.randomUUID();
  await sandbox.db.query('insert into public.patients(family_id,id,name) values($1,$2,$3)',[family,patient,'Paciente']);
  await sandbox.db.query("insert into public.inventory_items(family_id,id,patient_id,name,kind,initial_quantity,initial_at,base_quantity,base_at,consumptions,actor_id) values($1,$2,$3,'Insumo','sup',1,1,1,1,'[]',$4)",[family,item,patient,owner.user.id]);
  await sandbox.db.query("insert into public.inventory_profiles(family_id,item_id,name,consumptions) values($1,$2,'Pauta','[]')",[family,item]);
  await sandbox.db.query("insert into public.inventory_quotes(family_id,id,item_id,quantity,total_price,quoted_on,shop,actor_id) values($1,$2,$3,1,20,'2026-11-18','Fixture',$4)",[family,crypto.randomUUID(),item,owner.user.id]);
  await sandbox.db.query("insert into public.inventory_purchases(family_id,id,item_id,quantity,total_price,purchased_on,shop,prior_revision,stock_before,observed_at,actor_id) values($1,$2,$3,2,30,'2026-11-17','Fixture',1,1,1,$4)",[family,crypto.randomUUID(),item,owner.user.id]);
  await sandbox.db.query("insert into public.appointments(family_id,id,patient_id,appointment_day,appointment_time,location,notes,actor_id) select $1,md5(g::text)::uuid,$2,'2026-11-18'::date,case when g<=210 then '09:00'::time else null end,'','',$3 from generate_series(1,450) g",[family,patient,owner.user.id]);
  const client={select:async(table,params)=>{
    const response=await send('/rest/v1/'+table+'?'+new URLSearchParams(params),owner.access_token);
    assert.equal(response.status,200,JSON.stringify(response.data));return response.data;
  }};
  const params={family_id:'eq.'+family,select:'id,appointment_day,appointment_time',order:'appointment_day.asc,appointment_time.asc.nullslast,id.asc'};
  const all=await client.select('appointments',{...params,limit:1000});
  assert.equal(all.length,450);assert.equal(all[0].appointment_day,'2026-11-18');
  assert.equal(all[209].appointment_time,'09:00:00');assert.equal(all[210].appointment_time,null);
  const history=await readHistoryWindow(client,'appointments',params,430);
  assert.deepEqual(history.rows,all.slice(0,430));assert.equal(history.hasMore,true);
  assert.deepEqual(await client.select('appointments',{...params,offset:200,limit:20}),all.slice(200,220));
  const relation=await client.select('inventory_quotes',{select:'quoted_on,inventory_items!inner(id,name,patient_id,patients(name),inventory_profiles(name,consumptions))','inventory_items.patient_id':'eq.'+patient});
  assert.equal(relation[0].quoted_on,'2026-11-18');assert.equal(relation[0].inventory_items.patients.name,'Paciente');
  assert.deepEqual(relation[0].inventory_items.inventory_profiles,[{name:'Pauta',consumptions:[]}]);
  const purchases=await client.select('inventory_purchases',{select:'purchased_on,inventory_items!inner(name,patients(name))'});
  assert.deepEqual(purchases,[{purchased_on:'2026-11-17',inventory_items:{name:'Insumo',patients:{name:'Paciente'}}}]);
  assert.deepEqual(await client.select('inventory_quotes',{select:'id,inventory_items!inner(id)','inventory_items.patient_id':'eq.'+crypto.randomUUID()}),[]);
  assert.deepEqual((await send('/rest/v1/inventory_quotes?select=id,inventory_items!inner(id,patients(name))',outsider.access_token)).data,[]);
  const ids=all.slice(0,3).map(row=>row.id);
  assert.equal((await client.select('appointments',{select:'id',id:'in.('+ids.join(',')+')',appointment_time:'not.is.null'})).length,3);
  assert.equal((await client.select('appointments',{select:'id',and:'(appointment_day.eq.2026-11-18,or(appointment_time.is.null,and(appointment_time.not.is.null,id.eq.'+ids[0]+')))'})).length,241);
  assert.equal((await send('/rest/v1/appointments?appointment_day=unsupported.foo',owner.access_token)).status,400);
  assert.equal((await send('/rest/v1/appointments?limit=-1',owner.access_token)).status,400);
});
