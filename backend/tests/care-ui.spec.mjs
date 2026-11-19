import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCareCoordination, careAccountLabel } from '../care-coordination.mjs';

function fixture(t) {
  class Element {
    value=''; hidden=false; disabled=false; textContent=''; children=[]; listeners=new Map();
    addEventListener(type,fn){this.listeners.set(type,fn);}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(name,value){this[name]=value;}
    after(){}
    closest(){return this;}
    querySelector(){return this.button??=new Element();}
    reset(){for(const field of Object.values(this.elements??{}))field.value='';}
  }
  const ids=new Map(),get=id=>{if(!ids.has(id)){const el=new Element();el.id=id;ids.set(id,el);}return ids.get(id);};
  for(const [id,fields] of [['care-task-form',['patient','title','details','day','assignee']],['care-note-form',['patient','body']]]){
    get(id).elements=Object.fromEntries(fields.map(name=>[name,new Element()]));
  }
  const originals=Object.fromEntries(['document','Option','FormData'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:get,createElement:()=>new Element()}});
  Object.defineProperty(globalThis,'Option',{configurable:true,value:class{constructor(label,value){this.textContent=label;this.value=value;}}});
  Object.defineProperty(globalThis,'FormData',{configurable:true,value:class{constructor(form){this.values=Object.fromEntries(Object.entries(form.elements).map(([name,field])=>[name,field.value]));}get(name){return this.values[name];}}});
  t.after(()=>{for(const [name,original] of Object.entries(originals))original?Object.defineProperty(globalThis,name,original):delete globalThis[name];});
  const storage=new Map(),notices=[],rendered=[];
  const controller=createCareCoordination({run:fn=>fn,status:(...message)=>notices.push(message),
    renderTable:(body,rows)=>{body.replaceChildren(...rows);rendered.push({id:body.id,rows});},
    actionButton:(name,label,action)=>({name,label,action}),getScope:()=>['fixture-api','owner'],
    getStorage:()=>({getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)})});
  const fill=(id,values)=>{for(const [name,value]of Object.entries(values))get(id).elements[name].value=value;};
  const submit=id=>get(id).listeners.get('submit')();
  return {controller,get,fill,submit,notices,rendered};
}
const patient={id:'patient-a',name:'Ficha ficticia',archived_at:null};
const task={id:'task-a',family_id:'family-a',patient_id:patient.id,title:'Pendiente ficticio',details:'',due_on:null,
  assignee_id:null,completed_at:null,revision:1,actor_id:'owner',created_at:'2026-11-19T10:00:00Z'};
const emptyClient={select:async()=>[],rpc:async()=>crypto.randomUUID()};

test('lost creation replies keep the draft and reuse their request ID; confirmed writes then reset it',async t=>{
  const {controller,get,fill,submit,notices}=fixture(t);const requests=[];let fail=true;
  const client={...emptyClient,rpc:async(name,args)=>{requests.push({name,args});if(fail)throw Object.assign(Error('network'),{network:true});return '11111111-1111-4111-8111-111111111111';}};
  await controller.load(client,'family-a',[patient]);
  fill('care-task-form',{title:'Comprar insumos',details:'Detalle ficticio',patient:patient.id});
  await assert.rejects(submit('care-task-form'),/network/);
  assert.equal(get('care-task-form').elements.title.value,'Comprar insumos');fail=false;
  await submit('care-task-form');
  assert.equal(requests[0].args.request_id,requests[1].args.request_id);
  assert.equal(get('care-task-form').elements.title.value,'');
  assert.equal(notices.at(-1)[0],'Pendiente registrado.');
});

test('a family change discards a delayed old-family response without rendering its private notes',async t=>{
  const {controller,get}=fixture(t);let finish;
  const previous=controller.load({select:async(table)=>table==='care_tasks'?new Promise(resolve=>{finish=resolve;}):[
    {id:'note-a',patient_id:patient.id,body:'Private previous note',actor_id:'owner',created_at:task.created_at}]
  },'family-a',[patient]);
  await controller.load(emptyClient,'family-b',[]);
  finish([task]);await previous;
  assert.deepEqual(get('care-notes').children,[]);
  assert.deepEqual(get('care-tasks').children,[]);
});

test('offline mode blocks both creation handlers and removes completion actions; archived notes remain readable',async t=>{
  const {controller,get,fill,submit}=fixture(t);let writes=0;
  const client={readOnly:true,select:async table=>table==='care_tasks'?[task]:[
    {id:'note-a',patient_id:patient.id,body:'Nota histórica',actor_id:'owner',created_at:task.created_at}],rpc:async()=>{writes++;}};
  await controller.load(client,'family-a',[{...patient,archived_at:task.created_at}]);
  fill('care-task-form',{title:'No debe guardar'});fill('care-note-form',{patient:patient.id,body:'No debe guardar'});
  await assert.rejects(submit('care-task-form'),/Reconecta/);
  await assert.rejects(submit('care-note-form'),/Reconecta/);
  assert.equal(writes,0);assert.equal(get('care-note-form').querySelector('button').disabled,true);
  assert.equal(get('care-tasks').children[0][5].children.length,0);
  assert.equal(get('care-notes').children[0][2],'Nota histórica');
  assert.match(get('care-notes').children[0][1],/archivada/);
});

test('completion conflicts preserve creation drafts and do not announce a successful update',async t=>{
  const {controller,get,fill,notices}=fixture(t);
  const client={select:async table=>table==='care_tasks'?[task]:[],rpc:async()=>{throw Object.assign(Error('changed'),{status:409});}};
  await controller.load(client,'family-a',[patient]);fill('care-task-form',{title:'Otro pendiente sin guardar'});
  const action=get('care-tasks').children[0][5].children[0];
  await assert.rejects(action.action(),{status:409});
  assert.equal(get('care-task-form').elements.title.value,'Otro pendiente sin guardar');
  assert.deepEqual(notices,[]);
});

test('caregiver assignment options use only supplied visible memberships and labels stay plain values',async t=>{
  const {controller,get}=fixture(t);
  await controller.load(emptyClient,'family-a',[patient],[{user_id:'owner',label:'Mi cuenta'},
    {user_id:'revoked',revoked_at:task.created_at,label:'No disponible'}]);
  assert.deepEqual(get('care-task-form').elements.assignee.children.map(option=>option.value),['','owner']);
  assert.equal(careAccountLabel('owner',[],'owner'),'Mi cuenta');
  assert.equal(careAccountLabel('12345678-more-private-id'),'Cuenta · 12345678');
  assert.equal(careAccountLabel('member',[{user_id:'member',label:'<img src=x>'}]),'<img src=x>');
});

test('refreshing archived patients and revoked assignees preserves draft destinations until explicit reselection',async t=>{
  const {controller,get,fill,submit}=fixture(t);let writes=0;
  const client={...emptyClient,rpc:async()=>{writes++;return crypto.randomUUID();}};
  const other={id:'patient-b',name:'Otra ficha',archived_at:null};
  const member={user_id:'member-a',label:'Persona ficticia'};
  await controller.load(client,'family-a',[patient,other],[member]);
  fill('care-task-form',{title:'Pendiente para A',patient:patient.id,assignee:member.user_id});
  fill('care-note-form',{patient:patient.id,body:'Nota para A'});
  await controller.load(client,'family-a',[{...patient,archived_at:task.created_at},other],
    [{...member,revoked_at:task.created_at},{user_id:'member-b',label:'Otra persona'}]);
  for(const id of ['care-task-form','care-note-form']){
    const select=get(id).elements.patient;
    assert.equal(select.value,patient.id);
    assert.match(select.children.find(option=>option.value===patient.id).textContent,/archivada.*Elige otra opción/);
  }
  assert.equal(get('care-task-form').elements.assignee.value,member.user_id);
  assert.match(get('care-task-form').elements.assignee.children.find(option=>option.value===member.user_id).textContent,/no disponible/);
  assert.equal(get('care-task-form').elements.title.value,'Pendiente para A');
  assert.equal(get('care-note-form').elements.body.value,'Nota para A');
  await assert.rejects(submit('care-task-form'),/ficha seleccionada ya no está activa/);
  await assert.rejects(submit('care-note-form'),/ficha seleccionada ya no está activa/);
  fill('care-task-form',{patient:other.id});
  await assert.rejects(submit('care-task-form'),/responsable seleccionado ya no está disponible/);
  assert.equal(writes,0);
  fill('care-task-form',{assignee:''});await submit('care-task-form');
  assert.equal(writes,1);
});
