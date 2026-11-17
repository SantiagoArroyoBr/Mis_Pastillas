// Solo servidor. Send Email Hook de Supabase reemplaza SMTP, incluido Auth directo.
const encoder=new TextEncoder();
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const emailAddress=value=>typeof value==='string' && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const failure=status=>{throw Object.assign(new Error('Correo no disponible.'),{status});};
const actions={
  signup:'Confirma tu cuenta de Acompaña',invite:'Tu invitación a Acompaña',
  recovery:'Recupera el acceso a Acompaña',magiclink:'Accede a Acompaña',email:'Tu acceso a Acompaña',
  reauthentication:'Confirma tu identidad en Acompaña',
  password_changed_notification:'Cambio de contraseña en Acompaña',email_changed_notification:'Cambio de correo en Acompaña',
  phone_changed_notification:'Cambio de teléfono en Acompaña',identity_linked_notification:'Cambio de acceso en Acompaña',
  identity_unlinked_notification:'Cambio de acceso en Acompaña',mfa_factor_enrolled_notification:'Cambio de seguridad en Acompaña',
  mfa_factor_unenrolled_notification:'Cambio de seguridad en Acompaña'
};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createEmailHook(config,fetcher=fetch) {
  const {supabaseUrl,serviceKey,hookSecret,brevoApiKey,senderEmail,senderName='Acompaña',redirectUrl}=config;
  if(!supabaseUrl||!serviceKey||!hookSecret||!brevoApiKey||!emailAddress(senderEmail)||!redirectUrl) throw new Error('Configuración privada de correo incompleta.');
  const target=new URL(redirectUrl),api=new URL(supabaseUrl);
  if((target.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(target.hostname))
    ||(api.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(api.hostname))) throw new Error('Destino de correo no válido.');
  const secret=hookSecret.replace(/^v1,whsec_/,'').replace(/^whsec_/,'');
  let rawSecret;
  try {rawSecret=Uint8Array.from(atob(secret),c=>c.charCodeAt(0));}catch{throw new Error('Secreto de firma no válido.');}
  if(rawSecret.length<32) throw new Error('Secreto de firma insuficiente.');
  const keyPromise=crypto.subtle.importKey('raw',rawSecret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const reply=(status,data={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  async function rpc(name,body) {
    const response=await fetcher(supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',
      headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(name==='finish_auth_email'?600:1200)});
    if(!response.ok) {
      console.warn('auth_email_sql_failed',{operation:name,status:response.status});
      failure(503);
    }
    return response.json();
  }
  return async request=>{
    let eventHash,payloadHash,providerStarted=false,stage='signature';
    try {
      if(request.method!=='POST') failure(405);
      const timestamp=request.headers.get('webhook-timestamp')??'',id=request.headers.get('webhook-id')??'';
      if(!/^\d{1,12}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300
        ||!id||id.length>200||!/^[-_a-zA-Z0-9]+$/.test(id)) failure(401);
      const reader=request.body?.getReader();if(!reader) failure(400);
      const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
        if(size>32768){await reader.cancel();failure(413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const signed=encoder.encode(id+'.'+timestamp+'.'+raw),key=await keyPromise;
      let verified=false;
      for(const entry of (request.headers.get('webhook-signature')??'').split(' ')) {
        const [version,signature]=entry.split(',');if(version!=='v1'||!signature)continue;
        try{const signatureBytes=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
          if(await crypto.subtle.verify('HMAC',key,signatureBytes,signed)){verified=true;break;}}catch{}
      }
      if(!verified) failure(401);
      stage='payload';
      const payload=JSON.parse(raw),data=payload?.email_data,recipient=payload?.user?.email;
      if(typeof recipient==='string'&&/^temp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@acompana\.invalid$/i.test(recipient)) return reply(200);
      const action=data?.email_action_type;
      // Cambio de correo requiere reservar y entregar ambos destinatarios atómicamente.
      // Hasta implementar ese flujo se rechaza, sin enviar ni uno de los dos mensajes.
      if(!Object.hasOwn(actions,action??'')||!emailAddress(recipient)||recipient.toLowerCase().endsWith('@acompana.invalid')) failure(400);
      let text,html;
      if(action.endsWith('_notification')) text='Se registró un cambio en la seguridad de tu cuenta de Acompaña. Si no lo reconoces, solicita ayuda al administrador.';
      else if(action==='reauthentication') {
        if(typeof data.token!=='string'||!/^\d{6,12}$/.test(data.token)) failure(400);
        text='Tu código de verificación de Acompaña es: '+data.token+'. No lo compartas.';
      } else {
        if(typeof data.token_hash!=='string'||!/^[A-Za-z0-9_-]{16,512}$/.test(data.token_hash)) failure(400);
        const link=new URL('/auth/v1/verify',supabaseUrl);
        link.search=new URLSearchParams({token:data.token_hash,type:action,redirect_to:target.href});
        text='Usa este enlace para continuar en Acompaña: '+link.href+'\nSi no lo solicitaste, ignora este mensaje.';
        html='<p>Usa este enlace para continuar en Acompaña:</p><p><a href="'+escapeHtml(link.href)+'">'
          +escapeHtml(actions[action])+'</a></p><p>Si no lo solicitaste, ignora este mensaje.</p>';
      }
      eventHash=await digest(id+':'+recipient.trim().toLowerCase());payloadHash=await digest(raw);
      stage='reserve';
      const reservation=await rpc('claim_auth_email',{event_hash:eventHash,payload_hash:payloadHash,
        recipient_hash:await digest('auth_mail:'+recipient.trim().toLowerCase())});
      if(reservation.status==='sent')return reply(200);
      if(reservation.status==='denied')failure(429);
      if(reservation.status!=='send'||!reservation.idempotency_key)failure(503);
      providerStarted=true;stage='provider';
      const response=await fetcher('https://api.brevo.com/v3/smtp/email',{method:'POST',
        headers:{'api-key':brevoApiKey,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({sender:{email:senderEmail,name:senderName},subject:actions[action],
          textContent:text,htmlContent:html??'<p>'+escapeHtml(text).replaceAll('\n','<br>')+'</p>',
          messageVersions:[{to:[{email:recipient}]}],headers:{idempotencyKey:reservation.idempotency_key}}),
        signal:AbortSignal.timeout(1500)});
      const result=await response.json().catch(()=>null);
      if(!response.ok) console.warn('auth_email_provider_failed',{status:response.status,
        code:/^[a-z_]{1,64}$/.test(result?.code??'')?result.code:'unknown'});
      const duplicate=result?.code==='duplicate_parameter'&&/idempotency/i.test(result?.message??'');
      const delivered=response.ok||duplicate;
      stage='finish';
      if(delivered) {
        // El proveedor ya aceptó el mensaje. Una confirmación SQL lenta no debe
        // convertirlo en un fallo de Auth ni provocar un segundo envío.
        await rpc('finish_auth_email',{event_hash:eventHash,payload_hash:payloadHash,delivered:true,uncertain:false})
          .catch(()=>console.warn('auth_email_delivery_ack_pending',{stage:'finish'}));
        providerStarted=false;
        return reply(200);
      }
      await rpc('finish_auth_email',{event_hash:eventHash,payload_hash:payloadHash,delivered,uncertain:!delivered&&response.status>=500});
      providerStarted=false;
      if(!delivered)failure(503);
      return reply(200);
    }catch(error){
      if(eventHash&&payloadHash&&providerStarted) await rpc('finish_auth_email',{
        event_hash:eventHash,payload_hash:payloadHash,delivered:false,uncertain:true}).catch(()=>{});
      const status=[400,401,405,413,429].includes(error.status)?error.status:503;
      console.warn('auth_email_failed',{stage,status});
      return reply(status,{error:{http_code:status,message:'No se pudo procesar el correo de acceso.'}});
    }
  };
}
