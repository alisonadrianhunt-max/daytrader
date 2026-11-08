// Technical analysis + Buy / Hold / Sell signal engine.
// Pure functions over arrays of closing prices (oldest -> newest).
//
// The signal is a transparent point system; every point is listed in
// `reasons` so the user can see exactly why a ticker got its rating.
// This is educational information, NOT financial advice.

export function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI */
export function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  if (values.length < slow + signal) return null;
  const f = emaSeries(values, fast);
  const s = emaSeries(values, slow);
  const line = [];
  for (let i = slow - 1; i < values.length; i++) line.push(f[i] - s[i]);
  const sig = emaSeries(line, signal);
  const m = line[line.length - 1];
  const sg = sig[sig.length - 1];
  const prevHist = line[line.length - 2] - sig[sig.length - 2];
  return { macd: m, signal: sg, histogram: m - sg, prevHistogram: prevHist };
}

export function pctChange(values, lookback) {
  if (values.length <= lookback) return null;
  const a = values[values.length - 1 - lookback];
  return a ? ((values[values.length - 1] - a) / a) * 100 : null;
}

/** Annualised volatility (%) from daily closes. */
export function volatility(values, period = 20) {
  if (values.length <= period) return null;
  const rets = [];
  for (let i = values.length - period; i < values.length; i++) rets.push(Math.log(values[i] / values[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/**
 * recommend(closes) -> { action: 'BUY'|'HOLD'|'SELL', score (-100..100), confidence, reasons[], indicators }
 * Needs at least ~60 daily closes; returns HOLD with a note otherwise.
 */
export function recommend(closes) {
  const last = closes[closes.length - 1];
  if (closes.length < 60) {
    return { action: 'HOLD', score: 0, confidence: 'low', reasons: ['Not enough price history for a signal.'], indicators: { last } };
  }
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = closes.length >= 200 ? sma(closes, 200) : null;
  const r = rsi(closes, 14);
  const m = macd(closes);
  const ch5 = pctChange(closes, 5);
  const ch20 = pctChange(closes, 20);
  const vol = volatility(closes, 20);

  let points = 0;
  const reasons = [];
  const add = (p, why) => {
    points += p;
    reasons.push(`${p > 0 ? '+' : ''}${p} ${why}`);
  };

  if (last > s50) add(15, 'Price above 50-day average (uptrend)');
  else add(-15, 'Price below 50-day average (downtrend)');

  if (s20 > s50) add(15, '20-day average above 50-day (bullish crossover)');
  else add(-15, '20-day average below 50-day (bearish crossover)');

  if (s200 !== null) {
    if (last > s200) add(10, 'Above 200-day average (long-term uptrend)');
    else add(-10, 'Below 200-day average (long-term downtrend)');
  }

  if (r !== null) {
    if (r < 30) add(20, `RSI ${r.toFixed(0)} — oversold, rebound potential`);
    else if (r > 70) add(-20, `RSI ${r.toFixed(0)} — overbought, pullback risk`);
    else if (r >= 50) add(5, `RSI ${r.toFixed(0)} — positive momentum`);
    else add(-5, `RSI ${r.toFixed(0)} — weak momentum`);
  }

  if (m) {
    if (m.histogram > 0 && m.prevHistogram <= 0) add(20, 'MACD just crossed above signal line');
    else if (m.histogram < 0 && m.prevHistogram >= 0) add(-20, 'MACD just crossed below signal line');
    else if (m.histogram > 0) add(10, 'MACD above signal line');
    else add(-10, 'MACD below signal line');
  }

  if (ch20 !== null) {
    if (ch20 > 8) add(5, `Up ${ch20.toFixed(1)}% over 20 days`);
    else if (ch20 < -8) add(-5, `Down ${Math.abs(ch20).toFixed(1)}% over 20 days`);
  }

  if (vol !== null && vol > 60) reasons.push(`! High volatility (${vol.toFixed(0)}% annualised) — size positions carefully`);

  const score = Math.max(-100, Math.min(100, points));
  const action = score >= 30 ? 'BUY' : score <= -30 ? 'SELL' : 'HOLD';
  const confidence = Math.abs(score) >= 60 ? 'high' : Math.abs(score) >= 30 ? 'medium' : 'low';
  return {
    action,
    score,
    confidence,
    reasons,
    indicators: { last, sma20: s20, sma50: s50, sma200: s200, rsi: r, macd: m, change5d: ch5, change20d: ch20, volatility: vol },
  };
}
