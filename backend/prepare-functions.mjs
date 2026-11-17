import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Archivos autocontenidos para el editor de Supabase, sin dependencias ni secretos.
for (const [name, source, entry] of [
  ['family-access','access-service.mjs','supabase/functions/family-access/index.ts'],
  ['auth-email','email-hook.mjs','supabase/functions/auth-email/index.ts']
]) {
  const module = (await readFile(new URL(source,import.meta.url),'utf8')).replace(/^export /gm,'');
  const start = (await readFile(new URL(entry,import.meta.url),'utf8')).replace(/^import .*;\s*/,'');
  const directory = new URL('./supabase/.temp/functions/'+name+'/',import.meta.url);
  await mkdir(directory,{recursive:true});
  await writeFile(new URL('index.ts',directory),module+'\n'+start);
  console.log('Función preparada: '+name);
}
