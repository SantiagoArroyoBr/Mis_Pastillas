if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})});
}
const $=s=>document.querySelector(s);
const {parseTimes,at,dayMatches,schedText,evs,calc,fmt,num,consText,calUrl,ymd,pd,fmtD,money}=window.AcompanaDomain;

const {NPAL,NPALN,migrate,defaultState,validateStoredState,validateMigrationInput,assertMigrationIntegrity,prepareMigratedState,validateMigratedState}=window.AcompanaCompatibility;
const STORAGE_KEY='pastillas-v1';
const MAX_IMPORT_BYTES=10*1024*1024;
let persistenceReady=false;
let persistenceFailure='';
let lastPersistedRaw=null;
function showPersistenceWarning(){
  const box=document.getElementById('persistenceWarning');
  if(!box)return;
  box.hidden=false;
  box.innerHTML=persistenceFailure==='write'
    ?'<h2>No se pudieron guardar los cambios</h2><p>El almacenamiento rechazó la escritura. Las modificaciones normales permanecen bloqueadas. Puedes reintentar la recuperación con un respaldo JSON válido.</p>'
    :persistenceFailure==='conflict'
    ?'<h2>Los datos cambiaron en otra pestaña</h2><p>Para conservar la versión guardada más recientemente, no se guardarán cambios desde esta pestaña. Recarga para continuar con los datos actuales.</p><button type="button" class="btn" id="reloadFreshState">Recargar datos guardados</button>'
    :'<h2>Almacenamiento en modo protegido</h2><p>No fue posible leer, interpretar o validar los datos guardados. El contenido original de <code>pastillas-v1</code> no se ha sobrescrito. La vista actual es temporal y no se guardarán modificaciones.</p><p>Utiliza “Restaurar respaldo” para recuperar la aplicación con una copia JSON válida.</p>';
  const reload=box.querySelector('#reloadFreshState');if(reload)reload.onclick=()=>location.reload();
}

let S=(()=>{
  let raw;
  try{raw=localStorage.getItem(STORAGE_KEY);lastPersistedRaw=raw}
  catch(e){persistenceFailure='read';return defaultState()}
  if(raw===null){persistenceReady=true;return defaultState()}
  try{
    const parsed=JSON.parse(raw);
    const migrated=prepareMigratedState(parsed);
    persistenceReady=true;
    return migrated;
  }catch(e){
    persistenceFailure='load';
    return defaultState();
  }
})();

const save=()=>{
  if(!persistenceReady){showPersistenceWarning();return false}
  try{
    if(localStorage.getItem(STORAGE_KEY)!==lastPersistedRaw){persistenceReady=false;persistenceFailure='conflict';showPersistenceWarning();return false}
    const serialized=JSON.stringify(S);
    localStorage.setItem(STORAGE_KEY,serialized);
    lastPersistedRaw=serialized;
    return true;
  }catch(e){
    persistenceReady=false;
    persistenceFailure='write';
    showPersistenceWarning();
    return false;
  }
};

window.addEventListener('storage',e=>{
  if(e.key!==STORAGE_KEY||e.newValue===lastPersistedRaw)return;
  persistenceReady=false;persistenceFailure='conflict';showPersistenceWarning();
});

document.addEventListener('click',e=>{
  if(persistenceReady)return;
  // Únicamente se permite el flujo explícito de recuperación.
  if(e.target.closest('#imp')||e.target.closest('#impFile')||e.target.closest('#dlg')||e.target.closest('#reloadFreshState'))return;
  e.preventDefault();
  e.stopImmediatePropagation();
  showPersistenceWarning();
},true);
document.addEventListener('submit',e=>{
  if(persistenceReady||e.target.closest('#dlg'))return;
  e.preventDefault();
  e.stopImmediatePropagation();
  showPersistenceWarning();
},true);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LBL={green:['✓','Bien'],amber:['!','Comprar pronto'],red:['✕','Urgente']};

// ================= PAGOS E INICIO (solo recordatorios; no se paga desde la app) =================
// Se paga por adelantado un número de días que varía. Un día cuenta como día pagado cuando tiene un enfermero registrado.
// Cada paciente tiene su pago, su tipo de turno fijo (tiempo completo o medio tiempo), sus enfermeros (con color) y su calendario.
const WD_LONG=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const TIMES={full:'Tiempo completo',half:'Medio tiempo'};
const PLBL={green:['✓','Conteo al corriente'],amber:['!','Revisar cobertura'],red:['✕','Fechas sin cubrir'],gray:['–','Sin configurar']};
let showT=0,calM=0,homeP=-1;
const amtOn=()=>Date.now()<showT;
const A=n=>amtOn()?money(n):'••••';
const cfg=i=>S.pay.cfg[i]||(S.pay.cfg[i]={who:'',note:'',lead:2,base:'',pays:[],time:'full',rate:null});
const ents=(ds,i)=>{const a=(S.pay.v[ds]||{})[i];return Array.isArray(a)?a.filter(e=>e&&typeof e.n==='string'):[]};
const nurList=i=>S.pay.nurses[i]||[];
const nurColor=(i,n)=>{const x=nurList(i).find(y=>y.n===n);return x?x.c:'#8A8A8A'};
const nextColor=i=>{const used=new Set(nurList(i).map(x=>x.c));return NPAL.find(c=>!used.has(c))||NPAL[nurList(i).length%NPAL.length]};
const newLedgerId=prefix=>{if(!window.crypto||typeof window.crypto.randomUUID!=='function')throw new Error('Este navegador no permite crear identificadores seguros.');return prefix+'_'+window.crypto.randomUUID()};

const {cover,oweSummary,lastPay,pillEvents:pillEv,due:payDue,ledgerSummary,allocatePayment,toCents,generalSummary}=window.AcompanaPayments.create({getState:()=>S,config:cfg,entries:ents,calc,ymd});
const serviceRows=i=>Object.entries(S.pay.v).flatMap(([date,byPatient])=>(byPatient[i]||[]).filter(e=>e&&e.service&&e.service.id).map(e=>({...e.service,date,n:e.n,patientIndex:i})));
const allServiceRows=()=>S.p.flatMap((_,i)=>serviceRows(i));
const ledgerRows=()=>Array.isArray(S.pay.ledger)?S.pay.ledger:[];
const generalRows=()=>Array.isArray(S.pay.generalLedger)?S.pay.generalLedger:[];
const ledgerFor=i=>{const services=serviceRows(i),nurses=nurList(i);return nurses.filter(n=>n.id).map(n=>({n,summary:ledgerSummary(services,ledgerRows(),n.id)}))};
function payNotice(){
  if(generalSummary(allServiceRows(),generalRows()).balanceCents<=0)return'';
  return '<div class="soon"><h2>💵 Saldo general pendiente</h2><p>Los costos registrados de jornadas superan los abonos generales recibidos.</p><button class="btn ghost small" data-pa="gopay">Ver pagos</button></div>';
}

// ---------- INICIO ----------
function renderHome(){
  if(homeP<0||homeP>=S.p.length)homeP=Math.min(S.sel,S.p.length-1);
  const t0=new Date();t0.setHours(0,0,0,0);
  const t1=new Date(t0);t1.setDate(t1.getDate()+1);
  const rows=[];
  // pastillas por comprar
  const buys=[];
  S.p.forEach((p,i)=>p.meds.forEach(m=>{const c=calc(m);if(c.st!=='green')buys.push({p,i,m,c})}));
  buys.sort((a,b)=>a.c.buy-b.c.buy);
  buys.forEach(x=>rows.push({o:x.c.st==='red'?0:1,h:`<div class="vrow todo ${x.c.st}"><div>🛒 Comprar <b>${esc(x.m.name)}</b> (${esc(x.p.name)}): ${x.c.st==='red'?'urgente':'antes del '+fmt(x.c.buy)}</div><button class="btn ghost small tbtn" data-pa="gomed" data-i="${x.i}">Ver</button></div>`}));
  // El saldo administrativo se muestra de forma general, sin atribución a personas.
  if(generalSummary(allServiceRows(),generalRows()).balanceCents>0)rows.push({o:0,h:'<div class="vrow todo amber"><div>💵 Los costos registrados de jornadas superan los abonos generales recibidos.</div><button class="btn ghost small tbtn" data-pa="adminPay">Registrar abono</button></div>'});
  // citas médicas de hoy y de los próximos 2 días
  apptDue().forEach(x=>rows.push({o:x.k===0?0:1,h:`<div class="vrow todo ${x.k===0?'red':'amber'}"><div>🩺 Cita de <b>${esc(S.p[x.a.i].name)}</b>: ${x.k===0?'hoy':x.k===1?'mañana':'en 2 días'}${x.a.t?' · '+esc(x.a.t):''}${x.a.w?' — '+esc(x.a.w):''}</div><button class="btn ghost small tbtn" data-pa="aedit" data-id="${esc(x.a.id)}">Detalle</button></div>`}));
  // enfermeros de hoy y mañana (los domingos no se avisa que falta: es normal que no venga nadie)
  S.p.forEach((p,i)=>{
    if(!nurList(i).length)return;
    [[t0,'hoy'],[t1,'mañana']].forEach(([d,lab])=>{
      const ds=ymd(d),es=ents(ds,i);
      if(es.length){if(lab==='hoy')rows.push({o:3,h:`<div class="vrow todo ok"><div>🧑‍⚕️ Hoy atiende a <b>${esc(p.name)}</b>: ${es.map(e=>`<span class="dot" style="background:${nurColor(i,e.n)}"></span><b>${esc(e.n)}</b>`).join(', ')}</div></div>`})}
      else if(d.getDay()!==0)rows.push({o:lab==='hoy'?1:2,h:`<div class="vrow todo amber"><div>🧑‍⚕️ Falta asignar enfermero/a a <b>${esc(p.name)}</b> ${lab}</div><button class="btn ghost small tbtn" data-pa="day" data-i="${i}" data-d="${ds}">Asignar</button></div>`});
    });
  });
  rows.sort((a,b)=>a.o-b.o);
  const pend=rows.filter(r=>r.o<3).length;
  const todo=rows.length
    ? `<div class="soon${pend?'':' ok'}"><h2>${pend?'✅ Por hacer':'✓ Todo al día'}</h2>${rows.map(r=>r.h).join('')}${pend&&('Notification' in window&&Notification.permission==='default')?'<button class="btn ghost small" style="margin-top:8px" id="notif">🔔 Activar avisos en pantalla</button>':''}</div>`
    : '<div class="soon ok">✓ Todo al día: no hay pendientes.</div>';
  $('#homeView').innerHTML=todo+`<article class="card blue">
      <div class="top"><h3 class="name">🗓️ Calendario</h3></div>
      <div class="psels" role="group" aria-label="Elegir ficha">${S.p.map((p,i)=>`<button class="psel" aria-pressed="${i===homeP}" data-pa="hp" data-i="${i}">${esc(p.name)}</button>`).join('')}</div>
      ${calHTML(homeP)}
    </article>${apptsCard()}`;
}

function calHTML(i){
  const c=cfg(i),cv=cover(i);
  const first=new Date();first.setHours(0,0,0,0);first.setDate(1);first.setMonth(first.getMonth()+calM);
  const y=first.getFullYear(),m=first.getMonth();
  const dim=new Date(y,m+1,0).getDate();
  const lead=(first.getDay()+6)%7; // semana desde el lunes
  const t0=new Date();t0.setHours(0,0,0,0);const todayS=ymd(t0);
  const title=first.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const pe=pillEv(i);
  const apS=new Set(S.appts.filter(a=>a.i===i).map(a=>a.d));
  const unS=new Set(cv.unpaidDue);
  let cells=['L','M','M','J','V','S','D'].map(x=>`<div class="wh">${x}</div>`).join('');
  for(let k=0;k<lead;k++)cells+='<div></div>';
  for(let dn=1;dn<=dim;dn++){
    const d=new Date(y,m,dn),ds=ymd(d),es=ents(ds,i),ev=pe[ds];
    const coveredLegacy=cv.covered.has(ds),firstUnp=unS.has(ds);
    const hasA=apS.has(ds);
    const mk=[coveredLegacy?'✓':'',firstUnp?'💵':'',ev&&ev.buy.length?'🛒':'',ev&&ev.end.length?'⚠️':'',hasA?'🩺':''].join('');
    const chips=es.slice(0,3).map(e=>`<span class="chip" style="background:${nurColor(i,e.n)}">${esc(e.n)}</span>`).join('')+(es.length>3?`<span class="hint">+${es.length-3}</span>`:'');
    const notes=[coveredLegacy?'cubierta según conteo anterior':'',firstUnp?'sin cubrir según conteo anterior':'',ev&&ev.buy.length?'comprar medicinas o insumos':'',ev&&ev.end.length?'se acaban medicinas o insumos':'',hasA?'cita médica':''].filter(Boolean);
    const lab=dn+' de '+title+(notes.length?' ('+notes.join(', ')+')':'')+(es.length?': '+es.map(e=>e.n).join(', '):'');
    cells+=`<button class="cell${ds===todayS?' today':''}${coveredLegacy?' paid':''}${ev&&ev.end.length?' end':ev&&ev.buy.length?' buy':''}" data-pa="day" data-i="${i}" data-d="${ds}" aria-label="${esc(lab)}"><span class="dn">${dn}</span>${mk?`<span class="mk">${mk}</span>`:''}${chips}</button>`;
  }
  return `<div class="calhead"><button class="btn ghost small" data-pa="cm" data-s="-1" aria-label="Mes anterior"${calM<=-12?' disabled':''}>◀</button><b>${title}</b><button class="btn ghost small" data-pa="cm" data-s="1" aria-label="Mes siguiente"${calM>=6?' disabled':''}>▶</button></div>
    <div class="calgrid">${cells}</div>
    <p class="hint">✓ fecha cubierta según el conteo anterior · 💵 fecha asignada aún no cubierta en ese conteo (no es un adeudo monetario) · 🛒 reponer · ⚠️ se acaba · 🩺 cita médica. Los colores identifican enfermeros; las modalidades y tarifas se configuran en Pagos.</p>`;
}

// ---------- PAGOS (una tarjeta por paciente) ----------
function payAction(t){
  const pa=t.dataset.pa,i=+t.dataset.i,ds=t.dataset.d;
  if(pa==='prm'){
    const m=S.p[i]&&S.p[i].meds[+t.dataset.m];
    if(m&&Array.isArray(m.buys)){m.buys.splice(+t.dataset.k,1);if(!m.buys.length)delete m.buys;save();render();setTimeout(()=>priceForm(i,+t.dataset.m),30)}
  }
  else if(pa==='aadd')apptForm(null);
  else if(pa==='aedit'){const a=S.appts.find(x=>x.id===t.dataset.id);if(a)apptForm(a)}
  else if(pa==='adel'){
    const a=S.appts.find(x=>x.id===t.dataset.id);if(!a)return;
    form('¿Quitar esta cita?',[],()=>{S.appts=S.appts.filter(x=>x.id!==a.id);save();render()},'Sí, quitar');
  }
  else if(pa==='gopay'){S.mode='pay';save();render();window.scrollTo(0,0)}
  else if(pa==='gomed'){S.mode='meds';S.sel=Math.min(i,S.p.length-1);save();render();window.scrollTo(0,0)}
  else if(pa==='hp'){homeP=i;render()}
  else if(pa==='cfg')payForm(i);
  else if(pa==='payreg')payRegForm(i);
  else if(pa==='ipay')individualPayForm(i);
  else if(pa==='adminPay')generalPayForm();
  else if(pa==='adminCancel')cancelGeneralPayForm(t.dataset.id);
  else if(pa==='creset')resetForm(i);
  else if(pa==='pdel'){
    const k=+t.dataset.k;if(!cfg(i).pays[k])return;
    form('¿Quitar este pago del historial?',[],()=>{cfg(i).pays.splice(k,1);save();render()},'Sí, quitar');
  }
  else if(pa==='show'){
    if(amtOn())showT=0;
    else{showT=Date.now()+8000;setTimeout(()=>{if(Date.now()>=showT-50){showT=0;render()}},8100)}
    render();
  }
  else if(pa==='cm'){calM=Math.max(-12,Math.min(6,calM+(+t.dataset.s)));render()}
  else if(pa==='day')dayForm(i,ds);
  else if(pa==='nadd')nurseForm(i);
  else if(pa==='nedit')nurseForm(i,+t.dataset.k);
  else if(pa==='nrm'){
    const nm=nurList(i)[+t.dataset.k];if(!nm)return;
    if(nm.id&&serviceRows(i).some(s=>s.nurseId===nm.id)){form('No se puede quitar este enfermero/a',[],()=>{},'Entendido');dlg.querySelector('h2').insertAdjacentHTML('afterend','<p>La persona tiene servicios nuevos asociados. Conserva su identificador para mantener costos y pagos históricos íntegros.</p>');return}
    form('¿Quitar a '+esc(nm.n)+' de la lista?',[],()=>{nurList(i).splice(+t.dataset.k,1);save();render()},'Sí, quitar');
  }
  else if(pa==='ren')renForm(i);
  else if(pa==='rm'){
    const a=S.pay.v[ds]&&S.pay.v[ds][i];
    if(Array.isArray(a)){
      const service=a[+t.dataset.k]&&a[+t.dataset.k].service;
      if(service&&ledgerRows().some(m=>m.allocations&&m.allocations.some(x=>x.serviceId===service.id))){form('Servicio con pagos aplicados',[],()=>{},'Entendido');dlg.querySelector('h2').insertAdjacentHTML('afterend','<p>No se puede quitar un servicio que ya tiene abonos aplicados. Mantén el registro para conservar la conciliación.</p>');return}
      if(service&&generalSummary(allServiceRows(),generalRows()).receivedCents>0){form('Servicio con abonos generales activos',[],()=>{},'Entendido');dlg.querySelector('h2').insertAdjacentHTML('afterend','<p>El abono general no se asigna a una jornada concreta. Para conservar el saldo trazable no se puede quitar un servicio mientras existan abonos generales activos.</p>');return}
      a.splice(+t.dataset.k,1);
      if(!a.length)delete S.pay.v[ds][i];
      if(!Object.keys(S.pay.v[ds]).length)delete S.pay.v[ds];
      save();render();setTimeout(()=>dayForm(i,ds),30);
    }
  }
}

function summaryText(P){
  if(!P.meds.length)return'No hay medicinas registradas.';
  return P.meds.map(m=>{
    const c=calc(m);
    const when=c.st==='red'?'¡urgente, comprar ya!':c.st==='amber'?'comprar antes del '+fmt(c.buy):'bien por ahora';
    return `• ${m.name}: quedan ${num(c.rem)} ${un(m)} (${when})`;
  }).join('\n');
}

// Aviso del navegador diario y genérico, si está autorizado. Sin nombres ni montos.
function notifyDaily(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const k=new Date().toDateString();
  if(S.last===k)return;
  const parts=[];
  if(S.p.some(p=>p.meds.some(m=>calc(m).st!=='green')))parts.push('Hay pendientes de reposición.');
  if(generalSummary(allServiceRows(),generalRows()).balanceCents>0)parts.push('Hay un importe pendiente en el saldo general con la administradora.');
  if(apptDue().length)parts.push('Hay citas próximas.');
  if(!parts.length)return;
  S.last=k;save();
  try{new Notification('Cuidados',{body:parts.join(' · ')})}catch(e){}
}

function render(){
  if(!persistenceReady)showPersistenceWarning();
  const P=S.p[S.sel];
  const md=S.mode;
  notifyDaily();
  $('#modes').setAttribute('role','group');$('#modes').setAttribute('aria-label','Sección de la aplicación');
  $('#modes').innerHTML=[['home','🏠 Inicio'],['meds','💊 Medicinas'],['pay','💵 Pagos']].map(([m,l])=>`<button class="mbtn" aria-pressed="${md===m}" data-m="${m}">${l}</button>`).join('');
  $('#tabs').hidden=md!=='meds';$('#ren').hidden=md!=='meds';$('#medsView').hidden=md!=='meds';
  $('#homeView').hidden=md!=='home';$('#payView').hidden=md!=='pay';
  if(md==='pay'){$('#paysoon').innerHTML='';renderPay();return}
  if(md==='home'){$('#paysoon').innerHTML='';renderHome();return}
  $('#paysoon').innerHTML=payNotice();
  $('#tabs').innerHTML=S.p.map((p,i)=>`<button class="tab" aria-pressed="${i===S.sel}" data-i="${i}">${esc(p.name)}</button>`).join('');
  const items=[];
  S.p.forEach(p=>p.meds.forEach(m=>{const c=calc(m);if(c.st!=='green')items.push({p:p.name,m,c})}));
  items.sort((a,b)=>a.c.buy-b.c.buy);
  let h;
  if(!items.length){h=`<div class="soon ok">✓ Todo en orden: por ahora no hay que comprar nada.</div>`}
  else{
    const det=items.map(i=>`${i.m.name} (${i.p}): quedan ${num(i.c.rem)} ${un(i.m)}`).join('\n');
    h=`<div class="soon"><h2>🛒 Comprar pronto</h2><ul>${items.map(i=>`<li><b>${esc(i.m.name)}</b> (${esc(i.p)}): ${i.c.st==='red'?'urgente':'antes del '+fmt(i.c.buy)}</li>`).join('')}</ul>
    <a class="btn cal" target="_blank" rel="noopener" href="${calUrl('Comprar medicinas',items[0].c.buy,det)}">📅 Avisarme en Calendario</a>
    ${('Notification' in window&&Notification.permission==='default')?'<button class="btn ghost small" style="margin-top:8px" id="notif">🔔 Activar avisos en pantalla</button>':''}</div>`;
  }
  $('#soon').innerHTML=h;
  $('#spend').innerHTML=spendHTML();
  $('#list').innerHTML=P.meds.length?P.meds.map((m,i)=>({m,i})).sort((a,b)=>(a.m.kind==='sup')-(b.m.kind==='sup')).map(({m,i})=>{
    const c=calc(m),[ic,tx]=LBL[c.st];
    return `<article class="card ${c.st}">
      <div class="top"><h3 class="name">${m.kind==='sup'?'🧴 ':''}${esc(m.name)}</h3><span class="badge">${ic} ${tx}</span></div>
      <p class="big">${num(c.rem)} <small>${un(m)}</small></p>
      ${m.kind==='sup'?'':`<p class="hint" role="note">Este saldo pertenece a un solo inventario compartido por ${m.cons.length} ${m.cons.length===1?'pauta de consumo':'pautas de consumo'}. El saldo y el aviso de reposición consideran todas las pautas.</p>`}
      <p class="info">Alcanzan para <b>${c.days} ${c.days===1?'día':'días'}</b>${m.kind==='sup'?'':` (${c.left} tomas)`}.${c.end?`<br>${m.kind==='sup'?'Alcanza hasta el':'Última toma completa:'} <b>${fmt(c.end)}</b>.`:'<br><b>Ya no alcanza para '+(m.kind==='sup'?'un día de uso':'una toma')+'.</b>'}<br>Comprar: <b>${c.now?'hoy':'antes del '+fmt(c.buy)}</b>.<br><br>${consText(m)}</p>
      ${priceLine(m)}
      <button class="btn" data-a="box" data-i="${i}">Compré más</button>
      <div class="row"><button class="btn ghost small" data-a="edit" data-i="${i}">Editar</button>
      <button class="btn ghost small" data-a="fix" data-i="${i}">Corregir cantidad</button></div>
      <button class="btn ghost small" style="margin-top:8px" data-a="price" data-i="${i}">💲 Precios</button>
      <a class="btn cal small" target="_blank" rel="noopener" href="${calUrl('Comprar '+m.name+' (aprox.)',c.buy,'Quedan '+num(c.rem)+' '+un(m)+' de '+m.name+' ('+P.name+').')}">📅 Avisarme</a>
      <button class="link" data-a="del" data-i="${i}">${m.kind==='sup'?'Borrar este insumo':'Borrar esta medicina'}</button>
    </article>`}).join(''):`<p class="empty">Aún no hay medicinas para ${esc(P.name)}.<br>Toca “Agregar medicina”.</p>`;
}

const dlg=$('#dlg');
const externalPreview=window.AcompanaSharing.create({
  dialog:dlg,
  query:$,
  escape:esc,
  openWindow:url=>window.open(url,'_blank','noopener')
});
dlg.addEventListener('click',e=>{
  const b=e.target.closest('.pbtn');if(!b)return;
  const inp=document.getElementById(b.dataset.set);if(!inp)return;
  inp.value=b.dataset.val;
  [...document.querySelectorAll('.pbtn[data-set="'+b.dataset.set+'"]')].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
});

const form=window.AcompanaForms.create({dialog:dlg,query:$,escape:esc,parseTimes,weekDays:window.AcompanaDomain.WD_SHORT,palette:NPAL,paletteNames:NPALN});
const {apptList,apptWhen,apptDue,apptCalUrl,apptsCard,apptForm}=window.AcompanaAppointments.create({getState:()=>S,form,save,render,query:$,escape:esc,dates:window.AcompanaDomain,getHomePatient:()=>homeP,dialog:dlg});
const un=m=>(m&&m.kind==='sup')?'piezas':'pastillas';
const {supCons,supAdd,supEdit,unit1,addBuy,buyList,unitPrice,usage30,monthCost,bestShop,shopPresets,priceLine,spendHTML,priceForm,result,pos,PRE,newCons,medForm}=window.AcompanaInventory.create({getState:()=>S,save,render,form,query:$,escape:esc,dates:window.AcompanaDomain,calc,events:evs,parseTimes,calendarUrl:calUrl,amount:A,amountVisible:amtOn,unit:un,dialog:dlg});
const {patientHTML,renderPay,payForm,payRegForm,individualPayForm,generalPayForm,cancelGeneralPayForm,resetForm,nurseForm,renForm,dayForm}=window.AcompanaCareUI.create({getState:()=>S,query:$,escape:esc,dates:window.AcompanaDomain,save,render,form,dialog:dlg,config:cfg,entries:ents,nurses:nurList,nurseColor:nurColor,nextColor,cover,oweSummary,lastPay,pillEvents:pillEv,due:payDue,calc,formatDate:fmt,number:num,money,amount:A,amountVisible:amtOn,unit:un,palette:NPAL,paletteNames:NPALN,labels:PLBL,shiftNames:TIMES,longWeekdays:WD_LONG,services:serviceRows,allServices:allServiceRows,ledger:ledgerRows,generalLedger:generalRows,ledgerSummary,allocatePayment,generalSummary,toCents,newId:newLedgerId});

document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  const P=S.p[S.sel];
  if(t.classList.contains('tab')){S.sel=+t.dataset.i;save();render()}
  else if(t.classList.contains('mbtn')){S.mode=['home','meds','pay'].includes(t.dataset.m)?t.dataset.m:'home';save();render();window.scrollTo(0,0)}
  else if(t.id==='notif'){Notification.requestPermission().then(render)}
  else if(t.id==='ren'){form('Nombre de la persona',[{id:'n',l:'Nombre',t:'text',v:P.name}],v=>{if(!v.n.trim())return'Escribe un nombre.';P.name=v.n.trim();save();render()})}
  else if(t.id==='share'){
    const txt='Resumen de medicinas de '+P.name+':\n\n'+summaryText(P);
    externalPreview('Compartir resumen por WhatsApp','https://wa.me/',{text:txt,kind:'whatsapp'});
  }
  else if(t.id==='exp'){
    try{
      const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='cuidados-respaldo-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      setBackupStatus('Descarga iniciada. Es una copia privada; los datos de esta instalación siguen guardados.');
    }catch(err){setBackupStatus('El navegador no pudo preparar la descarga. Tus datos guardados no se modificaron.');}
  }
  else if(t.id==='imp'){$('#impFile').click()}
  else if(t.id==='add'){
    medForm('Agregar medicina',{name:'',q:'',cons:[newCons()]},(name,q,cons)=>{
      P.meds.push({name,base:q,cons,t0:Date.now()});save();render();
    },'Agregar');
  }
  else if(t.id==='addsup'){supAdd(P)}
  else if(t.dataset.pa){payAction(t)}
  else if(t.dataset.a){
    const m=P.meds[+t.dataset.i];
    if(t.dataset.a==='box'){
      form('Compré: '+esc(m.name),[
        {id:'boxes',l:'¿Cuántas cajas/empaques compraste?',v:'1'},
        {id:'q',l:'¿Cuántas '+un(m)+' trae cada una?',ph:'Ej. 30'},
        {id:'pcost',l:'¿Cuánto costó en total? (opcional)',ph:'Ej. 180',h:'Queda oculto en pantalla.'},
        {id:'pshop',l:'¿Dónde la compraste? (opcional)',t:'text',ph:'Ej. Farmacia del Ahorro',presets:shopPresets()}
      ],v=>{
        const boxes=pos(v.boxes),q=pos(v.q);
        if(!(boxes>0))return'Escribe cuántas cajas compraste.';
        if(!(q>0))return'Escribe cuántas '+un(m)+' trae cada caja.';
        let pr=null;
        if(String(v.pcost).trim()!==''){pr=pos(v.pcost);if(!(pr>=0))return'El costo debe ser un número (o déjalo vacío).'}
        const c=calc(m);m.base=c.rem+boxes*q;m.t0=Date.now();
        if(pr!==null)addBuy(m,pr,boxes*q,v.pshop);
        save();render();setTimeout(()=>result(m),50);
      },'Sumar '+un(m));
    }else if(t.dataset.a==='edit'&&m.kind==='sup'){supEdit(m)}else if(t.dataset.a==='edit'){
      const c=calc(m);
      medForm('Editar: '+esc(m.name),{name:m.name,q:c.rem,cons:JSON.parse(JSON.stringify(m.cons))},(name,q,cons)=>{
        m.name=name;m.base=q;m.cons=cons;m.t0=Date.now();save();render();
      },'Guardar cambios');
    }else if(t.dataset.a==='fix'){
      form('Corregir cantidad: '+esc(m.name),[{id:'q',l:'Cuente las '+un(m)+' que hay y escriba el número',v:calc(m).rem}],v=>{
        const q=pos(v.q);if(!(q>=0)||v.q==='')return'Escribe un número.';
        m.base=q;m.t0=Date.now();save();render();setTimeout(()=>result(m),50);
      },'Corregir');
    }else if(t.dataset.a==='price'){priceForm(S.sel,+t.dataset.i)}else if(t.dataset.a==='del'){
      form('¿Borrar '+esc(m.name)+'?',[],()=>{P.meds.splice(+t.dataset.i,1);save();render()},'Sí, borrar');
    }
  }
});

function importMessage(title,message){
  dlg.innerHTML='<h2>'+title+'</h2><p>'+message+'</p><div class="stack"><button type="button" class="btn ghost" id="closeImportMessage">Cerrar</button></div>';
  $('#closeImportMessage').onclick=()=>dlg.close();
  if(!dlg.open)dlg.showModal();
}

function setBackupStatus(message){
  const status=$('#backupStatus');
  if(status){status.textContent=message;status.hidden=false;}
}

function confirmRestore(candidate){
  const meds=candidate.p.reduce((n,p)=>n+p.meds.length,0);
  const appts=candidate.appts.length;
  const nurses=(candidate.pay.nurses||[]).reduce((n,list)=>n+list.length,0);
  const rawDate=candidate.exportedAt;
  const datePart=typeof rawDate==='string'&&rawDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const dateValid=Boolean(datePart&&new Date(datePart+'T00:00:00Z').toISOString().slice(0,10)===datePart);
  const timestampValid=typeof rawDate==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(rawDate)&&Number.isFinite(Date.parse(rawDate));
  const backupDate=dateValid&&(rawDate===datePart||timestampValid)
    ?rawDate===datePart?rawDate:new Date(rawDate).toLocaleString('es-MX'):'no incluida o no válida';
  dlg.innerHTML='<h2>Revisa el respaldo</h2><p>Fecha: '+esc(backupDate)+'.</p><ul><li>'+candidate.p.length+' '+(candidate.p.length===1?'persona':'personas')+'</li><li>'+meds+' medicinas o insumos</li><li>'+appts+' citas</li><li>'+nurses+' enfermeros registrados</li></ul><p>Al restaurar se reemplazarán los datos actuales de esta instalación. Se recomienda descargar una copia actual antes de continuar. Cancelar deja los datos actuales sin cambios.</p><div class="stack"><button type="button" class="btn ghost" id="exportBeforeRestore" '+(persistenceReady?'':'disabled')+'>Exportar datos actuales</button><button type="button" class="btn" id="continueRestore">Continuar</button><button type="button" class="btn ghost" id="cancelRestore">Cancelar</button></div>';
  $('#cancelRestore').onclick=()=>{dlg.close();setBackupStatus('Restauración cancelada. Los datos actuales no se modificaron.');};
  $('#exportBeforeRestore').onclick=()=>document.querySelector('#exp').click();
  $('#continueRestore').onclick=()=>showRestoreConfirmation(candidate);
  if(!dlg.open)dlg.showModal();
}

function showRestoreConfirmation(candidate){
  dlg.innerHTML='<h2>¿Reemplazar los datos locales?</h2><p>Se reemplazará la información local de esta instalación por el respaldo revisado. La copia descargada no cambia. Confirma solo si deseas sustituir los datos actuales.</p><div class="stack"><button type="button" class="btn" id="restoreConfirm">Sí, restaurar y reemplazar todo</button><button type="button" class="btn ghost" id="cancelRestore">Cancelar</button></div>';
  $('#cancelRestore').onclick=()=>{dlg.close();setBackupStatus('Restauración cancelada. Los datos actuales no se modificaron.');};
  $('#restoreConfirm').onclick=()=>{
    let serialized;
    try{
      if(persistenceFailure!=='read'&&persistenceFailure!=='load'&&localStorage.getItem(STORAGE_KEY)!==lastPersistedRaw){persistenceReady=false;persistenceFailure='conflict';dlg.close();showPersistenceWarning();setBackupStatus('Los datos cambiaron en otra pestaña. Recarga y revisa el respaldo antes de volver a restaurarlo.');return}
      serialized=JSON.stringify(candidate);
      localStorage.setItem(STORAGE_KEY,serialized);
    }catch(err){
      dlg.close();
      persistenceReady=false;
      persistenceFailure='write';
      showPersistenceWarning();
      setBackupStatus('El navegador no pudo guardar el respaldo restaurado. El estado anterior se conserva; revisa el aviso de almacenamiento.');
      return;
    }
    // El estado en memoria solo cambia después de confirmar la escritura.
    S=candidate;
    lastPersistedRaw=serialized;
    persistenceReady=true;
    persistenceFailure='';
    dlg.close();
    render();
    setBackupStatus('Restauración completada. Los datos del respaldo ya están guardados en esta instalación.');
  };
  if(!dlg.open)dlg.showModal();
}

$('#impFile').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  setBackupStatus('Archivo seleccionado. Se comprobará antes de cualquier cambio en los datos actuales.');
  if(file.size>MAX_IMPORT_BYTES){
    e.target.value='';
    importMessage('Respaldo demasiado grande','El archivo supera el límite de 10 MiB. No se leyó ni se modificó la información guardada.');
    return;
  }
  const reader=new FileReader();
  reader.onload=()=>{
    let candidate;
    try{
      candidate=prepareMigratedState(JSON.parse(reader.result));
    }catch(err){
      importMessage('Archivo no válido','El respaldo no superó la validación de estructura e integridad. No se modificó el almacenamiento actual.');
      return;
    }
    setBackupStatus('Archivo validado. Revisa su contenido; los datos actuales siguen sin cambios.');
    confirmRestore(candidate);
  };
  reader.onerror=()=>importMessage('No se pudo leer el archivo','El navegador no pudo leer el archivo seleccionado. No se modificó el almacenamiento actual.');
  try{reader.readAsText(file)}
  catch(err){importMessage('No se pudo leer el archivo','El navegador rechazó la lectura del archivo. No se modificó el almacenamiento actual.')}
  e.target.value='';
});

render();
setInterval(()=>{if(!dlg.open)render()},60000);
