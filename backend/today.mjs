import { loadCalendarRecords, buildCalendarEvents } from './calendar.mjs';
import { readHistoryWindow } from './history.mjs';
const $=id=>document.getElementById(id);
const dateKey=new Intl.DateTimeFormat('sv-SE');
export function todayEntries(events,tasks,today){
  return [...tasks.map(task=>({kind:'task',id:task.id,name:task.title,
    details:(task.due_on<today?'Vencido · ':'Hoy · ')+task.due_on})),
    ...(events.get(today)??[]).map(event=>({...event,details:
      (['stock','depletion'].includes(event.kind)?'Estimación · ':'')+event.details}))];
}
export function createToday({run,openRecord}){
  let generation=0;
  return {
    clear(){generation++;$('today-list').replaceChildren();$('today-status').textContent='';},
    async load(client,family,owner){
      const request=++generation,now=new Date(),today=dateKey.format(now);
      $('today-status').textContent='Consultando lo de hoy…';
      try{
        const [records,tasks]=await Promise.all([
          loadCalendarRecords(client,family,'',now,owner),
          readHistoryWindow(client,'care_tasks',{family_id:'eq.'+family,completed_at:'is.null',due_on:'lte.'+today,
            select:'id,title,due_on',order:'due_on.asc,id.asc'},20)
        ]);
        if(request!==generation)return;
        const entries=todayEntries(buildCalendarEvents(records,window.AcompanaDomain,now),tasks.rows,today);
        $('today-list').replaceChildren(...entries.slice(0,8).map(entry=>{
          const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p');
          title.textContent=entry.name;detail.textContent=entry.details;li.append(title,detail);
          if(entry.kind==='task'){
            const link=document.createElement('a');link.href='#care-coordination';link.textContent='Ver pendiente';li.append(link);
          }else if(entry.kind!=='shift'){
            const button=document.createElement('button');button.type='button';button.textContent=entry.kind==='appointment'?'Ver cita':'Ver artículo';
            button.addEventListener('click',run(()=>openRecord(entry)));li.append(button);
          }
          return li;
        }));
        $('today-status').textContent=entries.length
          ? 'Mostrando '+Math.min(entries.length,8)+' asuntos de hoy y pendientes vencidos.'+(entries.length>8||tasks.hasMore?' Consulta el calendario y Pendientes para ver más.':'')
          : 'No hay citas, turnos ni reposiciones previstas para hoy, ni pendientes con fecha vencida. Puedes crear un pendiente.';
      }catch{
        if(request!==generation)return;
        $('today-list').replaceChildren();$('today-status').textContent='No se pudo completar el resumen. Consulta los apartados o pulsa Actualizar fichas.';
      }
    }
  };
}
