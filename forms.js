// Generador compartido de formularios para las funciones actuales.
(() => {
  function create({dialog,query,escape,parseTimes,weekDays,palette,paletteNames}) {
    const dlg=dialog,$=query,esc=escape,WD_SHORT=weekDays,NPAL=palette,NPALN=paletteNames;
function fieldHTML(f){
  if(f.t==='head')return `<div class="chead"><h3>Consumo ${f.k+1}</h3>${f.multi?`<button type="button" class="link rmc" data-k="${f.k}">Quitar</button>`:''}</div>`;
  if(f.t==='wday')return `<label>${f.l}</label><div class="wdays" id="${f.id}" data-v="${f.v===undefined||f.v===null?'':f.v}"></div>`;
  if(f.t==='color')return `<label>${f.l}</label><div class="swatches" id="${f.id}" data-v="${f.v||''}"></div>`;
  if(f.t==='select')return `<label for="${f.id}">${esc(f.l)}</label><select id="${f.id}">${(f.options||[]).map(o=>`<option value="${esc(o.v)}"${String(o.v)===String(f.v)?' selected':''}>${esc(o.l)}</option>`).join('')}</select>${f.h?`<p class="hint">${f.h}</p>`:''}`;
  if(f.t==='date'||f.t==='time')return `<label for="${f.id}">${f.l}</label><input id="${f.id}" type="${f.t}" value="${esc(f.v||'')}">${f.h?`<p class="hint">${f.h}</p>`:''}`;
  if(f.t==='times')return `<label>${f.l}</label><div id="${f.id}"></div><button type="button" class="btn ghost small" id="addt-${f.id}" style="margin-top:6px">+ Otra hora</button>`;
  if(f.t==='schedule')return `<label>${f.l}</label>
    <div class="schtabs" role="tablist" id="${f.id}-tabs">
      <button type="button" class="stab" data-v="daily">Diario</button>
      <button type="button" class="stab" data-v="weekdays">Días fijos</button>
      <button type="button" class="stab" data-v="interval">Cada X días</button>
    </div>
    <div class="schpane" id="${f.id}-daily"><p class="hint">Se toma todos los días.</p></div>
    <div class="schpane" id="${f.id}-weekdays" hidden><div class="wdays" id="${f.id}-wdbtns"></div></div>
    <div class="schpane" id="${f.id}-interval" hidden>
      <label for="${f.id}-n">¿Cada cuántos días? (1 = diario, 2 = un día sí y uno no...)</label>
      <input id="${f.id}-n" type="number" min="1" step="1" value="${(f.v&&f.v.n)||2}">
    </div>`;
  return `<label for="${f.id}">${f.l}</label><input id="${f.id}" ${f.t==='text'?'':'inputmode="decimal"'} type="${f.t==='text'?'text':'number'}" step="any" min="0" value="${esc(f.v??'')}" placeholder="${esc(f.ph||'')}">${f.presets?`<div class="presets">${f.presets.map(p=>`<button type="button" class="pbtn" data-set="${f.id}" data-val="${p.v}" aria-pressed="${String(f.v)===p.v}">${p.l}</button>`).join('')}</div>`:''}${f.h?`<p class="hint">${f.h}</p>`:''}`;
}

function form(title,fields,ok,btn='Guardar'){
  dlg.innerHTML=`<form method="dialog" id="f"><h2>${title}</h2>${fields.map(fieldHTML).join('')}<p class="err" id="err" role="alert" aria-live="polite"></p>
  <div class="stack"><button class="btn" type="submit">${btn}</button><button class="btn ghost" type="button" id="no">Cancelar</button></div></form>`;
  $('#no').onclick=()=>dlg.close();

  fields.filter(f=>f.t==='times').forEach(tf=>{
    const box=$('#'+tf.id);
    const addRow=(v='')=>{const d=document.createElement('div');d.className='trow';d.innerHTML='<input type="time" aria-label="Hora de la toma"><button type="button" aria-label="Quitar hora">×</button>';d.querySelector('input').value=v;d.querySelector('button').onclick=()=>{if(box.children.length>1)d.remove()};box.appendChild(d)};
    (tf.v||['08:00']).forEach(addRow);
    $('#addt-'+tf.id).onclick=()=>addRow('');
  });

  fields.filter(f=>f.t==='schedule').forEach(sf=>{
    const init=sf.v||{type:'daily'};
    const tabs=$('#'+sf.id+'-tabs');
    const panes={daily:$('#'+sf.id+'-daily'),weekdays:$('#'+sf.id+'-weekdays'),interval:$('#'+sf.id+'-interval')};
    const setTab=v=>{[...tabs.children].forEach(b=>b.setAttribute('aria-selected',String(b.dataset.v===v)));Object.entries(panes).forEach(([k,el])=>el.hidden=k!==v);tabs.dataset.cur=v};
    tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;setTab(b.dataset.v)});
    setTab(init.type||'daily');
    const wdbox=$('#'+sf.id+'-wdbtns');
    const selDays=new Set(init.days||[]);
    WD_SHORT.forEach((lbl,i)=>{
      const b=document.createElement('button');b.type='button';b.className='wdaybtn';b.textContent=lbl[0].toUpperCase();b.setAttribute('aria-pressed',String(selDays.has(i)));
      b.onclick=()=>{if(selDays.has(i))selDays.delete(i);else selDays.add(i);b.setAttribute('aria-pressed',String(selDays.has(i)))};
      wdbox.appendChild(b);
    });
    sf._selDays=selDays;
    sf._start=init.start||Date.now();
  });

  fields.filter(f=>f.t==='wday').forEach(wf=>{
    const box=$('#'+wf.id);const cur=box.dataset.v;
    [1,2,3,4,5,6,0].forEach(i=>{
      const b=document.createElement('button');b.type='button';b.className='wdaybtn w';b.dataset.i=String(i);b.textContent=WD_SHORT[i];
      b.setAttribute('aria-pressed',String(String(i)===cur));
      b.onclick=()=>{box.dataset.v=String(i);[...box.children].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.i===String(i))))};
      box.appendChild(b);
    });
  });

  fields.filter(f=>f.t==='color').forEach(cf=>{
    const box=$('#'+cf.id);
    NPAL.forEach((c,k)=>{
      const b=document.createElement('button');b.type='button';b.className='swbtn';b.dataset.c=c;b.style.background=c;b.setAttribute('aria-label',NPALN[k]);
      b.setAttribute('aria-pressed',String(c===box.dataset.v));
      b.onclick=()=>{box.dataset.v=c;[...box.children].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.c===c)))};
      box.appendChild(b);
    });
  });

  // Lee todos los campos del formulario actual
  const collect=()=>{
    const v={};
    fields.forEach(f=>{
      if(f.t==='head')return;
      if(f.t==='wday'||f.t==='color')v[f.id]=$('#'+f.id).dataset.v||'';
      else if(f.t==='times')v[f.id]=[...$('#'+f.id).querySelectorAll('input')].map(i=>i.value).filter(Boolean).join(',');
      else if(f.t==='schedule'){
        const cur=$('#'+f.id+'-tabs').dataset.cur;
        if(cur==='weekdays')v[f.id]={type:'weekdays',days:[...f._selDays].sort()};
        else if(cur==='interval')v[f.id]={type:'interval',n:Math.max(1,parseInt($('#'+f.id+'-n').value)||2),start:f._start};
        else v[f.id]={type:'daily'};
      }
      else v[f.id]=$('#'+f.id).value;
    });
    return v;
  };
  dlg._collect=collect;

  $('#f').onsubmit=e=>{
    e.preventDefault();
    const r=ok(collect());
    if(r){$('#err').textContent=r}else dlg.close();
  };
  if(!dlg.open)dlg.showModal();
}
    return form;
  }
  window.AcompanaForms=Object.freeze({create});
})();
