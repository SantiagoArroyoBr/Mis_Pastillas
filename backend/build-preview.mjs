import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { connections } from './connection-config.mjs';

// Lista cerrada: nunca publicar SQL, respaldos, .env, pruebas ni herramientas.
const output = new URL('./supabase/.temp/preview/', import.meta.url);
const files = {
  'index.html': 'index.html', 'pilot.mjs': 'pilot.mjs', 'finance.mjs': 'finance.mjs',
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
await writeFile(new URL('index.html', output), html.replace('<option value="cloud">', '<option value="cloud" selected>'));
// El artefacto alojado solo puede usar la nube, nunca la red local del teléfono.
await writeFile(new URL('connection-config.mjs', output),
  'export const connections = Object.freeze(' + JSON.stringify({ cloud: connections.cloud }) + ');\n');
await writeFile(new URL('index.html', output), (await readFile(new URL('index.html', output), 'utf8'))
  .replace('<option value="local">Supabase local</option>', ''));
console.log('Preview estática preparada: ' + Object.keys(files).length + ' archivos públicos.');
