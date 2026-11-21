import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

async function fixture(t,{before=false}={}){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;`);
  const dir=new URL('../supabase/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
  for(const name of names.filter(n=>!before||n<'20261121001900'))await db.exec(await readFile(new URL(name,dir),'utf8'));
  const owner=randomUUID(),caregiver=randomUUID(),other=randomUUID(),temporary=randomUUID(),session=randomUUID();
  for(const id of [owner,caregiver,other,temporary])await db.query('insert into auth.users values($1,$2,now())',[id,id+'@acompana.test']);
  await db.query('insert into auth.sessions values($1,$2,now())',[session,temporary]);
  const query=(user,sql,args=[])=>db.transaction(async tx=>{
    await tx.exec('set local role '+(user?'authenticated':'anon'));
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user??'',JSON.stringify({sub:user,iat:Math.floor(Date.now()/1000)+5,session_id:session})]);
    return(await tx.query(sql,args)).rows;
  });
  const rpc=async(user,call,args=[])=>(await query(user,'select public.'+call+' as value',args))[0].value;
  const family=await rpc(owner,'create_family($1)',['Familia ficticia']),alien=await rpc(other,'create_family($1)',['Otra familia']);
  await db.query("insert into public.family_members values($1,$2,'caregiver',null),($1,$3,'caregiver',null)",[family,caregiver,temporary]);
  await db.query("insert into public.temporary_accesses(family_id,display_name,user_id,expires_at,state,created_by,token_valid_after) values($1,'Personal temporal ficticio',$2,now()+interval '1 day','active',$3,now()-interval '1 minute')",[family,temporary,owner]);
  const patient=await rpc(owner,'add_patient($1,$2)',[family,'Ficha ficticia']);
  const foreignPatient=await rpc(other,'add_patient($1,$2)',[alien,'Ficha ajena']);
  const nurse=await rpc(owner,'add_nurse($1,$2,$3,$4)',[family,'Personal ficticio',50000,25000]);
  const foreignNurse=await rpc(other,'add_nurse($1,$2,$3,$4)',[alien,'Personal ajeno',50000,25000]);
  const upgrade=async()=>{for(const name of names.filter(n=>n>='20261121001900'))await db.exec(await readFile(new URL(name,dir),'utf8'));};
  return{db,query,rpc,owner,caregiver,other,temporary,family,alien,patient,foreignPatient,nurse,foreignNurse,upgrade};
}

test('overnight scheduling and explicit closure are durable, scoped and financially inert',async t=>{
  const f=await fixture(t),{db,rpc,query,owner,caregiver,other,family,patient,nurse,foreignNurse,foreignPatient}=f;
  const request=randomUUID(),args=[family,patient,nurse,'2026-11-21 20:00','2026-11-22 08:00',request];
  const shift=await rpc(caregiver,'schedule_care_shift($1,$2,$3,$4,$5,$6)',args);
  assert.equal(await rpc(caregiver,'schedule_care_shift($1,$2,$3,$4,$5,$6)',args),shift);
  await assert.rejects(rpc(caregiver,'schedule_care_shift($1,$2,$3,$4,$5,$6)',[...args.slice(0,4),'2026-11-22 09:00',request]),{code:'PT409'});
  await assert.rejects(rpc(other,'schedule_care_shift($1,$2,$3,$4,$5,$6)',[...args.slice(0,5),randomUUID()]),{code:'42501'});
  for(const bad of [[family,foreignPatient,nurse,...args.slice(3,5),randomUUID()],[family,patient,foreignNurse,...args.slice(3,5),randomUUID()],[family,patient,nurse,'2026-11-21 20:00','2026-11-21 08:00',randomUUID()]])await assert.rejects(rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6)',bad),{code:'PT422'});
  assert.equal((await query(owner,'select closed_at from public.care_shifts where id=$1',[shift]))[0].closed_at,null);
  const closing=[family,shift,1,'2026-11-22 08:20',nurse,true,'Carpeta de la ficha','Entrega ficticia',randomUUID()];
  assert.equal(await rpc(caregiver,'close_care_shift($1,$2,$3,$4,$5,$6,$7,$8,$9)',closing),shift);
  assert.equal(await rpc(caregiver,'close_care_shift($1,$2,$3,$4,$5,$6,$7,$8,$9)',closing),shift);
  const paper=(await query(owner,'select * from public.paper_care_logs where care_shift_id=$1',[shift]))[0];
  assert.equal(paper.actor_id,caregiver);assert.equal(paper.nurse_id,nurse);assert.equal(paper.completed,true);
  assert.deepEqual((await db.query('select (select count(*)::int from public.shifts) financial_shifts,(select count(*)::int from public.receipts) receipts')).rows,[{financial_shifts:0,receipts:0}]);
  await assert.rejects(rpc(owner,'close_care_shift($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...closing.slice(0,8),randomUUID()]),{code:'PT409'});
  assert.deepEqual(await query(other,'select id from public.care_shifts where family_id=$1',[family]),[]);
  await assert.rejects(query(null,'select * from public.paper_care_logs'),{code:'42501'});
  await assert.rejects(query(owner,"update public.care_shifts set closed_at=now() where id=$1",[shift]),{code:'42501'});
});

test('printed sheets distinguish author from recorder, preserve corrections and enforce archive/revocation',async t=>{
  const {db,rpc,query,owner,caregiver,temporary,other,family,patient,nurse,foreignNurse}=await fixture(t);
  assert.deepEqual((await query(caregiver,'select * from public.list_shift_nurses($1)',[family])).map(x=>Object.keys(x).sort()),[['id','name']]);
  await assert.rejects(query(other,'select * from public.list_shift_nurses($1)',[family]),{code:'42501'});
  const args=[family,patient,null,'2026-11-21',false,'Carpeta','Pendiente de completar',randomUUID()];
  const log=await rpc(temporary,'record_paper_care_log($1,$2,$3,$4,$5,$6,$7,$8)',args);
  await assert.rejects(rpc(owner,'record_paper_care_log($1,$2,$3,$4,$5,$6,$7,$8)',[family,patient,null,'2026-11-21',true,'','',randomUUID()]),{code:'PT422'});
  await assert.rejects(rpc(owner,'update_paper_care_log($1,$2,$3,$4,$5,$6,$7)',[family,log,1,foreignNurse,true,'','']),{code:'PT422'});
  assert.equal(await rpc(caregiver,'update_paper_care_log($1,$2,$3,$4,$5,$6,$7)',[family,log,1,nurse,true,'Archivo','Hoja terminada']),2);
  const row=(await query(owner,'select * from public.paper_care_logs where id=$1',[log]))[0];
  assert.equal(row.actor_id,temporary);assert.equal(row.nurse_id,nurse);
  const edits=await query(owner,'select * from public.paper_care_log_edits where paper_log_id=$1',[log]);
  assert.equal(edits.length,1);assert.equal(edits[0].actor_id,caregiver);assert.equal(edits[0].completed,false);
  await assert.rejects(rpc(owner,'update_paper_care_log($1,$2,$3,$4,$5,$6,$7)',[family,log,1,nurse,true,'','']),{code:'PT409'});
  await rpc(owner,'set_patient_archived($1,$2,$3,$4)',[family,patient,1,true]);
  assert.equal(await rpc(temporary,'record_paper_care_log($1,$2,$3,$4,$5,$6,$7,$8)',args),log,'Replay remains safe after archival.');
  await assert.rejects(rpc(owner,'update_paper_care_log($1,$2,$3,$4,$5,$6,$7)',[family,log,2,nurse,false,'','']),{code:'PT422'});
  await db.query("update public.temporary_accesses set expires_at=now()-interval '1 second' where user_id=$1",[temporary]);
  assert.deepEqual(await query(temporary,'select id from public.paper_care_logs'),[]);
  await assert.rejects(rpc(temporary,'record_paper_care_log($1,$2,$3,$4,$5,$6,$7,$8)',args),{code:'42501'});
});

test('care zones are explicit, durable and reject unknown zones and nonexistent daylight-saving hours',async t=>{
  const {rpc,query,owner,family,patient,nurse}=await fixture(t);
  const defaults=[family,patient,nurse,'2026-11-21 20:00','2026-11-22 08:00',randomUUID()];
  const mexico=await rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6)',defaults);
  assert.equal(await rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6,$7)',[...defaults,'America/Mexico_City']),mexico);
  assert.equal((await query(owner,'select care_zone from public.care_shifts where id=$1',[mexico]))[0].care_zone,'America/Mexico_City');
  const utcArgs=[...defaults.slice(0,5),randomUUID(),'UTC'];
  const utc=await rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6,$7)',utcArgs);
  assert.equal((await query(owner,'select care_zone from public.care_shifts where id=$1',[utc]))[0].care_zone,'UTC');
  await assert.rejects(rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6,$7)',[...utcArgs.slice(0,6),'America/Mexico_City']),{code:'PT409'});
  for(const [start,end,zone] of [
    ['2026-11-21 20:00','2026-11-22 08:00','Nowhere/Missing'],
    ['2026-03-08 02:30','2026-03-08 08:00','America/New_York'],
    ['2026-03-08 01:00','2026-03-08 02:30','America/New_York']
  ])await assert.rejects(rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6,$7)',[family,patient,nurse,start,end,randomUUID(),zone]),{code:'PT422'});
  const ny=await rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6,$7)',[family,patient,nurse,'2026-03-07 20:00','2026-03-08 08:00',randomUUID(),'America/New_York']);
  await assert.rejects(rpc(owner,'close_care_shift($1,$2,$3,$4,$5,$6,$7,$8,$9)',[family,ny,1,'2026-03-08 02:30',nurse,true,'','',randomUUID()]),{code:'PT422'});
  assert.equal((await query(owner,'select closed_at from public.care_shifts where id=$1',[ny]))[0].closed_at,null);
});

test('format4 remaps shift/log/audit relations and previous tickets remain compatible',async t=>{
  const {db,rpc,query,owner,caregiver,family,patient,nurse,upgrade}=await fixture(t,{before:true});
  const old=await rpc(owner,'export_family_backup($1)',[family]);assert.equal(old.version,3);
  const ticket=randomUUID(),restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[old,'Copia anterior',ticket]);
  await upgrade();
  assert.equal(await rpc(owner,'restore_family_backup($1,$2,$3)',[old,'Copia anterior',ticket]),restored);
  const shift=await rpc(owner,'schedule_care_shift($1,$2,$3,$4,$5,$6)',[family,patient,nurse,'2026-11-21 20:00','2026-11-22 08:00',randomUUID()]);
  await rpc(caregiver,'close_care_shift($1,$2,$3,$4,$5,$6,$7,$8,$9)',[family,shift,1,null,nurse,true,'Carpeta','Ficticio',randomUUID()]);
  const log=(await query(owner,'select id from public.paper_care_logs where care_shift_id=$1',[shift]))[0].id;
  await rpc(caregiver,'update_paper_care_log($1,$2,$3,$4,$5,$6,$7)',[family,log,1,nurse,true,'Archivo','Corrección']);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);assert.equal(archive.version,4);
  const copy=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Copia con turnos',randomUUID()]);
  const exported=await rpc(owner,'export_family_backup($1)',[copy]);
  assert.notEqual(exported.tables.care_shifts[0].id,shift);
  assert.equal(exported.tables.paper_care_logs[0].care_shift_id,exported.tables.care_shifts[0].id);
  assert.equal(exported.tables.paper_care_log_edits[0].paper_log_id,exported.tables.paper_care_logs[0].id);
  assert.equal(exported.tables.paper_care_logs[0].nurse_id,exported.tables.nurses[0].id);
  assert.equal((await db.query('select actor_id from public.paper_care_log_edits where family_id=$1',[copy])).rows[0].actor_id,owner);
  const count=async()=>Number((await db.query('select count(*) n from public.families')).rows[0].n),before=await count();
  const bad=structuredClone(archive);bad.tables.paper_care_logs[0].care_shift_id=randomUUID();
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[bad,'Inconsistente',randomUUID()]));
  assert.equal(await count(),before);
  const missing=structuredClone(archive);delete missing.tables.paper_care_logs;
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[missing,'Incompleta',randomUUID()]),{code:'22023'});
  const missingClosureLog=structuredClone(archive);missingClosureLog.tables.paper_care_logs=[];missingClosureLog.tables.paper_care_log_edits=[];
  const openWithLog=structuredClone(archive);openWithLog.tables.care_shifts[0].closed_at=null;openWithLog.tables.care_shifts[0].actual_end_local=null;
  const wrongDay=structuredClone(archive);wrongDay.tables.paper_care_logs[0].log_day='2026-11-22';
  for(const [name,broken]of [['Cerrado sin hoja',missingClosureLog],['Abierto con hoja',openWithLog],['Día distinto',wrongDay]]){
    await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[broken,name,randomUUID()]),{code:'22023'});
    assert.equal(await count(),before,'Una incongruencia de cierre revierte la nueva familia completa.');
  }
  const badZone=structuredClone(archive);badZone.tables.care_shifts[0].care_zone='Nowhere/Missing';
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[badZone,'Zona desconocida',randomUUID()]),{code:'23514'});
  assert.equal(await count(),before);
  const badClock=structuredClone(archive);Object.assign(badClock.tables.care_shifts[0],{care_zone:'America/New_York',start_local:'2026-03-08T02:30:00',end_local:'2026-03-08T08:00:00'});
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[badClock,'Hora inexistente',randomUUID()]),{code:'23514'});
  assert.equal(await count(),before);
  const missingZone=structuredClone(archive);delete missingZone.tables.care_shifts[0].care_zone;
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[missingZone,'Zona ausente',randomUUID()]),{code:'22023'});
  assert.equal(await count(),before);
  const legacyCopy=await rpc(owner,'restore_family_backup($1,$2,$3)',[old,'Copia de formato3',randomUUID()]);
  assert.deepEqual((await rpc(owner,'export_family_backup($1)',[legacyCopy])).tables.paper_care_logs,[]);
  for(const version of [1,2]){
    const legacy=structuredClone(old);legacy.version=version;delete legacy.tables.legacy_snapshots;
    if(version===1){delete legacy.tables.care_tasks;delete legacy.tables.care_notes;}
    const restoredLegacy=await rpc(owner,'restore_family_backup($1,$2,$3)',[legacy,'Formato anterior '+version,randomUUID()]);
    assert.deepEqual((await rpc(owner,'export_family_backup($1)',[restoredLegacy])).tables.care_shifts,[]);
  }
});
