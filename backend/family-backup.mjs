// Copias de la versión conectada. No compatibles con pastillas-v1 ni con su importador.
import { durableRequest } from './durable-requests.mjs';
export const familyBackupTables=Object.freeze(['patients','nurses','shifts','receipts','receipt_cancellations',
  'individual_payments','individual_allocations','appointments','appointment_edits','inventory_items',
  'inventory_profiles','inventory_purchases','inventory_quotes']);
export const familyBackupMaxBytes=10*1024*1024;
export const familyBackupCareTables=Object.freeze([...familyBackupTables,'care_tasks','care_notes']);

function validAdministration(value,depth=0){
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  if(depth>2||!object(value)||Object.keys(value).some(k=>!['accesses','events','membership_states','recovery_history'].includes(k)))return false;
  const keys={accesses:['id','display_name','expires_at','revoked_at','revision','state','created_at'],
    events:['access_id','action','happened_at'],membership_states:['role','revoked_at'],
    recovery_history:['source_family','restored_at','administration']};
  for(const [section,allowed] of Object.entries(keys)){
    if(section==='recovery_history'&&!Object.hasOwn(value,section))continue;
    if(!Array.isArray(value[section])||value[section].length>50000)return false;
    for(const row of value[section]){
      if(!object(row)||Object.keys(row).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(row,k)))return false;
      if(section==='membership_states'&&!['owner','caregiver'].includes(row.role))return false;
      if(section==='accesses'&&(!['pending','active','revoked'].includes(row.state)
        ||typeof row.display_name!=='string'||row.display_name.length<1||row.display_name.length>80))return false;
      if(section==='recovery_history'&&(!validAdministration(row.administration,depth+1)||!object(row.source_family)
        ||Object.keys(row.source_family).some(k=>!['id','name','created_at'].includes(k))))return false;
    }
  }
  return true;
}

export function parseFamilyBackup(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>familyBackupMaxBytes)
    throw new Error('La copia es demasiado grande; el límite es 10 MiB.');
  let archive;try{archive=JSON.parse(raw);}catch{throw new Error('El archivo no es un JSON válido.');}
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const tables=archive?.version===2?familyBackupCareTables:familyBackupTables;
  if(!object(archive)||archive.format!=='acompana-family'||![1,2].includes(archive.version)
      ||!object(archive.family)||!object(archive.tables)||!validAdministration(archive.administration)
      ||typeof archive.family.name!=='string'||!archive.family.name.trim()||archive.family.name.length>80
      ||typeof archive.family.id!=='string'||! /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(archive.family.id)
      ||typeof archive.family.created_at!=='string'||!Number.isFinite(Date.parse(archive.family.created_at))
      ||typeof archive.exported_at!=='string'||!Number.isFinite(Date.parse(archive.exported_at))
      ||Object.keys(archive.family).some(key=>!['id','name','created_at'].includes(key))
      ||Object.keys(archive).some(key=>!['format','version','exported_at','family','tables','administration'].includes(key))
      ||Object.keys(archive.tables).some(key=>!tables.includes(key)))
    throw new Error('No es una copia conectada de Acompaña compatible.');
  let total=0;
  for(const table of tables){
    const rows=archive.tables[table];
    if(!Array.isArray(rows)||rows.length>50000||rows.some(row=>!object(row)))
      throw new Error('La estructura de la copia no es válida.');
    total+=rows.length;
  }
  if(total>100000)throw new Error('La copia contiene demasiados registros.');
  return archive;
}

export function familyBackupSummary(archive){
  return {name:archive.family.name,exportedAt:archive.exported_at,
    counts:Object.fromEntries((archive.version===2?familyBackupCareTables:familyBackupTables).map(table=>[table,archive.tables[table].length])),
    accessHistoryOnly:true};
}

export function createFamilyRecovery({getClient,getScope,getStorage=()=>{try{return globalThis.localStorage;}catch{return undefined;}}}){
  let reviewed,reviewedClient,requestId,requestName,generation=0,busy=false;
  const clear=()=>{reviewed=undefined;reviewedClient=undefined;requestId=undefined;requestName=undefined;generation++;};
  return {
    clear,
    review(raw){
      if(busy)throw new Error('Espera a que termine la operación actual.');
      clear();reviewed=parseFamilyBackup(raw);reviewedClient=getClient();return familyBackupSummary(reviewed);
    },
    async export(family){
      if(busy)throw new Error('Espera a que termine la operación actual.');
      const client=getClient(),version=generation;busy=true;
      try{
        if(!client?.rpc)throw new Error('Inicia sesión con tu cuenta principal.');
        const archive=await client.rpc('export_family_backup',{family});
        if(version!==generation||client!==getClient())throw new Error('La sesión o familia cambió. Vuelve a exportar.');
        const raw=JSON.stringify(archive,null,2);parseFamilyBackup(raw);
        return {raw,summary:familyBackupSummary(archive),filename:'acompana-familia-'+new Date().toISOString().slice(0,10)+'.json'};
      }finally{busy=false;}
    },
    async restore({name,confirmed=false}={}){
      if(!reviewed)throw new Error('Primero revisa una copia conectada de Acompaña.');
      if(reviewedClient!==getClient()){clear();throw new Error('La sesión cambió. Vuelve a revisar la copia.');}
      if(!confirmed)throw new Error('Confirma la restauración en una familia nueva.');
      if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw new Error('Escribe el nombre de la nueva familia, de hasta 80 caracteres.');
      if(busy)throw new Error('Espera a que termine la operación actual.');
      const client=getClient(),version=generation;busy=true;
      name=name.trim();
      if(requestName!==name){requestId=crypto.randomUUID();requestName=name;}
      try{
        if(!client?.rpc)throw new Error('Inicia sesión con tu cuenta principal.');
        const payload={archive:reviewed,family_name:name};
        const family=getScope
          ? await durableRequest({storage:getStorage(),scope:getScope(),operation:'restore-family',payload,
            send:args=>client.rpc('restore_family_backup',args)})
          : await client.rpc('restore_family_backup',{...payload,request_id:requestId});
        if(version!==generation||client!==getClient())throw new Error('La sesión cambió. Consulta las familias antes de repetir la restauración.');
        return family;
      }finally{busy=false;}
    }
  };
}
