import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './wealth-ai.js';

function responseCapture() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

const body = {
  accountId: 'elena',
  profile: { risk: 'conservative' },
  portfolio: { cash: 120000, netWorth: 120000, holdings: [] },
  history: { BND: Array.from({ length: 30 }, (_, day) => ({ date: `2026-09-${String(day + 1).padStart(2, '0')}`, close: 72 })) },
  events: [{ headline: 'Demo rates update', date: '2026-10-17', tickers: ['BND'] }],
  lastDecisions: [],
};

test('wealth AI uses deterministic persona fallback when the key is not configured', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const response = responseCapture();
    await handler({ method: 'POST', body }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.actions.some(action => action.ticker === 'BND'));
    assert.ok(response.body.actions.every(action => action.risk === 'low' || action.risk === 'med' || action.risk === 'high'));
  } finally { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; }
});

test('wealth AI retries malformed model JSON once, validates the strict response, and keeps the key server-side', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'server-secret';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const text = calls.length === 1 ? '{not-json' : JSON.stringify({ actions: [{ type: 'hold', ticker: '', amount_usd: 0, reason: 'Keep the current mix while monitoring the simulated prices.', risk: 'low', confidence: 0.8 }], summary: 'The simulated portfolio is aligned with the conservative goal.', market_view: 'Rates are a focus in the supplied event feed.' });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
  try {
    const response = responseCapture();
    await handler({ method: 'POST', body }, response);
    assert.equal(calls.length, 2);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.source, 'ai');
    assert.deepEqual(Object.keys(response.body.actions[0]), ['type', 'ticker', 'amount_usd', 'reason', 'risk', 'confidence']);
    assert.equal(calls[0].init.headers['x-goog-api-key'], 'server-secret');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('wealth AI rejects incomplete or unknown account contexts without calling the model', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'server-secret';
  globalThis.fetch = async () => { throw new Error('fetch should not run'); };
  try {
    const response = responseCapture();
    await handler({ method: 'POST', body: { ...body, accountId: 'unknown' } }, response);
    assert.equal(response.statusCode, 400);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  }
});
