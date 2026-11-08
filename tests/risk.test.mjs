import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreItem, aggregateRisk, riskLevel, worldRisk, topDrivers, scoreItems } from '../js/analysis/risk.js';

test('benign headline scores low; violent headline scores high', () => {
  const calm = scoreItem({ title: 'Local bakery wins award for sourdough' });
  const hot = scoreItem({ title: 'Missile strike kills dozens as invasion escalation fears grow' });
  assert.equal(calm.score, 0);
  assert.ok(hot.score >= 50, `got ${hot.score}`);
  assert.ok(hot.matched.includes('missile'));
});

test('keywords match whole words only', () => {
  assert.equal(scoreItem({ title: 'Warner Bros announces new film' }).score, 0);
  assert.ok(scoreItem({ title: 'War spreads to border' }).score > 0);
});

test('severity hint from structured data counts', () => {
  assert.ok(scoreItem({ title: 'M7.4 earthquake', severity: 0.9 }).score >= 90);
});

test('tab-specific lexicon adds weight', () => {
  const base = scoreItem({ title: 'Bank run at regional lender' });
  const tuned = scoreItem({ title: 'Bank run at regional lender' }, { 'bank run': 30 });
  assert.ok(tuned.score > base.score);
});

test('score is always within 0..100', () => {
  const s = scoreItem({ title: 'war invasion nuclear missile terror coup tsunami famine pandemic deadly catastrophic collapse', severity: 1, engagement: 1e9 });
  assert.ok(s.score <= 100 && s.score >= 0);
});

test('aggregate, levels and world risk', () => {
  assert.equal(aggregateRisk([]).score, 0);
  const items = scoreItems([{ title: 'Deadly missile attack' }, { title: 'Sunny weekend ahead' }]);
  const agg = aggregateRisk(items);
  assert.ok(agg.score > 0 && agg.score < 100);
  assert.equal(riskLevel(85).label, 'Severe');
  assert.equal(riskLevel(10).label, 'Low');
  assert.equal(worldRisk([]), null);
  assert.equal(worldRisk([50, 50]).score, 50);
  assert.equal(topDrivers(items)[0].word.length > 0, true);
});
