import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, evaluateSimulatedTrade, getSafeSurplus, simulateAutoInvest, startingBalance } from './finance.js';

test('forecast includes all scheduled cash events and preserves its start balance', () => {
  const forecast = buildForecast({ days: 30 });
  assert.equal(forecast.length, 31);
  assert.equal(forecast[0].value, startingBalance);
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
  const forecast = buildForecast({ days: 30 });
  const result = simulateAutoInvest({ forecast, amount: 250, cadence: 7, floor: 300 });
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
