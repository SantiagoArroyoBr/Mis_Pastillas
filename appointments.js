// Lógica y presentación de citas médicas; las dependencias de estado y UI se inyectan.
(() => {
  function create({getState,form,save,render,query,escape,dates,getHomePatient,dialog}) {
    const S=new Proxy({}, {get:(_,key)=>getState()[key],set:(_,key,value)=>{getState()[key]=value;return true}});
    const $=query,esc=escape,{ymd,pd,fmtD}=dates,dlg=dialog;// ---------- CITAS MÉDICAS ----------
const apptList=()=>S.appts.filter(a=>S.p[a.i]).slice().sort((a,b)=>(a.d+(a.t||'99:99')).localeCompare(b.d+(b.t||'99:99')));
const apptWhen=a=>fmtD(a.d)+(a.t?' · '+a.t:'');
const patientLabel=(patient,index)=>S.p.filter(p=>p.name===patient.name).length>1?patient.name+' (Ficha '+(index+1)+')':patient.name;
function apptDue(){ // citas de hoy a 2 días
  const t0=new Date();t0.setHours(0,0,0,0);
  return apptList().map(a=>({a,k:Math.round((pd(a.d)-t0)/864e5)})).filter(x=>x.k>=0&&x.k<=2);
}
function apptCalUrl(a){
  const p=S.p[a.i],day=pd(a.d);
  const f2=x=>x.getFullYear()+String(x.getMonth()+1).padStart(2,'0')+String(x.getDate()).padStart(2,'0');
  let dates;
  if(a.t){
    const [h,mi]=a.t.split(':').map(Number);
    const s0=new Date(day.getFullYear(),day.getMonth(),day.getDate(),h,mi),e0=new Date(s0.getTime()+60*60e3);
    const g=x=>f2(x)+'T'+String(x.getHours()).padStart(2,'0')+String(x.getMinutes()).padStart(2,'0')+'00';
    dates=g(s0)+'/'+g(e0);
  }else{const nx=new Date(day);nx.setDate(nx.getDate()+1);dates=f2(day)+'/'+f2(nx)}
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent('Cita médica ('+p.name+')'+(a.w?': '+a.w:''))+'&dates='+dates+'&details='+encodeURIComponent(a.n||'');
}
function apptsCard(){
  const today=ymd(new Date());
  const all=apptList();
  const valid=all.filter(a=>window.AcompanaCompatibility.isValidDateOnly(a.d));
  const up=valid.filter(a=>a.d>=today),past=valid.filter(a=>a.d<today).slice(-3).reverse(),invalid=all.filter(a=>!window.AcompanaCompatibility.isValidDateOnly(a.d));
  const row=(a,cls)=>`<div class="vrow${cls}"><div>🩺 <b>${esc(S.p[a.i].name)}</b> · ${esc(apptWhen(a))}${a.w?'<br>'+esc(a.w):''}${a.n?'<br><span class="hint">'+esc(a.n)+'</span>':''}</div><div class="sidebtns"><button class="btn ghost small" data-pa="aedit" data-id="${esc(a.id)}">Editar</button>${Number.isFinite(pd(a.d).getTime())?`<a class="btn cal small" target="_blank" rel="noopener" href="${apptCalUrl(a)}">📅</a>`:''}</div></div>`;
  return `<article class="card blue">
    <div class="top"><h3 class="name">🩺 Citas médicas</h3></div>
    ${up.length?up.map(a=>row(a,'')).join(''):'<p class="hint">No hay citas próximas.</p>'}
    ${past.length?'<p class="info" style="margin-top:12px"><b>Recientes</b></p>'+past.map(a=>row(a,' past')).join(''):''}
    ${invalid.length?'<p class="info" style="margin-top:12px"><b>Fechas inválidas conservadas; revisa estas citas</b></p>'+invalid.map(a=>row(a,' past')).join(''):''}
    <button class="btn" style="margin-top:10px" data-pa="aadd">+ Agregar cita</button>
  </article>`;
}
function apptForm(a){
  const cur=a||null;
  const pi=cur?cur.i:Math.min(Math.max(getHomePatient(),0),S.p.length-1);
  form(cur?'Editar cita':'Agregar cita médica',[
    {id:'ap_p',l:'¿De quién es la cita?',t:'select',v:String(pi),options:S.p.map((patient,index)=>({v:String(index),l:patientLabel(patient,index)}))},
    {id:'ap_d',l:'Fecha',t:'date',v:cur?cur.d:ymd(new Date())},
    {id:'ap_t',l:'Hora (opcional)',t:'time',v:cur?cur.t:''},
    {id:'ap_w',l:'Médico o lugar',t:'text',ph:'Ej. Dr. Pérez, Hospital General',v:cur?cur.w:''},
    {id:'ap_n',l:'Qué preguntar o llevar (opcional)',t:'text',ph:'Ej. llevar estudios y recetas',v:cur?cur.n:''}
  ],v=>{
    const i=Number(v.ap_p);
    if(!Number.isInteger(i)||i<0||i>=S.p.length)return'Elige a una persona de la lista.';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.ap_d))return'Elige la fecha de la cita.';
    if(v.ap_t&&!/^\d{2}:\d{2}$/.test(v.ap_t))return'Revisa la hora.';
    const o={i,d:v.ap_d,t:v.ap_t||'',w:v.ap_w.trim().slice(0,80),n:v.ap_n.trim().slice(0,200)};
    if(cur)Object.assign(cur,o);
    else S.appts.push({id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),...o});
    save();render();
  },cur?'Guardar':'Agregar');
  if(cur)$('#ap_n').insertAdjacentHTML('afterend',`<button type="button" class="link" data-pa="adel" data-id="${esc(cur.id)}">Quitar esta cita</button>`);
}

    return Object.freeze({apptList,apptWhen,apptDue,apptCalUrl,apptsCard,apptForm});
  }
  window.AcompanaAppointments=Object.freeze({create});
})();
