export const startingBalance = 4820.46;
export const essentialReserve = 1200;

export const scheduledEvents = [
  { day: 2, title: 'Phone bill', amount: -68, kind: 'bill' },
  { day: 5, title: 'Spotify', amount: -12.99, kind: 'bill', subscription: 'Spotify' },
  { day: 8, title: 'Payday', amount: 2450, kind: 'income' },
  { day: 12, title: 'Groceries', amount: -126, kind: 'bill' },
  { day: 16, title: 'Internet', amount: -74, kind: 'bill' },
  { day: 20, title: 'GoodLife Fitness', amount: -39.99, kind: 'bill', subscription: 'GoodLife Fitness' },
  { day: 22, title: 'Netflix', amount: -16.99, kind: 'bill', subscription: 'Netflix' },
  { day: 23, title: 'Payday', amount: 2450, kind: 'income' },
  { day: 26, title: 'Rent', amount: -1850, kind: 'bill' },
  { day: 29, title: 'Car insurance', amount: -142, kind: 'bill' },
];
const startDate = new Date();
startDate.setHours(0, 0, 0, 0);

export function buildForecast({ purchase = 0, cancelled = [], days = 30, balance: accountBalance = startingBalance } = {}) {
  let balance = accountBalance - purchase;
  return Array.from({ length: days + 1 }, (_, day) => {
    const events = scheduledEvents.filter(event => event.day === day && !cancelled.includes(event.subscription));
    events.forEach(event => { balance += event.amount; });
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    return { day, date, value: balance, events };
  });
}

export function getSafeSurplus(forecast, reserve = essentialReserve) {
  const lowestBalance = Math.min(...forecast.map(point => point.value));
  return { lowestBalance, safeSurplus: Math.max(0, Math.floor(lowestBalance - reserve)) };
}

// This deterministic rules check owns the PASS/BLOCK decision. Explanatory copy
// can be generated separately; it must never change the verdict.
export function evaluateSimulatedTrade({ amount, safeSurplus, railsEnabled }) {
  const value = Number(amount);
  const availableSurplus = Number(safeSurplus);
  if (!Number.isFinite(value) || value <= 0) {
    return { verdict: 'blocked', reason: 'Enter an amount greater than $0.' };
  }
  if (!railsEnabled) {
    return { verdict: 'blocked', reason: 'Safety rails are off. Turn them on before running any investment simulation.' };
  }
  if (!Number.isFinite(availableSurplus) || availableSurplus < 0) {
    return { verdict: 'blocked', reason: 'The forecast surplus is unavailable. Refresh the forecast and try again.' };
  }
  if (value > availableSurplus) {
    return { verdict: 'blocked', reason: `The order exceeds the $${availableSurplus.toLocaleString()} safe surplus.` };
  }
  return { verdict: 'pass', reason: 'The order fits within the projected safe surplus.' };
}

/**
 * Simulate recurring contributions against every remaining forecast day.
 * This function is deterministic and intentionally independent from AI text.
 */
export function simulateAutoInvest({ forecast, amount, cadence = 7, reserve = essentialReserve, floor = 0, railsEnabled = true }) {
  const contribution = Number(amount);
  const interval = Number(cadence);
  if (!Number.isFinite(contribution) || contribution <= 0 || !Number.isInteger(interval) || interval < 1) {
    return { executions: [], blocked: [], total: 0, endingBalance: forecast.at(-1)?.value ?? startingBalance, reason: 'Choose a contribution and schedule to simulate.' };
  }

  if (!railsEnabled) {
    return {
      executions: [],
      blocked: Array.from({ length: Math.floor((forecast.length - 1) / interval) }, (_, index) => {
        const day = (index + 1) * interval;
        return { day, date: forecast[day]?.date, amount: contribution, safeNow: 0 };
      }),
      total: 0,
      endingBalance: forecast.at(-1)?.value ?? startingBalance,
      lowestBalance: Math.min(...forecast.map(point => point.value)),
      reason: 'Safety rails are off; every simulated contribution is blocked.',
    };
  }

  const projected = forecast.map(point => ({ ...point, value: point.value }));
  const executions = [];
  const blocked = [];
  for (let day = interval; day < projected.length; day += interval) {
    const currentBalance = projected[day].value;
    const lowestAfter = Math.min(...projected.slice(day).map(point => point.value));
    const safeNow = Math.floor(Math.min(currentBalance - floor, lowestAfter - reserve - floor));
    const allowed = contribution <= Math.max(0, safeNow);
    if (allowed) {
      executions.push({ day, date: projected[day].date, amount: contribution });
      for (let i = day; i < projected.length; i += 1) projected[i].value -= contribution;
    } else {
      blocked.push({ day, date: projected[day].date, amount: contribution, safeNow: Math.max(0, safeNow) });
    }
  }

  return {
    executions,
    blocked,
    total: executions.length * contribution,
    endingBalance: projected.at(-1)?.value ?? startingBalance,
    lowestBalance: Math.min(...projected.map(point => point.value)),
    reason: railsEnabled ? 'Each contribution is checked against the remaining forecast and protected reserve.' : 'Safety rails are off; contributions may overlap planned essentials.',
  };
}

export const crashScenarios = {
  '2008-style': { drawdown: 0.55, label: '2008-style downturn' },
  '2020-style': { drawdown: 0.34, label: '2020-style downturn' },
};
