import { createClient, loadAppointments } from './supabase-client.mjs';
import { createFinance } from './finance.mjs';

const $ = id => document.getElementById(id);
const families = $('families');
const rename = $('rename-patient');
const appointment = $('add-appointment');
const appointmentLists = ['upcoming', 'past', 'legacy'];
const localDay = new Intl.DateTimeFormat('sv-SE');
let client, userId, memberships = [], draft, busy = false;
let appointmentRetry, renderedFamily;
const status = message => { $('status').textContent = message; };
const finance = createFinance({ run, status, itemWithButton });

function hideEditing() {
  draft = undefined;
  rename.reset();
  rename.hidden = true;
}

function resetAppointments() {
  for (const list of appointmentLists) $('appointments-' + list).replaceChildren();
  $('appointments-legacy-section').hidden = true;
  appointment.elements.patient.replaceChildren();
  appointment.reset();
  appointmentRetry = undefined;
}

function endSession() {
  finance.scope(undefined);
  client = userId = undefined;
  memberships = [];
  families.replaceChildren();
  $('patients').replaceChildren();
  $('archived-patients').replaceChildren();
  resetAppointments();
  renderedFamily = undefined;
  $('members').replaceChildren();
  $('invite-code').value = '';
  $('accept-invite').reset();
  hideEditing();
  $('session').hidden = true;
  $('auth').hidden = false;
}

function run(action) {
  return async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    families.disabled = true;
    try {
      await action(event);
    } catch (error) {
      if (error.status === 401 && userId) {
        endSession();
        status('La sesión terminó. Vuelve a iniciar sesión.');
      } else if (error.status === 409 || error.code === 'PT409') {
        status(event.currentTarget === rename
          ? 'La ficha cambió en otro dispositivo. Conservamos tu borrador. Cancela y vuelve a abrir la ficha para revisar el cambio.'
          : 'El registro cambió en otro dispositivo. Revisa su estado actualizado.');
        await refreshFamily().catch(() => {});
      } else if (error.status === 403 && userId) {
        await refreshFamilies().catch(() => {});
        status('Tu cuenta ya no tiene permiso para esta acción.');
      } else {
        status(error.message);
      }
    } finally {
      busy = false;
      families.disabled = false;
    }
  };
}

function actionButton(text, label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label + ': ' + text);
  button.addEventListener('click', run(action));
  return button;
}

function itemWithButton(text, label, action) {
  const item = document.createElement('li');
  item.append(text + ' ', actionButton(text, label, action));
  return item;
}

async function refreshFamily() {
  const family = families.value;
  const owner = memberships.some(row => row.family_id === family && row.role === 'owner');
  finance.scope(owner ? family : undefined);
  $('family').hidden = !family;
  $('owner-actions').hidden = !owner;
  if (renderedFamily !== family) {
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
  const [patients, members, appointments] = await Promise.all([
    client.select('patients', { ...filter, select: 'id,name,revision,archived_at', order: 'name.asc,id.asc' }),
    owner ? client.select('family_members', { ...filter, revoked_at: 'is.null', role: 'eq.caregiver', select: 'user_id' }) : [],
    loadAppointments(client, family, localDay.format(new Date()))
  ]);
  const active = patients.filter(patient => !patient.archived_at);
  const archive = (patient, archived) => async () => {
    if (archived && !confirm('¿Archivar la ficha de ' + patient.name + '? Se conservará su historial.')) return;
    await client.rpc('set_patient_archived', { family, patient: patient.id, expected_revision: patient.revision, archived });
    hideEditing();
    await refreshFamily();
    status(archived ? 'Ficha archivada.' : 'Ficha reactivada.');
  };
  $('patients').replaceChildren(...active.map(patient => {
    const item = itemWithButton(patient.name, 'Editar ficha', () => {
      draft = { ...patient, family };
      rename.elements.name.value = patient.name;
      rename.hidden = false;
      rename.elements.name.focus();
    });
    if (owner) item.append(actionButton(patient.name, 'Archivar ficha', archive(patient, true)));
    return item;
  }));
  $('archived-patients').replaceChildren(...patients.filter(patient => patient.archived_at).map(patient => {
    if (owner) return itemWithButton(patient.name, 'Reactivar ficha', archive(patient, false));
    const item = document.createElement('li');
    item.textContent = patient.name;
    return item;
  }));
  const selection = appointment.elements.patient.value;
  appointment.elements.patient.replaceChildren(...active.map(patient => new Option(patient.name, patient.id)));
  if (active.some(patient => patient.id === selection)) appointment.elements.patient.value = selection;
  appointment.querySelector('button').disabled = !active.length;
  for (const list of appointmentLists) {
    const rows = appointments[list];
    const items = rows.map(row => {
      const item = document.createElement('li');
      item.textContent = [row.appointment_day ?? row.legacy_day, row.appointment_time?.slice(0, 5),
        row.patients.name, row.location, row.notes].filter(Boolean).join(' · ');
      return item;
    });
    if (!items.length && list !== 'legacy') {
      const empty = document.createElement('li');
      empty.textContent = list === 'upcoming' ? 'No hay próximas citas.' : 'No hay citas anteriores.';
      items.push(empty);
    }
    $('appointments-' + list).replaceChildren(...items);
  }
  $('appointments-legacy-section').hidden = !appointments.legacy.length;
  $('members').replaceChildren(...members.map(member => itemWithButton('Cuenta ' + member.user_id, 'Revocar acceso', async () => {
    await client.rpc('revoke_caregiver', { family, member: member.user_id });
    await refreshFamily();
    status('Acceso revocado.');
  })));
  if (owner) await finance.load(client, family, active);
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
  status('Comparte este código solo con la cuenta de prueba invitada.');
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
    at_time: values.get('time') || null, place: values.get('place'), details: values.get('details')
  };
  const key = JSON.stringify(args);
  if (appointmentRetry?.key !== key) appointmentRetry = { key, id: crypto.randomUUID() };
  await client.rpc('add_appointment', { ...args, request_id: appointmentRetry.id });
  try {
    await refreshFamily();
    status('Cita registrada.');
  } catch {
    status('Cita registrada. Usa Actualizar fichas para consultar la lista.');
  }
  appointmentRetry = undefined;
});
$('cancel-rename').addEventListener('click', hideEditing);
