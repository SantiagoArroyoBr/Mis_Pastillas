const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
  const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../payments.js'),'utf8'),{window});
  const cfg={base:'2026-01-01',who:'Responsable ficticio',time:'half',rate:100,pays:[{d:'2026-12-31',n:1,a:20,old:false},{d:'2025-01-01',n:80,a:8000,old:true}]};
  const state={p:[{name:'Ficha ficticia'},{name:'Otra ficha ficticia'}],pay:{v:{'2025-12-31':{0:[{n:'A ficticia'}]},'2026-01-01':{0:[{n:'A ficticia'},{n:'B ficticia'}]},'2026-01-03':{0:[{n:'A ficticia'}]},'2026-01-10':{0:[{n:'B ficticia'}]},'2026-01-11':{1:[{n:'C ficticia'}]}}}};
  const empty={base:'2026-01-01',who:'Otro responsable',pays:[],rate:null};
  const api=window.AcompanaPayments.create({getState:()=>state,config:i=>i===0?cfg:empty,entries:(d,i)=>state.pay.v[d]?.[i]||[],ymd:()=> '2026-01-03'});
  return {api,cfg,state};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('cobertura conserva fechas únicas, FIFO, hoy, huecos, futuro y pagos antiguos',()=>{
  const {api,cfg,state}=fixture(),before=JSON.stringify({cfg,state});
  const c=api.cover(0);
  assert.deepEqual(plain(c.dates),['2026-01-01','2026-01-03','2026-01-10']);
  assert.deepEqual([...c.covered],['2026-01-01']);assert.equal(c.owed,1);assert.equal(c.future,1);assert.equal(c.total,1);
  assert.equal(api.cover(1).total,0);assert.equal(api.cover(1).dates.length,1);
  assert.equal(JSON.stringify({cfg,state}),before,'las consultas no escriben ni reinterpretan registros');
});
test('importe, modalidad y fecha de registro no cambian cobertura; tarifa solo cambia estimación',()=>{
  const {api,cfg}=fixture(),initial=plain(api.cover(0));
  for(const a of [null,0,20,100,500])for(const time of ['half','full']){
    cfg.pays[0].a=a;cfg.pays[0].d='2026-01-02';cfg.time=time;
    assert.deepEqual(plain(api.cover(0)),initial);assert.equal(api.lastPay(0).total,100);
  }
  cfg.rate=200;assert.equal(api.lastPay(0).total,200);assert.deepEqual(plain(api.cover(0)),initial);
  cfg.rate=null;assert.equal(api.lastPay(0).total,null);
});
test('varias personas no multiplican la estimación ni reciben reparto monetario inventado',()=>{
  const {api,cfg,state}=fixture();
  assert.equal(api.cover(0).covered.size,1);
  assert.equal(api.lastPay(0).days,1);
  assert.equal(api.lastPay(0).services,2);
  assert.equal(api.lastPay(0).total,100,'la tarifa existente es global por fecha y no permite atribuir $100 a cada servicio');
  assert.equal(api.lastPay(0).rows.length,2);
  assert.ok(api.lastPay(0).rows.every(r=>!('amt' in r)));
  state.pay.v['2026-01-01'][0].push({n:'C ficticia'});
  assert.equal(api.lastPay(0).services,3,'se contabilizan tres asignaciones aunque la cobertura siga siendo una fecha');
  assert.equal(api.lastPay(0).total,100,'sin tarifas por servicio no se fabrican costos de $300');
  cfg.pays=[];assert.equal(api.cover(0).owed,2);assert.equal(api.lastPay(0),null);
  assert.deepEqual(plain(api.oweSummary(0).rows),[{n:'A ficticia',c:2},{n:'B ficticia',c:1},{n:'C ficticia',c:1}]);
});
test('adelantos distinguen fechas asignadas de crédito; cambios de base conservan los registros',()=>{
  const {api,cfg}=fixture();cfg.pays.push({d:'2026-01-02',n:5,a:null,old:false});
  assert.equal(api.cover(0).unused,3);assert.equal(api.lastPay(0).days,2);assert.equal(api.lastPay(0).total,200);
  const pays=JSON.stringify(cfg.pays);cfg.base='2026-01-03';assert.equal(api.cover(0).dates.length,2);assert.equal(JSON.stringify(cfg.pays),pays);
  cfg.pays.forEach(p=>p.old=true);assert.equal(api.cover(0).total,0);assert.equal(cfg.pays.length,3);
  cfg.base='';assert.equal(api.cover(0).has,false);
});

test('importe monetario nuevo usa centavos exactos y rechaza precisión inválida',()=>{
  const {api}=fixture();
  assert.equal(api.toCents('0.10'),10);assert.equal(api.toCents('12.3'),1230);
  assert.equal(api.toCents('500'),50000);assert.equal(api.toCents('1.001'),null);
  assert.equal(api.toCents('-1'),null);assert.equal(api.toCents('abc'),null);
});

test('servicios y saldos quedan aislados por ID de enfermero y servicio',()=>{
  const {api}=fixture();
  const services=[
    {id:'s1',nurseId:'nA',date:'2026-01-01',amountCents:50000},
    {id:'s2',nurseId:'nA',date:'2026-01-02',amountCents:25000},
    {id:'s3',nurseId:'nB',date:'2026-01-01',amountCents:30000}
  ];
  const movements=[{id:'m1',nurseId:'nA',date:'2026-01-03',amountCents:20000,allocations:[{serviceId:'s1',amountCents:20000}]}];
  const a=api.ledgerSummary(services,movements,'nA'),b=api.ledgerSummary(services,movements,'nB');
  assert.equal(a.costCents,75000);assert.equal(a.paidCents,20000);assert.equal(a.balanceCents,55000);
  assert.equal(b.costCents,30000);assert.equal(b.paidCents,0);assert.equal(b.balanceCents,30000);
});

test('abonos parciales se asignan FIFO, se acumulan y rechazan excedentes',()=>{
  const {api}=fixture();
  const services=[{id:'s1',nurseId:'nA',date:'2026-01-01',amountCents:50000},{id:'s2',nurseId:'nA',date:'2026-01-02',amountCents:25000}];
  const first=api.allocatePayment(services,[],'nA',20000);
  assert.deepEqual(plain(first),[{serviceId:'s1',amountCents:20000}]);
  const movements=[{id:'m1',nurseId:'nA',date:'2026-01-03',amountCents:20000,allocations:first}];
  const second=api.allocatePayment(services,movements,'nA',10000);
  assert.deepEqual(plain(second),[{serviceId:'s1',amountCents:10000}]);
  movements.push({id:'m2',nurseId:'nA',date:'2026-01-04',amountCents:10000,allocations:second});
  assert.equal(api.ledgerSummary(services,movements,'nA').balanceCents,45000);
  assert.equal(api.allocatePayment(services,movements,'nA',46000),null);
});

test('el saldo general incluye solo abonos activos y mantiene el historial cancelado',()=>{
  const {api}=fixture();
  const services=[{id:'s1',amountCents:50000},{id:'s2',amountCents:12500}];
  const movements=[
    {id:'r1',type:'receipt',date:'2026-01-02',amountCents:10000,concept:'parcial'},
    {id:'r2',type:'receipt',date:'2026-01-03',amountCents:5000},
    {id:'c1',type:'cancellation',originalId:'r1',date:'2026-01-04',amountCents:10000}
  ];
  const summary=api.generalSummary(services,movements);
  assert.equal(summary.costCents,62500);
  assert.equal(summary.receivedCents,5000);
  assert.equal(summary.balanceCents,57500);
  assert.equal(summary.cancelledIds.has('r1'),true);
  assert.deepEqual(plain(summary.receipts.map(r=>({id:r.id,cancelled:r.cancelled}))),[{id:'r1',cancelled:true},{id:'r2',cancelled:false}]);
});
