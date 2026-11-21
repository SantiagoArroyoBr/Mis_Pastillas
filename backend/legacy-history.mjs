import {readCatalog} from './history.mjs';
const $=id=>document.getElementById(id);
export function legacyHistoryRows(source,limit=20,reveal=false){
  const label=index=>source.p[index]?.name+' · ficha '+(Number(index)+1);
  const coverage=[],assignments=[],staff=[];
  for(const [index,config] of (source.pay.cfg??[]).entries())for(const payment of config.pays??[])
    coverage.push([label(index),payment.d,String(payment.n),payment.a==null?'No registrado':reveal?String(payment.a)+' MXN':'••••']);
  for(const [index,nurses] of (source.pay.nurses??[]).entries())for(const nurse of nurses)
    staff.push([label(index),nurse.n]);
  for(const [day,byPatient] of Object.entries(source.pay.v??{}))for(const [index,entries] of Object.entries(byPatient))
    for(const row of entries)assignments.push([day,label(index),row.n,row.s==='half'?'Media jornada':row.s==='full'?'Completa':'Sin confirmar']);
  assignments.sort((a,b)=>b[0].localeCompare(a[0]));
  return {coverage:coverage.slice(0,limit),assignments:assignments.slice(0,limit),staff:staff.slice(0,limit),
    total:{coverage:coverage.length,assignments:assignments.length,staff:staff.length},
    more:Math.max(coverage.length,assignments.length,staff.length)>limit};
}
export function createLegacyHistory({run,status,renderTable,onPresence=()=>{},onChange=async()=>{}}){
  let sequence=0,snapshot,source,timer,snapshots=[],nurses=[],patients=[],context;
  const limits={coverage:20,assignments:20,staff:20};
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const linked=(text,href)=>{const el=node('a',text);el.href=href;return el;};
  function panels(visible){for(const panel of document.querySelectorAll?.('[data-legacy-panel]')??[])panel.hidden=!visible;}
  function hideAmounts(){clearTimeout(timer);timer=undefined;$('legacy-amount-toggle').textContent='Ver montos';$('legacy-amount-toggle').setAttribute('aria-pressed','false');}
  function clear(){sequence++;snapshot=source=context=undefined;snapshots=[];nurses=[];patients=[];for(const key of Object.keys(limits))limits[key]=20;hideAmounts();onPresence(false);panels(false);$('legacy-history').hidden=true;$('legacy-source-label').hidden=true;$('legacy-source').replaceChildren();$('download-legacy-original').disabled=true;$('legacy-amount-toggle').disabled=true;for(const id of ['legacy-coverage','legacy-assignments','legacy-staff','legacy-review'])$(id)?.replaceChildren();if($('legacy-integration-status'))$('legacy-integration-status').textContent='';}
  function selectSnapshot(index){
    const selected=snapshots[index];if(!selected)return;
    const parsed=window.AcompanaCompatibility.prepareMigratedState(JSON.parse(selected.original_json));
    snapshot=selected;source=parsed;for(const key of Object.keys(limits))limits[key]=20;hideAmounts();render();
  }
  $('legacy-source').addEventListener('change',()=>selectSnapshot(Number($('legacy-source').value)));
  function render(){
    if(!source)return;
    const rows=legacyHistoryRows(source,Math.max(...Object.values(limits)),Boolean(timer));
    renderTable($('legacy-coverage'),rows.coverage.slice(0,limits.coverage),'Sin prepagos de cobertura anteriores.');
    renderTable($('legacy-assignments'),rows.assignments.slice(0,limits.assignments),'Sin asignaciones anteriores.');
    const staffRows=[];let pending=0,imported=0;
    for(const [patientIndex,list]of (source.pay.nurses??[]).entries())for(const [staffIndex,person]of list.entries()){
      const integrated=nurses.find(row=>row.legacy_source_sha===snapshot.source_sha&&row.legacy_patient_index===patientIndex&&row.legacy_staff_index===staffIndex);
      if(integrated)imported++;else pending++;
      const label=source.p[patientIndex]?.name+' · ficha '+(patientIndex+1);
      if(integrated){staffRows.push([label,person.n,integrated.full_cents==null&&integrated.half_cents==null?'Integrado · tarifa pendiente':'Integrado',linked('Ver personal y tarifas','#finance')]);continue;}
      const select=node('select');select.setAttribute('aria-label','Ficha de destino para '+person.n+' · origen '+(patientIndex+1));
      const empty=node('option','Selecciona ficha de destino');empty.value='';select.append(empty);
      for(const patient of patients){const option=node('option',patient.name+' · '+patient.id.slice(0,8)+(patient.archived_at?' · archivada':''));option.value=patient.id;select.append(option);}
      const action=node('div');const button=node('button','Integrar personal');button.type='button';button.disabled=!context||!patients.length;
      button.addEventListener('click',run(async()=>{
        const request=sequence,active=context,selected=snapshot;
        if(!active||active.client.readOnly||active.client.isTemporary||!select.value)throw Error('Selecciona una ficha de destino y usa tu cuenta principal con conexión.');
        if(!confirm('¿Integrar este registro de personal en la ficha seleccionada? Su tarifa quedará pendiente; no se modifican pagos ni turnos antiguos.'))return;
        button.disabled=true;
        try{
          await active.client.rpc('integrate_legacy_nurse',{family:active.family,snapshot:selected.id,patient_index:patientIndex,staff_index:staffIndex,patient:select.value});
          if(request!==sequence||context!==active)return;
          status('Personal integrado. Configura su tarifa antes de registrar nuevas jornadas.','success');
          try{await onChange();}catch{if(request===sequence&&context===active)status('El personal se integró. Pulsa Actualizar fichas para consultar el resultado; no cambies la ficha para repetirlo.','warning');}
        }finally{if(request===sequence&&context===active)button.disabled=false;}
      }));
      action.append(select,button);staffRows.push([label,person.n,'Pendiente de integrar',action]);
    }
    renderTable($('legacy-staff'),staffRows.slice(0,limits.staff),'Sin personal registrado en el respaldo anterior.');
    const unknown=Object.values(source.pay.v??{}).flatMap(day=>Object.values(day).flat()).filter(row=>!['full','half'].includes(row.s)).length;
    const rates=nurses.filter(row=>row.legacy_source_sha===snapshot.source_sha&&row.full_cents==null&&row.half_cents==null).length;
    if($('legacy-review'))renderTable($('legacy-review'),[
      ['Personal de esta fuente',imported+' integrado(s); '+pending+' pendiente(s)',linked('Revisar en Enfermería','#finance')],
      ['Tarifas por verificar',String(rates),linked('Configurar tarifas','#finance')],
      ['Modalidades antiguas sin confirmar',String(unknown),linked('Consultar asignaciones anteriores','#finance')],
      ['Cobertura anterior',rows.total.coverage+' registro(s); no se suman al saldo nuevo',linked('Consultar en Pagos','#finance')]
    ],'Sin revisión pendiente.');
    if($('legacy-integration-status'))$('legacy-integration-status').textContent='Revisión de la copia seleccionada. Los nombres iguales no se fusionan y cada integración requiere confirmar su ficha.';
    if($('legacy-more'))$('legacy-more').hidden=true;
    for(const key of Object.keys(limits))if($('legacy-'+key+'-more'))$('legacy-'+key+'-more').hidden=rows.total[key]<=limits[key];
    $('legacy-counts').textContent=rows.total.coverage+' prepagos, '+rows.total.assignments+' asignaciones y '+rows.total.staff+' registros de personal conservados. Consulta cada historial en su apartado.';
  }
  $('legacy-amount-toggle').addEventListener('click',()=>{
    if(timer)hideAmounts();
    else{timer=setTimeout(()=>{hideAmounts();render();},30000);$('legacy-amount-toggle').textContent='Ocultar montos';$('legacy-amount-toggle').setAttribute('aria-pressed','true');}
    render();
  });
  $('legacy-more')?.addEventListener('click',()=>{for(const key of Object.keys(limits))limits[key]+=20;hideAmounts();render();});
  for(const key of Object.keys(limits))$('legacy-'+key+'-more')?.addEventListener('click',()=>{limits[key]+=20;hideAmounts();render();});
  $('download-legacy-original').addEventListener('click',run(async()=>{
    if(!snapshot)throw Error('Actualiza la familia antes de descargar la copia anterior.');
    if(!confirm('La copia original contiene información privada. ¿Descargarla en este dispositivo?'))return;
    const url=URL.createObjectURL(new Blob([snapshot.original_json],{type:'application/json'}));
    try{const a=document.createElement('a');a.href=url;a.download='acompana-respaldo-original.json';document.body.append(a);a.click();a.remove();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
    status('Copia original descargada. No se modificó su contenido.');
  }));
  return {clear,async load(client,family,owner,currentPatients=[]){
    clear();if(!owner||!family||client.readOnly||client.isTemporary)return;
    const request=sequence;
    try{
      const rows=await readCatalog(client,'legacy_snapshots',{family_id:'eq.'+family,select:'id,original_json,report,source_sha,source_commit,imported_at',order:'imported_at.desc,id.asc'});
      if(request!==sequence||!rows.length)return;
      const currentNurses=await readCatalog(client,'nurses',{family_id:'eq.'+family,select:'id,name,full_cents,half_cents,legacy_source_sha,legacy_patient_index,legacy_staff_index',order:'id.asc'});
      if(request!==sequence)return;
      context={client,family};patients=currentPatients;nurses=currentNurses;
      snapshots=rows;
      for(const [index,row] of rows.entries()){
        const option=document.createElement('option');option.value=String(index);option.textContent='Copia '+(index+1)+' · '+row.imported_at.slice(0,10);$('legacy-source').append(option);
      }
      $('legacy-source-label').hidden=rows.length<2;selectSnapshot(0);
      onPresence(true);panels(true);$('legacy-history').hidden=false;$('download-legacy-original').disabled=false;$('legacy-amount-toggle').disabled=false;
    }catch(error){
      if(request!==sequence)return;
      if(error.status===401||error.status===403)throw error;
      $('legacy-history').hidden=false;$('legacy-counts').textContent='No se pudo consultar el historial anterior. Pulsa Actualizar fichas para reintentar.';
    }
  }};
}
