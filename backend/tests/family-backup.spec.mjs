import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {parseFamilyBackup,createFamilyRecovery,familyBackupTables} from '../family-backup.mjs';

async function fixture(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,directory),'utf8'));
  const owner=randomUUID(),other=randomUUID(),caregiver=randomUUID();
  for(const id of [owner,other,caregiver])await db.query('insert into auth.users values($1,$2,now())',[id,id+'@acompana.test']);
  const query=(id,sql,args=[])=>db.transaction(async tx=>{
    await tx.exec('set local role '+(id?'authenticated':'anon'));
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);return (await tx.query(sql,args)).rows;
  });
  const rpc=async(id,name,args=[]) => (await query(id,'select public.'+name+' as value',args))[0].value;
  const family=await rpc(owner,'create_family($1)',['Familia original ficticia']);
  await db.query("insert into public.family_members values($1,$2,'caregiver',null)",[family,caregiver]);
  const ids=Object.fromEntries(['patient','nurse','shift','receipt','cancellation','payment','appointment','item','purchase','quote','access'].map(n=>[n,randomUUID()]));
  await db.query('insert into public.patients(id,family_id,name,revision,archived_at) values($1,$2,$3,4,null)',[ids.patient,family,'Ficha archivada']);
  await db.query('insert into public.nurses values($1,$2,$3,30000,15000)',[ids.nurse,family,'Enfermería ficticia']);
  await db.query("insert into public.shifts values($1,$2,$3,$4,'2026-11-18','full',30000,$5)",[family,ids.shift,ids.patient,ids.nurse,owner]);
  await db.query("insert into public.receipts(family_id,id,paid_on,amount_cents,actor_id,concept) values($1,$2,'2026-11-18',40000,$3,'Anticipo histórico')",[family,ids.receipt,owner]);
  await db.query("insert into public.receipt_cancellations values($1,$2,$3,'2026-11-18',$4)",[family,ids.cancellation,ids.receipt,owner]);
  await db.query("insert into public.individual_payments(family_id,id,nurse_id,paid_on,amount_cents,actor_id,concept) values($1,$2,$3,'2026-11-18',10000,$4,'Parcial')",[family,ids.payment,ids.nurse,owner]);
  await db.query('insert into public.individual_allocations values($1,$2,$3,$4,10000)',[family,ids.nurse,ids.payment,ids.shift]);
  await db.query("insert into public.appointments values($1,$2,$3,null,'2026-02-30','08:15','Clínica','Nota histórica',$4,'Dra. Prueba')",[family,ids.appointment,ids.patient,owner]);
  await db.query("insert into public.appointment_edits values($1,$2,3,'2026-11-19','10:30','Otro lugar','Notas nuevas','Dr. Prueba')",[family,ids.appointment]);
  await db.query("insert into public.inventory_items values($1,$2,$3,'Insumo','sup',0.1234567890123456789012345,1763424000000,0.1234567890123456789012345,1763424000000,'[]',2,$4)",[family,ids.item,ids.patient,owner]);
  await db.query("insert into public.inventory_profiles values($1,$2,'Nombre editado','[]')",[family,ids.item]);
  await db.query("insert into public.inventory_purchases values($1,$2,$3,2,10.1234567890123456789,'2026-11-18','Tienda',1,0,1763424000000,$4)",[family,ids.purchase,ids.item,owner]);
  await db.query("insert into public.inventory_quotes values($1,$2,$3,2,8.76543210987654321,'2026-11-18','Cotización',$4)",[family,ids.quote,ids.item,owner]);
  await db.query("insert into public.temporary_accesses(id,family_id,display_name,expires_at,created_by) values($1,$2,'Acceso histórico',now()+interval '1 day',$3)",[ids.access,family,owner]);
  await db.query("insert into public.temporary_access_events(access_id,family_id,action,actor_id) values($1,$2,'issued',$3)",[ids.access,family,owner]);
  await db.query('update public.patients set archived_at=now() where id=$1',[ids.patient]);
  return {db,owner,other,caregiver,family,ids,rpc,query};
}

test('family backup round-trips into a new family, keeps exact decimals, relationships, archived data and financial history',async t=>{
  const {db,owner,other,caregiver,family,ids,rpc}=await fixture(t);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);
  assert.equal(archive.tables.inventory_items[0].base_quantity,'0.1234567890123456789012345');
  assert.equal(archive.tables.inventory_purchases[0].total_price,'10.1234567890123456789');
  assert.equal(archive.tables.appointments[0].legacy_day,'2026-02-30');
  assert.ok(!/activation_hash|token_valid_after|created_by|user_id|actor_id|recipient_email/.test(JSON.stringify(archive)));
  for(const id of [other,caregiver,null])await assert.rejects(rpc(id,'export_family_backup($1)',[family]),{code:'42501'});
  const request=randomUUID();
  const restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[JSON.stringify(archive),'Familia recuperada',request]);
  assert.notEqual(restored,family);
  assert.equal(await rpc(owner,'restore_family_backup($1,$2,$3)',[JSON.stringify(archive),'Familia recuperada',request]),restored);
  await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[JSON.stringify(archive),'Otro nombre',request]),{code:'PT409'});
  const copy=await rpc(owner,'export_family_backup($1)',[restored]);
  for(const table of Object.keys(archive.tables))assert.equal(copy.tables[table].length,archive.tables[table].length,table);
  assert.notEqual(copy.tables.patients[0].id,ids.patient);
  assert.equal(copy.tables.patients[0].revision,4);assert.ok(copy.tables.patients[0].archived_at);
  assert.equal(copy.tables.shifts[0].patient_id,copy.tables.patients[0].id);
  assert.equal(copy.tables.shifts[0].nurse_id,copy.tables.nurses[0].id);
  assert.equal(copy.tables.individual_allocations[0].shift_id,copy.tables.shifts[0].id);
  assert.equal(copy.tables.appointment_edits[0].id,copy.tables.appointments[0].id);
  assert.equal(copy.tables.inventory_items[0].base_quantity,archive.tables.inventory_items[0].base_quantity);
  assert.equal(copy.tables.inventory_quotes[0].total_price,archive.tables.inventory_quotes[0].total_price);
  assert.equal(copy.administration.accesses.length,0);
  assert.equal(copy.administration.membership_states.length,1);
  assert.equal(copy.administration.recovery_history[0].administration.accesses[0].display_name,'Acceso histórico');
  const second=await rpc(owner,'restore_family_backup($1,$2,$3)',[JSON.stringify(copy),'Segunda recuperación',randomUUID()]);
  const secondCopy=await rpc(owner,'export_family_backup($1)',[second]);
  assert.equal(secondCopy.administration.recovery_history.length,2);
  assert.equal(secondCopy.administration.recovery_history[1].administration.accesses[0].display_name,'Acceso histórico');
  assert.equal(secondCopy.tables.inventory_items[0].base_quantity,archive.tables.inventory_items[0].base_quantity);
  assert.deepEqual(await rpc(owner,'financial_balance($1,$2)',[restored,'2026-11-18']),await rpc(owner,'financial_balance($1,$2)',[family,'2026-11-18']));
  assert.equal((await db.query('select count(*)::int n from public.families where id=$1',[family])).rows[0].n,1);
});

test('invalid recovery is atomic and never grants membership or imports foreign references',async t=>{
  const {db,owner,family,rpc}=await fixture(t);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);
  const before=(await db.query('select count(*)::int n from public.families')).rows[0].n;
  for(const mutate of [
    x=>{x.tables.shifts[0].patient_id=randomUUID();},
    x=>{x.tables.individual_allocations[0].amount_cents=30001;},
    x=>{x.tables.patients[0].actor_id=randomUUID();},
    x=>{delete x.tables.receipts;},
    x=>{x.tables.auth_users=[];},
    x=>{x.administration.accesses[0].activation_hash='do-not-import';},
    x=>{x.version=99;}
  ]){
    const invalid=structuredClone(archive);mutate(invalid);
    await assert.rejects(rpc(owner,'restore_family_backup($1,$2,$3)',[JSON.stringify(invalid),'No debe crearse',randomUUID()]));
    assert.equal((await db.query('select count(*)::int n from public.families')).rows[0].n,before);
  }
  assert.equal((await db.query('select count(*)::int n from acompana_private.family_restore_requests')).rows[0].n,0);
});

test('temporary and anonymous users cannot restore and restore provenance is private',async t=>{
  const {db,owner,other,family,rpc,query}=await fixture(t);
  const archive=await rpc(owner,'export_family_backup($1)',[family]);
  await assert.rejects(rpc(null,'restore_family_backup($1,$2,$3)',[JSON.stringify(archive),'Sin acceso',randomUUID()]),{code:'42501'});
  await db.query("insert into public.temporary_accesses(family_id,display_name,user_id,expires_at,created_by) values($1,'Temporal', $2,now()+interval '1 day',$3)",[family,other,owner]);
  await assert.rejects(rpc(other,'restore_family_backup($1,$2,$3)',[JSON.stringify(archive),'Sin acceso',randomUUID()]),{code:'42501'});
  await assert.rejects(query(owner,'select * from acompana_private.family_restore_requests'),{code:'42501'});
});

function emptyArchive(){return {format:'acompana-family',version:1,exported_at:'2026-11-18T00:00:00Z',
  family:{id:randomUUID(),name:'Familia ficticia',created_at:'2026-11-18T00:00:00Z'},
  tables:Object.fromEntries(familyBackupTables.map(name=>[name,[]])),
  administration:{accesses:[],events:[],membership_states:[],recovery_history:[]}};}

test('restore retry keeps one request id after an uncertain response and rejects changed sessions',async()=>{
  const calls=[];let client={rpc:async(name,args)=>{calls.push({name,args});if(calls.length===1)throw Error('respuesta perdida');return 'family-id';}};
  const recovery=createFamilyRecovery({getClient:()=>client});
  recovery.review(JSON.stringify(emptyArchive()));
  await assert.rejects(recovery.restore({name:'Nueva',confirmed:false}),/Confirma/);
  await assert.rejects(recovery.restore({name:'Nueva',confirmed:true}),/respuesta perdida/);
  assert.equal(await recovery.restore({name:'Nueva',confirmed:true}),'family-id');
  assert.equal(calls.length,2);assert.equal(calls[0].args.request_id,calls[1].args.request_id);
  client={rpc:async()=>assert.fail('No debe transmitir una copia de otra sesión')};
  await assert.rejects(recovery.restore({name:'Nueva',confirmed:true}),/sesión cambió/);
});

test('clear during a pending export discards the late response and review rejects credential-shaped fields',async()=>{
  let finish;const client={rpc:()=>new Promise(resolve=>{finish=resolve;})};
  const recovery=createFamilyRecovery({getClient:()=>client});
  const pending=recovery.export(randomUUID());recovery.clear();finish(emptyArchive());
  await assert.rejects(pending,/cambió/);
  const invalid=emptyArchive();invalid.administration.accesses=[{activation_hash:'private'}];
  assert.throws(()=>parseFamilyBackup(JSON.stringify(invalid)),/compatible/);
});

test('local recovery review enforces size, version and confirmation before any RPC',async()=>{
  assert.throws(()=>parseFamilyBackup('{"version":2}'));
  assert.throws(()=>parseFamilyBackup(' '.repeat(10485761)),/grande/);
  let calls=0;
  const recovery=createFamilyRecovery({getClient:()=>({rpc:async()=>{calls++;return 'id';}})});
  await assert.rejects(recovery.restore({name:'Nueva',confirmed:true}),/revisa/i);
  assert.equal(calls,0);
});
