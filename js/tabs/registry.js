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
//   view        'feed' (default) | 'markets' | 'overview'
//   sources     array of { type, ...options } — see js/sources/index.js
//   lexicon     optional extra { word: weight } risk keywords for this tab
//   aiFocus     optional instruction appended to the AI analyst prompt

import { loadCustomTabs } from '../core/settings.js';

export const BUILTIN_TABS = [
  {
    id: 'overview',
    title: 'Overview',
    icon: '🌐',
    view: 'overview',
    description: 'Global risk dashboard — every tab scored on one screen.',
  },
  {
    id: 'military',
    title: 'Military Conflict',
    icon: '⚔️',
    description: 'Armed conflict, strikes, troop movements and ceasefire news worldwide.',
    sources: [
      {
        type: 'gdelt',
        query:
          '(airstrike OR missile OR troops OR "military" OR invasion OR "drone strike" OR ceasefire OR shelling OR insurgents OR "armed forces")',
      },
      { type: 'reddit', subreddit: 'worldnews', filter: /(war|strike|missile|troop|military|attack|army|navy|drone)/i },
    ],
    lexicon: { nuclear: 30, invasion: 25, mobilization: 20, casualties: 15, offensive: 12 },
    aiFocus: 'Focus on escalation risk, regions most at risk, and likely market spill-overs (energy, defence, safe havens).',
  },
  {
    id: 'finance',
    title: 'World Financial System',
    icon: '🏦',
    description: 'Central banks, sovereign debt, banking stress, currencies and inflation.',
    sources: [
      {
        type: 'gdelt',
        query:
          '("central bank" OR "federal reserve" OR ECB OR IMF OR "bond yields" OR "interest rates" OR inflation OR "banking crisis" OR "debt ceiling" OR recession OR currency)',
      },
      { type: 'hn', query: 'federal reserve OR inflation OR recession OR bank', days: 3 },
    ],
    lexicon: { default: 25, contagion: 25, 'bank run': 30, downgrade: 15, recession: 15, liquidity: 10 },
    aiFocus: 'Focus on systemic risk: rates, credit, liquidity, FX, and what it means for equity investors.',
  },
  {
    id: 'markets',
    title: 'Stocks & NASDAQ',
    icon: '📈',
    view: 'markets',
    description: 'Buy / Hold / Sell signals from technical analysis of your watchlist (NYSE & NASDAQ).',
    sources: [
      {
        type: 'gdelt',
        query: '("stock market" OR NASDAQ OR "Dow Jones" OR "S&P 500" OR earnings OR "Wall Street")',
        max: 30,
      },
    ],
    aiFocus: 'Comment on each signal, flag news that contradicts the technicals, and remind the reader this is not financial advice.',
  },
  {
    id: 'politics',
    title: 'Political News',
    icon: '🏛️',
    description: 'Elections, governments, sanctions, diplomacy and policy shifts.',
    sources: [
      {
        type: 'gdelt',
        query:
          '(election OR parliament OR sanctions OR "prime minister" OR president OR congress OR senate OR coup OR referendum OR diplomacy)',
      },
      { type: 'reddit', subreddit: 'geopolitics' },
    ],
    lexicon: { coup: 30, impeachment: 15, unrest: 15, martial: 25, protest: 8 },
    aiFocus: 'Focus on political instability, policy changes with economic impact, and geopolitical alignment shifts.',
  },
  {
    id: 'cyber',
    title: 'Cybersecurity Threats',
    icon: '🛡️',
    description: 'Actively exploited vulnerabilities, critical CVEs, breaches and ransomware.',
    sources: [
      { type: 'cisa' },
      { type: 'nvd' },
      {
        type: 'gdelt',
        query: '(ransomware OR "data breach" OR cyberattack OR hackers OR "zero-day" OR malware OR "cyber attack")',
        max: 40,
      },
      { type: 'hn', query: 'vulnerability OR breach OR ransomware OR exploit', days: 3 },
    ],
    lexicon: { 'zero-day': 25, 'actively exploited': 30, ransomware: 20, 'critical infrastructure': 25, breach: 12 },
    aiFocus: 'Focus on what is being actively exploited, which sectors are targeted, and recommended defensive actions.',
  },
  {
    id: 'weather',
    title: 'Weather Events',
    icon: '🌪️',
    description: 'Severe weather alerts, earthquakes, wildfires, storms and volcanoes.',
    sources: [
      { type: 'nws' },
      { type: 'usgs' },
      { type: 'eonet' },
      {
        type: 'gdelt',
        query: '(hurricane OR typhoon OR cyclone OR flood OR wildfire OR tornado OR heatwave OR drought OR blizzard)',
        max: 30,
      },
    ],
    lexicon: { 'category 5': 30, 'category 4': 25, evacuation: 20, tsunami: 30, 'state of emergency': 20 },
    aiFocus: 'Focus on human impact, supply chain / commodity disruption, and insurance exposure.',
  },
  {
    id: 'social',
    title: 'Social Media Commentary',
    icon: '💬',
    description: 'What people are saying right now on Reddit, Mastodon and Hacker News.',
    sources: [
      { type: 'reddit', subreddit: 'worldnews' },
      { type: 'reddit', subreddit: 'news' },
      { type: 'mastodon', tag: 'news' },
      { type: 'mastodon', tag: 'breakingnews' },
      { type: 'hn', frontPage: true },
    ],
    aiFocus: 'Focus on the dominant narratives and sentiment, and separate rumours from confirmed reports.',
  },
  {
    id: 'headlines',
    title: 'Mainstream Headlines',
    icon: '📰',
    description: 'Top stories from major international news organisations.',
    sources: [
      {
        type: 'gdelt',
        query:
          '(domain:reuters.com OR domain:apnews.com OR domain:bbc.co.uk OR domain:bbc.com OR domain:theguardian.com OR domain:nytimes.com OR domain:cnn.com OR domain:aljazeera.com OR domain:npr.org OR domain:ft.com)',
        max: 75,
      },
      { type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
      { type: 'rss', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World' },
    ],
    aiFocus: 'Summarise the day’s top stories and rank them by global risk impact.',
  },
  {
    id: 'ai',
    title: 'AI Daily News',
    icon: '🤖',
    description: 'Artificial intelligence research, products, policy and industry news.',
    sources: [
      {
        type: 'gdelt',
        query:
          '("artificial intelligence" OR OpenAI OR Anthropic OR "Google DeepMind" OR "machine learning" OR "large language model" OR Nvidia OR chatbot)',
      },
      { type: 'hn', query: 'AI OR LLM OR GPT OR Claude OR "machine learning"', days: 1 },
      { type: 'reddit', subreddit: 'artificial' },
    ],
    lexicon: { regulation: 10, ban: 12, lawsuit: 10, outage: 10, deepfake: 12 },
    aiFocus: 'Focus on AI developments with business, regulatory or security impact.',
  },
];

/** Converts a user-created custom tab (from Settings) into a full tab definition. */
export function customTabToDefinition(c) {
  const sources = [];
  if (c.keywords?.trim()) sources.push({ type: 'gdelt', query: toGdeltQuery(c.keywords) });
  if (c.hnQuery?.trim()) sources.push({ type: 'hn', query: c.hnQuery.trim(), days: 3 });
  if (c.subreddit?.trim()) sources.push({ type: 'reddit', subreddit: c.subreddit.trim().replace(/^r\//, '') });
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
