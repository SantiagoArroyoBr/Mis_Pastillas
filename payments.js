// Cálculos de cobertura y pendientes de pago. Recibe dependencias del coordinador.
(() => {
  function create({ getState, config, entries, calc, ymd }) {
    // Importe nuevo: valida decimal en texto y lo convierte a centavos sin usar
    // aritmética binaria para sumar dinero.
    function toCents(value) {
      const text = String(value ?? '').trim();
      if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
      const [whole, fraction = ''] = text.split('.');
      const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
      return Number.isSafeInteger(cents) ? cents : null;
    }

    function ledgerSummary(services, movements, nurseId) {
      const nurseServices = services.filter(s => s && s.nurseId === nurseId && Number.isSafeInteger(s.amountCents) && s.amountCents >= 0);
      const ids = new Set(nurseServices.map(s => s.id));
      const paidByService = new Map(nurseServices.map(s => [s.id, 0]));
      let paid = 0;
      movements.filter(m => m && m.nurseId === nurseId).forEach(m => {
        if (!Number.isSafeInteger(m.amountCents) || m.amountCents < 0 || !Array.isArray(m.allocations)) return;
        m.allocations.forEach(a => {
          if (!ids.has(a.serviceId) || !Number.isSafeInteger(a.amountCents) || a.amountCents < 0) return;
          const servicePaid = paidByService.get(a.serviceId) + a.amountCents;
          const nextPaid = paid + a.amountCents;
          if (!Number.isSafeInteger(servicePaid) || !Number.isSafeInteger(nextPaid)) throw new Error('El total de abonos excede la precisión monetaria segura.');
          paidByService.set(a.serviceId, servicePaid);
          paid = nextPaid;
        });
      });
      const cost = nurseServices.reduce((sum, s) => {
        const next = sum + s.amountCents;
        if (!Number.isSafeInteger(next)) throw new Error('El total de costos excede la precisión monetaria segura.');
        return next;
      }, 0);
      return { services: nurseServices, costCents: cost, paidCents: paid,
        balanceCents: cost - paid, paidByService };
    }

    // Política PAG-001: aplicar cada abono FIFO a los servicios pendientes del
    // mismo enfermero en ese momento; un excedente se rechaza, no se convierte
    // en anticipo. Las asignaciones quedan guardadas en el movimiento.
    function allocatePayment(services, movements, nurseId, amountCents, paymentDate = '') {
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null;
      const summary = ledgerSummary(services, movements, nurseId);
      if (amountCents > summary.balanceCents) return null;
      let remaining = amountCents;
      const allocations = [];
      summary.services.filter(s => !paymentDate || String(s.date) <= paymentDate).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id))).forEach(service => {
        if (!remaining) return;
        const due = service.amountCents - summary.paidByService.get(service.id);
        if (due <= 0) return;
        const amount = Math.min(due, remaining);
        allocations.push({ serviceId: service.id, amountCents: amount });
        remaining -= amount;
      });
      return remaining ? null : allocations;
    }

    function generalSummary(services, movements) {
      const costCents = services.reduce((sum, service) => {
        const amount = service && service.amountCents;
        if (!Number.isSafeInteger(amount) || amount < 0) return sum;
        const next = sum + amount;
        if (!Number.isSafeInteger(next)) throw new Error('El total de costos excede la precisión monetaria segura.');
        return next;
      }, 0);
      const cancelledIds = new Set(movements.filter(m => m && m.type === 'cancellation').map(m => m.originalId));
      const receipts = movements.filter(m => m && m.type === 'receipt');
      const receivedCents = receipts.reduce((sum, receipt) => {
        if (cancelledIds.has(receipt.id)) return sum;
        const next = sum + receipt.amountCents;
        if (!Number.isSafeInteger(next)) throw new Error('El total de abonos excede la precisión monetaria segura.');
        return next;
      }, 0);
      return { costCents, receivedCents, balanceCents: costCents - receivedCents,
        cancelledIds, receipts: receipts.map(receipt => ({...receipt,cancelled:cancelledIds.has(receipt.id)})) };
    }
    function cover(i) {
      const state = getState(), cfg = config(i);
      const total = cfg.pays.filter(x => !x.old).reduce((sum, x) => sum + x.n, 0);
      const out = { has: false, total, dates: [], covered: new Set(), unpaid: [], unused: 0,
        remaining: 0, unpaidDue: [], owed: 0, future: 0, st: 'gray', msg: '', lastCovered: '' };
      if (!window.AcompanaCompatibility.isValidDateOnly(cfg.base)) return out;
      const today = ymd(new Date());
      const dates = Object.keys(state.pay.v).filter(k => window.AcompanaCompatibility.isValidDateOnly(k) && k >= cfg.base && entries(k, i).length).sort();
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
      const coverage = cover(i), byNurse = new Map();
      coverage.unpaidDue.forEach(day => entries(day, i).forEach(entry => {
        let row = byNurse.get(entry.n);
        if (!row) { row = { n: entry.n, c: 0 }; byNurse.set(entry.n, row); }
        row.c++;
      }));
      return { rows: [...byNurse.values()].sort((a, b) => a.n.localeCompare(b.n, 'es')) };
    }

    function lastPay(i) {
      const cfg = config(i), coverage = cover(i), active = cfg.pays.filter(x => !x.old);
      if (!coverage.has || !active.length) return null;
      const count = active[active.length - 1].n;
      const days = coverage.dates.slice(Math.max(0, coverage.total - count), coverage.total);
      const byNurse = new Map();
      const services = days.reduce((sum, day) => sum + entries(day, i).length, 0);
      // Estimación por fecha única; no atribuye dinero a personas ni reconstruye pagos.
      const total = cfg.rate == null ? null : days.length * cfg.rate;
      days.forEach(day => entries(day, i).forEach(entry => {
        let row = byNurse.get(entry.n);
        if (!row) { row = { n: entry.n, c: 0 }; byNurse.set(entry.n, row); }
        row.c++;
      }));
      return { n: count, rows: [...byNurse.values()].sort((a, b) => a.n.localeCompare(b.n, 'es')), total, days: days.length, services };
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

    return Object.freeze({ cover, oweSummary, lastPay, pillEvents, due, toCents, ledgerSummary, allocatePayment, generalSummary });
  }
  window.AcompanaPayments = Object.freeze({ create });
})();
