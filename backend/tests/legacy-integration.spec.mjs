import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

async function fixture(t,{before=false}={}){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&n<(before?'20261121001900':'20261121002000')).sort();
 for(const name of files)await db.exec(await readFile(new URL(name,dir),'utf8'));
 const owner=randomUUID(),other=randomUUID(),caregiver=randomUUID();
 for(const user of [owner,other,caregiver])await db.query('insert into auth.users values($1,$2,now())',[user,user+'@acompana.test']);
 const query=(user,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);return(await tx.query(sql,args)).rows;});
 const rpc=async(user,name,args=[])=>(await query(user,'select public.'+name+' as value',args))[0].value;
 const family=await rpc(owner,'create_family($1)',['Familia ficticia']);
 const patients=[];for(let i=0;i<2;i++)patients.push(await rpc(owner,'add_patient($1,$2)',[family,'Ficha homónima']));
 await db.query("insert into public.family_members values($1,$2,'caregiver',null)",[family,caregiver]);
 const raw=JSON.stringify({p:[{name:'Ficha homónima',meds:[]},{name:'Ficha homónima',meds:[]}],pay:{nurses:[[{n:'Personal ficticio'}],[{n:'Personal ficticio'}]]}});
 const snapshot=randomUUID();await db.query('insert into public.legacy_snapshots(id,family_id,source_sha,original_json,report,actor_id) values($1,$2,$3,$4,$5,$6)',[snapshot,family,createHash('sha256').update(raw).digest('hex'),raw,{},owner]);
 return {db,owner,other,caregiver,family,patients,snapshot,rpc,query,upgrade:async()=>db.exec(await readFile(new URL('20261121001900_legacy_integration.sql',dir),'utf8'))};
}

test('integrating legacy staff is owner-only, idempotent by source index, and never merges homonyms',async t=>{
 const {owner,other,caregiver,family,patients,snapshot,rpc,query}=await fixture(t);
 const args=[family,snapshot,0,0,patients[0]];
 const first=await rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',args);
 assert.equal(await rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',args),first);
 const second=await rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',[family,snapshot,1,0,patients[1]]);
 assert.notEqual(second,first);
 const nurses=await query(owner,'select * from public.nurses where family_id=$1 order by legacy_patient_index',[family]);
 assert.equal(nurses.length,2);assert.equal(nurses[0].full_cents,null);assert.equal(nurses[0].half_cents,null);
 assert.equal(nurses[0].patient_id,patients[0]);assert.equal(nurses[1].patient_id,patients[1]);
 for(const user of [other,caregiver])await assert.rejects(rpc(user,'integrate_legacy_nurse($1,$2,$3,$4,$5)',args),{code:'42501'});
 await assert.rejects(rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',[family,snapshot,0,0,patients[1]]),{code:'PT409'});
 await assert.rejects(rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',[family,snapshot,50,0,patients[0]]),{code:'PT422'});
 const alien=await rpc(other,'create_family($1)',['Familia ajena']);
 const foreignPatient=await rpc(other,'add_patient($1,$2)',[alien,'Ficha ajena']);
 await assert.rejects(rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',[family,snapshot,0,0,foreignPatient]),{code:'PT422'});
 await assert.rejects(query(owner,"insert into public.nurses(family_id,name,full_cents) values($1,'Alta directa',1)",[family]),{code:'42501'});
 assert.deepEqual(await query(other,'select id from public.nurses where family_id=$1',[family]),[]);
});

test('verified rates start explicitly, reject stale edits and never retariff an existing shift',async t=>{
 const {owner,family,patients,snapshot,rpc,query}=await fixture(t);
 const nurse=await rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',[family,snapshot,0,0,patients[0]]);
 const make=(request,day='2026-11-21',type='full')=>rpc(owner,'record_shift($1,$2,$3,$4,$5,$6)',[family,request,patients[0],nurse,day,type]);
 await assert.rejects(make(randomUUID()),{code:'PT422'});
 assert.equal(await rpc(owner,'configure_nurse_rates($1,$2,$3,$4,$5,$6)',[family,nurse,1,30000,null,'2026-11-21']),2);
 await assert.rejects(make(randomUUID(),'2026-11-20'),{code:'PT422'});
 await assert.rejects(make(randomUUID(),'2026-11-21','half'),{code:'PT422'});
 const request=randomUUID();await make(request);
 assert.equal(await rpc(owner,'configure_nurse_rates($1,$2,$3,$4,$5,$6)',[family,nurse,2,40000,0,'2026-11-22']),3);
 assert.equal(await make(request),request);
 await assert.rejects(rpc(owner,'configure_nurse_rates($1,$2,$3,$4,$5,$6)',[family,nurse,2,50000,null,'2026-11-22']),{code:'PT409'});
 assert.equal((await query(owner,'select cost_cents from public.shifts where family_id=$1 and id=$2',[family,request]))[0].cost_cents,30000);
 await make(randomUUID(),'2026-11-22','half');
});

test('v4 restores integrated provenance and patient relation, preserving old v3 tickets and old nurse shapes',async t=>{
 const f=await fixture(t,{before:true});const {owner,family,patients,snapshot,rpc,query,upgrade}=f;
 await rpc(owner,'add_nurse($1,$2,$3,$4)',[family,'Personal previo',10000,null]);
 const old=await rpc(owner,'export_family_backup($1)',[family]);assert.equal(old.version,3);
 assert.equal(old.tables.nurses.length,1);assert.equal('revision' in old.tables.nurses[0],false);
 const ticket=randomUUID(),oldResult=await rpc(owner,'restore_family_backup($1,$2,$3)',[old,'Antes de integrar',ticket]);
 await upgrade();
 assert.equal(await rpc(owner,'restore_family_backup($1,$2,$3)',[old,'Antes de integrar',ticket]),oldResult);
 await rpc(owner,'integrate_legacy_nurse($1,$2,$3,$4,$5)',[family,snapshot,1,0,patients[1]]);
 const archive=await rpc(owner,'export_family_backup($1)',[family]);assert.equal(archive.version,4);
 const restored=await rpc(owner,'restore_family_backup($1,$2,$3)',[archive,'Personal recuperado',randomUUID()]);
 const rows=await query(owner,'select n.patient_id,n.legacy_patient_index,n.full_cents,p.name from public.nurses n join public.patients p on p.id=n.patient_id where n.family_id=$1',[restored]);
 assert.equal(rows.length,1);assert.equal(rows[0].legacy_patient_index,1);assert.equal(rows[0].full_cents,null);assert.ok(!patients.includes(rows[0].patient_id));
 const newCopy=await rpc(owner,'export_family_backup($1)',[restored]);
 assert.equal(newCopy.tables.legacy_snapshots[0].original_json,archive.tables.legacy_snapshots[0].original_json);
 const copyOld=await rpc(owner,'restore_family_backup($1,$2,$3)',[old,'Copia versión3',randomUUID()]);assert.ok(copyOld);
 const oldNurse=(await query(owner,'select revision,rates_valid_from,legacy_source_sha,full_cents from public.nurses where family_id=$1',[copyOld]))[0];
 assert.equal(oldNurse.revision,1);assert.equal(oldNurse.rates_valid_from,null);assert.equal(oldNurse.legacy_source_sha,null);assert.equal(oldNurse.full_cents,10000);
});
