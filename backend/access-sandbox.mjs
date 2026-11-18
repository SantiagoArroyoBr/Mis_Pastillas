// Banco aislado: PostgreSQL real en memoria; Auth y entrega de correo simulados.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createAccessHandler } from './access-service.mjs';

export async function createAccessSandbox(origin = 'http://127.0.0.1:4180') {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;`);
  const directory = new URL('./supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  }
  const publicKey = 'sb_publishable_isolated_sandbox';
  const serviceKey = randomUUID();
  const accounts = new Map(), sessions = new Map(), mailbox = [];
  const passwordHash = (password, id) => scryptSync(password, id, 32);
  async function addAccount(email, password, id = randomUUID(), app_metadata = {}) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id,email]);
    const account = { id,email,app_metadata, hash: passwordHash(password,id) };
    accounts.set(id, account);
    return account;
  }
  const safeUser = user => ({ id:user.id,email:user.email,app_metadata:user.app_metadata });
  const owner = await addAccount('admin@acompana.test','Acompana-demo-2026!');
  const outsider = await addAccount('otra@acompana.test','Acompana-demo-2026!');
  async function query(sql, params, identity, service = false) {
    return db.transaction(async tx => {
      await tx.exec('set local role ' + (service ? 'service_role' : identity ? 'authenticated' : 'anon'));
      await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [identity?.id ?? '', JSON.stringify({sub:identity?.id,iat:identity?.iat,session_id:identity?.session_id})]);
      return (await tx.query(sql, params)).rows;
    });
  }
  const initial = {id:owner.id,iat:Math.floor(Date.now()/1000)};
  await query('select public.create_family($1)', ['Familia de prueba A'], initial);
  await query('select public.create_family($1)', ['Familia de prueba B'], initial);
  await query('select public.create_family($1)', ['Familia ajena'], {id:outsider.id,iat:initial.iat});
  const allowedTables = new Set(['families','family_members','patients','nurses','shifts','receipts',
    'receipt_cancellations','individual_payments','individual_allocations','appointments','appointment_details',
    'inventory_items','inventory_profiles','inventory_purchases','inventory_quotes','temporary_accesses','temporary_access_events']);
  async function simulatedSupabase(input, options = {}) {
    const url = new URL(input), path = url.pathname, body = options.body ? JSON.parse(options.body) : {};
    const token = new Headers(options.headers).get('Authorization')?.replace(/^Bearer /,'');
    const identity = sessions.get(token), service = token === serviceKey;
    const reply = (status, data) => Response.json(data,{status});
    try {
      if (path === '/auth/v1/token') {
        const user = [...accounts.values()].find(account => account.email === body.email);
        if (!user || !timingSafeEqual(user.hash,passwordHash(body.password,user.id))) return reply(400,{error_code:'invalid_credentials'});
        const access_token = randomUUID();
        const session_id=randomUUID();
        await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session_id,user.id]);
        sessions.set(access_token,{id:user.id,iat:Math.floor(Date.now()/1000),session_id});
        return reply(200,{access_token,user:safeUser(user)});
      }
      if (path === '/auth/v1/user') return identity ? reply(200,safeUser(accounts.get(identity.id))) : reply(401,{});
      if (path === '/auth/v1/logout') { sessions.delete(token); return reply(200,{}); }
      if (path.startsWith('/auth/v1/admin/users')) {
        if (!service) return reply(403,{});
        const id = path.split('/')[5];
        if (!id) {
          if ([...accounts.values()].some(account => account.email === body.email) || accounts.has(body.id)) return reply(409,{});
          return reply(200,safeUser(await addAccount(body.email,body.password,body.id,body.app_metadata)));
        }
        const user = accounts.get(id);
        if (!user) return reply(404,{});
        if (options.method === 'PUT') user.hash = passwordHash(body.password,id);
        return reply(200,safeUser(user));
      }
      if (['/auth/v1/signup','/auth/v1/recover','/auth/v1/resend'].includes(path)) {
        mailbox.push({kind:path.split('/').pop(),recipient:body.email});
        return reply(200,{});
      }
      if (path.startsWith('/rest/v1/rpc/')) {
        const name = path.split('/').pop();
        if (!/^[a-z_]+$/.test(name) || Object.keys(body).some(key => !/^[a-z_]+$/.test(key))) return reply(400,{});
        const args = Object.keys(body).map((key,index) => '"'+key+'" => $'+(index+1)).join(',');
        const rows = await query('select public."'+name+'"('+args+') as result',Object.values(body),identity,service);
        return reply(200,rows[0].result);
      }
      if (path.startsWith('/rest/v1/')) {
        const table = path.split('/').pop();
        if (!allowedTables.has(table)) return reply(404,{});
        let rows = await query('select * from public."'+table+'"',[],identity);
        for (const [key,value] of url.searchParams) {
          if (['select','order','limit','offset'].includes(key)) continue;
          const dot = value.indexOf('.'), operator = value.slice(0,dot), expected = value.slice(dot+1);
          rows = rows.filter(row => operator === 'eq' ? String(row[key])===expected
            : operator === 'is' && expected === 'null' ? row[key]==null
            : operator === 'gte' ? String(row[key])>=expected : operator === 'lt' ? String(row[key])<expected : true);
        }
        // Relaciones usadas por las tablas financieras y el calendario del ensayo.
        // Cada lectura sigue pasando por el mismo usuario y RLS; no usar service_role.
        const projection = url.searchParams.get('select') ?? '';
        for (const [related, foreignKey] of [['patients','patient_id'],['nurses','nurse_id']]) {
          if (!projection.includes(related+'(') || !['shifts','individual_payments'].includes(table)) continue;
          const visible = await query('select id,name from public."'+related+'"',[],identity);
          const names = new Map(visible.map(row=>[row.id,row.name]));
          rows = rows.map(row=>({...row,[related]:names.has(row[foreignKey])?{name:names.get(row[foreignKey])}:null}));
        }
        return reply(200,rows.slice(Number(url.searchParams.get('offset')??0),Number(url.searchParams.get('limit')??1000)));
      }
      return reply(404,{});
    } catch(error) { return reply(error.code==='42501'?403:error.code==='PT409'?409:400,{code:error.code}); }
  }
  const access = createAccessHandler({supabaseUrl:origin,publishableKey:publicKey,serviceKey,allowedOrigin:origin},simulatedSupabase);
  return { db, mailbox, publicKey, close:()=>db.close(), query,
    async handle(request) {
      const url = new URL(request.url);
      if(url.pathname==='/api/access') return access(request);
      return simulatedSupabase(request.url,{method:request.method,headers:request.headers,
        ...(request.method==='POST' && {body:await request.text()})});
    }
  };
}
