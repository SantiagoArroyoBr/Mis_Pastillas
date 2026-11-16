import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const maxBytes = 10 * 1024 * 1024; // Límite de restauración de la PWA.
const context = createContext({ window: {} });
runInContext(await readFile(new URL('../compatibility.js', import.meta.url), 'utf8'), context);
const { prepareMigratedState, isValidDateOnly } = context.window.AcompanaCompatibility;

export function auditBackup(raw) {
  if (Buffer.byteLength(raw) > maxBytes) return { estado: 'rechazado', motivo: 'limite-de-tamaño' };
  let source;
  try {
    source = JSON.parse(raw);
  } catch {
    return { estado: 'rechazado', motivo: 'json-no-valido' };
  }
  let state;
  try {
    state = prepareMigratedState(source);
  } catch {
    return { estado: 'rechazado', motivo: 'estructura-o-relaciones-no-validas-para-la-pwa' };
  }

  const { p: patients, appts, pay } = state;
  const nurses = pay.nurses.flat();
  const general = pay.generalLedger;
  const individual = pay.ledger ?? [];
  const shifts = Object.entries(pay.v).flatMap(([date, day]) =>
    Object.values(day).flatMap(entries => entries.map(entry => ({ date, service: entry?.service }))));
  const receipts = general.filter(row => row.type === 'receipt');
  const names = new Set(patients.map(patient => patient.name));
  const impediments = {
    fichasArchivadas: patients.filter(patient => patient.archived).length,
    fichasConNombreRepetido: patients.length - names.size,
    medicinas: patients.flatMap(patient => patient.meds).length,
    citas: appts.length,
    prepagosDeCobertura: pay.cfg.flatMap(config => config.pays).length,
    personalInactivo: nurses.filter(nurse => nurse?.inactive).length,
    personalSinTarifa: nurses.filter(nurse => !nurse?.ratesCents).length,
    asignacionesSinServicio: shifts.filter(shift => !shift.service).length,
    turnosLegados: pay.shifts?.length ?? 0,
    fechasFinancierasInvalidas: [
      ...shifts.filter(shift => shift.service), ...individual, ...general
    ].filter(row => !isValidDateOnly(row.date)).length,
    movimientosConConcepto: general.filter(row => row.concept).length
  };
  return {
    estado: 'diagnostico',
    registros: {
      fichas: patients.length,
      personal: nurses.length,
      jornadasConCosto: shifts.filter(shift => shift.service).length,
      abonosIndividuales: individual.length,
      abonosGenerales: receipts.length,
      cancelacionesGenerales: general.length - receipts.length
    },
    hallazgosConocidos: Object.fromEntries(Object.entries(impediments).filter(([, count]) => count > 0))
  };
}

async function main() {
  const [file, ...extra] = process.argv.slice(2);
  if (!file || extra.length) {
    process.stderr.write('Uso: node audit-backup.mjs <respaldo-ficticio.json>\n');
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Se esperaba un archivo');
    result = info.size > maxBytes ? { estado: 'rechazado', motivo: 'limite-de-tamaño' }
      : auditBackup(await readFile(file, 'utf8'));
  } catch {
    result = { estado: 'rechazado', motivo: 'archivo-no-legible' };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.estado === 'rechazado') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
