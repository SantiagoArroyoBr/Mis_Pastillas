import { projectStock } from './inventory.mjs';

const $ = id => document.getElementById(id);
const monthFormat = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' });
const shortDayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const dateKey = new Intl.DateTimeFormat('sv-SE');
const categories = {
  appointment: ['C', 'Citas'],
  shift: ['T', 'Turnos'],
  stock: ['R', 'Reposición estimada'],
  depletion: ['A', 'Agotamiento estimado']
};
const sectionLinks = {
  appointment: ['#appointments-heading', 'Ir a Citas'],
  shift: ['#finance', 'Ir a Enfermería y pagos'],
  stock: ['#inventory', 'Ir a Inventario'],
  depletion: ['#inventory', 'Ir a Inventario']
};

export function upcomingCalendarDays(byDay, today) {
  return Array.from(byDay).filter(([day]) => day >= today)
    .sort(([left], [right]) => left.localeCompare(right)).slice(0, 3);
}

export function monthRange(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  return { first, next, lead: (first.getDay() + 6) % 7, days: new Date(next.getTime() - 1).getDate() };
}

async function readRows(client, table, params) {
  const limit = 250;
  const rows = [];
  for (let offset = 0; ; offset += limit) {
    const page = await client.select(table, { ...params, limit, offset });
    rows.push(...page);
    if (page.length < limit) return rows;
  }
}

export async function loadCalendarRecords(client, family, patient, month, owner) {
  const { first, next } = monthRange(month);
  const from = dateKey.format(first), until = dateKey.format(next);
  const range = column => '(' + column + '.gte.' + from + ',' + column + '.lt.' + until + ')';
  const filter = { family_id: 'eq.' + family, ...(patient && { patient_id: 'eq.' + patient }) };
  const [appointments, shifts, inventory] = await Promise.all([
    readRows(client, 'appointment_details', { ...filter, and: range('appointment_day'),
      select: 'appointment_day,appointment_time,patient_name,location,notes',
      order: 'appointment_day.asc,appointment_time.asc.nullslast,id.asc' }),
    owner ? readRows(client, 'shifts', { ...filter, and: range('service_day'),
      select: 'service_day,modality,patients(name),nurses(name)', order: 'service_day.asc,id.asc' }) : [],
    readRows(client, 'inventory_items', { ...filter, 'patients.archived_at': 'is.null',
      select: 'name,base_quantity,base_at,consumptions,patients!inner(name),inventory_profiles(name,consumptions)',
      order: 'id.asc' })
  ]);
  return { appointments, shifts, inventory, from, until };
}

export function buildCalendarEvents(records, domain, now) {
  const byDay = new Map();
  function add(day, event) {
    if (!day || day < records.from || day >= records.until) return;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(event);
  }
  const today = dateKey.format(now);
  for (const row of records.appointments) {
    add(row.appointment_day, { kind: 'appointment', name: row.patient_name,
      details: [row.appointment_time?.slice(0, 5), row.location, row.notes].filter(Boolean).join(' · ') });
  }
  for (const row of records.shifts) {
    const type = row.modality === 'half' ? 'Media jornada' : 'Jornada completa';
    add(row.service_day, { kind: 'shift', name: row.nurses.name,
      details: [row.patients.name, type, row.service_day > today ? 'Programada' : 'Registrada'].join(' · ') });
  }
  if (records.until <= today) return byDay;
  for (const row of records.inventory) {
    const item = { ...row, ...row.inventory_profiles };
    const stock = projectStock(domain, item, now);
    const details = row.patients.name + ' · ' + domain.num(stock.rem) + ' unidades al consultar';
    if (stock.now || stock.end) {
      add(stock.now ? today : dateKey.format(stock.buy), { kind: 'stock', name: item.name, details });
    }
    if (!stock.left || stock.end) {
      const exhaustion = stock.end ? dateKey.format(stock.end) : today;
      add(exhaustion, { kind: 'depletion', name: item.name,
        details: details + (stock.end ? ' · Día de la última toma o uso completo proyectado' : ' · No alcanza para el próximo uso') });
    }
  }
  return byDay;
}

export function createCalendar(run) {
  const filter = $('pilot-calendar-patient');
  const grid = $('pilot-calendar-grid');
  const detail = $('pilot-calendar-detail');
  const feedback = $('pilot-calendar-status');
  let client, family, owner, month = monthRange(new Date()).first, selected, focusDay, byDay = new Map();

  function scope(nextFamily) {
    if (nextFamily === family) return;
    family = nextFamily;
    client = undefined;
    month = monthRange(new Date()).first;
    selected = focusDay = undefined;
    byDay = new Map();
    filter.replaceChildren();
    grid.replaceChildren();
    detail.hidden = true;
    $('pilot-calendar-upcoming').hidden = true;
    $('pilot-calendar-upcoming-days').replaceChildren();
    $('pilot-calendar-events').replaceChildren();
    feedback.textContent = '';
  }

  function showDay(day) {
    selected = day;
    const events = byDay.get(day) ?? [];
    const title = $('pilot-calendar-day');
    title.textContent = dayFormat.format(window.AcompanaDomain.pd(day));
    const rows = Object.entries(categories).flatMap(([kind, [, label]]) => {
      const grouped = events.filter(event => event.kind === kind);
      if (!grouped.length) return [];
      const item = document.createElement('li');
      item.className = 'pilot-calendar-event-group';
      const heading = document.createElement('h5');
      heading.dataset.calendarKind = kind;
      heading.textContent = label + ' · ' + grouped.length;
      const entries = document.createElement('ul');
      for (const event of grouped) {
        const entry = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = event.name;
        entry.append(name);
        if (event.details) {
          const description = document.createElement('p');
          description.textContent = event.details;
          entry.append(description);
        }
        entries.append(entry);
      }
      const link = document.createElement('a');
      [link.href, link.textContent] = sectionLinks[kind];
      item.append(heading, entries, link);
      return [item];
    });
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.textContent = 'No hay eventos para este día.';
      rows.push(empty);
    }
    $('pilot-calendar-events').replaceChildren(...rows);
    detail.hidden = false;
    for (const button of grid.querySelectorAll('button')) button.setAttribute('aria-expanded', String(button.dataset.day === day));
  }

  function renderUpcoming(today) {
    const rows = upcomingCalendarDays(byDay, today).map(([day, events]) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.openDay = day;
      button.setAttribute('aria-controls', 'pilot-calendar-detail');
      button.textContent = day === today ? 'Hoy' : shortDayFormat.format(window.AcompanaDomain.pd(day));
      const text = document.createElement('span');
      const names = [...new Set(events.map(event => event.name))];
      text.textContent = names.slice(0, 2).join(' · ') + (names.length > 2 ? ' · +' + (names.length - 2) : '');
      const count = document.createElement('small');
      count.textContent = events.length + (events.length === 1 ? ' evento' : ' eventos');
      row.append(button, text, count);
      return row;
    });
    $('pilot-calendar-upcoming').hidden = !rows.length;
    $('pilot-calendar-upcoming-days').replaceChildren(...rows);
  }

  function render() {
    const { first, lead, days } = monthRange(month);
    const today = dateKey.format(Date.now());
    const firstKey = dateKey.format(first);
    const tabbable = focusDay ?? (today.startsWith(firstKey.slice(0, 7)) ? today : firstKey);
    $('pilot-calendar-month').textContent = monthFormat.format(first);
    const children = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(label => {
      const node = document.createElement('span');
      node.className = 'pilot-weekday';
      node.textContent = label;
      return node;
    });
    for (let pad = 0; pad < lead; pad++) children.push(document.createElement('span'));
    for (let number = 1; number <= days; number++) {
      const date = new Date(first.getFullYear(), first.getMonth(), number);
      const day = dateKey.format(date);
      const summaries = new Map();
      for (const event of byDay.get(day) ?? []) summaries.set(event.kind, (summaries.get(event.kind) ?? 0) + 1);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.day = day;
      button.textContent = String(number);
      button.tabIndex = day === tabbable ? 0 : -1;
      button.setAttribute('aria-controls', 'pilot-calendar-detail');
      button.setAttribute('aria-expanded', String(day === selected));
      if (day === today) button.setAttribute('aria-current', 'date');
      const label = [dayFormat.format(date)];
      const marks = document.createElement('span');
      marks.className = 'pilot-calendar-marks';
      marks.setAttribute('aria-hidden', 'true');
      for (const [kind, [short, name]] of Object.entries(categories)) {
        const count = summaries.get(kind);
        if (!count) continue;
        label.push(name + ': ' + count);
        const mark = document.createElement('span');
        mark.dataset.calendarKind = kind;
        mark.textContent = short + (count > 9 ? '+' : count);
        marks.append(mark);
      }
      button.append(marks);
      button.setAttribute('aria-label', label.join(', '));
      children.push(button);
    }
    grid.replaceChildren(...children);
    renderUpcoming(today);
    if (selected) showDay(selected);
  }

  async function reload() {
    if (!client || !family) return;
    feedback.textContent = 'Cargando calendario…';
    try {
      const records = await loadCalendarRecords(client, family, filter.value, month, owner);
      byDay = buildCalendarEvents(records, window.AcompanaDomain, Date.now());
      feedback.textContent = '';
    } catch {
      byDay = new Map();
      selected = undefined;
      detail.hidden = true;
      feedback.textContent = 'No se pudo cargar el calendario. Usa Actualizar fichas para reintentar.';
    }
    render();
  }

  async function load(nextClient, nextFamily, patients, isOwner) {
    scope(nextFamily);
    client = nextClient;
    owner = isOwner;
    $('pilot-calendar-shift-legend').hidden = !owner;
    const previous = filter.value;
    const counts = new Map();
    for (const patient of patients) counts.set(patient.name, (counts.get(patient.name) ?? 0) + 1);
    filter.replaceChildren(new Option('Todas las fichas', ''), ...patients.map(patient => new Option(
      patient.name + (counts.get(patient.name) > 1 ? ' · ' + patient.id.slice(0, 8) : '')
      + (patient.archived_at ? ' (archivada)' : ''), patient.id
    )));
    if (patients.some(patient => patient.id === previous)) filter.value = previous;
    await reload();
  }

  function moveFocus(button) {
    for (const day of grid.querySelectorAll('button')) day.tabIndex = day === button ? 0 : -1;
    focusDay = button.dataset.day;
  }
  grid.addEventListener('click', event => {
    const button = event.target.closest('button[data-day]');
    if (!button) return;
    moveFocus(button);
    showDay(button.dataset.day);
    if (event.detail) detail.scrollIntoView({ block: 'nearest' });
  });
  $('pilot-calendar-upcoming-days').addEventListener('click', event => {
    const shortcut = event.target.closest('button[data-open-day]');
    if (!shortcut) return;
    const button = grid.querySelector('[data-day="' + shortcut.dataset.openDay + '"]');
    if (!button) return;
    moveFocus(button);
    showDay(button.dataset.day);
    $('pilot-calendar-day').focus();
  });
  $('pilot-calendar-close-day').addEventListener('click', () => {
    const button = grid.querySelector('[aria-expanded=true]');
    selected = undefined;
    detail.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    button?.focus();
  });
  grid.addEventListener('keydown', event => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = offsets[event.key];
    if (!step || !event.target.matches('button[data-day]')) return;
    event.preventDefault();
    const buttons = Array.from(grid.querySelectorAll('button'));
    const next = buttons[buttons.indexOf(event.target) + step];
    if (!next) return;
    moveFocus(next);
    next.focus();
  });
  for (const [id, change] of [
    ['prev', () => new Date(month.getFullYear(), month.getMonth() - 1, 1)],
    ['next', () => new Date(month.getFullYear(), month.getMonth() + 1, 1)],
    ['today', () => monthRange(new Date()).first]
  ]) {
    $('pilot-calendar-' + id).addEventListener('click', run(async () => {
      month = change();
      selected = focusDay = undefined;
      detail.hidden = true;
      await reload();
    }));
  }
  filter.addEventListener('change', run(reload));
  return { scope, load, reload };
}
