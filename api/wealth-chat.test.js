import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './wealth-chat.js';

function responseCapture() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }

const body = {
  accountId: 'marcus', asOf: '2026-10-17', question: 'Why did you sell TSLA?',
  portfolio: { cash: 12000, netWorth: 25000, holdings: [{ ticker: 'SPY', quantity: 20, marketValue: 11800, unrealizedPnl: 100 }] },
  events: [], decisions: [],
};

test('chat fallback refuses to invent an unlogged TSLA sale', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const response = responseCapture();
    await handler({ method: 'POST', body }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.source, 'fallback');
    assert.match(response.body.answer, /recorded TSLA sale/i);
    assert.doesNotMatch(response.body.answer, /because.*(?:risk|earnings|trend)/i);
  } finally { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; }
});

test('chat answers from bounded portfolio and decision-log context', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'server-secret';
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'No simulated TSLA sale appears in the saved decision log.' }) }] } }] }) };
  };
  try {
    const response = responseCapture();
    await handler({ method: 'POST', body: { ...body, decisions: [{ actionType: 'buy', ticker: 'SPY', amountUsd: 500, status: 'executed', reason: 'Add diversified exposure.', simDate: '2026-10-16' }] } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.source, 'ai');
    assert.match(requestBody.contents[0].parts[0].text, /Add diversified exposure/);
    assert.match(requestBody.systemInstruction.parts[0].text, /decision log is the only source of truth/);
    assert.equal(requestBody.contents[0].parts[0].text.includes('server-secret'), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  }
});
