import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAgentAction, dailyDrawdown, generateFallbackActions, targetWeights } from './wealth-agent.js';

const portfolio = {
  netWorth: 100000,
  cash: 30000,
  holdings: [{ ticker: 'NVDA', marketValue: 25000, quantity: 25 }],
};
const action = (type, ticker, amount_usd) => ({ type, ticker, amount_usd });

test('persona fallback emphasizes growth for Aisha and bonds and ETFs for Elena', () => {
  const aisha = generateFallbackActions({ profile: { risk: 'aggressive', cashBuffer: 0.05 }, portfolio: { cash: 2000, netWorth: 2000, holdings: [] } });
  const elena = generateFallbackActions({ profile: { risk: 'conservative', cashBuffer: 0.2 }, portfolio: { cash: 120000, netWorth: 120000, holdings: [] } });
  assert.ok(aisha.some(item => ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'GOOGL'].includes(item.ticker)));
  assert.ok(elena.some(item => ['BND', 'SPY', 'QQQ', 'VTI'].includes(item.ticker)));
  assert.equal(targetWeights('aggressive').NVDA, 0.12);
  assert.equal(targetWeights('conservative').BND, 0.25);
});

test('crash fallback trims held growth shares instead of buying the dip', () => {
  const actions = generateFallbackActions({ profile: { risk: 'balanced', cashBuffer: 0.1 }, portfolio, events: [{ headline: 'Demo scenario: a sudden market crash sends growth shares lower' }] });
  assert.ok(actions.length > 0);
  assert.ok(actions.every(item => item.type === 'sell'));
  assert.ok(actions.every(item => item.amount_usd > 0));
});

test('guardrails enforce single-stock cap, cash buffer, no shorting and trade limit', () => {
  const base = { portfolio, profile: { cashBuffer: 0.1 }, mode: 'approve' };
  assert.match(checkAgentAction({ ...base, action: action('buy', 'NVDA', 1000) }).reason, /25%/);
  assert.match(checkAgentAction({ ...base, action: action('buy', 'AAPL', 20000) }).reason, /cash buffer/i);
  assert.match(checkAgentAction({ ...base, action: action('sell', 'AAPL', 100) }).reason, /No shorting/);
  assert.match(checkAgentAction({ ...base, action: action('buy', 'SPY', 500), tradesSoFar: 3 }).reason, /Maximum of 3/);
  assert.equal(checkAgentAction({ ...base, action: action('buy', 'BND', 1000) }).allowed, true);
});

test('daily drawdown pauses auto mode, while approval mode remains reviewable', () => {
  const drawdown = dailyDrawdown([{ value: 100000 }, { value: 94000 }]);
  assert.equal(drawdown, -0.06);
  const request = { action: action('buy', 'BND', 1000), portfolio, profile: { cashBuffer: 0.1 }, drawdown };
  assert.match(checkAgentAction({ ...request, mode: 'auto' }).reason, /circuit breaker/i);
  assert.equal(checkAgentAction({ ...request, mode: 'approve' }).allowed, true);
});
