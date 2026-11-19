const prefix = 'acompana-offline-v1:';
const allowedTables = new Set(['families', 'family_members', 'patients', 'nurses', 'shifts', 'receipts',
  'receipt_cancellations', 'individual_payments', 'individual_allocations', 'appointment_details',
  'appointments', 'inventory_items', 'inventory_profiles', 'inventory_purchases', 'inventory_quotes']);

export function cacheableSelect(path) {
  const match = /^\/rest\/v1\/([a-z_]+)\?/.exec(path);
  return Boolean(match && allowedTables.has(match[1]));
}

export function createOfflineCache(api, { storage, now = Date.now, maxEntries = 120, maxBytes = 2 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Límite de caché inválido.');
  try { storage ??= globalThis.localStorage; } catch {}
  const key = prefix + api;
  function read() {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return undefined;
      if (new TextEncoder().encode(raw).byteLength > maxBytes) { storage.removeItem(key); return undefined; }
      const value = JSON.parse(raw);
      const valid = value?.version === 1 && value.api === api && typeof value.userId === 'string'
        && Array.isArray(value.entries) && value.entries.length <= maxEntries
        && value.entries.every(entry=>entry && cacheableSelect(entry.path) && Number.isFinite(entry.at) && Array.isArray(entry.data));
      if (!valid) { storage.removeItem(key); return undefined; }
      return value;
    } catch { return undefined; }
  }
  return {
    clear() { try { storage?.removeItem(key); } catch {} },
    retainUser(userId) { const current = read(); if (current && current.userId !== userId) this.clear(); },
    get(userId, path) {
      if (!cacheableSelect(path)) return undefined;
      const current = read();
      if (!current || current.userId !== userId) return undefined;
      const entry = current.entries.find(item => item.path === path && Number.isFinite(item.at));
      return entry ? { data: structuredClone(entry.data), at: entry.at } : undefined;
    },
    set(userId, path, data) {
      if (!cacheableSelect(path) || !Array.isArray(data)) return false;
      const current = read();
      const entries = current?.userId === userId ? current.entries.filter(item => item.path !== path) : [];
      entries.push({ path, data, at: now() });
      while (entries.length > maxEntries) entries.shift();
      const value = { version: 1, api, userId, entries };
      let text = JSON.stringify(value);
      while (new TextEncoder().encode(text).byteLength > maxBytes && entries.length > 1) { entries.shift(); text = JSON.stringify(value); }
      if (new TextEncoder().encode(text).byteLength > maxBytes || !storage) return false;
      try { storage.setItem(key, text); return true; } catch { return false; }
    },
    lastSync(userId) {
      const current = read();
      return current?.userId === userId ? Math.max(0, ...current.entries.map(item => Number(item.at) || 0)) || undefined : undefined;
    }
  };
}
