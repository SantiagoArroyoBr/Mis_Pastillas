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
  const accounts = new Map(), sessions = new Map(), refreshTokens = new Map(), mailbox = [];
  function authSession(user,session_id){
    const iat=Math.floor(Date.now()/1000),exp=iat+3600;
    const access_token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'
      +Buffer.from(JSON.stringify({iss:origin+'/auth/v1',sub:user.id,iat,exp,session_id})).toString('base64url')+'.fixture-signature';
    const refresh_token=randomUUID();
    sessions.set(access_token,{id:user.id,iat,session_id,expiresAt:exp*1000});
    refreshTokens.set(refresh_token,{id:user.id,session_id});
    return {access_token,refresh_token,expires_at:exp,expires_in:3600,user:safeUser(user)};
  }
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
  async function query(sql, params, identity, service = false, readOnly = false) {
    return db.transaction(async tx => {
      if(readOnly)await tx.exec('set transaction read only');
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
    'inventory_items','inventory_profiles','inventory_purchases','inventory_quotes','temporary_accesses','temporary_access_events','care_tasks','care_notes']);
  async function simulatedSupabase(input, options = {}) {
    const url = new URL(input), path = url.pathname, body = options.body ? JSON.parse(options.body) : {};
    const token = new Headers(options.headers).get('Authorization')?.replace(/^Bearer /,'');
    const savedIdentity=sessions.get(token);
    const identity = savedIdentity?.expiresAt>Date.now()?savedIdentity:undefined, service = token === serviceKey;
    const reply = (status, data) => Response.json(data,{status});
    try {
      if (path === '/auth/v1/token') {
        if(url.searchParams.get('grant_type')==='refresh_token'){
          const saved=refreshTokens.get(body.refresh_token);
          if(!saved)return reply(400,{error_code:'refresh_token_not_found'});
          const active=await db.query('select id from auth.sessions where id=$1',[saved.session_id]);
          if(!active.rows.length)return reply(400,{error_code:'refresh_token_not_found'});
          refreshTokens.delete(body.refresh_token);
          return reply(200,authSession(accounts.get(saved.id),saved.session_id));
        }
        const user = [...accounts.values()].find(account => account.email === body.email);
        if (!user || !timingSafeEqual(user.hash,passwordHash(body.password,user.id))) return reply(400,{error_code:'invalid_credentials'});
        const session_id=randomUUID();
        await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session_id,user.id]);
        return reply(200,authSession(user,session_id));
      }
      if (path === '/auth/v1/user') return identity ? reply(200,safeUser(accounts.get(identity.id))) : reply(401,{});
      if (path === '/auth/v1/logout') {
        if(identity){
          await db.query('delete from auth.sessions where id=$1',[identity.session_id]);
          for(const [key,saved] of sessions)if(saved.session_id===identity.session_id)sessions.delete(key);
          for(const [key,saved] of refreshTokens)if(saved.session_id===identity.session_id)refreshTokens.delete(key);
        }
        return reply(200,{});
      }
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
        const metadata=await db.query("select p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name]);
        const readOnly=metadata.rows.length>0&&metadata.rows.every(row=>row.provolatile!=='v');
        if(name==='list_care_members'){
          const rows=await query('select * from public.list_care_members('+args+')',Object.values(body),identity,service,readOnly);
          return reply(200,rows);
        }
        const rows = await query('select public."'+name+'"('+args+') as result',Object.values(body),identity,service,readOnly);
        return reply(200,rows[0].result);
      }
      if (path.startsWith('/rest/v1/')) {
        const table = path.split('/').pop();
        if (!allowedTables.has(table)) return reply(404,{});
        if ((options.method ?? 'GET') !== 'GET' || service) return reply(405,{});
        // Bounded PostgREST subset: reject unsupported syntax rather than silently
        // producing a successful fixture response with different semantics.
        const split = text => {
          const parts=[]; let depth=0,quoted=false,escaped=false,start=0;
          for(let i=0;i<text.length;i++) {
            const ch=text[i];
            if(escaped){escaped=false;continue;}
            if(ch==='\\'&&quoted){escaped=true;continue;}
            if(ch==='"')quoted=!quoted;
            if(quoted)continue;
            if(ch==='(')depth++;
            if(ch===')'&&--depth<0)throw Error('Invalid parentheses');
            if(ch===','&&!depth){parts.push(text.slice(start,i));start=i+1;}
          }
          if(depth||quoted)throw Error('Invalid expression');
          parts.push(text.slice(start));return parts;
        };
        const scalar=raw=>raw.startsWith('"')?JSON.parse(raw):raw;
        const compare=(actual,expression)=>{
          const match=expression.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/s);
          if(!match)throw Error('Unsupported filter');
          const [,negate,op,raw]=match;let yes;
          if(op==='is') {
            if(!['null','true','false'].includes(raw))throw Error('Unsupported is');
            yes=actual===(raw==='null'?null:raw==='true');
          } else if(op==='in') {
            if(!raw.startsWith('(')||!raw.endsWith(')'))throw Error('Invalid in');
            if(actual==null)return false;
            yes=split(raw.slice(1,-1)).some(value=>String(actual)===String(scalar(value)));
          } else {
            if(actual==null)return false;
            const expected=scalar(raw),value=typeof actual==='number'?Number(expected):expected;
            yes=op==='eq'?String(actual)===String(expected):op==='neq'?String(actual)!==String(expected)
              :op==='gt'?actual>value:op==='gte'?actual>=value:op==='lt'?actual<value:actual<=value;
          }
          return negate?!yes:yes;
        };
        const matches=(row,expression)=>{
          const group=expression.match(/^(and|or)\((.*)\)$/s);
          if(group)return group[1]==='and'?split(group[2]).every(part=>matches(row,part)):split(group[2]).some(part=>matches(row,part));
          const match=expression.match(/^([a-z_]+)\.(.*)$/s);
          if(!match||!Object.hasOwn(row,match[1]))throw Error('Unknown filter column');
          return compare(row[match[1]],match[2]);
        };
        const visible=new Map();
        const load=async name=>{
          if(!allowedTables.has(name))throw Error('Unsupported relation');
          // JSON conversion preserves PostgreSQL DATE strings. All embedded reads
          // retain the caller identity and RLS; never query as service_role.
          if(!visible.has(name))visible.set(name,(await query('select to_jsonb(t) as value from public."'+name+'" t',[],identity)).map(row=>row.value));
          return visible.get(name);
        };
        const foreignKeys={patients:'patient_id',nurses:'nurse_id',inventory_items:'item_id'};
        const project=async(name,source,selection,prefix='')=>{
          const result=[];
          for(const row of source) {
            let keep=true;
            for(const [key,value] of url.searchParams) {
              if(['select','order','limit','offset'].includes(key))continue;
              if(prefix&&!key.startsWith(prefix))continue;
              const field=prefix?key.slice(prefix.length):key;
              if(field.includes('.'))continue;
              if(field==='and'||field==='or') {
                if(!value.startsWith('(')||!value.endsWith(')'))throw Error('Invalid logical filter');
                if(!matches(row,field+value))keep=false;
              } else if(!Object.hasOwn(row,field))throw Error('Unknown filter column');
              else if(!compare(row[field],value))keep=false;
            }
            if(!keep)continue;
            const output={};
            for(const part of split(selection)) {
              if(part==='*'){Object.assign(output,row);continue;}
              const embedded=part.match(/^([a-z_]+)(!inner)?\((.*)\)$/s);
              if(!embedded) {
                if(!/^[a-z_]+$/.test(part)||!Object.hasOwn(row,part))throw Error('Unsupported projection');
                output[part]=row[part];continue;
              }
              const [,related,inner,columns]=embedded;
              const fk=foreignKeys[related],many=name==='inventory_items'&&related==='inventory_profiles';
              if(!many&&(!fk||!Object.hasOwn(row,fk)))throw Error('Unsupported relationship');
              const relatedRows=(await load(related)).filter(other=>other.family_id===row.family_id&&(many?other.item_id===row.id:other.id===row[fk]));
              const children=await project(related,relatedRows,columns,prefix+related+'.');
              if(inner&&!children.length){keep=false;break;}
              output[related]=many?children:children[0]??null;
            }
            if(keep)result.push({source:row,output});
          }
          return result.map(entry=>prefix?entry.output:entry);
        };
        let rows=await project(table,await load(table),url.searchParams.get('select')??'*');
        const order=url.searchParams.get('order');
        if(order) {
          const keys=split(order).map(part=>{
            const match=part.match(/^([a-z_]+)(?:\.(asc|desc))?(?:\.(nullsfirst|nullslast))?$/);
            if(!match)throw Error('Unsupported order');return match.slice(1);
          });
          rows.sort((a,b)=>{
            for(const [key,direction='asc',nulls=direction==='desc'?'nullsfirst':'nullslast'] of keys) {
              if(!Object.hasOwn(a.source,key)||!Object.hasOwn(b.source,key))throw Error('Unknown order column');
              const x=a.source[key],y=b.source[key];if(x===y)continue;
              if(x==null||y==null)return(x==null?-1:1)*(nulls==='nullsfirst'?1:-1);
              return(x<y?-1:1)*(direction==='desc'?-1:1);
            }return 0;
          });
        }
        const integer=(key,fallback)=>{
          const raw=url.searchParams.get(key);if(raw===null)return fallback;
          if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error('Invalid pagination');
          return Number(raw);
        };
        const offset=integer('offset',0),limit=integer('limit',1000);
        return reply(200,rows.slice(offset,offset+limit).map(row=>row.output));
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
