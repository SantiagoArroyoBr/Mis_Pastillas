import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createAccessSandbox } from './access-sandbox.mjs';
const port=Number(process.env.ACOMPANA_SANDBOX_PORT??4180);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Puerto de ensayo inválido.');
const origin = 'http://127.0.0.1:'+port;
const compiled = process.env.ACOMPANA_SANDBOX_PREVIEW==='1';
const sandbox = await createAccessSandbox(origin);
const files = {
  '/legacy-converter.mjs':'legacy-converter.mjs','/legacy-history.mjs':'legacy-history.mjs',
  '/today.mjs':'today.mjs','/care-coordination.mjs':'care-coordination.mjs',
  '/sw.js':'sw.js',
  '/history.mjs':'history.mjs','/durable-requests.mjs':'durable-requests.mjs',
  '/session-state.mjs':'session-state.mjs','/offline-cache.mjs':'offline-cache.mjs','/family-backup.mjs':'family-backup.mjs',
  '/manifest.webmanifest':'manifest.webmanifest','/icons/acompana.svg':'icons/acompana.svg',
  '/icons/favicon-32.png':'icons/favicon-32.png','/icons/favicon-48.png':'icons/favicon-48.png',
  '/icons/apple-touch-icon.png':'icons/apple-touch-icon.png','/icons/icon-192.png':'icons/icon-192.png',
  '/icons/icon-512.png':'icons/icon-512.png','/icons/icon-maskable-512.png':'icons/icon-maskable-512.png',
  '/':'index.html','/index.html':'index.html','/pilot.mjs':'pilot.mjs','/admin-access.mjs':'admin-access.mjs','/account-recovery.mjs':'account-recovery.mjs',
  '/supabase-client.mjs':'supabase-client.mjs','/finance.mjs':'finance.mjs',
  '/inventory.mjs':'inventory.mjs','/calendar.mjs':'calendar.mjs','/backup-diagnostics.mjs':'backup-diagnostics.mjs',
  '/pilot.css':'pilot.css','/styles.css':'../styles.css','/domain.js':'../domain.js','/compatibility.js':'../compatibility.js',
  '/fonts/NunitoSans.ttf':'../fonts/NunitoSans.ttf','/icons/house.svg':'../icons/house.svg',
  '/icons/pill.svg':'../icons/pill.svg','/icons/wallet.svg':'../icons/wallet.svg'
};
const server = createServer(async (request,response) => {
  try {
    const path = new URL(request.url,origin).pathname;
    if(path==='/connection-config.mjs') {
      response.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(
        'export const connections='+JSON.stringify({[compiled?'cloud':'local']:{url:origin,key:sandbox.publicKey,accessUrl:origin+'/api/access',label:'Ensayo aislado: Auth y correo simulados'}})+';');
      return;
    }
    if(path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/rest/')) {
      const chunks=[]; let size=0;
      const maxBody=path==='/rest/v1/rpc/restore_family_backup'?10*1024*1024:8192;
      for await (const chunk of request) {size+=chunk.length;if(size>maxBody){response.writeHead(413).end();return;} chunks.push(chunk);}
      const result=await sandbox.handle(new Request(new URL(request.url,origin),{
        method:request.method,headers:request.headers,...(chunks.length&&{body:Buffer.concat(chunks)})}));
      response.writeHead(result.status,Object.fromEntries(result.headers)).end(await result.text());return;
    }
    if(!Object.hasOwn(files,path)){response.writeHead(404).end();return;}
    let content=await readFile(compiled
      ?new URL('./supabase/.temp/preview/'+(path==='/'?'index.html':path.slice(1)),import.meta.url)
      :new URL(files[path],import.meta.url));
    if(path==='/') content=Buffer.from(content.toString().replace('Prueba de cuentas y fichas compartidas. Usa datos de prueba.',
      'ENSAYO AISLADO: datos en memoria, Auth y correo simulados. Admin: admin@acompana.test / Acompana-demo-2026!')
      .replace('Organiza y comparte el cuidado de tu familia.','ENSAYO AISLADO: cuenta y datos ficticios; no introducir datos reales.')
      .replace('<option value="cloud">Supabase de pruebas en la nube</option>','')
      .replace('name="key"','value="'+sandbox.publicKey+'" name="key"'));
    const type=path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':path.endsWith('.webmanifest')?'application/manifest+json':path.endsWith('.ttf')?'font/ttf':'text/html';
    response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; worker-src 'self'; manifest-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}).end(content);
  } catch {response.writeHead(500).end('Error del entorno aislado.');}
});
server.listen(port,'127.0.0.1',()=>console.log('Ensayo aislado en '+origin+' (Auth/correo simulados; datos desechables en memoria).'));
process.on('SIGINT',()=>server.close(async()=>{await sandbox.close();process.exit(0);}));
