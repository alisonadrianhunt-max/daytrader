// Transparent, rule-based risk scoring. Every item gets a 0–100 risk score
// from (a) weighted risk keywords in its title/summary, (b) a severity hint
// from structured sources (quake magnitude, CVSS, NWS severity…), and
// (c) a small boost for heavily-discussed social posts. Tabs and the overall
// world picture are aggregated from item scores.

export const BASE_LEXICON = {
  // conflict & security
  war: 14, invasion: 22, airstrike: 16, airstrikes: 16, 'air strike': 16, missile: 14, missiles: 14, bombing: 16, shelling: 14,
  killed: 14, kills: 14, killing: 14, deaths: 12, wounded: 10, attacks: 10, strikes: 8, clashes: 10, fighting: 10,
  dead: 12, casualties: 14, attack: 10, terror: 18, terrorist: 18, hostage: 14, nuclear: 22, escalation: 14,
  troops: 8, mobilization: 16, coup: 22, assassination: 22, explosion: 12, drone: 6, ceasefire: -6, 'peace deal': -10,
  // financial
  crash: 18, plunge: 14, plunges: 14, selloff: 12, 'sell-off': 12, default: 18, bankruptcy: 16, recession: 14,
  crisis: 14, contagion: 18, downgrade: 10, inflation: 6, layoffs: 8, tumble: 10, slump: 10, rally: -6, surge: 2,
  rebound: -5, 'rate cut': -4,
  // cyber
  ransomware: 16, breach: 12, 'zero-day': 20, exploit: 12, exploited: 14, hacked: 12, malware: 10, outage: 10,
  vulnerability: 8, ddos: 10, 'data leak': 12,
  // disasters
  earthquake: 12, tsunami: 22, hurricane: 14, typhoon: 14, cyclone: 14, flood: 12, flooding: 12, wildfire: 12,
  tornado: 12, evacuation: 14, evacuate: 14, emergency: 10, eruption: 14, famine: 18, pandemic: 18, outbreak: 14,
  // political
  sanctions: 10, protest: 6, protests: 6, unrest: 12, riot: 12, impeachment: 8, resign: 6, resigns: 6, tariff: 8,
  tariffs: 8, 'martial law': 22, shutdown: 8,
  // general
  warning: 6, threat: 8, threatens: 8, fears: 6, urgent: 8, deadly: 16, catastrophic: 18, collapse: 16,
};

export const LEVELS = [
  { min: 80, label: 'Severe', key: 'severe' },
  { min: 60, label: 'High', key: 'high' },
  { min: 40, label: 'Elevated', key: 'elevated' },
  { min: 20, label: 'Guarded', key: 'guarded' },
  { min: 0, label: 'Low', key: 'low' },
];

export function riskLevel(score) {
  return LEVELS.find((l) => score >= l.min) || LEVELS[LEVELS.length - 1];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = new Map();

function compile(lexicon) {
  const cacheKey = JSON.stringify(lexicon);
  if (compiled.has(cacheKey)) return compiled.get(cacheKey);
  const entries = Object.entries(lexicon).map(([word, weight]) => ({
    word,
    weight,
    re: new RegExp(`(^|[^a-z0-9])${escapeRe(word.toLowerCase())}([^a-z0-9]|$)`, 'i'),
  }));
  compiled.set(cacheKey, entries);
  return entries;
}

/** Returns { score: 0..100, matched: [words] } for a single item. */
export function scoreItem(item, extraLexicon = {}) {
  const lex = compile({ ...BASE_LEXICON, ...extraLexicon });
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  let keywordPoints = 0;
  const matched = [];
  for (const { word, weight, re } of lex) {
    if (re.test(text)) {
      keywordPoints += weight;
      if (weight > 0) matched.push(word);
    }
  }
  // Diminishing returns so a headline stuffed with keywords can't exceed ~70 alone.
  const keywordScore = keywordPoints > 0 ? 70 * (1 - Math.exp(-keywordPoints / 30)) : Math.max(-10, keywordPoints);
  const severityScore = (item.severity || 0) * 100;
  const engagementBoost = item.engagement ? Math.min(10, Math.log10(1 + item.engagement) * 2.5) : 0;
  const score = Math.round(Math.max(0, Math.min(100, Math.max(keywordScore, severityScore) + engagementBoost + Math.min(keywordScore, severityScore) * 0.25)));
  return { score, matched };
}

export function scoreItems(items, extraLexicon) {
  return items.map((it) => {
    const { score, matched } = scoreItem(it, extraLexicon);
    return { ...it, risk: score, matched };
  });
}

/**
 * Aggregate risk for a set of scored items: mean of the top 10 scores,
 * blended with how many items are high-risk. 0..100.
 */
export function aggregateRisk(items) {
  if (!items?.length) return { score: 0, level: riskLevel(0), highCount: 0, total: 0 };
  const scores = items.map((i) => i.risk ?? 0).sort((a, b) => b - a);
  const top = scores.slice(0, 10);
  const topMean = top.reduce((a, b) => a + b, 0) / top.length;
  const highCount = scores.filter((s) => s >= 60).length;
  const breadth = Math.min(1, highCount / 15);
  const score = Math.round(Math.min(100, topMean * 0.8 + breadth * 20));
  return { score, level: riskLevel(score), highCount, total: items.length };
}

/** Most frequent risk keywords across items — the "what's driving risk" chips. */
export function topDrivers(items, n = 8) {
  const counts = new Map();
  for (const it of items) for (const w of it.matched || []) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
}

/** World risk: weighted mean of tab scores, nudged up by the worst tab. */
export function worldRisk(tabScores) {
  const vals = tabScores.filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals);
  const score = Math.round(mean * 0.7 + max * 0.3);
  return { score, level: riskLevel(score) };
}
