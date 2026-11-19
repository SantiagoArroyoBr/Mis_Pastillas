import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../supabase-client.mjs';
import { connections } from '../connection-config.mjs';
import { createSessionState, sessionFromAuth } from '../session-state.mjs';
import { createOfflineCache } from '../offline-cache.mjs';

function memoryStorage() {
  const values = new Map();
  return { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key), get length(){return values.size;}, key:index=>[...values.keys()][index], values };
}
const api = connections.cloud.url;
const key = connections.cloud.key;
const user = '11111111-1111-4111-8111-111111111111';
function auth(now, seconds = 3600, id = user, temporary = false) {
  const payload = Buffer.from(JSON.stringify({sub:id,exp:Math.floor(now/1000)+seconds})).toString('base64url');
  return {access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.fixture',refresh_token:'refresh-'+seconds,
    expires_at:Math.floor(now/1000)+seconds,user:{id,app_metadata:{family_temporary:temporary}}};
}
function stores(extra = {}) { return {sessionStorage:memoryStorage(),localStorage:memoryStorage(),...extra}; }

test('an unrecognized saved refresh token returns to login and clears only session/cache data',async t=>{
  let clock=1_000_000;
  const storage=stores({now:()=>clock,remember:true,offlineCache:true});
  t.mock.method(globalThis,'fetch',async url=>url.includes('grant_type=refresh_token')
    ?Response.json({error_code:'refresh_token_not_found',msg:'private-provider-message'},{status:400})
    :Response.json(url.includes('grant_type=password')?auth(clock,40):[]));
  const first=createClient(key,api,undefined,storage);
  await first.signIn('principal@acompana.test','fixture-password');await first.select('patients');
  storage.localStorage.setItem('acompana-request-v1:fixture','opaque-ticket');
  clock+=20_000;
  const restored=createClient(key,api,undefined,storage);
  assert.equal(await restored.restoreSession(),undefined);
  assert.equal(storage.localStorage.length,1);
  assert.equal(storage.localStorage.getItem('acompana-request-v1:fixture'),'opaque-ticket');
  assert.equal(restored.lastSync,undefined);
  assert.equal(await restored.signIn('principal@acompana.test','fixture-password'),user);
});

test('a rejected refresh during use asks for a new login rather than a raw HTTP400',async t=>{
  let clock=1_000_000;const storage=stores({now:()=>clock});
  t.mock.method(globalThis,'fetch',async url=>url.includes('grant_type=password')?Response.json(auth(clock,40))
    :Response.json({error_code:'refresh_token_not_found'},{status:400}));
  const client=createClient(key,api,undefined,storage);await client.signIn('principal@acompana.test','fixture-password');clock+=20_000;
  await assert.rejects(client.select('patients'),error=>error.status===401&&error.sessionExpired&&/Inicia sesión de nuevo/.test(error.message));
  assert.equal(storage.sessionStorage.length,0);
});

test('sessions default to tab storage, personal-device opt-in uses local storage, and passwords are never persisted', async t => {
  const now=1_000_000, storage=stores({now:()=>now});
  t.mock.method(globalThis,'fetch',async()=>Response.json(auth(now)));
  const first=createClient(key,api,undefined,storage);
  await first.signIn('principal@acompana.test','private-password-never-stored');
  assert.equal(storage.sessionStorage.length,1);assert.equal(storage.localStorage.length,0);
  const raw=[...storage.sessionStorage.values.values()].join('');
  assert.ok(!raw.includes('private-password'));assert.ok(!raw.includes('principal@'));
  const second=createClient(key,api,undefined,{...storage,remember:true});
  await second.signIn('principal@acompana.test','private-password-never-stored');
  assert.equal(storage.sessionStorage.length,0);assert.equal(storage.localStorage.length,1);
  assert.equal(second.remember,true);
});

test('tab sessions restore only after Auth confirms the same user, retaining saved preferences', async t => {
  const now=1_000_000, storage=stores({now:()=>now,remember:true,offlineCache:true});
  t.mock.method(globalThis,'fetch',async url=>Response.json(url.includes('/token?')?auth(now):{id:user}));
  await createClient(key,api,undefined,storage).signIn('principal@acompana.test','fixture-password');
  const restored=createClient(key,api,undefined,{...storage,remember:false,offlineCache:false});
  assert.equal(await restored.restoreSession(),user);
  assert.equal(restored.remember,true);assert.equal(restored.offlineEnabled,true);
});

test('parallel reads refresh once before expiry and rotate the persisted refresh token', async t => {
  let clock=1_000_000, refreshes=0;
  const storage=stores({now:()=>clock});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.includes('grant_type=password'))return Response.json(auth(clock,40));
    if(url.includes('grant_type=refresh_token')){
      refreshes++;assert.equal(JSON.parse(options.body).refresh_token,'refresh-40');
      await new Promise(resolve=>setTimeout(resolve,5));return Response.json(auth(clock,3600));
    }
    assert.equal(options.headers.Authorization,'Bearer '+auth(clock,3600).access_token);
    return Response.json([]);
  });
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');clock+=20_000;
  await Promise.all([client.select('patients'),client.select('families'),client.select('receipts')]);
  assert.equal(refreshes,1);
  assert.match([...storage.sessionStorage.values.values()][0],/refresh-3600/);
});

test('renewing the same identity preserves successful reads already in flight', async t => {
  let clock=1_000_000, finishRead, refreshes=0;
  const storage=stores({now:()=>clock,offlineCache:true});
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.includes('grant_type=password'))return Response.json(auth(clock,40));
    if(url.includes('grant_type=refresh_token')){refreshes++;return Response.json(auth(clock));}
    if(url.includes('/patients?'))return new Promise(resolve=>{finishRead=()=>resolve(Response.json([{id:'before-refresh'}]));});
    return Response.json([]);
  });
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');
  const read=client.select('patients');
  while(!finishRead)await new Promise(resolve=>setTimeout(resolve,0));
  clock+=20_000;await client.select('families');
  finishRead();
  assert.deepEqual(await read,[{id:'before-refresh'}]);assert.equal(refreshes,1);
  assert.equal(storage.sessionStorage.length,1);
  assert.deepEqual(createOfflineCache(api,{storage:storage.localStorage}).get(user,'/rest/v1/patients?').data,[{id:'before-refresh'}]);
});

test('logout and a different identity still reject delayed reads without caching their data', async t => {
  for(const changeAccount of [false,true]){
    const clock=1_000_000, storage=stores({now:()=>clock,offlineCache:true});
    let finishRead,identity=user;
    const mock=t.mock.method(globalThis,'fetch',async url=>{
      if(url.includes('grant_type=password'))return Response.json(auth(clock,3600,identity));
      if(url.includes('/patients?'))return new Promise(resolve=>{finishRead=()=>resolve(Response.json([{id:'previous-user-data'}]));});
      return Response.json([]);
    });
    const client=createClient(key,api,undefined,storage);
    await client.signIn('principal@acompana.test','fixture-password');
    const read=client.select('patients');
    while(!finishRead)await new Promise(resolve=>setTimeout(resolve,0));
    if(changeAccount){identity='22222222-2222-4222-8222-222222222222';await client.signIn('other@acompana.test','fixture-password');}
    else await client.signOut();
    finishRead();await assert.rejects(read,error=>error.status===401&&error.stale===true);
    assert.equal(storage.localStorage.length,0);
    mock.mock.restore();
  }
});

test('late fetch and response-body failures cannot consult a newer identity cache or change its connection state', async t => {
  for(const phase of ['fetch','body']){
    const clock=1_000_000, storage=stores({now:()=>clock,offlineCache:true});
    let identity=user, pending=true, failOld;
    const mock=t.mock.method(globalThis,'fetch',async url=>{
      if(url.includes('grant_type=password'))return Response.json(auth(clock,3600,identity));
      if(url.includes('/patients?')&&pending){
        pending=false;
        const fail=()=>new Promise((resolve,reject)=>{failOld=()=>reject(TypeError('fixture connection lost'));});
        return phase==='fetch'?fail():{ok:true,status:200,text:fail};
      }
      return Response.json([{id:'new-user-data'}]);
    });
    const client=createClient(key,api,undefined,storage);
    await client.signIn('first@acompana.test','fixture-password');
    const oldRead=client.select('patients');
    while(!failOld)await new Promise(resolve=>setTimeout(resolve,0));
    identity='22222222-2222-4222-8222-222222222222';
    await client.signIn('second@acompana.test','fixture-password');
    await client.select('patients');
    failOld();await assert.rejects(oldRead,error=>error.status===401&&error.stale===true);
    assert.equal(client.offline,false);
    assert.deepEqual(createOfflineCache(api,{storage:storage.localStorage}).get(identity,'/rest/v1/patients?').data,[{id:'new-user-data'}]);
    mock.mock.restore();
  }
});

test('an interrupted successful body may use current-user cache, while an unreadable 401 body clears authorization', async t => {
  const clock=1_000_000, storage=stores({now:()=>clock,offlineCache:true});let mode='online';
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.includes('grant_type=password'))return Response.json(auth(clock));
    if(mode==='online')return Response.json([{id:'cached-current-user'}]);
    return {ok:mode!=='denied',status:mode==='denied'?401:200,text:async()=>{throw TypeError('fixture body interrupted');}};
  });
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');await client.select('patients');
  mode='body-failed';assert.deepEqual(await client.select('patients'),[{id:'cached-current-user'}]);
  assert.equal(client.offline,true);
  mode='denied';await assert.rejects(client.select('patients'),{status:401});
  assert.equal(storage.sessionStorage.length,0);assert.equal(storage.localStorage.length,0);
});

test('late Auth verification from restore or reconnect cannot clear a newer identity, including a rejected response', async t => {
  for(const operation of ['restoreSession','reconnect'])for(const responseStatus of [200,401]){
    const clock=1_000_000,storage=stores({now:()=>clock});let identity=user,finishAuth;
    const mock=t.mock.method(globalThis,'fetch',async url=>{
      if(url.includes('grant_type=password'))return Response.json(auth(clock,3600,identity));
      return new Promise(resolve=>{finishAuth=()=>resolve(Response.json(responseStatus===200?{id:user}:{},{status:responseStatus}));});
    });
    const client=createClient(key,api,undefined,storage);
    await client.signIn('first@acompana.test','fixture-password');
    const verification=client[operation]();
    while(!finishAuth)await new Promise(resolve=>setTimeout(resolve,0));
    identity='22222222-2222-4222-8222-222222222222';
    await client.signIn('second@acompana.test','fixture-password');
    finishAuth();await assert.rejects(verification,error=>error.status===401&&error.stale===true);
    assert.equal(createSessionState(api,storage).read().userId,identity);
    mock.mock.restore();
  }
});

test('a rejected refresh from an old identity cannot clear a newer signed-in account', async t => {
  let clock=1_000_000,identity=user,finishRefresh;
  const storage=stores({now:()=>clock});
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.includes('grant_type=password'))return Response.json(auth(clock,identity===user?40:3600,identity));
    if(url.includes('grant_type=refresh_token'))return new Promise(resolve=>{finishRefresh=()=>resolve(Response.json({},{status:401}));});
    return Response.json([]);
  });
  const client=createClient(key,api,undefined,storage);
  await client.signIn('first@acompana.test','fixture-password');clock+=20_000;
  const read=client.select('patients');
  while(!finishRefresh)await new Promise(resolve=>setTimeout(resolve,0));
  identity='22222222-2222-4222-8222-222222222222';
  await client.signIn('second@acompana.test','fixture-password');
  finishRefresh();await assert.rejects(read,error=>error.status===401&&error.stale===true);
  assert.equal(createSessionState(api,storage).read().userId,identity);
});

test('offline reads require opt-in and a valid token; RPC and access mutations never fall back to cache', async t => {
  const now=1_000_000, storage=stores({now:()=>now,offlineCache:true});let network=true;
  t.mock.method(globalThis,'fetch',async url=>{
    if(!network)throw TypeError('offline');
    return Response.json(url.includes('/token?')?auth(now):[{id:'fixture-patient'}]);
  });
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');
  assert.deepEqual(await client.select('patients',{select:'id'}),[{id:'fixture-patient'}]);
  assert.equal(client.lastSync,now);network=false;
  assert.deepEqual(await client.select('patients',{select:'id'}),[{id:'fixture-patient'}]);
  assert.equal(client.offline,true);assert.equal(client.readOnly,true);
  await assert.rejects(client.rpc('add_patient',{family:'fixture'}),error=>error.offline===true);
  await assert.rejects(client.select('temporary_accesses'),error=>error.network===true);
});

test('offline restoration serves only previously read data and refuses expired sessions', async t => {
  let clock=1_000_000, online=true;
  const storage=stores({now:()=>clock,offlineCache:true,remember:true});
  t.mock.method(globalThis,'fetch',async url=>{
    if(!online)throw TypeError('offline');
    return Response.json(url.includes('/token?')?auth(clock,120):[{id:'family-fixture'}]);
  });
  const first=createClient(key,api,undefined,storage);
  await first.signIn('principal@acompana.test','fixture-password');await first.select('families');online=false;
  const restored=createClient(key,api,undefined,storage);
  assert.equal(await restored.restoreSession(),user);assert.equal(restored.offline,true);
  clock+=121_000;
  await assert.rejects(restored.select('families'),error=>error.network===true);
  const expired=createClient(key,api,undefined,storage);
  assert.equal(await expired.restoreSession(),undefined);assert.equal(storage.localStorage.length,0);
});

test('401 clears tokens and cache, while an ordinary 403 clears cache without logging out a caregiver', async t => {
  const now=1_000_000, storage=stores({now:()=>now,offlineCache:true});let status=200;
  t.mock.method(globalThis,'fetch',async url=>url.includes('/token?')?Response.json(auth(now))
    :Response.json(status===200?[{id:'fixture'}]:{}, {status}));
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');await client.select('patients');
  assert.equal(storage.localStorage.length,1);status=403;
  await assert.rejects(client.select('nurses'),{status:403});
  assert.equal(storage.localStorage.length,0);assert.equal(storage.sessionStorage.length,1);
  status=401;await assert.rejects(client.select('families'),{status:401});
  assert.equal(storage.sessionStorage.length,0);assert.equal(client.lastSync,undefined);
});

test('logout clears only session/cache namespaces and never erases durable request tickets', async t => {
  const now=1_000_000, storage=stores({now:()=>now,offlineCache:true,remember:true});
  storage.localStorage.setItem('acompana-request-v1:fixture','opaque-ticket');
  t.mock.method(globalThis,'fetch',async url=>Response.json(url.includes('/token?')?auth(now):[]));
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');await client.select('patients');await client.signOut();
  assert.equal(storage.localStorage.length,1);assert.equal(storage.localStorage.getItem('acompana-request-v1:fixture'),'opaque-ticket');
});

test('a late refresh cannot resurrect a session after logout', async t => {
  let clock=1_000_000, finishRefresh;
  const storage=stores({now:()=>clock});
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.includes('grant_type=password'))return Response.json(auth(clock,40));
    if(url.includes('grant_type=refresh_token'))return new Promise(resolve=>{finishRefresh=()=>resolve(Response.json(auth(clock)));});
    return Response.json([]);
  });
  const client=createClient(key,api,undefined,storage);
  await client.signIn('principal@acompana.test','fixture-password');clock+=20_000;
  const read=client.select('patients');
  while(!finishRefresh)await new Promise(resolve=>setTimeout(resolve,0));
  await client.signOut();finishRefresh();await assert.rejects(read,{status:401});
  assert.equal(storage.sessionStorage.length,0);
});

test('storage denial degrades to memory and temporary accounts never receive offline caching', async t => {
  const now=1_000_000;
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
  t.mock.method(globalThis,'fetch',async url=>Response.json(url.includes('/token?')?auth(now,3600,user,true):[]));
  const client=createClient(key,api,undefined,{sessionStorage:denied,localStorage:denied,now:()=>now,offlineCache:true});
  await client.signIn('principal@acompana.test','fixture-password');await client.select('patients');
  assert.equal(client.persistenceAvailable,false);assert.equal(client.offlineEnabled,false);
});

test('offline cache is isolated by API, user and exact query, and cannot store privileged responses', () => {
  const storage=memoryStorage(),one=createOfflineCache(api,{storage}),two=createOfflineCache(api+'/other',{storage});
  assert.equal(one.set(user,'/auth/v1/user',{token:'not allowed'}),false);
  assert.equal(one.set(user,'/rest/v1/temporary_accesses?',[]),false);
  one.set(user,'/rest/v1/patients?family_id=eq.a',[{id:'a'}]);
  assert.equal(one.get('other','/rest/v1/patients?family_id=eq.a'),undefined);
  assert.equal(one.get(user,'/rest/v1/patients?family_id=eq.b'),undefined);
  assert.equal(two.get(user,'/rest/v1/patients?family_id=eq.a'),undefined);
  one.retainUser('other');assert.equal(one.get(user,'/rest/v1/patients?family_id=eq.a'),undefined);
});

test('persisted expiry cannot outlive the JWT expiry and malformed records are discarded', () => {
  const now=1_000_000, storage=stores({now:()=>now});const vault=createSessionState(api,storage);
  const session=sessionFromAuth(auth(now,40),{},now);session.expiresAt+=1_000_000;
  assert.equal(vault.save(session),true);assert.equal(vault.read().expiresAt,now+40_000);
  storage.sessionStorage.setItem('acompana-auth-v1:'+api,'broken');assert.equal(vault.read(),undefined);
});
