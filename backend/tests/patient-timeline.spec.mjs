import {test} from 'node:test';import assert from 'node:assert/strict';
import {timelineEntries,timelineRange} from '../patient-timeline.mjs';
test('unified history keeps identities and sorts independent event kinds without changing records',()=>{
 const groups=[{table:'care_tasks',rows:[{id:'a',due_on:'2026-11-20',title:'Comprar',completed_at:null}]},
  {table:'paper_care_logs',rows:[{id:'b',log_day:'2026-11-21',completed:false,note:'<script>texto</script>'}]},
  {table:'appointment_details',rows:[{id:'c',appointment_day:null,legacy_day:'',notes:'Dato anterior'}]}];
 const before=JSON.stringify(groups),rows=timelineEntries(groups);
 assert.deepEqual(rows.map(r=>r.id),['b','a','c']);assert.match(rows[0].detail,/<script>/);assert.equal(JSON.stringify(groups),before);
});
test('date filters reject impossible, reversed and malformed ranges',()=>{
 for(const [from,to]of [['2026-02-30',''],['2026-11-21','2026-11-20'],['bad','']])assert.throws(()=>timelineRange(from,to));
 assert.deepEqual(timelineRange('',''),{from:'',to:''});assert.doesNotThrow(()=>timelineRange('2028-02-29','2028-02-29'));
});
