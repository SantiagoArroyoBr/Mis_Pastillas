import {test} from 'node:test';
import assert from 'node:assert/strict';
import {todayEntries,pendingCareClosures} from '../today.mjs';
test('today combines due tasks with actual day events and distinguishes stock estimates',()=>{
  const events=new Map([['2026-11-19',[{kind:'appointment',name:'Consulta ficticia',details:'10:00'},{kind:'stock',name:'Insumo ficticio',details:'2 unidades'}]],['2026-11-20',[{kind:'appointment',name:'Mañana'}]]]);
  const result=todayEntries(events,[{id:'old',title:'Comprar',due_on:'2026-11-18'},{id:'now',title:'Recoger',due_on:'2026-11-19'}],'2026-11-19');
  assert.equal(result.length,4);assert.match(result[0].details,/Vencido/);assert.match(result[1].details,/Hoy/);
  assert.equal(result[2].details,'10:00');assert.match(result[3].details,/Estimación/);
});
test('a passed end requires closure without changing attendance and duplicate day events collapse into one reminder',()=>{
 const row={id:'shift',end_local:'2026-11-21T06:00:00',closed_at:null};
 assert.equal(pendingCareClosures([row],new Date(2026,10,21,5,59)).length,0);
 assert.equal(pendingCareClosures([row],new Date(2026,10,21,6,1)).length,1);
 const events=new Map([['2026-11-21',[{id:'shift',kind:'care-shift',name:'Turno'}]]]);
 assert.equal(todayEntries(events,[],'2026-11-21',[row]).length,1);assert.equal(row.closed_at,null);
 assert.equal(pendingCareClosures([{...row,closed_at:'2026-11-21T12:00Z'}],new Date(2026,10,21,6,1)).length,0);
});
