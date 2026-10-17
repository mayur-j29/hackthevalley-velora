/**
 * Deterministic, local-only market simulation for Velora. The generator and
 * ledger use no network calls; callers can persist exportState() as JSON.
 */
export const SIMULATION_STORAGE_KEY = 'velora-simulation-v1';
export const TRADING_FEE_RATE = 0.001;
export const SLIPPAGE_RATE = 0.001;

export const ASSETS = Object.freeze({
  AAPL: { name: 'Apple', type: 'stock', price: 192, drift: 0.10, volatility: 0.27 },
  NVDA: { name: 'NVIDIA', type: 'stock', price: 138, drift: 0.22, volatility: 0.52 },
  TSLA: { name: 'Tesla', type: 'stock', price: 310, drift: 0.12, volatility: 0.58 },
  MSFT: { name: 'Microsoft', type: 'stock', price: 455, drift: 0.11, volatility: 0.25 },
  AMZN: { name: 'Amazon', type: 'stock', price: 220, drift: 0.13, volatility: 0.32 },
  GOOGL: { name: 'Alphabet', type: 'stock', price: 175, drift: 0.10, volatility: 0.28 },
  SPY: { name: 'S&P 500 ETF', type: 'etf', price: 590, drift: 0.08, volatility: 0.17 },
  QQQ: { name: 'Nasdaq 100 ETF', type: 'etf', price: 515, drift: 0.10, volatility: 0.23 },
  BND: { name: 'Total Bond Market ETF', type: 'etf', price: 72, drift: 0.03, volatility: 0.055 },
  VTI: { name: 'Total US Market ETF', type: 'etf', price: 290, drift: 0.08, volatility: 0.16 },
});

export const REGIMES = Object.freeze({
  bull: { drift: 0.16, volatility: 0.8 },
  bear: { drift: -0.18, volatility: 1.25 },
  crash: { drift: -0.55, volatility: 2.4 },
  sideways: { drift: 0.005, volatility: 0.72 },
});

export const PERSONAS = Object.freeze([
  { id: 'aisha', name: 'Aisha', age: 22, occupation: 'Student', risk: 'aggressive', horizonYears: 40, goal: 'Build long-term wealth', startingCash: 2000, cashBuffer: 0.05 },
  { id: 'marcus', name: 'Marcus', age: 35, occupation: 'Professional', risk: 'balanced', horizonYears: 25, goal: 'Grow wealth while balancing risk', startingCash: 25000, cashBuffer: 0.10 },
  { id: 'elena', name: 'Elena', age: 58, occupation: 'Near retirement', risk: 'conservative', horizonYears: 8, goal: 'Preserve savings for retirement', startingCash: 120000, cashBuffer: 0.20 },
]);

const EVENT_TEMPLATES = [
  { headline: 'NVDA earnings beat expectations', ticker: 'NVDA', impact: 0.08 },
  { headline: 'Tesla deliveries miss estimates', ticker: 'TSLA', impact: -0.07 },
  { headline: 'Fed signals a rate cut', ticker: 'BND', impact: 0.025 },
  { headline: 'Fed rate hike weighs on technology shares', tickers: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'QQQ'], impact: -0.03 },
  { headline: 'Strong jobs report lifts broad markets', tickers: ['SPY', 'VTI', 'AAPL', 'MSFT'], impact: 0.018 },
  { headline: 'Bond yields rise', ticker: 'BND', impact: -0.015 },
  { headline: 'Chip demand outlook improves', ticker: 'NVDA', impact: 0.045 },
  { headline: 'Consumer demand cools', tickers: ['AMZN', 'TSLA'], impact: -0.025 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
const isoDate = date => new Date(date).toISOString().slice(0, 10);

function randomGenerator(seed) {
  let state = (Number(seed) >>> 0) || 1;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  next.getState = () => state;
  next.setState = value => { state = (Number(value) >>> 0) || 1; };
  return next;
}

function normalRandom(random) {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function createAccount(persona, date) {
  return {
    id: persona.id,
    profile: { ...persona },
    cash: persona.startingCash,
    positions: {},
    orders: [],
    history: [{ date: isoDate(date), value: persona.startingCash }],
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createSimulation(options = {}) {
  const random = randomGenerator(options.seed ?? 74219);
  const start = options.currentDate ? new Date(`${options.currentDate}T12:00:00.000Z`) : new Date();
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid simulation date.');
  let date = start;
  let regime = REGIMES[options.regime] ? options.regime : 'sideways';
  let prices = Object.fromEntries(Object.entries(ASSETS).map(([ticker, asset]) => [ticker, asset.price]));
  let marketHistory = Object.fromEntries(Object.keys(ASSETS).map(ticker => [ticker, []]));
  let accounts = Object.fromEntries(PERSONAS.map(persona => [persona.id, createAccount(persona, start)]));
  let events = [];

  function stepMarket(targetDate, record = true) {
    const before = { ...prices };
    const regimeFactor = REGIMES[regime];
    const daily = 1 / 252;
    for (const [ticker, asset] of Object.entries(ASSETS)) {
      const sigma = asset.volatility * regimeFactor.volatility;
      const mu = asset.drift + regimeFactor.drift;
      const shock = normalRandom(random);
      prices[ticker] = Math.max(0.5, prices[ticker] * Math.exp((mu - 0.5 * sigma * sigma) * daily + sigma * Math.sqrt(daily) * shock));
    }

    let event = null;
    if (random() < 0.022) {
      const template = EVENT_TEMPLATES[Math.floor(random() * EVENT_TEMPLATES.length)];
      const affected = template.tickers || [template.ticker];
      for (const ticker of affected) prices[ticker] = Math.max(0.5, prices[ticker] * (1 + template.impact));
      event = { id: `${isoDate(targetDate)}-${random().toString(36).slice(2, 8)}`, date: isoDate(targetDate), headline: template.headline, tickers: affected, impact: template.impact };
      events.push(event);
      events = events.slice(-120);
    }

    if (record) {
      for (const ticker of Object.keys(ASSETS)) {
        const close = prices[ticker];
        const move = close / before[ticker] - 1;
        marketHistory[ticker].push({ date: isoDate(targetDate), close: roundMoney(close), open: roundMoney(before[ticker]), high: roundMoney(Math.max(before[ticker], close) * (1 + Math.abs(move) * 0.2)), low: roundMoney(Math.min(before[ticker], close) * (1 - Math.abs(move) * 0.2)) });
      }
      for (const account of Object.values(accounts)) {
        account.history.push({ date: isoDate(targetDate), value: roundMoney(portfolioValue(account)) });
        account.history = account.history.slice(-730);
      }
    }
    return event;
  }

  function portfolioValue(account) {
    return account.cash + Object.entries(account.positions).reduce((sum, [ticker, position]) => sum + position.quantity * prices[ticker], 0);
  }

  // A reproducible two-year warm-up means a chart can render on the first visit.
  for (let day = 730; day >= 1; day -= 1) {
    const pastDate = new Date(start.getTime() - day * 86400000);
    stepMarket(pastDate, true);
  }
  date = start;
  for (const account of Object.values(accounts)) account.history = Array.from({ length: 730 }, (_, index) => ({ date: isoDate(new Date(start.getTime() - (729 - index) * 86400000)), value: account.profile.startingCash }));
  for (const ticker of Object.keys(ASSETS)) marketHistory[ticker] = marketHistory[ticker].slice(-730);

  function resolveAccount(account) {
    const id = typeof account === 'string' ? account : account?.id;
    if (!accounts[id]) throw new Error('Unknown simulated account.');
    return accounts[id];
  }

  function advanceTime(days = 1) {
    const count = Number(days);
    if (!Number.isInteger(count) || count < 1 || count > 366) throw new Error('Advance must be between 1 and 366 days.');
    for (let day = 0; day < count; day += 1) {
      date = new Date(date.getTime() + 86400000);
      stepMarket(date, true);
    }
    return { date: isoDate(date), prices: getPrices(), events: events.slice(-30) };
  }

  function getPrices() { return { date: isoDate(date), regime, prices: { ...prices } }; }

  function placeOrder(accountRef, ticker, quantity, side) {
    const account = resolveAccount(accountRef);
    const symbol = String(ticker || '').toUpperCase();
    const qty = Number(quantity);
    const direction = String(side || '').toLowerCase();
    if (!ASSETS[symbol]) return { ok: false, reason: 'Ticker is not in the simulated market.' };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Quantity must be greater than zero.' };
    if (!['buy', 'sell'].includes(direction)) return { ok: false, reason: 'Side must be buy or sell.' };
    const marketPrice = prices[symbol];
    const fillPrice = marketPrice * (direction === 'buy' ? 1 + SLIPPAGE_RATE : 1 - SLIPPAGE_RATE);
    const notional = qty * fillPrice;
    const fee = notional * TRADING_FEE_RATE;
    if (direction === 'buy') {
      const total = notional + fee;
      if (total > account.cash + 1e-8) return { ok: false, reason: `Insufficient simulated cash; this order needs $${roundMoney(total)}.` };
      const existing = account.positions[symbol] || { quantity: 0, averageCost: 0 };
      const nextQuantity = existing.quantity + qty;
      account.positions[symbol] = { quantity: nextQuantity, averageCost: roundMoney((existing.quantity * existing.averageCost + total) / nextQuantity) };
      account.cash = roundMoney(account.cash - total);
    } else {
      const existing = account.positions[symbol];
      if (!existing || qty > existing.quantity + 1e-8) return { ok: false, reason: 'Cannot sell more shares than this account holds.' };
      account.cash = roundMoney(account.cash + notional - fee);
      const remaining = Math.max(0, existing.quantity - qty);
      if (remaining < 1e-8) delete account.positions[symbol];
      else existing.quantity = remaining;
    }
    const order = { id: `${account.id}-${Date.now()}-${account.orders.length}`, date: isoDate(date), ticker: symbol, quantity: qty, side: direction, price: roundMoney(fillPrice), fee: roundMoney(fee), slippageRate: SLIPPAGE_RATE, status: 'executed' };
    account.orders.unshift(order);
    account.history[account.history.length - 1] = { date: isoDate(date), value: roundMoney(portfolioValue(account)) };
    return { ok: true, order: clone(order), portfolio: getPortfolio(account.id) };
  }

  function getPortfolio(accountRef) {
    const account = resolveAccount(accountRef);
    const holdings = Object.entries(account.positions).map(([ticker, position]) => ({ ticker, name: ASSETS[ticker].name, type: ASSETS[ticker].type, quantity: position.quantity, averageCost: position.averageCost, price: prices[ticker], marketValue: roundMoney(position.quantity * prices[ticker]), unrealizedPnl: roundMoney(position.quantity * (prices[ticker] - position.averageCost)) }));
    const equity = roundMoney(holdings.reduce((sum, item) => sum + item.marketValue, 0));
    return { accountId: account.id, profile: { ...account.profile }, cash: roundMoney(account.cash), holdings, equity, netWorth: roundMoney(account.cash + equity), orders: clone(account.orders.slice(0, 100)) };
  }

  function getHistory(accountRef) {
    const account = resolveAccount(accountRef);
    return { portfolio: clone(account.history), market: Object.fromEntries(Object.entries(marketHistory).map(([ticker, rows]) => [ticker, clone(rows)])) };
  }

  function setRegime(next) {
    if (!REGIMES[next]) throw new Error('Unknown market regime.');
    regime = next;
    return getPrices();
  }

  function setDemoCrash() {
    regime = 'crash';
    const snapshot = { date: isoDate(date), regime, prices: { ...prices } };
    for (const ticker of ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'SPY', 'QQQ', 'VTI']) prices[ticker] = roundMoney(prices[ticker] * (ticker === 'TSLA' || ticker === 'NVDA' ? 0.82 : 0.88));
    for (const ticker of Object.keys(ASSETS)) {
      const close = prices[ticker];
      const open = snapshot.prices[ticker];
      marketHistory[ticker].push({ date: isoDate(date), close: roundMoney(close), open: roundMoney(open), high: roundMoney(Math.max(open, close)), low: roundMoney(Math.min(open, close)) });
      marketHistory[ticker] = marketHistory[ticker].slice(-730);
    }
    for (const account of Object.values(accounts)) {
      const latest = account.history.at(-1);
      if (latest?.date === isoDate(date)) latest.value = roundMoney(portfolioValue(account));
      else account.history.push({ date: isoDate(date), value: roundMoney(portfolioValue(account)) });
    }
    const crashEvent = { id: `demo-crash-${isoDate(date)}`, date: isoDate(date), headline: 'Demo scenario: a sudden market crash sends growth shares lower', tickers: Object.keys(ASSETS).filter(ticker => ticker !== 'BND'), impact: -0.12 };
    events.push(crashEvent);
    return { before: snapshot, after: getPrices(), event: clone(crashEvent) };
  }

  function exportState() {
    return { version: 1, seed: random.getState(), date: isoDate(date), regime, prices: { ...prices }, marketHistory: clone(marketHistory), accounts: clone(accounts), events: clone(events) };
  }

  function importState(saved) {
    if (!saved || saved.version !== 1 || !REGIMES[saved.regime] || !saved.accounts || !saved.prices) throw new Error('Saved simulation state is invalid.');
    for (const ticker of Object.keys(ASSETS)) {
      if (!Number.isFinite(saved.prices[ticker]) || !Array.isArray(saved.marketHistory?.[ticker])) throw new Error('Saved market data is invalid.');
    }
    const restoredDate = new Date(`${saved.date}T12:00:00.000Z`);
    if (!Number.isFinite(restoredDate.getTime())) throw new Error('Saved simulation date is invalid.');
    random.setState(saved.seed);
    date = restoredDate;
    regime = saved.regime;
    prices = { ...saved.prices };
    marketHistory = clone(saved.marketHistory);
    accounts = clone(saved.accounts);
    events = Array.isArray(saved.events) ? clone(saved.events).slice(-120) : [];
  }

  function reset(resetOptions = {}) {
    return createSimulation({ seed: resetOptions.seed ?? options.seed ?? 74219, currentDate: resetOptions.currentDate ?? options.currentDate, regime: resetOptions.regime ?? 'sideways' });
  }

  return { advanceTime, getPrices, getPortfolio, getHistory, placeOrder, setRegime, setDemoCrash, exportState, importState, reset, getEvents: () => clone(events), getDate: () => isoDate(date), getAccounts: () => Object.values(accounts).map(account => ({ ...account.profile })) };
}

export function loadSimulation(storage = globalThis.localStorage) {
  if (storage) {
    try {
      const raw = storage.getItem(SIMULATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const simulation = createSimulation({ seed: saved.seed, currentDate: saved.date, regime: saved.regime });
        simulation.importState(saved);
        return simulation;
      }
    } catch { /* Reset corrupted demo state to a clean seeded simulation. */ }
  }
  return createSimulation();
}

export function saveSimulation(simulation, storage = globalThis.localStorage) {
  if (!storage) return false;
  try { storage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify(simulation.exportState())); return true; }
  catch { return false; }
}
