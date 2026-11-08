// User settings, persisted in this browser only (localStorage).
// API keys never leave the device except in requests to the provider they belong to.

const KEY = 'daytrader.settings.v1';
const CUSTOM_TABS_KEY = 'daytrader.customTabs.v1';

export const DEFAULT_SETTINGS = {
  theme: 'auto', // 'auto' | 'light' | 'dark'
  refreshMinutes: 15,
  watchlist: 'SPY, QQQ, DIA, AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA',
  twelveDataKey: '',
  anthropicKey: '',
  aiModel: 'claude-opus-5-5',
  corsProxy: '', // e.g. https://my-proxy.example.com/?url=  (used for RSS feeds only)
  hiddenTabs: [],
};

function safeGet(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(safeGet(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  safeSet(KEY, JSON.stringify(next));
  globalThis.dispatchEvent?.(new CustomEvent('settings-changed', { detail: next }));
  return next;
}

export function parseWatchlist(text) {
  return [...new Set(String(text).toUpperCase().split(/[\s,;]+/).filter((s) => /^[A-Z0-9.\-^=/]{1,12}$/.test(s)))];
}

export function loadCustomTabs() {
  try {
    const list = JSON.parse(safeGet(CUSTOM_TABS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveCustomTabs(list) {
  safeSet(CUSTOM_TABS_KEY, JSON.stringify(list));
  globalThis.dispatchEvent?.(new CustomEvent('tabs-changed'));
}

export function slugify(text) {
  return (
    'custom-' +
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
  );
}
