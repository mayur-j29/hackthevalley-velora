import { ASSETS, SLIPPAGE_RATE, TRADING_FEE_RATE } from './simulation.ts';

export const MAX_TRADES_PER_CYCLE = 3;
export const MAX_SINGLE_STOCK_WEIGHT = 0.25;
export const DAILY_DRAWDOWN_LIMIT = 0.05;

const TARGET_WEIGHTS = Object.freeze({
  aggressive: { AAPL: 0.15, NVDA: 0.12, TSLA: 0.10, MSFT: 0.12, AMZN: 0.08, GOOGL: 0.08, SPY: 0.10, QQQ: 0.10, BND: 0.05, VTI: 0.05 },
  balanced: { AAPL: 0.05, NVDA: 0.05, TSLA: 0.05, MSFT: 0.05, AMZN: 0.05, GOOGL: 0.05, SPY: 0.18, QQQ: 0.08, BND: 0.22, VTI: 0.12 },
  conservative: { AAPL: 0.04, NVDA: 0.02, TSLA: 0.01, MSFT: 0.04, AMZN: 0.02, GOOGL: 0.02, SPY: 0.20, QQQ: 0.05, BND: 0.25, VTI: 0.20 },
});

const money = number => Math.round((number + Number.EPSILON) * 100) / 100;

export function targetWeights(risk) {
  return { ...(TARGET_WEIGHTS[risk] || TARGET_WEIGHTS.balanced) };
}

export function generateFallbackActions({ profile, portfolio, prices, events = [] }) {
  const total = Number(portfolio?.netWorth) || 0;
  if (total <= 0) return [{ type: 'hold', ticker: '', amount_usd: 0, reason: 'The account has no simulated assets to rebalance.', risk: 'low', confidence: 0.99 }];
  const crashContext = events.some(event => /crash|market selloff/i.test(event.headline || ''));
  if (crashContext) {
    const deRisk = (portfolio.holdings || []).filter(holding => ASSETS[holding.ticker]?.type === 'stock' && Number(holding.marketValue) > 0).sort((a, b) => b.marketValue - a.marketValue).slice(0, MAX_TRADES_PER_CYCLE).map(holding => ({ type: 'sell', ticker: holding.ticker, amount_usd: money(Number(holding.marketValue) * 0.25), reason: `Fallback crash response: trim ${holding.ticker} exposure and hold more simulated cash through the shock.`, risk: 'med', confidence: 0.76 }));
    if (deRisk.length) return deRisk;
  }
  const targets = targetWeights(profile?.risk);
  const heldValues = Object.fromEntries((portfolio.holdings || []).map(holding => [holding.ticker, Number(holding.marketValue) || 0]));
  const gaps = Object.entries(targets).map(([ticker, weight]) => ({ ticker, delta: money(total * weight - (heldValues[ticker] || 0)) }));
  const sales = gaps.filter(item => item.delta < -10).sort((a, b) => a.delta - b.delta).map(item => ({ type: 'sell', ticker: item.ticker, amount_usd: Math.abs(item.delta), reason: `Fallback rebalance trims ${item.ticker} toward the ${profile?.risk || 'balanced'} target mix.`, risk: 'med', confidence: 0.72 }));
  const currentCashFloor = Number(profile?.cashBuffer ?? 0.1) * total;
  let availableCash = Math.max(0, (Number(portfolio.cash) || 0) - currentCashFloor);
  const buys = gaps.filter(item => item.delta > 10).sort((a, b) => b.delta - a.delta).map(item => {
    const amount = Math.min(item.delta, availableCash);
    availableCash -= amount;
    return { type: 'buy', ticker: item.ticker, amount_usd: money(amount), reason: `Fallback rebalance adds ${item.ticker} toward the ${profile?.risk || 'balanced'} target mix.`, risk: item.ticker === 'BND' || ASSETS[item.ticker]?.type === 'etf' ? 'low' : 'high', confidence: 0.68 };
  }).filter(action => action.amount_usd >= 10);
  const actions = [...sales, ...buys].slice(0, MAX_TRADES_PER_CYCLE);
  return actions.length ? actions : [{ type: 'hold', ticker: '', amount_usd: 0, reason: 'The portfolio is close to its persona target mix.', risk: 'low', confidence: 0.7 }];
}

export function dailyDrawdown(history = []) {
  if (history.length < 2) return 0;
  const previous = Number(history.at(-2)?.value) || 0;
  const current = Number(history.at(-1)?.value) || 0;
  return previous > 0 ? Math.min(0, (current - previous) / previous) : 0;
}

export function checkAgentAction({ action, portfolio, profile, tradesSoFar = 0, mode = 'approve', drawdown = 0 }) {
  const type = String(action?.type || '').toLowerCase();
  const ticker = String(action?.ticker || '').toUpperCase();
  if (!['buy', 'sell', 'hold', 'rebalance'].includes(type)) return { allowed: false, reason: 'Unsupported action.' };
  if (type === 'hold') return { allowed: true, reason: '' };
  if (!ASSETS[ticker]) return { allowed: false, reason: 'Ticker is not available in the simulated market.' };
  if (tradesSoFar >= MAX_TRADES_PER_CYCLE) return { allowed: false, reason: `Maximum of ${MAX_TRADES_PER_CYCLE} trades per cycle.` };
  if (mode === 'auto' && drawdown <= -DAILY_DRAWDOWN_LIMIT) return { allowed: false, reason: `Daily drawdown circuit breaker paused auto-trading at ${Math.abs(drawdown * 100).toFixed(1)}%.` };
  const amount = Number(action.amount_usd);
  const netWorth = Number(portfolio.netWorth) || 0;
  const cash = Number(portfolio.cash) || 0;
  if (!Number.isFinite(amount) || amount <= 0 || netWorth <= 0) return { allowed: false, reason: 'Order amount or simulated portfolio value is invalid.' };
  const holding = (portfolio.holdings || []).find(item => item.ticker === ticker);
  const marketValue = Number(holding?.marketValue) || 0;
  if (type === 'sell' && (!holding || amount > marketValue + 0.01)) return { allowed: false, reason: 'No shorting: the requested sale exceeds this account’s holding.' };
  if (type === 'buy') {
    const resultingCash = cash - amount * (1 + SLIPPAGE_RATE + TRADING_FEE_RATE);
    const floor = Math.max(0, Number(profile?.cashBuffer) || 0) * netWorth;
    if (resultingCash < floor - 0.01) return { allowed: false, reason: `Cash buffer: keep at least ${Math.round(floor / netWorth * 100)}% of the portfolio in cash.` };
    if (ASSETS[ticker].type === 'stock' && marketValue + amount * (1 + SLIPPAGE_RATE + TRADING_FEE_RATE) > netWorth * MAX_SINGLE_STOCK_WEIGHT + 0.01) return { allowed: false, reason: 'Single-stock cap: maximum 25% of the portfolio in one stock.' };
  }
  return { allowed: true, reason: '' };
}
