import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/pilot.mjs': ['pilot.mjs', 'text/javascript; charset=utf-8'],
  '/finance.mjs': ['finance.mjs', 'text/javascript; charset=utf-8'],
  '/inventory.mjs': ['inventory.mjs', 'text/javascript; charset=utf-8'],
  '/calendar.mjs': ['calendar.mjs', 'text/javascript; charset=utf-8'],
  '/backup-diagnostics.mjs': ['backup-diagnostics.mjs', 'text/javascript; charset=utf-8'],
  '/compatibility.js': ['../compatibility.js', 'text/javascript; charset=utf-8'],
  '/domain.js': ['../domain.js', 'text/javascript; charset=utf-8'],
  '/supabase-client.mjs': ['supabase-client.mjs', 'text/javascript; charset=utf-8'],
  '/pilot.css': ['pilot.css', 'text/css; charset=utf-8'],
  '/styles.css': ['../styles.css', 'text/css; charset=utf-8'],
  '/fonts/NunitoSans.ttf': ['../fonts/NunitoSans.ttf', 'font/ttf'],
  '/icons/house.svg': ['../icons/house.svg', 'image/svg+xml'],
  '/icons/pill.svg': ['../icons/pill.svg', 'image/svg+xml'],
  '/icons/wallet.svg': ['../icons/wallet.svg', 'image/svg+xml']
};

createServer(async (request, response) => {
  const file = Object.hasOwn(files, request.url) && files[request.url];
  if (request.method !== 'GET' || !file) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {
      'Content-Type': file[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src http://127.0.0.1:54321; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    }).end(content);
  } catch {
    response.writeHead(500).end();
  }
}).listen(4173, '127.0.0.1', () => console.log('Piloto local en http://127.0.0.1:4173'));
