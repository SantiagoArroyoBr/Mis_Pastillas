import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('read RPC metadata selects writable transactions for membership locks without widening access',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')&&n<'20261119001700').sort()) {
    await db.exec(await readFile(new URL(name,directory),'utf8'));
  }
  const owner=randomUUID(),caregiver=randomUUID(),other=randomUUID();
  for(const id of [owner,caregiver,other])await db.query('insert into auth.users values($1,$2,now())',[id,id+'@acompana.test']);
  const family=(await db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
    return (await tx.query("select public.create_family('Familia de ensayo RPC') as id")).rows[0].id;
  }));
  await db.query("insert into public.family_members values($1,$2,'caregiver',null)",[family,caregiver]);
  const signatures=['public.list_care_members(uuid)','public.export_family_backup(uuid)'];
  const volatility=async signature=>(await db.query('select provolatile from pg_proc where oid=$1::regprocedure',[signature])).rows[0].provolatile;
  // Emula la elección de transacción de PostgREST para POST RPC según pg_proc.
  // Esto NO sustituye la comprobación HTTP real del proveedor.
  async function rpc(signature,id,{readOnly}={}) {
    const selectedReadOnly=readOnly??(await volatility(signature))!=='v';
    const name=signature.slice(0,signature.indexOf('('));
    assert.ok(signatures.includes(signature));
    return db.transaction(async tx=>{
      await tx.exec('set transaction '+(selectedReadOnly?'read only':'read write'));
      await tx.exec('set local role '+(id?'authenticated':'anon'));
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);
      return (await tx.query('select * from '+name+'($1)',[family])).rows;
    });
  }
  const before={
    rows:(await db.query('select count(*)::int n from public.family_members')).rows[0].n,
    grants:(await db.query("select routine_name,grantee,privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('list_care_members','export_family_backup') order by routine_name,grantee,privilege_type")).rows
  };
  for(const signature of signatures){
    assert.equal(await volatility(signature),'s');
    await assert.rejects(rpc(signature,owner,{readOnly:true}),{code:'25006'});
    await assert.rejects(rpc(signature,owner),{code:'25006'},'Metadata STABLE selects a read-only transaction.');
  }
  await db.exec(await readFile(new URL('20261119001700_read_rpc_transactions.sql',directory),'utf8'));
  for(const signature of signatures){
    assert.equal(await volatility(signature),'v');
    assert.ok((await rpc(signature,owner)).length>0);
    await assert.rejects(rpc(signature,null),{code:'42501'});
    await assert.rejects(rpc(signature,other),{code:'42501'});
  }
  const members=await rpc(signatures[0],caregiver);
  assert.equal(members.length,2);
  assert.ok(members.every(row=>Object.keys(row).sort().join(',')==='label,user_id'));
  await assert.rejects(rpc(signatures[1],caregiver),{code:'42501'},'Backup remains owner-only.');
  assert.equal((await rpc(signatures[1],owner))[0].export_family_backup.version,2);
  assert.equal((await db.query('select count(*)::int n from public.family_members')).rows[0].n,before.rows);
  assert.deepEqual((await db.query("select routine_name,grantee,privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('list_care_members','export_family_backup') order by routine_name,grantee,privilege_type")).rows,before.grants);
});
