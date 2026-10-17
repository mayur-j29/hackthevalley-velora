import { z } from 'zod';
import { requireSignedInUser } from './_auth.js';
import { ASSETS, PERSONAS } from '../src/simulation.ts';
import { generateFallbackActions } from '../src/wealth-agent.js';

const REQUEST_BUDGET_MS = 7800;
const MAX_CACHE_MS = 15_000;
const actionSchema = z.object({
  type: z.enum(['buy', 'sell', 'hold', 'rebalance']),
  ticker: z.string().max(12),
  amount_usd: z.number().finite().min(0).max(2_000_000),
  reason: z.string().min(1).max(240),
  risk: z.enum(['low', 'med', 'high']),
  confidence: z.number().finite().min(0).max(1),
}).strict();
const responseSchema = z.object({
  actions: z.array(actionSchema).max(8),
  summary: z.string().min(1).max(600),
  market_view: z.string().min(1).max(400),
}).strict();
const cache = new Map();

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!await requireSignedInUser(request, response)) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const context = normalizeContext(body);
  if (!context) return response.status(400).json({ error: 'Complete simulated portfolio context is required.' });
  const cacheKey = JSON.stringify(context);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return response.status(200).json({ ...cached.value, cached: true });
  for (const [key, item] of cache) if (item.expiresAt <= Date.now()) cache.delete(key);

  if (!process.env.GEMINI_API_KEY) return sendFallback(response, context, 'AI is not configured; using fallback mode.');
  const model = /^[A-Za-z0-9.-]{1,80}$/.test(process.env.GEMINI_MODEL || '') ? process.env.GEMINI_MODEL : 'gemini-3.8-flash';
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remaining);
    try {
      const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are Velora, an educational wealth-management simulation agent. Return strict JSON only, with exactly this schema: {"actions":[{"type":"buy|sell|hold|rebalance","ticker":"","amount_usd":0,"reason":"","risk":"low|med|high","confidence":0.0}],"summary":"","market_view":""}. Use only the supplied simulated data. Never claim you executed a trade. Do not recommend shorting, leverage, guarantees, or real investments. Propose at most 3 trade actions; use HOLD when the data does not support a clear portfolio adjustment. Respect the profile: aggressive investors can emphasize diversified growth stocks, balanced investors mix stocks, ETFs, and bonds, and conservative investors should lean toward broad ETFs and BND while holding more cash. When supplied events explicitly describe a market crash or selloff, consider trimming growth-stock exposure and preserving cash; do not buy only because prices fell. Every reason must explain the proposal in plain language.' }] },
          contents: [{ role: 'user', parts: [{ text: `Portfolio and market context: ${JSON.stringify(context)}${correction}` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1400, temperature: 0.2 },
        }),
      });
      if (!result.ok) break;
      const payload = await result.json();
      const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      let parsed;
      try { parsed = JSON.parse(raw || ''); }
      catch { correction = '\nPrevious response was not valid JSON. Retry once with strict JSON only.'; continue; }
      const validated = responseSchema.safeParse(parsed);
      if (!validated.success) { correction = `\nPrevious response failed schema validation: ${validated.error.issues.slice(0, 4).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}. Return corrected strict JSON.`; continue; }
      if (validated.data.actions.some(action => action.type !== 'hold' && !Object.hasOwn(ASSETS, action.ticker.toUpperCase()))) { correction = '\nA proposed ticker was outside the simulated asset list. Use only supplied assets and retry once.'; continue; }
      const tickers = Object.keys(ASSETS);
      const actions = validated.data.actions.map(action => ({ ...action, ticker: action.ticker.toUpperCase() })).filter(action => action.type === 'hold' || tickers.includes(action.ticker)).slice(0, 8);
      const output = { ...validated.data, actions, source: 'ai', model };
      cache.set(cacheKey, { value: output, expiresAt: Date.now() + MAX_CACHE_MS });
      return response.status(200).json(output);
    } catch {
      break;
    } finally { clearTimeout(timeout); }
  }
  return sendFallback(response, context, Date.now() >= deadline ? 'AI timed out; using fallback mode.' : 'AI response was unavailable or invalid; using fallback mode.');
}

function normalizeContext(body) {
  const id = String(body.accountId || '');
  const persona = PERSONAS.find(person => person.id === id);
  const risk = ['aggressive', 'balanced', 'conservative'].includes(body.profile?.risk) ? body.profile.risk : persona?.risk;
  if (!persona || !risk) return null;
  const profileName = typeof body.profile?.name === 'string' ? body.profile.name.trim().slice(0, 48) : '';
  const profileGoal = typeof body.profile?.goal === 'string' ? body.profile.goal.trim().slice(0, 120) : '';
  const age = Number.isInteger(Number(body.profile?.age)) ? bounded(body.profile.age, 13, 100) : persona.age;
  const horizonYears = Number.isInteger(Number(body.profile?.horizonYears)) ? bounded(body.profile.horizonYears, 1, 60) : persona.horizonYears;
  const cash = bounded(body.portfolio?.cash, 0, 2_000_000);
  const holdings = Array.isArray(body.portfolio?.holdings) ? body.portfolio.holdings.filter(item => ASSETS[item?.ticker]).slice(0, 10).map(item => ({ ticker: item.ticker, quantity: bounded(item.quantity, 0, 1_000_000), marketValue: bounded(item.marketValue, 0, 2_000_000) })) : [];
  const netWorth = bounded(body.portfolio?.netWorth, 0, 2_000_000);
  if (netWorth <= 0) return null;
  const history = body.history && typeof body.history === 'object' ? Object.fromEntries(Object.keys(ASSETS).map(ticker => [ticker, Array.isArray(body.history[ticker]) ? body.history[ticker].slice(-30).map(point => ({ date: String(point.date || '').slice(0, 10), close: bounded(point.close, 0, 1_000_000) })) : []])) : {};
  const events = Array.isArray(body.events) ? body.events.slice(-8).map(item => ({ headline: String(item.headline || '').slice(0, 140), date: String(item.date || '').slice(0, 10), tickers: Array.isArray(item.tickers) ? item.tickers.filter(ticker => ASSETS[ticker]).slice(0, 10) : [] })) : [];
  const lastDecisions = Array.isArray(body.lastDecisions) ? body.lastDecisions.slice(0, 5).map(item => ({ type: String(item.type || '').slice(0, 20), ticker: String(item.ticker || '').slice(0, 12), reason: String(item.reason || '').slice(0, 120), status: String(item.status || '').slice(0, 20) })) : [];
  return { accountId: persona.id, profile: { name: profileName || persona.name, age, occupation: String(body.profile?.occupation || persona.occupation).slice(0, 48), goal: profileGoal || persona.goal, risk, horizonYears, cashBuffer: persona.cashBuffer }, portfolio: { cash, netWorth, holdings }, history, events, lastDecisions };
}

function sendFallback(response, context, reason) {
  const actions = generateFallbackActions({ profile: context.profile, portfolio: context.portfolio, prices: context.history, events: context.events });
  return response.status(200).json({ actions, summary: `${reason} The deterministic ${context.profile.risk} target mix generated these proposals.`, market_view: 'Using the seeded simulated prices and supplied events.', source: 'fallback', model: 'local rules', fallbackReason: reason });
}

function bounded(value, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : 0; }
