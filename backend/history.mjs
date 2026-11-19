const columnName = /^[a-z_][a-z0-9_]*$/;

function quoted(value) {
  return typeof value === 'number' ? String(value)
    : '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
}

// PostgREST combina este OR con los filtros de familia, persona y rango ya existentes.
// El id final desambigua filas que comparten fecha y hora.
export function historyCursor(order, row) {
  const keys = order.split(',').map(part => {
    const [name, direction = 'asc', nulls = direction === 'asc' ? 'nullslast' : 'nullsfirst'] = part.split('.');
    if (!columnName.test(name) || !['asc', 'desc'].includes(direction)
        || !['nullsfirst', 'nullslast'].includes(nulls) || !(name in row)) throw new Error('Orden de historial inválido.');
    return { name, direction, nulls };
  });
  if (keys.at(-1)?.name !== 'id' || row.id == null) throw new Error('El historial requiere un identificador estable.');
  const alternatives = [], equal = [];
  for (const { name, direction, nulls } of keys) {
    const value = row[name];
    const after = value == null
      ? (nulls === 'nullsfirst' ? [name + '.not.is.null'] : [])
      : [name + (direction === 'asc' ? '.gt.' : '.lt.') + quoted(value),
        ...(nulls === 'nullslast' ? [name + '.is.null'] : [])];
    for (const condition of after) alternatives.push(equal.length ? 'and(' + [...equal, condition].join(',') + ')' : condition);
    equal.push(name + (value == null ? '.is.null' : '.eq.' + quoted(value)));
  }
  return '(' + alternatives.join(',') + ')';
}

export async function readHistoryWindow(client, table, params, count = 20) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Tamaño de historial inválido.');
  if (!params.order || params.or || params.offset !== undefined) throw new Error('Consulta de historial inválida.');
  const rows = [], seen = new Set();
  let cursor;
  while (rows.length <= count) {
    const limit = Math.min(200, count + 1 - rows.length);
    const page = await client.select(table, { ...params, limit, ...(cursor && { or: cursor }) });
    if (!Array.isArray(page)) throw new Error('No se pudo leer el historial.');
    for (const row of page) {
      if (row.id == null || seen.has(row.id)) throw new Error('El historial cambió durante la lectura. Actualiza e inténtalo de nuevo.');
      seen.add(row.id); rows.push(row);
    }
    if (page.length < limit || rows.length > count) break;
    const next = historyCursor(params.order, page.at(-1));
    if (cursor === next) throw new Error('No se pudo avanzar en el historial.');
    cursor = next;
  }
  return { rows: rows.slice(0, count), hasMore: rows.length > count };
}

export function createHistoryControl(body, label, run, reload) {
  const container = document.createElement('div');
  container.className = 'pilot-history-control';
  const note = document.createElement('p');
  note.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Cargar más';
  button.setAttribute('aria-label', 'Cargar más: ' + label);
  button.setAttribute('aria-controls', body.id);
  container.append(note, button);
  body.closest('.pilot-table-scroll').after(container);
  let count = 20, more = false;
  button.addEventListener('click', run(async () => {
    if (!more) return;
    const next = count + 20;
    await reload(next);
  }));
  return {
    get count() { return count; },
    update(result, requested = count) {
      count = requested; more = result.hasMore;
      note.textContent = result.rows.length ? 'Mostrando ' + result.rows.length + (more ? ' registros. Hay más disponibles.' : ' registros. Historial completo.') : '';
      button.hidden = !more;
      container.hidden = !result.rows.length;
    },
    reset() { count = 20; more = false; note.textContent = ''; button.hidden = true; container.hidden = true; }
  };
}
