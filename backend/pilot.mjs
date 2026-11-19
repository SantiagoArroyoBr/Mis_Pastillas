import { createClient, loadAppointments, saveAndRefresh } from './supabase-client.mjs';
import { connections } from './connection-config.mjs';
import { createFinance } from './finance.mjs';
import { createInventory } from './inventory.mjs';
import { createCalendar } from './calendar.mjs';
import { auditBackupRaw, maxBytes } from './backup-diagnostics.mjs';
import { createAdminAccess } from './admin-access.mjs';
import { consumeRecoveryLocation, createAccountRecovery } from './account-recovery.mjs';
import { durableRequest } from './durable-requests.mjs';
import { createHistoryControl } from './history.mjs';
import { createFamilyRecovery, familyBackupMaxBytes } from './family-backup.mjs';

// Remove authentication capabilities from the visible URL before rendering any view.
let recoveryLink = consumeRecoveryLocation(location, history);
const mayRestoreSession = recoveryLink.kind === 'none';

const $ = id => document.getElementById(id);
const families = $('families');
const rename = $('rename-patient');
const appointment = $('add-appointment');
const editAppointment = $('edit-appointment');
const appointmentFilter = $('appointment-filter');
const appointmentLists = ['upcoming', 'past', 'legacy'];
const localDay = new Intl.DateTimeFormat('sv-SE');
const credentials = $('credentials');
$('session').append($('backup-review'));
function connectionStatus(info) {
  $('session').dataset.readOnly=String(Boolean(info.readOnly));
  const stamp=info.lastSync?new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short'}).format(info.lastSync):'';
  $('connection-state').textContent=info.offline
    ? 'Sin conexión · solo consulta de datos guardados'+(stamp?' · Última consulta: '+stamp:'')+'. Pagos y administración necesitan conexión. No se pueden comprobar cambios de permisos.'
    : info.persisted?'Conectado · sesión conservada en '+(info.remember?'este dispositivo personal.':'esta pestaña.') : '';
}
function connectionClient() {
  const connection=connections[credentials.elements.environment.value];
  return createClient(credentials.elements.key.value.trim(),connection.url,connection.accessUrl,{
    remember:$('remember-session').checked,offlineCache:$('offline-consultation').checked,onStatus:connectionStatus});
}
function selectAuthMode(register) {
  $('auth-mode-login').setAttribute('aria-pressed', String(!register));
  $('auth-mode-register').setAttribute('aria-pressed', String(register));
  $('auth-submit-login').textContent = register ? 'Crear mi cuenta →' : 'Entrar a Acompaña →';
  $('auth-submit-login').name = register ? 'register' : '';
  $('auth-submit-login').value = register ? 'yes' : '';
  $('auth-register-help').hidden = !register;
  $('auth-identifier-label').textContent = register ? 'Tu correo' : 'Correo o identificador de acceso';
  credentials.elements.email.type = register ? 'email' : 'text';
  credentials.elements.password.minLength = register ? 12 : 8;
  credentials.elements.password.autocomplete = register ? 'new-password' : 'current-password';
  credentials.elements.password.value = '';
  credentials.elements.password.type = 'password';
  $('auth-show-password').textContent = 'Mostrar';
  $('auth-show-password').setAttribute('aria-pressed', 'false');
}
$('auth-mode-login').addEventListener('click', () => selectAuthMode(false));
$('auth-mode-register').addEventListener('click', () => selectAuthMode(true));
$('auth-show-password').addEventListener('click', () => {
  const visible = credentials.elements.password.type === 'password';
  credentials.elements.password.type = visible ? 'text' : 'password';
  $('auth-show-password').textContent = visible ? 'Ocultar' : 'Mostrar';
  $('auth-show-password').setAttribute('aria-pressed', String(visible));
});
let recoveringAccount = false;
if (recoveryLink.kind === 'recovery') {
  const environment = Object.entries(connections).find(([, connection]) => connection.url + '/auth/v1' === recoveryLink.issuer)?.[0];
  if (environment) {
    credentials.elements.environment.value = environment;
    if (connections[environment].key) credentials.elements.key.value = connections[environment].key;
  }
  else recoveryLink = { kind: 'invalid' };
}
credentials.elements.environment.addEventListener('change', () => {
  const selected = credentials.elements.environment.value;
  credentials.elements.key.value = connections[selected].key;
  $('connection-help').textContent = selected === 'cloud'
    ? 'Usa un correo al que tengas acceso. Podrás compartir tus fichas entre dispositivos.'
    : 'Para el entorno local usa un correo ficticio que termine en .test.';
  $('temporary-activation').hidden = !connections[selected].accessUrl;
  $('activate-temporary-access').reset();
  $('temporary-activation-result').textContent = '';
});
if (credentials.elements.environment.value === 'cloud') {
  credentials.elements.environment.dispatchEvent(new Event('change'));
}
$('temporary-activation').hidden = !connections[credentials.elements.environment.value]?.accessUrl;
let client, userId, memberships = [], draft, busy = false;
const recovery = createFamilyRecovery({getClient:()=>client,
  getScope:()=>[connections[credentials.elements.environment.value].url,userId]});
let familyBackupRead = 0;
function clearFamilyRecovery() {
  familyBackupRead++;
  recovery.clear();
  $('family-backup-file').value='';
  $('family-backup-counts').replaceChildren();
  $('family-backup-review').hidden=true;
  $('family-backup-review-status').textContent='';
  $('restore-family-backup').reset();
}
function createRecordOnce(operation, payload) {
  let storage;
  try { storage = localStorage; } catch { /* El helper no envía sin ticket persistido. */ }
  return durableRequest({storage,scope:[connections[credentials.elements.environment.value].url,userId],
    operation,payload,send:args=>client.rpc(operation === 'family' ? 'create_family_once' : 'add_patient_once',args)});
}
const dirtyForms = new Set();
const fieldErrors = new WeakMap();
let fieldErrorSequence = 0;
function clearFieldError(field) {
  const entry = fieldErrors.get(field);
  if (!entry) return;
  entry.note.remove();
  const described = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== entry.id);
  if (described.length) field.setAttribute('aria-describedby', described.join(' '));
  else field.removeAttribute('aria-describedby');
  field.removeAttribute('aria-invalid');
  field.setCustomValidity('');
  fieldErrors.delete(field);
}
document.addEventListener('invalid', event => {
  const field = event.target;
  if (!field.form) return;
  const previous = fieldErrors.get(field);
  const note = previous?.note ?? document.createElement('p');
  const id = previous?.id ?? 'pilot-field-error-' + ++fieldErrorSequence;
  note.id = id; note.className = 'pilot-field-error';
  note.textContent = field.validity.valueMissing ? 'Completa este campo.'
    : field.validity.typeMismatch ? 'Revisa el formato de este dato.'
    : field.validity.rangeUnderflow || field.validity.rangeOverflow ? 'Usa un valor dentro del intervalo indicado.'
    : field.validationMessage || 'Revisa este campo antes de continuar.';
  if (!previous) (field.closest('label, .auth-password-group') ?? field).after(note);
  field.setAttribute('aria-invalid', 'true');
  const described = new Set((field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  described.add(id); field.setAttribute('aria-describedby', [...described].join(' '));
  fieldErrors.set(field, { note, id });
}, true);
document.addEventListener('input', event => clearFieldError(event.target));
document.addEventListener('change', event => clearFieldError(event.target));
document.addEventListener('reset', event => {
  for (const field of event.target.elements ?? []) clearFieldError(field);
}, true);
document.addEventListener('submit', event => {
  for (const field of event.target.elements ?? []) {
    if (!field.required || !['text', 'search', 'email', 'textarea'].includes(field.type) || field.value.trim()) continue;
    field.setCustomValidity('Escribe un valor; los espacios solos no son válidos.');
    field.reportValidity(); event.preventDefault(); event.stopImmediatePropagation(); break;
  }
}, true);
for (const type of ['input', 'change']) $('session').addEventListener(type, event => {
  const form = event.target.closest('form');
  if (form?.id) dirtyForms.add(form.id);
});
$('session').addEventListener('reset', event => dirtyForms.delete(event.target.id), true);
window.addEventListener('beforeunload', event => {
  if (!dirtyForms.size) return;
  event.preventDefault();
  event.returnValue = '';
});
function discardDrafts(except) {
  const pending = [...dirtyForms].filter(id => id !== except);
  if (!pending.length) return true;
  if (!confirm('Hay cambios sin guardar. ¿Descartarlos para continuar?')) return false;
  for (const id of pending) $(id)?.reset();
  return true;
}
let appointmentRetry, renderedFamily, appointmentDraft;
let appointmentFilterValue = '', activeAppointmentPatients = new Set();
let noticeTimer;

function status(message, kind = 'success') {
  clearTimeout(noticeTimer);
  noticeTimer = undefined;
  const notice = $('pilot-notice');
  notice.classList.remove('is-fading');
  notice.dataset.kind = kind;
  $('status').textContent = message;
  if (message) {
    if (kind !== 'error' && kind !== 'warning') noticeTimer = setTimeout(dismissNotice, 6000);
  }
}

function dismissNotice() {
  const notice = $('pilot-notice');
  if (!$('status').textContent || notice.classList.contains('is-fading')) return;
  clearTimeout(noticeTimer);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    status('', 'info');
  } else {
    notice.classList.add('is-fading');
    noticeTimer = setTimeout(() => status('', 'info'), 220);
  }
}

$('dismiss-notice').addEventListener('click', dismissNotice);
const calendar = createCalendar(run, openCalendarRecord);
const finance = createFinance({ run, status, actionButton, renderTable, onChange: calendar.reload });
const inventory = createInventory({ run, status, renderTable, onChange: calendar.reload });
const adminAccess = createAdminAccess({ run, status, actionButton, renderTable, onChange: refreshFamily });
const appointmentHistory = Object.fromEntries(appointmentLists.map(list=>[list,
  createHistoryControl($('appointments-'+list), 'citas '+list, run, async next=>{
    const counts=Object.fromEntries(appointmentLists.map(key=>[key,key===list?next:appointmentHistory[key].count]));
    const today=localDay.format(new Date());
    const rows=await loadAppointments(client,families.value,today,appointmentFilterValue,counts);
    renderAppointments(rows,families.value,today,counts);
  })]));
createAccountRecovery({
  link: recoveryLink,
  getClient() {
    const connection = connections[credentials.elements.environment.value];
    return createClient(credentials.elements.key.value.trim(), connection.url, connection.accessUrl);
  },
  onModeChange(active) {
    recoveringAccount = active;
    credentials.hidden = active;
    $('auth-modes').hidden = active;
    if (active || recoveryLink?.kind && recoveryLink.kind !== 'none') $('auth-recovery-details').open = true;
    $('connection-help').hidden = active;
    $('temporary-activation').hidden = active || !connections[credentials.elements.environment.value]?.accessUrl;
  }
});
// The controller alone retains a recovery capability until success, expiry or cancellation.
recoveryLink = undefined;
const backupFile = $('backup-review-file');
let backupRequest = 0;

function clearBackup() {
  backupRequest++;
  backupFile.value = '';
  $('backup-review-status').textContent = '';
  $('backup-review-counts').replaceChildren();
  $('backup-review-results').hidden = true;
}

function hideEditing() {
  draft = undefined;
  rename.reset();
  rename.hidden = true;
}

function resetAppointments() {
  for (const control of Object.values(appointmentHistory)) control.reset();
  $('calendar-opened-appointment').hidden = true;
  $('calendar-opened-appointment-content').replaceChildren();
  for (const list of appointmentLists) $('appointments-' + list).replaceChildren();
  $('appointments-legacy-section').hidden = true;
  appointment.elements.patient.replaceChildren();
  appointmentFilter.replaceChildren();
  appointmentFilterValue = '';
  activeAppointmentPatients.clear();
  appointment.reset();
  appointmentRetry = undefined;
  closeAppointment();
}

function closeAppointment() {
  appointmentDraft = undefined;
  editAppointment.reset();
  editAppointment.hidden = true;
  $('edit-appointment-patient').textContent = '';
}

function openAppointment(row, family) {
  appointmentDraft = { family, id: row.id, revision: row.revision, patient: row.patient_id };
  editAppointment.elements.day.value = row.appointment_day;
  editAppointment.elements.time.value = row.appointment_time?.slice(0, 5) ?? '';
  editAppointment.elements.place.value = row.location;
  editAppointment.elements.doctor.value = row.doctor;
  editAppointment.elements.details.value = row.notes;
  $('edit-appointment-patient').textContent = row.patient_name;
  $('save-appointment').disabled = false;
  editAppointment.hidden = false;
  editAppointment.elements.day.focus();
}

function endSession() {
  clearFamilyRecovery();
  for (const id of dirtyForms) $(id)?.reset();
  dirtyForms.clear();
  adminAccess.clear();
  clearBackup();
  finance.scope(undefined);
  calendar.scope(undefined);
  inventory.scope(undefined);
  client = userId = undefined;
  memberships = [];
  families.replaceChildren();
  $('patients').replaceChildren();
  $('archived-patients').replaceChildren();
  resetAppointments();
  renderedFamily = undefined;
  $('members').replaceChildren();
  $('invite-code').value = '';
  $('invite-result').hidden = true;
  $('accept-invite').reset();
  hideEditing();
  $('session').hidden = true;
  $('connection-current').textContent = '';
  $('last-updated').textContent = '';
  $('auth').hidden = false;
}

function run(action) {
  return async event => {
    event.preventDefault();
    const trigger = event.currentTarget;
    if (busy) return;
    busy = true;
    $('operation-progress').textContent = event.type === 'submit' ? 'Guardando… Espera la confirmación.' : 'Actualizando…';
    const activeButton = trigger?.tagName === 'BUTTON' ? trigger : event.submitter;
    const previousDisabled = activeButton?.getAttribute('aria-disabled');
    activeButton?.setAttribute('aria-disabled', 'true');
    $('session').setAttribute('aria-busy', 'true');
    $('auth').setAttribute('aria-busy', 'true');
    families.disabled = true;
    appointmentFilter.disabled = true;
    $('inventory-filter').disabled = true;
    $('pilot-calendar-patient').disabled = true;
    try {
      await action(event);
    } catch (error) {
      if (error.stale) {
        status('La sesión cambió durante la consulta. Actualiza para continuar con la cuenta actual.', 'warning');
      } else if (error.status === 401 && userId) {
        endSession();
        status('La sesión terminó. Vuelve a iniciar sesión.', 'warning');
      } else if (error.status === 409 || error.code === 'PT409') {
        if (trigger === editAppointment) {
          $('save-appointment').disabled = true;
          status('La cita cambió en otro dispositivo. Tu borrador sigue abierto. Revisa la cita actualizada antes de volver a editar.', 'warning');
        } else if (trigger.id === 'add-inventory') {
          status('El artículo cambió. Conservamos tu borrador. Revisa las existencias y vuelve a abrir la edición.', 'warning');
        } else if (trigger.id === 'inventory-purchase') {
          status('El inventario cambió. Conservamos tu borrador. Revisa las existencias antes de volver a guardar.', 'warning');
        } else status(trigger === rename
          ? 'La ficha cambió en otro dispositivo. Conservamos tu borrador. Cancela y vuelve a abrir la ficha para revisar el cambio.'
          : 'El registro cambió en otro dispositivo. Revisa su estado actualizado.', 'warning');
        await refreshFamily().catch(() => {});
      } else if (error.status === 403 && userId) {
        await refreshFamilies().catch(() => {});
        status('Tu cuenta ya no tiene permiso para esta acción.', 'error');
      } else {
        status(error.message, 'error');
      }
    } finally {
      busy = false;
      $('operation-progress').textContent = '';
      if (activeButton) {
        if (previousDisabled === null) activeButton.removeAttribute('aria-disabled');
        else activeButton.setAttribute('aria-disabled', previousDisabled);
      }
      $('session').removeAttribute('aria-busy');
      $('auth').removeAttribute('aria-busy');
      families.disabled = !families.value;
      appointmentFilter.disabled = false;
      $('inventory-filter').disabled = false;
      $('pilot-calendar-patient').disabled = false;
    }
  };
}

function actionButton(text, label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  const icons = { 'Editar ficha': '✎', 'Archivar ficha': '↓', 'Reactivar ficha': '↺',
    'Revocar acceso': '×', 'Editar cita': '✎', 'Cancelar abono': '×' };
  if (icons[label]) button.dataset.icon = icons[label];
  button.setAttribute('aria-label', label + ': ' + text);
  button.addEventListener('click', run(action));
  return button;
}

function renderTable(body, rows, emptyMessage) {
  if (!rows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = body.closest('table').tHead.rows[0].cells.length;
    cell.textContent = emptyMessage;
    body.replaceChildren(row);
    return;
  }
  body.replaceChildren(...rows.map(values => {
    const row = document.createElement('tr');
    for (const value of values) row.insertCell().append(value);
    return row;
  }));
}

function showPilotView() {
  const links = Array.from($('pilot-navigation').querySelectorAll('a'));
  const requested = links.find(link => !link.hidden && link.hash === location.hash);
  const current = requested?.hash ?? (families.value ? '#inicio' : '#configuracion');
  for (const link of links) {
    if (link.hash === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const panel of $('session').querySelectorAll('[data-pilot-view]')) {
    panel.hidden = panel.dataset.pilotView !== current;
  }
}

async function openCalendarRecord(event) {
  const family = families.value;
  function navigate(hash) {
    location.hash = hash;
    showPilotView();
  }
  if (event.kind !== 'appointment') {
    await inventory.openItem(event.id, () => navigate('#inventory'));
    return;
  }
  const [row] = await client.select('appointment_details', { family_id: 'eq.' + family, id: 'eq.' + event.id });
  if (!row) throw new Error('La cita ya no está disponible.');
  const panel = $('calendar-opened-appointment');
  const content = $('calendar-opened-appointment-content');
  const title = document.createElement('strong');
  title.textContent = row.patient_name + ' · ' + row.appointment_day
    + (row.appointment_time ? ' · ' + row.appointment_time.slice(0, 5) : '');
  const details = document.createElement('p');
  details.textContent = [row.doctor, row.location, row.notes].filter(Boolean).join(' · ');
  content.replaceChildren(title, details);
  if (activeAppointmentPatients.has(row.patient_id)) {
    content.append(actionButton(row.patient_name, 'Editar cita', () => {
      if (appointmentDraft && !confirm('¿Descartar el borrador de la cita abierta?')) return;
      openAppointment(row, family);
    }));
  }
  panel.hidden = false;
  navigate('#appointments-heading');
  $('calendar-opened-appointment-heading').focus();
}

function focusCurrentView() {
  const heading = $('session').querySelector('[data-pilot-view]:not([hidden]) h2');
  if (heading) { heading.tabIndex = -1; heading.focus(); }
}
let focusNextView = false;
$('session').addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (![...$('pilot-navigation').querySelectorAll('a')].some(item => !item.hidden && item.hash === link.hash)) return;
  if (location.hash === link.hash) focusCurrentView();
  else focusNextView = true;
});
window.addEventListener('hashchange', () => {
  showPilotView();
  if (focusNextView) focusCurrentView();
  focusNextView = false;
});

async function refreshFamily() {
  try {
    await loadFamilyView();
    $('last-updated').textContent = !families.value ? '' : client.readOnly
      ? 'Mostrando información guardada. Reconecta y pulsa Actualizar fichas para comprobar novedades.'
      : 'Última actualización completa: ' + new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()) + '.';
  } catch (error) {
    $('last-updated').textContent = 'No se pudo completar la actualización. La vista puede estar desactualizada; pulsa Actualizar fichas.';
    throw error;
  }
}

async function loadFamilyView() {
  const family = families.value;
  const owner = memberships.some(row => row.family_id === family && row.role === 'owner');
  const readOnly=Boolean(client?.readOnly);
  $('session').dataset.readOnly=String(readOnly);
  finance.scope(owner && !readOnly ? family : undefined);
  inventory.scope(family || undefined);
  calendar.scope(family || undefined);
  $('family').hidden = !family;
  $('pilot-navigation').hidden = false;
  for (const link of $('pilot-navigation').querySelectorAll('a')) {
    link.hidden = !['#configuracion','#backup-review'].includes(link.hash)
      && (!family || (link.hash === '#finance' && (!owner || readOnly)));
  }
  $('no-family-help').hidden = Boolean(family);
  families.disabled = !family || busy;
  $('reload').hidden = !family;
  showPilotView();
  $('owner-actions').hidden = !owner || readOnly;
  $('connected-recovery').hidden = Boolean(client?.isTemporary) || readOnly;
  $('export-family-backup').hidden = !owner || readOnly;
  $('create-family').hidden = Boolean(client?.isTemporary);
  $('settings-create-family').hidden = Boolean(client?.isTemporary);
  $('settings-accept-invite').hidden = Boolean(client?.isTemporary);
  $('settings-create-family').open = !family && !client?.isTemporary;
  $('accept-invite').hidden = Boolean(client?.isTemporary);
  await adminAccess.load(client, family, owner && !readOnly);
  if (renderedFamily !== family) {
    clearFamilyRecovery();
    $('members').replaceChildren();
    clearBackup();
    $('patients').replaceChildren();
    $('archived-patients').replaceChildren();
    resetAppointments();
    renderedFamily = family;
  }
  if (!family) {
    $('patients').replaceChildren();
    $('members').replaceChildren();
    return;
  }
  const filter = { family_id: 'eq.' + family };
  const today = localDay.format(new Date());
  const [patients, members, appointments] = await Promise.all([
    client.select('patients', { ...filter, select: 'id,name,revision,archived_at', order: 'name.asc,id.asc' }),
    owner ? client.select('family_members', { ...filter, revoked_at: 'is.null', role: 'eq.caregiver', select: 'user_id' }) : [],
    loadAppointments(client, family, today, appointmentFilterValue,
      Object.fromEntries(appointmentLists.map(list=>[list,appointmentHistory[list].count])))
  ]);
  const active = patients.filter(patient => !patient.archived_at);
  $('pilot-active-count').textContent = String(active.length);
  $('pilot-archived-count').textContent = String(patients.length - active.length);
  const archive = (patient, archived) => async () => {
    if (archived && !confirm('¿Archivar la ficha de ' + patient.name + '? Se conservará su historial.')) return;
    await saveAndRefresh({
      write: () => client.rpc('set_patient_archived', { family, patient: patient.id, expected_revision: patient.revision, archived }),
      reset: () => { hideEditing(); if (archived && appointmentDraft?.patient === patient.id) closeAppointment(); },
      refresh: () => refreshFamily(), notify: status, message: archived ? 'Ficha archivada.' : 'Ficha reactivada.'
    });
  };
  renderTable($('patients'), active.map(patient => {
    const actions = document.createElement('div');
    actions.className = 'pilot-row-actions';
    actions.append(actionButton(patient.name, 'Editar ficha', () => {
      draft = { ...patient, family };
      rename.elements.name.value = patient.name;
      rename.hidden = false;
      rename.elements.name.focus();
    }));
    if (owner) actions.append(actionButton(patient.name, 'Archivar ficha', archive(patient, true)));
    return [patient.name, actions];
  }), 'Aún no hay fichas activas. Usa Agregar ficha para empezar, o reactiva una ficha archivada.');
  renderTable($('archived-patients'), patients.filter(patient => patient.archived_at).map(patient => [
    patient.name, owner ? actionButton(patient.name, 'Reactivar ficha', archive(patient, false)) : '—'
  ]), 'Aún no hay fichas archivadas.');
  const names = new Map();
  for (const patient of patients) names.set(patient.name, (names.get(patient.name) ?? 0) + 1);
  const option = patient => {
    const suffix = names.get(patient.name) > 1 ? ' · ' + patient.id.slice(0, 8) : '';
    return new Option(patient.name + suffix + (patient.archived_at ? ' (archivada)' : ''), patient.id);
  };
  const selection = appointment.elements.patient.value;
  appointment.elements.patient.replaceChildren(...active.map(option));
  if (active.some(patient => patient.id === selection)) appointment.elements.patient.value = selection;
  appointment.querySelector('button').disabled = !active.length;
  activeAppointmentPatients = new Set(active.map(patient => patient.id));
  appointmentFilter.replaceChildren(new Option('Todas las fichas', ''), ...patients.map(option));
  appointmentFilter.value = appointmentFilterValue;
  renderAppointments(appointments, family, today);
  renderTable($('members'), members.map(member => [
    member.user_id, actionButton('Cuenta ' + member.user_id, 'Revocar acceso', async () => {
      if (!confirm('¿Revocar el acceso de esta cuenta cuidadora a la familia? Se conservará su historial.')) return;
      await saveAndRefresh({write: () => client.rpc('revoke_caregiver', { family, member: member.user_id }),
        reset: () => {}, refresh: () => refreshFamily(), notify: status, message: 'Acceso revocado.'});
    })
  ]), 'Aún no hay cuentas cuidadoras.');
  await Promise.all([owner && !client.readOnly ? finance.load(client, family, active) : undefined,
    inventory.load(client, family, patients), calendar.load(client, family, patients, owner)]);
}

function renderAppointments(appointments, family, today, counts={}) {
  for (const list of appointmentLists) {
    const rows = appointments[list].map(row => {
      const day = row.appointment_day === today ? 'Hoy, ' + today : row.appointment_day ?? row.legacy_day;
      const when = [day, row.appointment_time?.slice(0, 5)].filter(Boolean).join(' · ');
      const details = document.createElement('div');
      if (row.doctor) {
        const doctor = document.createElement('strong');
        doctor.textContent = row.doctor;
        details.append(doctor);
      }
      if (row.location) {
        const place = document.createElement('p');
        place.className = 'pilot-table-notes';
        place.textContent = row.location;
        details.append(place);
      }
      if (row.notes) {
        const notes = document.createElement('p');
        notes.className = 'pilot-table-notes';
        notes.textContent = row.notes;
        details.append(notes);
      }
      const cells = [when, row.patient_name, row.location || row.notes || row.doctor ? details : '—'];
      if (list === 'legacy') return cells;
      if (activeAppointmentPatients.has(row.patient_id)) {
        cells.push(actionButton(row.patient_name + ' · ' + when, 'Editar cita', () => {
          if (appointmentDraft && !confirm('¿Descartar el borrador de la cita abierta?')) return;
          openAppointment(row, family);
        }));
      } else cells.push('—');
      return cells;
    });
    renderTable($('appointments-' + list), rows, list === 'upcoming' ? 'No hay próximas citas. Abre Nueva cita médica para registrar una.' : 'No hay citas anteriores.');
    appointmentHistory[list].update(appointments.pagination[list],counts[list]??appointmentHistory[list].count);
  }
  $('appointments-legacy-section').hidden = !appointments.legacy.length;
}

async function refreshFamilies(preferred = families.value) {
  const [available, roles] = await Promise.all([
    client.select('families', { select: 'id,name', order: 'name.asc,id.asc' }),
    client.select('family_members', { user_id: 'eq.' + userId, revoked_at: 'is.null', select: 'family_id,role' })
  ]);
  memberships = roles;
  families.replaceChildren(...available.map(f => new Option(f.name, f.id)));
  if (available.some(f => f.id === preferred)) families.value = preferred;
  if (families.value !== preferred) {
    hideEditing();
    $('invite-code').value = '';
    $('invite-result').hidden = true;
  }
  await refreshFamily();
}

$('credentials').addEventListener('submit', run(async event => {
  if (recoveringAccount) throw new Error('Termina o cancela la recuperación antes de iniciar sesión.');
  const form = event.currentTarget;
  const values = new FormData(form);
  const email = values.get('email').trim();
  const environment = values.get('environment');
  const connection = connections[environment];
  if (!connection) throw new Error('Selecciona un entorno de prueba válido.');
  const temporary = /^temp-[0-9a-f-]{36}$/i.test(email);
  if (environment === 'local' && !email.endsWith('.test') && !temporary) throw new Error('Usa un correo ficticio que termine en .test o tu identificador temporal.');
  const password = values.get('password');
  const next = connectionClient();
  if (event.submitter?.value === 'yes') {
    if (temporary || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Para crear una cuenta principal usa un correo válido.');
    const registration = await next.signUp(email, password);
    if (environment === 'cloud' && !registration?.access_token) {
      form.elements.password.value = '';
      status('Revisa tu correo para confirmar el registro y después inicia sesión.', 'info');
      return;
    }
  }
  const id = await next.signIn(email, password);
  form.elements.password.value = '';
  client = next;
  userId = id;
  try {
    await refreshFamilies();
  } catch (error) {
    endSession();
    throw error;
  }
  $('auth').hidden = true;
  $('session').hidden = false;
  $('connection-current').textContent = 'Conectado a ' + connection.label;
  status('Sesión iniciada.');
}));

$('activate-temporary-access').addEventListener('submit', run(async event => {
  const form = event.currentTarget;
  const values = new FormData(form);
  if (values.get('password') !== values.get('confirmation')) throw new Error('Las contraseñas no coinciden.');
  const connection = connections[credentials.elements.environment.value];
  if (!connection?.accessUrl) throw new Error('La activación todavía no está habilitada en este entorno.');
  const activation = createClient(credentials.elements.key.value.trim(), connection.url, connection.accessUrl);
  try {
    const result = await activation.access('activate', { code: values.get('code').trim(), password: values.get('password') });
    if (!result?.login) throw new Error('No se recibió el identificador. Consulta a quien administra tu familia.');
    credentials.elements.email.value = result.login;
    credentials.elements.password.value = '';
    form.reset();
    $('temporary-activation-result').textContent = 'Acceso activado. Tu identificador es ' + result.login + '. Inicia sesión con la contraseña que elegiste.';
    credentials.elements.password.focus();
    status('Acceso activado. Ya puedes iniciar sesión.', 'info');
  } finally {
    form.elements.password.value = '';
    form.elements.confirmation.value = '';
  }
}));

$('logout').addEventListener('click', run(async () => {
  if (!discardDrafts()) return;
  try { await client.signOut(); } finally { endSession(); }
  status('Sesión cerrada.');
}));

function rpcForm(id, handler) {
  $(id).addEventListener('submit', run(async event => {
    const form = event.currentTarget;
    if (await handler(new FormData(form)) === false) return;
    form.reset();
  }));
}

rpcForm('create-family', async values => {
  if (!discardDrafts('create-family')) return false;
  await saveAndRefresh({
    write: () => createRecordOnce('family', { family_name: values.get('name').trim() }),
    reset: () => $('create-family').reset(), refresh: family => refreshFamilies(family),
    notify: status, message: 'Familia creada.'
  });
});
rpcForm('accept-invite', async values => {
  if (!discardDrafts('accept-invite')) return false;
  await saveAndRefresh({
    write: () => client.rpc('accept_invite', { invitation: values.get('code').trim() }),
    reset: () => $('accept-invite').reset(), refresh: family => refreshFamilies(family),
    notify: status, message: 'Invitación aceptada.'
  });
});
families.addEventListener('change', run(async () => {
  if (!discardDrafts()) { families.value = renderedFamily ?? ''; return; }
  $('invite-result').hidden = true;
  $('invite-code').value = '';
  hideEditing();
  await refreshFamily();
}));
rpcForm('invite', async values => {
  $('invite-code').value = await client.rpc('create_invite', {
    family: families.value, invite_email: values.get('email')
  });
  $('invite-result').hidden = false;
  $('invite-code').focus();
  status('Comparte este código solo con la cuenta de prueba invitada.', 'info');
});
$('revoke-invite').addEventListener('click', run(async () => {
  await client.rpc('revoke_invite', { family: families.value, invitation: $('invite-code').value });
  $('invite-code').value = '';
  $('invite-result').hidden = true;
  $('invite').elements.email.focus();
  status('Invitación pendiente revocada.');
}));
$('reload').addEventListener('click', run(async () => {
  try { await client.reconnect(); } catch(error) { if(!error.network) throw error; }
  await refreshFamilies();
  status(client.readOnly?'Consulta sin conexión. No puedes guardar cambios.':'Fichas actualizadas.',client.readOnly?'warning':'success');
}));
rpcForm('add-patient', async values => {
  await saveAndRefresh({
    write: () => createRecordOnce('patient', { family: families.value, patient_name: values.get('name').trim() }),
    reset: () => $('add-patient').reset(), refresh: () => refreshFamily(),
    notify: status, message: 'Ficha agregada.'
  });
});
rpcForm('rename-patient', async values => {
  if (!draft) return;
  await saveAndRefresh({write: () => client.rpc('rename_patient', {
    family: draft.family, patient: draft.id, expected_revision: draft.revision, patient_name: values.get('name')
  }), reset: hideEditing, refresh: () => refreshFamily(), notify: status, message: 'Nombre guardado.'});
});
rpcForm('add-appointment', async values => {
  const args = {
    family: families.value, patient: values.get('patient'), day: values.get('day'),
    at_time: values.get('time') || null, place: values.get('place'), details: values.get('details'),
    doctor_name: values.get('doctor')
  };
  const key = JSON.stringify(args);
  if (appointmentRetry?.key !== key) appointmentRetry = { key, id: crypto.randomUUID() };
  await client.rpc('add_appointment', { ...args, request_id: appointmentRetry.id });
  $('new-medical-appointment').open = false;
  try {
    await refreshFamily();
    status('Cita registrada.');
  } catch {
    status('Cita registrada. Usa Actualizar fichas para consultar la lista.', 'warning');
  }
  appointmentRetry = undefined;
});
rpcForm('edit-appointment', async values => {
  if (!appointmentDraft || $('save-appointment').disabled) return;
  await client.rpc('edit_appointment', {
    family: appointmentDraft.family, appointment: appointmentDraft.id, expected_revision: appointmentDraft.revision,
    day: values.get('day'), at_time: values.get('time') || null, place: values.get('place'), details: values.get('details'),
    doctor_name: values.get('doctor')
  });
  closeAppointment();
  try {
    await refreshFamily();
    status('Cita actualizada.');
  } catch {
    status('Cita actualizada. Usa Actualizar fichas para consultar la lista.', 'warning');
  }
});
$('cancel-edit-appointment').addEventListener('click', closeAppointment);

backupFile.addEventListener('change', async () => {
  const request = ++backupRequest;
  const file = backupFile.files[0];
  const feedback = $('backup-review-status');
  const counts = $('backup-review-counts');
  counts.replaceChildren();
  $('backup-review-results').hidden = true;
  feedback.dataset.kind = 'info';
  feedback.textContent = '';
  if (!file) return;
  if (file.size > maxBytes) {
    feedback.dataset.kind = 'error';
    feedback.textContent = 'El respaldo supera el límite de 10 MiB.';
    return;
  }
  let result;
  try {
    result = auditBackupRaw(await file.text(), window.AcompanaCompatibility);
  } catch {
    if (request === backupRequest) {
      feedback.dataset.kind = 'error';
      feedback.textContent = 'No se pudo leer el respaldo.';
    }
    return;
  }
  if (request !== backupRequest) return;
  if (result.estado === 'rechazado') {
    feedback.dataset.kind = 'error';
    feedback.textContent = result.motivo === 'json-no-valido' ? 'El archivo no contiene JSON válido.'
      : 'El respaldo no pasó la validación de Acompaña.';
    return;
  }
  feedback.dataset.kind = 'success';
  feedback.textContent = 'Respaldo válido para revisión. Estos conteos no acreditan una restauración.';
  const labels = {
    fichas: 'Fichas', personal: 'Personal de enfermería', jornadasConCosto: 'Jornadas con costo',
    abonosIndividuales: 'Abonos individuales', abonosGenerales: 'Abonos generales',
    cancelacionesGenerales: 'Cancelaciones generales', fichasArchivadas: 'Fichas archivadas',
    fichasConNombreRepetido: 'Fichas con nombres repetidos', medicinas: 'Registros de inventario',
    citas: 'Citas', prepagosDeCobertura: 'Prepagos de cobertura', personalInactivo: 'Personal inactivo',
    personalSinTarifa: 'Personal sin tarifa', asignacionesSinServicio: 'Asignaciones sin jornada con costo',
    turnosLegados: 'Turnos históricos', fechasFinancierasInvalidas: 'Fechas financieras inválidas',
    movimientosConConcepto: 'Movimientos con concepto'
  };
  const rows = Object.entries({ ...result.registros, ...result.hallazgosConocidos })
    .map(([key, total]) => [labels[key] ?? key, String(total)]);
  renderTable(counts, rows, 'Sin registros.');
  $('backup-review-results').hidden = false;
});
appointmentFilter.addEventListener('change', run(async () => {
  const family = families.value;
  const today = localDay.format(new Date());
  try {
    const rows = await loadAppointments(client, family, today, appointmentFilter.value);
    appointmentFilterValue = appointmentFilter.value;
    renderAppointments(rows, family, today,{upcoming:20,past:20,legacy:20});
    status('Agenda filtrada.', 'info');
  } catch (error) {
    appointmentFilter.value = appointmentFilterValue;
    throw error;
  }
}));
$('cancel-rename').addEventListener('click', hideEditing);

// Recuperación conectada: revisión local y restauración siempre en una familia nueva.
$('export-family-backup').addEventListener('click',run(async()=>{
  if(!confirm('La copia contiene información privada de esta familia. ¿Descargarla en este dispositivo?'))return;
  const result=await recovery.export(families.value);
  const url=URL.createObjectURL(new Blob([result.raw],{type:'application/json'}));
  try{const link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  status('Copia descargada. Guárdala en un lugar privado.');
}));
$('family-backup-file').addEventListener('change',async()=>{
  const sequence=++familyBackupRead,selectedClient=client;
  $('family-backup-review').hidden=true;recovery.clear();
  const file=$('family-backup-file').files?.[0];if(!file)return;
  try{
    if(file.size>familyBackupMaxBytes)throw Error('La copia supera el límite de 10 MiB.');
    const raw=await file.text();if(sequence!==familyBackupRead||selectedClient!==client)return;
    const summary=recovery.review(raw);
    $('family-backup-review-status').textContent='Copia de '+summary.name+'. Revisa los conteos antes de crear la familia recuperada.';
    const labels={patients:'Fichas',nurses:'Personal de enfermería',shifts:'Jornadas',receipts:'Abonos generales',receipt_cancellations:'Cancelaciones',individual_payments:'Abonos individuales',individual_allocations:'Asignaciones de abonos',appointments:'Citas',appointment_edits:'Detalles de citas',inventory_items:'Artículos',inventory_profiles:'Pautas y nombres',inventory_purchases:'Compras',inventory_quotes:'Cotizaciones'};
    renderTable($('family-backup-counts'),Object.entries(summary.counts).map(([key,value])=>[labels[key]??key,String(value)]),'Sin registros.');
    $('restore-family-backup').reset();$('restore-family-backup').elements.name.value=(summary.name+' · recuperada').slice(0,80);
    $('family-backup-review').hidden=false;
  }catch(error){$('family-backup-review-status').textContent=error.message;}
});
$('restore-family-backup').addEventListener('submit',run(async event=>{
  const form=event.currentTarget;
  let family,warning;
  try{family=await recovery.restore({name:form.elements.name.value,confirmed:form.elements.confirmed.checked});}
  catch(error){if(!error.saved)throw error;family=error.result;warning=error.message;}
  clearFamilyRecovery();
  try{await refreshFamilies(family);status(warning??'Familia recuperada. Los accesos deben concederse de nuevo.',warning?'warning':'success');}
  catch{status('La familia se recuperó. Pulsa Actualizar fichas para consultarla; no repitas la restauración.','warning');}
}));

let lastAutomaticRefresh=0;
async function automaticRefresh(force=false){
  if(!client||busy||document.visibilityState==='hidden'||Date.now()-lastAutomaticRefresh<30000&&!force)return;
  if(dirtyForms.size){if(force)status('La conexión cambió. Conservamos tu borrador; pulsa Actualizar fichas cuando termines.','info');return;}
  lastAutomaticRefresh=Date.now();
  await run(async()=>{
    try{await client.reconnect();}catch(error){if(!error.network)throw error;}
    await refreshFamilies();
  })({preventDefault(){},currentTarget:$('reload')});
}
window.addEventListener('online',()=>automaticRefresh(true));
window.addEventListener('offline',()=>automaticRefresh(true));
window.addEventListener('focus',()=>automaticRefresh());

// El SW solo almacena la lista estática del build; nunca las respuestas de Supabase.
if(!connections.local&&'serviceWorker' in navigator){
  let reloading=false,applyingUpdate=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate&&!reloading){reloading=true;location.reload();}});
  navigator.serviceWorker.register('/sw.js').then(registration=>{
    const offerUpdate=()=>{
      if(!registration.waiting||!navigator.serviceWorker.controller)return;
      let button=$('apply-connected-update');
      if(!button){button=document.createElement('button');button.id='apply-connected-update';button.type='button';button.textContent='Actualizar Acompaña';$('connection-state').after(button);}
      button.onclick=()=>{if(discardDrafts()){applyingUpdate=true;registration.waiting?.postMessage({type:'APPLY_UPDATE'});}};
    };
    offerUpdate();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',offerUpdate));
  }).catch(()=>status('No se pudo preparar la apertura sin conexión. Puedes seguir utilizando la aplicación con internet.','warning'));
}

if(mayRestoreSession){
  await run(async()=>{
    const next=connectionClient();const id=await next.restoreSession();if(!id)return;
    client=next;userId=id;$('remember-session').checked=next.remember;$('offline-consultation').checked=next.offlineEnabled;
    try{await refreshFamilies();}catch(error){endSession();throw error;}
    $('auth').hidden=true;$('session').hidden=false;
    const selected=connections[credentials.elements.environment.value];$('connection-current').textContent='Conectado a '+selected.label;
    status(next.readOnly?'Sesión disponible para consulta sin conexión.':'Sesión recuperada.',next.readOnly?'warning':'success');
  })({preventDefault(){},currentTarget:credentials});
}
