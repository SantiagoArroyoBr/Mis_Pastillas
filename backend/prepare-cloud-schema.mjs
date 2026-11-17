import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('./supabase/migrations/', import.meta.url);
const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
const statements = [];
for (const name of names) {
  const migration = await readFile(new URL(name, directory), 'utf8');
  if (!/^begin;\s/i.test(migration) || !/commit;\s*$/i.test(migration)) {
    throw new Error('La migración requiere revisión antes de preparar el esquema: ' + name);
  }
  statements.push('-- ' + name + '\n' + migration.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));
}
const output = new URL('./supabase/.temp/cloud-bootstrap.sql', import.meta.url);
await mkdir(new URL('./supabase/.temp/', import.meta.url), { recursive: true });
await writeFile(output, '-- Inicialización de un proyecto nuevo de Acompaña. Ejecutar una sola vez.\n'
  + 'begin;\n' + statements.join('\n') + "\nnotify pgrst, 'reload schema';\ncommit;\n");
console.log('Esquema preparado con ' + names.length + ' migraciones en ' + fileURLToPath(output));
