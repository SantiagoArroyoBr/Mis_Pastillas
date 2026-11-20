// Conversión local: el JSON original se conserva íntegro y nunca se envía aquí.
export const legacySourceCommit='92c4034085e13bb38fd0a7ff2622c46ef797873d';
const maxBytes=10*1024*1024;
const tables=['patients','nurses','shifts','receipts','receipt_cancellations','individual_payments',
  'individual_allocations','appointments','appointment_edits','inventory_items','inventory_profiles',
  'inventory_purchases','inventory_quotes','care_tasks','care_notes','legacy_snapshots'];
const encode=value=>new TextEncoder().encode(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw new Error(message);};
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function sourceId(hash,path){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encode(hash+':'+path))).slice(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const h=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function text(value,max,description,{optional=false}={}){
  if(typeof value!=='string'||value.length>max||!optional&&!value.trim())fail('Revisa '+description+': su texto no cabe en el formato de destino.');
  return value;
}
function quantity(value,description,{positive=false}={}){
  if(typeof value!=='number'||!Number.isFinite(value)||(positive?value<=0:value<0))fail('Revisa '+description+': el valor no se puede conservar de forma segura.');
  return value;
}
function safeTree(source,depth=0){
  if(depth>80)fail('El respaldo tiene una estructura demasiado profunda.');
  if(!source||typeof source!=='object')return;
  for(const [key,value]of Object.entries(source)){
    if(['access_token','refresh_token','password','service_role','service_role_key','apikey','activation_code','activation_hash','token_valid_after'].includes(key.toLowerCase()))
      fail('El archivo incluye campos de credenciales y no es un respaldo local compatible.');
    safeTree(value,depth+1);
  }
}
function consumptions(entries,{manualSupply=false}={}){
  if(!Array.isArray(entries)||!entries.length&&!manualSupply)fail('Un artículo no tiene pautas verificables.');
  return entries.map(entry=>{
    quantity(entry.dose,'la dosis',{positive:true});
    if(!Array.isArray(entry.times)||!entry.times.length||entry.times.some(t=>typeof t!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t)))fail('Hay horarios de consumo no compatibles.');
    const schedule=entry.schedule??{type:'daily'},type=schedule.type??'daily';
    let mapped;
    if(type==='daily')mapped={type:'daily'};
    else if(type==='weekdays'){
      if(!Array.isArray(schedule.days)||!schedule.days.length||schedule.days.some(day=>!Number.isInteger(day)||day<0||day>6))fail('Hay días de consumo no compatibles.');
      mapped={type,days:[...schedule.days]};
    }else if(type==='interval'){
      const start=typeof schedule.start==='number'?schedule.start:Date.parse(schedule.start);
      if(!Number.isSafeInteger(schedule.n)||schedule.n<1||!Number.isSafeInteger(start)||start<1||start>8640000000000000)fail('Una pauta por intervalo no tiene una fecha inicial verificable.');
      mapped={type,n:schedule.n,start};
    }else fail('Hay una frecuencia de consumo no compatible.');
    return {dose:entry.dose,times:[...entry.times],schedule:mapped};
  });
}

export async function convertLegacyBackup(raw,{compatibility=globalThis.window?.AcompanaCompatibility,
  now=new Date(),familyName='Familia importada'}={}){
  if(typeof raw!=='string'||encode(raw).byteLength>maxBytes)fail('El respaldo supera el límite de 10 MiB.');
  if(!compatibility?.prepareMigratedState||!compatibility?.isValidDateOnly)fail('No está disponible la validación del respaldo anterior.');
  let source;try{source=JSON.parse(raw);}catch{fail('El archivo no contiene JSON válido.');}
  safeTree(source);
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(key=>!['sel','last','p','mode','appts','pay','exportedAt'].includes(key)))
    fail('El archivo contiene campos de otra versión. Revisa su compatibilidad antes de importarlo.');
  const financial=source?.pay;
  if((financial?.ledger?.length)||(financial?.generalLedger?.length)||financial?.service||
    Object.values(financial?.v??{}).some(day=>Object.values(day??{}).some(rows=>Array.isArray(rows)&&rows.some(row=>row&&Object.hasOwn(row,'service')))))
    fail('Este respaldo contiene servicios o libros financieros posteriores a main y requiere otro conversor compatible.');
  let state;try{state=compatibility.prepareMigratedState(clone(source));}catch{fail('El respaldo no supera la validación de estructura y relaciones de la PWA anterior.');}
  const stamp=new Date(now);if(!Number.isFinite(stamp.getTime()))fail('La fecha de conversión no es válida.');
  const at=stamp.toISOString(),hash=await digest(raw),id=path=>sourceId(hash,path);
  text(familyName,80,'el nombre de familia');
  const archive={format:'acompana-family',version:3,exported_at:at,
    family:{id:await id('family'),name:familyName,created_at:at},tables:Object.fromEntries(tables.map(table=>[table,[]])),
    administration:{accesses:[],events:[],membership_states:[]}};
  const report={version:1,source_commit:legacySourceCommit,source_sha:hash,
    source:{patients:state.p.length,inventory:0,priceReferences:0,appointments:state.appts.length,nurses:0,coveragePayments:0,assignments:0},
    migrated:{patients:0,inventory:0,priceReferences:0,appointments:0,nurses:0},
    preserved:{originalJson:true,financialHistory:true,unmappedPriceReferences:0},warnings:[]};
  const patientIds=[];
  for(let i=0;i<state.p.length;i++){
    const patient=state.p[i],patientId=await id('patient/'+i);patientIds.push(patientId);
    archive.tables.patients.push({id:patientId,name:text(patient.name,80,'una ficha'),revision:1,archived_at:patient.archived?at:null});
    report.source.nurses+=(state.pay.nurses[i]??[]).length;
    report.source.coveragePayments+=(state.pay.cfg[i]?.pays??[]).length;
    for(let j=0;j<patient.meds.length;j++){
      const item=patient.meds[j],itemId=await id('patient/'+i+'/item/'+j);
      const base=quantity(item.base,'las existencias'),start=item.t0;
      if(!Number.isSafeInteger(start)||start<1||start>8640000000000000)fail('Un artículo no tiene fecha base verificable.');
      const schedules=consumptions(item.cons,{manualSupply:item.kind==='sup'});
      archive.tables.inventory_items.push({id:itemId,patient_id:patientId,name:text(item.name,160,'un artículo'),kind:item.kind==='sup'?'sup':'medicine',
        initial_quantity:String(base),initial_at:start,base_quantity:String(base),base_at:start,consumptions:schedules,revision:1});
      report.source.inventory++;
      for(let k=0;k<(item.buys??[]).length;k++){
        const price=item.buys[k];report.source.priceReferences++;
        if(!compatibility.isValidDateOnly(price.d)){report.preserved.unmappedPriceReferences++;continue;}
        archive.tables.inventory_quotes.push({id:await id('patient/'+i+'/item/'+j+'/price/'+k),item_id:itemId,
          quantity:String(quantity(price.n,'la cantidad de una referencia',{positive:true})),total_price:String(quantity(price.p,'el precio histórico')),
          quoted_on:price.d,shop:text(price.w??'',40,'la tienda',{optional:true})});
      }
    }
  }
  for(let i=0;i<state.appts.length;i++){
    const appointment=state.appts[i],valid=compatibility.isValidDateOnly(appointment.d);
    const time=appointment.t||null;
    if(time&&!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))fail('Una cita tiene una hora que requiere revisión.');
    archive.tables.appointments.push({id:await id('appointment/'+i),patient_id:patientIds[appointment.i],
      appointment_day:valid?appointment.d:null,legacy_day:valid?null:appointment.d,appointment_time:time,
      location:text(appointment.w??'',160,'el lugar de una cita',{optional:true}),notes:text(appointment.n??'',500,'la nota de una cita',{optional:true}),doctor:null});
  }
  report.source.assignments=Object.values(state.pay.v).reduce((sum,byPatient)=>sum+Object.values(byPatient).reduce((n,rows)=>n+rows.length,0),0);
  report.migrated.patients=archive.tables.patients.length;report.migrated.inventory=archive.tables.inventory_items.length;
  report.migrated.priceReferences=archive.tables.inventory_quotes.length;report.migrated.appointments=archive.tables.appointments.length;
  if(report.source.priceReferences)report.warnings.push('price_references_do_not_add_stock');
  if(report.preserved.unmappedPriceReferences)report.warnings.push('invalid_price_dates_preserved_in_original');
  if(report.source.nurses)report.warnings.push('legacy_nurses_without_verified_rates_preserved');
  if(report.source.assignments||report.source.coveragePayments||(state.pay.ledger??[]).length||(state.pay.generalLedger??[]).length)
    report.warnings.push('legacy_finances_preserved_without_invented_modern_balance');
  archive.tables.legacy_snapshots.push({id:await id('legacy-snapshot'),source_sha:hash,source_commit:legacySourceCommit,
    original_json:raw,report:clone(report),imported_at:at});
  if(encode(JSON.stringify(archive)).byteLength>maxBytes)fail('La copia convertida y su original superan el límite de 10 MiB; no se recortó ningún dato.');
  return {archive,report};
}
