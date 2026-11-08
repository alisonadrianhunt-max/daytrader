import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TABS, toGdeltQuery, customTabToDefinition } from '../js/tabs/registry.js';
import { ADAPTERS, parseGdeltDate, stripHtml } from '../js/sources/adapters.js';
import { parseWatchlist, slugify } from '../js/core/settings.js';

test('all required risk areas are present with unique ids', () => {
  const titles = BUILTIN_TABS.map((t) => t.title).join('|');
  for (const t of ['Military', 'Financial', 'NASDAQ', 'Political', 'Cyber', 'Weather', 'Social', 'Headlines', 'AI']) {
    assert.match(titles, new RegExp(t));
  }
  assert.equal(new Set(BUILTIN_TABS.map((t) => t.id)).size, BUILTIN_TABS.length);
});

test('every tab source has a registered adapter', () => {
  for (const tab of BUILTIN_TABS) for (const s of tab.sources || []) assert.ok(ADAPTERS[s.type], `${tab.id}: ${s.type}`);
});

test('custom tabs become feed tabs', () => {
  assert.equal(toGdeltQuery('oil, opec, crude prices'), '(oil OR opec OR "crude prices")');
  assert.equal(toGdeltQuery('lithium'), 'lithium');
  const def = customTabToDefinition({ id: 'custom-energy', title: 'Energy', keywords: 'oil, gas', subreddit: 'r/energy' });
  assert.deepEqual(def.sources.map((s) => s.type), ['gdelt', 'reddit']);
  assert.equal(def.sources[1].subreddit, 'energy');
});

test('helpers', () => {
  assert.equal(parseGdeltDate('20261108T063000Z'), Date.UTC(2026, 10, 8, 6, 30, 0));
  assert.equal(stripHtml('<p>Hello &amp; <b>world</b></p>'), 'Hello & world');
  assert.deepEqual(parseWatchlist('aapl, msft;;  BRK.B <script>'), ['AAPL', 'MSFT', 'BRK.B']);
  assert.equal(slugify('Energy & Oil!'), 'custom-energy-oil');
});
