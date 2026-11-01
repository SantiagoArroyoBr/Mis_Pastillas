// Normalización de versiones y validación de datos persistidos/importados. No accede a localStorage.
(() => {
// Convierte medicinas del formato viejo (dose/times/schedule) al nuevo (cons = lista de consumos)
const NPAL=['#C92A2A','#1864AB','#2B8A3E','#862E9C','#A61E4D','#0B7285','#B45309','#5F3DC4'];
const NPALN=['Rojo','Azul','Verde','Morado','Rosa','Turquesa','Naranja','Índigo'];
function migrate(d){
  (d.p||[]).forEach(p=>{
    if(!Array.isArray(p.meds))p.meds=[];
    p.meds.forEach(m=>{
      if(!Array.isArray(m.cons)){
        m.cons=[{dose:+m.dose||1,times:(Array.isArray(m.times)&&m.times.length)?m.times:['08:00'],schedule:m.schedule||{type:'daily'}}];
        delete m.dose;delete m.times;delete m.schedule;
      }
    });
  });
  if(!d.pay||typeof d.pay!=='object'||Array.isArray(d.pay))d.pay={};
  const z=d.pay;
  if(Array.isArray(z.w)){ // formato anterior: un pago por paciente
    const w0=z.w.find(x=>x&&x.who);
    if(w0&&!z.who){z.who=w0.who;z.day=w0.day;z.note=w0.note||'';z.paid=w0.paid||''}
    if(!Array.isArray(z.nurses))z.nurses=[];
    if(!z.v||typeof z.v!=='object'||Array.isArray(z.v))z.v={};
    z.w.forEach((w,i)=>{
      if(!w||!w.v)return;
      Object.keys(w.v).forEach(k=>{
        const n=w.v[k];if(!n||typeof n!=='string')return;
        (z.v[k]=z.v[k]||{})[i]=[{n,s:'full'}];
        z.nurses[i]=Array.isArray(z.nurses[i])?z.nurses[i]:[];
        if(!z.nurses[i].includes(n))z.nurses[i].push(n);
      });
    });
    delete z.w;
  }
  if(typeof z.who!=='string')z.who='';
  z.day=+z.day;if(!(z.day>=0&&z.day<=6))z.day=5;
  if(typeof z.note!=='string')z.note='';
  if(typeof z.paid!=='string')z.paid='';
  if(Array.isArray(z.shifts))z.shifts=z.shifts.filter(x=>x&&x.id!==undefined&&x.id!=='').map(x=>({id:String(x.id),n:String(x.n||'Turno'),a:(x.a===null||x.a===undefined||x.a===''||!isFinite(+x.a))?null:+x.a}));
  if(!Array.isArray(z.shifts)||!z.shifts.length)z.shifts=[{id:'full',n:'Turno completo',a:null},{id:'half',n:'Medio turno',a:null}];
  if(!Array.isArray(z.nurses))z.nurses=[];
  z.nurses=z.nurses.map(a=>Array.isArray(a)?a.map((x,k)=>{
    if(typeof x==='string'&&x)return{n:x,c:NPAL[k%NPAL.length]};
    if(x&&typeof x.n==='string'&&x.n)return{...(typeof x.id==='string'&&x.id?{id:x.id}:{}),n:x.n,c:NPAL.includes(x.c)?x.c:NPAL[k%NPAL.length]};
    return null;
  }).filter(Boolean):[]);
  if(!z.v||typeof z.v!=='object'||Array.isArray(z.v))z.v={};
  if(!Array.isArray(z.ledger))z.ledger=[];
  const defShifts=()=>[{id:'full',n:'Turno completo',a:null},{id:'half',n:'Medio turno',a:null}];
  const normShifts=a=>{
    const o=(Array.isArray(a)?a:[]).filter(x=>x&&x.id!==undefined&&x.id!=='').map(x=>({id:String(x.id),n:String(x.n||'Turno'),a:(x.a===null||x.a===undefined||x.a===''||!isFinite(+x.a))?null:+x.a}));
    return o.length?o:defShifts();
  };
  if(!Array.isArray(z.cfg)){ // formato anterior: un solo pago para todos; se copia a cada paciente
    z.cfg=(d.p||[]).map(()=>({who:z.who,day:z.day,note:z.note,paid:z.paid,shifts:normShifts(z.shifts)}));
  }
  z.cfg=(d.p||[]).map((_,i)=>{
    const c=(z.cfg[i]&&typeof z.cfg[i]==='object')?z.cfg[i]:{};
    const pays=(Array.isArray(c.pays)?c.pays:[]).filter(x=>x&&Number.isInteger(+x.n)&&+x.n>=1).map(x=>({d:typeof x.d==='string'?x.d:'',n:+x.n,a:(x.a===null||x.a===undefined||x.a===''||!isFinite(+x.a))?null:+x.a,old:!!x.old}));
    const ld=Math.floor(+c.lead);
    const rt=(c.rate===null||c.rate===undefined||c.rate===''||!isFinite(+c.rate))?null:+c.rate;
    return{
      who:typeof c.who==='string'?c.who:'',
      note:typeof c.note==='string'?c.note:'',
      lead:(ld>=1&&ld<=14)?ld:2,
      base:(typeof c.base==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.base))?c.base:'',
      pays,
      time:c.time==='half'?'half':'full',
      rate:rt
    };
  });
  delete z.who;delete z.day;delete z.note;delete z.paid;delete z.shifts;
  d.appts=(Array.isArray(d.appts)?d.appts:[]).filter(a=>a&&typeof a.d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.d)&&Number.isInteger(+a.i)&&+a.i>=0&&+a.i<(d.p||[]).length).map(a=>({id:String(a.id||('a'+Math.random().toString(36).slice(2,8))),i:+a.i,d:a.d,t:/^\d{2}:\d{2}$/.test(a.t||'')?a.t:'',w:typeof a.w==='string'?a.w.slice(0,80):'',n:typeof a.n==='string'?a.n.slice(0,200):''}));
  (d.p||[]).forEach(p=>p.meds.forEach(m=>{
    if(m.kind!=='sup')delete m.kind;
    m.buys=(Array.isArray(m.buys)?m.buys:[]).filter(b=>b&&/^\d{4}-\d{2}-\d{2}$/.test(b.d||'')&&isFinite(+b.p)&&+b.p>=0&&+b.n>0).map(b=>({d:b.d,p:+b.p,n:+b.n,w:typeof b.w==='string'?b.w.slice(0,40):''}));
    if(!m.buys.length)delete m.buys;
  }));
  if(!['home','meds','pay'].includes(d.mode))d.mode='home';
  return d;
}
function defaultState(){
  return migrate({sel:0,last:'',p:[{name:'Persona 1',meds:[]},{name:'Persona 2',meds:[]}],pay:{},appts:[],mode:'home'});
}

function validateStoredState(d){
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const fail=msg=>{throw new Error(msg)};
  if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.p))fail('Estructura principal no válida.');
  d.p.forEach((p,i)=>{
    if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.meds))fail('Lista de medicinas no válida en el paciente '+(i+1)+'.');
    p.meds.forEach((m,j)=>{
      if(!m||typeof m!=='object'||Array.isArray(m))fail('Registro de medicina no válido.');
      if(own(m,'cons')){
        if(!Array.isArray(m.cons))fail('Lista de consumos no válida.');
        m.cons.forEach(c=>{
          if(!c||typeof c!=='object'||Array.isArray(c)||!Array.isArray(c.times))fail('Consumo de medicina incompleto.');
        });
      }
      if(own(m,'buys')){
        if(!Array.isArray(m.buys))fail('Historial de compras no válido.');
        m.buys.forEach(b=>{
          if(!b||typeof b!=='object'||!/^\d{4}-\d{2}-\d{2}$/.test(b.d||'')||!isFinite(+b.p)||+b.p<0||!isFinite(+b.n)||+b.n<=0)fail('Registro de compra incompleto.');
        });
      }
    });
  });
  if(own(d,'appts')){
    if(!Array.isArray(d.appts))fail('Lista de citas no válida.');
    d.appts.forEach(a=>{
      if(!a||typeof a!=='object'||typeof a.d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(a.d)||!Number.isInteger(+a.i)||+a.i<0||+a.i>=d.p.length)fail('Registro de cita incompleto.');
    });
  }
  if(own(d,'pay')){
    const z=d.pay;
    if(!z||typeof z!=='object'||Array.isArray(z))fail('Datos de pagos no válidos.');
    ['w','shifts','nurses','cfg'].forEach(k=>{if(own(z,k)&&!Array.isArray(z[k]))fail('Estructura de pagos no válida: '+k+'.')});
    if(own(z,'v')&&(!z.v||typeof z.v!=='object'||Array.isArray(z.v)))fail('Asignaciones de pagos no válidas.');
    if(own(z,'ledger')&&!Array.isArray(z.ledger))fail('Libro de pagos individuales no válido.');
    if(z.v&&typeof z.v==='object')Object.values(z.v).forEach(byPatient=>{
      if(!byPatient||typeof byPatient!=='object'||Array.isArray(byPatient))fail('Asignación por fecha no válida.');
      Object.values(byPatient).forEach(list=>{if(!Array.isArray(list))fail('Lista de asignaciones no válida.');list.forEach(e=>{if(e&&own(e,'service')){const s=e.service;if(!s||typeof s!=='object'||typeof s.id!=='string'||!s.id||typeof s.nurseId!=='string'||!s.nurseId||!['full','half'].includes(s.type)||!Number.isSafeInteger(s.amountCents)||s.amountCents<0)fail('Servicio nuevo incompleto.')}})});
    });
    if(Array.isArray(z.shifts))z.shifts.forEach(s=>{if(!s||typeof s!=='object'||s.id===undefined||s.id==='')fail('Registro de turno incompleto.')});
    if(Array.isArray(z.cfg))z.cfg.forEach(c=>{
      if(!c||typeof c!=='object'||Array.isArray(c))fail('Configuración de pagos no válida.');
      if(own(c,'pays')){
        if(!Array.isArray(c.pays))fail('Historial de pagos no válido.');
        c.pays.forEach(p=>{if(!p||typeof p!=='object'||!Number.isInteger(+p.n)||+p.n<1)fail('Registro de pago incompleto.')});
      }
    });
    if(Array.isArray(z.nurses))z.nurses.forEach(n=>{
      if(!Array.isArray(n))fail('Lista de enfermeros no válida.');
      n.forEach(x=>{if(!(typeof x==='string'&&x)&&!(x&&typeof x.n==='string'&&x.n))fail('Registro de enfermero incompleto.');if(x&&typeof x==='object'&&own(x,'id')&&(typeof x.id!=='string'||!x.id))fail('Identificador de enfermero no válido.')});
    });
    if(Array.isArray(z.ledger))z.ledger.forEach(m=>{
      if(!m||typeof m!=='object'||typeof m.id!=='string'||!m.id||!Number.isInteger(m.patientIndex)||m.patientIndex<0||m.patientIndex>=d.p.length||typeof m.nurseId!=='string'||!m.nurseId||typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isSafeInteger(m.amountCents)||m.amountCents<=0||!Array.isArray(m.allocations))fail('Movimiento de pago individual incompleto.');
      let sum=0;m.allocations.forEach(a=>{if(!a||typeof a.serviceId!=='string'||!a.serviceId||!Number.isSafeInteger(a.amountCents)||a.amountCents<=0)fail('Aplicación de abono no válida.');sum+=a.amountCents});
      if(sum!==m.amountCents)fail('El importe del movimiento no coincide con sus aplicaciones.');
    });
    const nurseIds=new Set(),serviceIds=new Map(),movementIds=new Set();
    (z.nurses||[]).forEach((list,i)=>list.forEach(n=>{if(n&&typeof n==='object'&&n.id){if(nurseIds.has(n.id))fail('Hay identificadores de enfermero duplicados.');nurseIds.add(n.id)}}));
    Object.entries(z.v||{}).forEach(([date,byPatient])=>Object.entries(byPatient||{}).forEach(([patientIndex,list])=>list.forEach(e=>{
      if(!e||!e.service)return;const s=e.service;
      if(serviceIds.has(s.id))fail('Hay identificadores de servicio duplicados.');
      if(!((z.nurses&&z.nurses[+patientIndex])||[]).some(n=>n&&typeof n==='object'&&n.id===s.nurseId))fail('El servicio no coincide con un enfermero de su ficha.');
      serviceIds.set(s.id,{nurseId:s.nurseId,patientIndex:+patientIndex,amountCents:s.amountCents,date});
    })));
    const serviceCosts=new Map();serviceIds.forEach(s=>{const total=(serviceCosts.get(s.nurseId)||0)+s.amountCents;if(!Number.isSafeInteger(total))fail('El total de costos excede la precisión monetaria segura.');serviceCosts.set(s.nurseId,total)});
    const allocated=new Map();
    (z.ledger||[]).forEach(m=>{
      if(movementIds.has(m.id))fail('Hay identificadores de movimiento duplicados.');movementIds.add(m.id);
      m.allocations.forEach(a=>{const service=serviceIds.get(a.serviceId);if(!service||service.nurseId!==m.nurseId||service.patientIndex!==m.patientIndex)fail('Un abono está aplicado a un servicio de otra persona o ficha.');if(service.date>m.date)fail('Un abono no puede aplicarse a un servicio posterior a su fecha.');const total=(allocated.get(a.serviceId)||0)+a.amountCents;if(!Number.isSafeInteger(total)||total>service.amountCents)fail('Los abonos exceden el costo registrado del servicio.');allocated.set(a.serviceId,total)});
    });
  }
  return d;
}

// Comprueba todos los registros que migrate() podría filtrar, sustituir o descartar.
// La validación se ejecuta antes de migrar para impedir pérdidas silenciosas.
function validateMigrationInput(d){
  validateStoredState(d);
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const fail=msg=>{throw new Error('Migración rechazada: '+msg)};
  const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
  const validAmount=v=>v===null||v===undefined||v===''||Number.isFinite(+v);
  const validTimes=a=>Array.isArray(a)&&a.length>0&&a.every(t=>{
    if(typeof t!=='string'||!/^\d{2}:\d{2}$/.test(t))return false;
    const [h,m]=t.split(':').map(Number);
    return h>=0&&h<=23&&m>=0&&m<=59;
  });
  const validSchedule=sch=>{
    if(sch===undefined||sch===null)return true;
    if(typeof sch!=='object'||Array.isArray(sch))return false;
    if(sch.type!==undefined&&!['daily','weekdays','interval'].includes(sch.type))return false;
    if(sch.type==='weekdays')return Array.isArray(sch.days)&&sch.days.length>0&&sch.days.every(x=>Number.isInteger(+x)&&+x>=0&&+x<=6);
    if(sch.type==='interval')return Number.isInteger(+sch.n)&&+sch.n>=1;
    return true;
  };
  d.p.forEach((p,i)=>p.meds.forEach((m,j)=>{
    if(own(m,'kind')&&m.kind!=='sup')fail('tipo de registro desconocido en paciente '+(i+1)+', elemento '+(j+1)+'.');
    if(Array.isArray(m.cons)){
      m.cons.forEach((c,k)=>{
        if(!Number.isFinite(+c.dose)||+c.dose<=0||!validTimes(c.times)||!validSchedule(c.schedule))fail('consumo incompleto en paciente '+(i+1)+', elemento '+(j+1)+', consumo '+(k+1)+'.');
      });
    }else{
      if(own(m,'dose')&&(!Number.isFinite(+m.dose)||+m.dose<=0))fail('dosis histórica no válida en paciente '+(i+1)+', elemento '+(j+1)+'.');
      if(own(m,'times')&&!validTimes(m.times))fail('horarios históricos no válidos en paciente '+(i+1)+', elemento '+(j+1)+'.');
      if(own(m,'schedule')&&!validSchedule(m.schedule))fail('frecuencia histórica no válida en paciente '+(i+1)+', elemento '+(j+1)+'.');
    }
    if(Array.isArray(m.buys))m.buys.forEach((b,k)=>{
      if(own(b,'w')&&typeof b.w!=='string')fail('la tienda de la compra '+(k+1)+' no es texto.');
    });
  }));
  if(Array.isArray(d.appts))d.appts.forEach((a,i)=>{
    if(own(a,'id')&&typeof a.id!=='string')fail('el identificador de la cita '+(i+1)+' no es texto.');
    if(own(a,'t')&&a.t!==''&&!/^\d{2}:\d{2}$/.test(a.t))fail('la hora de la cita '+(i+1)+' no se puede conservar.');
    if(own(a,'w')&&typeof a.w!=='string')fail('el lugar o profesional de la cita '+(i+1)+' no es texto.');
    if(own(a,'n')&&typeof a.n!=='string')fail('las notas de la cita '+(i+1)+' no son texto.');
  });
  const z=d.pay||{};
  if(own(z,'who')&&typeof z.who!=='string')fail('el responsable histórico del pago no es texto.');
  if(own(z,'day')&&(!Number.isInteger(+z.day)||+z.day<0||+z.day>6))fail('el día de pago histórico no es válido.');
  if(own(z,'note')&&typeof z.note!=='string')fail('la nota histórica de pago no es texto.');
  if(own(z,'paid')&&typeof z.paid!=='string')fail('la fecha histórica de pago no es texto.');
  if(Array.isArray(z.shifts))z.shifts.forEach((x,i)=>{
    if(!x||typeof x!=='object'||x.id===undefined||x.id==='')fail('el turno '+(i+1)+' no tiene identificador y sería descartado.');
    if(own(x,'n')&&typeof x.n!=='string')fail('el nombre del turno '+(i+1)+' no se puede conservar.');
    if(own(x,'a')&&!validAmount(x.a))fail('el importe del turno '+(i+1)+' no se puede conservar.');
  });
  if(Array.isArray(z.nurses))z.nurses.forEach((list,i)=>list.forEach((n,j)=>{
    if(n&&typeof n==='object'&&own(n,'c')&&!NPAL.includes(n.c))fail('el color del enfermero '+(j+1)+' del paciente '+(i+1)+' no es reconocido.');
  }));
  if(Array.isArray(z.cfg)){
    if(z.cfg.length>d.p.length)fail('hay configuraciones de pago adicionales que la migración descartaría.');
    z.cfg.forEach((c,i)=>{
      ['who','note'].forEach(k=>{if(own(c,k)&&typeof c[k]!=='string')fail('el campo '+k+' de la configuración '+(i+1)+' no se puede conservar.')});
      if(own(c,'lead')&&(!Number.isInteger(+c.lead)||+c.lead<1||+c.lead>14))fail('el plazo de aviso de la configuración '+(i+1)+' no es válido.');
      if(own(c,'base')&&c.base!==''&&!validDate(c.base))fail('la fecha base de la configuración '+(i+1)+' no es válida.');
      if(own(c,'time')&&!['full','half'].includes(c.time))fail('el tipo de turno de la configuración '+(i+1)+' no es válido.');
      if(own(c,'rate')&&!validAmount(c.rate))fail('la tarifa de la configuración '+(i+1)+' no se puede conservar.');
      if(Array.isArray(c.pays))c.pays.forEach((p,j)=>{
        if(own(p,'d')&&typeof p.d!=='string')fail('la fecha del pago '+(j+1)+' de la configuración '+(i+1)+' no es texto.');
        if(own(p,'a')&&!validAmount(p.a))fail('el importe del pago '+(j+1)+' de la configuración '+(i+1)+' no se puede conservar.');
      });
    });
  }
  if(Array.isArray(z.w)){
    const seen=new Set();
    z.w.forEach((w,i)=>{
      if(!w||typeof w!=='object'||!w.v||typeof w.v!=='object'||Array.isArray(w.v))fail('el registro histórico de pagos '+(i+1)+' no puede convertirse íntegramente.');
      if(own(w,'who')&&typeof w.who!=='string')fail('el responsable del registro histórico '+(i+1)+' no se puede conservar.');
      if(own(w,'day')&&(!Number.isInteger(+w.day)||+w.day<0||+w.day>6))fail('el día del registro histórico '+(i+1)+' no es válido.');
      if(own(w,'note')&&typeof w.note!=='string')fail('la nota del registro histórico '+(i+1)+' no se puede conservar.');
      if(own(w,'paid')&&typeof w.paid!=='string')fail('la fecha pagada del registro histórico '+(i+1)+' no se puede conservar.');
      Object.entries(w.v).forEach(([day,name])=>{
        if(typeof name!=='string'||!name.trim())fail('hay una asignación histórica sin nombre que sería descartada.');
        const key=day+':'+i;
        if(seen.has(key))fail('hay asignaciones históricas duplicadas.');
        seen.add(key);
        const existing=z.v&&z.v[day]&&z.v[day][i];
        if(existing!==undefined&&existing!==null&&(!Array.isArray(existing)||existing.length))fail('una asignación histórica entraría en conflicto con una asignación existente.');
      });
    });
  }
  return d;
}
function assertMigrationIntegrity(before,after){
  const fail=msg=>{throw new Error('La migración alteraría registros: '+msg)};
  if(before.p.length!==after.p.length)fail('cambió la cantidad de pacientes.');
  before.p.forEach((p,i)=>{
    if(p.meds.length!==after.p[i].meds.length)fail('cambió la cantidad de registros del paciente '+(i+1)+'.');
    p.meds.forEach((m,j)=>{
      const migrated=after.p[i].meds[j];
      const beforeBuys=Array.isArray(m.buys)?m.buys.length:0;
      const afterBuys=Array.isArray(migrated.buys)?migrated.buys.length:0;
      if(beforeBuys!==afterBuys)fail('cambió el historial de compras del registro '+(j+1)+'.');
      if(Array.isArray(m.cons)&&m.cons.length!==migrated.cons.length)fail('cambió la cantidad de consumos del registro '+(j+1)+'.');
    });
  });
  const beforeAppts=Array.isArray(before.appts)?before.appts.length:0;
  if(beforeAppts!==after.appts.length)fail('cambió la cantidad de citas.');
  const oldPay=before.pay||{},newPay=after.pay;
  if(Array.isArray(oldPay.ledger)&&(oldPay.ledger.length!==(newPay.ledger||[]).length))fail('cambió el libro de pagos individuales.');
  if(oldPay.v&&newPay.v)Object.entries(oldPay.v).forEach(([day,byPatient])=>Object.entries(byPatient||{}).forEach(([i,list])=>{
    const migrated=newPay.v[day]&&newPay.v[day][i];if(!Array.isArray(migrated)||migrated.length!==list.length)fail('cambió la cantidad de asignaciones del '+day+'.');
    list.forEach((e,j)=>{if(e&&e.service&&JSON.stringify(e.service)!==JSON.stringify(migrated[j]&&migrated[j].service))fail('cambió el detalle de un servicio guardado.')});
  }));
  if(Array.isArray(oldPay.shifts)&&oldPay.shifts.length&&oldPay.shifts.length!==newPay.shifts.length)fail('cambió la cantidad de turnos.');
  if(Array.isArray(oldPay.cfg))oldPay.cfg.forEach((c,i)=>{
    const a=Array.isArray(c.pays)?c.pays.length:0;
    const b=Array.isArray(newPay.cfg[i]&&newPay.cfg[i].pays)?newPay.cfg[i].pays.length:0;
    if(a!==b)fail('cambió el historial de pagos del paciente '+(i+1)+'.');
  });
  if(Array.isArray(oldPay.nurses))oldPay.nurses.forEach((list,i)=>{
    const a=Array.isArray(list)?list.length:0;
    const b=Array.isArray(newPay.nurses[i])?newPay.nurses[i].length:0;
    if(b<a)fail('se redujo la lista de enfermeros del paciente '+(i+1)+'.');
  });
  return after;
}

function prepareMigratedState(parsed){
  validateMigrationInput(parsed);
  const before=JSON.parse(JSON.stringify(parsed));
  const candidate=migrate(JSON.parse(JSON.stringify(parsed)));
  if(typeof candidate.sel!=='number'||!candidate.p[candidate.sel])candidate.sel=0;
  if(typeof candidate.last!=='string')candidate.last='';
  validateMigratedState(candidate);
  assertMigrationIntegrity(before,candidate);
  return candidate;
}

function validateMigratedState(d){
  if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.p)||!d.p.length||!Number.isInteger(d.sel)||d.sel<0||d.sel>=d.p.length)throw new Error('La migración no produjo una estructura válida.');
  if(!d.pay||typeof d.pay!=='object'||Array.isArray(d.pay)||!Array.isArray(d.pay.cfg)||!Array.isArray(d.pay.nurses)||!d.pay.v||typeof d.pay.v!=='object'||Array.isArray(d.pay.v))throw new Error('La migración de pagos no se completó.');
  if(!Array.isArray(d.appts))throw new Error('La migración de citas no se completó.');
  d.p.forEach(p=>{if(!p||typeof p!=='object'||!Array.isArray(p.meds))throw new Error('La migración de pacientes no se completó.')});
  return d;
}


window.AcompanaCompatibility=Object.freeze({NPAL,NPALN,migrate,defaultState,validateStoredState,validateMigrationInput,assertMigrationIntegrity,prepareMigratedState,validateMigratedState});
})();
