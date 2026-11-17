import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccessSandbox } from '../access-sandbox.mjs';

test('isolated gateway activates named access, scopes two owners and invalidates old sessions on reset', async t => {
  const origin='http://127.0.0.1:4180';
  const sandbox=await createAccessSandbox(origin);t.after(()=>sandbox.close());
  const send=async(path,body,token)=>{
    const response=await sandbox.handle(new Request(origin+path,{method:body===undefined?'GET':'POST',
      headers:{Origin:origin,'Content-Type':'application/json',...(token&&{Authorization:'Bearer '+token})},
      ...(body!==undefined&&{body:JSON.stringify(body)})}));
    return {status:response.status,body:await response.json()};
  };
  const login=async(email,password='Acompana-demo-2026!')=>(await send('/auth/v1/token',{email,password})).body.access_token;
  const owner=await login('admin@acompana.test'),other=await login('otra@acompana.test');
  const families=(await send('/rest/v1/families',undefined,owner)).body;
  assert.equal(families.length,2);
  const family=families[0].id;
  const issued=await send('/api/access',{action:'issue',family,name:'Ana de prueba',expiresAt:new Date(Date.now()+86400000).toISOString()},owner);
  assert.equal(issued.status,200);assert.ok(issued.body.code);assert.ok(issued.body.login);
  assert.equal((await send('/api/access',{action:'revoke',family,access:issued.body.id,revision:1},other)).status,403);
  const active=await send('/api/access',{action:'activate',code:issued.body.code,password:'Temporal-ensayo-2026!'});
  assert.equal(active.status,200,JSON.stringify(active.body));
  assert.equal((await send('/api/access',{action:'activate',code:issued.body.code,password:'Temporal-ensayo-2026!'})).status,400);
  const temporary=await login(active.body.login+'@acompana.invalid','Temporal-ensayo-2026!');
  assert.ok(temporary);
  assert.equal((await send('/rest/v1/families',undefined,temporary)).body.length,1);
  assert.equal((await send('/rest/v1/temporary_accesses',undefined,temporary)).body.length,0);
  assert.equal((await send('/rest/v1/rpc/create_family',{family_name:'No permitido'},temporary)).status,403);
  assert.equal((await send('/api/access',{action:'issue',family,name:'Intruso',expiresAt:new Date(Date.now()+86400000).toISOString()},temporary)).status,403);
  const rows=(await send('/rest/v1/temporary_accesses',undefined,owner)).body;
  assert.equal(rows[0].display_name,'Ana de prueba');
  assert.ok(!JSON.stringify(rows).includes(issued.body.code));
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '3 seconds'");
  const reset=await send('/api/access',{action:'reset',family,access:rows[0].id,revision:rows[0].revision},owner);
  assert.equal(reset.status,200);
  assert.equal((await send('/rest/v1/families',undefined,temporary)).body.length,0);
  const reactivated=await send('/api/access',{action:'activate',code:reset.body.code,password:'Nueva-ensayo-2026!'});
  assert.equal(reactivated.status,200);
  assert.equal((await send('/rest/v1/families',undefined,temporary)).body.length,0,'old JWT must stay denied after reactivation');
  const renewed=await login(active.body.login+'@acompana.invalid','Nueva-ensayo-2026!');
  assert.equal((await send('/rest/v1/families',undefined,renewed)).body.length,1);
  assert.equal(sandbox.mailbox.length,0,'temporary lifecycle must send no mail');
});

test('mail quota is durable across requests and replies never expose secrets',async t=>{
  const origin='http://127.0.0.1:4180',sandbox=await createAccessSandbox(origin);t.after(()=>sandbox.close());
  const send=async(originHeader=origin)=>sandbox.handle(new Request(origin+'/api/access',{method:'POST',
    headers:{Origin:originHeader,'Content-Type':'application/json'},body:JSON.stringify({action:'auth-email',kind:'recover',email:'fixture@example.test'})}));
  assert.equal((await send('https://other.example')).status,403);
  assert.equal((await send()).status,200);
  const repeat=await send();assert.equal(repeat.status,429);
  assert.equal(sandbox.mailbox.length,1);
  assert.equal((await sandbox.db.query("select day_count from acompana_private.request_limits where bucket='global:mail'")).rows[0].day_count,1,
    'a denied repeat must not consume another global send');
  const text=await repeat.text();assert.ok(!text.includes('fixture@'));assert.ok(!text.includes('service'));
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '61 seconds'");
  assert.equal((await send()).status,200);
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '61 seconds'");
  assert.equal((await send()).status,200);
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '61 seconds'");
  assert.equal((await send()).status,429);
  assert.equal(sandbox.mailbox.length,3);
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '61 seconds',hour_start=now()-interval '61 minutes'");
  assert.equal((await send()).status,200);
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '61 seconds'");
  assert.equal((await send()).status,200);
  await sandbox.db.exec("update acompana_private.request_limits set last_at=now()-interval '61 seconds'");
  assert.equal((await send()).status,429,'five messages per rolling day');
  await sandbox.db.exec("update acompana_private.request_limits set day_count=250 where bucket='global:mail'");
  const capped=await sandbox.handle(new Request(origin+'/api/access',{method:'POST',headers:{Origin:origin},
    body:JSON.stringify({action:'auth-email',kind:'recover',email:'another@example.test'})}));
  assert.equal(capped.status,429,'global budget below Brevo 300');
  assert.equal(sandbox.mailbox.length,5);
  const oversized=await sandbox.handle(new Request(origin+'/api/access',{method:'POST',headers:{Origin:origin},body:'x'.repeat(9000)}));
  assert.equal(oversized.status,413);
});
