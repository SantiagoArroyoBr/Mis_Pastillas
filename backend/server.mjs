import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/pilot.mjs': ['pilot.mjs', 'text/javascript; charset=utf-8'],
  '/finance.mjs': ['finance.mjs', 'text/javascript; charset=utf-8'],
  '/supabase-client.mjs': ['supabase-client.mjs', 'text/javascript; charset=utf-8'],
  '/pilot.css': ['pilot.css', 'text/css; charset=utf-8']
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
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src http://127.0.0.1:54321; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    }).end(content);
  } catch {
    response.writeHead(500).end();
  }
}).listen(4173, '127.0.0.1', () => console.log('Piloto local en http://127.0.0.1:4173'));
