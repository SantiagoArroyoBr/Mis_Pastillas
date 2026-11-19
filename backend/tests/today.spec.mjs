import {test} from 'node:test';
import assert from 'node:assert/strict';
import {todayEntries} from '../today.mjs';
test('today combines due tasks with actual day events and distinguishes stock estimates',()=>{
  const events=new Map([['2026-11-19',[{kind:'appointment',name:'Consulta ficticia',details:'10:00'},{kind:'stock',name:'Insumo ficticio',details:'2 unidades'}]],['2026-11-20',[{kind:'appointment',name:'Mañana'}]]]);
  const result=todayEntries(events,[{id:'old',title:'Comprar',due_on:'2026-11-18'},{id:'now',title:'Recoger',due_on:'2026-11-19'}],'2026-11-19');
  assert.equal(result.length,4);assert.match(result[0].details,/Vencido/);assert.match(result[1].details,/Hoy/);
  assert.equal(result[2].details,'10:00');assert.match(result[3].details,/Estimación/);
});
