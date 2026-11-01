// Presentación y formularios del área Pagos/calendario de cuidados.
(() => {
  function create({getState,query,escape,dates,save,render,form,dialog,config,entries,nurses,nurseColor,nextColor,cover,oweSummary,lastPay,pillEvents,due,calc,formatDate,number,money,amount,amountVisible,unit,palette,paletteNames,labels,shiftNames,longWeekdays,services,ledger,ledgerSummary,allocatePayment,toCents,newId}) {
    const S=new Proxy({}, {get:(_,key)=>getState()[key],set:(_,key,value)=>{getState()[key]=value;return true}});
    const $=query,esc=escape,dlg=dialog,{ymd,pd,fmtD}=dates,cfg=config,ents=entries,nurList=nurses,nurColor=nurseColor,coverFn=cover,oweSummaryFn=oweSummary,lastPayFn=lastPay,pillEv=pillEvents,payDue=due,calcFn=calc,fmt=formatDate,num=number,A=amount,amtOn=amountVisible,un=unit,NPAL=palette,NPALN=paletteNames,PLBL=labels,TIMES=shiftNames,WD_LONG=longWeekdays;function patientHTML(p,i){
  const c=cfg(i),conf=!!c.who;
  const nur=nurList(i);
  const chips=nur.map((x,k)=>`<button class="nchip" style="background:${x.c}" data-pa="nedit" data-i="${i}" data-k="${k}">${esc(x.n)}</button>`).join('')+`<button class="nchip add" data-pa="nadd" data-i="${i}">+ Agregar enfermero/a</button>`;
  const nurH=`<p class="info nurses"><b>Enfermeros</b> <span class="hint">· Los días se asignan en Inicio.</span></p><div class="nlist">${chips}</div>`;
  const ren=`<div class="row" style="margin-top:8px"><button class="btn ghost small" data-pa="ren" data-i="${i}">Cambiar nombre</button></div>`;
  const individual=services&&ledger?nur.map(n=>n.id?{n,s:ledgerSummary(services(i),ledger(),n.id)}:null).filter(Boolean):[];
  const ledgerHTML=individual.length?`<p class="info"><b>Servicios y saldos individuales</b> <button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver montos'}</button></p>${individual.map(({n,s})=>{
    const movements=ledger().filter(m=>m.nurseId===n.id).sort((a,b)=>b.date.localeCompare(a.date));
    return `<div class="vrow"><div><b>${esc(n.n)}</b><br><span class="hint">${s.services.length} servicios · costo ${A(s.costCents/100)} · pagado ${A(s.paidCents/100)} · pendiente ${A(s.balanceCents/100)} MXN</span></div></div>`
      +(movements.length?`<p class="hint">Movimientos individuales</p>${movements.map(m=>{
        const applied=m.allocations.map(a=>{const service=services(i).find(x=>x.id===a.serviceId);return service?`${fmtD(service.date)} · ${A(a.amountCents/100)} MXN`:''}).filter(Boolean).join(', ');
        return `<div class="vrow"><div>${esc(fmtD(m.date))}${m.concept?' · '+esc(m.concept):''}<br><span class="amtv">${A(m.amountCents/100)} MXN</span>${applied?`<br><span class="hint">Aplicado a: ${esc(applied)}</span>`:''}</div><span class="hint">${m.allocations.length} aplicación(es)</span></div>`;
      }).join('')}`:'' );
  }).join('')}<p class="hint">Los pagos históricos globales y los servicios antiguos sin tarifa quedan fuera de estos saldos.</p><button class="btn ghost small" data-pa="ipay" data-i="${i}">Registrar abono individual</button>`:'';
  if(!conf){
    return `<article class="card gray">
      <div class="top"><h3 class="name">👤 ${esc(p.name)}</h3></div>
      <p class="info">Aún no hay un pago configurado para ${esc(p.name)}. Anota a quién se le paga, el tipo de turno de sus enfermeros y desde cuándo se cuentan los días.</p>
      <button class="btn" data-pa="cfg" data-i="${i}">Configurar pago</button>
    ${nurH}${ren}
    </article>`;
  }
  const cv=cover(i),[ic,tx]=PLBL[cv.st];
  const lp=lastPay(i),ow=oweSummary(i);
  const anyAmt=c.rate!=null||c.pays.some(x=>x.a!=null);
  const pl=(n,w)=>n+' '+w+(n===1?'':'s');
  const head=cv.has
    ? `<p class="big">${cv.owed} <small>${cv.owed===1?'día sin cubrir':'días sin cubrir'}</small></p>
      ${c.rate!=null?`<p class="info">Estimación de tarifa diaria para días sin cobertura: <b>${A(cv.owed*c.rate)}</b> <button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver monto'}</button></p>`:''}
      <p class="info"><span class="hint">${cv.remaining>0?'Hay '+pl(cv.remaining,'día')+' de cobertura anotada por delante. ':''}${cv.future?'Hay '+pl(cv.future,'día')+' asignado'+(cv.future===1?'':'s')+' más adelante sin cobertura. ':''}Se cuentan las fechas con enfermero registrado desde el ${esc(fmtD(c.base))}.</span></p>`
    : '<p class="info">Indica desde cuándo se cuentan los días: toca “Editar pago”.</p>';
  const uncoveredServices=ow.rows.reduce((sum,row)=>sum+row.c,0);
  const oweH=(cv.has&&cv.owed)
    ? `<p class="info" style="margin-top:6px"><b>Asistencia en fechas sin cubrir</b></p><p class="hint">${uncoveredServices} servicios registrados en ${pl(cv.owed,'fecha')}. Esto cuenta asignaciones; no determina importes ni a quién se pagó.</p>`
      +ow.rows.map(o=>`<div class="vrow"><div><span class="dot" style="background:${nurColor(i,o.n)}"></span><b>${esc(o.n)}</b><br><span class="hint">${pl(o.c,'día')}</span></div></div>`).join('')
    : '';
  const hist=c.pays.map((x,k)=>({x,k})).slice(-5).reverse().map(({x,k})=>`<div class="vrow"><div>${x.d?esc(fmtD(x.d)):'—'} · <b>${pl(x.n,'día')}</b>${x.old?' <span class="hint">(conteo anterior)</span>':''}${x.a!=null?`<br><span class="amtv">${A(x.a)}</span>`:''}</div><button class="link" data-pa="pdel" data-i="${i}" data-k="${k}">Quitar</button></div>`).join('');
  const sumH=lp
    ? `<p class="info" style="margin-top:14px"><b>Alcance calculado del último registro</b> <span class="hint">(${pl(lp.n,'día')} de cobertura anotada)</span></p><p class="hint">${pl(lp.days,'fecha')} con asignaciones · ${pl(lp.services,'servicio')} registrados. La cobertura cuenta fechas únicas.</p>`
      +(lp.rows.length
        ? `<p class="hint">Asistencia por persona en esas fechas; no indica a quién se entregó el dinero.</p>`
          +lp.rows.map(o=>`<div class="vrow"><div><span class="dot" style="background:${nurColor(i,o.n)}"></span><b>${esc(o.n)}</b><br><span class="hint">${pl(o.c,'servicio')}</span></div></div>`).join('')
          +(c.rate!=null?`<div class="vrow"><b>Estimación con tarifa diaria vigente para esas fechas</b><span class="amtv">${A(lp.total)}</span></div><p class="hint">No hay tarifas guardadas por enfermero o servicio; este monto no es el costo total individual de los servicios.</p>`:'<p class="hint">No hay tarifa diaria para calcular una estimación; tampoco hay tarifas por persona o servicio.</p>')
        : '<p class="hint">Aún no hay enfermeros registrados en esos días.</p>')
      +`<p class="hint">${lp.n-lp.days} día(s) de cobertura anotada aún sin fecha asignada. El registro de pago corresponde a la ficha completa, no a un enfermero. Este cálculo puede cambiar al editar asignaciones; no es un comprobante histórico ni un período vinculado al pago.</p>`
    : '';
  return `<article class="card ${cv.st}">
    <div class="top"><h3 class="name">👤 ${esc(p.name)}</h3><span class="badge">${ic} ${tx}</span></div>
    <p class="info">Se le paga a <b>${esc(c.who)}</b>. Enfermeros de <b>${TIMES[c.time].toLowerCase()}</b>.${c.note?'<br><span class="hint">'+esc(c.note)+'</span>':''}</p>
    ${head}
    <p class="hint">Cada fecha con asignación cuenta como un día, aunque haya varias personas o medio tiempo. Los días registrados cubren primero las fechas más antiguas desde la fecha base. El monto anotado no determina cobertura ni saldo monetario; las estimaciones usan la tarifa actual.</p>
    <p class="hint">Los pagos se guardan para la ficha completa. No se selecciona un enfermero ni se puede atribuirle el importe a una persona de la lista.</p>
    ${oweH}
    <button class="btn" style="margin-top:10px" data-pa="payreg" data-i="${i}">Registrar pago</button>
    <div class="row"><button class="btn ghost small" data-pa="cfg" data-i="${i}">Editar pago</button></div>
    ${c.pays.length?`<p class="info" style="margin-top:14px"><b>Pagos registrados</b>${anyAmt?` <button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver montos'}</button>`:''}</p>${hist}<button class="link" data-pa="creset" data-i="${i}">Empezar un conteo nuevo…</button>`:''}
    ${nurH}
    ${sumH}
    ${ledgerHTML}
    ${ren}
  </article>`;
}

function renderPay(){
  $('#payView').innerHTML=S.p.map((p,i)=>patientHTML(p,i)).join('');
}

function payForm(i){
  const p=S.p[i],c=cfg(i);
  form((c.who?'Editar pago: ':'Configurar pago: ')+esc(p.name),[
    {id:'w',l:'¿A quién se le paga?',t:'text',ph:'Ej. enfermera jefa',v:c.who},
    {id:'tm',l:'Tipo de turno de los enfermeros de '+esc(p.name),t:'text',v:TIMES[c.time],presets:[{l:TIMES.full,v:TIMES.full},{l:TIMES.half,v:TIMES.half}],h:'Es descriptivo y global: medio tiempo no reduce días ni tarifa.'},
    {id:'rt',l:'Tarifa diaria estimada (opcional)',v:c.rate==null?'':c.rate,h:'Se aplica a todas las fechas calculadas, incluidas las anteriores. No conserva tarifas históricas ni reparte importes por persona.'},
    {id:'fd',l:'Contar los días desde',t:'date',v:c.base||ymd(new Date()),h:'Cambiar esta fecha recalcula la cobertura de los pagos existentes. No cierra un período ni conserva una liquidación histórica.'},
    {id:'nt',l:'Nota (opcional)',t:'text',ph:'Ej. se paga en efectivo',v:c.note}
  ],v=>{
    if(!v.w.trim())return'Escribe a quién se le paga.';
    const tm=v.tm.trim()===TIMES.half?'half':v.tm.trim()===TIMES.full?'full':'';
    if(!tm)return'Elige el tipo de turno con los botones.';
    let rate=null;
    if(String(v.rt).trim()!==''){rate=pos(v.rt);if(!(rate>=0))return'El monto por día debe ser un número (o déjalo vacío).'}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.fd))return'Elige la fecha desde la cual se cuentan los días.';
    c.who=v.w.trim().slice(0,60);c.time=tm;c.rate=rate;c.base=v.fd;c.note=v.nt.trim().slice(0,100);
    save();render();
  },'Guardar');
  $('#tm').readOnly=true;
}

// Registrar un pago: cuántos días cubre (por defecto, los que se deben ahora; también puede ser por adelantado)
function payRegForm(i){
  const p=S.p[i],c=cfg(i),cv=cover(i);
  const fields=[
    {id:'n',l:'¿Cuántos días se anotan como cubiertos?',v:cv.owed?String(cv.owed):'',h:cv.owed?'Se sugieren los '+cv.owed+' día'+(cv.owed===1?'':'s')+' sin cobertura actual. Puede ser más si se anota cobertura futura. El conteo corresponde a toda la ficha, no a un enfermero.':'Cuenta las fechas con enfermero registrado; el conteo corresponde a la ficha completa.'},
    {id:'a',l:'Monto pagado (opcional)',v:'',h:'Anota el importe efectivamente pagado. Es informativo: no convierte dinero a días ni concilia abonos parciales. No se selecciona un enfermero; este esquema no guarda a qué persona se pagó.'}
  ];
  if(!c.base)fields.push({id:'fd',l:'Contar los días desde',t:'date',v:ymd(new Date()),h:'Los días con enfermero registrado desde esta fecha se irán descontando de lo pagado.'});
  form('Registrar pago: '+esc(p.name),fields,v=>{
    const n=pos(v.n);
    if(!(n>=1)||!Number.isInteger(n))return'Escribe cuántos días (un número entero, 1 o más).';
    if(n>366)return'Revisa el número de días.';
    let a=null;
    if(String(v.a).trim()!==''){a=pos(v.a);if(!(a>=0))return'El monto debe ser un número (o déjalo vacío).'}
    if(!c.base){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.fd))return'Elige la fecha desde la cual se cuentan los días.';
      c.base=v.fd;
    }
    c.pays.push({d:ymd(new Date()),n,a,old:false});
    save();render();
  },'Guardar pago');
}

function individualPayForm(i){
  const nurses=nurList(i).filter(n=>n.id),servicesForPatient=services(i),movements=ledger();
  if(!nurses.length)return'Primero registra un servicio nuevo para identificar al enfermero/a.';
  const options=nurses.map(n=>({v:n.id,l:n.n}));
  form('Registrar abono individual',[{id:'nurse',l:'Enfermero/a destinatario',t:'select',options,v:options[0].v},{id:'date',l:'Fecha del pago',t:'date',v:ymd(new Date())},{id:'amount',l:'Importe del abono (MXN)',v:'',h:'Se aplica en orden de fecha a los servicios pendientes de esa persona. No se aceptan excedentes.'},{id:'concept',l:'Concepto o referencia (opcional)',t:'text',ph:'Ej. transferencia',v:''}],v=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date))return'Elige una fecha válida.';
    const cents=toCents(v.amount);if(!Number.isSafeInteger(cents)||cents<=0)return'Escribe un importe mayor que cero, con hasta dos decimales.';
    const allocations=allocatePayment(servicesForPatient,movements,v.nurse,cents,v.date);if(!allocations)return'El abono supera el saldo de servicios de esa persona hasta esa fecha o no hay servicios con saldo.';
    movements.push({id:newId('pay'),patientIndex:i,nurseId:v.nurse,date:v.date,amountCents:cents,concept:v.concept.trim().slice(0,120),allocations});
    save();render();
  },'Guardar abono');
}

function resetForm(i){
  const p=S.p[i],c=cfg(i);
  form('Empezar un conteo nuevo: '+esc(p.name),[
    {id:'fd',l:'Contar los días desde',t:'date',v:ymd(new Date()),h:'Los pagos anteriores se quedan en el historial pero ya no se cuentan. Después registra el pago nuevo.'}
  ],v=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.fd))return'Elige una fecha.';
    c.pays.forEach(x=>{x.old=true});c.base=v.fd;
    save();render();
  },'Empezar de nuevo');
}

function nurseForm(i,k){
  const p=S.p[i],cur=k===undefined?null:nurList(i)[k];
  if(k!==undefined&&!cur)return;
  form(cur?'Editar a '+esc(cur.n):'Agregar enfermero/a de '+esc(p.name),[
    {id:'nn',l:'Nombre',t:'text',ph:'Ej. María',v:cur?cur.n:''},
    {id:'nc',l:'Color en el calendario',t:'color',v:cur?cur.c:nextColor(i)}
  ],v=>{
    const n=v.nn.trim().slice(0,40);
    if(!n)return'Escribe el nombre.';
    if(!NPAL.includes(v.nc))return'Elige un color.';
    if(nurList(i).some((x,j)=>j!==k&&x.n.toLowerCase()===n.toLowerCase()))return'Ya hay un enfermero/a con ese nombre.';
    if(cur){
      if(cur.n!==n){
        Object.keys(S.pay.v).forEach(dk=>{const a=S.pay.v[dk][i];if(Array.isArray(a))a.forEach(e=>{if(e.n===cur.n)e.n=n})});
        cur.n=n;
      }
      cur.c=v.nc;
    }else{
      const L=(S.pay.nurses[i]=Array.isArray(S.pay.nurses[i])?S.pay.nurses[i]:[]);
      L.push({n,c:v.nc});
    }
    save();render();
  },'Guardar');
  if(cur)$('#nc').insertAdjacentHTML('afterend',`<button type="button" class="link" data-pa="nrm" data-i="${i}" data-k="${k}">Quitar de la lista</button>`);
}

function renForm(i){
  form('Nombre del paciente',[{id:'n',l:'Nombre',t:'text',v:S.p[i].name}],v=>{
    if(!v.n.trim())return'Escribe un nombre.';
    S.p[i].name=v.n.trim();save();render();
  });
}

// Detalle de un día: pastillas, pago y enfermeros (los enfermeros se crean en Pagos)
function dayForm(i,ds){
  const p=S.p[i];if(!p)return;
  const c=cfg(i),cv=cover(i),nurses=nurList(i);
  const dt=pd(ds);
  const [y,m,d]=ds.split('-').map(Number);
  const label=dt.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});
  const ev=pillEv(i)[ds];
  let info='';
  if(cv.covered.has(ds))info+='<p class="info">✓ Día pagado.</p>';
  else if(cv.has&&cv.unpaid.includes(ds))info+='<p class="info">💵 Día con enfermero sin pagar.</p>';
  S.appts.filter(a=>a.i===i&&a.d===ds).forEach(a=>{info+=`<p class="info">🩺 <b>Cita médica</b>${a.t?' a las '+esc(a.t):''}${a.w?': '+esc(a.w):''}${a.n?'<br><span class="hint">'+esc(a.n)+'</span>':''}</p>`});
  if(dt.getDay()===0)info+='<p class="hint">Los domingos solo cuentan como día si hay un enfermero registrado.</p>';
  if(ev&&ev.buy.length)info+=`<p class="info">🛒 Comprar: <b>${ev.buy.map(x=>esc(x)).join(', ')}</b></p>`;
  if(ev&&ev.end.length)info+=`<p class="info">⚠️ Se acaban: <b>${ev.end.map(x=>esc(x)).join(', ')}</b> (última toma completa ese día)</p>`;
  const cur=ents(ds,i);
  const list=cur.length?'<div>'+cur.map((e,k)=>`<div class="vrow"><div><span class="dot" style="background:${nurColor(i,e.n)}"></span><b>${esc(e.n)}</b>${e.service?`<br><span class="hint">Servicio ${e.service.type==='half'?'medio turno':'completo'} · ${A(e.service.amountCents/100)} MXN</span>`:'<br><span class="hint">Registro anterior, sin tarifa conciliable</span>'}</div><button type="button" class="link" data-pa="rm" data-i="${i}" data-d="${ds}" data-k="${k}">Quitar</button></div>`).join('')+'</div>':'';
  const title=label+' · '+esc(p.name);
  if(!nurses.length){
    form(title,[],()=>{S.mode='pay';save();render();window.scrollTo(0,0)},'Ir a Pagos');
    dlg.querySelector('h2').insertAdjacentHTML('afterend',info+list+`<p class="hint">Aún no hay enfermeros para ${esc(p.name)}. Agrégalos en la pestaña Pagos y luego asígnalos aquí.</p>`);
    return;
  }
  const wdn=WD_LONG[dt.getDay()];
  const once='Solo este día',weekly='Cada '+wdn+' hasta fin de mes';
  form(title,[
    {id:'nm',l:'Asignar enfermero o enfermera ('+TIMES[c.time].toLowerCase()+')',t:'text',ph:'Toca un nombre',v:'',presets:nurses.map(x=>({l:esc(x.n),v:esc(x.n)}))},
    {id:'serviceAmount',l:'Costo de este servicio (MXN)',v:'',h:'Se guarda como tarifa histórica de este servicio y no cambia al editar tarifas futuras.'},
    {id:'serviceType',l:'Tipo de jornada',t:'select',v:'full',options:[{v:'full',l:'Tiempo completo'},{v:'half',l:'Medio tiempo'}]},
    {id:'rp',l:'¿Repetir?',t:'text',v:once,presets:[{l:once,v:once},{l:weekly,v:weekly}]}
  ],v=>{
    const n=v.nm.trim();
    if(!n)return;
    if(!nurses.some(x=>x.n===n))return'Elige un enfermero/a de los botones. Para agregar uno nuevo, ve a Pagos.';
    const amountCents=toCents(v.serviceAmount);if(!Number.isSafeInteger(amountCents)||amountCents<0)return'Escribe el costo del servicio con hasta dos decimales.';
    const nurse=nurses.find(x=>x.n===n);if(!nurse.id)nurse.id=newId('nurse');
    const dates=[ds];
    if(v.rp.trim()===weekly){for(let k=1;;k++){const n2=new Date(y,m-1,d+7*k);if(n2.getMonth()!==m-1)break;dates.push(ymd(n2))}}
    dates.forEach(dk=>{
      const day=(S.pay.v[dk]=S.pay.v[dk]||{});
      const a=(day[i]=Array.isArray(day[i])?day[i]:[]);
      if(!a.some(e=>e.n===n))a.push({n,service:{id:newId('service'),nurseId:nurse.id,type:v.serviceType==='half'?'half':'full',amountCents}});
    });
    save();render();
  },'Asignar');
  $('#nm').readOnly=true;$('#rp').readOnly=true;
  dlg.querySelectorAll('.pbtn[data-set="nm"]').forEach(b=>{b.classList.add('col');b.style.background=nurColor(i,b.dataset.val)});
  dlg.querySelector('h2').insertAdjacentHTML('afterend',info+list);
}

// ---------- INSUMOS: usan el mismo cálculo que las pastillas, con un uso fijo por día ----------
  return Object.freeze({patientHTML,renderPay,payForm,payRegForm,individualPayForm,resetForm,nurseForm,renForm,dayForm});
  }
  window.AcompanaCareUI=Object.freeze({create});
})();
