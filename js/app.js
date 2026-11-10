// Day Trader — app shell: tab bar, hash router, data refresh loop.

import { getTabs } from './tabs/registry.js';
import { loadSettings } from './core/settings.js';
import { loadTab } from './sources/index.js';
import { store } from './core/store.js';
import { esc, $ } from './ui/dom.js';
import { renderFeed } from './ui/feed.js';
import { renderMarkets } from './ui/markets.js';
import { renderCommodities } from './ui/commodities.js';
import { renderOverview } from './ui/overview.js';
import { renderSettings } from './ui/settings.js';

// View registry: a tab's `view` picks its renderer. Add new view types here.
const VIEWS = { feed: renderFeed, markets: renderMarkets, commodities: renderCommodities, overview: renderOverview, settings: renderSettings };
const SETTINGS_TAB = { id: 'settings', title: 'Settings', icon: '⚙️', view: 'settings' };

const main = $('#main');
const nav = $('#tabs');
let current = { id: null, draw: null };
let scanning = false;
const loading = new Map();

function allTabs() {
  return getTabs();
}
function visibleTabs() {
  const hidden = new Set(loadSettings().hiddenTabs);
  return allTabs().filter((t) => !hidden.has(t.id));
}

function applyTheme() {
  const { theme } = loadSettings();
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

function renderNav(activeId) {
  nav.innerHTML = [...visibleTabs(), SETTINGS_TAB]
    .map(
      (t) =>
        `<a href="#/${esc(t.id)}" class="tab ${t.id === activeId ? 'active' : ''}" ${t.id === activeId ? 'aria-current="page"' : ''}>
          <span class="tab-icon" aria-hidden="true">${esc(t.icon)}</span><span class="tab-label">${esc(t.title)}</span></a>`,
    )
    .join('');
  nav.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/** Loads a tab's sources (deduplicated across concurrent callers) and redraws when it's on screen. */
function refreshTab(tab, force = false) {
  if (!tab.sources?.length) return Promise.resolve();
  if (loading.has(tab.id) && !force) return loading.get(tab.id);
  const p = loadTab(tab, {
    force,
    onProgress: (data) => {
      store.tabData.set(tab.id, data);
      if (current.id === tab.id || current.id === 'overview') current.draw?.();
    },
  }).finally(() => loading.delete(tab.id));
  loading.set(tab.id, p);
  return p;
}

async function scanAll() {
  if (scanning) return;
  scanning = true;
  current.draw?.();
  try {
    // Sequential so the per-host rate limits interleave nicely and cached tabs finish instantly.
    for (const t of allTabs()) if (t.sources?.length) await refreshTab(t);
  } finally {
    scanning = false;
    current.draw?.();
  }
}

function route() {
  applyTheme();
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'overview';
  const tab = id === 'settings' ? SETTINGS_TAB : allTabs().find((t) => t.id === id);
  if (!tab) {
    location.replace('#/overview');
    return;
  }
  renderNav(tab.id);
  document.title = `${tab.title} · Day Trader`;
  const view = VIEWS[tab.view || 'feed'] || renderFeed;
  // Fresh container per visit: late async redraws from a previous view land in a detached node.
  const container = document.createElement('div');
  main.replaceChildren(container);
  const draw = view(container, tab, {
    tabs: allTabs(),
    refresh: (force) => refreshTab(tab, force),
    scanAll,
    isScanning: () => scanning,
  });
  current = { id: tab.id, draw };
  draw();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  refreshTab(tab);
}

window.addEventListener('hashchange', route);
window.addEventListener('tabs-changed', () => renderNav(current.id));
window.addEventListener('settings-changed', () => {
  applyTheme();
  renderNav(current.id);
});

// Auto-refresh the visible tab on the user's interval while the app is open.
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  const tab = allTabs().find((t) => t.id === current.id);
  if (tab) refreshTab(tab);
}, 60_000);

// Offline support / installable app.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

window.addEventListener('online', () => $('#offline')?.setAttribute('hidden', ''));
window.addEventListener('offline', () => $('#offline')?.removeAttribute('hidden'));
if (!navigator.onLine) $('#offline')?.removeAttribute('hidden');

route();
