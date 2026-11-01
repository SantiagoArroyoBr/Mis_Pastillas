// Inventario, consumos, compras, precios y formularios de medicinas/insumos.
(() => {
  function create({getState,save,render,form,query,escape,dates,calc,events,parseTimes,calendarUrl,amount,amountVisible,unit,dialog}) {
    const S=new Proxy({}, {get:(_,key)=>getState()[key],set:(_,key,value)=>{getState()[key]=value;return true}});
    const $=query,esc=escape,dlg=dialog,{ymd,pd,fmt}=dates,evs=events,calUrl=calendarUrl,A=amount,amtOn=amountVisible,un=unit;const supCons=u=>[{dose:u,times:['08:00'],schedule:{type:'daily'}}];
function supForm(title,D,onSave,btn){
  form(title,[
    {id:'n',l:'Nombre del insumo',t:'text',ph:'Ej. Pañales',v:D.name},
    {id:'q',l:'Piezas que hay ahora',ph:'Ej. 30',v:D.q},
    {id:'u',l:'Piezas que se usan al día',ph:'Ej. 3',v:D.use,h:'Puede ser decimal: ½ equivale a una pieza cada dos días.'}
  ],v=>{
    if(!v.n.trim())return'Escribe el nombre del insumo.';
    const q=pos(v.q);if(!(q>=0)||v.q==='')return'Escribe cuántas piezas hay.';
    const u=pos(v.u);if(!(u>0))return'Escribe cuántas piezas se usan al día.';
    onSave(v.n.trim().slice(0,40),q,u);
  },btn);
}
function supAdd(P){
  supForm('Agregar insumo',{name:'',q:'',use:''},(name,q,u)=>{P.meds.push({name,base:q,cons:supCons(u),t0:Date.now(),kind:'sup'});save();render()},'Agregar');
}
function supEdit(m){
  const c=calc(m);
  supForm('Editar: '+esc(m.name),{name:m.name,q:c.rem,use:(m.cons[0]||{}).dose||'1'},(name,q,u)=>{m.name=name;m.base=q;m.cons=supCons(u);m.t0=Date.now();save();render()},'Guardar cambios');
}


// ---------- PRECIOS: se anotan a mano (lo que se pagó o lo que se vio en la farmacia) ----------
const unit1=m=>m.kind==='sup'?'pieza':'pastilla';
function addBuy(m,p,n,shop,d){
  if(!Array.isArray(m.buys))m.buys=[];
  m.buys.push({d:d||ymd(new Date()),p,n,w:String(shop||'').trim().slice(0,40)});
  m.buys.sort((a,b)=>a.d.localeCompare(b.d));
  if(m.buys.length>40)m.buys=m.buys.slice(-40);
}
const buyList=m=>(Array.isArray(m.buys)?m.buys:[]).filter(b=>b&&b.n>0&&isFinite(b.p));
const validBuyList=m=>buyList(m).filter(b=>window.AcompanaCompatibility.isValidDateOnly(b.d));
const unitPrice=b=>b.p/b.n;
const usage30=m=>evs(m,Date.now(),Date.now()+30*864e5).reduce((s2,e)=>s2+e.d,0);
function monthCost(m){const L=validBuyList(m);return L.length?unitPrice(L[L.length-1])*usage30(m):null}
function bestShop(m){ // la tienda con el precio más bajo, según su última anotación
  const by=new Map();
  validBuyList(m).forEach(b=>{if(b.w)by.set(b.w.toLowerCase(),b)});
  if(by.size<2)return null;
  let best=null;by.forEach(b=>{if(!best||unitPrice(b)<unitPrice(best))best=b});
  return best;
}
function shopPresets(){
  const seen=[];
  S.p.forEach(p=>p.meds.forEach(m=>buyList(m).slice().reverse().forEach(b=>{if(b.w&&!seen.includes(b.w))seen.push(b.w)})));
  return seen.slice(0,6).map(x=>({l:esc(x),v:esc(x)}));
}
function priceLine(m){
  const all=buyList(m),L=validBuyList(m);if(!all.length)return'';
  if(!L.length)return `<p class="info">Hay anotaciones de precio con fecha inválida, conservadas en el historial y excluidas de estimaciones. Corrige una anotación mediante una nueva entrada con fecha válida.</p>`;
  const b=L[L.length-1],u=unitPrice(b),mo=monthCost(m);
  let chg='';
  if(L.length>1){const up=unitPrice(L[L.length-2]);if(up>0){const pc=Math.round((u-up)/up*100);if(pc!==0)chg=' · '+(pc>0?'↑ ':'↓ ')+Math.abs(pc)+'% frente a la anotación anterior'}}
  const days=Math.round((Date.now()-pd(b.d).getTime())/864e5);
  const when=days<=0?'hoy':days===1?'ayer':'hace '+days+' días';
  const bs=bestShop(m);
  const cheaper=(bs&&bs.w.toLowerCase()!==(b.w||'').toLowerCase())?' Más barata: '+esc(bs.w)+' ('+A(unitPrice(bs))+' por '+unit1(m)+').':'';
  return `<p class="info">💲 <b>${A(u)}</b> por ${unit1(m)} · unos <b>${A(mo)}</b> al mes <button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver'}</button><br><span class="hint">${b.w?esc(b.w)+' · ':''}${when}${chg}.${cheaper}${all.length>L.length?' Hay anotaciones históricas con fechas inválidas conservadas en el historial; no se usan para estimar.':''}</span></p>`;
}
function spendHTML(){
  let any=false,missing=0;
  const per=S.p.map(p=>{let t=0;p.meds.forEach(m=>{const c=monthCost(m);if(c===null)missing++;else{any=true;t+=c}});return t});
  if(!any)return'';
  const tot=per.reduce((a,b)=>a+b,0);
  return `<article class="card blue"><div class="top"><h3 class="name">💲 Gasto al mes (aprox.)</h3></div>
    ${S.p.map((p,i)=>`<div class="vrow"><div><b>${esc(p.name)}</b></div><span class="amtv">${A(per[i])}</span></div>`).join('')}
    <div class="vrow"><b>Total</b><span class="amtv">${A(tot)}</span></div>
    <p class="hint">Medicinas e insumos, con el último precio anotado y el consumo de los próximos 30 días.${missing?' Faltan precios de '+missing+'.':''}</p>
    <button class="link neutral" data-pa="show">${amtOn()?'🙈 Ocultar':'👁 Ver montos'}</button></article>`;
}
function priceForm(pi,mi){
  const m=S.p[pi]&&S.p[pi].meds[mi];if(!m)return;
  const rows=(m.buys||[]).map((b,k)=>({b,k})).filter(x=>x.b&&x.b.n>0&&isFinite(x.b.p)).slice(-8).reverse();
  form('Precios: '+esc(m.name),[
    {id:'pcost',l:'Precio total',ph:'Ej. 180'},
    {id:'pun',l:'¿Para cuántas '+un(m)+'?',ph:'Ej. 30'},
    {id:'pshop',l:'¿Dónde? (opcional)',t:'text',ph:'Ej. Farmacia del Ahorro',presets:shopPresets()},
    {id:'pdate',l:'Fecha',t:'date',v:ymd(new Date())}
  ],v=>{
    if(String(v.pcost).trim()===''&&String(v.pun).trim()==='')return;
    const pr=pos(v.pcost),n=pos(v.pun);
    if(String(v.pcost).trim()===''||!(pr>=0))return'Escribe el precio total.';
    if(!(n>0))return'Escribe para cuántas '+un(m)+' es ese precio.';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.pdate))return'Elige la fecha.';
    addBuy(m,pr,n,v.pshop,v.pdate);save();render();
  },'Anotar precio');
  const list=rows.length
    ? '<div>'+rows.map(({b,k})=>`<div class="vrow"><div><b>${esc(fmtD(b.d))}</b>${b.w?' · '+esc(b.w):''}<br><span class="hint">${money(b.p)} por ${num(b.n)} ${un(m)} · ${money(unitPrice(b))} por ${unit1(m)}</span></div><button type="button" class="link" data-pa="prm" data-i="${pi}" data-m="${mi}" data-k="${k}">Quitar</button></div>`).join('')+'</div>'
    : '<p class="hint">Aún no hay precios anotados. Anota lo que pagaste o lo que viste en la farmacia.</p>';
  dlg.querySelector('h2').insertAdjacentHTML('afterend',list);
}


function result(m){
  const c=calc(m);
  dlg.innerHTML=`<h2>¡Listo!</h2><p>${esc(m.name)}: ahora hay <b>${num(c.rem)} ${un(m)}</b>.<br>Conviene comprar de nuevo <b>${c.now?'hoy':'antes del '+fmt(c.buy)}</b>.</p>
  <div class="stack"><a class="btn cal" target="_blank" rel="noopener" href="${calUrl('Comprar '+m.name+' (aprox.)',c.buy,'Quedan '+num(c.rem)+' '+un(m)+' de '+m.name+'.')}">📅 Avisarme en Calendario</a><button class="btn ghost" id="cl">Cerrar</button></div>`;
  $('#cl').onclick=()=>dlg.close();if(!dlg.open)dlg.showModal();
}
const pos=v=>{const n=parseFloat(String(v).replace(',','.'));return isFinite(n)?n:NaN};

// ---- Formulario de medicina con varios consumos (agregar y editar) ----
const PRE=[{l:'¼',v:'0.25'},{l:'½',v:'0.5'},{l:'¾',v:'0.75'},{l:'1',v:'1'},{l:'1½',v:'1.5'},{l:'2',v:'2'}];
const newCons=()=>({dose:'1',schedule:{type:'daily'},times:['08:00']});

// D = {name, q, cons:[{dose,schedule,times}]} ; onSave(name, cantidad, consumosLimpios)
function medForm(title,D,onSave,btn){
  const f=[
    {id:'n',l:'Nombre de la medicina',t:'text',ph:'Ej. Losartán',v:D.name},
    {id:'q',l:'Pastillas que hay ahora',ph:'Ej. 30',v:D.q}
  ];
  D.cons.forEach((c,k)=>{
    f.push({t:'head',id:'c'+k,k,multi:D.cons.length>1},
      {id:'d'+k,l:'Pastillas por toma',v:c.dose,presets:PRE},
      {id:'sch'+k,l:'¿Cada cuándo se toma?',t:'schedule',v:c.schedule},
      {id:'h'+k,l:'Horas de las tomas',t:'times',v:c.times});
  });
  form(title,f,v=>{
    if(!v.n.trim())return'Escribe el nombre de la medicina.';
    const q=pos(v.q);
    if(!(q>=0)||v.q==='')return'Escribe cuántas pastillas hay.';
    const cons=[];
    for(let k=0;k<D.cons.length;k++){
      const d=pos(v['d'+k]),h=parseTimes(v['h'+k]),s=v['sch'+k],tag='Consumo '+(k+1)+': ';
      if(!(d>0))return tag+'escribe cuántas pastillas se toman cada vez (puede ser ½, ¼, etc.).';
      if(s.type==='weekdays'&&(!s.days||!s.days.length))return tag+'elige al menos un día de la semana.';
      if(!h||!h.length)return tag+(h===null?'revisa el formato de las horas (ej. 08:00).':'agrega al menos una hora.');
      cons.push({dose:d,times:h,schedule:s});
    }
    onSave(v.n.trim(),q,cons);
  },btn);

  // Lee lo que ya escribió el usuario para no perderlo al agregar/quitar consumos
  const read=()=>{
    const v=dlg._collect();
    return{name:v.n,q:v.q,cons:D.cons.map((_,k)=>({dose:v['d'+k],schedule:v['sch'+k],times:parseTimes(v['h'+k])||['08:00']}))};
  };
  $('#err').insertAdjacentHTML('beforebegin','<button type="button" class="btn ghost" id="addc" style="margin-top:16px">+ Agregar otro consumo</button>');
  $('#addc').onclick=()=>{const r=read();r.cons.push(newCons());medForm(title,r,onSave,btn)};
  dlg.querySelectorAll('.rmc').forEach(b=>b.onclick=()=>{const r=read();r.cons.splice(+b.dataset.k,1);medForm(title,r,onSave,btn)});
}


    return Object.freeze({supCons,supAdd,supEdit,unit1,addBuy,buyList,unitPrice,usage30,monthCost,bestShop,shopPresets,priceLine,spendHTML,priceForm,result,pos,PRE,newCons,medForm});
  }
  window.AcompanaInventory=Object.freeze({create});
})();
