import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
const root=fileURLToPath(new URL('../../',import.meta.url));
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const wait=async(fn,label,ms=20000)=>{const until=Date.now()+ms;let last;while(Date.now()<until){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(r=>setTimeout(r,80));}throw Error('Tiempo agotado: '+label+(last?' ('+last.message+')':''));};
class DevTools{
 constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.events=new Map();this.ready=once(this.ws,'open');this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});}}else for(const fn of this.events.get(m.method)||[])fn(m.params);});}
 on(name,fn){this.events.set(name,[...(this.events.get(name)||[]),fn]);}
 async send(method,params={}){await this.ready;return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+(r.result?.description||''));return r.result?.value;}
 close(){this.ws.close();}
}

test('connected build restores sessions, pages history, restores a private backup and opens read-only offline with safe updates', {timeout:240000},async()=>{
 assert.ok(chrome,'Define CHROME_BIN para la prueba de navegador conectado.');
 const build=spawnSync(process.execPath,['backend/build-preview.mjs'],{cwd:root,encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin='http://127.0.0.1:'+port,profile=await mkdtemp(path.join(tmpdir(),'acompana-connected-ui-'));
 const server=spawn(process.execPath,['backend/sandbox-server.mjs'],{cwd:root,env:{...process.env,ACOMPANA_SANDBOX_PORT:String(port),ACOMPANA_SANDBOX_PREVIEW:'1'},stdio:['ignore','pipe','pipe']});
 let serverLog='';server.stderr.on('data',x=>serverLog+=x);server.stdout.on('data',x=>serverLog+=x);
 let browser,cdp,originalWorker;
 const workerPath=path.join(root,'backend/supabase/.temp/preview/sw.js');
 try{
  await wait(async()=>{try{return (await fetch(origin)).ok;}catch{return false;}},'servidor aislado '+serverLog,30000);
  const send=async(p,body,token)=>{const r=await fetch(origin+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token&&{Authorization:'Bearer '+token})},...(body&&{body:JSON.stringify(body)})});const value=await r.json();assert.ok(r.ok,'Fixture '+p+' HTTP '+r.status);return value;};
  const session=await send('/auth/v1/token?grant_type=password',{email:'admin@acompana.test',password:'Acompana-demo-2026!'}),token=session.access_token;
  const family=(await send('/rest/v1/families',null,token))[0].id;
  const patient=await send('/rest/v1/rpc/add_patient_once',{family,patient_name:'Ficha ficticia de integración',request_id:crypto.randomUUID()},token);
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City'}).format(new Date());
  for(let i=0;i<25;i++)await send('/rest/v1/rpc/record_receipt',{family,request_id:crypto.randomUUID(),day,cents:10000,concept_text:'Abono ficticio '+i},token);
  const archive=await send('/rest/v1/rpc/export_family_backup',{family},token);
  const archivePath=path.join(profile,'fixture-family.json');await writeFile(archivePath,JSON.stringify(archive));
  browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let log='';browser.stderr.on('data',x=>log+=x);
  const endpoint=await wait(()=>{const m=log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);return m&&'http://127.0.0.1:'+m[1];},'arranque Chromium',30000);
  const target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();cdp=new DevTools(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Emulation.setTimezoneOverride',{timezoneId:'America/Mexico_City'});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  cdp.on('Page.javascriptDialogOpening',()=>{cdp.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});});
  const check=expression=>wait(()=>cdp.evaluate(expression),expression);
  const click=selector=>cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,value)=>cdp.evaluate(`(()=>{const x=document.querySelector(${JSON.stringify(selector)});x.value=${JSON.stringify(value)};x.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const submit=selector=>cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
  await check(`document.querySelector('#credentials')&&!document.querySelector('#auth').hidden&&!document.querySelector('#auth').hasAttribute('aria-busy')`);
  await fill('#credentials [name=email]','admin@acompana.test');await fill('#auth-password','Acompana-demo-2026!');
  await cdp.evaluate(`document.querySelector('#remember-session').checked=true;document.querySelector('#offline-consultation').checked=true`);await submit('#credentials');
  await check(`!document.querySelector('#session').hidden&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  assert.equal(await cdp.evaluate(`document.querySelector('#pilot-active-count').textContent`),'1');
  await click('#pilot-navigation a[href="#finance"]');await check(`!document.querySelector('#finance').hidden`);
  assert.equal(await cdp.evaluate(`document.querySelector('#finance-receipts').children.length`),20);
  await click('#receipt-toggle');assert.match(await cdp.evaluate(`document.querySelector('#finance-receipts').textContent`),/100\.00/);
  await click('button[aria-label="Cargar más: abonos generales"]');await check(`document.querySelector('#finance-receipts').children.length===25&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  assert.ok(!(await cdp.evaluate(`document.querySelector('#finance-receipts').textContent`)).includes('$100.00'));
  assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),true);
  await click('#pilot-navigation a[href="#backup-review"]');await check(`!document.querySelector('#backup-review').hidden`);
  const doc=await cdp.send('DOM.getDocument');const input=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#family-backup-file'});await cdp.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[archivePath]});
  await check(`!document.querySelector('#family-backup-review').hidden`);await fill('#restore-family-backup [name=name]','Familia recuperada de integración');
  await cdp.evaluate(`document.querySelector('#restore-family-backup [name=confirmed]').checked=true`);await submit('#restore-family-backup');
  await check(`document.querySelector('#families').selectedOptions[0]?.textContent==='Familia recuperada de integración'&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  assert.equal((await send('/rest/v1/receipts?family_id=eq.'+family,null,token)).length,25,'La familia original conserva sus abonos.');
  await cdp.send('Page.reload');await check(`!document.querySelector('#session').hidden&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  await check(`navigator.serviceWorker.controller!==null`);await cdp.evaluate(`caches.open('acompanha-fixture-legacy')`);
  await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await check(`document.querySelector('#session').dataset.readOnly==='true'&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  await cdp.send('Page.reload');await check(`!document.querySelector('#session').hidden&&document.querySelector('#session').dataset.readOnly==='true'&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  await click('#pilot-navigation a[href="#family"]');await check(`!document.querySelector('[data-pilot-view="#family"]').hidden`);
  assert.match(await cdp.evaluate(`document.querySelector('#patients').textContent`),/Ficha ficticia/);
  assert.equal(await cdp.evaluate(`getComputedStyle(document.querySelector('#add-patient')).display`),'none');
  const cachePaths=await cdp.evaluate(`(async()=>{const paths=[];for(const key of await caches.keys()){const cache=await caches.open(key);for(const req of await cache.keys())paths.push(new URL(req.url).pathname);}return paths;})()`);
  assert.ok(!cachePaths.some(x=>/^\/(auth|rest|api)\//.test(x)),'El SW nunca almacena Auth ni API.');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await click('#reload');await check(`document.querySelector('#session').dataset.readOnly==='false'&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  originalWorker=await readFile(workerPath,'utf8');await writeFile(workerPath,originalWorker.replace(/(const VERSION = ')[^']+(')/,"$1fixture-update$2"));
  await cdp.evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`);
  await check(`!!document.querySelector('#apply-connected-update')`);await click('#apply-connected-update');
  await check(`!document.querySelector('#session').hidden&&!document.querySelector('#session').hasAttribute('aria-busy')`);
  assert.equal(await cdp.evaluate(`caches.has('acompanha-fixture-legacy')`),true,'La actualización no elimina cachés de la PWA de referencia.');
  await click('#logout');await check(`!document.querySelector('#auth').hidden`);
  assert.equal(await cdp.evaluate(`Object.keys(localStorage).some(k=>k.startsWith('acompana-auth-v1:')||k.startsWith('acompana-offline-v1:'))`),false);
 }catch(error){
  console.error('Fallo integrado:',error.message);
  throw error;
 }finally{
  cdp?.close();
  for(const child of [browser,server])if(child&&child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGKILL');}
  if(originalWorker)await writeFile(workerPath,originalWorker);
  const expected=path.join(tmpdir(),'acompana-connected-ui-');if(!path.resolve(profile).startsWith(path.resolve(expected)))throw Error('Ruta de limpieza no válida');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
