import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {convertLegacyBackup,legacySourceCommit} from '../legacy-converter.mjs';
import {parseFamilyBackup} from '../family-backup.mjs';

const context=createContext({window:{}});
runInContext(await readFile(new URL('../../compatibility.js',import.meta.url),'utf8'),context);
const compatibility=context.window.AcompanaCompatibility;
const now='2026-11-20T12:00:00Z';
const options={compatibility,now};
function fixture(){return {sel:0,last:'',p:[{name:'Alex ficticio',meds:[{name:'Artículo ficticio',base:40,t0:1793491200000,cons:[
  {dose:1,times:['08:00'],schedule:{type:'daily'}},{dose:2,times:['20:00'],schedule:{type:'weekdays',days:[1,3]}},
  {dose:1,times:['12:00'],schedule:{type:'interval',n:3,start:1793491200000}}],
  buys:[{d:'2026-11-01',p:100,n:20,w:'Tienda ficticia'},{d:'2026-02-30',p:30,n:2,w:'Nota histórica'}]}]},
  {name:'Alex ficticio',meds:[]}],appts:[{i:1,d:'2026-11-23',t:'09:00',w:'Clínica ficticia',n:'Revisión'},{i:0,d:'2026-02-30',t:'',w:'Legado',n:''}],
  pay:{nurses:[[{n:'Enfermera ficticia',c:'#C92A2A'}],[]],cfg:[{who:'Familiar ficticio',base:'2026-11-01',rate:500,pays:[{d:'2026-11-01',n:3,a:900,old:false}]},{}],
    v:{'2026-11-02':{'0':[{n:'Enfermera ficticia',s:'half'}]}}}};}

test('converts distinct patient indices and preserves the literal original with a verified digest',async()=>{
  const raw=' '+JSON.stringify(fixture())+'\n',result=await convertLegacyBackup(raw,options),{archive,report}=result;
  assert.equal(archive.version,3);assert.equal(archive.tables.patients.length,2);
  assert.notEqual(archive.tables.patients[0].id,archive.tables.patients[1].id);
  assert.equal(archive.tables.appointments[0].patient_id,archive.tables.patients[1].id);
  assert.equal(archive.tables.appointments[1].legacy_day,'2026-02-30');
  const snapshot=archive.tables.legacy_snapshots[0];assert.equal(snapshot.original_json,raw);
  assert.equal(snapshot.source_sha,createHash('sha256').update(raw).digest('hex'));
  assert.equal(snapshot.source_commit,legacySourceCommit);assert.deepEqual(snapshot.report,report);
  assert.equal(parseFamilyBackup(JSON.stringify(archive)).version,3);
  const again=await convertLegacyBackup(raw,{...options,now:'2026-11-21T12:00:00Z'});
  assert.deepEqual(again.archive.tables.patients.map(p=>p.id),archive.tables.patients.map(p=>p.id));
});

test('preserves inventory bases and independent consumption rules without adding historical purchases again',async()=>{
  const source=fixture(),raw=JSON.stringify(source),{archive,report}=await convertLegacyBackup(raw,options);
  const item=archive.tables.inventory_items[0];assert.equal(item.base_quantity,'40');assert.equal(item.initial_quantity,'40');
  assert.equal(item.base_at,source.p[0].meds[0].t0);assert.deepEqual(JSON.parse(JSON.stringify(item.consumptions)),source.p[0].meds[0].cons);
  assert.deepEqual(archive.tables.inventory_purchases,[]);assert.equal(archive.tables.inventory_quotes.length,1);
  assert.equal(archive.tables.inventory_quotes[0].total_price,'100');assert.equal(report.preserved.unmappedPriceReferences,1);
  assert.ok(report.warnings.includes('price_references_do_not_add_stock'));
  assert.deepEqual(JSON.parse(archive.tables.legacy_snapshots[0].original_json),source);
});

test('keeps main coverage and assignments historical without manufacturing rates or modern balances',async()=>{
  const {archive,report}=await convertLegacyBackup(JSON.stringify(fixture()),options);
  for(const table of ['nurses','shifts','receipts','individual_payments','individual_allocations'])assert.deepEqual(archive.tables[table],[]);
  assert.equal(report.source.nurses,1);assert.equal(report.source.assignments,1);assert.equal(report.source.coveragePayments,1);
  assert.ok(report.warnings.includes('legacy_finances_preserved_without_invented_modern_balance'));
});

test('retains a manual supply without inventing a daily consumption',async()=>{
  const source=fixture();source.p[0].meds[0].kind='sup';source.p[0].meds[0].cons=[];
  const {archive}=await convertLegacyBackup(JSON.stringify(source),options);
  assert.equal(archive.tables.inventory_items[0].kind,'sup');
  assert.equal(archive.tables.inventory_items[0].consumptions.length,0);
});

test('rejects unsupported financial formats and unsafe or unrepresentable data before producing an archive',async()=>{
  for(const mutate of [s=>{s.pay.v['2026-11-02'][0][0].service={};},s=>{s.pay.generalLedger=[{}];},s=>{s.password='secret';},
    s=>{s.p[0].meds[0].t0=0;},s=>{delete s.p[0].meds[0].cons[2].schedule.start;},s=>{s.p[0].name='x'.repeat(81);},
    s=>{s.appts[0].t='25:00';},s=>{s.unknownVersion={};}]){
    const source=fixture();mutate(source);await assert.rejects(convertLegacyBackup(JSON.stringify(source),options));
  }
  await assert.rejects(convertLegacyBackup('{',options));
  await assert.rejects(convertLegacyBackup(JSON.stringify(fixture()),{compatibility:{}}));
  for(const key of ['service_role','service_role_key','apikey','token_valid_after']){
    const source=fixture();source.p[0].credentials={[key.toUpperCase()]:'secret'};
    await assert.rejects(convertLegacyBackup(JSON.stringify(source),options),/credenciales/);
  }
});

test('enforces both source and converted size limits without truncating the original',async()=>{
  await assert.rejects(convertLegacyBackup(' '.repeat(10*1024*1024+1),options),/10 MiB/);
  const source=fixture();source.pay.cfg[0].note='\\'.repeat(3*1024*1024);
  await assert.rejects(convertLegacyBackup(JSON.stringify(source),options),/no se recortó/);
});

test('accepts the backup exported by the actual main UI and retains every literal byte',async()=>{
  const raw=await readFile(new URL('./fixtures/main-backup.json',import.meta.url),'utf8');
  const {archive,report}=await convertLegacyBackup(raw,options);
  assert.equal(report.source.patients,2);assert.equal(report.source.inventory,3);assert.equal(report.source.priceReferences,3);
  assert.equal(report.source.appointments,2);assert.equal(report.source.coveragePayments,3);assert.equal(report.source.assignments,5);
  assert.equal(archive.tables.inventory_items.reduce((n,item)=>n+item.consumptions.length,0),4);
  assert.equal(archive.tables.legacy_snapshots[0].original_json,raw);
  assert.equal(parseFamilyBackup(JSON.stringify(archive)).version,3);
});
