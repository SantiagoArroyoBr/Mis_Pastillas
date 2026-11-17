import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createAccessSandbox } from './access-sandbox.mjs';
const origin = 'http://127.0.0.1:4180';
const sandbox = await createAccessSandbox(origin);
const files = {
  '/':'index.html','/pilot.mjs':'pilot.mjs','/admin-access.mjs':'admin-access.mjs','/account-recovery.mjs':'account-recovery.mjs',
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
        'export const connections='+JSON.stringify({local:{url:origin,key:sandbox.publicKey,accessUrl:origin+'/api/access',label:'Ensayo aislado: Auth y correo simulados'}})+';');
      return;
    }
    if(path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/rest/')) {
      const chunks=[]; let size=0;
      for await (const chunk of request) {size+=chunk.length;if(size>8192){response.writeHead(413).end();return;} chunks.push(chunk);}
      const result=await sandbox.handle(new Request(new URL(request.url,origin),{
        method:request.method,headers:request.headers,...(chunks.length&&{body:Buffer.concat(chunks)})}));
      response.writeHead(result.status,Object.fromEntries(result.headers)).end(await result.text());return;
    }
    if(!Object.hasOwn(files,path)){response.writeHead(404).end();return;}
    let content=await readFile(new URL(files[path],import.meta.url));
    if(path==='/') content=Buffer.from(content.toString().replace('Prueba de cuentas y fichas compartidas. Usa datos de prueba.',
      'ENSAYO AISLADO: datos en memoria, Auth y correo simulados. Admin: admin@acompana.test / Acompana-demo-2026!')
      .replace('<option value="cloud">Supabase de pruebas en la nube</option>','')
      .replace('name="key"','value="'+sandbox.publicKey+'" name="key"'));
    const type=path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.ttf')?'font/ttf':'text/html';
    response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}).end(content);
  } catch {response.writeHead(500).end('Error del entorno aislado.');}
});
server.listen(4180,'127.0.0.1',()=>console.log('Ensayo aislado en '+origin+' (Auth/correo simulados; datos desechables en memoria).'));
process.on('SIGINT',()=>server.close(async()=>{await sandbox.close();process.exit(0);}));
