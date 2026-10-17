/**
 * Deterministic, local-only market simulation for Velora. The generator and
 * ledger use no network calls; callers can persist exportState() as JSON.
 */
export const SIMULATION_STORAGE_KEY = 'velora-simulation-v1';
export const TRADING_FEE_RATE = 0.001;
export const SLIPPAGE_RATE = 0.001;

export type AssetType = 'stock' | 'etf';
export type RiskProfile = 'aggressive' | 'balanced' | 'conservative';
export type MarketRegime = 'bull' | 'bear' | 'crash' | 'sideways';
export type OrderSide = 'buy' | 'sell';
export type TradingMode = 'approve' | 'auto';

export interface Asset { name: string; type: AssetType; price: number; drift: number; volatility: number }
export interface Persona { id: string; name: string; age: number; occupation: string; risk: RiskProfile; horizonYears: number; goal: string; startingCash: number; cashBuffer: number }
export interface PriceBar { date: string; open: number; high: number; low: number; close: number }
export interface MarketEvent { id: string; date: string; headline: string; tickers: string[]; impact: number }
export interface Holding { quantity: number; averageCost: number }
export interface SimulatedOrder { id: string; date: string; ticker: string; quantity: number; side: OrderSide; price: number; fee: number; slippageRate: number; status: 'executed' }
export interface DecisionRecord { id: string; status: 'executed' | 'pending' | 'blocked' | 'rejected'; [key: string]: unknown }
export interface SimulationAccount { id: string; profile: Persona; cash: number; positions: Record<string, Holding>; orders: SimulatedOrder[]; decisions: DecisionRecord[]; pendingApprovals: string[]; tradingMode: TradingMode; history: Array<{ date: string; value: number }> }
export interface SimulationOptions { seed?: number; initialSeed?: number; currentDate?: string; regime?: MarketRegime }
export interface SimulationPrices { date: string; regime: MarketRegime; prices: Record<string, number> }
export interface PortfolioSnapshot { accountId: string; profile: Persona; cash: number; holdings: Array<{ ticker: string; name: string; type: AssetType; quantity: number; averageCost: number; price: number; marketValue: number; unrealizedPnl: number }>; equity: number; netWorth: number; orders: SimulatedOrder[] }
export interface AgentDecisionInput { id?: string; status: DecisionRecord['status']; createdAt?: string; [key: string]: unknown }
export interface SerializedSimulation { version: 1; seed: number; initialSeed?: number; date: string; regime: MarketRegime; prices: Record<string, number>; marketHistory: Record<string, PriceBar[]>; accounts: Record<string, SimulationAccount>; events: MarketEvent[] }
export interface BenchmarkPoint { date: string; managed: number; spy: number; cash: number }
export interface SimulationStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface Simulation {
  advanceTime(days?: number): { date: string; prices: SimulationPrices; events: MarketEvent[] };
  getPrices(): SimulationPrices;
  getPortfolio(account: string | { id: string }): PortfolioSnapshot;
  getHistory(account: string | { id: string }): { portfolio: Array<{ date: string; value: number }>; market: Record<string, PriceBar[]> };
  getActivity(account: string | { id: string }): { mode: TradingMode; decisions: DecisionRecord[]; pendingApprovals: string[] };
  setTradingMode(account: string | { id: string }, mode: TradingMode): { mode: TradingMode; decisions: DecisionRecord[]; pendingApprovals: string[] };
  addDecision(account: string | { id: string }, decision: AgentDecisionInput): DecisionRecord;
  updateDecision(account: string | { id: string }, id: string, patch: Partial<DecisionRecord>): { mode: TradingMode; decisions: DecisionRecord[]; pendingApprovals: string[] };
  placeOrder(account: string | { id: string }, ticker: string, quantity: number, side: OrderSide): { ok: true; order: SimulatedOrder; portfolio: PortfolioSnapshot } | { ok: false; reason: string };
  setRegime(regime: MarketRegime): SimulationPrices;
  setDemoCrash(): { before: SimulationPrices; after: SimulationPrices; event: MarketEvent };
  exportState(): SerializedSimulation;
  importState(state: SerializedSimulation): void;
  reset(options?: SimulationOptions): Simulation;
  getEvents(): MarketEvent[];
  getDate(): string;
  getAccounts(): Persona[];
  ensureAccount(persona: Persona): boolean;
}

export const ASSETS: Readonly<Record<string, Asset>> = Object.freeze({
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

export const REGIMES: Readonly<Record<MarketRegime, { drift: number; volatility: number }>> = Object.freeze({
  bull: { drift: 0.16, volatility: 0.8 },
  bear: { drift: -0.18, volatility: 1.25 },
  crash: { drift: -0.55, volatility: 2.4 },
  sideways: { drift: 0.005, volatility: 0.72 },
});

export const PERSONAS: readonly Persona[] = Object.freeze([
  { id: 'aisha', name: 'Aisha', age: 22, occupation: 'Student', risk: 'aggressive', horizonYears: 40, goal: 'Build long-term wealth', startingCash: 2000, cashBuffer: 0.05 },
  { id: 'marcus', name: 'Marcus', age: 35, occupation: 'Professional', risk: 'balanced', horizonYears: 25, goal: 'Grow wealth while balancing risk', startingCash: 25000, cashBuffer: 0.10 },
  { id: 'elena', name: 'Elena', age: 58, occupation: 'Near retirement', risk: 'conservative', horizonYears: 8, goal: 'Preserve savings for retirement', startingCash: 120000, cashBuffer: 0.20 },
]);

const EVENT_TEMPLATES: Array<{ headline: string; ticker?: string; tickers?: string[]; impact: number }> = [
  { headline: 'NVDA earnings beat expectations', ticker: 'NVDA', impact: 0.08 },
  { headline: 'Tesla deliveries miss estimates', ticker: 'TSLA', impact: -0.07 },
  { headline: 'Fed signals a rate cut', ticker: 'BND', impact: 0.025 },
  { headline: 'Fed rate hike weighs on technology shares', tickers: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'QQQ'], impact: -0.03 },
  { headline: 'Strong jobs report lifts broad markets', tickers: ['SPY', 'VTI', 'AAPL', 'MSFT'], impact: 0.018 },
  { headline: 'Bond yields rise', ticker: 'BND', impact: -0.015 },
  { headline: 'Chip demand outlook improves', ticker: 'NVDA', impact: 0.045 },
  { headline: 'Consumer demand cools', tickers: ['AMZN', 'TSLA'], impact: -0.025 },
];

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const isoDate = (date: Date | string | number): string => new Date(date).toISOString().slice(0, 10);

interface RandomSource { (): number; getState(): number; setState(value: number): void }

function randomGenerator(seed: number): RandomSource {
  let state = (Number(seed) >>> 0) || 1;
  const next = (() => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  }) as RandomSource;
  next.getState = () => state;
  next.setState = (value: number) => { state = (Number(value) >>> 0) || 1; };
  return next;
}

function normalRandom(random: () => number): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function createAccount(persona: Persona, date: Date): SimulationAccount {
  return {
    id: persona.id,
    profile: { ...persona },
    cash: persona.startingCash,
    positions: {},
    orders: [],
    decisions: [],
    pendingApprovals: [],
    tradingMode: 'approve',
    history: [{ date: isoDate(date), value: persona.startingCash }],
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const initialSeed = options.initialSeed ?? options.seed ?? 74219;
  const random = randomGenerator(options.seed ?? initialSeed);
  const start = options.currentDate ? new Date(`${options.currentDate}T12:00:00.000Z`) : new Date();
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid simulation date.');
  let date = start;
  let regime: MarketRegime = options.regime && options.regime in REGIMES ? options.regime : 'sideways';
  let prices: Record<string, number> = Object.fromEntries(Object.entries(ASSETS).map(([ticker, asset]) => [ticker, asset.price]));
  let marketHistory: Record<string, PriceBar[]> = Object.fromEntries(Object.keys(ASSETS).map(ticker => [ticker, []]));
  let accounts: Record<string, SimulationAccount> = Object.fromEntries(PERSONAS.map(persona => [persona.id, createAccount(persona, start)]));
  let events: MarketEvent[] = [];

  function stepMarket(targetDate: Date, record = true): MarketEvent | null {
    const before = { ...prices };
    const regimeFactor = REGIMES[regime];
    const daily = 1 / 252;
    for (const [ticker, asset] of Object.entries(ASSETS)) {
      const sigma = asset.volatility * regimeFactor.volatility;
      const mu = asset.drift + regimeFactor.drift;
      const shock = normalRandom(random);
      prices[ticker] = Math.max(0.5, prices[ticker] * Math.exp((mu - 0.5 * sigma * sigma) * daily + sigma * Math.sqrt(daily) * shock));
    }

    let event: MarketEvent | null = null;
    if (random() < 0.022) {
      const template = EVENT_TEMPLATES[Math.floor(random() * EVENT_TEMPLATES.length)];
      const affected: string[] = template.tickers || (template.ticker ? [template.ticker] : []);
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

  function portfolioValue(account: SimulationAccount): number {
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

  function resolveAccount(account: string | { id: string }): SimulationAccount {
    const id = typeof account === 'string' ? account : account?.id;
    if (!accounts[id]) throw new Error('Unknown simulated account.');
    return accounts[id];
  }

  function ensureAccount(persona: Persona): boolean {
    if (!persona?.id || accounts[persona.id]) return false;
    const startingCash = Number(persona.startingCash);
    if (!Number.isFinite(startingCash) || startingCash < 0) throw new Error('The account starting balance is invalid.');
    accounts[persona.id] = createAccount({ ...persona, startingCash }, date);
    return true;
  }

  function advanceTime(days = 1): { date: string; prices: SimulationPrices; events: MarketEvent[] } {
    const count = Number(days);
    if (!Number.isInteger(count) || count < 1 || count > 366) throw new Error('Advance must be between 1 and 366 days.');
    for (let day = 0; day < count; day += 1) {
      date = new Date(date.getTime() + 86400000);
      stepMarket(date, true);
    }
    return { date: isoDate(date), prices: getPrices(), events: events.slice(-30) };
  }

  function getPrices(): SimulationPrices { return { date: isoDate(date), regime, prices: { ...prices } }; }

  function placeOrder(accountRef: string | { id: string }, ticker: string, quantity: number, side: OrderSide): { ok: true; order: SimulatedOrder; portfolio: PortfolioSnapshot } | { ok: false; reason: string } {
    const account = resolveAccount(accountRef);
    const symbol = String(ticker || '').toUpperCase();
    const qty = Number(quantity);
    const direction = String(side || '').toLowerCase() as OrderSide;
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
    const order: SimulatedOrder = { id: `${account.id}-${Date.now()}-${account.orders.length}`, date: isoDate(date), ticker: symbol, quantity: qty, side: direction, price: roundMoney(fillPrice), fee: roundMoney(fee), slippageRate: SLIPPAGE_RATE, status: 'executed' };
    account.orders.unshift(order);
    account.history[account.history.length - 1] = { date: isoDate(date), value: roundMoney(portfolioValue(account)) };
    return { ok: true, order: clone(order), portfolio: getPortfolio(account.id) };
  }

  function getPortfolio(accountRef: string | { id: string }): PortfolioSnapshot {
    const account = resolveAccount(accountRef);
    const holdings = Object.entries(account.positions).map(([ticker, position]) => ({ ticker, name: ASSETS[ticker].name, type: ASSETS[ticker].type, quantity: position.quantity, averageCost: position.averageCost, price: prices[ticker], marketValue: roundMoney(position.quantity * prices[ticker]), unrealizedPnl: roundMoney(position.quantity * (prices[ticker] - position.averageCost)) }));
    const equity = roundMoney(holdings.reduce((sum, item) => sum + item.marketValue, 0));
    return { accountId: account.id, profile: { ...account.profile }, cash: roundMoney(account.cash), holdings, equity, netWorth: roundMoney(account.cash + equity), orders: clone(account.orders.slice(0, 100)) };
  }

  function getHistory(accountRef: string | { id: string }): { portfolio: Array<{ date: string; value: number }>; market: Record<string, PriceBar[]> } {
    const account = resolveAccount(accountRef);
    return { portfolio: clone(account.history), market: Object.fromEntries(Object.entries(marketHistory).map(([ticker, rows]) => [ticker, clone(rows)])) };
  }

  function getActivity(accountRef: string | { id: string }): { mode: TradingMode; decisions: DecisionRecord[]; pendingApprovals: string[] } {
    const account = resolveAccount(accountRef);
    return { mode: account.tradingMode === 'auto' ? 'auto' : 'approve', decisions: clone(account.decisions || []), pendingApprovals: clone(account.pendingApprovals || []) };
  }

  function setTradingMode(accountRef: string | { id: string }, mode: TradingMode) {
    if (!['approve', 'auto'].includes(mode)) throw new Error('Unknown trading mode.');
    resolveAccount(accountRef).tradingMode = mode as TradingMode;
    return getActivity(accountRef);
  }

  function addDecision(accountRef: string | { id: string }, decision: AgentDecisionInput): DecisionRecord {
    const account = resolveAccount(accountRef);
    const item = { ...clone(decision), id: decision.id || `${account.id}-decision-${Date.now()}-${account.decisions.length}`, createdAt: decision.createdAt || new Date().toISOString() };
    account.decisions = [item, ...(account.decisions || [])].slice(0, 100);
    if (item.status === 'pending') account.pendingApprovals = [item.id, ...(account.pendingApprovals || [])].slice(0, 30);
    return clone(item);
  }

  function updateDecision(accountRef: string | { id: string }, id: string, patch: Partial<DecisionRecord>) {
    const account = resolveAccount(accountRef);
    account.decisions = (account.decisions || []).map(item => item.id === id ? { ...item, ...clone(patch) } : item);
    if (patch.status && patch.status !== 'pending') account.pendingApprovals = (account.pendingApprovals || []).filter(itemId => itemId !== id);
    return getActivity(accountRef);
  }

  function setRegime(next: MarketRegime): SimulationPrices {
    if (!REGIMES[next]) throw new Error('Unknown market regime.');
    regime = next as MarketRegime;
    return getPrices();
  }

  function setDemoCrash(): { before: SimulationPrices; after: SimulationPrices; event: MarketEvent } {
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

  function exportState(): SerializedSimulation {
    return { version: 1, seed: random.getState(), initialSeed, date: isoDate(date), regime, prices: { ...prices }, marketHistory: clone(marketHistory), accounts: clone(accounts), events: clone(events) };
  }

  function importState(saved: SerializedSimulation): void {
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
    for (const account of Object.values(accounts)) {
      account.decisions = Array.isArray(account.decisions) ? account.decisions : [];
      account.pendingApprovals = Array.isArray(account.pendingApprovals) ? account.pendingApprovals : [];
      account.tradingMode = account.tradingMode === 'auto' ? 'auto' : 'approve';
    }
    events = Array.isArray(saved.events) ? clone(saved.events).slice(-120) : [];
  }

  function reset(resetOptions: SimulationOptions = {}): Simulation {
    return createSimulation({ seed: resetOptions.seed ?? initialSeed, currentDate: resetOptions.currentDate, regime: resetOptions.regime ?? 'sideways' });
  }

  return { advanceTime, getPrices, getPortfolio, getHistory, getActivity, setTradingMode, addDecision, updateDecision, placeOrder, setRegime, setDemoCrash, exportState, importState, reset, getEvents: () => clone(events), getDate: () => isoDate(date), getAccounts: () => Object.values(accounts).map(account => ({ ...account.profile })), ensureAccount };
}

export function loadSimulation(storage: SimulationStorage | undefined = globalThis.localStorage): Simulation {
  if (storage) {
    try {
      const raw = storage.getItem(SIMULATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const simulation = createSimulation({ seed: saved.seed, initialSeed: saved.initialSeed, currentDate: saved.date, regime: saved.regime });
        simulation.importState(saved);
        return simulation;
      }
    } catch { /* Reset corrupted demo state to a clean seeded simulation. */ }
  }
  return createSimulation();
}

export function saveSimulation(simulation: Pick<Simulation, 'exportState'>, storage: SimulationStorage | undefined = globalThis.localStorage): boolean {
  if (!storage) return false;
  try { storage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify(simulation.exportState())); return true; }
  catch { return false; }
}

export function buildBenchmarkSeries({ portfolioHistory = [], spyHistory = [], startingCapital = 0 }: { portfolioHistory?: Array<{ date: string; value: number }>; spyHistory?: PriceBar[]; startingCapital?: number } = {}): BenchmarkPoint[] {
  const capital = Number(startingCapital);
  const length = Math.min(730, portfolioHistory.length, spyHistory.length);
  if (!Number.isFinite(capital) || capital <= 0 || length < 2) return [];
  const managed = portfolioHistory.slice(-length);
  const spy = spyHistory.slice(-length);
  const startPrice = Number(spy[0]?.close);
  if (!Number.isFinite(startPrice) || startPrice <= 0) return [];
  return managed.map((point, index) => ({
    date: point.date,
    managed: Number(point.value) || 0,
    spy: roundMoney(capital * ((Number(spy[index]?.close) || startPrice) / startPrice)),
    cash: capital,
  }));
}
