import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCareShifts,careShiftState,validCareDateTime} from '../care-shifts.mjs';

const patient={id:'patient-a',name:'Ficha ficticia',archived_at:null};
const nurse={id:'nurse-a',name:'Personal ficticio'};
const shift={id:'11111111-1111-4111-8111-111111111111',family_id:'family-a',patient_id:patient.id,nurse_id:nurse.id,start_local:'2026-11-20T20:00:00',end_local:'2026-11-21T08:00:00',actual_end_local:null,closed_at:null,revision:1,actor_id:'owner',created_at:'2026-11-20T12:00:00Z'};
const log={id:'22222222-2222-4222-8222-222222222222',family_id:'family-a',patient_id:patient.id,nurse_id:nurse.id,care_shift_id:shift.id,log_day:'2026-11-20',completed:false,location:'Carpeta ficticia',note:'Hoja pendiente',revision:1,actor_id:'owner',created_at:shift.created_at};
function fixture(t,{clock}={}){
 class Element{
  value='';hidden=false;disabled=false;textContent='';children=[];listeners=new Map();
  addEventListener(name,fn){this.listeners.set(name,fn);}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
  setAttribute(name,value){this[name]=value;}after(){}closest(){return this;}querySelector(){return this.button??=new Element();}
  reset(){for(const field of Object.values(this.elements??{}))field.value='';}
 }
 const elements=new Map(),get=id=>{if(!elements.has(id)){const element=new Element();element.id=id;elements.set(id,element);}return elements.get(id);};
 for(const [id,fields]of [
  ['care-shift-form',['patient','nurse','start','end']],['care-close-form',['actual_end','filled_by','status','location','note']],
  ['paper-log-form',['patient','nurse','day','status','location','note']],['paper-log-edit-form',['nurse','status','location','note']]
 ])get(id).elements=Object.fromEntries(fields.map(name=>[name,new Element()]));
 const originals=['document','Option','FormData'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:get,createElement:()=>new Element()}});
 Object.defineProperty(globalThis,'Option',{configurable:true,value:class{constructor(label,value){this.textContent=label;this.value=value;}}});
 Object.defineProperty(globalThis,'FormData',{configurable:true,value:class{constructor(form){this.values=Object.fromEntries(Object.entries(form.elements).map(([key,field])=>[key,field.value]));}get(key){return this.values[key]??null;}}});
 t.after(()=>{for(const [key,descriptor]of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];});
 const storage=new Map(),notices=[];
 const controller=createCareShifts({run:fn=>fn,status:(...message)=>notices.push(message),renderTable:(body,rows)=>body.replaceChildren(...rows),
  actionButton:(name,label,action)=>({name,label,action}),getScope:()=>['fixture-api','owner'],now:()=>clock?.value??'2026-11-21T09:00',
  getStorage:()=>({getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)})});
 const fill=(id,values)=>{for(const [key,value]of Object.entries(values))get(id).elements[key].value=value;};
 return {controller,get,fill,notices,submit:id=>get(id).listeners.get('submit')()};
}
const emptyClient={select:async()=>[],rpc:async()=>crypto.randomUUID()};

test('a passed scheduled end only reports closure pending and never confirms attendance or the paper log',async t=>{
 const {controller,get}=fixture(t);let writes=0;
 const client={select:async table=>table==='care_shifts'?[shift]:[],rpc:async()=>{writes++;}};
 await controller.load(client,'family-a',[patient],[nurse]);
 assert.equal(get('care-shifts').children[0][3].textContent,'Terminó el horario · cierre pendiente');
 assert.equal(get('care-shifts').children[0][4],'Sin confirmar');assert.equal(writes,0);
 assert.equal(careShiftState({...shift,closed_at:'2026-11-21T15:00:00Z'},'2026-11-21T09:00'),'Cerrado');
 assert.equal(careShiftState(shift,'2026-11-20T21:00'),'En horario');
 assert.equal(careShiftState(shift,'2026-11-20T19:00'),'Programado');
 assert.equal(validCareDateTime('2026-02-30T08:00'),false);
});

test('passing the scheduled end updates its visible state without writes or a page reload',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const clock={value:'2026-11-21T07:59'},{controller,get}=fixture(t,{clock});let writes=0;
 await controller.load({select:async table=>table==='care_shifts'?[shift]:[],rpc:async()=>{writes++;}},'family-a',[patient],[nurse]);
 const node=get('care-shifts').children[0][3];assert.equal(node.textContent,'En horario');
 clock.value='2026-11-21T08:00';t.mock.timers.tick(60000);
 assert.equal(node.textContent,'Terminó el horario · cierre pendiente');assert.equal(writes,0);
 controller.clear();
});

test('overnight scheduling requires explicit next date and preserves a durable retry after an uncertain response',async t=>{
 const {controller,get,fill,submit}=fixture(t);const calls=[];let lost=true;
 const client={...emptyClient,rpc:async(name,args)=>{calls.push({name,args});if(lost)throw Error('Respuesta perdida');return shift.id;}};
 await controller.load(client,'family-a',[patient],[nurse]);
 fill('care-shift-form',{patient:patient.id,nurse:nurse.id,start:'2026-11-20T20:00',end:'2026-11-20T08:00'});
 await assert.rejects(submit('care-shift-form'),/día siguiente/);assert.equal(calls.length,0);
 fill('care-shift-form',{end:'2026-11-21T08:00'});
 await assert.rejects(submit('care-shift-form'),/Respuesta perdida/);
 assert.equal(get('care-shift-form').elements.start.value,'2026-11-20T20:00');lost=false;await submit('care-shift-form');
 assert.equal(calls[0].args.request_id,calls[1].args.request_id);assert.equal(calls[1].name,'schedule_care_shift');
 assert.equal(get('care-shift-form').elements.start.value,'');
});

test('manual closure distinguishes who filled the paper from the signed-in recorder and never creates financial operations',async t=>{
 const {controller,get,fill,submit}=fixture(t);const calls=[];
 const client={select:async table=>table==='care_shifts'?[shift]:[],rpc:async(name,args)=>{calls.push({name,args});return shift.id;}};
 await controller.load(client,'family-a',[patient],[nurse]);
 await get('care-shifts').children[0][5].children[0].action();
 fill('care-close-form',{status:'completed'});await assert.rejects(submit('care-close-form'),/personal/);assert.equal(calls.length,0);
 fill('care-close-form',{filled_by:nurse.id,actual_end:'2026-11-21T08:15',location:'Carpeta del turno'});await submit('care-close-form');
 assert.equal(calls.length,1);assert.equal(calls[0].name,'close_care_shift');
 assert.equal(calls[0].args.filled_by,nurse.id);assert.equal(calls[0].args.log_completed,true);
 assert.equal('actor_id'in calls[0].args,false);assert.equal('cost_cents'in calls[0].args,false);
 assert.equal(get('care-close-panel').hidden,true);
});

test('paper log corrections keep their draft on revision conflict and archived or offline contexts cannot write',async t=>{
 const {controller,get,fill,submit,notices}=fixture(t);let writes=0;
 const client={select:async table=>table==='paper_care_logs'?[log]:[],rpc:async()=>{writes++;throw Object.assign(Error('revision changed'),{status:409});}};
 await controller.load(client,'family-a',[patient],[nurse]);await get('paper-logs').children[0][5].children[0].action();
 fill('paper-log-edit-form',{status:'completed',note:'Borrador ficticio'});
 await assert.rejects(submit('paper-log-edit-form'),/revision changed/);assert.equal(get('paper-log-edit-form').elements.note.value,'Borrador ficticio');assert.equal(notices.length,0);
 await controller.load({...client,readOnly:true},'family-a',[patient],[nurse]);
 await assert.rejects(submit('paper-log-edit-form'),/Reconecta/);assert.equal(writes,1);assert.equal(get('paper-logs').children[0][5].children.length,0);
 await controller.load(client,'family-a',[{...patient,archived_at:shift.created_at}],[nurse]);
 fill('paper-log-form',{patient:patient.id,day:'2026-11-21',status:'pending'});await assert.rejects(submit('paper-log-form'),/activa/);assert.equal(writes,1);
});

test('a former-family read and a stale row action cannot reveal or write into the new family',async t=>{
 const {controller,get}=fixture(t);let resolve;let writes=0;
 const oldClient={select:async table=>table==='care_shifts'?new Promise(r=>resolve=r):[],rpc:async()=>{writes++;return shift.id;}};
 const pending=controller.load(oldClient,'family-a',[patient],[nurse]);
 await controller.load(emptyClient,'family-b',[],[]);resolve([shift]);await pending;
 assert.deepEqual(get('care-shifts').children,[]);
 await controller.load({...oldClient,select:async table=>table==='care_shifts'?[shift]:[]},'family-a',[patient],[nurse]);
 const action=get('care-shifts').children[0][5].children[0].action;
 await controller.load(emptyClient,'family-b',[],[]);await assert.rejects(action(),/familia cambió/);assert.equal(writes,0);
});

test('refreshing unavailable staff preserves their chosen identifier rather than attributing a paper log to someone else',async t=>{
 const {controller,get,fill,submit}=fixture(t);let writes=0;
 const client={...emptyClient,rpc:async()=>{writes++;return log.id;}};
 await controller.load(client,'family-a',[patient],[nurse]);fill('paper-log-form',{patient:patient.id,nurse:nurse.id,day:'2026-11-21',status:'completed'});
 await controller.load(client,'family-a',[patient],[]);
 assert.equal(get('paper-log-form').elements.nurse.value,nurse.id);
 await assert.rejects(submit('paper-log-form'),/personal disponible/);assert.equal(writes,0);
});
