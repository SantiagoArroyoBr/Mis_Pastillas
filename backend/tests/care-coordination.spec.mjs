import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

async function fixture(t,{legacy=false}={}) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  const files=(await readdir(directory)).filter(n=>n.endsWith('.sql')).sort();
  for(const name of files.filter(n=>!legacy||n<'20261119001600')) await db.exec(await readFile(new URL(name,directory),'utf8'));
  const owner=randomUUID(),other=randomUUID(),caregiver=randomUUID(),temporary=randomUUID(),session=randomUUID();
  for(const id of [owner,other,caregiver,temporary]) await db.query('insert into auth.users values($1,$2,now())',[id,id+'@acompana.test']);
  await db.query('insert into auth.sessions values($1,$2,now())',[session,temporary]);
  const query=(id,sql,args=[])=>db.transaction(async tx=>{
    await tx.exec('set local role '+(id?'authenticated':'anon'));
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [id??'',JSON.stringify({sub:id,iat:Math.floor(Date.now()/1000)+5,session_id:session})]);
    return (await tx.query(sql,args)).rows;
  });
  const rpc=async(id,name,args=[]) => (await query(id,'select public.'+name+' as value',args))[0].value;
  const family=await rpc(owner,'create_family($1)',['Familia de coordinación']);
  const alien=await rpc(other,'create_family($1)',['Familia ajena']);
  await db.query("insert into public.family_members values($1,$2,'caregiver',null),($1,$3,'caregiver',null)",[family,caregiver,temporary]);
  await db.query("insert into public.temporary_accesses(family_id,display_name,user_id,expires_at,state,created_by,token_valid_after) values($1,'Nombre temporal ficticio',$2,now()+interval '1 day','active',$3,now()-interval '1 minute')",[family,temporary,owner]);
  const patient=await rpc(owner,'add_patient($1,$2)',[family,'Ficha ficticia']);
  const foreignPatient=await rpc(other,'add_patient($1,$2)',[alien,'Ficha ajena']);
  return {db,owner,other,caregiver,temporary,family,alien,patient,foreignPatient,query,rpc};
}

test('care writes are scoped, durable on replay, revision checked and read-only on archived patients',async t=>{
  const {db,owner,other,caregiver,family,alien,patient,foreignPatient,query,rpc}=await fixture(t);
  const request=randomUUID(),args=[family,request,patient,'Comprar insumos','Dos paquetes','2026-11-20',caregiver];
  const task=await rpc(caregiver,'create_care_task($1,$2,$3,$4,$5,$6,$7)',args);
  assert.equal(await rpc(caregiver,'create_care_task($1,$2,$3,$4,$5,$6,$7)',args),task);
  await assert.rejects(rpc(caregiver,'create_care_task($1,$2,$3,$4,$5,$6,$7)',[...args.slice(0,3),'Otra tarea',...args.slice(4)]),{code:'PT409'});
  assert.deepEqual(await query(other,'select id from public.care_tasks where family_id=$1',[family]),[]);
  await assert.rejects(query(null,'select * from public.care_tasks'),{code:'42501'});
  await assert.rejects(query(caregiver,"insert into public.care_notes(family_id,patient_id,body,actor_id) values($1,$2,'Directo',$3)",[family,patient,caregiver]),{code:'42501'});
  await assert.rejects(rpc(other,'create_care_task($1,$2,$3,$4,$5,$6,$7)',[family,randomUUID(),null,'Ajena','',null,null]),{code:'42501'});
  await assert.rejects(rpc(owner,'create_care_task($1,$2,$3,$4,$5,$6,$7)',[family,randomUUID(),foreignPatient,'Cruce','',null,null]),{code:'PT422'});
  await assert.rejects(rpc(owner,'create_care_task($1,$2,$3,$4,$5,$6,$7)',[family,randomUUID(),patient,'Responsable ajeno','',null,other]),{code:'PT422'});
  const noteRequest=randomUUID(),noteArgs=[family,noteRequest,patient,'Observación de prueba'];
  const note=await rpc(caregiver,'add_care_note($1,$2,$3,$4)',noteArgs);
  assert.equal(await rpc(caregiver,'add_care_note($1,$2,$3,$4)',noteArgs),note);
  await assert.rejects(rpc(caregiver,'add_care_note($1,$2,$3,$4)',[family,noteRequest,patient,'Nota cambiada']),{code:'PT409'});
  assert.equal(await rpc(caregiver,'set_care_task_completed($1,$2,$3,$4)',[family,task,1,true]),2);
  await assert.rejects(rpc(owner,'set_care_task_completed($1,$2,$3,$4)',[family,task,1,false]),{code:'PT409'});
  assert.equal(await rpc(owner,'set_care_task_completed($1,$2,$3,$4)',[family,task,2,false]),3);
  await rpc(owner,'set_patient_archived($1,$2,$3,$4)',[family,patient,1,true]);
  assert.equal((await query(caregiver,'select id from public.care_notes where family_id=$1',[family])).length,1);
  assert.equal(await rpc(caregiver,'add_care_note($1,$2,$3,$4)',noteArgs),note,'Replay reconciles an existing note after archival.');
  await assert.rejects(rpc(caregiver,'add_care_note($1,$2,$3,$4)',[family,randomUUID(),patient,'Nueva nota']),{code:'PT422'});
  await assert.rejects(rpc(caregiver,'set_care_task_completed($1,$2,$3,$4)',[family,task,3,true]),{code:'PT422'});
  await db.query('update public.family_members set revoked_at=now() where family_id=$1 and user_id=$2',[family,caregiver]);
  await assert.rejects(rpc(caregiver,'create_care_task($1,$2,$3,$4,$5,$6,$7)',args),{code:'42501'});
  assert.deepEqual(await query(caregiver,'select id from public.care_notes where family_id=$1',[family]),[]);
  assert.deepEqual(await query(owner,'select id from public.care_tasks where family_id=$1',[alien]),[]);
});

test('temporary care access expires and member labels reveal neither email nor administrative capabilities',async t=>{
  const {db,owner,other,temporary,family,patient,query,rpc}=await fixture(t);
  const args=[family,randomUUID(),patient,'Revisar insumos','',null,temporary];
  const task=await rpc(temporary,'create_care_task($1,$2,$3,$4,$5,$6,$7)',args);
  assert.ok(task);
  const members=await query(temporary,'select * from public.list_care_members($1)',[family]);
  assert.equal(members.find(m=>m.user_id===temporary).label,'Nombre temporal ficticio');
  assert.ok(members.every(m=>Object.keys(m).sort().join(',')==='label,user_id'&&!m.label.includes('@')));
  await assert.rejects(query(other,'select * from public.list_care_members($1)',[family]),{code:'42501'});
  await db.query('update public.temporary_accesses set expires_at=now()-interval \'1 second\' where user_id=$1',[temporary]);
  assert.deepEqual(await query(temporary,'select id from public.care_tasks'),[]);
  await assert.rejects(rpc(temporary,'add_care_note($1,$2,$3,$4)',[family,randomUUID(),patient,'Vencida']),{code:'42501'});
  assert.ok(!(await query(owner,'select * from public.list_care_members($1)',[family])).some(m=>m.user_id===temporary));
  await assert.rejects(rpc(owner,'create_care_task($1,$2,$3,$4,$5,$6,$7)',[family,randomUUID(),patient,'Asignar vencido','',null,temporary]),{code:'PT422'});
});

test('family backup v2 restores care rows atomically with remapped relations and no restored account assignment',async t=>{
  const {db,owner,other,caregiver,family,patient,rpc}=await fixture(t);
  await rpc(caregiver,'create_care_task($1,$2,$3,$4,$5,$6,$7)',[family,randomUUID(),patient,'Comprar','Insumos','2026-11-20',caregiver]);
  await rpc(caregiver,'add_care_note($1,$2,$3,$4)',[family,randomUUID(),patient,'Nota histórica']);
  await rpc(owner,'set_patient_archived($1,$2,$3,$4)',[family,patient,1,true]);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);
  assert.equal(archive.version,2);assert.equal(archive.tables.care_tasks[0].assignee_id,null);
  assert.ok(!JSON.stringify(archive.tables).includes(caregiver));
  const ticket=randomUUID();
  const restored=await rpc(other,'restore_family_backup($1,$2,$3)',[archive,'Copia de cuidado',ticket]);
  assert.equal(await rpc(other,'restore_family_backup($1,$2,$3)',[archive,'Copia de cuidado',ticket]),restored);
  const copy=await rpc(other,'export_family_backup($1)',[restored]);
  assert.notEqual(copy.tables.patients[0].id,patient);assert.ok(copy.tables.patients[0].archived_at);
  assert.equal(copy.tables.care_tasks[0].patient_id,copy.tables.patients[0].id);
  assert.equal(copy.tables.care_notes[0].patient_id,copy.tables.patients[0].id);
  assert.equal(copy.tables.care_notes[0].body,'Nota histórica');
  assert.equal(copy.tables.care_tasks[0].assignee_id,null);
  assert.equal((await db.query('select actor_id from public.care_notes where family_id=$1',[restored])).rows[0].actor_id,other);
  const before=(await db.query('select count(*)::int n from public.families')).rows[0].n;
  const bad=structuredClone(archive);bad.tables.care_notes[0].patient_id=randomUUID();
  await assert.rejects(rpc(other,'restore_family_backup($1,$2,$3)',[bad,'No debe crearse',randomUUID()]));
  assert.equal((await db.query('select count(*)::int n from public.families')).rows[0].n,before);
  const assigned=structuredClone(archive);assigned.tables.care_tasks[0].assignee_id=other;
  await assert.rejects(rpc(other,'restore_family_backup($1,$2,$3)',[assigned,'Asignación prohibida',randomUUID()]),{code:'22023'});
  const missing=structuredClone(archive);delete missing.tables.care_notes;
  await assert.rejects(rpc(other,'restore_family_backup($1,$2,$3)',[missing,'Incompleta',randomUUID()]),{code:'22023'});
});

test('version1 archives and pre-upgrade confirmed restore tickets remain valid after coordination migration',async t=>{
  const f=await fixture(t,{legacy:true});
  const {db,owner,family,rpc}=f;
  const directory=new URL('../supabase/migrations/',import.meta.url);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);
  assert.equal(archive.version,1);
  const request=randomUUID(),name='Restaurada antes de coordinación';
  const original=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,name,request]);
  await db.exec(await readFile(new URL('20261119001600_care_coordination.sql',directory),'utf8'));
  assert.equal(await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,name,request]),original);
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Nombre distinto',request]),{code:'PT409'});
  const restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Importada v1 nueva',randomUUID()]);
  const copy=await rpc(owner,'export_family_backup($1)',[restored]);
  assert.equal(copy.version,2);assert.deepEqual(copy.tables.care_tasks,[]);assert.deepEqual(copy.tables.care_notes,[]);
});
