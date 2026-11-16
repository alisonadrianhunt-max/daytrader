// Reads the data files the pipeline publishes next to the app (data/*.json).
// Same-origin, so there are no API keys or CORS limits in the browser.

const memo = new Map();
const MEMO_MS = 2 * 60_000;
export const STALE_AFTER_MS = 2 * 60 * 60_000; // warn when data is older than 2 hours

export async function loadSnapshot(path, { force = false } = {}) {
  const hit = memo.get(path);
  if (!force && hit && Date.now() - hit.at < MEMO_MS) return hit.promise;
  const promise = fetch(`data/${path}`, { cache: force ? 'reload' : 'no-cache' }).then(async (res) => {
    if (!res.ok) throw new Error(`Data file data/${path} not available (HTTP ${res.status}). It is published by the data pipeline on GitHub.`);
    return res.json();
  });
  memo.set(path, { at: Date.now(), promise });
  promise.catch(() => memo.delete(path));
  return promise;
}

export const isStale = (iso) => !iso || Date.now() - Date.parse(iso) > STALE_AFTER_MS;
