const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Persistimos solo un identificador opaco y el hash del contexto, nunca el borrador.
// El servidor conserva el resultado de ese identificador dentro de la transacción.
export async function durableRequest({ storage, scope, operation, payload, send }) {
  const stable = Object.fromEntries(Object.entries(payload).sort(([a],[b])=>a.localeCompare(b)));
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([scope,operation,stable])));
  const key = 'acompana-request-v1:'+[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  let id;
  try {
    const raw=storage.getItem(key);
    const previous=raw?(uuid.test(raw)?{id:raw,state:'pending'}:JSON.parse(raw)):undefined;
    if(previous&&(!uuid.test(previous.id??'')||!['pending','confirmed'].includes(previous.state)))throw Error();
    id=previous?.state==='pending'?previous.id:crypto.randomUUID();
    const pending=JSON.stringify({id,state:'pending'});
    storage.setItem(key,pending);
    if(storage.getItem(key)!==pending)throw Error();
  } catch {
    throw new Error('No se pudo conservar el identificador seguro del alta. Revisa el almacenamiento del navegador; no se envió la solicitud.');
  }
  const result = await send({...payload,request_id:id});
  if (!uuid.test(result ?? '')) throw new Error('No se pudo comprobar el alta. Actualiza y reintenta los mismos datos para conciliarla.');
  let acknowledged=false;
  try{
    const confirmed=JSON.stringify({id,state:'confirmed'});storage.setItem(key,confirmed);
    acknowledged=storage.getItem(key)===confirmed;
  }catch{}
  try{storage.removeItem(key);acknowledged=acknowledged||storage.getItem(key)===null;}catch{}
  if(!acknowledged)throw Object.assign(new Error('El alta se guardó, pero el navegador no pudo cerrar su identificador. Revisa el almacenamiento antes de intentar otra alta igual.'),{saved:true,result});
  return result;
}
