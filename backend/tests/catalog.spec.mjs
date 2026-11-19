import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCatalog} from '../history.mjs';

test('catalog pages through server caps below the requested size and composite identities',async()=>{
  const rows=Array.from({length:451},(_,i)=>({family_id:'family',user_id:'user-'+i}));
  const calls=[];
  const client={select:async(table,params)=>{calls.push(params);return rows.slice(params.offset,params.offset+Math.min(73,params.limit));}};
  const actual=await readCatalog(client,'family_members',{select:'family_id,user_id',order:'family_id.asc,user_id.asc'}, {key:['family_id','user_id']});
  assert.deepEqual(actual,rows);assert.equal(calls.at(-1).offset,451);assert.ok(calls.every(c=>c.limit<=200));
});

test('catalog rejects repeated pages, missing identities and explicit size overflow',async()=>{
  await assert.rejects(readCatalog({select:async()=>[{id:'same'}]},'patients',{order:'id.asc'}),/cambió/);
  await assert.rejects(readCatalog({select:async()=>[{name:'no id'}]},'patients',{order:'id.asc'}),/identidad/);
  await assert.rejects(readCatalog({select:async(t,p)=>Array.from({length:p.limit},(_,i)=>({id:p.offset+i}))},'patients',{order:'id.asc'},{maxRows:2}),/tamaño/);
  await assert.rejects(readCatalog({},'patients',{}),/inválida/);
});
