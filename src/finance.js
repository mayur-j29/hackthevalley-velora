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

export function buildForecast({ purchase = 0, cancelled = [], days = 30 } = {}) {
  let balance = startingBalance - purchase;
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
  if (!Number.isFinite(value) || value <= 0) {
    return { verdict: 'blocked', reason: 'Enter an amount greater than $0.' };
  }
  if (!railsEnabled) {
    return { verdict: 'pass', unguarded: true, reason: 'Safety rails are off. The simulation may overlap planned essentials.' };
  }
  if (value > safeSurplus) {
    return { verdict: 'blocked', reason: `The order exceeds the $${safeSurplus.toLocaleString()} safe surplus.` };
  }
  return { verdict: 'pass', reason: 'The order fits within the projected safe surplus.' };
}

export const crashScenarios = {
  '2008-style': { drawdown: 0.55, label: '2008-style downturn' },
  '2020-style': { drawdown: 0.34, label: '2020-style downturn' },
};
