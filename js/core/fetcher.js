// Network helper: per-host rate limiting, timeouts and a TTL cache.
// Some free APIs (notably GDELT: 1 request / 5 s) reject bursts, so every
// request to the same host is queued and spaced out.

import { cacheGet, cacheSet } from './cache.js';

const HOST_MIN_INTERVAL_MS = {
  'api.gdeltproject.org': 5500,
  'api.twelvedata.com': 8000, // free plan: 8 requests / minute
  'services.nvd.nist.gov': 6500,
};

const hostQueues = new Map();

function schedule(host, task) {
  const gap = HOST_MIN_INTERVAL_MS[host] || 0;
  const prev = hostQueues.get(host) || Promise.resolve();
  const run = prev.then(task, task);
  // The next task for this host waits for this one to finish, then for `gap`.
  hostQueues.set(
    host,
    run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gap))),
  );
  return run;
}

export class FetchError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.url = url;
  }
}

/**
 * fetchData(url, { as: 'json' | 'text', ttlMs, timeoutMs, headers, force })
 * Returns { data, cached, fetchedAt }.
 */
export async function fetchData(url, opts = {}) {
  const { as = 'json', ttlMs = 0, timeoutMs = 20_000, headers, force = false } = opts;
  const cacheKey = `${as}:${url}`;
  if (!force && ttlMs > 0) {
    const hit = cacheGet(cacheKey);
    if (hit) return { data: hit.value, cached: true, fetchedAt: hit.storedAt };
  }
  const host = new URL(url).host;
  const data = await schedule(host, async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      if (!res.ok) throw new FetchError(`HTTP ${res.status} from ${host}`, { status: res.status, url });
      const text = await res.text();
      if (as === 'text') return text;
      try {
        return JSON.parse(text);
      } catch {
        // GDELT and others answer errors in plain text with HTTP 200.
        throw new FetchError(`${host}: ${text.slice(0, 160).trim() || 'invalid response'}`, { url });
      }
    } catch (err) {
      if (err.name === 'AbortError') throw new FetchError(`Timed out contacting ${host}`, { url });
      if (err instanceof FetchError) throw err;
      throw new FetchError(`Could not reach ${host} (network or CORS blocked)`, { url });
    } finally {
      clearTimeout(timer);
    }
  });
  if (ttlMs > 0) cacheSet(cacheKey, data, ttlMs);
  return { data, cached: false, fetchedAt: Date.now() };
}
