import { z } from 'zod';
import { ASSETS, PERSONAS } from '../src/simulation.ts';

const MAX_QUESTION_LENGTH = 280;
const REQUEST_BUDGET_MS = 7800;
const CACHE_TTL_MS = 15_000;
const answerSchema = z.object({ answer: z.string().min(1).max(1200) }).strict();
const cache = new Map();

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LENGTH) : '';
  if (!question) return response.status(400).json({ error: 'Add a question first.' });
  const context = normalizeContext(body);
  if (!context) return response.status(400).json({ error: 'Complete simulated portfolio context is required.' });
  const key = JSON.stringify({ question, context });
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return response.status(200).json({ ...cached.value, cached: true });
  for (const [cacheKey, item] of cache) if (item.expiresAt <= Date.now()) cache.delete(cacheKey);

  if (!process.env.GEMINI_API_KEY) return response.status(200).json({ answer: fallbackAnswer(question, context), source: 'fallback', fallbackReason: 'AI is not configured; using grounded portfolio context.' });
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const model = /^[A-Za-z0-9.-]{1,80}$/.test(configuredModel) ? configuredModel : 'gemini-3.8-flash';
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
          systemInstruction: { parts: [{ text: 'You are Ask Velora, a concise advisor for a simulated investment account. Answer using only the supplied profile, portfolio snapshot, market events, and decision log. The decision log is the only source of truth for trades: never claim a trade happened unless a log entry says it was executed, and distinguish pending, blocked, rejected, and executed proposals. If the log has no matching trade, say that no such trade is recorded. Never invent trades, holdings, goals, progress, prices, news, or outcomes. Do not create a new trade proposal or tell the user to buy or sell a security. You may explain current allocations and risks in plain language. This is a simulated environment, not financial advice. Keep answers to 2 or 3 short sentences.' }] },
          contents: [{ role: 'user', parts: [{ text: `Verified portfolio context: ${JSON.stringify(context)}\nQuestion: ${question}${correction}` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 380, temperature: 0.1 },
        }),
      });
      if (!result.ok) break;
      const payload = await result.json();
      const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      let parsed;
      try { parsed = JSON.parse(raw || ''); }
      catch { correction = '\nPrevious response was invalid JSON. Return a strict JSON object with an answer string.'; continue; }
      const validated = answerSchema.safeParse(parsed);
      if (!validated.success) { correction = '\nPrevious response did not match {"answer":"..."}. Return valid JSON with no extra keys.'; continue; }
      const value = { answer: validated.data.answer, source: 'ai', model };
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return response.status(200).json(value);
    } catch {
      break;
    } finally { clearTimeout(timeout); }
  }
  return response.status(200).json({ answer: fallbackAnswer(question, context), source: 'fallback', fallbackReason: Date.now() >= deadline ? 'AI timed out; using grounded portfolio context.' : 'AI is unavailable; using grounded portfolio context.' });
}

function normalizeContext(body) {
  const persona = PERSONAS.find(person => person.id === body.accountId);
  if (!persona || !body.portfolio || typeof body.portfolio !== 'object') return null;
  const holdings = Array.isArray(body.portfolio.holdings) ? body.portfolio.holdings.filter(item => ASSETS[item?.ticker]).slice(0, 10).map(item => ({ ticker: item.ticker, quantity: bounded(item.quantity, 0, 1_000_000), marketValue: bounded(item.marketValue, 0, 2_000_000), unrealizedPnl: bounded(item.unrealizedPnl, -2_000_000, 2_000_000) })) : [];
  const netWorth = bounded(body.portfolio.netWorth, 0, 2_000_000);
  if (netWorth <= 0) return null;
  const decisions = Array.isArray(body.decisions) ? body.decisions.slice(0, 30).map(item => ({ type: String(item.actionType || '').slice(0, 20), ticker: String(item.ticker || '').slice(0, 12), amountUsd: bounded(item.amountUsd, 0, 2_000_000), reason: String(item.reason || '').slice(0, 180), status: ['executed', 'pending', 'blocked', 'rejected'].includes(item.status) ? item.status : 'pending', simDate: String(item.simDate || '').slice(0, 10) })) : [];
  const events = Array.isArray(body.events) ? body.events.slice(-8).map(item => ({ headline: String(item.headline || '').slice(0, 140), date: String(item.date || '').slice(0, 10), tickers: Array.isArray(item.tickers) ? item.tickers.filter(ticker => ASSETS[ticker]).slice(0, 10) : [] })) : [];
  return { profile: { name: persona.name, age: persona.age, goal: persona.goal, risk: persona.risk, horizonYears: persona.horizonYears }, asOf: String(body.asOf || '').slice(0, 10), portfolio: { cash: bounded(body.portfolio.cash, 0, 2_000_000), netWorth, holdings }, events, decisions };
}

function fallbackAnswer(question, context) {
  const saleMatch = question.match(/\b(?:sell|selling|sold)\s+(?:of\s+)?([A-Z]{1,5})\b/i);
  if (saleMatch) {
    const ticker = saleMatch[1].toUpperCase();
    const record = context.decisions.find(item => item.type === 'sell' && item.ticker === ticker);
    if (record?.status === 'executed') return `Velora’s log shows a simulated ${ticker} sale on ${record.simDate}: ${record.reason} No real shares were sold.`;
    if (record?.status === 'pending') return `There is a pending simulated ${ticker} sale proposal, but it has not been approved or executed. The recorded reason is: ${record.reason}`;
    if (record?.status === 'blocked') return `A simulated ${ticker} sale proposal was blocked by a guardrail. It was not executed; the log says: ${record.reason}`;
    return `I don’t see a recorded ${ticker} sale in Velora’s decision log, so I can’t give a reason for one. The current activity feed contains only the logged simulated decisions.`;
  }
  const holdings = context.portfolio.holdings.length ? context.portfolio.holdings.map(item => `${item.ticker} at $${Math.round(item.marketValue).toLocaleString()}`).join(', ') : 'no invested holdings yet';
  const goalPrompt = /goal|track|progress|on track/i.test(question);
  return goalPrompt
    ? `${context.profile.name}’s demo goal is “${context.profile.goal}” with a ${context.profile.horizonYears}-year horizon. The current simulated net worth is $${Math.round(context.portfolio.netWorth).toLocaleString()} and holdings are ${holdings}; there is no target amount or dated milestone in the profile to measure progress against.`
    : `As of ${context.asOf || 'the latest simulation date'}, simulated net worth is $${Math.round(context.portfolio.netWorth).toLocaleString()} with $${Math.round(context.portfolio.cash).toLocaleString()} cash and ${holdings}. I can only confirm trades that appear in the saved decision log.`;
}

function bounded(value, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : 0; }
