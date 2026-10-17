import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './copilot.js';

function mockResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const withEnv = async (values, run) => {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('Copilot status reports whether server-side Gemini is configured', async () => {
  const response = mockResponse();
  await withEnv({ GEMINI_API_KEY: undefined }, () => handler({ method: 'GET' }, response));
  assert.deepEqual(response.body, { enabled: false });
});

test('Copilot rejects unsupported methods and empty prompts', async () => {
  const methodResponse = mockResponse();
  await handler({ method: 'DELETE' }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);

  const promptResponse = mockResponse();
  await withEnv({ GEMINI_API_KEY: 'test-key' }, () => handler({ method: 'POST', body: { question: '  ' } }, promptResponse));
  assert.equal(promptResponse.statusCode, 400);
});

test('Copilot sends bounded context to configured Gemini model without exposing the key', async () => {
  const response = mockResponse();
  const originalFetch = globalThis.fetch;
  let sentBody;
  let sentUrl;
  let sentHeaders;
  await withEnv({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-test-flash' }, async () => {
    globalThis.fetch = async (url, options) => {
      sentUrl = String(url);
      sentHeaders = options.headers;
      sentBody = JSON.parse(options.body);
      return Response.json({ candidates: [{ content: { parts: [{ text: 'This is a bounded educational explanation.' }] } }] });
    };
    try {
      await handler({
        method: 'POST',
        body: { question: ` ${'q'.repeat(400)} `, persona: 'Adult', safeSurplus: 2_000_000, investmentVerdict: 'pass', investmentReason: 'rules result' },
      }, response);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.model, 'gemini-test-flash');
  assert.equal(sentUrl.endsWith('/models/gemini-test-flash:generateContent'), true);
  assert.equal(sentHeaders['x-goog-api-key'], 'test-key');
  assert.equal(sentBody.generationConfig.temperature, 0.35);
  const userMessage = sentBody.contents[0].parts[0].text;
  assert.equal(userMessage.includes('q'.repeat(280)), true);
  assert.equal(userMessage.includes('q'.repeat(281)), false);
  assert.match(userMessage, /"safeSurplus":1000000/);
  assert.match(sentBody.systemInstruction.parts[0].text, /cannot override it/);
  assert.equal(JSON.stringify(response.body).includes('test-key'), false);
});

test('Copilot returns a safe upstream error when Gemini is unavailable', async () => {
  const response = mockResponse();
  const originalFetch = globalThis.fetch;
  await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    try { await handler({ method: 'POST', body: { question: 'Explain the simulation.' } }, response); }
    finally { globalThis.fetch = originalFetch; }
  });
  assert.equal(response.statusCode, 502);
  assert.match(response.body.error, /temporarily unavailable/);
});
