// Loads every source of a tab, caches the normalized results, de-duplicates
// and scores them.

import { ADAPTERS, describeSource } from './adapters.js';
import { cacheGet, cacheSet } from '../core/cache.js';
import { loadSettings } from '../core/settings.js';
import { scoreItems } from '../analysis/risk.js';

function sourceKey(src) {
  return 'src:' + JSON.stringify(src, (k, v) => (v instanceof RegExp ? v.source : v));
}

export async function loadSource(src, { force = false } = {}) {
  const key = sourceKey(src);
  if (!force) {
    const hit = cacheGet(key);
    if (hit) return { items: hit.value, fetchedAt: hit.storedAt, cached: true };
  }
  const adapter = ADAPTERS[src.type];
  if (!adapter) throw new Error(`Unknown source type "${src.type}"`);
  const items = await adapter(src);
  const ttl = Math.max(1, loadSettings().refreshMinutes) * 60_000;
  cacheSet(key, items, ttl);
  return { items, fetchedAt: Date.now(), cached: false };
}

export function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it.title || !it.url || !/^https?:\/\//i.test(it.url)) continue;
    const titleKey = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
    if (seen.has(it.url) || seen.has(titleKey)) continue;
    seen.add(it.url);
    seen.add(titleKey);
    out.push(it);
  }
  return out;
}

/**
 * Loads all sources for a tab. Sources resolve independently, and
 * `onProgress` is called as each one lands so the UI fills in progressively.
 */
export async function loadTab(tab, { force = false, onProgress } = {}) {
  const sources = tab.sources || [];
  const results = new Array(sources.length);
  const errors = [];
  let settled = 0;
  const emit = () => {
    const all = dedupe(results.filter(Boolean).flatMap((r) => r.items));
    const items = scoreItems(all, tab.lexicon).sort((a, b) => b.publishedAt - a.publishedAt);
    const fetchedAt = Math.min(...results.filter(Boolean).map((r) => r.fetchedAt), Date.now());
    return { items, errors: [...errors], fetchedAt, pending: sources.length - settled };
  };
  await Promise.all(
    sources.map(async (src, i) => {
      try {
        results[i] = await loadSource(src, { force });
      } catch (err) {
        errors.push({ source: describeSource(src), message: err.message });
      }
      settled++;
      onProgress?.(emit());
    }),
  );
  return emit();
}
