// Verificación explícita de un acceso ficticio recién creado por el administrador.
// No acepta claves de servicio y no envía correos. El fichero de activación se consume y elimina.
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { connections } from './connection-config.mjs';

if(process.env.ACOMPANA_LIVE_QA_APPROVED!=='yes')throw new Error('La validación real requiere autorización explícita.');
const source=new URL('./supabase/.temp/live-access-activation.json',import.meta.url);
const input=JSON.parse(await readFile(source,'utf8'));
await unlink(source);
assert.match(input.login,/^temp-[0-9a-f-]{36}$/);
assert.match(input.code,/^[0-9a-f-]{73}$/);
const api=connections.cloud.url,key=connections.cloud.key;
const origin='https://acompana-piloto-git-development-dinamita20.vercel.app';
const password=randomBytes(24).toString('base64url')+'-Live-2026!';
let token;
async function request(path,body,bearer=token){
  const response=await fetch(api+path,{method:body===undefined?'GET':'POST',
    headers:{apikey:key,Origin:origin,'Content-Type':'application/json',...(bearer&&{Authorization:'Bearer '+bearer})},
    ...(body!==undefined&&{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json().catch(()=>null)};
}
const activation=await request('/functions/v1/family-access',{action:'activate',code:input.code,password});
assert.equal(activation.status,200,'La activación real debe completarse.');
input.code=undefined;
const session=await request('/auth/v1/token?grant_type=password',{email:input.login+'@acompana.invalid',password});
assert.equal(session.status,200,'Auth real debe aceptar la identidad temporal.');
token=session.body.access_token;
assert.ok(token);assert.equal(session.body.user.app_metadata.family_temporary,true);
const families=await request('/rest/v1/families?select=id');
assert.equal(families.status,200);assert.deepEqual(families.body.map(row=>row.id),[input.family]);
const foreign=await request('/rest/v1/families?id=eq.'+input.otherFamily+'&select=id');
assert.deepEqual(foreign.body,[]);
const panel=await request('/rest/v1/temporary_accesses?select=id');assert.deepEqual(panel.body,[]);
const denied=await request('/rest/v1/rpc/create_family',{family_name:'QA - operación que debe rechazarse'});
assert.equal(denied.status,403);
console.log('Auth real: activación, sesión, familia única, aislamiento y administración denegada comprobados. Esperando revocación del acceso ficticio.');
let revoked=false;
for(let attempt=0;attempt<80;attempt++){
  await new Promise(resolve=>setTimeout(resolve,1500));
  const result=await request('/rest/v1/families?select=id');
  if(result.status===200&&Array.isArray(result.body)&&result.body.length===0){revoked=true;break;}
}
assert.ok(revoked,'El administrador debe revocar el acceso de QA y la sesión anterior debe perder datos.');
await request('/auth/v1/logout?scope=local',{}).catch(()=>{});
token=undefined;
await writeFile(new URL('./supabase/.temp/live-access-result.json',import.meta.url),JSON.stringify({
  realAuth:true,activation:true,isolated:true,noAdministration:true,revocationWithExistingJwt:true,checkedAt:new Date().toISOString()
}));
console.log('Auth real: revocación con JWT existente comprobada. No se conservaron contraseñas, códigos ni tokens.');
