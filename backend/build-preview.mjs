import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { connections } from './connection-config.mjs';
import { createHash } from 'node:crypto';

// Lista cerrada: nunca publicar SQL, respaldos, .env, pruebas ni herramientas.
const output = new URL('./supabase/.temp/preview/', import.meta.url);
const files = {
  'care-clock.mjs':'care-clock.mjs',
  'care-shifts.mjs':'care-shifts.mjs',
  'patient-timeline.mjs':'patient-timeline.mjs',
  'backup-receipt.mjs':'backup-receipt.mjs',
  'index.html': 'index.html', 'pilot.mjs': 'pilot.mjs', 'finance.mjs': 'finance.mjs',
  'admin-access.mjs': 'admin-access.mjs',
  'today.mjs':'today.mjs','care-coordination.mjs':'care-coordination.mjs',
  'legacy-converter.mjs':'legacy-converter.mjs','legacy-history.mjs':'legacy-history.mjs',
  'history.mjs': 'history.mjs', 'durable-requests.mjs': 'durable-requests.mjs',
  'session-state.mjs':'session-state.mjs', 'offline-cache.mjs':'offline-cache.mjs',
  'family-backup.mjs':'family-backup.mjs', 'sw.js':'sw.js',
  'manifest.webmanifest':'manifest.webmanifest',
  'icons/acompana.svg':'icons/acompana.svg', 'icons/favicon-32.png':'icons/favicon-32.png',
  'icons/favicon-48.png':'icons/favicon-48.png', 'icons/apple-touch-icon.png':'icons/apple-touch-icon.png',
  'icons/icon-192.png':'icons/icon-192.png', 'icons/icon-512.png':'icons/icon-512.png',
  'icons/icon-maskable-512.png':'icons/icon-maskable-512.png',
  'account-recovery.mjs': 'account-recovery.mjs',
  'inventory.mjs': 'inventory.mjs', 'calendar.mjs': 'calendar.mjs',
  'backup-diagnostics.mjs': 'backup-diagnostics.mjs',
  'supabase-client.mjs': 'supabase-client.mjs', 'connection-config.mjs': 'connection-config.mjs',
  'pilot.css': 'pilot.css', 'styles.css': '../styles.css',
  'compatibility.js': '../compatibility.js', 'domain.js': '../domain.js',
  'fonts/NunitoSans.ttf': '../fonts/NunitoSans.ttf',
  'icons/house.svg': '../icons/house.svg', 'icons/pill.svg': '../icons/pill.svg',
  'icons/wallet.svg': '../icons/wallet.svg'
};
for (const [destination, source] of Object.entries(files)) {
  await mkdir(new URL('.', new URL(destination, output)), { recursive: true });
  await copyFile(new URL(source, import.meta.url), new URL(destination, output));
}
const html = await readFile(new URL('index.html', output), 'utf8');
await writeFile(new URL('index.html', output), html.replace('<option value="cloud">', '<option value="cloud" selected>')
  .replace('<title>Acompaña · Piloto local</title>','<title>Acompaña</title>')
  .replace('Prueba de cuentas y fichas compartidas. Usa datos de prueba.','Organiza y comparte el cuidado de tu familia.')
  .replaceAll('Cuenta de prueba','Tu cuenta').replace('Crear cuenta de prueba','Crear cuenta')
  .replace('<label>Entorno de prueba ', '<label hidden>Entorno de prueba ')
  .replace('<label>Clave publicable ', '<label hidden>Clave publicable '));
// El artefacto alojado solo puede usar la nube, nunca la red local del teléfono.
await writeFile(new URL('connection-config.mjs', output),
  'export const connections = Object.freeze(' + JSON.stringify({ cloud: connections.cloud }) + ');\n');
await writeFile(new URL('index.html', output), (await readFile(new URL('index.html', output), 'utf8'))
  .replace('<option value="local">Supabase local</option>', ''));
const publicAssets = Object.keys(files).filter(path=>path!=='sw.js');
const revision = createHash('sha256');
for (const path of publicAssets) revision.update(path).update(await readFile(new URL(path,output)));
const worker = await readFile(new URL('sw.js',output),'utf8');
await writeFile(new URL('sw.js',output),worker.replace('__ACOMPANA_BUILD__',revision.digest('hex').slice(0,16))
  .replace('/*__ACOMPANA_ASSETS__*/ []',JSON.stringify(['/',...publicAssets.map(path=>'/'+path)])));
async function checkOutput(prefix = '') {
  for (const entry of await readdir(new URL(prefix, output), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory() && Object.keys(files).some(file => file.startsWith(path + '/'))) {
      await checkOutput(path + '/');
    } else if (!entry.isFile() || !Object.hasOwn(files, path)) {
      throw new Error('Archivo inesperado en la salida de Preview. Revisar antes de publicar.');
    }
  }
}
await checkOutput();
console.log('Preview estática preparada: ' + Object.keys(files).length + ' archivos públicos.');
