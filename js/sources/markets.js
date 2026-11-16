// Price history for signals. Primary source: data/prices.json, published by
// the pipeline every 30 minutes (Yahoo Finance with Stooq fallback, no key).
// Symbols outside that list can optionally use a personal Twelve Data key.

import { fetchData, FetchError } from '../core/fetcher.js';
import { cacheGet, cacheSet } from '../core/cache.js';
import { loadSettings } from '../core/settings.js';
import { loadSnapshot } from '../core/snapshot.js';
import { recommend } from '../analysis/technicals.js';

const TTL = 60 * 60_000;

export async function loadPriceSnapshot(opts) {
  return loadSnapshot('prices.json', opts);
}

/** Normalizes user input to the symbol style used in prices.json (Yahoo style). */
export const toDataSymbol = (s) => s.toUpperCase().replace(/^([A-Z]+)\.([A-Z])$/, '$1-$2');

async function fromSnapshot(symbol, opts) {
  try {
    const snap = await loadPriceSnapshot(opts);
    const p = snap.prices?.[toDataSymbol(symbol)];
    if (!p) return null;
    return {
      symbol,
      name: p.name,
      unit: p.unit,
      exchange: p.exchange,
      currency: p.currency,
      source: p.source,
      invert: !!p.invert,
      lastDate: p.lastDate,
      values: p.closes.map((close) => ({ close })),
    };
  } catch {
    return null;
  }
}

async function fromTwelveData(symbol, { force = false } = {}) {
  const key = `px:${symbol}`;
  if (!force) {
    const hit = cacheGet(key);
    if (hit) return hit.value;
  }
  const { twelveDataKey } = loadSettings();
  if (!twelveDataKey) {
    throw new FetchError(`${symbol} isn't in the built-in price list. Add a free Twelve Data key in Settings to track any symbol.`);
  }
  const url =
    `https://api.twelvedata.com/time_series?interval=1day&outputsize=260&order=ASC` +
    `&symbol=${encodeURIComponent(symbol.replace('-', '.'))}&apikey=${encodeURIComponent(twelveDataKey)}`;
  const { data } = await fetchData(url, { timeoutMs: 20_000 });
  if (data.status === 'error') throw new FetchError(`${symbol}: ${data.message || 'Twelve Data error'}`);
  const values = (data.values || []).map((v) => ({ date: v.datetime, close: +v.close }));
  if (values.length && values[0].date > values[values.length - 1].date) values.reverse();
  const result = { symbol, name: symbol, exchange: data.meta?.exchange || '', currency: data.meta?.currency || 'USD', source: 'Twelve Data', values };
  cacheSet(key, result, TTL);
  return result;
}

export async function loadDailyHistory(symbol, opts = {}) {
  return (await fromSnapshot(symbol, opts)) || fromTwelveData(symbol, opts);
}

export async function analyzeSymbol(symbol, opts) {
  const hist = await loadDailyHistory(symbol, opts);
  const closes = hist.values.map((v) => v.close).filter((n) => Number.isFinite(n));
  return { ...hist, closes, signal: recommend(closes) };
}
