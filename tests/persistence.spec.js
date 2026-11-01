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

let server, serverUrl, browser, browserProfile, cdp, fixtureDir, swUpdateVariant = false;

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
    errors: [],
    writes: 0,
    exportBlob: null,
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
  window.addEventListener('error', event => state.errors.push(event.message));
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => { state.exportBlob = blob; return createObjectURL(blob); };
})();`;

function evaluate(expression) {
  return cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => {
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
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
  try { await waitFor("typeof persistenceReady !== 'undefined'", 'inicialización de Acompaña'); }
  catch (error) { throw new Error(error.message + ' Errores JS: ' + JSON.stringify(await evaluate('__persistenceTest.errors'))); }
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
async function continueRestore() {
  await waitFor("document.querySelector('#continueRestore')", 'vista previa del respaldo');
  await evaluate("document.querySelector('#continueRestore').click()");
  await waitFor("document.querySelector('#restoreConfirm')", 'confirmación explícita de restauración');
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
    const contentType = file.endsWith('.html') ? 'text/html; charset=utf-8'
      : file.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : file.endsWith('.css') ? 'text/css; charset=utf-8'
          : file.endsWith('.json') ? 'application/json; charset=utf-8'
            : file.endsWith('.png') ? 'image/png'
            : file.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    if (file.endsWith(path.sep + 'sw.js') && swUpdateVariant) {
      res.end(fs.readFileSync(file, 'utf8') + '\n// cambio sintético para verificar actualización\n');
      return;
    }
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
      new Promise(resolve => setTimeout(resolve, 10000))
    ]);
  }
  if (server) await new Promise(resolve => server.close(resolve));
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  if (browserProfile) fs.rmSync(browserProfile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

test('instalación nueva habilita persistencia y operaciones normales', async () => {
  await seed(null); await navigate();
  assert.equal(await evaluate('persistenceReady'), true);
  assert.equal(await evaluate('S.p.length'), 2);
  assert.equal(await evaluate('save()'), true);
  assert.ok(await evaluate("__persistenceTest.read() !== null"));
});
test('el módulo de dominio comparte cálculos puros sin cambiar persistencia', async () => {
  const before = await evaluate('__persistenceTest.read()');
  assert.deepEqual(await evaluate("AcompanaDomain.parseTimes('8;08:00;20')"), ['08:00', '20:00']);
  assert.equal(await evaluate("AcompanaDomain.schedText({type:'interval',n:3})"), 'cada 3 días');
  const result = await evaluate("AcompanaDomain.calc({base:1,t0:new Date(2030,0,1,7).getTime(),cons:[{dose:1,times:['08:00'],schedule:{type:'daily'}}]},new Date(2030,0,1,7).getTime())");
  assert.equal(result.rem, 1);
  assert.equal(result.left, 1);
  assert.equal(await evaluate('__persistenceTest.read()'), before);
});
test('los formularios anuncian errores de validación a tecnologías de asistencia', async () => {
  await seed(null); await navigate();
  await evaluate("S.mode='meds'; save(); render(); document.querySelector('#add').click()");
  await waitFor("document.querySelector('#err')", 'formulario de medicina');
  assert.equal(await evaluate("document.querySelector('#err').getAttribute('role')"), 'alert');
  assert.equal(await evaluate("document.querySelector('#err').getAttribute('aria-live')"), 'polite');
  await evaluate("document.querySelector('#f').requestSubmit()");
  await waitFor("document.querySelector('#err').textContent.includes('Escribe el nombre')", 'mensaje de validación accesible');
});
test('la vista se adapta a seis anchuras móviles y conserva los datos locales', async () => {
  const before = await evaluate('__persistenceTest.read()');
  try {
    for (const width of [320, 360, 375, 390, 430, 768]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: true });
      await waitFor(`document.documentElement.clientWidth === ${width}`, `viewport de ${width} px`);
      const view = await evaluate("({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,direction:getComputedStyle(document.querySelector('.backup')).flexDirection,bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()})");
      assert.equal(view.width, width);
      assert.ok(view.scroll <= view.width, `sin desbordamiento horizontal a ${width} px`);
      assert.equal(view.direction, width <= 360 ? 'column' : 'row');
      assert.equal(view.bg, '#F4EBDD');
    }
    assert.equal(await evaluate('__persistenceTest.read()'), before);
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  }
});
test('el tema del manifest, el navegador y la interfaz mantienen la identidad visual', async () => {
  const metadata = await evaluate("fetch('/manifest.json').then(response=>response.json())");
  assert.equal(metadata.theme_color, '#315B50');
  assert.equal(metadata.background_color, '#315B50');
  assert.equal(await evaluate("document.querySelector('meta[name=theme-color]').content"), metadata.theme_color);
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--navy').trim()"), metadata.theme_color);
  assert.equal(metadata.icons.length, 2);
  for (const icon of metadata.icons) assert.equal((await evaluate(`fetch(${JSON.stringify(icon.src)}).then(response=>response.ok)`)), true);
});
test('los nombres mostrados desde los datos se tratan como texto, no como HTML', async () => {
  const backup = validBackup('<img src=x onerror=alert(1)>');
  backup.mode = 'meds';
  backup.p[0].meds.push({ name: '<img src=x onerror=alert(1)>', base: 4, cons: [{ dose: 1, times: ['08:00'], schedule: { type: 'daily' } }], t0: Date.now() });
  await seed(JSON.stringify(backup)); await navigate();
  assert.equal(await evaluate("document.querySelector('#tabs img, #list img') === null"), true);
  assert.equal((await evaluate("document.querySelector('#list').textContent")).includes('<img src=x onerror=alert(1)>'), true);
  assert.deepEqual(await evaluate('__persistenceTest.errors'), []);
});
test('la ficha explica el saldo único compartido por todas sus pautas', async () => {
  const backup = validBackup('Paciente ficticio para inventario');
  backup.mode = 'home';
  backup.p[0].meds = [
    { name: 'Medicina ficticia con dos pautas', base: 0, t0: Date.now(), cons: [
      { dose: 1, times: ['08:00'], schedule: { type: 'daily' } },
      { dose: 0.5, times: ['20:00'], schedule: { type: 'daily' } }
    ] },
    { name: 'Medicina ficticia con una pauta', base: 4, t0: Date.now(), cons: [
      { dose: 1, times: ['09:00'], schedule: { type: 'daily' } }
    ] }
  ];
  await seed(JSON.stringify(backup)); await navigate();

  await evaluate("S.mode='home';render()");
  const alertMentions = await evaluate("(document.querySelector('#homeView').textContent.match(/Medicina ficticia con dos pautas/g)||[]).length");
  assert.equal(alertMentions, 1, 'la ficha genera un solo pendiente de reposición, no uno por pauta');
  await evaluate("S.mode='meds';render()");
  const multi = await evaluate(`(()=>{const card=[...document.querySelectorAll('#list .card')].find(x=>x.textContent.includes('Medicina ficticia con dos pautas'));return {note:card.querySelector('[role="note"]')?.textContent,rem:card.querySelector('.big').textContent.trim(),count:document.querySelectorAll('#list .card').length}})()`);
  assert.match(multi.note, /2 pautas de consumo/);
  assert.match(multi.note, /un solo inventario compartido/);
  assert.match(multi.note, /aviso de reposición consideran todas las pautas/);
  assert.equal(multi.count, 2);
  assert.equal(multi.rem, String((await evaluate("AcompanaDomain.calc(S.p[0].meds[0]).rem")).toString()).replace('.', ',') + ' pastillas');
  assert.match((await evaluate("[...document.querySelectorAll('#list .card')].find(x=>x.textContent.includes('Medicina ficticia con una pauta')).querySelector('[role=note]').textContent")), /1 pauta de consumo/);

  const stored = JSON.parse(await evaluate('__persistenceTest.read()'));
  assert.equal(stored.p[0].meds[0].cons.length, 2);
  await evaluate("document.querySelector('#exp').click()");
  await waitFor('__persistenceTest.exportBlob !== null', 'exportación de inventario ficticio');
  const exported = await evaluate("__persistenceTest.exportBlob.text().then(text=>JSON.parse(text))");
  assert.equal(exported.p[0].meds[0].cons.length, 2);
  await uploadJson(exported, 'inventario-compartido-ficticio.json');
  await continueRestore();
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("JSON.parse(__persistenceTest.read()).p[0].meds[0].cons.length===2", 'restauración de inventario ficticio');
  await navigate();
  await evaluate("S.mode='meds';render()");
  assert.match(await evaluate("[...document.querySelectorAll('#list .card')].find(x=>x.textContent.includes('Medicina ficticia con dos pautas')).querySelector('[role=note]').textContent"), /2 pautas de consumo/);
  assert.deepEqual(await evaluate('__persistenceTest.errors'), []);
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
test('asignar personal conserva íntegros los registros anteriores a 400 días', async () => {
  const daysAgo = days => {
    const date = new Date(Date.now() - days * 864e5);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };
  const historicalDays = [399, 400, 401, 1200].map(daysAgo);
  const historicalPay = [
    { d: '2022-01-03', n: 2, a: 250.5, old: true },
    { d: '2024-06-14', n: 3, a: 375, old: false }
  ];
  const backup = validBackup('Paciente ficticio con historial');
  backup.mode = 'pay';
  backup.pay = {
    cfg: [{ who: 'Responsable ficticio', base: '2020-01-01', rate: 125, pays: historicalPay }],
    nurses: [[{ id:'history_nurse',n: 'Enfermera ficticia', c: '#C92A2A',ratesCents:{full:1250,half:null} }]],
    v: Object.fromEntries(historicalDays.map((date, index) => [date, { 0: [{ n: 'Enfermera ficticia', s: index % 2 ? 'half' : 'full' }] }]))
  };
  await seed(JSON.stringify(backup)); await navigate();
  const before = await evaluate("JSON.parse(__persistenceTest.read())");
  const today = await evaluate("ymd(new Date())");
  const coverageBefore = await evaluate("(()=>{const c=cover(0);return {total:c.total,dates:c.dates,unused:c.unused}})()");
  assert.equal(coverageBefore.total, 3);
  assert.equal(coverageBefore.dates.length, 4);
  assert.equal(coverageBefore.unused, 0);

  const assignToday = async () => {
    await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelector('#nm').value='0';document.querySelector('#f').requestSubmit()`);
    await waitFor(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}]?.[0]?.length`, 'asignación ficticia guardada');
  };
  await assignToday();
  await assignToday();

  const afterAssignment = await evaluate("JSON.parse(__persistenceTest.read())");
  assert.deepEqual(historicalDays.map(date => afterAssignment.pay.v[date][0]), historicalDays.map(date => before.pay.v[date][0]));
  assert.deepEqual(afterAssignment.pay.cfg[0].pays, before.pay.cfg[0].pays);
  assert.equal(afterAssignment.pay.v[today][0].length, 1, 'repetir la misma asignación no debe duplicarla');
  const coverageAfter = await evaluate("(()=>{const c=cover(0);return {total:c.total,dates:c.dates,unused:c.unused}})()");
  assert.equal(coverageAfter.total, coverageBefore.total);
  assert.equal(coverageAfter.dates.length, coverageBefore.dates.length + 1);
  assert.equal(coverageAfter.unused, 0);

  await evaluate("document.querySelector('#exp').click()");
  await waitFor('__persistenceTest.exportBlob !== null', 'exportación del historial ficticio');
  const exported = await evaluate("__persistenceTest.exportBlob.text().then(text=>JSON.parse(text))");
  assert.deepEqual(historicalDays.map(date => exported.pay.v[date][0]), historicalDays.map(date => before.pay.v[date][0]));
  await uploadJson(exported, 'historial-pagos-ficticio.json');
  await continueRestore();
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}]?.[0]?.length===1`, 'restauración del historial con la nueva asignación');
  const restored = await evaluate("JSON.parse(__persistenceTest.read())");
  assert.deepEqual(historicalDays.map(date => restored.pay.v[date][0]), historicalDays.map(date => before.pay.v[date][0]));
  assert.deepEqual(restored.pay.cfg[0].pays, before.pay.cfg[0].pays);

  assert.equal(await evaluate('cover(0).total'),3,'los registros históricos de cobertura permanecen inalterados');
  assert.equal(await evaluate("Boolean(document.querySelector('#payView [data-pa=payreg]'))"),false,'el formulario legado ya no se presenta en la interfaz principal');
});
test('restauración válida recupera una carga bloqueada y no escribe antes de confirmar', async () => {
  const raw = '{"p":'; await seed(raw); await navigate(); await uploadJson(validBackup());
  await continueRestore();
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate('persistenceReady'), false);
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("persistenceReady === true && S.p[0].name === 'Paciente ficticio restaurado'", 'restauración completada');
  assert.match(await evaluate("document.querySelector('#backupStatus').textContent"), /restauración completada/i);
  assert.equal(await evaluate('__persistenceTest.read() !== null'), true);
  assert.equal(await evaluate("JSON.parse(__persistenceTest.read()).p[0].name"), 'Paciente ficticio restaurado');
});
test('archivo inválido no escribe ni altera el almacenamiento original', async () => {
  const raw = '{"p":'; await seed(raw); await navigate(); await uploadJson('esto no es JSON', 'invalido.json');
  await waitFor("document.querySelector('#closeImportMessage')", 'aviso de archivo inválido');
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
});
test('fallo de lectura del archivo se comunica y conserva los datos actuales', async () => {
  const raw = JSON.stringify(validBackup('Estado ficticio conservado ante lectura fallida'));
  await seed(raw); await navigate();
  await evaluate("FileReader.prototype.readAsText=function(){throw new DOMException('lectura simulada','NotReadableError')}");
  await uploadJson(validBackup('No debe restaurarse'));
  await waitFor("document.querySelector('#closeImportMessage')", 'aviso de fallo de lectura');
  assert.match(await evaluate("document.querySelector('#dlg').textContent"), /navegador rechazó la lectura/i);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
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
  await continueRestore();
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
  await continueRestore();
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("persistenceReady === true && S.p[0].name === 'Recuperado tras fallo de lectura'", 'recuperación tras fallo de lectura');
  assert.equal(await evaluate("JSON.parse(__persistenceTest.read()).p[0].name"), 'Recuperado tras fallo de lectura');
});

test('el respaldo JSON exportado puede restaurarse en el perfil aislado', async () => {
  const fixture = validBackup('Cuidadora ficticia de prueba');
  fixture.p[0].meds = [{ name: 'Medicamento ficticio', base: 12, cons: [], t0: 1000 }];
  await seed(JSON.stringify(fixture)); await navigate();
  await evaluate("document.querySelector('#exp').click()");
  const exported = await evaluate("__persistenceTest.exportBlob.text()");
  const parsed = JSON.parse(exported);
  assert.equal(parsed.p[0].name, fixture.p[0].name);
  assert.equal(parsed.p[0].meds[0].name, fixture.p[0].meds[0].name);
  assert.equal(parsed.p[0].meds[0].base, 12);

  await uploadJson(exported, 'respaldo-exportado-ficticio.json');
  await continueRestore();
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("persistenceReady === true && S.p[0].name === 'Cuidadora ficticia de prueba'", 'restauración del respaldo exportado');
  assert.deepEqual(await evaluate("JSON.parse(__persistenceTest.read())"), parsed);
});

test('el límite de importación rechaza archivos de más de 10 MiB antes de escribir', async () => {
  const original = JSON.stringify(validBackup('Datos locales ficticios conservados'));
  await seed(original); await navigate();
  await uploadJson(' '.repeat(10 * 1024 * 1024 + 1), 'respaldo-demasiado-grande.json');
  await waitFor("document.querySelector('#closeImportMessage')", 'aviso por tamaño excesivo');
  assert.equal(await evaluate('__persistenceTest.read()'), original);
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.match(await evaluate("document.querySelector('#dlg').textContent"), /10 MiB/);
  assert.match(await evaluate("document.querySelector('#dlg').textContent"), /No se leyó ni se modificó/);
});

test('la vista previa presenta conteos validados y requiere confirmación adicional', async () => {
  const backup = validBackup('Paciente ficticio de vista previa');
  backup.p[0].meds = [{ name: 'Medicamento ficticio', base: 5, cons: [], t0: 1000 }];
  backup.exportedAt = '2026-10-30T12:00:00Z';
  await seed(JSON.stringify(validBackup('Estado actual ficticio'))); await navigate(); await uploadJson(backup);
  await waitFor("document.querySelector('#continueRestore')", 'vista previa');
  const preview = await evaluate("document.querySelector('#dlg').textContent");
  assert.match(preview, /1 persona/);
  assert.match(preview, /1 medicinas o insumos/);
  assert.match(preview, /30\/10\/2026/);
  assert.match(preview, /reemplazarán los datos actuales de esta instalación/i);
  assert.match(preview, /Cancelar deja los datos actuales sin cambios/i);
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate("document.querySelector('#restoreConfirm') === null"), true);
  await evaluate("document.querySelector('#exportBeforeRestore').click()");
  await waitFor('__persistenceTest.exportBlob !== null', 'exportación del estado actual');
  assert.equal(await evaluate("__persistenceTest.exportBlob.text().then(x=>JSON.parse(x).p[0].name)"), 'Estado actual ficticio');
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  await continueRestore();
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  await evaluate("document.querySelector('#cancelRestore').click()");
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
  assert.equal(await evaluate("JSON.parse(__persistenceTest.read()).p[0].name"), 'Estado actual ficticio');
  assert.match(await evaluate("document.querySelector('#backupStatus').textContent"), /cancelada.*no se modificaron/i);
});

test('exportar informa que descarga una copia privada sin borrar los datos actuales', async () => {
  const raw = JSON.stringify(validBackup('Respaldo ficticio intacto'));
  await seed(raw); await navigate();
  assert.match(await evaluate("document.querySelector('#backupHelp').textContent"), /copia privada.*no borra/i);
  await evaluate("document.querySelector('#exp').click()");
  await waitFor('__persistenceTest.exportBlob !== null', 'descarga del respaldo');
  assert.match(await evaluate("document.querySelector('#backupStatus').textContent"), /descarga iniciada.*copia privada.*siguen guardados/i);
  assert.equal(await evaluate('__persistenceTest.read()'), raw);
  assert.equal(await evaluate('__persistenceTest.writes'), 0);
});

test('las notificaciones no contienen nombres ni detalles personales', async () => {
  await seed(JSON.stringify(validBackup('Paciente privado ficticio'))); await navigate();
  await evaluate(`window.__notificationCapture=[]; window.Notification=class { static permission='granted'; constructor(title,options){window.__notificationCapture.push({title,body:options.body})} }; S.last=''; S.p[0].meds.push({name:'Medicamento privado ficticio',base:0,cons:[{dose:1,times:['08:00'],schedule:{type:'daily'}}],t0:Date.now()}); notifyDaily()`);
  const notifications = await evaluate('__notificationCapture');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].body, 'Hay pendientes de reposición.');
  assert.doesNotMatch(JSON.stringify(notifications), /Paciente privado|Medicamento privado/);
});

test('notificación separa reposición, saldo general y cita próxima sin revelar información privada', async () => {
  await seed(JSON.stringify(validBackup('Paciente reservado ficticio'))); await navigate();
  await evaluate(`
    window.__notificationCapture=[];
    window.Notification=class { static permission='granted'; constructor(title,options){window.__notificationCapture.push({title,body:options.body})} };
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    const date=window.AcompanaDomain.ymd(tomorrow);
    S.last='';
    S.p[0].meds.push({name:'Medicina confidencial ficticia',base:0,cons:[{dose:1,times:['08:00'],schedule:{type:'daily'}}],t0:Date.now()});
    S.pay.nurses[0]=[{id:'nurse-private',n:'Enfermero confidencial',c:'#315B50',ratesCents:{full:10000,half:null}}];
    S.pay.v[date]={0:[{n:'Enfermero confidencial',service:{id:'service-private',nurseId:'nurse-private',type:'full',amountCents:10000}}]};
    S.appts=[{id:'appointment-private',i:0,d:date,t:'10:00',w:'Clínica confidencial',n:'Nota confidencial'}];
    notifyDaily();
  `);
  const notifications = await evaluate('__notificationCapture');
  assert.equal(notifications.length, 1);
  const body = notifications[0].body;
  assert.match(body, /pendientes de reposición/);
  assert.match(body, /importe pendiente en el saldo general/);
  assert.match(body, /citas próximas/);
  assert.doesNotMatch(JSON.stringify(notifications), /Paciente reservado|Medicina confidencial|Enfermero confidencial|Clínica confidencial|Nota confidencial|10000/);
  await evaluate('notifyDaily()');
  assert.equal(await evaluate('__notificationCapture.length'), 1, 'no repite el mismo aviso en el día');
});

test('WhatsApp muestra y permite editar el mensaje antes de abrir el servicio', async () => {
  await seed(JSON.stringify(validBackup('Paciente ficticio para compartir'))); await navigate();
  await evaluate("window.__openedExternal=''; window.open=url=>(window.__openedExternal=url); document.querySelector('#share').click()");
  await waitFor("document.querySelector('#externalText')", 'previsualización de WhatsApp');
  await evaluate("document.querySelector('#externalText').value='Resumen genérico ficticio'; document.querySelector('#externalContinue').click()");
  const opened = await evaluate('__openedExternal');
  assert.equal(new URL(opened).searchParams.get('text'), 'Resumen genérico ficticio');
});

test('Calendar intercepta el enlace real, permite editar y cancelar sin abrirlo', async () => {
  const backup = validBackup('Paciente ficticio para Calendar');
  backup.appts = [{ id: 'cita-ficticia', i: 0, d: '2030-11-15', t: '10:00', w: 'Centro ficticio', n: 'Nota ficticia' }];
  await seed(JSON.stringify(backup)); await navigate();
  await evaluate("window.__openedExternal=[]; window.open=(url,target,features)=>{window.__openedExternal.push({url,target,features});return null}");

  await evaluate("document.querySelector('#homeView a.btn.cal[href*=' + JSON.stringify('calendar.google.com') + ']').click()");
  await waitFor("document.querySelector('#externalTitle')", 'previsualización desde el enlace Calendar renderizado');
  const preview = await evaluate("({title:document.querySelector('#externalTitle').value,details:document.querySelector('#externalDetails').value})");
  assert.match(preview.title, /Cita médica \(Paciente ficticio para Calendar\)/);
  assert.equal(preview.details, 'Nota ficticia');
  assert.equal(await evaluate('__openedExternal.length'), 0);
  await evaluate("document.querySelector('#externalCancel').click()");
  await waitFor("!document.querySelector('#dlg').open", 'cancelación de Calendar');
  assert.equal(await evaluate('__openedExternal.length'), 0);

  await evaluate("document.querySelector('#homeView a.btn.cal[href*=' + JSON.stringify('calendar.google.com') + ']').click()");
  await waitFor("document.querySelector('#externalTitle')", 'segunda previsualización de Calendar');
  await evaluate("document.querySelector('#externalTitle').value='Evento revisado ficticio'; document.querySelector('#externalDetails').value='Detalle revisado ficticio'; document.querySelector('#externalContinue').click()");
  assert.equal(await evaluate('__openedExternal.length'), 1);
  const opened = new URL((await evaluate('__openedExternal'))[0].url);
  assert.equal(opened.searchParams.get('text'), 'Evento revisado ficticio');
  assert.equal(opened.searchParams.get('details'), 'Detalle revisado ficticio');
  assert.equal(opened.searchParams.get('dates'), '20301115T100000/20301115T110000');
});

test('las citas identifican la ficha por índice aunque los nombres coincidan', async () => {
  const unique = validBackup('Paciente ficticio uno');
  unique.p.push({ name: 'Paciente ficticio dos', meds: [] });
  await seed(JSON.stringify(unique)); await navigate();

  const addAppointment = async (index, venue) => {
    await evaluate("document.querySelector('#homeView [data-pa=\\\"aadd\\\"]').click()");
    await waitFor("document.querySelector('#ap_p')", 'selector de persona para cita');
    const options = await evaluate("[...document.querySelector('#ap_p').options].map(o=>({value:o.value,label:o.textContent}))");
    assert.equal(options[index].value, String(index));
    await evaluate(`(()=>{document.querySelector('#ap_p').value=${JSON.stringify(String(index))};document.querySelector('#ap_d').value='2030-11-15';document.querySelector('#ap_t').value='10:00';document.querySelector('#ap_w').value=${JSON.stringify(venue)};document.querySelector('#ap_n').value='Nota ficticia';document.querySelector('#f').requestSubmit()})()`);
    await waitFor('!document.querySelector("#dlg").open', 'guardado de cita');
    return await evaluate("JSON.parse(__persistenceTest.read()).appts.at(-1)");
  };

  const uniqueAppointment = await addAppointment(1, 'Centro ficticio único');
  assert.equal(uniqueAppointment.i, 1);
  assert.equal((await evaluate("JSON.parse(__persistenceTest.read()).appts")).length, 1);

  const duplicate = validBackup('Paciente duplicado ficticio');
  duplicate.p.push({ name: 'Paciente duplicado ficticio', meds: [] });
  duplicate.appts = [{ id: 'cita-legada', i: 1, d: '2030-11-16', t: '10:00', w: 'Consultorio ficticio', n: 'Nota original ficticia' }];
  await seed(JSON.stringify(duplicate)); await navigate();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  try {
    await evaluate("document.querySelector('#homeView button[data-pa=\\\"aedit\\\"][data-id=\\\"cita-legada\\\"]').click()");
    await waitFor("document.querySelector('#ap_p')", 'edición de cita anterior');
    const selection = await evaluate("({value:document.querySelector('#ap_p').value,label:document.querySelector('#ap_p').selectedOptions[0].textContent,scroll:document.documentElement.scrollWidth,width:innerWidth})");
    assert.equal(selection.value, '1');
    assert.equal(selection.label, 'Paciente duplicado ficticio (Ficha 2)');
    assert.ok(selection.scroll <= selection.width, `Desbordamiento responsive: ${selection.scroll}px > ${selection.width}px`);
    await evaluate("document.querySelector('#ap_n').value='Nota editada ficticia';document.querySelector('#f').requestSubmit()");
    await waitFor('!document.querySelector("#dlg").open', 'edición de cita existente');
    const editedLegacy = await evaluate("JSON.parse(__persistenceTest.read()).appts[0]");
    assert.equal(editedLegacy.id, 'cita-legada');
    assert.equal(editedLegacy.i, 1);
    assert.equal(editedLegacy.n, 'Nota editada ficticia');

    const firstDuplicate = await addAppointment(0, 'Centro ficticio ficha uno');
    const secondDuplicate = await addAppointment(1, 'Centro ficticio ficha dos');
    assert.equal(firstDuplicate.i, 0);
    assert.equal(secondDuplicate.i, 1);
    assert.equal((await evaluate("JSON.parse(__persistenceTest.read()).appts.map(a=>a.i)")).join(','), '1,0,1');

    await navigate();
    assert.equal((await evaluate("JSON.parse(__persistenceTest.read()).appts.map(a=>a.i)")).join(','), '1,0,1');
    await evaluate("document.querySelector('#exp').click()");
    await waitFor('__persistenceTest.exportBlob !== null', 'exportación de citas');
    const exported = await evaluate("__persistenceTest.exportBlob.text().then(text=>JSON.parse(text))");
    assert.deepEqual(exported.appts.map(a=>a.i), [1, 0, 1]);

    await uploadJson(exported, 'citas-ficticias.json');
    await continueRestore();
    await evaluate("document.querySelector('#restoreConfirm').click()");
    await waitFor("JSON.parse(__persistenceTest.read()).appts.length===3", 'restauración de citas');
    assert.deepEqual(await evaluate("JSON.parse(__persistenceTest.read()).appts.map(a=>a.i)"), [1, 0, 1]);

    await navigate();
    await evaluate("document.querySelector('#homeView button[data-pa=\\\"aedit\\\"][data-id=\\\"cita-legada\\\"]').click()");
    await waitFor("document.querySelector('#dlg [data-pa=\\\"adel\\\"]')", 'opción de quitar cita');
    await evaluate("document.querySelector('#dlg [data-pa=\\\"adel\\\"]').click()");
    await waitFor("document.querySelector('#dlg form button[type=submit]')", 'confirmación para quitar cita');
    await evaluate("document.querySelector('#dlg form button[type=submit]').click()");
    await waitFor("JSON.parse(__persistenceTest.read()).appts.length===2", 'eliminación de cita');
    assert.deepEqual(await evaluate("JSON.parse(__persistenceTest.read()).appts.map(a=>a.i)"), [0, 1]);
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  }
});

test('el service worker limpia solo sus cachés y sirve / y /index.html offline', async () => {
  await seed(null); await navigate();
  await waitFor("navigator.serviceWorker.controller !== null", 'control activo del service worker');
  const cached = await evaluate(`(async()=>{const names=await caches.keys();const cache=await caches.open('acompanha-v9');return {names,keys:(await cache.keys()).map(r=>new URL(r.url).pathname)}})()`);
  assert.ok(cached.names.includes('acompanha-v9'));
  for (const asset of ['/', '/index.html', '/app.js', '/compatibility.js', '/domain.js', '/sharing.js', '/payments.js', '/inventory.js', '/care-ui.js', '/forms.js', '/appointments.js', '/styles.css', '/manifest.json', '/icon-192.png', '/icon-512.png', '/fonts/Nunito[wght].ttf']) {
    assert.ok(cached.keys.some(key => key.endsWith(asset)), `Falta en caché ${asset}`);
  }
  await evaluate("fetch('/private-data').catch(()=>null)");
  const privateCached = await evaluate("(async()=>{const c=await caches.open('acompanha-v9');return Boolean(await c.match('/private-data'))})()");
  assert.equal(privateCached, false);

  await evaluate(`Promise.all(['acompanha-v8','cuidados-v8','other-component-v1'].map(name=>caches.open(name).then(cache=>cache.put(location.origin+'/fixture-'+name,new Response(name)))))`);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  try {
    for (const route of ['/', '/index.html']) {
      await cdp.send('Page.navigate', { url: serverUrl + route });
      await waitFor("document.readyState === 'complete' && typeof persistenceReady !== 'undefined'", `carga offline de ${route}`);
      assert.equal(await evaluate('typeof S !== "undefined" && persistenceReady'), true);
      assert.equal(await evaluate("[...document.styleSheets].some(sheet=>sheet.href&&sheet.href.endsWith('/styles.css'))"), true);
      assert.equal(await evaluate("document.fonts.load('600 18px Nunito').then(fonts=>fonts.length>0&&fonts[0].status==='loaded')"), true);
      assert.equal(await evaluate("performance.getEntriesByType('resource').some(entry=>/fonts\\.(googleapis|gstatic)\\.com/.test(entry.name))"), false);
    }
  } finally {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  swUpdateVariant = true;
  const update = await evaluate(`new Promise((resolve,reject)=>{navigator.serviceWorker.getRegistration().then(r=>{const timeout=setTimeout(()=>reject(new Error('Tiempo agotado esperando la nueva versión del service worker')),10000);r.addEventListener('updatefound',()=>{const worker=r.installing;worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve(worker.state)}})});r.update().catch(reject)}).catch(reject)})`);
  assert.equal(update, 'activated');
  swUpdateVariant = false;
  const remainingCaches = await evaluate('caches.keys()');
  assert.ok(remainingCaches.includes('acompanha-v9'));
  assert.ok(!remainingCaches.includes('acompanha-v8'));
  assert.ok(!remainingCaches.includes('cuidados-v8'));
  assert.ok(remainingCaches.includes('other-component-v1'));
  const otherComponentEntry = await evaluate("(async()=>{const c=await caches.open('other-component-v1');return Boolean(await c.match(location.origin+'/fixture-other-component-v1'))})()");
  assert.equal(otherComponentEntry, true);
});

test('el resumen general excluye pagos individuales y registros legados no conciliables', async () => {
  const backup=validBackup('Ficha ficticia de pagos');backup.mode='pay';
  backup.pay={cfg:[{who:'Responsable ficticio',base:'2020-01-01',rate:100,time:'half',pays:[{d:'2020-01-01',n:1,a:20,old:false}]}],nurses:[[{id:'nurse_a',n:'A ficticia',c:'#C92A2A',ratesCents:{full:5000,half:null}},{id:'nurse_b',n:'B ficticia',c:'#1864AB',ratesCents:{full:null,half:0}}]],v:{'2020-01-01':{0:[{n:'A ficticia'},{n:'B ficticia'}]},'2020-01-02':{0:[{n:'A ficticia',service:{id:'s1',nurseId:'nurse_a',type:'full',amountCents:5000}},{n:'B ficticia',service:{id:'s2',nurseId:'nurse_b',type:'half',amountCents:0}}]}},ledger:[{id:'old_move',patientIndex:0,nurseId:'nurse_a',date:'2020-01-03',amountCents:1000,allocations:[{serviceId:'s1',amountCents:1000}]}]};
  await seed(JSON.stringify(backup));await navigate();
  const text=await evaluate("document.querySelector('#payView').textContent");
  assert.match(text,/Total pendiente de pago/);assert.match(text,/Costo de jornadas registradas/);assert.match(text,/Abonos generales recibidos/);
  assert.match(text,/2 asignaciones antiguas sin costo/);assert.match(text,/1 pago global anterior/);assert.match(text,/1 movimiento individual PAG-001/);
  assert.doesNotMatch(text,/Lo que se debe, por enfermero|Días y servicios/);
  assert.equal(await evaluate("document.querySelector('#payView [data-pa=adminPay]').disabled"),false,'permite abonos solo contra jornadas nuevas verificables');
  assert.equal(await evaluate("JSON.parse(__persistenceTest.read()).pay.ledger.length"),1,'el movimiento PAG-001 queda intacto');
});

test('servicios con tarifa y pagos individuales parciales sobreviven exportación y restauración', async () => {
  const backup=validBackup('Ficha ficticia PAG-001');backup.mode='pay';
  backup.pay={cfg:[{who:'Responsable ficticio',base:'2020-01-01',rate:100,pays:[{d:'2020-01-01',n:2,a:50,old:false}]}],nurses:[[{id:'nurse_a',n:'Enfermera A ficticia',c:'#C92A2A',ratesCents:{full:50000,half:null}},{id:'nurse_b',n:'Enfermero B ficticio',c:'#1864AB',ratesCents:{full:null,half:30000}},{id:'nurse_c',n:'Enfermera C ficticia',c:'#2B8A3E',ratesCents:{full:15000,half:10000}}]],v:{'2020-01-01':{0:[{n:'Enfermera A ficticia'}]} }};
  await seed(JSON.stringify(backup));await navigate();
  const today=await evaluate('ymd(new Date())');
  const assign=async(nurse,type='full')=>{
    await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelector('#nm').value=${JSON.stringify(String(nurse))};document.querySelector('#nm').dispatchEvent(new Event('change'));document.querySelector('#serviceType').value=${JSON.stringify(type)};document.querySelector('#f').requestSubmit()`);
    await waitFor(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}]?.[0]?.length>=${nurse+1}`,'servicio nuevo persistido');
  };
  await assign(0,'full');await assign(1,'half');await assign(2,'full');
  let state=await evaluate('JSON.parse(__persistenceTest.read())');
  const services=state.pay.v[today][0];assert.equal(services.length,3);
  assert.equal(services[0].service.amountCents,50000);assert.equal(services[1].service.amountCents,30000);assert.equal(services[2].service.amountCents,15000);
  assert.ok(services[0].service.id&&services[0].service.nurseId);
  await evaluate("nurseForm(0,0);document.querySelector('#rateFull').value='999';document.querySelector('#f').requestSubmit()");
  state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.equal(state.pay.nurses[0][0].ratesCents.full,99900);assert.deepEqual(state.pay.v[today][0].map(e=>e.service.amountCents),[50000,30000,15000],'cambiar la tarifa del enfermero no reescribe costos fijados por servicio');
  const nurseA=services[0].service.nurseId,nurseB=services[1].service.nurseId,nurseC=services[2].service.nurseId;
  const pay=async(nurseId,amount)=>{
    await evaluate('individualPayForm(0)');
    await evaluate(`document.querySelector('#nurse').value=${JSON.stringify(nurseId)};document.querySelector('#amount').value=${JSON.stringify(amount)};document.querySelector('#f').requestSubmit()`);
    await waitFor(`JSON.parse(__persistenceTest.read()).pay.ledger.length===${state.pay.ledger?.length||0}+1`,'abono individual guardado');
    state=await evaluate('JSON.parse(__persistenceTest.read())');
  };
  await pay(nurseA,'200.00');await pay(nurseA,'100.00');await pay(nurseB,'300.00');await pay(nurseC,'150.00');
  assert.equal(state.pay.ledger.length,4);
  assert.equal(state.pay.ledger[0].allocations[0].serviceId,services[0].service.id);
  assert.equal(state.pay.ledger[0].amountCents,20000);
  assert.equal(await evaluate(`ledgerSummary(serviceRows(0),ledgerRows(),${JSON.stringify(nurseA)}).balanceCents`),20000);
  assert.equal(await evaluate(`ledgerSummary(serviceRows(0),ledgerRows(),${JSON.stringify(nurseB)}).balanceCents`),0);
  assert.equal(await evaluate(`ledgerSummary(serviceRows(0),ledgerRows(),${JSON.stringify(nurseC)}).balanceCents`),0);
  await evaluate(`individualPayForm(0);document.querySelector('#nurse').value=${JSON.stringify(nurseA)};document.querySelector('#amount').value='200.01';document.querySelector('#f').requestSubmit()`);
  assert.match(await evaluate("document.querySelector('#err').textContent"),/supera el saldo de servicios/);
  await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelectorAll('[data-pa="rm"]')[0].click()`);
  assert.match(await evaluate("document.querySelector('#dlg h2').textContent"),/Servicio con pagos aplicados/);
  await evaluate("document.querySelector('#no').click()");
  assert.deepEqual(state.pay.cfg[0].pays,backup.pay.cfg[0].pays,'el pago legado se conserva sin asignarlo a un enfermero');
  await navigate();state=await evaluate('JSON.parse(__persistenceTest.read())');assert.equal(state.pay.ledger.length,4,'la recarga conserva todos los movimientos individuales');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await evaluate("document.querySelector('#exp').click()");await waitFor('__persistenceTest.exportBlob!==null','respaldo ampliado exportado');
  const exported=await evaluate('__persistenceTest.exportBlob.text().then(text=>JSON.parse(text))');
  await uploadJson(exported,'pagos-individuales-ficticios.json');await continueRestore();await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor('JSON.parse(__persistenceTest.read()).pay.ledger.length===4','restauración ampliada');
  const restored=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.deepEqual(restored.pay.ledger,state.pay.ledger);assert.deepEqual(restored.pay.cfg[0].pays,backup.pay.cfg[0].pays);
});

test('tarifas y abonos generales se conservan con cancelación trazable, legado y restauración', async () => {
  const backup=validBackup('Ficha ficticia saldo administrativo');backup.mode='pay';
  backup.pay={cfg:[{who:'Administradora ficticia',base:'2020-01-01',pays:[{d:'2020-01-01',n:1,a:250,old:false}]}],nurses:[[
    {id:'general_nurse_a',n:'Enfermera ficticia A',c:'#C92A2A',ratesCents:{full:10000,half:6000}},
    {id:'general_nurse_b',n:'Enfermero ficticio B',c:'#1864AB',ratesCents:{full:20000,half:null}}
  ]],v:{'2020-10-30':{0:[{n:'Enfermera ficticia A',service:{id:'legacy_service',nurseId:'general_nurse_a',type:'full',amountCents:5000}}]}},ledger:[{id:'individual_old',patientIndex:0,nurseId:'general_nurse_a',date:'2020-10-30',amountCents:2000,allocations:[{serviceId:'legacy_service',amountCents:2000}]}]};
  await seed(JSON.stringify(backup));await navigate();
  const today=await evaluate('ymd(new Date())');
  assert.match(await evaluate("document.querySelector('#payView').textContent"),/Total pendiente de pago/);
  const assign=async(index,type)=>{
    await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelector('#nm').value=${JSON.stringify(String(index))};document.querySelector('#nm').dispatchEvent(new Event('change'));document.querySelector('#serviceType').value=${JSON.stringify(type)};document.querySelector('#f').requestSubmit()`);
    await new Promise(resolve=>setTimeout(resolve,250));
    const result=await evaluate(`({count:JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}]?.[0]?.length,err:document.querySelector('#err')?.textContent,selected:document.querySelector('#nm')?.value,type:document.querySelector('#serviceType')?.value,disabled:document.querySelector('#serviceType')?.disabled,dialog:document.querySelector('#dlg')?.textContent})`);
    assert.equal(result.count,1,JSON.stringify(result));
  };
  await assign(0,'half');
  await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelector('#nm').value='1';document.querySelector('#nm').dispatchEvent(new Event('change'));document.querySelector('#f').requestSubmit()`);
  await waitFor(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}]?.[0]?.length===2`,'jornada del segundo enfermero guardada');
  let state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.equal(state.pay.v[today][0][0].service.amountCents,6000,'la media jornada usa su propia tarifa');
  assert.equal(state.pay.v[today][0][1].service.amountCents,20000,'el calendario ofrece solo jornada completa a B');
  assert.equal(await evaluate("document.querySelector('#payView').textContent.toLowerCase().includes('jornadas completas')"),true);
  const record=async(amount)=>{
    await evaluate('generalPayForm()');
    assert.equal(await evaluate("Boolean(document.querySelector('#nurse'))"),false,'el abono general no solicita enfermero');
    await evaluate(`document.querySelector('#adminAmount').value=${JSON.stringify(amount)};document.querySelector('#f').requestSubmit()`);
  };
  await record('100.00');await waitFor("JSON.parse(__persistenceTest.read()).pay.generalLedger.length===1",'primer abono general');
  await record('50.00');await waitFor("JSON.parse(__persistenceTest.read()).pay.generalLedger.length===2",'segundo abono general');
  state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.equal(state.pay.generalLedger.reduce((s,m)=>s+(m.type==='receipt'?m.amountCents:0),0),15000);
  await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelectorAll('[data-pa="rm"]')[0].click()`);
  assert.match(await evaluate("document.querySelector('#dlg h2').textContent"),/Servicio con abonos generales activos/);
  await evaluate("document.querySelector('#no').click()");
  assert.equal((await evaluate(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}][0].length`)),2,'los abonos generales activos bloquean quitar servicios');
  await evaluate('generalPayForm();document.querySelector(\'#adminAmount\').value="1000.00";document.querySelector(\'#f\').requestSubmit()');
  assert.match(await evaluate("document.querySelector('#err').textContent"),/supera el saldo verificable/);
  assert.equal((await evaluate('JSON.parse(__persistenceTest.read()).pay.generalLedger')).length,2,'el excedente se rechaza sin escritura');
  const first=state.pay.generalLedger[0];await evaluate(`cancelGeneralPayForm(${JSON.stringify(first.id)});document.querySelector('#cancelDate').value='1900-01-01';document.querySelector('#f').requestSubmit()`);
  assert.match(await evaluate("document.querySelector('#err').textContent"),/fecha anterior al abono/);
  assert.equal((await evaluate('JSON.parse(__persistenceTest.read()).pay.generalLedger')).length,2,'la fecha inválida no escribe');
  await evaluate(`document.querySelector('#cancelDate').value=${JSON.stringify(today)};document.querySelector('#f').requestSubmit()`);
  await waitFor("JSON.parse(__persistenceTest.read()).pay.generalLedger.length===3",'cancelación append-only');
  state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.equal(state.pay.generalLedger[0].type,'receipt');assert.equal(state.pay.generalLedger[2].originalId,first.id);assert.equal(state.pay.generalLedger[2].amountCents,first.amountCents);
  await evaluate(`cancelGeneralPayForm(${JSON.stringify(first.id)})`);
  assert.match(await evaluate("document.querySelector('#dlg').textContent"),/no disponible para cancelar/);
  assert.equal((await evaluate('JSON.parse(__persistenceTest.read()).pay.generalLedger')).length,3,'la segunda cancelación no escribe');
  await record('90.00');await waitFor("JSON.parse(__persistenceTest.read()).pay.generalLedger.length===4",'abono corregido como nuevo movimiento');
  state=await evaluate('JSON.parse(__persistenceTest.read())');
  const summary=await evaluate('generalSummary(allServiceRows(),generalRows())');
  assert.equal(summary.costCents,31000);assert.equal(summary.receivedCents,14000);assert.equal(summary.balanceCents,17000);
  assert.equal(state.pay.ledger[0].id,'individual_old','el libro PAG-001 sigue intacto y fuera del saldo administrativo');
  assert.equal(state.pay.cfg[0].pays.length,1,'el registro de pago legado permanece intacto');
  await navigate();state=await evaluate('JSON.parse(__persistenceTest.read())');assert.equal(state.pay.generalLedger.length,4,'recargar conserva recibos y cancelación');
  await evaluate("document.querySelector('#exp').click()");await waitFor('__persistenceTest.exportBlob!==null','respaldo de los nuevos registros');
  const exported=await evaluate('__persistenceTest.exportBlob.text().then(text=>JSON.parse(text))');
  assert.deepEqual(exported.pay.generalLedger,state.pay.generalLedger);
  await uploadJson(exported,'saldo-general-ficticio.json');await continueRestore();await evaluate("document.querySelector('#restoreConfirm').click()");
  await waitFor("JSON.parse(__persistenceTest.read()).pay.generalLedger.length===4",'restauración de abonos generales');
  const restored=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.deepEqual(restored.pay.generalLedger,state.pay.generalLedger);
  const malformed=JSON.parse(JSON.stringify(exported));malformed.pay.generalLedger.push({...malformed.pay.generalLedger[2],id:'duplicate_cancel_fixture'});
  await uploadJson(malformed,'cancelacion-duplicada-ficticia.json');
  await waitFor("document.querySelector('#closeImportMessage')",'rechazo de cancelación duplicada');
  assert.match(await evaluate("document.querySelector('#dlg').textContent"),/no superó la validación/);
  assert.equal(await evaluate('__persistenceTest.read()'),JSON.stringify(restored),'el respaldo inválido conserva el almacenamiento actual');
});

test('la configuración distingue tarifa cero, modalidad vacía y cambio no retroactivo', async () => {
  const backup=validBackup('Ficha ficticia tarifas cero');backup.mode='pay';
  backup.pay={cfg:[{who:'',base:'',pays:[]}],nurses:[[]],v:{}};
  await seed(JSON.stringify(backup));await navigate();
  await evaluate("nurseForm(0);document.querySelector('#nn').value='Enfermera cero ficticia';document.querySelector('#rateFull').value='0';document.querySelector('#f').requestSubmit()");
  await waitFor("JSON.parse(__persistenceTest.read()).pay.nurses[0].length===1",'tarifa cero explícita');
  let state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.deepEqual(state.pay.nurses[0][0].ratesCents,{full:0,half:null});
  const today=await evaluate('ymd(new Date())');
  await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelector('#f').requestSubmit()`);
  assert.match(await evaluate("document.querySelector('#serviceCost').textContent"),/Costo de la jornada/);
  await evaluate("document.querySelector('#f').requestSubmit()");
  await waitFor(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(today)}]?.[0]?.length===1`,'servicio con costo cero explícito');
  await evaluate("nurseForm(0,0);document.querySelector('#rateFull').value='';document.querySelector('#f').requestSubmit()");
  assert.match(await evaluate("document.querySelector('#err').textContent"),/Configura al menos una modalidad/);
  await evaluate("document.querySelector('#rateFull').value='10.00';document.querySelector('#rateHalf').value='7.50';document.querySelector('#f').requestSubmit()");
  await waitFor("JSON.parse(__persistenceTest.read()).pay.nurses[0][0].ratesCents.half===750",'dos tarifas independientes');
  state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.equal(state.pay.v[today][0][0].service.amountCents,0,'el cambio tarifario no altera el servicio histórico');
  const next=await evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+1);return ymd(d)})()");
  await evaluate(`dayForm(0,${JSON.stringify(next)});document.querySelector('#serviceType').value='half';document.querySelector('#f').requestSubmit()`);
  await waitFor(`JSON.parse(__persistenceTest.read()).pay.v[${JSON.stringify(next)}]?.[0]?.length===1`,'media jornada desde tarifa vigente');
  state=await evaluate('JSON.parse(__persistenceTest.read())');assert.equal(state.pay.v[next][0][0].service.amountCents,750);
  await evaluate("nurseForm(0,0);document.querySelector('#removeRate-full').click();document.querySelector('#f').requestSubmit()");
  await waitFor("JSON.parse(__persistenceTest.read()).pay.nurses[0][0].ratesCents.full===null",'retiro de modalidad configurada');
  state=await evaluate('JSON.parse(__persistenceTest.read())');
  assert.equal(state.pay.v[today][0][0].service.amountCents,0);assert.equal(state.pay.v[next][0][0].service.amountCents,750);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:760,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true,'Pagos no desborda a 320 px');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});

test('un fallo de escritura al registrar un servicio conserva el JSON anterior', async () => {
  const backup=validBackup('Ficha ficticia para fallo de escritura');
  backup.pay={cfg:[{who:'Responsable ficticio',base:'2020-01-01',pays:[]}],nurses:[[{id:'fault_nurse',n:'Enfermera ficticia',c:'#C92A2A',ratesCents:{full:50000,half:null}}]],v:{}};
  const raw=JSON.stringify(backup);await seed(raw);await navigate('?failSet=1');
  const today=await evaluate('ymd(new Date())');
  await evaluate(`dayForm(0,${JSON.stringify(today)});document.querySelector('#nm').value='0';document.querySelector('#f').requestSubmit()`);
  await waitFor("document.querySelector('#persistenceWarning') && !document.querySelector('#persistenceWarning').hidden",'aviso de fallo de persistencia');
  assert.equal(await evaluate('__persistenceTest.read()'),raw,'el valor guardado previo debe quedar intacto');
});

test('restauración rechaza un abono asociado a otro destinatario sin tocar el estado actual', async () => {
  const current=JSON.stringify(validBackup('Estado local intacto'));
  const malformed=validBackup('Fixture inválido');
  malformed.pay={cfg:[{who:'Responsable ficticio',base:'2020-01-01',pays:[]}],nurses:[[{id:'nurse_A',n:'Enfermera A',c:'#C92A2A'}]],v:{'2026-10-31':{0:[{n:'Enfermera A',service:{id:'service_A',nurseId:'nurse_A',type:'full',amountCents:50000}}]}},ledger:[{id:'move_A',patientIndex:0,nurseId:'nurse_B',date:'2026-10-31',amountCents:10000,allocations:[{serviceId:'service_A',amountCents:10000}]}]};
  await seed(current);await navigate();await uploadJson(malformed,'abono-cruzado-invalido.json');
  await waitFor("document.querySelector('#closeImportMessage')",'rechazo de respaldo no íntegro');
  assert.match(await evaluate("document.querySelector('#dlg').textContent"),/no superó la validación/);
  assert.equal(await evaluate('__persistenceTest.read()'),current,'la importación inválida conserva el valor local anterior');
});
