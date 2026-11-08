// Daily price history for the watchlist via Twelve Data (free API key,
// browser-friendly). Results are cached for an hour to stay inside the free
// plan's 8 requests/minute and 800/day limits.

import { fetchData, FetchError } from '../core/fetcher.js';
import { cacheGet, cacheSet } from '../core/cache.js';
import { loadSettings } from '../core/settings.js';
import { recommend } from '../analysis/technicals.js';

const TTL = 60 * 60_000;

export async function loadDailyHistory(symbol, { force = false } = {}) {
  const key = `px:${symbol}`;
  if (!force) {
    const hit = cacheGet(key);
    if (hit) return hit.value;
  }
  const { twelveDataKey } = loadSettings();
  if (!twelveDataKey) throw new FetchError('Add a free Twelve Data API key in Settings to load prices.');
  const url =
    `https://api.twelvedata.com/time_series?interval=1day&outputsize=260&order=ASC` +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(twelveDataKey)}`;
  const { data } = await fetchData(url, { timeoutMs: 20_000 });
  if (data.status === 'error') throw new FetchError(`${symbol}: ${data.message || 'Twelve Data error'}`);
  const values = (data.values || []).map((v) => ({ date: v.datetime, close: +v.close, volume: +v.volume || 0 }));
  if (values.length && values[0].date > values[values.length - 1].date) values.reverse();
  const result = { symbol, name: data.meta?.symbol || symbol, exchange: data.meta?.exchange || '', currency: data.meta?.currency || 'USD', values };
  cacheSet(key, result, TTL);
  return result;
}

export async function analyzeSymbol(symbol, opts) {
  const hist = await loadDailyHistory(symbol, opts);
  const closes = hist.values.map((v) => v.close).filter((n) => Number.isFinite(n));
  return { ...hist, closes, signal: recommend(closes) };
}
