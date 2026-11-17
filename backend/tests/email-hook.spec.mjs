import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createEmailHook} from '../email-hook.mjs';

async function fixture(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,directory),'utf8'));
  const secret=randomBytes(32),sends=[],calls=[];
  let provider=async()=>Response.json({messageId:'fixture-message'},{status:201}),loseAcknowledgement=false;
  const config={supabaseUrl:'https://fixture.supabase.co',serviceKey:'server-fixture-key',
    hookSecret:'v1,whsec_'+secret.toString('base64'),brevoApiKey:'brevo-private-fixture',
    senderEmail:'access@fixture.test',redirectUrl:'https://app.fixture.test/'};
  const fetcher=async(url,options)=>{
    calls.push(url);
    const body=JSON.parse(options.body);
    if(url==='https://api.brevo.com/v3/smtp/email') {
      assert.equal(options.headers['api-key'],config.brevoApiKey);sends.push(body);return provider(body);
    }
    assert.equal(options.headers.Authorization,'Bearer '+config.serviceKey);
    const name=new URL(url).pathname.split('/').pop();
    assert.ok(['claim_auth_email','finish_auth_email'].includes(name));
    try {
      const result=await db.transaction(async tx=>{
        await tx.exec('set local role service_role');
        const args=Object.keys(body).map((key,i)=>'"'+key+'" => $'+(i+1)).join(',');
        return (await tx.query('select public."'+name+'"('+args+') as result',Object.values(body))).rows[0].result;
      });
      if(name==='finish_auth_email'&&loseAcknowledgement) throw new Error('fixture acknowledgement timeout');
      return Response.json(result);
    } catch(error){return Response.json({code:error.code},{status:400});}
  };
  const handle=createEmailHook(config,fetcher);
  function request(payload,id='msg_'+randomUUID(),timestamp=String(Math.floor(Date.now()/1000)),signatureOverride) {
    const raw=typeof payload==='string'?payload:JSON.stringify(payload);
    const signature=createHmac('sha256',secret).update(id+'.'+timestamp+'.'+raw).digest('base64');
    return new Request('https://fixture.supabase.co/functions/v1/auth-email',{method:'POST',
      headers:{'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':signatureOverride??'v1,'+signature},body:raw});
  }
  const payload=(email='admin@fixture.test',action='signup')=>({user:{id:randomUUID(),email},
    email_data:{email_action_type:action,token:'123456',token_hash:'a'.repeat(64),redirect_to:'https://malicious.fixture.test/',site_url:'https://malicious.fixture.test/'}});
  return {db,handle,request,payload,sends,calls,provider:fn=>provider=fn,config,
    loseAcknowledgement:()=>{loseAcknowledgement=true;}};
}

test('a lost SQL delivery acknowledgement does not turn an accepted email into an Auth failure',async t=>{
  const f=await fixture(t),payload=f.payload(),id='msg_'+randomUUID();
  f.loseAcknowledgement();
  assert.equal((await f.handle(f.request(payload,id))).status,200);
  assert.equal((await f.handle(f.request(payload,id))).status,200);
  assert.equal(f.sends.length,1);
  assert.equal((await f.db.query('select state from acompana_private.auth_email_deliveries')).rows[0].state,'sent');
});

test('signed hook deduplicates delivery, keeps links action-specific and never trusts payload redirects',async t=>{
  const f=await fixture(t),payload=f.payload(),id='msg_'+randomUUID();
  assert.equal((await f.handle(f.request(payload,id))).status,200);
  assert.equal((await f.handle(f.request(payload,id))).status,200);
  assert.equal(f.sends.length,1);
  assert.match(f.sends[0].textContent,/type=signup/);
  assert.match(f.sends[0].htmlContent,/<a href="https:\/\/fixture\.supabase\.co\/auth\/v1\/verify\?/);
  assert.ok(!f.sends[0].textContent.includes('malicious'));
  assert.match(f.sends[0].textContent,/redirect_to=https%3A%2F%2Fapp.fixture.test%2F/);
  assert.deepEqual(f.sends[0].messageVersions,[{to:[{email:payload.user.email}]}]);
  assert.match(f.sends[0].headers.idempotencyKey,/^[0-9a-f-]{36}$/);
  const conflicting={...payload,email_data:{...payload.email_data,token_hash:'b'.repeat(64)}};
  assert.equal((await f.handle(f.request(conflicting,id))).status,503);
  assert.equal(f.sends.length,1);
  const ledger=JSON.stringify((await f.db.query('select * from acompana_private.auth_email_deliveries')).rows);
  assert.ok(!ledger.includes(payload.user.email));assert.ok(!ledger.includes(payload.email_data.token_hash));
});

test('hook verifies signatures, timestamps and bounded bodies before SQL or Brevo and fails closed for email changes',async t=>{
  const f=await fixture(t),payload=f.payload();
  assert.equal((await f.handle(f.request(payload,undefined,undefined,'v1,invalid'))).status,401);
  assert.equal((await f.handle(f.request(payload,undefined,String(Math.floor(Date.now()/1000)-301)))).status,401);
  assert.equal((await f.handle(f.request('x'.repeat(32769)))).status,413);
  assert.equal((await f.handle(f.request(f.payload('admin@fixture.test','email_change')))).status,400);
  assert.equal((await f.handle(f.request(f.payload('admin@fixture.test','unknown')))).status,400);
  assert.equal(f.calls.length,0);
});

test('native auth emails share recipient quotas without rejected repeats draining global budget',async t=>{
  const f=await fixture(t);
  assert.equal((await f.handle(f.request(f.payload()))).status,200);
  for(let n=0;n<12;n++)assert.equal((await f.handle(f.request(f.payload('admin@fixture.test','recovery')))).status,429);
  assert.equal((await f.db.query("select day_count from acompana_private.request_limits where bucket='global:mail'")).rows[0].day_count,1);
  assert.equal((await f.handle(f.request(f.payload('another@fixture.test','recovery')))).status,200);
  assert.match(f.sends[1].textContent,/type=recovery/);
  assert.equal(f.sends.length,2);
  const digest=createHash('sha256').update('auth_mail:admin@fixture.test').digest('hex');
  await assert.rejects(f.db.transaction(async tx=>{
    await tx.exec('set local role authenticated');
    await tx.query('select public.claim_auth_email($1,$2,$3)',[digest,digest,digest]);
  }),{code:'42501'});
});

test('uncertain provider delivery retries only with the same Brevo idempotency key and no second quota charge',async t=>{
  const f=await fixture(t),payload=f.payload(),id='msg_'+randomUUID();
  f.provider(async()=>{throw new Error('network interrupted after provider may have accepted');});
  assert.equal((await f.handle(f.request(payload,id))).status,503);
  assert.equal((await f.handle(f.request(payload,id))).status,503);
  assert.equal(f.sends.length,1);
  await f.db.exec("update acompana_private.auth_email_deliveries set last_attempt_at=now()-interval '3 seconds'");
  f.provider(async()=>Response.json({code:'duplicate_parameter',message:'duplicate idempotencyKey'},{status:400}));
  assert.equal((await f.handle(f.request(payload,id))).status,200);
  assert.equal(f.sends.length,2);
  assert.equal(f.sends[0].headers.idempotencyKey,f.sends[1].headers.idempotencyKey);
  assert.equal((await f.db.query("select day_count from acompana_private.request_limits where bucket='global:mail'")).rows[0].day_count,1);
  assert.equal((await f.db.query('select state from acompana_private.auth_email_deliveries')).rows[0].state,'sent');
});

test('synthetic temporary identities never receive mail or spend quota, including password notifications',async t=>{
  const f=await fixture(t);
  for(const action of ['signup','recovery','password_changed_notification']) {
    assert.equal((await f.handle(f.request(f.payload('temp-'+randomUUID()+'@acompana.invalid',action)))).status,200);
  }
  assert.equal(f.calls.length,0);assert.equal(f.sends.length,0);
  for(const action of ['invite','magiclink','email','reauthentication','password_changed_notification']) {
    const payload=f.payload(randomUUID()+'@fixture.test',action);
    assert.equal((await f.handle(f.request(payload))).status,200);
    const sent=f.sends.at(-1);
    if(action==='reauthentication'){assert.match(sent.textContent,/123456/);assert.ok(!sent.textContent.includes('/verify'));}
    else if(action.endsWith('_notification'))assert.ok(!sent.textContent.includes('/verify'));
    else assert.ok(sent.textContent.includes('type='+action));
  }
});

test('ambiguous deliveries beyond dedupe safety window are not automatically sent again',async t=>{
  const f=await fixture(t),payload=f.payload(),id='msg_'+randomUUID();
  f.provider(async()=>{throw new Error('timeout');});
  assert.equal((await f.handle(f.request(payload,id))).status,503);
  await f.db.exec("update acompana_private.auth_email_deliveries set created_at=now()-interval '21 minutes',last_attempt_at=now()-interval '3 seconds'");
  assert.equal((await f.handle(f.request(payload,id))).status,503);
  assert.equal(f.sends.length,1);
});
