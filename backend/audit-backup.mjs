import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { auditBackupRaw, maxBytes } from './backup-diagnostics.mjs';

const context = createContext({ window: {} });
runInContext(await readFile(new URL('../compatibility.js', import.meta.url), 'utf8'), context);

export function auditBackup(raw) {
  return auditBackupRaw(raw, context.window.AcompanaCompatibility);
}

async function main() {
  const [file, ...extra] = process.argv.slice(2);
  if (!file || extra.length) {
    process.stderr.write('Uso: node audit-backup.mjs <respaldo-ficticio.json>\n');
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Se esperaba un archivo');
    result = info.size > maxBytes ? { estado: 'rechazado', motivo: 'limite-de-tamaño' }
      : auditBackup(await readFile(file, 'utf8'));
  } catch {
    result = { estado: 'rechazado', motivo: 'archivo-no-legible' };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.estado === 'rechazado') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
