import {readCatalog} from './history.mjs';
const $=id=>document.getElementById(id);
export function legacyHistoryRows(source,limit=20,reveal=false){
  const label=index=>source.p[index]?.name+' · ficha '+(Number(index)+1);
  const coverage=[],assignments=[],staff=[];
  for(const [index,config] of (source.pay.cfg??[]).entries())for(const payment of config.pays??[])
    coverage.push([label(index),payment.d,String(payment.n),reveal?String(payment.a)+' MXN':'••••']);
  for(const [index,nurses] of (source.pay.nurses??[]).entries())for(const nurse of nurses)
    staff.push([label(index),nurse.n]);
  for(const [day,byPatient] of Object.entries(source.pay.v??{}))for(const [index,entries] of Object.entries(byPatient))
    for(const row of entries)assignments.push([day,label(index),row.n,row.s==='half'?'Media jornada':row.s==='full'?'Completa':'Sin confirmar']);
  assignments.sort((a,b)=>b[0].localeCompare(a[0]));
  return {coverage:coverage.slice(0,limit),assignments:assignments.slice(0,limit),staff:staff.slice(0,limit),
    total:{coverage:coverage.length,assignments:assignments.length,staff:staff.length},
    more:Math.max(coverage.length,assignments.length,staff.length)>limit};
}
export function createLegacyHistory({run,status,renderTable,onPresence=()=>{}}){
  let sequence=0,snapshot,source,limit=20,timer,snapshots=[];
  function hideAmounts(){clearTimeout(timer);timer=undefined;$('legacy-amount-toggle').textContent='Ver montos';$('legacy-amount-toggle').setAttribute('aria-pressed','false');}
  function clear(){sequence++;snapshot=source=undefined;snapshots=[];limit=20;hideAmounts();onPresence(false);$('legacy-history').hidden=true;$('legacy-source-label').hidden=true;$('legacy-source').replaceChildren();$('download-legacy-original').disabled=true;$('legacy-amount-toggle').disabled=true;for(const id of ['legacy-coverage','legacy-assignments','legacy-staff'])$(id).replaceChildren();}
  function selectSnapshot(index){
    const selected=snapshots[index];if(!selected)return;
    const parsed=window.AcompanaCompatibility.prepareMigratedState(JSON.parse(selected.original_json));
    snapshot=selected;source=parsed;limit=20;hideAmounts();render();
  }
  $('legacy-source').addEventListener('change',()=>selectSnapshot(Number($('legacy-source').value)));
  function render(){
    if(!source)return;
    const rows=legacyHistoryRows(source,limit,Boolean(timer));
    renderTable($('legacy-coverage'),rows.coverage,'Sin prepagos de cobertura anteriores.');
    renderTable($('legacy-assignments'),rows.assignments,'Sin asignaciones anteriores.');
    renderTable($('legacy-staff'),rows.staff,'Sin personal registrado en el respaldo anterior.');
    $('legacy-more').hidden=!rows.more;
    $('legacy-counts').textContent=rows.total.coverage+' prepagos, '+rows.total.assignments+' asignaciones y '+rows.total.staff+' registros de personal conservados. Mostrando hasta '+limit+' por tabla.';
  }
  $('legacy-amount-toggle').addEventListener('click',()=>{
    if(timer)hideAmounts();
    else{timer=setTimeout(()=>{hideAmounts();render();},30000);$('legacy-amount-toggle').textContent='Ocultar montos';$('legacy-amount-toggle').setAttribute('aria-pressed','true');}
    render();
  });
  $('legacy-more').addEventListener('click',()=>{limit+=20;hideAmounts();render();});
  $('download-legacy-original').addEventListener('click',run(async()=>{
    if(!snapshot)throw Error('Actualiza la familia antes de descargar la copia anterior.');
    if(!confirm('La copia original contiene información privada. ¿Descargarla en este dispositivo?'))return;
    const url=URL.createObjectURL(new Blob([snapshot.original_json],{type:'application/json'}));
    try{const a=document.createElement('a');a.href=url;a.download='acompana-respaldo-original.json';document.body.append(a);a.click();a.remove();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
    status('Copia original descargada. No se modificó su contenido.');
  }));
  return {clear,async load(client,family,owner){
    clear();if(!owner||!family||client.readOnly)return;
    const request=sequence;
    try{
      const rows=await readCatalog(client,'legacy_snapshots',{family_id:'eq.'+family,select:'id,original_json,report,source_sha,source_commit,imported_at',order:'imported_at.desc,id.asc'});
      if(request!==sequence||!rows.length)return;
      snapshots=rows;
      for(const [index,row] of rows.entries()){
        const option=document.createElement('option');option.value=String(index);option.textContent='Copia '+(index+1)+' · '+row.imported_at.slice(0,10);$('legacy-source').append(option);
      }
      $('legacy-source-label').hidden=rows.length<2;selectSnapshot(0);
      onPresence(true);$('legacy-history').hidden=false;$('download-legacy-original').disabled=false;$('legacy-amount-toggle').disabled=false;
    }catch(error){
      if(request!==sequence)return;
      if(error.status===401||error.status===403)throw error;
      $('legacy-history').hidden=false;$('legacy-counts').textContent='No se pudo consultar el historial anterior. Pulsa Actualizar fichas para reintentar.';
    }
  }};
}
