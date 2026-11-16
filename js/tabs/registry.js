// Tab registry — the single place that defines what Day Trader shows.
//
// To add a new built-in tab, append an object to BUILTIN_TABS (see
// docs/ADDING_TABS.md). Users can also create their own tabs at runtime from
// Settings → Custom tabs; those are stored in the browser and merged in here.
//
// Tab definition:
//   id          unique, url-safe string (used in the #/route)
//   title       label shown in the tab bar
//   icon        emoji / short glyph
//   description one-line explanation shown under the tab heading
//   view        'feed' (default) | 'markets' | 'commodities' | 'overview'
//   snapshot    true = data comes from the pipeline (pipeline/sources.mjs lists the sources)
//   sources     custom tabs only: live browser sources { type, ...options } — see js/sources/adapters.js
//   priceGroups key into data/prices.json groups (prices + Buy/Hold/Sell signals)
//   lexicon     optional extra { word: weight } risk keywords for this tab
//   aiFocus     optional instruction appended to the AI analyst prompt

import { loadCustomTabs } from '../core/settings.js';

export const BUILTIN_TABS = [
  {
    id: 'overview',
    title: 'Overview',
    icon: '🌐',
    view: 'overview',
    description: 'Global risk dashboard — every area scored on one screen.',
  },
  {
    id: 'military',
    title: 'Military Conflict',
    icon: '⚔️',
    snapshot: true,
    description: 'Armed conflict, strikes, troop movements and ceasefires — defence press, UN, Crisis Group and outlets on every continent.',
    lexicon: { nuclear: 30, invasion: 25, mobilization: 20, casualties: 15, offensive: 12 },
    aiFocus: 'Focus on escalation risk, regions most at risk, and likely market spill-overs (energy, defence, safe havens).',
  },
  {
    id: 'finance',
    title: 'World Financial System',
    icon: '🏦',
    snapshot: true,
    priceGroups: 'finance',
    description: 'Central banks (Fed, ECB, Bank of England, RBA, BIS), Treasury yields, currencies, market stress and financial news worldwide.',
    lexicon: { default: 25, contagion: 25, 'bank run': 30, downgrade: 15, recession: 15, liquidity: 10 },
    aiFocus: 'Focus on systemic risk: rates, credit, liquidity, FX, and what it means for equity investors.',
  },
  {
    id: 'markets',
    title: 'Stocks & NASDAQ',
    icon: '📈',
    view: 'markets',
    snapshot: true,
    priceGroups: 'markets',
    description: 'Buy / Hold / Sell signals for your watchlist, major NYSE & NASDAQ stocks and stock indices on every continent.',
    aiFocus: 'Comment on each signal, flag news that contradicts the technicals, and remind the reader this is not financial advice.',
  },
  {
    id: 'commodities',
    title: 'Commodities',
    icon: '🪙',
    view: 'commodities',
    snapshot: true,
    priceGroups: 'commodities',
    description: 'Gold, silver and other metals, energy, grains, softs and livestock — grouped by type with Buy / Hold / Sell signals.',
    lexicon: { embargo: 20, 'supply disruption': 20, shortage: 15, 'export ban': 20, 'production cut': 12, drought: 12 },
    aiFocus:
      'Comment on each commodity group: supply/demand drivers in the news, whether the news supports or contradicts the technical signal, and safe-haven flows into gold and silver. Not financial advice.',
  },
  {
    id: 'politics',
    title: 'Political News',
    icon: '🏛️',
    snapshot: true,
    description: 'Elections, governments, sanctions and diplomacy from the Americas, Europe, Africa, the Middle East and Asia-Pacific.',
    lexicon: { coup: 30, impeachment: 15, unrest: 15, martial: 25, protest: 8 },
    aiFocus: 'Focus on political instability, policy changes with economic impact, and geopolitical alignment shifts.',
  },
  {
    id: 'cyber',
    title: 'Cybersecurity Threats',
    icon: '🛡️',
    snapshot: true,
    description: 'Actively exploited vulnerabilities, critical CVEs and national cyber agency alerts (US, UK, EU, Australia), plus security news.',
    lexicon: { 'zero-day': 25, 'actively exploited': 30, ransomware: 20, 'critical infrastructure': 25, breach: 12 },
    aiFocus: 'Focus on what is being actively exploited, which sectors are targeted, and recommended defensive actions.',
  },
  {
    id: 'weather',
    title: 'Weather & Hazards',
    icon: '🌪️',
    snapshot: true,
    description: 'Global disaster alerts (GDACS), earthquakes (USGS, EMSC), cyclones, tsunamis, volcanoes, wildfires and severe weather.',
    lexicon: { 'category 5': 30, 'category 4': 25, evacuation: 20, tsunami: 30, 'state of emergency': 20, 'red alert': 30, 'orange alert': 18 },
    aiFocus: 'Focus on human impact, supply chain / commodity disruption, and insurance exposure.',
  },
  {
    id: 'social',
    title: 'Social Media Commentary',
    icon: '💬',
    snapshot: true,
    description: 'What people are discussing now on Mastodon, Lemmy, Bluesky, Reddit and Hacker News.',
    aiFocus: 'Focus on the dominant narratives and sentiment, and separate rumours from confirmed reports.',
  },
  {
    id: 'headlines',
    title: 'Mainstream Headlines',
    icon: '📰',
    snapshot: true,
    description: 'Top stories from major news organisations across every continent.',
    aiFocus: 'Summarise the day’s top stories and rank them by global risk impact.',
  },
  {
    id: 'ai',
    title: 'AI Daily News',
    icon: '🤖',
    snapshot: true,
    description: 'AI research, products, policy and industry news from labs, tech press and arXiv.',
    lexicon: { regulation: 10, ban: 12, lawsuit: 10, outage: 10, deepfake: 12 },
    aiFocus: 'Focus on AI developments with business, regulatory or security impact.',
  },
];

/** Converts a user-created custom tab (from Settings) into a full tab definition. */
export function customTabToDefinition(c) {
  const sources = [];
  if (c.keywords?.trim()) sources.push({ type: 'gdelt', query: toGdeltQuery(c.keywords) });
  if (c.hnQuery?.trim()) sources.push({ type: 'hn', query: c.hnQuery.trim(), days: 3 });
  for (const url of (c.rss || '').split(/\s+/).filter(Boolean)) sources.push({ type: 'rss', url });
  return {
    id: c.id,
    title: c.title,
    icon: c.icon || '⭐',
    description: c.description || `Custom tab: ${c.keywords || c.hnQuery || ''}`,
    custom: true,
    sources,
  };
}

/** "oil, opec, crude prices" -> '(oil OR opec OR "crude prices")' */
export function toGdeltQuery(keywords) {
  const parts = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (/\s/.test(k) ? `"${k.replace(/"/g, '')}"` : k));
  if (parts.length === 0) return '';
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
}

export function getTabs() {
  return [...BUILTIN_TABS, ...loadCustomTabs().map(customTabToDefinition)];
}
