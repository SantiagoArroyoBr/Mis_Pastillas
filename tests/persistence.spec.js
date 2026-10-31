const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME_BIN || [
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(fs.existsSync);

let server, serverUrl, browser, browserProfile, cdp, fixtureDir;

class DevTools {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

const initScript = String.raw`(() => {
  const key = 'pastillas-v1';
  const nativeGet = Storage.prototype.getItem;
  const nativeSet = Storage.prototype.setItem;
  const nativeRemove = Storage.prototype.removeItem;
  const query = new URLSearchParams(location.search);
  const state = {
    failGet: query.has('failGet'),
    failSet: query.has('failSet'),
    writes: 0,
    seed(value) {
      if (value === null) nativeRemove.call(localStorage, key);
      else nativeSet.call(localStorage, key, value);
    },
    read() { return nativeGet.call(localStorage, key); }
  };
  Storage.prototype.getItem = function (name) {
    if (name === key && state.failGet) throw new DOMException('Fallo de lectura simulado', 'SecurityError');
    return nativeGet.call(this, name);
  };
  Storage.prototype.setItem = function (name, value) {
    if (name === key) {
      state.writes++;
      if (state.failSet) throw new DOMException('Fallo de escritura simulado', 'QuotaExceededError');
    }
    return nativeSet.call(this, name, value);
  };
  Object.defineProperty(window, '__persistenceTest', { value: state });
})();`;

function evaluate(expression) {
  return cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => {
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  });
}
async function waitFor(expression, message = expression, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await evaluate(expression)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Tiempo agotado esperando: ' + message);
}
async function navigate(query = '') {
  await cdp.send('Page.navigate', { url: serverUrl + '/' + query });
  await waitFor("document.readyState === 'complete'", 'carga del documento');
  await waitFor("typeof persistenceReady !== 'undefined'", 'inicialización de Acompaña');
}
async function seed(raw) {
  await evaluate('window.__persistenceTest.seed(' + (raw === null ? 'null' : JSON.stringify(raw)) + ')');
}
async function uploadJson(data, name = 'respaldo-prueba.json') {
  const file = path.join(fixtureDir, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#impFile' });
  await cdp.send('DOM.setFileInputFiles', { files: [file], nodeId });
}
function validBackup(name = 'Paciente ficticio restaurado') {
  return { sel: 0, last: '', mode: 'home', p: [{ name, meds: [] }], appts: [], pay: {} };
}

before(async () => {
  assert.ok(CHROME, 'No se encontró Chromium. Define CHROME_BIN para indicar su ruta.');
  server = http.createServer((req, res) => {
    const requested = new URL(req.url, 'http://localhost').pathname;
    const file = requested === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, requested);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const contentType = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  serverUrl = 'http://127.0.0.1:' + server.address().port;
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acompanha-persistence-'));
  browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'acompanha-chromium-'));
  browser = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + browserProfile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const wsEndpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chromium no publicó DevTools: ' + stderr)), 10000);
    browser.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+/);
      if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
    });
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Chromium terminó (' + code + '): ' + stderr)); });
  });
  const targetResponse = await fetch(wsEndpoint + '/json/new?' + encodeURIComponent(serverUrl + '/'), { method: 'PUT' });
  if (!targetResponse.ok) throw new Error('No se pudo crear la pestaña Chromium: ' + targetResponse.status);
  const target = await targetResponse.json();
  cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
  await navigate();
});
after(async () => {
  if (cdp) cdp.close();
  if (browser && browser.exitCode === null) {
    if (process.platform === 'win32' && browser.pid) spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
    else browser.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => browser.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  }
  if (server) await new Promise(resolve => server.close(resolve));
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (browserProfile) fs.rmSync(browserProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('instalación nueva habilita persistencia y operaciones normales', async () => {
  await seed(null); await navigate();
  assert.equal(await evaluate('persistenceReady'), true);
  assert.equal(await evaluate('S.p.length'), 2);
  assert.equal(await evaluate('save()'), true);
  assert.ok(await evaluate("__persistenceTest.read() !== null"));
});
test('datos válidos se cargan sin activar el modo protegido', async () => {
  await seed(JSON.stringify(validBackup('Paciente ficticio válido'))); await navigate();
  assert.equal(await evaluate('persistenceReady'), true);
  assert.equal(await evaluate('S.p[0].name'), 'Paciente ficticio válido');
});
test('JSON corrupto bloquea escrituras y conserva el contenido original', async () => {
  const raw = '{"p":'; await seed(raw); await navigate();
  assert.equal(await evaluate('persistenceReady'), false);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
  assert.equal(await evaluate('save()'), false);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
});
test('fallo de lectura activa modo protegido sin sobrescribir datos', async () => {
  const raw = JSON.stringify(validBackup('No debe reemplazarse')); await seed(raw); await navigate('?failGet=1');
  assert.equal(await evaluate('persistenceReady'), false);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
});
test('resultado de migración incompleto bloquea la carga y conserva los datos', async () => {
  const invalid = { sel: 0, last: '', p: [], pay: {}, appts: [] };
  const raw = JSON.stringify(invalid); await seed(raw); await navigate();
  assert.equal(await evaluate('persistenceReady'), false);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
});
test('fallo de escritura normal bloquea nuevas modificaciones y conserva el valor anterior', async () => {
  await seed(null); await navigate('?failSet=1');
  assert.equal(await evaluate('persistenceReady'), true);
  assert.equal(await evaluate('save()'), false);
  assert.equal(await evaluate('persistenceReady'), false);
  assert.equal(await evaluate('__persistenceTest.read()'), null);
});
test('rechaza configuraciones excedentes que migrate descartaría', async () => {
  const invalid = validBackup(); invalid.pay = { cfg: [{}, {}, { who: 'registro sobrante' }] };
  const raw = JSON.stringify(invalid); await seed(raw); await navigate();
  assert.equal(await evaluate('persistenceReady'), false);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
});
test('migración histórica válida conserva turnos, enfermeros y asignaciones', async () => {
  const legacy = validBackup();
  legacy.pay = { w: [{ who: 'Responsable ficticio', day: 5, v: { '2026-10-30': 'Enfermero ficticio' } }], nurses: [], v: {} };
  await seed(JSON.stringify(legacy)); await navigate();
  assert.equal(await evaluate('persistenceReady'), true);
  assert.equal(await evaluate('S.pay.nurses[0][0].n'), 'Enfermero ficticio');
  assert.equal(await evaluate("S.pay.v['2026-10-30'][0][0].n"), 'Enfermero ficticio');
});
test('restauración válida recupera una carga bloqueada y no escribe antes de confirmar', async () => {
  const raw = '{"p":'; await seed(raw); await navigate(); await uploadJson(validBackup());
  await waitFor("document.querySelector('#restoreConfirm')", 'confirmación de restauración');
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate('persistenceReady'), false);
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("persistenceReady === true && S.p[0].name === 'Paciente ficticio restaurado'", 'restauración completada');
  assert.equal(await evaluate('__persistenceTest.read() !== null'), true);
  assert.equal(await evaluate("JSON.parse(__persistenceTest.read()).p[0].name"), 'Paciente ficticio restaurado');
});
test('archivo inválido no escribe ni altera el almacenamiento original', async () => {
  const raw = '{"p":'; await seed(raw); await navigate(); await uploadJson('esto no es JSON', 'invalido.json');
  await waitFor("document.querySelector('#closeImportMessage')", 'aviso de archivo inválido');
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
});
test('cancelar la restauración no realiza escrituras', async () => {
  const raw = '{"p":'; await seed(raw); await navigate(); await uploadJson(validBackup());
  await waitFor("document.querySelector('#cancelRestore')", 'cancelación de restauración');
  await evaluate("document.querySelector('#cancelRestore').click()");
  await waitFor("!document.querySelector('#dlg').open", 'cierre de confirmación');
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
  assert.equal(await evaluate('persistenceReady'), false);
});
test('fallo de escritura durante restauración conserva almacenamiento y estado anteriores', async () => {
  const raw = '{"p":'; await seed(raw); await navigate('?failSet=1'); await uploadJson(validBackup());
  await waitFor("document.querySelector('#restoreConfirm')", 'confirmación de restauración');
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("persistenceFailure === 'write'", 'fallo de escritura de restauración');
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
  assert.equal(await evaluate('persistenceReady'), false);
  assert.equal(await evaluate('S.p[0].name'), 'Persona 1');
});
test('la restauración también recupera un fallo de lectura de localStorage', async () => {
  await seed(null); await navigate('?failGet=1');
  assert.equal(await evaluate('persistenceReady'), false);
  await uploadJson(validBackup('Recuperado tras fallo de lectura'));
  await waitFor("document.querySelector('#restoreConfirm')", 'confirmación tras fallo de lectura');
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("persistenceReady === true && S.p[0].name === 'Recuperado tras fallo de lectura'", 'recuperación tras fallo de lectura');
  assert.equal(await evaluate("JSON.parse(__persistenceTest.read()).p[0].name"), 'Recuperado tras fallo de lectura');
});

test('las utilidades conservan resultados, exposición global y escape seguro', async () => {
  await seed(null); await navigate();
  const actual = await evaluate(`(() => {
    const oldEsc=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
    function oldTimes(txt){const out=[];for(const t of txt.split(/[,;]+/)){const m=t.trim().match(/^(\\d{1,2})(?::(\\d{2}))?$/);if(!m)return null;const h=+m[1],mi=+(m[2]||0);if(h>23||mi>59)return null;out.push(String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0'));}return [...new Set(out)].sort()}
    const oldPos=v=>{const n=parseFloat(String(v).replace(',','.'));return isFinite(n)?n:NaN};
    const oldNum=n=>String(n).replace('.',',');
    const oldMoney=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
    const a=['8; 08:00,20:30','23:59','24:00','8:60',''];
    const b=['1,25','0','-3','no'];
    const c=[0,1.5,1234.56];
    const dangerous=['<img src=x onerror=alert(1)>','\" autofocus onfocus=alert(1) & '+String.fromCharCode(39),'</script><script>alert(1)</script>'];
    return JSON.stringify({times:a.map(x=>[parseTimes(x),oldTimes(x)]),pos:b.map(x=>[pos(x),oldPos(x)]),num:c.map(x=>[num(x),oldNum(x)]),money:c.map(x=>[money(x),oldMoney(x)]),esc:dangerous.map(x=>[esc(x),oldEsc(x)]),keys:Object.keys(window.AcompanaUtils).sort(),safe:(()=>{const d=document.createElement('div');d.innerHTML='<p>'+esc(dangerous[0])+'</p>';return !d.querySelector('img')})()});
  })()`);
  const values = JSON.parse(actual);
  for (const key of ['times','pos','num','money','esc']) for (const [current, previous] of values[key]) assert.deepEqual(current, previous, key + ' debe conservar el resultado anterior');
  assert.deepEqual(values.keys, ['esc','money','num','parseTimes','pos']);
  assert.equal(values.safe, true);
});

test('formularios usan las utilidades y el service worker precarga js/utils.js', async () => {
  await seed(null); await navigate();
  await evaluate("document.querySelector('#add').click()");
  await waitFor("document.querySelector('#h0 input[type=time]')", 'formulario de medicina');
  assert.equal(await evaluate("typeof esc==='function' && typeof parseTimes==='function' && typeof pos==='function'"), true);
  assert.equal(await evaluate("fetch('js/utils.js').then(r=>r.headers.get('content-type'))"), 'text/javascript; charset=utf-8');
  assert.equal(await evaluate("navigator.serviceWorker.ready.then(()=>caches.open('cuidados-v9').then(c=>c.match(new URL('js/utils.js',location.href).href).then(Boolean)))"), true);
  await evaluate(`(() => {
    const set=(selector,value)=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
    set('#n','Medicamento ficticio offline');set('#q','12');set('#d0','1');set('#h0 input[type=time]','08:00');
    document.querySelector('#f button[type=submit]').click();
  })()`);
  await waitFor("S.p[S.sel].meds.some(m=>m.name==='Medicamento ficticio offline')", 'guardado ficticio');
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  try {
    await cdp.send('Page.navigate',{url:serverUrl+'/'});
    await waitFor("document.readyState==='complete' && S.p[S.sel].meds.some(m=>m.name==='Medicamento ficticio offline')", 'recarga offline con datos ficticios', 10000);
    assert.equal(await evaluate("S.p[S.sel].meds.find(m=>m.name==='Medicamento ficticio offline').base"), 12);
  } finally {
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  }
});
