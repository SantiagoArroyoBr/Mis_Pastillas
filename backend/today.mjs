import { loadCalendarRecords, buildCalendarEvents } from './calendar.mjs';
import { readHistoryWindow } from './history.mjs';
import {careClock} from './care-clock.mjs';
const $=id=>document.getElementById(id);
const dateKey=new Intl.DateTimeFormat('sv-SE');
export function pendingCareClosures(rows,now=new Date()){
 return rows.filter(row=>!row.closed_at&&String(row.end_local).replace(' ','T').slice(0,16)<=careClock(now,row.care_zone)).sort((a,b)=>a.end_local.localeCompare(b.end_local)||a.id.localeCompare(b.id));
}
export function todayEntries(events,tasks,today,closing=[]){
  return [...tasks.map(task=>({kind:'task',id:task.id,name:task.title,
    details:(task.due_on<today?'Vencido · ':'Hoy · ')+task.due_on})),
    ...closing.map(row=>({kind:'care-shift',id:row.id,name:row.patients?.name??'Turno de cuidado',details:'Horario terminado · cierre pendiente · '+String(row.end_local).slice(0,16).replace('T',' ')})),
    ...(events.get(today)??[]).filter(event=>event.kind!=='care-shift'||!closing.some(row=>row.id===event.id)).map(event=>({...event,details:
      (['stock','depletion'].includes(event.kind)?'Estimación · ':'')+event.details}))];
}
export function createToday({run,openRecord}){
  let generation=0,timer;
  return {
    clear(){generation++;clearTimeout(timer);$('today-list').replaceChildren();$('today-status').textContent='';},
    async load(client,family,owner){
      clearTimeout(timer);const request=++generation,now=new Date(),today=dateKey.format(now);
      $('today-status').textContent='Consultando lo de hoy…';
      try{
        const localNow=today+'T'+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
        const [records,tasks,closing]=await Promise.all([
          loadCalendarRecords(client,family,'',now,owner),
          readHistoryWindow(client,'care_tasks',{family_id:'eq.'+family,completed_at:'is.null',due_on:'lte.'+today,
            select:'id,title,due_on',order:'due_on.asc,id.asc'},20),
          readHistoryWindow(client,'care_shifts',{family_id:'eq.'+family,closed_at:'is.null',
            select:'id,end_local,care_zone,closed_at,patients(name)',order:'end_local.asc,id.asc'},20)
        ]);
        if(request!==generation)return;
        function render(){
        if(request!==generation)return;
        const stamp=new Date(),currentDay=dateKey.format(stamp);
        const shifts=new Map([...closing.rows,...(records.careShifts??[])].map(row=>[row.id,row]));
        const entries=todayEntries(buildCalendarEvents(records,window.AcompanaDomain,stamp),tasks.rows,currentDay,pendingCareClosures([...shifts.values()],stamp));
        $('today-list').replaceChildren(...entries.slice(0,8).map(entry=>{
          const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p');
          title.textContent=entry.name;detail.textContent=entry.details;li.append(title,detail);
          if(entry.kind==='task'){
            const link=document.createElement('a');link.href='#care-coordination';link.textContent='Ver pendiente';li.append(link);
          }else if(entry.kind!=='shift'){
            const button=document.createElement('button');button.type='button';button.textContent=entry.kind==='appointment'?'Ver cita':entry.kind==='care-shift'?'Ver turno':'Ver artículo';
            button.addEventListener('click',run(()=>openRecord(entry)));li.append(button);
          }
          return li;
        }));
        $('today-status').textContent=entries.length
          ? 'Mostrando '+Math.min(entries.length,8)+' asuntos de hoy, cierres y pendientes vencidos.'+(entries.length>8||tasks.hasMore||closing.hasMore?' Consulta el calendario y Pendientes para ver más.':'')
          : 'No hay citas, turnos ni reposiciones previstas para hoy, ni pendientes con fecha vencida. Puedes crear un pendiente.';
        timer=setTimeout(render,60000);timer.unref?.();
        }render();
      }catch{
        if(request!==generation)return;
        $('today-list').replaceChildren();$('today-status').textContent='No se pudo completar el resumen. Consulta los apartados o pulsa Actualizar fichas.';
      }
    }
  };
}
