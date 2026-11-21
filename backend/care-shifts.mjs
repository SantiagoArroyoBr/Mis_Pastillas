import {readHistoryWindow,createHistoryControl} from './history.mjs';
import {durableRequest} from './durable-requests.mjs';
import {saveAndRefresh} from './supabase-client.mjs';
import {careAccountLabel} from './care-coordination.mjs';
import {careClock} from './care-clock.mjs';

const $=id=>document.getElementById(id);
const shiftFields='id,family_id,patient_id,nurse_id,start_local,end_local,care_zone,actual_end_local,closed_at,revision,actor_id,created_at';
const logFields='id,family_id,patient_id,nurse_id,care_shift_id,log_day,completed,location,note,revision,actor_id,created_at';
export function localCareDateTime(date=new Date()){
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function validCareDateTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
  const date=new Date(value+'Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,16)===value;
}
const stamp=value=>String(value??'').replace(' ','T').slice(0,16);
export function careShiftState(row,now=new Date()){
  if(typeof now!=='string')now=careClock(now,row.care_zone);
  if(row.closed_at)return 'Cerrado';
  if(stamp(row.end_local)<=now)return 'Terminó el horario · cierre pendiente';
  return stamp(row.start_local)<=now?'En horario':'Programado';
}
export function careLocalLabel(value){
  const local=stamp(value);if(!local)return 'Sin registrar';
  return local.slice(8,10)+'/'+local.slice(5,7)+'/'+local.slice(0,4)+(local.length>10?' '+local.slice(11):'');
}

export function createCareShifts({run,status,renderTable,actionButton,onChange=async()=>{},getScope,
  getStorage=()=>{try{return globalThis.localStorage;}catch{return undefined;}},now=()=>new Date()}){
  const scheduleForm=$('care-shift-form'),closeForm=$('care-close-form'),paperForm=$('paper-log-form'),editForm=$('paper-log-edit-form');
  const shiftBody=$('care-shifts'),logBody=$('paper-logs');
  if(scheduleForm.elements.zone){scheduleForm.elements.zone.defaultValue=Intl.DateTimeFormat().resolvedOptions().timeZone;scheduleForm.elements.zone.value=scheduleForm.elements.zone.defaultValue;}
  let client,family,patients=[],nurses=[],members=[],generation=0,sequence=0,editingShift,editingLog,statusTimer,statusNodes=[];
  const shiftPages=createHistoryControl(shiftBody,'turnos de cuidado',run,next=>load(client,family,patients,nurses,members,{shifts:next}));
  const logPages=createHistoryControl(logBody,'bitácoras impresas',run,next=>load(client,family,patients,nurses,members,{logs:next}));

  function dismissClose(){editingShift=undefined;closeForm.reset();$('care-close-panel').hidden=true;}
  function dismissEdit(){editingLog=undefined;editForm.reset();$('paper-log-edit-panel').hidden=true;}
  function clear(){
    generation++;sequence++;clearTimeout(statusTimer);statusNodes=[];client=family=undefined;patients=[];nurses=[];members=[];
    scheduleForm.reset();paperForm.reset();dismissClose();dismissEdit();shiftBody.replaceChildren();logBody.replaceChildren();shiftPages.reset();logPages.reset();
  }
  function patientLabel(id){
    const row=patients.find(item=>item.id===id);
    if(!row)return 'Ficha · '+String(id).slice(0,8);
    return row.name+(patients.filter(item=>item.name===row.name).length>1?' · '+id.slice(0,8):'')+(row.archived_at?' (archivada)':'');
  }
  function nurseLabel(id){
    if(!id)return 'Sin confirmar';
    const row=nurses.find(item=>item.id===id);
    if(!row)return 'Personal · '+String(id).slice(0,8);
    return row.name+(nurses.filter(item=>item.name===row.name).length>1?' · '+id.slice(0,8):'');
  }
  function options(select,rows,empty,label){
    const selected=select.value,missing=selected&&!rows.some(row=>row.id===selected);
    select.replaceChildren(...(empty!==undefined?[new Option(empty,'')]:[]),
      ...(missing?[new Option(label(selected)+' · Elige otra opción',selected)]:[]),...rows.map(row=>new Option(row.label,row.id)));
    if(missing||rows.some(row=>row.id===selected))select.value=selected;
  }
  function refreshOptions(){
    const active=patients.filter(patient=>!patient.archived_at).map(patient=>({id:patient.id,label:patientLabel(patient.id)}));
    const staff=nurses.map(nurse=>({id:nurse.id,label:nurseLabel(nurse.id)}));
    for(const form of [scheduleForm,paperForm])options(form.elements.patient,active,'Selecciona una ficha',patientLabel);
    options(scheduleForm.elements.nurse,staff,'Selecciona personal',nurseLabel);
    options(closeForm.elements.filled_by,staff,'Pendiente de confirmar',nurseLabel);
    options(paperForm.elements.nurse,staff,'Pendiente de confirmar',nurseLabel);
    options(editForm.elements.nurse,staff,'Pendiente de confirmar',nurseLabel);
    scheduleForm.querySelector('button').disabled=!active.length||!staff.length||Boolean(client?.readOnly);
    paperForm.querySelector('button').disabled=!active.length||Boolean(client?.readOnly);
    closeForm.querySelector('button').disabled=Boolean(client?.readOnly);
    editForm.querySelector('button').disabled=Boolean(client?.readOnly);
  }
  function current(){
    if(!client||!family)throw Error('Selecciona una familia antes de guardar.');
    if(client.readOnly)throw Error('Reconecta antes de guardar turnos o bitácoras impresas.');
    return {client,family,generation};
  }
  const isCurrent=context=>context.client===client&&context.family===family&&context.generation===generation;
  function updateClock(){
    clearTimeout(statusTimer);
    for(const {node,row} of statusNodes)node.textContent=careShiftState(row,now());
    if(statusNodes.length){statusTimer=setTimeout(updateClock,60000);statusTimer.unref?.();}
  }
  function activePatient(id){
    if(!patients.some(patient=>patient.id===id&&!patient.archived_at))throw Error('La ficha ya no está activa. Conservamos el borrador; selecciona una ficha activa.');
  }
  function availableNurse(id,required=false){
    if(required&&!id||id&&!nurses.some(nurse=>nurse.id===id))throw Error('Selecciona personal disponible antes de guardar. Conservamos tu borrador.');
  }
  async function once(context,operation,payload){
    if(!getScope)throw Error('No se pudo identificar la cuenta para conservar el reintento seguro.');
    return durableRequest({storage:getStorage(),scope:getScope(),operation,payload,send:args=>context.client.rpc(operation,args)});
  }
  async function committed(context,{write,reset,message}){
    await saveAndRefresh({write,reset:()=>{if(isCurrent(context))reset();},refresh:async()=>{
      if(!isCurrent(context))throw Error('La familia cambió.');
      await load(context.client,context.family,patients,nurses,members);await onChange();
    },notify:(text,kind)=>{if(isCurrent(context))status(text,kind);},message});
  }
  function openClose(row){
    current();activePatient(row.patient_id);editingShift={...row};closeForm.reset();
    closeForm.elements.status.value='pending';refreshOptions();
    $('care-close-context').textContent=patientLabel(row.patient_id)+' · '+nurseLabel(row.nurse_id)+' · '+careLocalLabel(row.start_local)+' a '+careLocalLabel(row.end_local)+' · '+(row.care_zone??'Zona local');
    $('care-close-panel').hidden=false;
    closeForm.elements.actual_end.focus?.();
  }
  function openEdit(row){
    current();activePatient(row.patient_id);editingLog={...row};editForm.reset();
    editForm.elements.status.value=row.completed?'completed':'pending';
    editForm.elements.nurse.value=row.nurse_id??'';editForm.elements.location.value=row.location??'';editForm.elements.note.value=row.note??'';refreshOptions();
    $('paper-log-edit-context').textContent=patientLabel(row.patient_id)+' · '+careLocalLabel(row.log_day);
    $('paper-log-edit-panel').hidden=false;
    editForm.elements.status.focus?.();
  }
  async function load(nextClient,nextFamily,nextPatients,nextNurses,nextMembers=[],counts={}){
    if(family!==nextFamily){clear();family=nextFamily;}
    client=nextClient;patients=nextPatients;members=nextMembers;
    const request=++sequence,version=generation;
    const requested={shifts:counts.shifts??shiftPages.count,logs:counts.logs??logPages.count};
    const staff=Array.isArray(nextNurses)?nextNurses:nextClient.readOnly?[]:await nextClient.rpc('list_shift_nurses',{family:nextFamily});
    if(request!==sequence||version!==generation||client!==nextClient||family!==nextFamily)return;
    nurses=staff;refreshOptions();
    const [shifts,logs]=await Promise.all([
      readHistoryWindow(nextClient,'care_shifts',{family_id:'eq.'+nextFamily,select:shiftFields,order:'start_local.desc,id.desc'},requested.shifts),
      readHistoryWindow(nextClient,'paper_care_logs',{family_id:'eq.'+nextFamily,select:logFields,order:'log_day.desc,id.desc'},requested.logs)
    ]);
    if(request!==sequence||version!==generation||client!==nextClient||family!==nextFamily)return;
    clearTimeout(statusTimer);statusNodes=[];
    renderTable(shiftBody,shifts.rows.map(row=>{
      const archived=patients.some(patient=>patient.id===row.patient_id&&patient.archived_at),actions=document.createElement('div');actions.className='pilot-row-actions';
      if(!client.readOnly&&!archived&&!row.closed_at)actions.append(actionButton(patientLabel(row.patient_id),'Cerrar turno y registrar hoja',async()=>{
        if(!isCurrent({client:nextClient,family:nextFamily,generation:version}))throw Error('La familia cambió. Actualiza los turnos.');openClose(row);
      }));
      else actions.textContent=row.closed_at?'Cierre confirmado':archived?'Ficha archivada':'Solo consulta';
      const paper=logs.rows.find(log=>log.care_shift_id===row.id);
      const state=document.createElement('span');state.textContent=careShiftState(row,now());statusNodes.push({node:state,row});
      return [patientLabel(row.patient_id),nurseLabel(row.nurse_id),careLocalLabel(row.start_local)+' → '+careLocalLabel(row.end_local)+' · '+(row.care_zone??'Zona local')+(row.actual_end_local?' · Fin registrado: '+careLocalLabel(row.actual_end_local):''),state,paper?(paper.completed?'Hoja completada':'Hoja pendiente'):(row.closed_at?'Consultar historial de hojas':'Sin confirmar'),actions];
    }),'Aún no hay turnos programados. Registrar el horario no genera cargos ni confirma atención.');
    renderTable(logBody,logs.rows.map(row=>{
      const actions=document.createElement('div'),archived=patients.some(patient=>patient.id===row.patient_id&&patient.archived_at);actions.className='pilot-row-actions';
      if(!client.readOnly&&!archived)actions.append(actionButton(patientLabel(row.patient_id),'Corregir control de hoja',async()=>{
        if(!isCurrent({client:nextClient,family:nextFamily,generation:version}))throw Error('La familia cambió. Actualiza las bitácoras.');openEdit(row);
      }));else actions.textContent=archived?'Ficha archivada':'Solo consulta';
      const detail=document.createElement('div');detail.textContent=(row.completed?'Completada':'Pendiente')+(row.location?' · '+row.location:'');
      if(row.note){const note=document.createElement('p');note.className='pilot-table-notes';note.textContent=row.note;detail.append(note);}
      return [careLocalLabel(row.log_day)+(row.care_shift_id?' · Vinculada a turno':''),patientLabel(row.patient_id),nurseLabel(row.nurse_id),detail,careAccountLabel(row.actor_id,members,getScope?.()?.[1]),actions];
    }),'Aún no hay controles de hojas impresas. El contenido clínico permanece en el papel.');
    shiftPages.update(shifts,requested.shifts);logPages.update(logs,requested.logs);
    updateClock();
    return {shifts,logs};
  }
  function paperValues(form){
    const values=new FormData(form),completed=values.get('status')==='completed',nurse=values.get('nurse')||values.get('filled_by')||null;
    const location=values.get('location')?.trim()??'',note=values.get('note')?.trim()??'';
    availableNurse(nurse,completed);
    if(location.length>200||note.length>2000)throw Error('Indica una ubicación de hasta 200 caracteres y una observación de hasta 2000.');
    return {nurse,completed,location,note};
  }
  scheduleForm.addEventListener('submit',run(async()=>{
    const context=current(),values=new FormData(scheduleForm),patient=values.get('patient'),nurse=values.get('nurse');
    const start=values.get('start'),end=values.get('end');activePatient(patient);availableNurse(nurse,true);
    const zone=values.get('zone')?.trim()||'America/Mexico_City';try{careClock(new Date(),zone);}catch{throw Error('Revisa la zona horaria del cuidado, por ejemplo America/Mexico_City.');}
    if(!validCareDateTime(start)||!validCareDateTime(end)||end<=start)throw Error('Revisa el inicio y el término. Para un turno nocturno, selecciona la fecha del día siguiente.');
    await committed(context,{write:()=>once(context,'schedule_care_shift',{family:context.family,patient,nurse,start_local:start,end_local:end,care_zone:zone}),reset:()=>{scheduleForm.reset();if(scheduleForm.elements.zone)scheduleForm.elements.zone.value=zone;},message:'Turno programado. El cierre deberá confirmarse al terminar.'});
  }));
  closeForm.addEventListener('submit',run(async()=>{
    const context=current(),row=editingShift;if(!row)throw Error('Selecciona el turno que quieres cerrar.');activePatient(row.patient_id);
    const values=paperValues(closeForm),actual=closeForm.elements.actual_end.value;
    if(actual&&(!validCareDateTime(actual)||actual<stamp(row.start_local)))throw Error('Revisa la hora real de término: no puede ser anterior al inicio.');
    await committed(context,{write:()=>once(context,'close_care_shift',{family:context.family,shift:row.id,expected_revision:row.revision,actual_end_local:actual||null,filled_by:values.nurse,log_completed:values.completed,log_location:values.location,note:values.note}),reset:dismissClose,message:'Turno cerrado y control de hoja registrado. No se modificaron pagos.'});
  }));
  paperForm.addEventListener('submit',run(async()=>{
    const context=current(),form=new FormData(paperForm),patient=form.get('patient'),values=paperValues(paperForm),day=form.get('day');activePatient(patient);
    if(!validCareDateTime(day+'T12:00'))throw Error('Selecciona una fecha válida para la hoja impresa.');
    await committed(context,{write:()=>once(context,'record_paper_care_log',{family:context.family,patient,nurse:values.nurse,day,completed:values.completed,location_text:values.location,note:values.note}),reset:()=>paperForm.reset(),message:'Control de bitácora impresa registrado.'});
  }));
  editForm.addEventListener('submit',run(async()=>{
    const context=current(),row=editingLog;if(!row)throw Error('Selecciona el control que quieres corregir.');activePatient(row.patient_id);const values=paperValues(editForm);
    await committed(context,{write:()=>context.client.rpc('update_paper_care_log',{family:context.family,log:row.id,expected_revision:row.revision,nurse:values.nurse,completed:values.completed,location_text:values.location,note:values.note}),reset:dismissEdit,message:'Control corregido. La modificación conserva su autoría e historial.'});
  }));
  $('care-close-cancel').addEventListener('click',dismissClose);$('paper-log-edit-cancel').addEventListener('click',dismissEdit);
  return {clear,load};
}
