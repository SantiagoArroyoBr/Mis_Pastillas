const $ = id => document.getElementById(id);
const dayFormat = new Intl.DateTimeFormat('sv-SE');

function endOfDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, month - 1, date, 23, 59, 59, 999);
  if (!year || !month || !date || dayFormat.format(value) !== day) throw new Error('Selecciona una fecha válida.');
  return value.toISOString();
}

export function temporaryAccessState(row, now = Date.now()) {
  if (row.revoked_at) return 'Revocado';
  if (Date.parse(row.expires_at) <= now) return 'Vencido';
  return row.state === 'active' ? 'Activo' : 'Pendiente de activación';
}

export function createAdminAccess({ run, status, actionButton, renderTable, onChange }) {
  let scope, generation = 0;
  const form = $('create-temporary-access');
  const body = $('temporary-access-list');

  function clearCode() {
    $('temporary-access-code').value = '';
    $('temporary-access-login').value = '';
    $('temporary-access-result').hidden = true;
  }

  function clear() {
    generation++;
    scope = undefined;
    clearCode();
    form.reset();
    body.replaceChildren();
    $('admin-access-controls').hidden = true;
    $('admin-access-unavailable').hidden = false;
  }

  function reveal(result) {
    if (!result?.code || !result?.login) throw new Error('No se recibió la activación. Actualiza los accesos antes de volver a intentar.');
    $('temporary-access-code').value = result.code;
    $('temporary-access-login').value = result.login;
    $('temporary-access-result').hidden = false;
    $('temporary-access-code').focus();
  }

  $('dismiss-temporary-code').addEventListener('click', clearCode);
  form.addEventListener('submit', run(async event => {
    if (!scope) throw new Error('Selecciona una familia administrada en el entorno habilitado.');
    const current = scope;
    const values = new FormData(event.currentTarget);
    const result = await current.client.access('issue', {
      family: current.family, name: values.get('name').trim(), expiresAt: endOfDay(values.get('expires'))
    });
    form.reset();
    await onChange();
    if (scope?.family === current.family && scope?.client === current.client) reveal(result);
    status('Acceso creado. Entrega el identificador y el código solo a la persona indicada.', 'info');
  }));

  async function load(client, family, owner) {
    if (!owner || !family || !client?.temporaryAccessEnabled) {
      clear();
      return;
    }
    const changed = scope?.client !== client || scope?.family !== family;
    if (changed) clear();
    scope = { client, family };
    const request = ++generation;
    $('admin-access-unavailable').hidden = true;
    $('admin-access-controls').hidden = false;
    const date = new Date();
    form.elements.expires.min = dayFormat.format(date);
    if (!form.elements.expires.value) {
      date.setDate(date.getDate() + 30);
      form.elements.expires.value = dayFormat.format(date);
    }
    const rows = await client.select('temporary_accesses', {
      family_id: 'eq.' + family,
      select: 'id,display_name,expires_at,revoked_at,user_id,revision,state', order: 'display_name.asc,id.asc'
    });
    if (generation !== request || scope?.client !== client || scope?.family !== family) return;
    renderTable(body, rows.map(row => {
      const actions = document.createElement('div');
      actions.className = 'pilot-row-actions';
      const perform = (action, message, extra = {}) => async () => {
        if (scope?.family !== family || scope?.client !== client) throw new Error('La familia cambió. Actualiza la lista.');
        if (!confirm(message + ' ' + row.display_name + '?')) return;
        clearCode();
        const result = await client.access(action, { family, access: row.id, revision: row.revision, ...extra });
        await onChange();
        if (action === 'reset' && scope?.family === family && scope?.client === client) reveal(result);
        status(action === 'reset' ? 'Recuperación preparada. La persona debe activar su acceso de nuevo.'
          : action === 'revoke' ? 'Acceso revocado. Se conserva su historial.' : 'Vencimiento actualizado.');
      };
      if (!row.revoked_at) {
        const renewal = document.createElement('input');
        renewal.type = 'date';
        renewal.setAttribute('aria-label', 'Nuevo vencimiento de ' + row.display_name);
        renewal.min = dayFormat.format(new Date());
        renewal.value = dayFormat.format(new Date(row.expires_at));
        actions.append(renewal, actionButton(row.display_name, 'Renovar acceso', async () => {
          await perform('renew', '¿Cambiar el vencimiento del acceso de', { expiresAt: endOfDay(renewal.value) })();
        }), actionButton(row.display_name, 'Restablecer acceso', perform('reset', '¿Invalidar la activación anterior y restablecer el acceso de')),
        actionButton(row.display_name, 'Revocar acceso', perform('revoke', '¿Revocar el acceso de')));
      } else actions.textContent = 'Conservado en el historial';
      return [row.display_name, [dayFormat.format(new Date(row.expires_at)), temporaryAccessState(row)].join(' · '), actions];
    }), 'Aún no hay accesos temporales para esta familia.');
  }

  return { load, clear };
}
