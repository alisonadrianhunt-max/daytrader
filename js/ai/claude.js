// Optional AI analyst powered by Claude. Uses the official Anthropic SDK,
// loaded from a CDN on first use, called directly from the browser with the
// user's own API key (stored only in this browser).

import { loadSettings } from '../core/settings.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.65.0/+esm';
let sdkPromise;

async function getClient(apiKey) {
  sdkPromise ||= import(/* @vite-ignore */ SDK_URL);
  const mod = await sdkPromise;
  const Anthropic = mod.default || mod.Anthropic;
  // The key belongs to the person using this browser, so direct browser access is intended.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const SYSTEM_PROMPT = `You are the risk analyst inside "Day Trader", a dashboard that tracks global risk.
You receive a list of the latest items for one dashboard tab, each with a rule-based risk score (0-100).
Write a concise briefing for a busy investor in Markdown with these sections:
## Situation — 2-4 sentences on what is happening.
## Key risks — up to 5 bullets, most serious first, each naming the region/sector affected.
## Market implications — bullets on likely effects on equities, bonds, commodities, currencies.
## Watch next — 2-4 bullets of concrete things to monitor.
## Risk rating — one line: Low / Guarded / Elevated / High / Severe, with a one-sentence justification.
Base every claim on the supplied items; say so when evidence is thin, and do not invent events.
Any buy/hold/sell commentary is general information, not personalised financial advice — say that once, briefly.`;

export function buildPrompt(tab, items, extra = '') {
  const lines = items
    .slice(0, 50)
    .map((it, i) => `${i + 1}. [risk ${it.risk}] ${it.title} — ${it.source}, ${new Date(it.publishedAt).toISOString().slice(0, 16)}Z${it.summary ? ` — ${it.summary.slice(0, 200)}` : ''}`)
    .join('\n');
  return `Tab: ${tab.title}\n${tab.description || ''}\n${tab.aiFocus ? `Focus: ${tab.aiFocus}\n` : ''}Current time: ${new Date().toISOString()}\n\n${extra ? extra + '\n\n' : ''}Latest items:\n${lines || '(no items loaded)'}`;
}

/** Returns the briefing as Markdown text. Throws with a readable message on failure. */
export async function generateBriefing(tab, items, extra = '') {
  const { anthropicKey, aiModel } = loadSettings();
  if (!anthropicKey) throw new Error('Add your Anthropic API key in Settings to enable AI briefings.');
  const client = await getClient(anthropicKey);
  const sdk = await sdkPromise;
  let message;
  try {
    message = await client.beta.messages
    .stream({
      model: aiModel || 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(tab, items, extra) }],
    })
    .finalMessage();
  } catch (err) {
    if (sdk.AuthenticationError && err instanceof sdk.AuthenticationError) throw new Error('Anthropic rejected the API key — check it in Settings.');
    if (sdk.RateLimitError && err instanceof sdk.RateLimitError) throw new Error('AI rate limit reached — wait a minute and try again.');
    if (sdk.APIError && err instanceof sdk.APIError) throw new Error(`AI request failed (${err.status ?? 'network'}): ${err.message}`);
    throw err;
  }
  if (message.stop_reason === 'refusal') {
    throw new Error('The AI declined to analyse this content. Try again later or with a different tab.');
  }
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The AI returned an empty briefing.');
  return text;
}
