// Small TTL cache: memory first, localStorage second (so reloads are instant
// and API rate limits are respected). Falls back to memory-only when storage
// is unavailable (private mode, blocked site data).

const PREFIX = 'daytrader.cache.';
const memory = new Map();

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function cacheGet(key) {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry) {
    try {
      const raw = storage()?.getItem(PREFIX + key);
      if (raw) entry = JSON.parse(raw);
    } catch {
      entry = null;
    }
  }
  if (!entry) return null;
  if (entry.expiresAt < now) {
    memory.delete(key);
    try {
      storage()?.removeItem(PREFIX + key);
    } catch {}
    return null;
  }
  memory.set(key, entry);
  return entry;
}

export function cacheSet(key, value, ttlMs) {
  const entry = { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs };
  memory.set(key, entry);
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded: drop persisted cache and keep going in memory.
    clearCache({ memoryToo: false });
  }
}

export function clearCache({ memoryToo = true } = {}) {
  if (memoryToo) memory.clear();
  const s = storage();
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) s.removeItem(k);
    }
  } catch {}
}
