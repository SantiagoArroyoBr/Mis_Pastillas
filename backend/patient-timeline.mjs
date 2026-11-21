import {readHistoryWindow} from './history.mjs';
const $=id=>document.getElementById(id);
const definitions=[
 ['appointment_details','appointment_day','Cita','appointments-heading'],
 ['care_tasks','due_on','Pendiente','care-coordination'],
 ['care_notes','created_at','Nota','care-coordination'],
 ['care_shifts','start_local','Turno previsto','care-coordination'],
 ['paper_care_logs','log_day','Bitácora impresa','care-coordination']
];
export function timelineEntries(groups){
 return groups.flatMap(({table,rows})=>rows.map(row=>{
  const def=definitions.find(d=>d[0]===table);
  const day=table==='care_notes'?new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(row.created_at)):String(row[def[1]]??row.legacy_day??'');
  const detail=table==='appointment_details'?[row.appointment_time?.slice(0,5),row.doctor,row.location,row.notes].filter(Boolean).join(' · ')
   :table==='care_tasks'?row.title+(row.completed_at?' · Completado':' · Pendiente')
   :table==='care_notes'?row.body
   :table==='care_shifts'?String(row.start_local).replace('T',' ').slice(0,16)+' → '+String(row.end_local).replace('T',' ').slice(0,16)+' · '+(row.care_zone??'Zona local')+(row.closed_at?' · Cerrado':' · Cierre por confirmar')
   :(row.completed?'Completada':'Pendiente')+[row.location,row.note].filter(Boolean).map(x=>' · '+x).join('');
  return {id:row.id,day,kind:def[2],detail,target:def[3]};
 })).sort((a,b)=>b.day.localeCompare(a.day)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
}
export function timelineRange(from,to){
 const valid=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(from)||!valid(to)||from&&to&&from>to)throw Error('Revisa el intervalo de fechas del historial.');
 return {from,to};
}
export function createPatientTimeline({run,renderTable}){
 let client,family,patients=[],sequence=0,limit=20;
 function clear(){sequence++;client=family=undefined;patients=[];limit=20;$('patient-timeline-rows').replaceChildren();$('patient-timeline-status').textContent='';$('patient-timeline-patient').replaceChildren();}
 async function show(){
  if(!family||!client)return;
  const selected=$('patient-timeline-patient').value;if(!selected)return;
  const request=++sequence,currentClient=client,currentFamily=family;
  $('patient-timeline-rows').replaceChildren();$('patient-timeline-more').hidden=true;
  const {from,to}=timelineRange($('patient-timeline-from').value,$('patient-timeline-to').value);
  const kind=$('patient-timeline-type').value;
  $('patient-timeline-status').textContent='Consultando el historial de esta ficha…';
  const chosen=definitions.filter(d=>!kind||kind===d[0]);
  try{
   const groups=await Promise.all(chosen.map(async([table,day])=>{
    const bounds=[];const timestamp=table==='care_notes'||table==='care_shifts';
    const boundary=(date,end)=>{
     if(!timestamp)return date;
     const value=date+(end?'T23:59:59.999':'T00:00:00');
     return table==='care_notes'?new Date(value).toISOString():value;
    };
    if(from)bounds.push(day+'.gte.'+boundary(from,false));if(to)bounds.push(day+'.lte.'+boundary(to,true));
    const page=await readHistoryWindow(currentClient,table,{family_id:'eq.'+currentFamily,patient_id:'eq.'+selected,
     ...(bounds.length&&{and:'('+bounds.join(',')+')'}),order:day+'.desc.nullslast,id.desc'},limit);
    return {table,...page};
   }));
   if(request!==sequence||client!==currentClient||family!==currentFamily)return;
   const entries=timelineEntries(groups);
   renderTable($('patient-timeline-rows'),entries.map(entry=>{
    const link=document.createElement('a');link.href='#'+entry.target;link.textContent='Abrir apartado';
    return [entry.day?entry.day.slice(0,10):'Sin fecha confirmada',entry.kind,entry.detail,link];
   }),'No hay registros con estos filtros.');
   $('patient-timeline-more').hidden=!groups.some(g=>g.hasMore);
   $('patient-timeline-status').textContent='Mostrando hasta '+limit+' registros por tipo. Las fechas sin confirmar sólo se incluyen cuando no hay intervalo. Los antecedentes importados se consultan también en sus apartados.';
  }catch(error){if(request!==sequence)return;$('patient-timeline-rows').replaceChildren();$('patient-timeline-status').textContent='No se pudo completar el historial. Actualiza y vuelve a intentarlo.';throw error;}
 }
 for(const id of ['patient-timeline-patient','patient-timeline-type','patient-timeline-from','patient-timeline-to'])$(id).addEventListener('change',run(async()=>{limit=20;await show();}));
 $('patient-timeline-more').addEventListener('click',run(async()=>{limit+=20;await show();}));
 return {clear,async load(nextClient,nextFamily,nextPatients){
  const changed=family!==nextFamily||client!==nextClient;if(changed)clear();
  client=nextClient;family=nextFamily;patients=nextPatients;
  const previous=$('patient-timeline-patient').value;
  $('patient-timeline-patient').replaceChildren(...patients.map(p=>new Option(p.name+' · '+p.id.slice(0,8)+(p.archived_at?' (archivada)':''),p.id)));
  if(patients.some(p=>p.id===previous))$('patient-timeline-patient').value=previous;
  if(!patients.length)return;
  await show();
 }};
}
