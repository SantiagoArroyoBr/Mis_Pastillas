import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Exportación producida por el código histórico real, sin modificar main.
export const mainExportSource='92c4034085e13bb38fd0a7ff2622c46ef797873d';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixturePath=new URL('./fixtures/main-backup.json',import.meta.url);
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const wait=async(fn,label,ms=20000)=>{const end=Date.now()+ms;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(r=>setTimeout(r,60));}throw Error('Tiempo agotado: '+label+(last?' ('+last.message+')':''));};
class DevTools{
  constructor(url){this.ws=new WebSocket(url);this.next=0;this.pending=new Map();this.ready=once(this.ws,'open');this.ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id)return;const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});});}
  async send(method,params={}){await this.ready;return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.result?.description||r.exceptionDetails.text);return r.result?.value;}
  close(){this.ws.close();}
}

export function mainExportSeed(){
  const stamp=Date.parse('2026-11-19T06:00:00Z');
  return {
    sel:0,last:'2026-11-19',mode:'home',
    p:[{name:'Familiar ficticio',meds:[
      {name:'Medicina ficticia compartida',base:48,t0:stamp,cons:[
        {dose:1,times:['08:00','20:00'],schedule:{type:'daily'}},
        {dose:0.5,times:['10:00'],schedule:{type:'interval',n:2,start:stamp}}
      ],buys:[{d:'2026-11-18',p:189.5,n:30,w:'Farmacia ficticia A'},{d:'2026-11-19',p:170,n:30,w:'Farmacia ficticia B'}]},
      {name:'Insumo ficticio',kind:'sup',base:12,t0:stamp,cons:[{dose:1,times:['09:00'],schedule:{type:'weekdays',days:[1,3,5]}}],buys:[{d:'2026-11-18',p:72,n:12,w:'Tienda ficticia'}]}
    ]},{name:'Familiar ficticio',meds:[{name:'Otra medicina ficticia',base:20,t0:stamp,cons:[{dose:2,times:['08:30'],schedule:{type:'daily'}}]}]}],
    appts:[{id:'cita-main-ficticia-1',i:0,d:'2026-11-21',t:'10:15',w:'Clínica ficticia',n:'Revisión ficticia'},
      {id:'cita-main-ficticia-2',i:1,d:'2026-11-18',t:'',w:'Consultorio ficticio',n:'Registro anterior ficticio'}],
    pay:{nurses:[[{n:'Personal ficticio A',c:'#C92A2A'},{n:'Personal ficticio B',c:'#1864AB'}],[{n:'Personal ficticio A',c:'#2B8A3E'}]],
      cfg:[{who:'Administración ficticia A',note:'Convenio ficticio',lead:2,base:'2026-11-16',pays:[{d:'2026-11-16',n:3,a:900,old:false},{d:'2026-11-10',n:2,a:null,old:true}],time:'full',rate:300},
        {who:'Administración ficticia B',note:'Segundo índice ficticio',lead:3,base:'2026-11-17',pays:[{d:'2026-11-17',n:2,a:350,old:false}],time:'half',rate:175}],
      v:{'2026-11-16':{0:[{n:'Personal ficticio A',s:'full'}]},'2026-11-17':{0:[{n:'Personal ficticio B',s:'half'}],1:[{n:'Personal ficticio A',s:'half'}]},'2026-11-18':{0:[{n:'Personal ficticio A',s:'full'},{n:'Personal ficticio B',s:'half'}]}}
    }
  };
}

test('main 92c4034 exports a real JSON download and restores that exact archive in its isolated installation', {timeout:120000},async()=>{
  assert.ok(chrome,'Define CHROME_BIN para exportación histórica.');
  const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:5*1024*1024});
  assert.equal(git('rev-parse',mainExportSource).toString().trim(),mainExportSource);
  const files=new Set(git('ls-tree','-r','--name-only',mainExportSource).toString().trim().split(/\r?\n/));
  const cache=new Map();
  const server=createServer((request,response)=>{
    const file=new URL(request.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
    if(!files.has(file)){response.writeHead(404).end();return;}
    try{
      if(!cache.has(file))cache.set(file,git('show',mainExportSource+':'+file));
      const type=file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'application/octet-stream';
      response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(cache.get(file));
    }catch{response.writeHead(500).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const profile=await mkdtemp(path.join(tmpdir(),'acompana-main-export-')),downloadDir=path.join(profile,'downloads');
  await mkdir(downloadDir);
  let browser,cdp;
  try{
    browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let log='';browser.stderr.on('data',x=>log+=x);
    const endpoint=await wait(()=>{const m=log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);return m&&'http://127.0.0.1:'+m[1];},'arranque Chromium',30000);
    const target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();cdp=new DevTools(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Emulation.setTimezoneOverride',{timezoneId:'America/Mexico_City'});
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
    await wait(()=>cdp.evaluate(`document.querySelector('#exp')&&document.querySelector('#homeView').children.length>0`),'main lista');
    await cdp.evaluate(`localStorage.setItem('pastillas-v1',${JSON.stringify(JSON.stringify(mainExportSeed()))})`);
    await cdp.send('Page.reload');
    await wait(()=>cdp.evaluate(`document.body.innerText.includes('Familiar ficticio')`),'fixture visible en main');
    await cdp.evaluate(`document.querySelector('#exp').click()`);
    const filename=await wait(async()=>{const names=await readdir(downloadDir);return names.find(name=>/^cuidados-respaldo-\d{4}-\d{2}-\d{2}\.json$/.test(name));},'descarga JSON real');
    const raw=await readFile(path.join(downloadDir,filename),'utf8'),archive=JSON.parse(raw);
    assert.equal(archive.p.length,2);assert.equal(archive.p[0].name,archive.p[1].name);
    assert.equal(archive.p[0].meds[0].cons.length,2);assert.equal(archive.p[0].meds[0].buys.length,2);
    assert.equal(archive.pay.cfg[0].pays.length,2);assert.equal(archive.appts[1].i,1);
    assert.ok(!archive.pay.generalLedger&&!archive.pay.ledger,'El JSON es main original, no un fixture moderno disfrazado.');
    if(process.env.ACOMPANA_UPDATE_MAIN_FIXTURE==='1'){
      await mkdir(new URL('./fixtures/',import.meta.url),{recursive:true});
      await writeFile(fixturePath,raw);
    }else assert.deepEqual(archive,JSON.parse(await readFile(fixturePath,'utf8')),'La descarga debe reproducir el fixture exacto.');
    await cdp.evaluate(`localStorage.setItem('pastillas-v1',JSON.stringify({sel:0,last:'',mode:'home',p:[{name:'Instalación vacía ficticia',meds:[]}]}))`);
    await cdp.send('Page.reload');await wait(()=>cdp.evaluate(`document.body.innerText.includes('Instalación vacía ficticia')`),'destino vacío');
    const doc=await cdp.send('DOM.getDocument');const input=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#impFile'});
    await cdp.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(downloadDir,filename)]});
    await wait(()=>cdp.evaluate(`document.querySelector('#dlg').open&&document.querySelector('#f')`),'confirmación main');
    assert.equal(await cdp.evaluate(`JSON.parse(localStorage.getItem('pastillas-v1')).p[0].name`),'Instalación vacía ficticia','No sustituye antes de confirmar.');
    await cdp.evaluate(`document.querySelector('#f').requestSubmit()`);
    await wait(()=>cdp.evaluate(`!document.querySelector('#dlg').open&&document.body.innerText.includes('Familiar ficticio')`),'restauración main');
    assert.deepEqual(JSON.parse(await cdp.evaluate(`localStorage.getItem('pastillas-v1')`)),archive);
    await cdp.send('Page.reload');await wait(()=>cdp.evaluate(`document.body.innerText.includes('Familiar ficticio')`),'recarga restaurada');
    assert.deepEqual(JSON.parse(await cdp.evaluate(`localStorage.getItem('pastillas-v1')`)),archive);
  }catch(error){
    if(cdp)console.error('Main fixture diagnostic:',await cdp.evaluate(`({ready:document.readyState,title:document.title,tabs:document.querySelector('#tabs')?.innerHTML,body:document.body?.innerText.slice(0,300)})`).catch(()=>({unavailable:true})));
    throw error;
  }finally{
    cdp?.close();
    if(browser&&browser.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(browser.pid),'/T','/F'],{stdio:'ignore'});else browser.kill('SIGKILL');}
    server.closeAllConnections();await new Promise(r=>server.close(r));
    if(!path.resolve(profile).startsWith(path.resolve(path.join(tmpdir(),'acompana-main-export-'))))throw Error('Ruta de limpieza inválida');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
