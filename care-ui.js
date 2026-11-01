// Presentación y formularios del área Pagos/calendario de cuidados.
(() => {
  function create({getState,query,escape,dates,save,render,form,dialog,config,entries,nurses,nurseColor,nextColor,cover,oweSummary,lastPay,pillEvents,due,calc,formatDate,number,money,amount,amountVisible,unit,palette,paletteNames,labels,shiftNames,longWeekdays,services,allServices,ledger,generalLedger,ledgerSummary,allocatePayment,generalSummary,toCents,newId}) {
    const S=new Proxy({}, {get:(_,key)=>getState()[key],set:(_,key,value)=>{getState()[key]=value;return true}});
    const $=query,esc=escape,dlg=dialog,{ymd,pd,fmtD}=dates,cfg=config,ents=entries,nurList=nurses,nurColor=nurseColor,coverFn=cover,oweSummaryFn=oweSummary,lastPayFn=lastPay,pillEv=pillEvents,payDue=due,calcFn=calc,fmt=formatDate,num=number,A=amount,amtOn=amountVisible,un=unit,NPAL=palette,NPALN=paletteNames,PLBL=labels,TIMES=shiftNames,WD_LONG=longWeekdays;
function patientHTML(p,i){
  const nurses=nurList(i),today=ymd(new Date());
  const assignments=Object.entries(S.pay.v).filter(([date])=>date<=today).flatMap(([date,byPatient])=>(byPatient[i]||[]).map(entry=>({date,entry})));
  const nurseRows=nurses.map((n,k)=>{
    const rows=assignments.filter(({entry})=>entry.service?.nurseId===n.id||entry.n===n.n);
    const full=rows.filter(({entry})=>(entry.service&&entry.service.type==='full')||(!entry.service&&entry.s==='full')).length;
    const half=rows.filter(({entry})=>(entry.service&&entry.service.type==='half')||(!entry.service&&entry.s==='half')).length;
    const unknown=rows.length-full-half;
    const rates=n.ratesCents||{};
    const rateLabel=[rates.full!==null&&rates.full!==undefined?`Completa ${A(rates.full/100)} MXN`:'',rates.half!==null&&rates.half!==undefined?`Media ${A(rates.half/100)} MXN`:''].filter(Boolean).join(' · ');
    return `<div class="vrow"><div><span class="dot" style="background:${n.c}"></span><b>${esc(n.n)}</b><br><span class="hint">${rateLabel||'Sin tarifa para nuevas jornadas'}</span><br><span class="hint">${full} jornadas completas · ${half} medias jornadas${unknown?` · ${unknown} asignaciones anteriores sin modalidad confirmada`:''}</span></div><button class="btn ghost small" data-pa="nedit" data-i="${i}" data-k="${k}">Editar</button></div>`;
  }).join('');
  const oldPayments=cfg(i).pays||[],oldIndividual=(ledger()||[]).filter(m=>m.patientIndex===i);
  const oldArchive=oldPayments.length||oldIndividual.length?`<details class="legacy-payments"><summary>Historial anterior no incluido en el saldo general</summary><p class="hint">Estos registros se conservan como fueron guardados. No se reinterpretan ni se descuentan del saldo general porque su relación con los cargos no está confirmada.</p>${oldPayments.map(m=>`<div class="vrow"><div>${m.d?esc(fmtD(m.d)):'Fecha anterior sin dato'} · ${m.n} días${m.a!==null&&m.a!==undefined?` · ${A(m.a)} (importe histórico)`:''}${m.old?' · anterior':''}</div></div>`).join('')}${oldIndividual.map(m=>`<div class="vrow"><div>${esc(fmtD(m.date))} · movimiento individual anterior · ${A(m.amountCents/100)} MXN</div><span class="hint">Conservado</span></div>`).join('')}</details>`:'';
  const ratesVisible=nurses.some(n=>n.ratesCents&&Object.values(n.ratesCents).some(v=>v!==null&&v!==undefined));
  return `<article class="card care-staff"><div class="top"><h3 class="name">👤 ${esc(p.name)}</h3><button class="link" data-pa="ren" data-i="${i}">Editar ficha</button></div>
    <h4>Enfermeros y tarifas</h4>${nurseRows||'<p class="hint">Aún no hay enfermeros configurados.</p>'}
    <button class="btn ghost small" data-pa="nadd" data-i="${i}">Agregar enfermero/a</button>
    ${ratesVisible?'<p class="hint">Las tarifas de nuevas jornadas se eligen aquí y quedan guardadas en cada asignación.</p>':''}${oldArchive}</article>`;
}

function generalSummaryHTML(){
  const servicesAll=allServices(),moves=generalLedger(),summary=generalSummary(servicesAll,moves);
  const oldAssignments=Object.values(S.pay.v).reduce((sum,byPatient)=>sum+Object.values(byPatient||{}).reduce((n,list)=>n+(Array.isArray(list)?list.filter(e=>e&&!e.service).length:0),0),0);
  const oldPayments=(S.pay.cfg||[]).reduce((sum,c)=>sum+((c&&Array.isArray(c.pays))?c.pays.length:0),0);
  const oldIndividual=ledger().length;
  const count=(n,one,many)=>`${n} ${n===1?one:many}`;
  const warning=oldAssignments||oldPayments||oldIndividual?`<p class="hint">Saldo verificable con jornadas nuevas que tienen tarifa. No incluye ${count(oldAssignments,'asignación antigua sin costo','asignaciones antiguas sin costo')}, ${count(oldPayments,'pago global anterior','pagos globales anteriores')} ni ${count(oldIndividual,'movimiento individual PAG-001','movimientos individuales PAG-001')}. No representa conciliación completa de la historia.</p>`:'<p class="hint">Saldo calculado con los costos registrados y los abonos generales activos.</p>';
  const movements=moves.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  const rows=movements.map(m=>{
    if(m.type==='cancellation')return `<div class="vrow"><div>${esc(fmtD(m.date))} · Cancelación de abono<br><span class="hint">Referencia ${esc(m.originalId)}${m.concept?' · '+esc(m.concept):''}</span></div><span class="amtv">${A(m.amountCents/100)} MXN</span></div>`;
    const cancelled=summary.cancelledIds.has(m.id);
    return `<div class="vrow"><div>${esc(fmtD(m.date))}${m.concept?' · '+esc(m.concept):''}<br><span class="hint">${cancelled?'Cancelado':'Abono general recibido'}</span></div><span class="amtv">${A(m.amountCents/100)} MXN</span>${cancelled?'':`<button class="link" data-pa="adminCancel" data-id="${esc(m.id)}">Cancelar</button>`}</div>`;
  }).join('');
  const canReceive=summary.balanceCents>0;
  return `<article class="card admin-summary"><div class="top"><h2>Total pendiente de pago</h2><button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver montos'}</button></div>
    <p class="big">${A(summary.balanceCents/100)} <small>MXN</small></p>
    <div class="vrow"><span>Costo de jornadas registradas</span><b>${A(summary.costCents/100)} MXN</b></div>
    <div class="vrow"><span>Abonos generales recibidos</span><b>${A(summary.receivedCents/100)} MXN</b></div>${warning}
    <button class="btn" data-pa="adminPay"${canReceive?'':' disabled'}>Registrar abono</button>
    <details><summary>Historial de abonos y cancelaciones</summary>${rows||'<p class="hint">Todavía no hay movimientos generales.</p>'}</details>
    </article>`;
}

function renderPay(){
  $('#payView').innerHTML=generalSummaryHTML()+S.p.map((p,i)=>patientHTML(p,i)).join('');
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

function generalPayForm(){
  const movements=generalLedger(),summary=generalSummary(allServices(),movements);
  if(summary.balanceCents<=0){form('No hay saldo verificable para abonar',[],()=>{},'Entendido');return}
  form('Registrar abono a la administradora',[
    {id:'adminDate',l:'Fecha',t:'date',v:ymd(new Date())},
    {id:'adminAmount',l:'Importe recibido (MXN)',v:'',h:'El abono reduce el saldo general. No se distribuye entre enfermeros.'},
    {id:'adminConcept',l:'Concepto o nota (opcional)',t:'text',ph:'Ej. transferencia',v:''}
  ],v=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.adminDate))return'Elige una fecha válida.';
    const cents=toCents(v.adminAmount);if(!Number.isSafeInteger(cents)||cents<=0)return'Escribe un importe mayor que cero, con hasta dos decimales.';
    const current=generalSummary(allServices(),movements);
    if(cents>current.balanceCents)return'El abono supera el saldo verificable. No se registran anticipos.';
    movements.push({id:newId('admin_receipt'),type:'receipt',date:v.adminDate,amountCents:cents,concept:v.adminConcept.trim().slice(0,120)});
    save();render();
  },'Guardar abono');
}

function cancelGeneralPayForm(id){
  const movements=generalLedger(),summary=generalSummary(allServices(),movements);
  const receipt=movements.find(m=>m.id===id&&m.type==='receipt');
  if(!receipt||summary.cancelledIds.has(id)){form('Abono no disponible para cancelar',[],()=>{},'Entendido');return}
  form('Cancelar abono recibido',[
    {id:'cancelDate',l:'Fecha de cancelación',t:'date',v:ymd(new Date())},
    {id:'cancelReason',l:'Motivo (opcional)',t:'text',ph:'Ej. importe capturado incorrectamente',v:''}
  ],v=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.cancelDate))return'Elige una fecha válida.';
    if(v.cancelDate<receipt.date)return'La cancelación no puede tener una fecha anterior al abono.';
    const latest=generalSummary(allServices(),movements);
    if(latest.cancelledIds.has(id))return'Este abono ya fue cancelado.';
    movements.push({id:newId('admin_cancel'),type:'cancellation',originalId:id,date:v.cancelDate,amountCents:receipt.amountCents,concept:v.cancelReason.trim().slice(0,120)});
    save();render();
  },'Confirmar cancelación');
  dlg.querySelector('h2').insertAdjacentHTML('afterend',`<p>Se cancelará el abono de <b>${A(receipt.amountCents/100)} MXN</b> del ${esc(fmtD(receipt.date))}. El registro original se conservará y el saldo aumentará en ese importe.</p>`);
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
  const rates=cur&&cur.ratesCents?cur.ratesCents:{full:null,half:null};
  const dollars=c=>c===null||c===undefined?'':`${Math.floor(c/100)}.${String(c%100).padStart(2,'0')}`;
  form(cur?'Editar a '+esc(cur.n):'Agregar enfermero/a de '+esc(p.name),[
    {id:'nn',l:'Nombre',t:'text',ph:'Ej. María',v:cur?cur.n:''},
    {id:'nc',l:'Color en el calendario',t:'color',v:cur?cur.c:nextColor(i)},
    {id:'rateFull',l:'Tarifa de jornada completa (MXN; vacío si no la ofrece)',v:dollars(rates.full),h:'Importe independiente. Se guarda en centavos; $0 es una tarifa válida.'},
    {id:'rateHalf',l:'Tarifa de media jornada (MXN; vacío si no la ofrece)',v:dollars(rates.half),h:'Importe independiente. No se calcula a partir de la otra modalidad.'}
  ],v=>{
    const n=v.nn.trim().slice(0,40);
    if(!n)return'Escribe el nombre.';
    if(!NPAL.includes(v.nc))return'Elige un color.';
    if(nurList(i).some((x,j)=>j!==k&&x.n.toLowerCase()===n.toLowerCase()))return'Ya hay un enfermero/a con ese nombre.';
    const parseRate=(raw,label)=>{
      if(String(raw).trim()==='')return null;
      const cents=toCents(raw);return Number.isSafeInteger(cents)&&cents>=0?cents:label;
    };
    const full=parseRate(v.rateFull,'La tarifa de jornada completa no es válida.');if(typeof full==='string')return full;
    const half=parseRate(v.rateHalf,'La tarifa de media jornada no es válida.');if(typeof half==='string')return half;
    if(full===null&&half===null&&(!cur||cur.ratesCents))return'Configura al menos una modalidad con tarifa. Una tarifa de $0 sí cuenta como configurada.';
    if(cur&&cur.ratesCents){
      if((cur.ratesCents.full!==null&&full===null)||(cur.ratesCents.half!==null&&half===null))return'Para retirar una modalidad usa su acción de retiro, que solicita confirmación.';
    }
    if(cur){
      if(cur.n!==n){
        Object.keys(S.pay.v).forEach(dk=>{const a=S.pay.v[dk][i];if(Array.isArray(a))a.forEach(e=>{if(e.n===cur.n)e.n=n})});
        cur.n=n;
      }
      cur.c=v.nc;cur.id=cur.id||newId('nurse');if(full!==null||half!==null)cur.ratesCents={full,half};
    }else{
      const L=(S.pay.nurses[i]=Array.isArray(S.pay.nurses[i])?S.pay.nurses[i]:[]);
      L.push({id:newId('nurse'),n,c:v.nc,ratesCents:{full,half}});
    }
    save();render();
  },'Guardar');
  if(cur){
    $('#nc').insertAdjacentHTML('afterend',`<button type="button" class="link" data-pa="nrm" data-i="${i}" data-k="${k}">Quitar de la lista</button>`);
    ['full','half'].forEach(type=>{
      if(rates[type]===null||rates[type]===undefined)return;
      const id=type==='full'?'rateFull':'rateHalf',other=type==='full'?'half':'full',label=type==='full'?'jornada completa':'media jornada';
      $('#'+id).insertAdjacentHTML('afterend',`<button type="button" class="link" id="removeRate-${type}">Retirar modalidad ${label}</button>`);
      $('#removeRate-'+type).onclick=()=>{
        if(rates[other]===null||rates[other]===undefined){form('Configura otra modalidad primero',[],()=>{},'Entendido');dlg.querySelector('h2').insertAdjacentHTML('afterend','<p>El enfermero debe conservar al menos una modalidad con tarifa. Agrega la otra tarifa antes de retirar esta.</p>');return}
        form('¿Retirar modalidad '+label+'?',[],()=>{cur.ratesCents={...rates,[type]:null};save();render()},'Retirar modalidad');
        dlg.querySelector('h2').insertAdjacentHTML('afterend','<p>Dejará de estar disponible para nuevas asignaciones. Los servicios existentes conservarán su jornada y costo.</p>');
      };
    });
  }
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
  if(cv.covered.has(ds))info+='<p class="info">Fecha cubierta según el conteo anterior de pagos.</p>';
  else if(cv.has&&cv.unpaid.includes(ds))info+='<p class="info">Fecha asignada sin cubrir según el conteo anterior.</p>';
  S.appts.filter(a=>a.i===i&&a.d===ds).forEach(a=>{info+=`<p class="info">🩺 <b>Cita médica</b>${a.t?' a las '+esc(a.t):''}${a.w?': '+esc(a.w):''}${a.n?'<br><span class="hint">'+esc(a.n)+'</span>':''}</p>`});
  if(dt.getDay()===0)info+='<p class="hint">Los domingos solo cuentan como día si hay un enfermero registrado.</p>';
  if(ev&&ev.buy.length)info+=`<p class="info">🛒 Comprar: <b>${ev.buy.map(x=>esc(x)).join(', ')}</b></p>`;
  if(ev&&ev.end.length)info+=`<p class="info">⚠️ Se acaban: <b>${ev.end.map(x=>esc(x)).join(', ')}</b> (última toma completa ese día)</p>`;
  const cur=ents(ds,i);
  const list=cur.length?'<div>'+cur.map((e,k)=>`<div class="vrow"><div><span class="dot" style="background:${nurColor(i,e.n)}"></span><b>${esc(e.n)}</b>${e.service?`<br><span class="hint">Servicio ${e.service.type==='half'?'medio turno':'completo'} · ${A(e.service.amountCents/100)} MXN</span>`:'<br><span class="hint">Registro anterior, sin tarifa conciliable</span>'}</div><button type="button" class="link" data-pa="rm" data-i="${i}" data-d="${ds}" data-k="${k}">Quitar</button></div>`).join('')+'</div>':'';
  const title=label+' · '+esc(p.name);
  const eligible=nurses.map((n,k)=>({n,k})).filter(({n})=>n.ratesCents&&(['full','half'].some(type=>Number.isSafeInteger(n.ratesCents[type])&&n.ratesCents[type]>=0)));
  if(!eligible.length){
    form(title,[],()=>{S.mode='pay';save();render();window.scrollTo(0,0)},'Configurar en Pagos');
    dlg.querySelector('h2').insertAdjacentHTML('afterend',info+list+`<p class="hint">Configura al menos una tarifa en Pagos para permitir nuevas asignaciones.</p>`);
    return;
  }
  const wdn=WD_LONG[dt.getDay()];
  const once='Solo este día',weekly='Cada '+wdn+' hasta fin de mes';
  form(title,[
    {id:'nm',l:'Enfermero/a',t:'select',v:String(eligible[0].k),options:eligible.map(({n,k})=>({v:String(k),l:n.n}))},
    {id:'serviceType',l:'Jornada',t:'select',v:'full',options:[{v:'full',l:'Jornada completa'},{v:'half',l:'Media jornada'}]},
    {id:'rp',l:'¿Repetir?',t:'text',v:once,presets:[{l:once,v:once},{l:weekly,v:weekly}]}
  ],v=>{
    const selected=eligible.find(x=>String(x.k)===v.nm);if(!selected)return'Elige un enfermero/a configurado.';
    const nurse=selected.n,type=v.serviceType;
    const amountCents=nurse.ratesCents&&nurse.ratesCents[type];
    if(!['full','half'].includes(type)||!Number.isSafeInteger(amountCents)||amountCents<0)return'Esta jornada no está ofrecida por el enfermero/a seleccionado.';
    if(!nurse.id)nurse.id=newId('nurse');
    const n=nurse.n;
    const dates=[ds];
    if(v.rp.trim()===weekly){for(let k=1;;k++){const n2=new Date(y,m-1,d+7*k);if(n2.getMonth()!==m-1)break;dates.push(ymd(n2))}}
    dates.forEach(dk=>{
      const day=(S.pay.v[dk]=S.pay.v[dk]||{});
      const a=(day[i]=Array.isArray(day[i])?day[i]:[]);
      if(!a.some(e=>e.n===n))a.push({n,service:{id:newId('service'),nurseId:nurse.id,type,amountCents}});
    });
    save();render();
  },'Asignar');
  const nurseSelect=$('#nm'),typeSelect=$('#serviceType');
  nurseSelect.addEventListener('change',updateType);
  typeSelect.addEventListener('change',updateCost);
  nurseSelect.insertAdjacentHTML('afterend','<p class="info" id="serviceCost" aria-live="polite"></p>');
  function updateCost(){const item=eligible.find(x=>String(x.k)===nurseSelect.value),cents=item&&item.n.ratesCents[typeSelect.value];$('#serviceCost').textContent=Number.isSafeInteger(cents)?'Costo de la jornada: '+A(cents/100)+' MXN':''}
  function updateType(){
    const item=eligible.find(x=>String(x.k)===nurseSelect.value);if(!item)return;
    const available=['full','half'].filter(type=>Number.isSafeInteger(item.n.ratesCents[type])&&item.n.ratesCents[type]>=0);
    const selected=available.includes(typeSelect.value)?typeSelect.value:available[0];
    typeSelect.innerHTML=available.map(type=>`<option value="${type}">${type==='full'?'Jornada completa':'Media jornada'}</option>`).join('');
    typeSelect.value=selected;typeSelect.disabled=available.length===1;updateCost();
  }
  updateType();$('#rp').readOnly=true;
  dlg.querySelector('h2').insertAdjacentHTML('afterend',info+list);
}

// ---------- INSUMOS: usan el mismo cálculo que las pastillas, con un uso fijo por día ----------
  return Object.freeze({patientHTML,renderPay,payForm,payRegForm,individualPayForm,generalPayForm,cancelGeneralPayForm,resetForm,nurseForm,renForm,dayForm});
  }
  window.AcompanaCareUI=Object.freeze({create});
})();
