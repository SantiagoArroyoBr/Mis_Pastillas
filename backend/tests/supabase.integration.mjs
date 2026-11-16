import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createClient, loadAppointments } from '../supabase-client.mjs';
import { loadAppliedPayments } from '../finance.mjs';

const key = process.env.ACOMPANA_SUPABASE_PUBLISHABLE_KEY;
if (!key) throw new Error('Define ACOMPANA_SUPABASE_PUBLISHABLE_KEY con la clave publicable de tu Supabase local.');

async function account(role) {
  const client = createClient(key);
  const email = role + '-' + randomUUID() + '@acompana.test';
  const password = 'PilotoLocal-' + randomUUID();
  await client.signUp(email, password);
  return { client, email, id: await client.signIn(email, password) };
}

test('auth and PostgREST keep two families separate while authorized clients share a patient', async () => {
  const { client: owner } = await account('owner');
  const { client: caregiver, email: caregiverEmail, id: caregiverId } = await account('caregiver');
  const { client: outsider } = await account('other-family');
  const anonymous = createClient(key);
  const family = await owner.rpc('create_family', { family_name: 'Familia ficticia A' });
  const anotherFamily = await outsider.rpc('create_family', { family_name: 'Familia ficticia B' });
  assert.notEqual(anotherFamily, family);
  const patient = await owner.rpc('add_patient', { family, patient_name: 'Ficha ficticia' });
  const byId = { id: 'eq.' + patient, select: 'id,name,revision' };
  await assert.rejects(anonymous.select('patients', byId), error => [401, 403].includes(error.status));
  assert.deepEqual(await outsider.select('patients', byId), []);
  await assert.rejects(outsider.rpc('add_patient', { family, patient_name: 'Fuera de la familia' }), { status: 403 });

  const invitation = await owner.rpc('create_invite', { family, invite_email: caregiverEmail });
  await assert.rejects(outsider.rpc('accept_invite', { invitation }), { status: 400 });
  assert.equal(await caregiver.rpc('accept_invite', { invitation }), family);
  assert.deepEqual(await caregiver.select('patients', byId), [{ id: patient, name: 'Ficha ficticia', revision: 1 }]);
  const edit = { family, patient, expected_revision: 1, patient_name: 'Ficha compartida' };
  assert.equal(await caregiver.rpc('rename_patient', edit), 2);
  await assert.rejects(owner.rpc('rename_patient', edit), { status: 409 });
  assert.deepEqual(await owner.select('patients', byId), [{ id: patient, name: 'Ficha compartida', revision: 2 }]);

  const nurse = await owner.rpc('add_nurse', { family, nurse_name: 'Enfermería ficticia', full_rate: '12000', half_rate: '6500' });
  const day = '2026-11-16';
  const shiftId = randomUUID();
  await owner.rpc('record_shift', { family, request_id: shiftId, patient, nurse, day, shift_type: 'half' });
  const shifts = [{ id: shiftId }];
  assert.deepEqual(await loadAppliedPayments(owner, family, shifts), new Map());
  const shiftHistory = {
    family_id: 'eq.' + family, select: 'service_day,modality,cost_cents,patients(name),nurses(name)',
    order: 'service_day.desc,id.desc', limit: 20
  };
  assert.deepEqual(await owner.select('shifts', shiftHistory), [{
    service_day: day, modality: 'half', cost_cents: 6500,
    patients: { name: 'Ficha compartida' }, nurses: { name: 'Enfermería ficticia' }
  }]);
  assert.deepEqual(await caregiver.select('shifts', shiftHistory), []);
  assert.deepEqual(await outsider.select('shifts', shiftHistory), []);
  const individualArgs = { family, nurse, day, cents: '4000' };
  const individual = (client, request_id) => client.rpc('record_individual_payment', { ...individualArgs, request_id });
  const ids = [randomUUID(), randomUUID()];
  const results = await Promise.allSettled(ids.map(id => individual(owner, id)));
  const succeeded = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(succeeded.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'PT422');
  assert.equal(await individual(owner, succeeded[0].value), succeeded[0].value);
  await assert.rejects(individual(caregiver, randomUUID()), { status: 403 });
  const byFamily = { family_id: 'eq.' + family, select: 'paid_on,amount_cents,nurses(name)' };
  assert.deepEqual(await owner.select('individual_payments', byFamily), [
    { paid_on: day, amount_cents: 4000, nurses: { name: 'Enfermería ficticia' } }
  ]);
  assert.deepEqual(await caregiver.select('individual_payments', byFamily), []);
  assert.deepEqual(await outsider.select('individual_payments', byFamily), []);
  assert.deepEqual(await loadAppliedPayments(owner, family, shifts), new Map([[shiftId, 4000n]]));
  assert.deepEqual(await loadAppliedPayments(caregiver, family, shifts), new Map());
  assert.deepEqual(await loadAppliedPayments(outsider, family, shifts), new Map());
  await owner.rpc('record_individual_payment', { ...individualArgs, request_id: randomUUID(), cents: '2500' });
  assert.deepEqual(await loadAppliedPayments(owner, family, shifts), new Map([[shiftId, 6500n]]));
  const receipt = randomUUID();
  const args = { family, request_id: receipt, day, cents: '5000' };
  assert.deepEqual(await Promise.all([owner.rpc('record_receipt', args), owner.rpc('record_receipt', args)]), [receipt, receipt]);
  assert.deepEqual(await owner.select('receipts', { id: 'eq.' + receipt, select: 'amount_cents' }), [{ amount_cents: 5000 }]);
  assert.deepEqual(await caregiver.select('receipts', { id: 'eq.' + receipt }), []);
  assert.deepEqual(await outsider.select('receipts', { id: 'eq.' + receipt }), []);
  const cutoff = { family, as_of: day };
  assert.deepEqual(await owner.rpc('financial_balance', cutoff), [{ cost_cents: '6500', received_cents: '5000', balance_cents: '1500' }]);
  await assert.rejects(caregiver.rpc('financial_balance', cutoff), { status: 403 });
  await assert.rejects(outsider.rpc('financial_balance', cutoff), { status: 403 });
  await owner.rpc('cancel_receipt', { family, request_id: randomUUID(), receipt, day });
  assert.deepEqual(await owner.rpc('financial_balance', cutoff), [{ cost_cents: '6500', received_cents: '0', balance_cents: '6500' }]);

  const appointmentId = randomUUID();
  const booking = { family, request_id: appointmentId, patient, day, at_time: '08:00', place: '', details: '' };
  assert.equal(await caregiver.rpc('add_appointment', booking), appointmentId);
  const appointments = { family_id: 'eq.' + family, select: 'appointment_day,legacy_day,appointment_time,location,notes,patients(name)',
    order: 'appointment_day.desc.nullslast,id.desc', limit: 20 };
  assert.deepEqual(await owner.select('appointments', appointments), [{
    appointment_day: day, legacy_day: null, appointment_time: '08:00:00', location: '', notes: '', patients: { name: 'Ficha compartida' }
  }]);
  assert.deepEqual(await outsider.select('appointments', appointments), []);
  assert.equal(await owner.rpc('set_patient_archived', { family, patient, expected_revision: 2, archived: true }), 3);
  assert.deepEqual(await caregiver.select('patients', { ...byId, archived_at: 'is.null' }), []);
  assert.equal((await caregiver.select('appointments', appointments)).length, 1);
  assert.equal(await caregiver.rpc('add_appointment', booking), appointmentId);
  await assert.rejects(caregiver.rpc('add_appointment', { ...booking, request_id: randomUUID() }), { status: 422 });
  assert.equal(await owner.rpc('set_patient_archived', { family, patient, expected_revision: 3, archived: false }), 4);

  const previousDay = '2026-11-15';
  await caregiver.rpc('add_appointment', { ...booking, request_id: randomUUID(), day: previousDay });
  await Promise.all(Array.from({ length: 21 }, (_, index) => caregiver.rpc('add_appointment', {
    ...booking, request_id: randomUUID(), day: '2026-11-' + (17 + index % 12), at_time: null
  })));
  const calendar = await loadAppointments(caregiver, family, day);
  assert.equal(calendar.upcoming.length, 20);
  assert.equal(calendar.upcoming[0].appointment_day, day);
  assert.deepEqual(calendar.upcoming.map(row => row.appointment_day),
    calendar.upcoming.map(row => row.appointment_day).sort());
  assert.deepEqual(calendar.past.map(row => row.appointment_day), [previousDay]);
  assert.deepEqual(calendar.legacy, []);
  assert.deepEqual(await loadAppointments(outsider, family, day), { upcoming: [], past: [], legacy: [] });

  const editBooking = { family, appointment: appointmentId, expected_revision: 1, day: previousDay, at_time: null, place: 'Lugar ficticio' };
  const edits = await Promise.allSettled([
    owner.rpc('edit_appointment', { ...editBooking, details: 'Cambio A' }),
    caregiver.rpc('edit_appointment', { ...editBooking, details: 'Cambio B' })
  ]);
  assert.equal(edits.find(result => result.status === 'fulfilled')?.value, 2);
  assert.equal(edits.find(result => result.status === 'rejected')?.reason.code, 'PT409');
  const updated = await loadAppointments(owner, family, day);
  const edited = updated.past.find(row => row.id === appointmentId);
  assert.equal(edited?.appointment_day, previousDay);
  assert.equal(edited?.appointment_time, null);
  assert.equal(edited?.revision, 2);
  assert.equal(updated.upcoming.some(row => row.id === appointmentId), false);
  assert.equal(await caregiver.rpc('add_appointment', booking), appointmentId);
  await assert.rejects(outsider.rpc('edit_appointment', { ...editBooking, details: '' }), { status: 403 });

  await owner.rpc('revoke_caregiver', { family, member: caregiverId });
  assert.deepEqual(await caregiver.select('patients', byId), []);
  assert.deepEqual(await caregiver.select('appointments', appointments), []);
  assert.deepEqual(await loadAppointments(caregiver, family, day), { upcoming: [], past: [], legacy: [] });
  await assert.rejects(caregiver.rpc('rename_patient', { ...edit, expected_revision: 2 }), { status: 403 });
  await caregiver.signOut();
  await assert.rejects(caregiver.select('patients', byId), error => [401, 403].includes(error.status));
});
