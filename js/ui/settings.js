// Settings view: API keys, refresh interval, theme, tab visibility and custom tabs.

import { esc, $, $$ } from './dom.js';
import { loadSettings, saveSettings, loadCustomTabs, saveCustomTabs, slugify } from '../core/settings.js';
import { clearCache } from '../core/cache.js';
import { BUILTIN_TABS } from '../tabs/registry.js';

export function renderSettings(root, _tab, { tabs }) {
  const draw = (flash = '') => {
    const s = loadSettings();
    const custom = loadCustomTabs();
    root.innerHTML = `
      <header class="tab-header"><div class="tab-title"><h1>⚙️ Settings</h1><p class="muted">Everything is stored only in this browser.</p></div></header>
      ${flash ? `<div class="notice ok" role="status">${esc(flash)}</div>` : ''}
      <form class="card form settings-form">
        <h2>Data & AI keys</h2>
        <label>Twelve Data API key <span class="muted small">(free — enables stock prices & Buy/Hold/Sell signals) · <a href="https://twelvedata.com/pricing" target="_blank" rel="noopener noreferrer">get one</a></span>
          <input name="twelveDataKey" type="password" autocomplete="off" value="${esc(s.twelveDataKey)}"></label>
        <label>Anthropic API key <span class="muted small">(optional — enables 🧠 AI briefings) · <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">get one</a></span>
          <input name="anthropicKey" type="password" autocomplete="off" value="${esc(s.anthropicKey)}"></label>
        <label>AI model <input name="aiModel" value="${esc(s.aiModel)}"></label>
        <label>CORS proxy for RSS feeds <span class="muted small">(optional; e.g. <code>https://your-proxy.example/?url=</code> or a URL containing <code>{url}</code>)</span>
          <input name="corsProxy" value="${esc(s.corsProxy)}" placeholder="leave empty to skip blocked RSS feeds"></label>
        <h2>Display</h2>
        <label>Theme <select name="theme">${['auto', 'light', 'dark'].map((t) => `<option ${s.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Refresh data every (minutes) <input name="refreshMinutes" type="number" min="5" max="240" value="${s.refreshMinutes}"></label>
        <fieldset><legend>Visible tabs</legend>
          ${tabs
            .filter((t) => t.id !== 'overview')
            .map((t) => `<label class="check"><input type="checkbox" name="visible" value="${esc(t.id)}" ${s.hiddenTabs.includes(t.id) ? '' : 'checked'}> ${esc(t.icon)} ${esc(t.title)}</label>`)
            .join('')}
        </fieldset>
        <div class="row"><button class="btn primary" type="submit">Save settings</button> <button class="btn clear-cache" type="button">Clear cached data</button></div>
      </form>

      <section class="card form">
        <h2>Custom tabs</h2>
        <p class="muted small">Track any risk topic. Keywords are searched across global news; you can add a Hacker News search, a subreddit and RSS feeds too.</p>
        <ul class="custom-list">${
          custom.map((c) => `<li><span>${esc(c.icon || '⭐')} <b>${esc(c.title)}</b> <span class="muted small">${esc(c.keywords || '')}</span></span><button class="btn small danger" data-remove="${esc(c.id)}">Remove</button></li>`).join('') ||
          '<li class="muted small">No custom tabs yet.</li>'
        }</ul>
        <form class="custom-form">
          <div class="grid2">
            <label>Tab name <input name="title" required maxlength="40" placeholder="e.g. Energy & Oil"></label>
            <label>Icon <input name="icon" maxlength="4" placeholder="🛢️"></label>
          </div>
          <label>News keywords (comma separated) <input name="keywords" placeholder="oil, OPEC, crude prices, pipeline"></label>
          <div class="grid2">
            <label>Hacker News search <input name="hnQuery" placeholder="optional"></label>
            <label>Subreddit <input name="subreddit" placeholder="optional, e.g. energy"></label>
          </div>
          <label>RSS feed URLs (space separated) <input name="rss" placeholder="optional"></label>
          <button class="btn primary" type="submit">Add tab</button>
        </form>
      </section>
      <p class="muted small">Day Trader · data from GDELT, USGS, NOAA/NWS, NASA EONET, CISA, NIST NVD, Reddit, Mastodon, Hacker News and Twelve Data. Risk scores are automated estimates.</p>
    `;

    $('.settings-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const visible = new Set(f.getAll('visible'));
      saveSettings({
        twelveDataKey: String(f.get('twelveDataKey')).trim(),
        anthropicKey: String(f.get('anthropicKey')).trim(),
        aiModel: String(f.get('aiModel')).trim() || 'claude-opus-5-5',
        corsProxy: String(f.get('corsProxy')).trim(),
        theme: f.get('theme'),
        refreshMinutes: Math.max(5, Math.min(240, +f.get('refreshMinutes') || 15)),
        hiddenTabs: tabs.filter((t) => t.id !== 'overview' && !visible.has(t.id)).map((t) => t.id),
      });
      draw('Settings saved.');
    });
    $('.clear-cache', root).addEventListener('click', () => {
      clearCache();
      draw('Cached data cleared — tabs will reload fresh data.');
    });
    $('.custom-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.keywords?.trim() && !f.hnQuery?.trim() && !f.subreddit?.trim() && !f.rss?.trim()) {
        draw('Add at least one keyword or source for the new tab.');
        return;
      }
      let id = slugify(f.title);
      const taken = new Set([...BUILTIN_TABS.map((t) => t.id), ...custom.map((c) => c.id)]);
      for (let n = 2; taken.has(id); n++) id = `${slugify(f.title)}-${n}`;
      saveCustomTabs([...custom, { ...f, id, title: f.title.trim() }]);
      location.hash = `#/${id}`;
    });
    $$('[data-remove]', root).forEach((b) =>
      b.addEventListener('click', () => {
        saveCustomTabs(custom.filter((c) => c.id !== b.dataset.remove));
        draw('Custom tab removed.');
      }),
    );
  };
  return draw;
}
