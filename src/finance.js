export const startingBalance = 0;
export const essentialReserve = 1200;

export const scheduledEvents = [];
const startDate = new Date();
startDate.setHours(0, 0, 0, 0);

export function buildForecast({ purchase = 0, cancelled = [], days = 30, balance: accountBalance = startingBalance, events = scheduledEvents } = {}) {
  let balance = accountBalance - purchase;
  return Array.from({ length: days + 1 }, (_, day) => {
    const dayEvents = events.filter(event => event.day === day && !cancelled.includes(event.subscription));
    dayEvents.forEach(event => { balance += event.amount; });
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    return { day, date, value: balance, events: dayEvents };
  });
}

export function calculateDebtPayoff({ balance, apr, payment, extraPayment = 0 }) {
  let remaining = Number(balance);
  const annualRate = Number(apr);
  const monthlyPayment = Number(payment) + Number(extraPayment);
  if (!Number.isFinite(remaining) || remaining < 0 || !Number.isFinite(annualRate) || annualRate < 0 || !Number.isFinite(monthlyPayment) || monthlyPayment < 0) return { valid: false, months: null, totalInterest: null, firstMonthInterest: null, reason: 'Enter a valid balance, APR, and non-negative payment.' };
  if (remaining === 0) return { valid: true, months: 0, totalInterest: 0, firstMonthInterest: 0, reason: 'This balance is already paid off.' };
  if (monthlyPayment <= 0) return { valid: false, months: null, totalInterest: null, firstMonthInterest: null, reason: 'Enter a positive monthly payment for an active balance.' };

  const monthlyRate = annualRate / 1200;
  const firstMonthInterest = remaining * monthlyRate;
  if (monthlyPayment <= firstMonthInterest) {
    return { valid: false, months: null, totalInterest: null, firstMonthInterest, reason: 'Payment does not cover the first month of interest.' };
  }

  let totalInterest = 0;
  let months = 0;
  while (remaining > 0 && months < 1200) {
    const interest = remaining * monthlyRate;
    totalInterest += interest;
    remaining = Math.max(0, remaining + interest - monthlyPayment);
    months += 1;
  }
  if (remaining > 0) return { valid: false, months: null, totalInterest: null, firstMonthInterest, reason: 'This payment schedule exceeds the 100-year simulation limit.' };
  return { valid: true, months, totalInterest, firstMonthInterest, reason: 'Estimate assumes a fixed APR and payment with monthly compounding.' };
}

export function simulateHistoricalInvestment({ amount, safeSurplus, railsEnabled, points }) {
  const value = Number(amount);
  if (!railsEnabled) return { verdict: 'blocked', reason: 'Turn safety rails on to simulate an investment. Rails-off mode never approves a paper trade.' };
  if (!Number.isFinite(value) || value <= 0) return { verdict: 'blocked', reason: 'Enter a paper amount greater than $0.' };
  if (!Number.isFinite(safeSurplus) || safeSurplus < 0 || value > safeSurplus) {
    return { verdict: 'blocked', reason: `Amount must fit within the current safe surplus of $${Math.max(0, Number(safeSurplus) || 0).toLocaleString()}.` };
  }
  if (!Array.isArray(points) || points.length < 2) return { verdict: 'unavailable', reason: 'Load at least two historical adjusted closing prices first.' };

  const validPoints = points.filter(point => Number.isFinite(Number(point.close)) && Number(point.close) > 0);
  if (validPoints.length < 2) return { verdict: 'unavailable', reason: 'The selected history contains too few valid prices.' };
  const first = validPoints[0];
  const last = validPoints.at(-1);
  const shares = value / Number(first.close);
  const endingValue = shares * Number(last.close);
  let peak = value;
  let maxDrawdown = 0;
  const equityCurve = validPoints.map(point => {
    const equity = shares * Number(point.close);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
    return { date: point.date, value: equity };
  });
  return {
    verdict: 'pass',
    reason: 'This hypothetical historical replay fits within current projected safe surplus.',
    invested: value,
    shares,
    startingPrice: Number(first.close),
    endingPrice: Number(last.close),
    endingValue,
    profitLoss: endingValue - value,
    returnPct: (endingValue / value - 1) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    startDate: first.date.slice(0, 10),
    endDate: last.date.slice(0, 10),
    equityCurve,
  };
}

export function executePaperOrder({ portfolio, symbol, side, shares, price, safeSurplus, railsEnabled }) {
  if (!railsEnabled) return { ok: false, reason: 'Safety rails are off. Turn them on before placing a paper order.' };
  const quantity = Number(shares);
  const unitPrice = Number(price);
  if (!['SPY', 'AAPL', 'MSFT', 'TSLA'].includes(symbol)) return { ok: false, reason: 'Choose a supported paper asset.' };
  if (!['buy', 'sell'].includes(side)) return { ok: false, reason: 'Choose buy or sell.' };
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return { ok: false, reason: 'Enter a valid positive share quantity.' };
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: false, reason: 'A current market quote is required.' };
  const amount = quantity * unitPrice;
  const cash = Number(portfolio?.cash);
  if (!Number.isFinite(cash) || cash < 0) return { ok: false, reason: 'The paper account cash balance is invalid.' };

  const existing = portfolio.positions?.[symbol] || { shares: 0, averageCost: 0 };
  const ownedShares = Number(existing.shares) || 0;
  let nextCash = cash;
  let nextShares = ownedShares;
  let nextAverageCost = Number(existing.averageCost) || 0;
  if (side === 'buy') {
    if (!Number.isFinite(safeSurplus) || amount > safeSurplus) return { ok: false, reason: `Purchase exceeds the current safe surplus of $${Math.max(0, Number(safeSurplus) || 0).toLocaleString()}.` };
    if (amount > cash) return { ok: false, reason: `Purchase exceeds paper-account cash of $${cash.toLocaleString()}.` };
    nextAverageCost = ((ownedShares * nextAverageCost) + amount) / (ownedShares + quantity);
    nextShares += quantity;
    nextCash -= amount;
  } else {
    if (quantity > ownedShares) return { ok: false, reason: `You can only sell the ${ownedShares} shares currently in this paper portfolio.` };
    nextShares -= quantity;
    nextCash += amount;
    if (nextShares === 0) nextAverageCost = 0;
  }

  const order = {
    id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    side,
    shares: quantity,
    price: unitPrice,
    amount,
    createdAt: new Date().toISOString(),
  };
  return {
    ok: true,
    order,
    portfolio: {
      cash: Number(nextCash.toFixed(2)),
      positions: {
        ...portfolio.positions,
        [symbol]: { shares: Number(nextShares.toFixed(8)), averageCost: Number(nextAverageCost.toFixed(4)) },
      },
      orders: [order, ...(portfolio.orders || [])].slice(0, 50),
    },
  };
}

export function evaluateMovingAverageCrossover(prices, index, hasPosition, fastWindow = 3, slowWindow = 5) {
  if (!Array.isArray(prices) || !Number.isInteger(index) || index < slowWindow || fastWindow < 1 || slowWindow <= fastWindow) return 'hold';
  const valid = prices.slice(0, index + 1).map(Number);
  if (valid.some(price => !Number.isFinite(price) || price <= 0)) return 'hold';
  const averageAt = (end, size) => valid.slice(end - size + 1, end + 1).reduce((sum, price) => sum + price, 0) / size;
  const previousFast = averageAt(index - 1, fastWindow);
  const previousSlow = averageAt(index - 1, slowWindow);
  const currentFast = averageAt(index, fastWindow);
  const currentSlow = averageAt(index, slowWindow);
  if (!hasPosition && currentFast > currentSlow && (previousFast <= previousSlow || index === slowWindow)) return 'buy';
  if (hasPosition && previousFast >= previousSlow && currentFast < currentSlow) return 'sell';
  return 'hold';
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
