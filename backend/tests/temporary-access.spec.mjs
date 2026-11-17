import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;`);
  const dir = new URL('../supabase/migrations/',import.meta.url);
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,dir),'utf8'));
  const actor = (id, role = id ? 'authenticated' : 'anon', issued = Math.floor(Date.now()/1000)+5, sessionId=randomUUID(), created=issued) => {
    const query=(sql, params=[]) => db.transaction(async tx => {
      if(id) await tx.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,to_timestamp($3)) on conflict(id) do nothing',[sessionId,id,created]);
      await tx.exec('set local role '+role);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id??'',JSON.stringify({iat:issued,session_id:sessionId})]);
      return (await tx.query(sql,params)).rows;
    });
    query.sessionId=sessionId;
    return query;
  };
  async function user(email=randomUUID()+'@fixture.test') {
    const id=randomUUID();
    await db.query('insert into auth.users values($1,$2,now())',[id,email]);
    return {id,email,query:actor(id)};
  }
  const rpc = async (query,call,args=[]) => (await query('select public.'+call+' as result',args))[0].result;
  const owner=await user(),other=await user();
  const family=await rpc(owner.query,'create_family($1)',['Familia A']);
  const another=await rpc(owner.query,'create_family($1)',['Familia B']);
  const foreign=await rpc(other.query,'create_family($1)',['Familia ajena']);
  const service=actor(undefined,'service_role');
  async function issue(name='Ana',code=hash()) {
    const id=await rpc(owner.query,'issue_temporary_access($1,$2,now()+interval \'1 day\',$3)',[family,name,code]);
    return {id,code};
  }
  async function activate(access) {
    const claim=randomUUID();
    const info=await rpc(service,'claim_temporary_access($1,$2)',[access.code,claim]);
    const account=info.user_id ? {id:info.user_id,query:actor(info.user_id)} : await user(info.login_email);
    await rpc(service,'complete_temporary_access($1,$2,$3)',[access.id,claim,account.id]);
    return account;
  }
  return {db,actor,user,rpc,owner,other,family,another,foreign,service,issue,activate};
}

test('temporary identities are named, isolated and cannot become personal or cross-family accounts',async t=>{
  const f=await fixture(t);
  const access=await f.issue('Ana <script>');
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '3 seconds'");
  const second=await f.issue('Ana <script>');
  assert.notEqual(access.id,second.id);
  const temp=await f.activate(access);
  const patient=await f.rpc(f.owner.query,'add_patient($1,$2)',[f.family,'Ficha A']);
  await f.rpc(f.owner.query,'add_patient($1,$2)',[f.another,'Ficha B']);
  assert.equal((await temp.query('select id from public.patients')).length,1);
  assert.equal((await temp.query('select id from public.patients'))[0].id,patient);
  assert.deepEqual(await temp.query('select id from public.temporary_accesses'),[]);
  assert.equal((await f.owner.query('select display_name from public.temporary_accesses')).length,2);
  assert.deepEqual(await f.other.query('select id from public.temporary_accesses'),[]);
  await assert.rejects(f.rpc(temp.query,'create_family($1)',['No permitido']),{code:'42501'});
  await assert.rejects(f.rpc(temp.query,'issue_temporary_access($1,$2,now()+interval \'1 day\',$3)',[f.family,'No',hash()]),{code:'42501'});
  await assert.rejects(f.rpc(f.other.query,'revoke_temporary_access($1,$2,$3)',[f.family,access.id,2]),{code:'42501'});
  const invite=await f.rpc(f.owner.query,'create_invite($1,$2)',[f.another,temp.email]);
  await assert.rejects(f.rpc(temp.query,'accept_invite($1)',[invite]),{code:'42501'});
  await assert.rejects(f.actor()('select * from public.temporary_accesses'),{code:'42501'});
});

test('activation is single-use, server-only and cannot attach an owner or a foreign identity',async t=>{
  const f=await fixture(t),access=await f.issue(),claim=randomUUID();
  await assert.rejects(f.rpc(f.owner.query,'claim_temporary_access($1,$2)',[access.code,claim]),{code:'42501'});
  await f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,claim]);
  await assert.rejects(f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,randomUUID()]),{code:'22023'});
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,f.owner.id]),{code:'42501'});
  const temp=await f.user('temp-'+access.id+'@acompana.invalid');
  await assert.rejects(f.rpc(temp.query,'create_family($1)',['Antes de vincular']),{code:'42501'});
  await assert.rejects(f.rpc(f.owner.query,'renew_temporary_access($1,$2,$3,now()+interval \'2 days\')',[f.family,access.id,1]),{code:'PT409'});
  await f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,temp.id]);
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,temp.id]),{code:'42501'});
  await assert.rejects(f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,randomUUID()]),{code:'22023'});
  assert.equal((await f.owner.query('select action from public.temporary_access_events')).length,2);
});

test('expiry and recovery invalidate old sessions, preserve history and require a fresh claim',async t=>{
  const f=await fixture(t),access=await f.issue(),temp=await f.activate(access);
  await f.rpc(temp.query,'add_patient($1,$2)',[f.family,'Ficha temporal']);
  // Una sesión válida antes del reset conserva su fecha original al refrescar JWT.
  const issuedBeforeReset=Math.floor(Date.now()/1000)-1;
  await f.db.query('update public.temporary_accesses set token_valid_after=to_timestamp($1) where id=$2',[issuedBeforeReset,access.id]);
  const oldToken=f.actor(temp.id,'authenticated',issuedBeforeReset);
  assert.equal((await oldToken('select id from public.patients')).length,1);
  const refreshedOldSession=f.actor(temp.id,'authenticated',Math.floor(Date.now()/1000)+20,oldToken.sessionId);
  assert.equal((await refreshedOldSession('select id from public.patients')).length,1);
  const newHash=hash();
  await f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,2,newHash]);
  assert.deepEqual(await temp.query('select id from public.patients'),[]);
  assert.deepEqual(await refreshedOldSession('select id from public.patients'),[]);
  await assert.rejects(f.rpc(oldToken,'add_patient($1,$2)',[f.family,'No']),{code:'42501'});
  await assert.rejects(f.rpc(temp.query,'add_patient($1,$2)',[f.family,'No']),{code:'42501'});
  assert.equal((await f.owner.query('select id from public.patients')).length,1);
  await assert.rejects(f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,2,hash()]),{code:'PT409'});
  const activated=await f.activate({...access,code:newHash});
  assert.equal(activated.id,temp.id);
  assert.equal((await activated.query('select id from public.patients')).length,1);
  assert.deepEqual(await oldToken('select id from public.patients'),[]);
  assert.deepEqual(await refreshedOldSession('select id from public.patients'),[]);
  await f.db.query("update public.temporary_accesses set expires_at=now()-interval '1 second' where id=$1",[access.id]);
  assert.deepEqual(await activated.query('select id from public.patients'),[]);
  await assert.rejects(f.rpc(activated.query,'add_patient($1,$2)',[f.family,'No']),{code:'42501'});
  await f.rpc(f.owner.query,'renew_temporary_access($1,$2,$3,now()+interval \'2 days\')',[f.family,access.id,4]);
  assert.equal((await activated.query('select id from public.patients')).length,1);
  await f.rpc(f.owner.query,'revoke_temporary_access($1,$2,$3)',[f.family,access.id,5]);
  assert.deepEqual(await activated.query('select id from public.patients'),[]);
  assert.equal((await f.owner.query('select id from public.patients')).length,1);
  await assert.rejects(f.rpc(activated.query,'create_family($1)',['Después de revocar']),{code:'42501'});
});

test('legacy caregiver revocation also cancels pending temporary recovery',async t=>{
  const f=await fixture(t),access=await f.issue(),temp=await f.activate(access);
  const code=hash();
  await f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,2,code]);
  const claim=randomUUID();
  await f.rpc(f.service,'claim_temporary_access($1,$2)',[code,claim]);
  await f.rpc(f.owner.query,'revoke_caregiver($1,$2)',[f.family,temp.id]);
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,temp.id]),{code:'42501'});
  assert.equal((await f.owner.query('select state from public.temporary_accesses where id=$1',[access.id]))[0].state,'revoked');
});

test('expired or abandoned activation never grants access and newer reset replaces older token',async t=>{
  const f=await fixture(t),access=await f.issue(),claim=randomUUID();
  await f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,claim]);
  await f.rpc(f.service,'abandon_temporary_access_claim($1,$2)',[access.id,randomUUID()]);
  await assert.rejects(f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,randomUUID()]),{code:'22023'});
  await f.rpc(f.service,'abandon_temporary_access_claim($1,$2)',[access.id,claim]);
  const replacement=hash();
  await f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,1,replacement]);
  await assert.rejects(f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,randomUUID()]),{code:'22023'});
  await f.db.query("update acompana_private.temporary_activation set expires_at=now()-interval '1 second' where access_id=$1",[access.id]);
  await assert.rejects(f.rpc(f.service,'claim_temporary_access($1,$2)',[replacement,randomUUID()]),{code:'22023'});
  assert.equal((await f.db.query('select count(*)::int as n from public.family_members where family_id=$1',[f.family])).rows[0].n,1);
});

test('direct SQL RPCs enforce issuance and recovery quotas and stale renewals cannot overwrite expiry',async t=>{
  const f=await fixture(t),access=await f.issue();
  await assert.rejects(f.issue(),{code:'PT429'});
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '3 seconds'");
  await f.issue();
  await f.db.query(`insert into public.temporary_access_events(access_id,family_id,action,actor_id,happened_at)
    select $1,$2,'issued',$3,now()-interval '3 seconds' from generate_series(1,28)`,[access.id,f.family,f.owner.id]);
  await assert.rejects(f.issue(),{code:'PT429'});
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '2 hours'");
  await f.db.query(`insert into public.temporary_access_events(access_id,family_id,action,actor_id,happened_at)
    select $1,$2,'issued',$3,now()-interval '2 hours' from generate_series(1,70)`,[access.id,f.family,f.owner.id]);
  await assert.rejects(f.issue(),{code:'PT429'});
  const reset=revision=>f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,revision,hash()]);
  await reset(1);
  await assert.rejects(reset(2),{code:'PT429'});
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '61 seconds' where action='reset'");
  await reset(2);
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '61 seconds' where action='reset'");
  await reset(3);
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '61 seconds' where action='reset'");
  await assert.rejects(reset(4),{code:'PT429'});
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '2 hours' where action='reset'");
  await f.db.query(`insert into public.temporary_access_events(access_id,family_id,action,actor_id,happened_at)
    select $1,$2,'reset',$3,now()-interval '2 hours' from generate_series(1,2)`,[access.id,f.family,f.owner.id]);
  await assert.rejects(reset(4),{code:'PT429'});
  await f.rpc(f.owner.query,'renew_temporary_access($1,$2,$3,now()+interval \'2 days\')',[f.family,access.id,4]);
  await assert.rejects(f.rpc(f.owner.query,'renew_temporary_access($1,$2,$3,now()+interval \'3 days\')',[f.family,access.id,4]),{code:'PT409'});
  await assert.rejects(f.rpc(f.owner.query,'issue_temporary_access($1,$2,now()-interval \'1 day\',$3)',[f.family,'No',hash()]),{code:'22023'});
});

test('a claim expiring during Auth provisioning cannot activate, nor can a mismatched family account attach',async t=>{
  const f=await fixture(t),access=await f.issue(),claim=randomUUID();
  const info=await f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,claim]);
  const temp=await f.user(info.login_email);
  await f.db.query('insert into public.family_members(family_id,user_id,role) values($1,$2,\'caregiver\')',[f.foreign,temp.id]);
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,temp.id]),{code:'42501'});
  await f.db.query('delete from public.family_members where family_id=$1 and user_id=$2',[f.foreign,temp.id]);
  await f.db.query("update acompana_private.temporary_activation set expires_at=now()-interval '1 second' where access_id=$1",[access.id]);
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,temp.id]),{code:'42501'});
  assert.deepEqual(await temp.query('select id from public.patients'),[]);
});

test('owner can revoke an in-flight provision and replace an expired crashed claim without allowing old completion',async t=>{
  const f=await fixture(t),access=await f.issue(),claim=randomUUID();
  const info=await f.rpc(f.service,'claim_temporary_access($1,$2)',[access.code,claim]);
  const temp=await f.user(info.login_email);
  await f.rpc(f.owner.query,'revoke_temporary_access($1,$2,$3)',[f.family,access.id,1]);
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[access.id,claim,temp.id]),{code:'42501'});
  await f.db.exec("update public.temporary_access_events set happened_at=now()-interval '3 seconds' where action='issued'");
  const next=await f.issue(),oldClaim=randomUUID();
  const nextInfo=await f.rpc(f.service,'claim_temporary_access($1,$2)',[next.code,oldClaim]);
  const orphan=await f.user(nextInfo.login_email);
  await assert.rejects(f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,next.id,1,hash()]),{code:'PT409'});
  await f.db.query("update acompana_private.temporary_activation set expires_at=now()-interval '1 second' where access_id=$1",[next.id]);
  const replacement=hash();
  await f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,next.id,1,replacement]);
  await assert.rejects(f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[next.id,oldClaim,orphan.id]),{code:'42501'});
  const newClaim=randomUUID();
  await f.rpc(f.service,'claim_temporary_access($1,$2)',[replacement,newClaim]);
  await f.rpc(f.service,'complete_temporary_access($1,$2,$3)',[next.id,newClaim,orphan.id]);
});

test('temporary administration requires a recent Auth session even when an old session refreshes its JWT',async t=>{
  const f=await fixture(t);
  const old=f.actor(f.owner.id,'authenticated',Math.floor(Date.now()/1000),randomUUID(),Math.floor(Date.now()/1000)-16*60);
  // Las operaciones personales existentes conservan su contrato y permiten varias familias.
  await f.rpc(old,'create_family($1)',['Otra familia propia']);
  await assert.rejects(f.rpc(old,'issue_temporary_access($1,$2,now()+interval \'1 day\',$3)',[f.family,'No',hash()]),{code:'PT401'});
  const access=await f.issue();
  await assert.rejects(f.rpc(old,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,1,hash()]),{code:'PT401'});
  await f.rpc(f.owner.query,'reset_temporary_access($1,$2,$3,$4)',[f.family,access.id,1,hash()]);
  await assert.rejects(f.rpc(old,'renew_temporary_access($1,$2,$3,now()+interval \'2 days\')',[f.family,access.id,2]),{code:'PT401'});
  await f.rpc(f.owner.query,'renew_temporary_access($1,$2,$3,now()+interval \'2 days\')',[f.family,access.id,2]);
  await assert.rejects(f.rpc(old,'revoke_temporary_access($1,$2,$3)',[f.family,access.id,3]),{code:'PT401'});
  await f.rpc(f.owner.query,'revoke_temporary_access($1,$2,$3)',[f.family,access.id,3]);
});
