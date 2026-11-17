import { createClient, loadAppointments } from './supabase-client.mjs';
import { createFinance } from './finance.mjs';
import { createInventory } from './inventory.mjs';
import { createCalendar } from './calendar.mjs';
import { auditBackupRaw, maxBytes } from './backup-diagnostics.mjs';

const $ = id => document.getElementById(id);
const families = $('families');
const rename = $('rename-patient');
const appointment = $('add-appointment');
const editAppointment = $('edit-appointment');
const appointmentFilter = $('appointment-filter');
const appointmentLists = ['upcoming', 'past', 'legacy'];
const localDay = new Intl.DateTimeFormat('sv-SE');
let client, userId, memberships = [], draft, busy = false;
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
    const duration = kind === 'error' || kind === 'warning' ? 12000 : 6000;
    noticeTimer = setTimeout(dismissNotice, duration);
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
  $('auth').hidden = false;
}

function run(action) {
  return async event => {
    event.preventDefault();
    const trigger = event.currentTarget;
    if (busy) return;
    busy = true;
    families.disabled = true;
    appointmentFilter.disabled = true;
    $('inventory-filter').disabled = true;
    $('pilot-calendar-patient').disabled = true;
    try {
      await action(event);
    } catch (error) {
      if (error.status === 401 && userId) {
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

window.addEventListener('hashchange', showPilotView);

async function refreshFamily() {
  const family = families.value;
  const owner = memberships.some(row => row.family_id === family && row.role === 'owner');
  finance.scope(owner ? family : undefined);
  inventory.scope(family || undefined);
  calendar.scope(family || undefined);
  $('family').hidden = !family;
  $('pilot-navigation').hidden = false;
  for (const link of $('pilot-navigation').querySelectorAll('a')) {
    link.hidden = link.hash !== '#configuracion' && (!family || (link.hash === '#finance' && !owner));
  }
  $('no-family-help').hidden = Boolean(family);
  families.disabled = !family || busy;
  $('reload').hidden = !family;
  showPilotView();
  $('owner-actions').hidden = !owner;
  if (renderedFamily !== family) {
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
    loadAppointments(client, family, today, appointmentFilterValue)
  ]);
  const active = patients.filter(patient => !patient.archived_at);
  $('pilot-active-count').textContent = String(active.length);
  $('pilot-archived-count').textContent = String(patients.length - active.length);
  const archive = (patient, archived) => async () => {
    if (archived && !confirm('¿Archivar la ficha de ' + patient.name + '? Se conservará su historial.')) return;
    await client.rpc('set_patient_archived', { family, patient: patient.id, expected_revision: patient.revision, archived });
    hideEditing();
    if (archived && appointmentDraft?.patient === patient.id) closeAppointment();
    await refreshFamily();
    status(archived ? 'Ficha archivada.' : 'Ficha reactivada.');
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
  }), 'Aún no hay fichas activas.');
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
      await client.rpc('revoke_caregiver', { family, member: member.user_id });
      await refreshFamily();
      status('Acceso revocado.');
    })
  ]), 'Aún no hay cuentas cuidadoras.');
  await Promise.all([owner ? finance.load(client, family, active) : undefined,
    inventory.load(client, family, patients), calendar.load(client, family, patients, owner)]);
}

function renderAppointments(appointments, family, today) {
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
    renderTable($('appointments-' + list), rows, list === 'upcoming' ? 'No hay próximas citas.' : 'No hay citas anteriores.');
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
  const form = event.currentTarget;
  const values = new FormData(form);
  const email = values.get('email').trim();
  if (!email.endsWith('.test')) throw new Error('Usa un correo ficticio que termine en .test.');
  const password = values.get('password');
  const next = createClient(values.get('key').trim());
  if (event.submitter?.value === 'yes') await next.signUp(email, password);
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
  status('Sesión iniciada.');
}));

$('logout').addEventListener('click', run(async () => {
  try { await client.signOut(); } finally { endSession(); }
  status('Sesión cerrada.');
}));

function rpcForm(id, handler) {
  $(id).addEventListener('submit', run(async event => {
    const form = event.currentTarget;
    await handler(new FormData(form));
    form.reset();
  }));
}

rpcForm('create-family', async values => {
  const family = await client.rpc('create_family', { family_name: values.get('name') });
  await refreshFamilies(family);
  status('Familia creada.');
});
rpcForm('accept-invite', async values => {
  const family = await client.rpc('accept_invite', { invitation: values.get('code').trim() });
  await refreshFamilies(family);
  status('Invitación aceptada.');
});
families.addEventListener('change', run(async () => {
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
  await refreshFamilies();
  status('Fichas actualizadas.');
}));
rpcForm('add-patient', async values => {
  await client.rpc('add_patient', { family: families.value, patient_name: values.get('name') });
  await refreshFamily();
  status('Ficha agregada.');
});
rpcForm('rename-patient', async values => {
  if (!draft) return;
  await client.rpc('rename_patient', {
    family: draft.family, patient: draft.id, expected_revision: draft.revision, patient_name: values.get('name')
  });
  hideEditing();
  await refreshFamily();
  status('Nombre guardado.');
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
    renderAppointments(rows, family, today);
    status('Agenda filtrada.', 'info');
  } catch (error) {
    appointmentFilter.value = appointmentFilterValue;
    throw error;
  }
}));
$('cancel-rename').addEventListener('click', hideEditing);
