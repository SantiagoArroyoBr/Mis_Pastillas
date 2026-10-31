// Funciones puras de fechas, frecuencia y cálculo de inventario.
// No lee ni escribe almacenamiento y no depende del DOM.
(() => {
  const WD_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  function parseTimes(txt) {
    const out = [];
    for (const t of txt.split(/[,;]+/)) {
      const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
      if (!m) return null;
      const h = +m[1], mi = +(m[2] || 0);
      if (h > 23 || mi > 59) return null;
      out.push(String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'));
    }
    return [...new Set(out)].sort();
  }

  const at = (d, t) => {
    const [h, m] = t.split(':').map(Number);
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };

  function dayMatches(sch, d) {
    if (!sch || sch.type === 'daily') return true;
    if (sch.type === 'weekdays') return (sch.days || []).includes(d.getDay());
    if (sch.type === 'interval') {
      const start = new Date(sch.start || Date.now()); start.setHours(0, 0, 0, 0);
      const cur = new Date(d); cur.setHours(0, 0, 0, 0);
      const diff = Math.round((cur - start) / 86400000);
      return diff >= 0 && diff % Math.max(1, sch.n || 1) === 0;
    }
    return true;
  }

  function schedText(sch) {
    if (!sch || sch.type === 'daily') return 'todos los días';
    if (sch.type === 'weekdays') {
      const days = (sch.days || []).slice().sort();
      return days.length ? days.map(i => WD_SHORT[i]).join(', ') : 'todos los días';
    }
    if (sch.type === 'interval') return 'cada ' + (sch.n || 1) + ' días';
    return 'todos los días';
  }

  function evs(m, a, b) {
    const out = [];
    for (const c of m.cons) {
      const d = new Date(a); d.setHours(0, 0, 0, 0);
      while (d.getTime() <= b) {
        if (dayMatches(c.schedule, d)) {
          for (const time of c.times) {
            const when = at(d, time);
            if (when > a && when <= b) out.push({ t: when, d: c.dose });
          }
        }
        d.setDate(d.getDate() + 1);
      }
    }
    return out.sort((x, y) => x.t - y.t);
  }

  function calc(m, now = Date.now()) {
    const used = evs(m, m.t0, now).reduce((sum, event) => sum + event.d, 0);
    const rem = Math.max(0, +(m.base - used).toFixed(2));
    let stock = rem, left = 0, end = null;
    for (const event of evs(m, now, now + 1000 * 864e5)) {
      if (stock + 1e-9 < event.d) break;
      stock = +(stock - event.d).toFixed(2); left++; end = event.t;
    }
    const warn = 2 * 864e5, urgent = 1 * 864e5;
    const buy = end ? Math.max(now, end - warn) : now;
    const status = (!end || end <= now + urgent) ? 'red' : end <= now + warn ? 'amber' : 'green';
    const days = end ? Math.max(0, Math.ceil((end - now) / 864e5)) : 0;
    return { rem, left, end, buy, st: status, days, now: buy <= now + 3600e3 };
  }

  const fmt = ms => new Date(ms).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const num = n => String(n).replace('.', ',');
  function consText(m) {
    if (m.kind === 'sup') {
      const c = m.cons[0] || { dose: 1 };
      return 'Uso: ' + num(c.dose) + ' pieza' + (c.dose === 1 ? '' : 's') + ' al día';
    }
    const one = m.cons.length === 1;
    return m.cons.map(c => (one ? '' : '• ') + 'Toma ' + num(c.dose) + ' pastilla' +
      (c.dose === 1 ? '' : 's') + ', ' + schedText(c.schedule) + ', a las ' + c.times.join(', ')).join('<br>');
  }

  function calUrl(title, buyMs, details) {
    let date = new Date(buyMs);
    if (buyMs <= Date.now() + 3600e3) {
      date = new Date();
      if (date.getHours() < 9) date.setHours(9, 0, 0, 0);
      else date = new Date(Date.now() + 15 * 60e3);
    } else date.setHours(9, 0, 0, 0);
    const end = new Date(date.getTime() + 30 * 60e3);
    const stamp = x => x.getFullYear() + String(x.getMonth() + 1).padStart(2, '0') +
      String(x.getDate()).padStart(2, '0') + 'T' + String(x.getHours()).padStart(2, '0') +
      String(x.getMinutes()).padStart(2, '0') + '00';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
      '&dates=' + stamp(date) + '/' + stamp(end) + '&details=' + encodeURIComponent(details);
  }

  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const pd = ds => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtD = ds => pd(ds).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

  window.AcompanaDomain = Object.freeze({ parseTimes, at, dayMatches, schedText, evs, calc, fmt, num, consText, calUrl, ymd, pd, fmtD, money, WD_SHORT });
})();
