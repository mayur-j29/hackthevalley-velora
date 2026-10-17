import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, calculateDebtPayoff, evaluateMovingAverageCrossover, evaluateSimulatedTrade, executePaperOrder, getSafeSurplus, getVolatilityProfile, simulateAutoInvest, simulateHistoricalInvestment, startingBalance } from './finance.js';

test('forecast includes all scheduled cash events and preserves its start balance', () => {
  const sampleEvents = [{ day: 8, title: 'Payday', amount: 2450, kind: 'income' }, { day: 26, title: 'Rent', amount: -1850, kind: 'bill' }];
  const forecast = buildForecast({ days: 30, balance: 4820.46, events: sampleEvents });
  assert.equal(forecast.length, 31);
  assert.equal(forecast[0].value, 4820.46);
  assert.ok(forecast.some(point => point.events.some(event => event.title === 'Rent')));
});

test('trade checks block invalid amounts, disabled rails, and orders above surplus', () => {
  assert.equal(evaluateSimulatedTrade({ amount: 0, safeSurplus: 500, railsEnabled: true }).verdict, 'blocked');
  assert.equal(evaluateSimulatedTrade({ amount: 100, safeSurplus: 500, railsEnabled: false }).verdict, 'blocked');
  assert.equal(evaluateSimulatedTrade({ amount: 501, safeSurplus: 500, railsEnabled: true }).verdict, 'blocked');
  assert.equal(evaluateSimulatedTrade({ amount: 100, safeSurplus: Number.NaN, railsEnabled: true }).verdict, 'blocked');
  assert.equal(evaluateSimulatedTrade({ amount: 500, safeSurplus: 500, railsEnabled: true }).verdict, 'pass');
});

test('recurring simulations keep every allowed contribution above the protected reserve', () => {
  const forecast = buildForecast({ days: 30, balance: 4820.46, events: [{ day: 26, title: 'Rent', amount: -1850, kind: 'bill' }] });
  const result = simulateAutoInvest({ forecast, amount: 250, cadence: 7, floor: 100 });
  assert.ok(result.executions.length > 0);
  assert.ok(result.lowestBalance >= 1200);
  assert.equal(result.total, result.executions.length * 250);
  assert.equal(getSafeSurplus(forecast).safeSurplus >= 0, true);
});

test('disabled rails block all recurring contributions without changing the forecast', () => {
  const forecast = buildForecast({ days: 30 });
  const result = simulateAutoInvest({ forecast, amount: 250, cadence: 7, railsEnabled: false });
  assert.equal(result.executions.length, 0);
  assert.equal(result.total, 0);
  assert.ok(result.blocked.length > 0);
  assert.equal(result.endingBalance, forecast.at(-1).value);
});

test('non-integer or invalid schedules cannot generate simulated executions', () => {
  const forecast = buildForecast({ days: 30 });
  assert.equal(simulateAutoInvest({ forecast, amount: 250, cadence: 1.5 }).executions.length, 0);
  assert.equal(simulateAutoInvest({ forecast, amount: -1, cadence: 7 }).executions.length, 0);
});

test('user-added income and bills update each matching forecast day', () => {
  const custom = [
    { day: 3, title: 'Tuition', amount: -800, kind: 'bill' },
    { day: 9, title: 'Scholarship', amount: 500, kind: 'income' },
  ];
  const forecast = buildForecast({ days: 10, events: custom });
  assert.equal(forecast[3].value, startingBalance - 800);
  assert.equal(forecast[9].value, startingBalance - 300);
  assert.equal(forecast[3].events[0].title, 'Tuition');
});

test('debt payoff estimates interest and reject payments below monthly interest', () => {
  assert.equal(calculateDebtPayoff({ balance: 0, apr: 0, payment: 0 }).valid, true);
  const payoff = calculateDebtPayoff({ balance: 1000, apr: 12, payment: 100 });
  assert.equal(payoff.valid, true);
  assert.ok(payoff.months > 0);
  assert.ok(payoff.totalInterest > 0);
  assert.equal(calculateDebtPayoff({ balance: 1000, apr: 24, payment: 10 }).valid, false);
});

test('historical paper replay requires rails, valid history, and the current surplus cap', () => {
  const points = [{ date: '2024-01-01', close: 100 }, { date: '2025-01-01', close: 125 }];
  assert.equal(simulateHistoricalInvestment({ amount: 500, safeSurplus: 1000, railsEnabled: false, points }).verdict, 'blocked');
  assert.equal(simulateHistoricalInvestment({ amount: 1001, safeSurplus: 1000, railsEnabled: true, points }).verdict, 'blocked');
  assert.equal(simulateHistoricalInvestment({ amount: 500, safeSurplus: 1000, railsEnabled: true, points: [] }).verdict, 'unavailable');
  const result = simulateHistoricalInvestment({ amount: 500, safeSurplus: 1000, railsEnabled: true, points });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.endingValue, 625);
  assert.equal(result.returnPct, 25);
});

test('paper buy and sell orders update virtual cash and positions without touching real funds', () => {
  const portfolio = { cash: 1000, positions: { AAPL: { shares: 2, averageCost: 100 } }, orders: [] };
  const bought = executePaperOrder({ portfolio, symbol: 'AAPL', side: 'buy', shares: 1, price: 200, safeSurplus: 500, railsEnabled: true });
  assert.equal(bought.ok, true);
  assert.equal(bought.portfolio.cash, 800);
  assert.equal(bought.portfolio.positions.AAPL.shares, 3);
  assert.equal(bought.portfolio.positions.AAPL.averageCost, 133.3333);
  const sold = executePaperOrder({ portfolio: bought.portfolio, symbol: 'AAPL', side: 'sell', shares: 0.5, price: 210, safeSurplus: 500, railsEnabled: true });
  assert.equal(sold.ok, true);
  assert.equal(sold.portfolio.cash, 905);
  assert.equal(sold.portfolio.positions.AAPL.shares, 2.5);
  assert.equal(sold.portfolio.orders.length, 2);
  assert.equal(portfolio.cash, 1000);
});

test('paper orders block rails-off, excess buying power, oversells, and missing quotes', () => {
  const portfolio = { cash: 100, positions: { MSFT: { shares: 1, averageCost: 50 } }, orders: [] };
  const order = input => executePaperOrder({ portfolio, symbol: 'MSFT', side: 'buy', shares: 2, price: 90, safeSurplus: 500, railsEnabled: true, ...input });
  assert.equal(order({ railsEnabled: false }).ok, false);
  assert.equal(order({}).ok, false);
  assert.equal(executePaperOrder({ portfolio, symbol: 'MSFT', side: 'sell', shares: 2, price: 90, safeSurplus: 500, railsEnabled: true }).ok, false);
  assert.equal(executePaperOrder({ portfolio, symbol: 'MSFT', side: 'sell', shares: 1, price: 0, safeSurplus: 500, railsEnabled: true }).ok, false);
});

test('moving-average paper strategy emits only deterministic crossover observations', () => {
  assert.equal(evaluateMovingAverageCrossover([5, 4, 3, 2, 1, 2, 3, 4], 7, false), 'buy');
  assert.equal(evaluateMovingAverageCrossover([1, 2, 3, 4, 5, 4, 3, 2], 7, true), 'sell');
  assert.equal(evaluateMovingAverageCrossover([1, 2, 3, 4, 5, 6], 5, false), 'buy');
  assert.equal(evaluateMovingAverageCrossover([1, 2, 3, 4], 3, false), 'hold');
  assert.equal(evaluateMovingAverageCrossover([1, 2, Number.NaN, 4, 5, 6], 5, false), 'hold');
});

test('volatility preference changes only bounded paper risk parameters', () => {
  const low = getVolatilityProfile(0);
  const middle = getVolatilityProfile(50);
  const high = getVolatilityProfile(100);
  assert.equal(low.maxPositionPct, 0.08);
  assert.equal(high.maxPositionPct, 0.3);
  assert.ok(low.stopLossPct < middle.stopLossPct);
  assert.ok(middle.stopLossPct < high.stopLossPct);
  assert.equal(low.label, 'Lower');
  assert.equal(high.label, 'Higher');
  assert.equal(getVolatilityProfile(200).tolerance, 100);
  assert.equal(getVolatilityProfile(-5).tolerance, 0);
});

test('a fresh profile starts with zero cash and no scheduled transactions', () => {
  const forecast = buildForecast({ balance: 0, events: [] });
  assert.equal(startingBalance, 0);
  assert.equal(forecast[0].value, 0);
  assert.equal(forecast.at(-1).value, 0);
  assert.equal(getSafeSurplus(forecast, 100).safeSurplus, 0);
});

test('recurring paper buys consume virtual cash and fail closed after surplus is spent', () => {
  const portfolio = { cash: 100, positions: {}, orders: [] };
  const first = executePaperOrder({ portfolio, symbol: 'SPY', side: 'buy', shares: 1, price: 80, safeSurplus: 100, railsEnabled: true });
  assert.equal(first.ok, true);
  assert.equal(first.portfolio.cash, 20);
  const next = executePaperOrder({ portfolio: first.portfolio, symbol: 'SPY', side: 'buy', shares: 1, price: 80, safeSurplus: 0, railsEnabled: true });
  assert.equal(next.ok, false);
  assert.match(next.reason, /safe surplus/);
});
