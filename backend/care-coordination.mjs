import { readHistoryWindow, createHistoryControl } from './history.mjs';
import { durableRequest } from './durable-requests.mjs';
import { saveAndRefresh } from './supabase-client.mjs';

const $ = id => document.getElementById(id);
const timestamp = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const taskFields = 'id,family_id,patient_id,title,details,due_on,assignee_id,completed_at,revision,actor_id,created_at';
const noteFields = 'id,family_id,patient_id,body,actor_id,created_at';

export function careAccountLabel(id, members = [], ownId) {
  if (!id) return 'Sin asignar';
  if (id === ownId) return 'Mi cuenta';
  return members.find(member => member.user_id === id)?.label || 'Cuenta · ' + id.slice(0, 8);
}

export function createCareCoordination({run,status,renderTable,actionButton,onChange=async()=>{},getScope,
  getStorage=()=>{try{return globalThis.localStorage;}catch{return undefined;}}}) {
  const taskForm=$('care-task-form'), noteForm=$('care-note-form');
  const tasksBody=$('care-tasks'), notesBody=$('care-notes'), filter=$('care-task-filter');
  let client,family,patients=[],members=[],generation=0,loadSequence=0,taskFilter='pending';
  const taskPages=createHistoryControl(tasksBody,'pendientes',run,next=>load(client,family,patients,members,{tasks:next}));
  const notePages=createHistoryControl(notesBody,'bitácora',run,next=>load(client,family,patients,members,{notes:next}));

  function clear(){
    generation++;loadSequence++;client=undefined;family=undefined;patients=[];members=[];
    taskFilter='pending';if(filter)filter.value=taskFilter;
    taskForm.reset();noteForm.reset();tasksBody.replaceChildren();notesBody.replaceChildren();
    taskPages.reset();notePages.reset();
  }
  function scope(next){if(family!==next){clear();family=next;}}
  function patientLabel(id){
    if(!id)return 'Toda la familia';
    const row=patients.find(patient=>patient.id===id);
    if(!row)return 'Ficha · '+id.slice(0,8);
    const duplicate=patients.filter(patient=>patient.name===row.name).length>1;
    return row.name+(duplicate?' · '+id.slice(0,8):'')+(row.archived_at?' (archivada)':'');
  }
  function options(select,rows,empty,unavailableLabel){
    const selected=select.value;
    const unavailable=selected&&!rows.some(row=>row.id===selected);
    // La opción sigue habilitada para conservar su ID en FormData. Deshabilitarla
    // podría convertir una tarea para una ficha concreta en una tarea familiar.
    select.replaceChildren(...(empty?[new Option(empty,'')]:[]),
      ...(unavailable?[new Option(unavailableLabel(selected)+' · Elige otra opción',selected)]:[]),
      ...rows.map(row=>new Option(row.label,row.id)));
    if(unavailable||rows.some(row=>row.id===selected))select.value=selected;
  }
  function currentScope(){
    if(!client||!family)throw new Error('Selecciona una familia antes de guardar.');
    if(client.readOnly)throw new Error('Reconecta antes de guardar pendientes o notas.');
    return {client,family,generation};
  }
  function isCurrent(snapshot){return snapshot.client===client&&snapshot.family===family&&snapshot.generation===generation;}
  async function createOnce(snapshot,operation,payload){
    if(!getScope)throw new Error('No se pudo identificar la cuenta para conservar el reintento seguro.');
    return durableRequest({storage:getStorage(),scope:getScope(),operation,payload,
      send:args=>snapshot.client.rpc(operation,args)});
  }
  async function committed(snapshot,{write,reset,message}){
    await saveAndRefresh({write,
      reset:()=>{if(isCurrent(snapshot))reset();},
      refresh:async()=>{
        if(!isCurrent(snapshot))throw new Error('La familia cambió.');
        await load(snapshot.client,snapshot.family,patients,members);
        await onChange();
      },
      notify:(message,kind)=>{if(isCurrent(snapshot))status(message,kind);},message});
  }
  async function load(nextClient,nextFamily,nextPatients,nextMembers=[],counts={}){
    scope(nextFamily);client=nextClient;patients=nextPatients;members=nextMembers;
    const request=++loadSequence,context=generation,active=patients.filter(patient=>!patient.archived_at);
    const requested={tasks:counts.tasks??taskPages.count,notes:counts.notes??notePages.count};
    const ownId=getScope?.()?.[1];
    const activeMembers=members.filter(member=>!member.revoked_at);
    const unavailablePatient=id=>patientLabel(id)+(patients.some(patient=>patient.id===id)?'':' (no disponible)');
    options(taskForm.elements.patient,active.map(patient=>({id:patient.id,label:patientLabel(patient.id)})),'Toda la familia',unavailablePatient);
    options(noteForm.elements.patient,active.map(patient=>({id:patient.id,label:patientLabel(patient.id)})),undefined,unavailablePatient);
    options(taskForm.elements.assignee,activeMembers.map(member=>({id:member.user_id,label:careAccountLabel(member.user_id,members,ownId)})),'Sin asignar',
      id=>careAccountLabel(id,members,ownId)+' (no disponible)');
    noteForm.querySelector('button').disabled=!active.length||Boolean(client.readOnly);
    taskForm.querySelector('button').disabled=Boolean(client.readOnly);
    const params={family_id:'eq.'+family,select:taskFields,order:'created_at.desc,id.desc',
      ...(taskFilter==='pending'?{completed_at:'is.null'}:taskFilter==='done'?{completed_at:'not.is.null'}:{})};
    const [tasks,notes]=await Promise.all([
      readHistoryWindow(client,'care_tasks',params,requested.tasks),
      readHistoryWindow(client,'care_notes',{family_id:'eq.'+family,select:noteFields,order:'created_at.desc,id.desc'},requested.notes)
    ]);
    if(request!==loadSequence||context!==generation||client!==nextClient||family!==nextFamily)return;
    renderTable(tasksBody,tasks.rows.map(row=>{
      const description=document.createElement('div');
      const title=document.createElement('strong');title.textContent=row.title;description.append(title);
      if(row.details){const detail=document.createElement('p');detail.className='pilot-table-notes';detail.textContent=row.details;description.append(detail);}
      const actions=document.createElement('div');actions.className='pilot-row-actions';
      const archived=patients.some(patient=>patient.id===row.patient_id&&patient.archived_at);
      if(!client.readOnly&&!archived){
        actions.append(actionButton(row.title,row.completed_at?'Reabrir pendiente':'Completar pendiente',async()=>{
          if(client!==nextClient||family!==nextFamily)throw new Error('La familia cambió. Actualiza los pendientes.');
          const snapshot=currentScope();
          await committed(snapshot,{write:()=>snapshot.client.rpc('set_care_task_completed',{
            family:snapshot.family,task:row.id,expected_revision:row.revision,completed:!row.completed_at}),
          reset:()=>{},message:row.completed_at?'Pendiente reabierto.':'Pendiente completado.'});
        }));
      }else actions.textContent=archived?'Ficha archivada':'Solo consulta';
      return [row.due_on||'Sin fecha',description,patientLabel(row.patient_id),careAccountLabel(row.assignee_id,members,ownId),row.completed_at?'Completado':'Pendiente',actions];
    }),taskFilter==='done'?'Aún no hay pendientes completados.':'No hay pendientes para esta selección. Puedes registrar uno en el formulario.');
    renderTable(notesBody,notes.rows.map(row=>[timestamp.format(new Date(row.created_at)),patientLabel(row.patient_id),row.body,careAccountLabel(row.actor_id,members,ownId)]),
      'Aún no hay notas. Selecciona una ficha y registra lo ocurrido para compartirlo con la familia.');
    taskPages.update(tasks,requested.tasks);notePages.update(notes,requested.notes);
    return {tasks,notes};
  }
  taskForm.addEventListener('submit',run(async()=>{
    const snapshot=currentScope(),values=new FormData(taskForm);
    const title=values.get('title').trim(),details=values.get('details').trim();
    if(!title||title.length>160||details.length>2000)throw new Error('Escribe un título de hasta 160 caracteres y detalles de hasta 2000.');
    if(values.get('patient')&&!patients.some(patient=>patient.id===values.get('patient')&&!patient.archived_at))
      throw new Error('La ficha seleccionada ya no está activa. Conservamos tu borrador; elige una ficha activa o Toda la familia.');
    if(values.get('assignee')&&!members.some(member=>member.user_id===values.get('assignee')&&!member.revoked_at))
      throw new Error('El responsable seleccionado ya no está disponible. Conservamos tu borrador; elige otra cuenta o Sin asignar.');
    await committed(snapshot,{write:()=>createOnce(snapshot,'create_care_task',{
      family:snapshot.family,patient:values.get('patient')||null,task_title:title,task_details:details,
      day:values.get('day')||null,assignee:values.get('assignee')||null}),reset:()=>taskForm.reset(),message:'Pendiente registrado.'});
  }));
  noteForm.addEventListener('submit',run(async()=>{
    const snapshot=currentScope(),values=new FormData(noteForm),body=values.get('body').trim();
    if(!values.get('patient')||!body||body.length>4000)throw new Error('Selecciona una ficha y escribe una nota de hasta 4000 caracteres.');
    if(!patients.some(patient=>patient.id===values.get('patient')&&!patient.archived_at))
      throw new Error('La ficha seleccionada ya no está activa. Conservamos tu nota; elige una ficha activa antes de guardar.');
    await committed(snapshot,{write:()=>createOnce(snapshot,'add_care_note',{
      family:snapshot.family,patient:values.get('patient'),note_body:body}),reset:()=>noteForm.reset(),message:'Nota agregada a la bitácora.'});
  }));
  filter?.addEventListener('change',run(async()=>{
    const previous=taskFilter;taskFilter=['pending','done','all'].includes(filter.value)?filter.value:'pending';
    try{await load(client,family,patients,members,{tasks:20});}
    catch(error){taskFilter=previous;filter.value=previous;throw error;}
  }));
  return {scope,clear,load};
}
