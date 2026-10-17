import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './market.js';

function mockResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('market history endpoint rejects unsupported symbols before any provider call', async () => {
  const response = mockResponse();
  await handler({ method: 'GET', url: '/?symbol=UNKNOWN&range=1y' }, response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /supported symbols: SPY/);
});

test('market history endpoint rejects unsupported ranges', async () => {
  const response = mockResponse();
  await handler({ method: 'GET', url: '/?symbol=SPY&range=max' }, response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /supported history window/);
});

test('market history is read-only and accepts only GET', async () => {
  const response = mockResponse();
  await handler({ method: 'POST', url: '/?symbol=SPY&range=1y' }, response);
  assert.equal(response.statusCode, 405);
  assert.match(response.body.error, /Method not allowed/);
});

test('market history defaults to and labels the S&P 500 ETF proxy explicitly', async () => {
  const response = mockResponse();
  const originalFetch = globalThis.fetch;
  const timestamps = [1_700_000_000, 1_700_086_400];
  globalThis.fetch = async () => Response.json({
    chart: { result: [{ timestamp: timestamps, meta: { currency: 'USD' }, indicators: { adjclose: [{ adjclose: [100, 102] }], quote: [{ close: [100, 102] }] } }] },
  });
  try {
    await handler({ method: 'GET', url: '/' }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.symbol, 'SPY');
  assert.equal(response.body.displaySymbol, 'S&P 500 ETF proxy (SPY)');
  assert.equal(response.body.points.length, 2);
  assert.equal(response.body.points[1].close, 102);
});

test('market history supports a bounded batch of whitelisted symbols', async () => {
  const response = mockResponse();
  const originalFetch = globalThis.fetch;
  const timestamps = [1_700_000_000, 1_700_086_400];
  globalThis.fetch = async url => {
    const symbol = String(url).match(/chart\/([A-Z]+)/)?.[1] || 'SPY';
    return Response.json({ chart: { result: [{ timestamp: timestamps, meta: { currency: 'USD' }, indicators: { adjclose: [{ adjclose: [100, symbol === 'AAPL' ? 103 : 102] }] } }] } });
  };
  try {
    await handler({ method: 'GET', url: '/?symbols=SPY,AAPL&range=6mo' }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.quotes.map(quote => quote.symbol), ['SPY', 'AAPL']);
  assert.equal(response.body.quotes[1].points[1].close, 103);
});
