import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, PERSONAS, REGIMES, buildBenchmarkSeries, createSimulation, loadSimulation, saveSimulation } from './simulation.ts';

test('seeded simulation creates a full market and two years of price history', () => {
  const first = createSimulation({ seed: 12345, currentDate: '2026-10-17' });
  const second = createSimulation({ seed: 12345, currentDate: '2026-10-17' });
  assert.deepEqual(first.getPrices(), second.getPrices());
  assert.equal(Object.keys(ASSETS).length, 10);
  assert.equal(first.getHistory('aisha').market.SPY.length, 730);
  assert.equal(first.getHistory('aisha').portfolio.length, 730);
  assert.equal(first.getDate(), '2026-10-17');
});

test('all three demo accounts have the requested profiles and starting balances', () => {
  const simulation = createSimulation({ seed: 5, currentDate: '2026-10-17' });
  assert.deepEqual(simulation.getAccounts().map(person => person.id), PERSONAS.map(person => person.id));
  assert.equal(simulation.getPortfolio('aisha').netWorth, 2000);
  assert.equal(simulation.getPortfolio('marcus').netWorth, 25000);
  assert.equal(simulation.getPortfolio('elena').netWorth, 120000);
});

test('order execution charges simulated fees and slippage and enforces cash and share checks', () => {
  const simulation = createSimulation({ seed: 19, currentDate: '2026-10-17' });
  const quote = simulation.getPrices().prices.AAPL;
  const bought = simulation.placeOrder('aisha', 'AAPL', 1, 'buy');
  assert.equal(bought.ok, true);
  assert.ok(bought.order.price > quote);
  assert.ok(bought.order.fee > 0);
  assert.equal(simulation.placeOrder('aisha', 'NVDA', 1e9, 'buy').ok, false);
  assert.equal(simulation.placeOrder('aisha', 'AAPL', 2, 'sell').ok, false);
  const sold = simulation.placeOrder('aisha', 'AAPL', 1, 'sell');
  assert.equal(sold.ok, true);
  assert.ok(sold.order.price < simulation.getPrices().prices.AAPL);
  assert.equal(simulation.getPortfolio('aisha').holdings.length, 0);
});

test('time advances deterministically and market regimes are switchable', () => {
  const left = createSimulation({ seed: 88, currentDate: '2026-10-17' });
  const right = createSimulation({ seed: 88, currentDate: '2026-10-17' });
  assert.deepEqual(left.advanceTime(7), right.advanceTime(7));
  assert.equal(left.getDate(), '2026-10-24');
  for (const regime of Object.keys(REGIMES)) assert.equal(left.setRegime(regime).regime, regime);
  assert.throws(() => left.setRegime('moon'));
  assert.throws(() => left.advanceTime(0));
});

test('state round trips and local persistence survives reload', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const simulation = createSimulation({ seed: 42, currentDate: '2026-10-17' });
  simulation.placeOrder('marcus', 'SPY', 2, 'buy');
  simulation.setTradingMode('marcus', 'auto');
  const proposal = simulation.addDecision('marcus', { actionType: 'buy', ticker: 'BND', amountUsd: 100, reason: 'Diversify the simulated portfolio.', status: 'pending' });
  simulation.advanceTime(1);
  assert.equal(saveSimulation(simulation, storage), true);
  const restored = loadSimulation(storage);
  assert.deepEqual(restored.getPrices(), simulation.getPrices());
  assert.deepEqual(restored.getPortfolio('marcus'), simulation.getPortfolio('marcus'));
  assert.equal(restored.getActivity('marcus').mode, 'auto');
  assert.deepEqual(restored.getActivity('marcus').pendingApprovals, [proposal.id]);
  const fresh = simulation.reset({ currentDate: '2026-10-17' });
  assert.equal(fresh.getPortfolio('marcus').netWorth, 25000);
  assert.deepEqual(fresh.getPrices(), createSimulation({ seed: 42, currentDate: '2026-10-17' }).getPrices());
});

test('demo crash immediately shows a market drop while bonds remain defensive', () => {
  const simulation = createSimulation({ seed: 11, currentDate: '2026-10-17' });
  const before = simulation.getPrices().prices;
  const result = simulation.setDemoCrash();
  assert.equal(result.after.regime, 'crash');
  assert.ok(result.after.prices.SPY < before.SPY);
  assert.equal(result.after.prices.BND, before.BND);
  assert.match(result.event.headline, /Demo scenario/);
});

test('benchmark series compares managed value, same-path SPY buy-and-hold, and cash', () => {
  const series = buildBenchmarkSeries({ startingCapital: 1000, portfolioHistory: [{ date: '2026-01-01', value: 1000 }, { date: '2026-01-02', value: 1050 }], spyHistory: [{ date: '2026-01-01', close: 100 }, { date: '2026-01-02', close: 110 }] });
  assert.deepEqual(series, [{ date: '2026-01-01', managed: 1000, spy: 1000, cash: 1000 }, { date: '2026-01-02', managed: 1050, spy: 1100, cash: 1000 }]);
});
