// Cálculos de cobertura y pendientes de pago. Recibe dependencias del coordinador.
(() => {
  function create({ getState, config, entries, calc, ymd }) {
    function cover(i) {
      const state = getState(), cfg = config(i);
      const total = cfg.pays.filter(x => !x.old).reduce((sum, x) => sum + x.n, 0);
      const out = { has: false, total, dates: [], covered: new Set(), unpaid: [], unused: 0,
        remaining: 0, unpaidDue: [], owed: 0, future: 0, st: 'gray', msg: '', lastCovered: '' };
      if (!cfg.base) return out;
      const today = ymd(new Date());
      const dates = Object.keys(state.pay.v).filter(k => k >= cfg.base && entries(k, i).length).sort();
      const covered = dates.slice(0, total), unpaid = dates.slice(total);
      const unused = Math.max(0, total - dates.length);
      const unpaidDue = unpaid.filter(k => k <= today), owed = unpaidDue.length;
      const future = unpaid.length - owed;
      const remaining = covered.filter(k => k >= today).length + unused;
      const status = owed ? 'red' : 'green';
      const msg = owed ? 'se deben ' + owed + ' día' + (owed > 1 ? 's' : '') : 'al corriente';
      return { has: true, total, dates, covered: new Set(covered), unpaid, unused, remaining,
        unpaidDue, owed, future, st: status, msg,
        lastCovered: (unused === 0 && covered.length) ? covered[covered.length - 1] : '' };
    }

    function oweSummary(i) {
      const cfg = config(i), coverage = cover(i), byNurse = new Map();
      coverage.unpaidDue.forEach(day => entries(day, i).forEach(entry => {
        let row = byNurse.get(entry.n);
        if (!row) { row = { n: entry.n, c: 0, amt: 0 }; byNurse.set(entry.n, row); }
        row.c++;
        if (cfg.rate != null) row.amt += cfg.rate;
      }));
      return { rows: [...byNurse.values()].sort((a, b) => a.n.localeCompare(b.n, 'es')) };
    }

    function lastPay(i) {
      const cfg = config(i), coverage = cover(i), active = cfg.pays.filter(x => !x.old);
      if (!coverage.has || !active.length) return null;
      const count = active[active.length - 1].n;
      const days = coverage.dates.slice(Math.max(0, coverage.total - count), coverage.total);
      const byNurse = new Map(); let total = 0;
      days.forEach(day => entries(day, i).forEach(entry => {
        let row = byNurse.get(entry.n);
        if (!row) { row = { n: entry.n, c: 0, amt: 0 }; byNurse.set(entry.n, row); }
        row.c++;
        if (cfg.rate != null) { row.amt += cfg.rate; total += cfg.rate; }
      }));
      return { n: count, rows: [...byNurse.values()].sort((a, b) => a.n.localeCompare(b.n, 'es')), total, days: days.length };
    }

    function pillEvents(i) {
      const state = getState(), map = {};
      const add = (day, kind, name) => (map[day] = map[day] || { buy: [], end: [] })[kind].push(name);
      const patient = state.p[i];
      if (!patient) return map;
      const today = ymd(new Date());
      patient.meds.forEach(med => {
        const result = calc(med);
        if (!result.end) { add(today, 'buy', med.name); add(today, 'end', med.name); return; }
        add(ymd(new Date(result.buy)), 'buy', med.name);
        add(ymd(new Date(result.end)), 'end', med.name);
      });
      return map;
    }

    function due() {
      const state = getState(), out = [];
      state.p.forEach((patient, i) => {
        const cfg = config(i);
        if (!cfg.who) return;
        const coverage = cover(i);
        if (coverage.st === 'red' || coverage.st === 'amber') out.push({ p: patient, i, c: cfg, cv: coverage });
      });
      return out;
    }

    return Object.freeze({ cover, oweSummary, lastPay, pillEvents, due });
  }
  window.AcompanaPayments = Object.freeze({ create });
})();
