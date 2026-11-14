// Presentación y formularios del área Pagos/calendario de cuidados.
(() => {
  function assignmentLabel(entry,nurses){
    const type=entry.service?entry.service.type:entry.s;
    const modality=type==='half'?'Media jornada':type==='full'?'Jornada completa':'Modalidad sin confirmar';
    const nurse=nurses.find(n=>entry.service?.nurseId?n.id===entry.service.nurseId:n.n===entry.n);
    return modality+(entry.service?'':' · Registro anterior')+(nurse?.inactive===true?' · Inactivo':'');
  }
  function create({getState,updateHTML,query,escape,dates,save,render,form,dialog,config,entries,nurses,nurseColor,nextColor,cover,oweSummary,lastPay,pillEvents,due,calc,formatDate,number,money,amount,amountVisible,unit,palette,paletteNames,labels,shiftNames,longWeekdays,services,allServices,ledger,generalLedger,ledgerSummary,allocatePayment,generalSummary,toCents,newId,assignmentRemovalBlock}) {
    const {isValidDateOnly}=window.AcompanaCompatibility;
    const S=new Proxy({}, {get:(_,key)=>getState()[key],set:(_,key,value)=>{getState()[key]=value;return true}});
    const $=query,esc=escape,dlg=dialog,{ymd,pd,fmtD}=dates,cfg=config,ents=entries,nurList=nurses,nurColor=nurseColor,coverFn=cover,oweSummaryFn=oweSummary,lastPayFn=lastPay,pillEv=pillEvents,payDue=due,calcFn=calc,fmt=formatDate,num=number,A=amount,amtOn=amountVisible,un=unit,NPAL=palette,NPALN=paletteNames,PLBL=labels,TIMES=shiftNames,WD_LONG=longWeekdays;
function patientHTML(p,i){
  const nurses=nurList(i),today=ymd(new Date());
  const assignments=Object.entries(S.pay.v).flatMap(([date,byPatient])=>(byPatient[i]||[]).map(entry=>({date,entry})));
  const accruedDates=new Set(assignments.map(({date})=>date).filter(date=>date<=today&&window.AcompanaCompatibility.isValidDateOnly(date)));
  const nurseRows=nurses.map((n,k)=>{
    const history=assignments.filter(({entry})=>entry.service?.nurseId?n.id===entry.service.nurseId:entry.n===n.n)
      .sort((a,b)=>b.date.localeCompare(a.date));
    const rows=history.filter(({date})=>accruedDates.has(date));
    const full=rows.filter(({entry})=>(entry.service&&entry.service.type==='full')||(!entry.service&&entry.s==='full')).length;
    const half=rows.filter(({entry})=>(entry.service&&entry.service.type==='half')||(!entry.service&&entry.s==='half')).length;
    const unknown=rows.length-full-half;
    const rates=n.ratesCents||{};
    const rateLabel=[rates.full!==null&&rates.full!==undefined?`Completa ${A(rates.full/100)} MXN`:'Completa sin configurar',rates.half!==null&&rates.half!==undefined?`Media ${A(rates.half/100)} MXN`:'Media sin configurar'].join(' · ');
    const html=`<div class="nurse-record${n.inactive===true?' nurse-inactive':''}" data-nurse-index="${k}"><div class="vrow"><div><span class="dot" style="background:${n.c}"></span><b>${esc(n.n)}</b> <span class="nurse-status">${n.inactive===true?'Inactivo':'Activo'}</span><br><span class="hint">${rateLabel}</span><br><span class="hint">${full} jornadas completas · ${half} medias jornadas${unknown?` · ${unknown} asignaciones anteriores sin modalidad confirmada`:''}</span></div><div class="sidebtns"><button class="btn ghost small" data-pa="nedit" data-i="${i}" data-k="${k}" aria-label="Editar y gestionar a ${esc(n.n)}">Editar</button>${n.inactive===true?`<button class="btn ghost small" data-pa="nrm" data-i="${i}" data-k="${k}" aria-label="Reactivar a ${esc(n.n)}">Reactivar</button>`:''}</div></div><details class="nurse-history" data-panel="${esc('nurse:'+i+':'+(n.id||n.n))}"><summary>Asignaciones e historial · ${history.length}</summary>${history.map(({date,entry})=>`<p><b>${esc(fmtD(date))}</b><br>${esc(assignmentLabel(entry,nurses))}${entry.service?' · Costo guardado '+A(entry.service.amountCents/100)+' MXN':''}</p>`).join('')||'<p class="hint">Sin asignaciones registradas.</p>'}</details></div>`;
    return {inactive:n.inactive===true,html};
  });
  const groups=[false,true].map(inactive=>{
    const rows=nurseRows.filter(row=>row.inactive===inactive);
    return `<section class="nurse-group"><h4>${inactive?'Inactivos':'Activos'} · ${rows.length}</h4>${rows.map(row=>row.html).join('')||`<p class="hint">${inactive?'Sin enfermeros inactivos.':'Sin enfermeros activos. Agrega uno o reactiva un registro existente.'}</p>`}</section>`;
  }).join('');
  const oldPayments=cfg(i).pays||[],oldIndividual=(ledger()||[]).filter(m=>m.patientIndex===i);
  const oldArchive=oldPayments.length||oldIndividual.length?`<details class="legacy-payments" data-panel="legacy-${i}"><summary>Historial anterior no incluido en el saldo general</summary><p class="hint">Estos registros se conservan como fueron guardados. No se reinterpretan ni se descuentan del saldo general porque su relación con los cargos no está confirmada.</p>${oldPayments.map(m=>`<div class="vrow"><div>${m.d?esc(fmtD(m.d)):'Fecha anterior sin dato'} · ${m.n} días${m.a!==null&&m.a!==undefined?` · ${A(m.a)} (importe histórico)`:''}${m.old?' · anterior':''}</div></div>`).join('')}${oldIndividual.map(m=>`<div class="vrow"><div>${esc(fmtD(m.date))} · movimiento individual anterior · ${A(m.amountCents/100)} MXN</div><span class="hint">Conservado</span></div>`).join('')}</details>`:'';
  const ratesVisible=nurses.some(n=>n.ratesCents&&Object.values(n.ratesCents).some(v=>v!==null&&v!==undefined));
  return `<article class="card care-staff"><div class="top"><h3 class="name">👤 ${esc(p.name)}</h3><button class="link" data-pa="ren" data-i="${i}">Editar ficha</button></div>
    <h4>Enfermeros y tarifas</h4><p class="hint">Jornadas registradas hasta hoy. Los costos y abonos se consultan en el saldo general con la administradora.</p>${groups}
    <button class="btn ghost small" data-pa="nadd" data-i="${i}">Agregar enfermero/a</button>
    ${ratesVisible?'<p class="hint">Las tarifas de nuevas jornadas se eligen aquí y quedan guardadas en cada asignación.</p>':''}${oldArchive}</article>`;
}

function generalSummaryHTML(){
  const today=ymd(new Date()),servicesAll=allServices(),moves=generalLedger(),summary=generalSummary(servicesAll,moves,today);
  const oldAssignments=Object.entries(S.pay.v).filter(([date])=>date<=today&&window.AcompanaCompatibility.isValidDateOnly(date)).reduce((sum,[,byPatient])=>sum+Object.values(byPatient||{}).reduce((n,list)=>n+(Array.isArray(list)?list.filter(e=>e&&!e.service).length:0),0),0);
  const invalidDates=servicesAll.filter(s=>!window.AcompanaCompatibility.isValidDateOnly(s.date)).length;
  const oldPayments=(S.pay.cfg||[]).reduce((sum,c)=>sum+((c&&Array.isArray(c.pays))?c.pays.length:0),0);
  const oldIndividual=ledger().length;
  const count=(n,one,many)=>`${n} ${n===1?one:many}`;
  const exclusions=[
    oldAssignments&&count(oldAssignments,'asignación antigua sin costo','asignaciones antiguas sin costo'),
    oldPayments&&count(oldPayments,'pago global anterior','pagos globales anteriores'),
    oldIndividual&&count(oldIndividual,'movimiento individual PAG-001','movimientos individuales PAG-001'),
    invalidDates&&count(invalidDates,'jornada con fecha inválida','jornadas con fecha inválida')
  ].filter(Boolean);
  const warning=exclusions.length?`<p class="hint">Fuera del saldo verificable: ${exclusions.join(' · ')}.</p>`:'';
  const dated=moves.filter(m=>isValidDateOnly(m.date)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  const undated=moves.filter(m=>!isValidDateOnly(m.date));
  const movements=[...dated,...undated];
  const rows=movements.map(m=>{
    const validDate=isValidDateOnly(m.date);
    const date=esc(validDate?fmtD(m.date):m.date);
    const dateWarning=validDate?'':'<p class="ledger-date-warning"><strong>Fecha histórica inválida</strong><br>Este registro conserva su importe original, pero la fecha necesita revisión.</p>';
    if(m.type==='cancellation')return `<div class="vrow"><div>${date} · Cancelación de abono<br><span class="hint">Referencia ${esc(m.originalId)}${m.concept?' · '+esc(m.concept):''}</span>${dateWarning}</div><span class="amtv">${A(m.amountCents/100)} MXN</span></div>`;
    const cancelled=summary.cancelledIds.has(m.id);
    return `<div class="vrow"><div>${date}${m.concept?' · '+esc(m.concept):''}<br><span class="hint">${cancelled?'Cancelado':'Abono general recibido'}</span>${dateWarning}</div><span class="amtv">${A(m.amountCents/100)} MXN</span>${cancelled?'':`<button class="link" data-pa="adminCancel" data-id="${esc(m.id)}">Cancelar</button>`}</div>`;
  }).join('');
  const credit=summary.balanceCents<0;
  const heading=credit?'Saldo a favor':summary.balanceCents>0?'Saldo pendiente':'Sin saldo pendiente';
  return `<article class="card admin-summary${credit?' admin-credit':''}"><div class="account-balance"><div class="top"><h2>${heading}</h2><button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver montos'}</button></div>
    <p class="hint">Estado de cuenta con la administradora</p>
    <p class="big">${A(Math.abs(summary.balanceCents)/100)} <small>MXN</small></p></div>
    <dl class="account-breakdown">
      <div><dt>Jornadas registradas hasta hoy</dt><dd>${A(summary.costCents/100)} MXN</dd></div>
      <div><dt>Abonos registrados</dt><dd>${A(summary.receivedCents/100)} MXN</dd></div>
    </dl>${warning}
    <button class="btn" data-pa="adminPay">Registrar abono</button>
    <details class="history" data-panel="general-ledger"><summary>Historial de abonos y cancelaciones · ${moves.length} movimientos</summary><p class="hint">Más recientes primero.${undated.length?' Los movimientos con fecha inválida aparecen al final en el orden del respaldo.':''} Los abonos cancelados conservan su movimiento original y la referencia de cancelación. El saldo reúne los movimientos registrados, sin cierre automático por mes.</p>${rows||'<p class="hint">Todavía no hay movimientos generales.</p>'}</details>
    </article>`;
}

function renderPay(){
  const view=$('#accountView'),status=$('#accountStatus');
  updateHTML(view,generalSummaryHTML());
  updateHTML($('#staffView'),S.p.map((p,i)=>patientHTML(p,i)).join(''));
  const heading=view.querySelector('.account-balance h2').textContent;
  if(status.textContent!==heading)status.textContent=heading;
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
  form('Registrar abono individual',[{id:'nurse',l:'Enfermero/a destinatario',t:'select',options,v:options[0].v},{id:'date',l:'Fecha del pago',t:'date',requireDate:true,v:ymd(new Date())},{id:'amount',l:'Importe del abono (MXN)',v:'',h:'Se aplica en orden de fecha a los servicios pendientes de esa persona. No se aceptan excedentes.'},{id:'concept',l:'Concepto o referencia (opcional)',t:'text',ph:'Ej. transferencia',v:''}],v=>{
    if(!isValidDateOnly(v.date))return'Elige una fecha válida.';
    const cents=toCents(v.amount);if(!Number.isSafeInteger(cents)||cents<=0)return'Escribe un importe mayor que cero, con hasta dos decimales.';
    const allocations=allocatePayment(servicesForPatient,movements,v.nurse,cents,v.date);if(!allocations)return'El abono supera el saldo de servicios de esa persona hasta esa fecha o no hay servicios con saldo.';
    movements.push({id:newId('pay'),patientIndex:i,nurseId:v.nurse,date:v.date,amountCents:cents,concept:v.concept.trim().slice(0,120),allocations});
    save();render();
  },'Guardar abono');
}

function generalPayForm(){
  form('Registrar abono a la administradora',[
    {id:'adminDate',l:'Fecha',t:'date',requireDate:true,v:ymd(new Date())},
    {id:'adminAmount',l:'Importe recibido (MXN)',v:'',h:'El abono reduce el saldo general. El excedente queda a favor para jornadas posteriores.'},
    {id:'adminConcept',l:'Concepto o nota (opcional)',t:'text',ph:'Ej. transferencia',v:''}
  ],v=>{
    const cents=toCents(v.adminAmount);if(!Number.isSafeInteger(cents)||cents<=0)return{field:'adminAmount',message:'Escribe un importe mayor que cero, con hasta dos decimales.'};
    const movements=generalLedger(),current=generalSummary([],movements);
    if(!Number.isSafeInteger(current.receivedCents+cents))return'El total de abonos excede la precisión monetaria segura.';
    return saveGeneralMovement({id:newId('admin_receipt'),type:'receipt',date:v.adminDate,amountCents:cents,concept:v.adminConcept.trim().slice(0,120)});
  },'Guardar abono');
}

function saveGeneralMovement(movement){
  if(!isValidDateOnly(movement.date))return'Elige una fecha válida.';
  const pay={...S.pay,generalLedger:[...generalLedger(),movement]};
  if(!save({...getState(),pay}))return'El movimiento no se guardó. Revisa el aviso de almacenamiento.';
  S.pay=pay;
  render();
}

function cancelGeneralPayForm(id){
  const movements=generalLedger(),summary=generalSummary([],movements);
  const receipt=movements.find(m=>m.id===id&&m.type==='receipt');
  if(!receipt||summary.cancelledIds.has(id)){form('Abono no disponible para cancelar',[],()=>{},'Entendido');return}
  const validReceiptDate=isValidDateOnly(receipt.date);
  form('Cancelar abono recibido',[
    {id:'cancelDate',l:'Fecha de cancelación',t:'date',requireDate:true,v:ymd(new Date())},
    {id:'cancelReason',l:'Motivo (opcional)',t:'text',ph:'Ej. importe capturado incorrectamente',v:''}
  ],v=>{
    if(validReceiptDate&&v.cancelDate<receipt.date)return{field:'cancelDate',message:'La cancelación no puede tener una fecha anterior al abono.'};
    const latest=generalSummary([],generalLedger());
    if(latest.cancelledIds.has(id))return'Este abono ya fue cancelado.';
    return saveGeneralMovement({id:newId('admin_cancel'),type:'cancellation',originalId:id,date:v.cancelDate,amountCents:receipt.amountCents,concept:v.cancelReason.trim().slice(0,120)});
  },'Confirmar cancelación');
  dlg.querySelector('h2').insertAdjacentHTML('afterend',`<p>Se cancelará el abono de <b>${A(receipt.amountCents/100)} MXN</b> del ${esc(validReceiptDate?fmtD(receipt.date):receipt.date)}. El registro original se conservará y el saldo aumentará en ese importe.</p>`);
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
    if(!n)return{field:'nn',message:'Escribe el nombre.'};
    if(!NPAL.includes(v.nc))return'Elige un color.';
    if(nurList(i).some((x,j)=>j!==k&&x.n.toLowerCase()===n.toLowerCase()))return{field:'nn',message:'Ya hay un enfermero/a con ese nombre.'};
    const parseRate=(raw,label)=>{
      if(String(raw).trim()==='')return null;
      const cents=toCents(raw);return Number.isSafeInteger(cents)&&cents>=0?cents:label;
    };
    const full=parseRate(v.rateFull,'La tarifa de jornada completa no es válida.');if(typeof full==='string')return{field:'rateFull',message:full};
    const half=parseRate(v.rateHalf,'La tarifa de media jornada no es válida.');if(typeof half==='string')return{field:'rateHalf',message:half};
    if(full===null&&half===null&&(!cur||cur.ratesCents))return'Configura al menos una modalidad con tarifa. Una tarifa de $0 sí cuenta como configurada.';
    if(cur&&cur.ratesCents){
      if((cur.ratesCents.full!==null&&full===null)||(cur.ratesCents.half!==null&&half===null))return'Para retirar una modalidad usa su acción de retiro, que solicita confirmación.';
    }
    const updated={...cur,id:cur?.id||newId('nurse'),n,c:v.nc};
    if(full!==null||half!==null)updated.ratesCents={full,half};
    const nurses=S.pay.nurses.slice();
    nurses[i]=cur?nurList(i).map(entry=>entry===cur?updated:entry):[...nurList(i),updated];
    const visits={...S.pay.v};
    if(cur&&cur.n!==n){
      Object.entries(visits).forEach(([date,day])=>{
        if(day[i]?.some(entry=>entry.n===cur.n)){
          visits[date]={...day,[i]:day[i].map(entry=>entry.n===cur.n?{...entry,n}:entry)};
        }
      });
    }
    const pay={...S.pay,nurses,v:visits};
    if(!save({...getState(),pay}))return'No se guardaron los datos de enfermería. Revisa el aviso de almacenamiento.';
    S.pay=pay;
    render();
  },'Guardar');
  if(cur){
    $('#f .stack').insertAdjacentHTML('afterend',`<div class="record-actions"><button type="button" class="btn ghost small danger" data-pa="nrm" data-i="${i}" data-k="${k}">${cur.inactive===true?'Reactivar enfermero/a':'Retirar enfermero/a'}</button></div>`);
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

// Detalle de un día: pastillas, pago y enfermeros (los enfermeros se crean en Pagos)
function dayForm(i,ds){
  const p=S.p[i];if(!p||!window.AcompanaCompatibility.isValidDateOnly(ds))return;
  const cv=cover(i),nurses=nurList(i);
  const dt=pd(ds);
  const [y,m,d]=ds.split('-').map(Number);
  const label=dt.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const ev=pillEv(i)[ds];
  let info='';
  if(cv.covered.has(ds))info+='<p class="info">Fecha con atención registrada e imputada al prepago de la ficha.</p>';
  else if(cv.has&&cv.unpaid.includes(ds))info+='<p class="info">Fecha con atención registrada, pendiente en el conteo administrativo de la ficha. Consulta el saldo monetario en Pagos.</p>';
  S.appts.filter(a=>a.i===i&&a.d===ds).forEach(a=>{info+=`<p class="info">🩺 <b>Cita médica</b>${a.t?' a las '+esc(a.t):''}${a.w?': '+esc(a.w):''}${a.n?'<br><span class="hint">'+esc(a.n)+'</span>':''}<br><button type="button" class="link neutral" data-pa="aedit" data-id="${esc(a.id)}">Editar cita</button></p>`});
  if(dt.getDay()===0)info+='<p class="hint">Los domingos solo cuentan como día si hay un enfermero registrado.</p>';
  if(ev&&ev.buy.length)info+=`<p class="info">🛒 Comprar: <b>${ev.buy.map(x=>esc(x)).join(', ')}</b></p>`;
  if(ev&&ev.end.length)info+=`<p class="info">⚠️ Se acaban: <b>${ev.end.map(x=>esc(x)).join(', ')}</b> (última toma completa ese día)</p>`;
  const cur=ents(ds,i);
  const hasGeneralReceipts=generalSummary([],generalLedger()).receivedCents>0;
  const rows=cur.map((e,k)=>{
    const block=assignmentRemovalBlock(e.service,hasGeneralReceipts);
    return `<div class="vrow"><div><span class="dot" style="background:${nurColor(i,e.n)}"></span><b>${esc(e.n)}</b><br><span class="hint">${esc(assignmentLabel(e,nurses))}</span><br><span class="hint">${e.service?'Costo guardado '+A(e.service.amountCents/100)+' MXN':'Sin tarifa conciliable'}</span>${block?`<br><span class="hint">${block}</span>`:''}</div>${block?'':`<button type="button" class="link" data-pa="rm" data-i="${i}" data-d="${ds}" data-k="${k}" aria-label="Quitar asignación de ${esc(e.n)}">Quitar</button>`}</div>`;
  }).join('');
  const list=`<section class="assignment-list"><h3>Asignaciones registradas · ${cur.length}</h3>${rows||'<p class="hint">Sin asignaciones registradas para esta fecha.</p>'}</section>`;
  const duplicateName=S.p.some((other,j)=>j!==i&&other.name===p.name);
  const context=`<p class="assignment-context" id="assignmentContext">${esc(label[0].toUpperCase()+label.slice(1))} · ${esc(p.name)}${duplicateName?' · Ficha '+(i+1):''}</p>`;
  const modes=[
    {type:'full',title:'Completa',description:'Jornada completa',icon:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/>'},
    {type:'half',title:'Media',description:'Media jornada',icon:'<path d="M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z"/>'}
  ];
  const hasRate=cents=>Number.isSafeInteger(cents)&&cents>=0;
  const eligible=nurses.map((n,k)=>({n,k})).filter(({n})=>n.inactive!==true);
  const firstConfigured=eligible.find(({n})=>modes.some(({type})=>hasRate(n.ratesCents?.[type])));
  const fields=[{id:'nm',l:'Enfermero/a',t:'select',v:String(firstConfigured?.k??eligible[0]?.k??''),options:eligible.length?eligible.map(({n,k})=>({v:String(k),l:n.n})):[{v:'',l:'Sin enfermeros activos'}]}];
  form('Asignar enfermero/a',fields,v=>{
    const selected=eligible.find(x=>String(x.k)===v.nm);
    const nurse=selected&&nurList(i)[selected.k],type=dlg.querySelector('[name="serviceType"]:checked')?.value;
    if(!nurse||nurse.inactive===true)return'Elige un enfermero/a activo.';
    const amountCents=nurse.ratesCents?.[type];
    if(!hasRate(amountCents))return'Elige una modalidad con tarifa configurada.';
    const dates=[ds];
    if($('#assignmentWeekly').checked){for(let k=1;;k++){const n2=new Date(y,m-1,d+7*k);if(n2.getMonth()!==m-1)break;dates.push(ymd(n2))}}
    const newDates=dates.filter(date=>!ents(date,i).some(e=>e.n===nurse.n));
    if(!newDates.length)return;
    const cost=allServices().reduce((sum,service)=>sum+service.amountCents,0);
    if(!Number.isSafeInteger(cost+newDates.length*amountCents))return'El total de costos excede la precisión monetaria segura.';
    const nurseId=nurse.id||newId('nurse'),visits={...S.pay.v};
    for(const date of newDates){
      const day=visits[date]||{},prior=day[i]||[];
      visits[date]={...day,[i]:[...prior,{n:nurse.n,service:{id:newId('service'),nurseId,type,amountCents}}]};
    }
    const pay={...S.pay,v:visits};
    if(!nurse.id){
      pay.nurses=S.pay.nurses.slice();
      pay.nurses[i]=nurList(i).map((item,k)=>k===selected.k?{...item,id:nurseId}:item);
    }
    if(!save({...getState(),pay}))return'La asignación no se guardó. Revisa el aviso de almacenamiento.';
    S.pay=pay;
    render();
  },'Asignar');
  const assignmentForm=$('#f'),nurseSelect=$('#nm'),submit=assignmentForm.querySelector('[type=submit]');
  assignmentForm.classList.add('assignment-form');
  assignmentForm.setAttribute('aria-describedby','assignmentContext');
  dlg.querySelector('h2').insertAdjacentHTML('afterend',context+info+list);
  nurseSelect.insertAdjacentHTML('afterend',`
    <fieldset class="assignment-options"><legend>Modalidad</legend><div class="assignment-modes">
      ${modes.map(({type,title,description,icon})=>`<label class="assignment-option"><input type="radio" name="serviceType" value="${type}" aria-label="${description}" aria-describedby="rate-${type}"><span><strong><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${icon}</svg> ${title}</strong><small>${description}</small><b id="rate-${type}"></b></span></label>`).join('')}
    </div></fieldset>
    <fieldset class="assignment-options"><legend>Repetición</legend>
      <label class="assignment-option"><input type="radio" name="assignmentRepeat" value="once" checked>Solo este día</label>
      <label class="assignment-option"><input type="radio" name="assignmentRepeat" id="assignmentWeekly" value="weekly">Cada ${WD_LONG[dt.getDay()]} hasta fin de mes</label>
    </fieldset>
    <div class="assignment-cost"><strong>Costo por jornada</strong><output id="serviceCost" aria-live="polite"></output></div>`);
  nurseSelect.disabled=!eligible.length;
  const radios=[...dlg.querySelectorAll('[name="serviceType"]')];
  function updateCost(){
    const rates=eligible.find(x=>String(x.k)===nurseSelect.value)?.n.ratesCents;
    for(const radio of radios){
      const cents=rates?.[radio.value];
      radio.disabled=!hasRate(cents);
      $('#rate-'+radio.value).textContent=radio.disabled?'Sin configurar':A(cents/100)+' MXN';
      if(radio.disabled)radio.checked=false;
    }
    const selected=radios.find(radio=>radio.checked)||radios.find(radio=>!radio.disabled);
    submit.disabled=!selected;
    if(selected)selected.checked=true;
    $('#serviceCost').textContent=selected?A(rates[selected.value]/100)+' MXN'
      :eligible.length?'Configura una tarifa para este enfermero/a en Pagos.':'Agrega o reactiva un enfermero/a en Pagos.';
  }
  nurseSelect.addEventListener('change',updateCost);
  radios.forEach(radio=>radio.addEventListener('change',updateCost));
  updateCost();
  (nurseSelect.disabled?$('#no'):nurseSelect).focus();
}

// ---------- INSUMOS: usan el mismo cálculo que las pastillas, con un uso fijo por día ----------
  return Object.freeze({patientHTML,renderPay,payForm,payRegForm,individualPayForm,generalPayForm,cancelGeneralPayForm,resetForm,nurseForm,dayForm});
  }
  window.AcompanaCareUI=Object.freeze({create,assignmentLabel});
})();
