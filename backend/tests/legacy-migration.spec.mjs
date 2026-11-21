import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createContext,runInContext} from 'node:vm';
import {convertLegacyBackup} from '../legacy-converter.mjs';

const revision='92c4034085e13bb38fd0a7ff2622c46ef797873d';
async function fixture(t,{before=false}={}){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;`);
  const dir=new URL('../supabase/migrations/',import.meta.url),files=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
  for(const file of files.filter(n=>!before||n<'20261120001800'))await db.exec(await readFile(new URL(file,dir),'utf8'));
  const owner=randomUUID(),other=randomUUID(),caregiver=randomUUID(),temporary=randomUUID();
  for(const id of [owner,other,caregiver,temporary])await db.query('insert into auth.users values($1,$2,now())',[id,id+'@acompana.test']);
  const query=(id,sql,args=[])=>db.transaction(async tx=>{
    await tx.exec('set local role '+(id?'authenticated':'anon'));
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);return(await tx.query(sql,args)).rows;
  });
  const rpc=async(id,call,args=[]) =>(await query(id,'select public.'+call+' as value',args))[0].value;
  const family=await rpc(owner,'create_family($1)',['Familia ficticia']);
  await rpc(owner,'add_patient($1,$2)',[family,'Ficha actual']);
  await db.query("insert into public.family_members values($1,$2,'caregiver',null)",[family,caregiver]);
  await db.query("insert into public.temporary_accesses(family_id,display_name,user_id,expires_at,state,created_by) values($1,'Temporal ficticio',$2,now()+interval '1 day','active',$3)",[family,temporary,owner]);
  const upgrade=async()=>db.exec(await readFile(new URL('20261120001800_legacy_snapshots.sql',dir),'utf8'));
  return {db,owner,other,caregiver,temporary,family,query,rpc,upgrade};
}

function snapshot(raw=' {"sel":0,"last":"","p":[{"name":"Ficha original","meds":[]}],"pay":{"cfg":[{"base":"2026-11-01","pays":[{"d":"2026-11-01","n":3,"a":900}]}],"v":{"2026-11-01":{"0":[{"n":"Nombre histórico","s":"half"}]}}}}\n'){
  return {id:randomUUID(),source_sha:createHash('sha256').update(raw).digest('hex'),source_commit:revision,original_json:raw,
    report:{warnings:['legacy_coverage_preserved_without_money_conversion']},imported_at:'2026-11-20T12:00:00Z'};
}

test('format3 preserves a literal legacy snapshot through migration and recovery without inventing financial activity',async t=>{
  const {owner,other,caregiver,temporary,family,query,rpc}=await fixture(t);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);assert.equal(archive.version,3);
  const source=snapshot();archive.tables.legacy_snapshots=[source];const request=randomUUID();
  const restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Migración ficticia',request]);
  assert.equal(await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Migración ficticia',request]),restored);
  const rows=await query(owner,'select * from public.legacy_snapshots where family_id=$1',[restored]);
  assert.equal(rows.length,1);assert.notEqual(rows[0].id,source.id);assert.equal(rows[0].actor_id,owner);
  assert.equal(rows[0].original_json,source.original_json);assert.equal(rows[0].source_sha,source.source_sha);
  assert.deepEqual(await query(owner,'select id from public.shifts where family_id=$1',[restored]),[]);
  assert.deepEqual(await query(owner,'select id from public.receipts where family_id=$1',[restored]),[]);
  assert.deepEqual(await query(other,'select id from public.legacy_snapshots where family_id=$1',[restored]),[]);
  await query(owner,"select public.create_invite($1,$2)",[restored,caregiver+'@acompana.test']).then(async rows=>{
    await rpc(caregiver,'accept_invite($1)',[rows[0].create_invite]);
  });
  assert.deepEqual(await query(caregiver,'select id from public.legacy_snapshots where family_id=$1',[restored]),[]);
  await assert.rejects(query(null,'select * from public.legacy_snapshots'),{code:'42501'});
  await assert.rejects(query(owner,'delete from public.legacy_snapshots where family_id=$1',[restored]),{code:'42501'});
  await assert.rejects(query(owner,'insert into public.legacy_snapshots(id,family_id,source_sha,source_commit,original_json,report,actor_id) values($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(),restored,source.source_sha,source.source_commit,source.original_json,source.report,owner]),{code:'42501'});
  await assert.rejects(rpc(temporary,'restore_family_backup($1,$2,$3)',[archive,'Prohibida',randomUUID()]),{code:'42501'});
  const copied=await rpc(owner,'export_family_backup($1)',[restored]);assert.equal(copied.version,3);
  const stored=copied.tables.legacy_snapshots[0];assert.equal(stored.original_json,source.original_json);assert.ok(!('actor_id' in stored));
  const twice=await rpc(other,'restore_family_backup($1,$2,$3)',[copied,'Copia propia',randomUUID()]);
  assert.equal((await query(other,'select original_json from public.legacy_snapshots where family_id=$1',[twice]))[0].original_json,source.original_json);
});

test('tampered hashes, credential-shaped payloads and unknown snapshot fields roll back the whole new family',async t=>{
  const {owner,family,query,rpc}=await fixture(t);
  const base=await rpc(owner,'export_family_backup($1)',[family]);base.tables.legacy_snapshots=[snapshot()];
  const count=()=>query(owner,'select count(*)::int as n from public.families');const before=(await count())[0].n;
  for(const change of [
    row=>{row.source_sha='0'.repeat(64);},
    row=>Object.assign(row,snapshot('{"p":[{"name":"Ficticia","meds":[]}],"pay":{},"password":"not-a-real-password"}')),
    row=>Object.assign(row,snapshot('{"p":[{"name":"Ficticia","meds":[{"access_token":"fixture"}]}],"pay":{}}')),
    ...['access_token','refresh_token','password','service_role','service_role_key','apikey','activation_hash','activation_code','token_valid_after'].map(key=>row=>Object.assign(row,snapshot(JSON.stringify({p:[{name:'Ficticia',meds:[],[key.toUpperCase()]:'fixture'}],pay:{}})))),
    row=>{row.family_id=randomUUID();},
    row=>{delete row.source_commit;},
    row=>{row.source_commit='not-a-commit';}
  ]){
    const archive=structuredClone(base);change(archive.tables.legacy_snapshots[0]);
    await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'No debe quedar',randomUUID()]));
    assert.equal((await count())[0].n,before);
  }
  const incompatible=structuredClone(base);incompatible.version=2;
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[incompatible,'Formato incorrecto',randomUUID()]),{code:'22023'});
  const missing=structuredClone(base);delete missing.tables.legacy_snapshots;
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[missing,'Falta legado',randomUUID()]),{code:'22023'});
});

test('real main export converts, restores and re-exports with exact source and harmless credential words in notes',async t=>{
  const {owner,rpc,query}=await fixture(t);
  const context=createContext({window:{}});
  runInContext(await readFile(new URL('../../compatibility.js',import.meta.url),'utf8'),context);
  const raw=await readFile(new URL('./fixtures/main-backup.json',import.meta.url),'utf8');
  const {archive}=await convertLegacyBackup(raw,{compatibility:context.window.AcompanaCompatibility,now:'2026-11-20T12:00:00Z'});
  const restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Exportación real ficticia',randomUUID()]);
  const exported=await rpc(owner,'export_family_backup($1)',[restored]);
  assert.equal(exported.tables.legacy_snapshots[0].original_json,raw);
  assert.equal(exported.tables.legacy_snapshots[0].source_sha,createHash('sha256').update(raw).digest('hex'));
  assert.equal(exported.tables.patients.length,archive.tables.patients.length);
  assert.equal(exported.tables.inventory_items.length,archive.tables.inventory_items.length);
  assert.equal(exported.tables.appointments.length,archive.tables.appointments.length);
  assert.deepEqual(exported.tables.shifts,[]);assert.deepEqual(exported.tables.receipts,[]);
  assert.ok(exported.administration.recovery_history.every(entry=>entry!==null));
  const recovered=await rpc(owner,'restore_family_backup($1,$2,$3)',[exported,'Segunda recuperación desde main',randomUUID()]);
  assert.equal((await rpc(owner,'export_family_backup($1)',[recovered])).tables.legacy_snapshots[0].original_json,raw);
  const harmless=JSON.stringify({p:[{name:'password service_role_key',meds:[],note:'Un texto con "access_token": y "token_valid_after": dentro de una nota.'}],pay:{}});
  archive.tables.legacy_snapshots=[snapshot(harmless)];
  const notesFamily=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Notas inocuas',randomUUID()]);
  assert.equal((await query(owner,'select original_json from public.legacy_snapshots where family_id=$1',[notesFamily]))[0].original_json,harmless);
});

test('older format1/2 archives and confirmed restore tickets remain compatible after format3 upgrade',async t=>{
  const {owner,family,rpc,upgrade}=await fixture(t,{before:true});
  const v2=await rpc(owner,'export_family_backup($1)',[family]);assert.equal(v2.version,2);
  const request=randomUUID(),oldFamily=await rpc(owner,'restore_family_backup($1,$2,$3)',[v2,'Antes de migrar',request]);
  await upgrade();
  assert.equal(await rpc(owner,'restore_family_backup($1,$2,$3)',[v2,'Antes de migrar',request]),oldFamily);
  for(const version of [1,2]){
    const archive=structuredClone(v2);archive.version=version;if(version===1){delete archive.tables.care_tasks;delete archive.tables.care_notes;}
    const restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Compatible '+version,randomUUID()]);
    const current=await rpc(owner,'export_family_backup($1)',[restored]);assert.equal(current.version,3);assert.deepEqual(current.tables.legacy_snapshots,[]);
  }
});
