import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, macd, recommend, volatility, pctChange } from '../js/analysis/technicals.js';

const ramp = (n, start = 100, step = 1) => Array.from({ length: n }, (_, i) => start + i * step);

test('sma averages the last N values', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3);
  assert.equal(sma([1, 2, 3, 4, 5], 2), 4.5);
  assert.equal(sma([1, 2], 5), null);
});

test('rsi is 100 for a straight uptrend and low for a downtrend', () => {
  assert.equal(rsi(ramp(30), 14), 100);
  assert.ok(rsi(ramp(30, 200, -1), 14) < 1);
  assert.equal(rsi([1, 2, 3], 14), null);
});

test('macd histogram is positive in an accelerating uptrend', () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + i * i * 0.05);
  assert.ok(macd(closes).histogram > 0);
});

test('pctChange and volatility', () => {
  assert.equal(pctChange([100, 110], 1), 10);
  assert.equal(volatility(ramp(10), 20), null);
  assert.ok(volatility(ramp(40), 20) >= 0);
});

test('recommend: uptrend scores positive, downtrend negative', () => {
  // Uptrend with noise so RSI is not pinned at 100 (which would add an overbought penalty).
  const up = Array.from({ length: 220 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 2);
  const down = Array.from({ length: 220 }, (_, i) => 300 - i * 0.5 + Math.sin(i / 3) * 2);
  const u = recommend(up);
  const d = recommend(down);
  assert.ok(u.score > 0 && u.action !== 'SELL', JSON.stringify(u.reasons));
  assert.ok(d.score < 0 && d.action !== 'BUY', JSON.stringify(d.reasons));
  assert.ok(u.reasons.length >= 4);
});

test('recommend needs enough history', () => {
  const r = recommend(ramp(10));
  assert.equal(r.action, 'HOLD');
  assert.equal(r.confidence, 'low');
});


test('recommend: a sharp pullback in an uptrend lowers RSI and is not a SELL', () => {
  // Long uptrend followed by a sharp 3-day dip: trend intact, RSI oversold.
  const up = [...Array.from({ length: 200 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 2)];
  const pullbackUp = [...up, ...Array.from({ length: 8 }, (_, i) => up.at(-1) - (i + 1) * 3)];
  const r = recommend(pullbackUp);
  assert.ok(r.indicators.rsi < 45, `rsi ${r.indicators.rsi}`);
  assert.notEqual(r.action, 'SELL');
});
