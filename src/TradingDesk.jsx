import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleHelp, Landmark, Pause, Play, RotateCcw, ShieldCheck, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { evaluateMovingAverageCrossover, getVolatilityProfile } from './finance';
import './trading-desk.css';
import './trading-risk.css';
import './simple-trading.css';

const SYMBOLS = ['SPY', 'AAPL', 'MSFT', 'TSLA'];
const START_BANK = 25000;
const START_BUDGET = 5000;
const cents = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = value => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

function createAccount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('velora-simple-paper-account') || 'null');
    if (saved?.version === 1 && Number.isFinite(saved.bankCash) && Number.isFinite(saved.cash) && saved.positions && Array.isArray(saved.fills)) {
      return { decisions: [], realizedPnl: 0, ...saved };
    }
  } catch { /* Start a fresh practice ledger if saved data is unavailable. */ }
  return { version: 1, bankCash: START_BANK - START_BUDGET, cash: START_BUDGET, positions: {}, fills: [], decisions: [], realizedPnl: 0, budget: START_BUDGET, volatility: 35 };
}

export default function TradingDesk({ autoStart = true }) {
  const [account, setAccount] = useState(createAccount);
  const [markets, setMarkets] = useState({});
  const [volatility, setVolatility] = useState(() => createAccount().volatility ?? 35);
  const [budget, setBudget] = useState(() => createAccount().budget ?? START_BUDGET);
  const [running, setRunning] = useState(autoStart);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const accountRef = useRef(account);
  const volatilityRef = useRef(volatility);
  const budgetRef = useRef(budget);
  const busyRef = useRef(false);
  const processedBarsRef = useRef({});
  const risk = useMemo(() => getVolatilityProfile(volatility), [volatility]);
  const prices = useMemo(() => Object.fromEntries(SYMBOLS.map(symbol => [symbol, Number(markets[symbol]?.points?.at(-1)?.close) || 0])), [markets]);
  const holdings = Object.entries(account.positions).map(([symbol, position]) => {
    const price = prices[symbol] || position.mark || position.entryPrice;
    const marketValue = position.shares * price;
    return { symbol, ...position, price, marketValue, pnl: marketValue - position.entryPrice * position.shares };
  });
  const positionsValue = holdings.reduce((sum, position) => sum + position.marketValue, 0);
  const portfolioValue = account.cash + positionsValue;
  const openPnl = holdings.reduce((sum, position) => sum + position.pnl, 0);
  const totalPnl = account.realizedPnl + openPnl;

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { volatilityRef.current = volatility; }, [volatility]);
  useEffect(() => { budgetRef.current = budget; }, [budget]);
  useEffect(() => {
    try { window.localStorage.setItem('velora-simple-paper-account', JSON.stringify({ ...account, budget, volatility })); }
    catch { /* Keep this practice account usable for the current session. */ }
  }, [account, budget, volatility]);

  async function scanMarket(signal) {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const response = await fetch(`/api/market?symbols=${SYMBOLS.join(',')}&range=1d`, { signal });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.quotes)) throw new Error(payload.error || 'Prices are temporarily unavailable.');
      const nextMarkets = Object.fromEntries(payload.quotes
        .filter(quote => Array.isArray(quote.points) && quote.points.length >= 8)
        .map(quote => [quote.symbol, quote]));
      if (!Object.keys(nextMarkets).length) throw new Error('No current market-price history is available yet. Try again during market hours.');
      setMarkets(nextMarkets);
      setError('');
      setLastChecked(new Date());

      const nextAccount = { ...accountRef.current, positions: { ...accountRef.current.positions } };
      const newFills = [];
      const newDecisions = [];
      const activeRisk = getVolatilityProfile(volatilityRef.current);
      for (const symbol of SYMBOLS) {
        const points = nextMarkets[symbol]?.points || [];
        if (points.length < activeRisk.slowWindow + 1) continue;
        const latest = points.at(-1);
        const barTime = latest.date;
        if (!barTime || processedBarsRef.current[symbol] === barTime) continue;
        processedBarsRef.current[symbol] = barTime;
        const price = Number(latest.close);
        if (!Number.isFinite(price) || price <= 0) continue;
        const position = nextAccount.positions[symbol] || { shares: 0, entryPrice: 0 };
        const signal = evaluateMovingAverageCrossover(
          points.map(point => point.close),
          points.length - 1,
          position.shares > 0,
          activeRisk.fastWindow,
          activeRisk.slowWindow,
        );
        const stopTriggered = position.shares > 0 && price <= position.entryPrice * (1 - activeRisk.stopLossPct);
        let action = stopTriggered ? 'sell' : signal;
        let reason = action === 'buy'
          ? `Buy rule: the ${activeRisk.fastWindow}-minute average crossed above the ${activeRisk.slowWindow}-minute average.`
          : action === 'sell'
            ? stopTriggered ? `Sell rule: the ${money(position.entryPrice)} entry reached the ${(activeRisk.stopLossPct * 100).toFixed(1)}% practice stop.` : 'Sell rule: the fast average crossed below the slow average.'
            : position.shares > 0 ? 'Hold: no sell rule has triggered.' : 'Wait: no buy rule has triggered.';
        if (action === 'buy' && nextAccount.cash > 1) {
          const currentValue = position.shares * price;
          const currentPortfolioValue = nextAccount.cash + Object.entries(nextAccount.positions).reduce((sum, [ticker, held]) => sum + (Number(nextMarkets[ticker]?.points?.at(-1)?.close) || held.mark || held.entryPrice) * held.shares, 0);
          const limit = Math.min(budgetRef.current, currentPortfolioValue || budgetRef.current) * activeRisk.maxPositionPct;
          const spend = Math.min(nextAccount.cash, Math.max(0, limit - currentValue));
          const shares = Number((spend / price).toFixed(6));
          if (shares > 0) {
            const cost = shares * price;
            nextAccount.positions[symbol] = {
              shares: Number((position.shares + shares).toFixed(6)),
              entryPrice: position.shares ? (position.shares * position.entryPrice + cost) / (position.shares + shares) : price,
              mark: price,
            };
            nextAccount.cash = cents(nextAccount.cash - cost);
            const fill = { id: `${symbol}-${barTime}-buy`, symbol, side: 'buy', shares, price, time: barTime, reason };
            newFills.push(fill);
            reason += ` Practice order: ${shares.toFixed(4)} shares for ${money(cost)}.`;
          } else {
            reason = 'Wait: this stock is already at its selected portfolio limit.';
            action = 'wait';
          }
        } else if (action === 'buy') {
          reason = 'Wait: there is no investing cash available for this practice order.';
          action = 'wait';
        } else if (action === 'sell' && position.shares > 0) {
          const proceeds = position.shares * price;
          const tradePnl = (price - position.entryPrice) * position.shares;
          nextAccount.cash = cents(nextAccount.cash + proceeds);
          nextAccount.realizedPnl = cents(nextAccount.realizedPnl + tradePnl);
          delete nextAccount.positions[symbol];
          newFills.push({ id: `${symbol}-${barTime}-sell`, symbol, side: 'sell', shares: position.shares, price, time: barTime, reason, pnl: tradePnl });
          reason += ` Practice sale: ${money(proceeds)}; result ${tradePnl >= 0 ? '+' : '−'}${money(Math.abs(tradePnl))}.`;
        }
        newDecisions.push({ id: `${symbol}-${barTime}`, symbol, action: newFills.at(-1)?.symbol === symbol ? newFills.at(-1).side.toUpperCase() : action.toUpperCase(), price, time: barTime, reason });
      }
      if (newFills.length || newDecisions.length) {
        nextAccount.fills = [...newFills, ...nextAccount.fills].slice(0, 60);
        nextAccount.decisions = [...newDecisions, ...(nextAccount.decisions || [])].slice(0, 80);
        accountRef.current = nextAccount;
        setAccount(nextAccount);
      }
    } catch (scanError) {
      if (!signal?.aborted) setError(scanError.message || 'Unable to check market prices.');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    scanMarket(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const controller = new AbortController();
    const timer = window.setInterval(() => scanMarket(controller.signal), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [running, budget]);

  function updateBudget(event) {
    event.preventDefault();
    const target = Number(budget);
    const current = accountRef.current;
    if (!Number.isFinite(target) || target < 500 || target > START_BANK) return setError('Choose between $500 and $25,000 for your practice account.');
    const currentBudget = current.budget ?? START_BUDGET;
    const difference = cents(target - currentBudget);
    if (difference > current.bankCash) return setError(`Only ${money(current.bankCash)} remains in the practice bank account.`);
    if (difference < 0 && -difference > current.cash) return setError('Pause trading or sell a practice holding before reducing the budget below available cash.');
    const next = { ...current, bankCash: cents(current.bankCash - difference), cash: cents(current.cash + difference), budget: target };
    accountRef.current = next;
    setAccount(next);
    setError('');
  }

  function resetPractice() {
    const fresh = { version: 1, bankCash: START_BANK - START_BUDGET, cash: START_BUDGET, positions: {}, fills: [], decisions: [], realizedPnl: 0, budget: START_BUDGET, volatility };
    accountRef.current = fresh;
    processedBarsRef.current = {};
    setAccount(fresh);
    setBudget(START_BUDGET);
    setError('');
  }

  async function explainLatestDecision() {
    const latest = account.decisions?.[0];
    if (!latest || aiBusy) return;
    setAiBusy(true);
    setAiExplanation('');
    try {
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Explain this practice-only stock analysis in plain English: ${latest.action} ${latest.symbol} at ${latest.price}. Reason: ${latest.reason}. The rule-based strategy made the action. Explain what the rule means. Do not recommend a real trade or predict returns.`,
          persona: 'Adult',
          safeSurplus: account.cash,
          investmentVerdict: latest.action === 'BUY' || latest.action === 'SELL' ? 'pass' : 'block',
          investmentReason: latest.reason,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.answer) throw new Error(result.error || 'AI explanation is not available.');
      setAiExplanation(result.answer);
    } catch (explainError) {
      setAiExplanation(explainError.message || 'AI explanation is not available. The decision rule is shown above.');
    } finally {
      setAiBusy(false);
    }
  }

  const freshness = lastChecked ? lastChecked.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'Checking prices…';

  return <section className="trading-desk panel simple-trading" aria-labelledby="trading-desk-title">
    <header className="simple-trading-head"><div><div className="simple-kicker"><span className="simple-dot"/> CHECKS EVERY MINUTE · AUTOMATED PRACTICE STRATEGY</div><h2 id="trading-desk-title">Your investing desk</h2><p>Choose how much to use and how much risk feels right. See every buy, sell, or wait decision in plain language.</p></div><span className="practice-badge"><Landmark size={14}/> Sample practice account</span></header>

    <div className="simple-money-cards"><article><span><Landmark size={15}/> Sample account balance</span><b>{money(account.bankCash + account.cash)}</b><small>Preloaded practice balance · not a linked bank</small></article><article><span><Wallet size={15}/> Investing cash</span><b>{money(account.cash)}</b><small>Available to the strategy</small></article><article><span><Activity size={15}/> Stock portfolio</span><b>{money(positionsValue)}</b><small>{holdings.length} stocks · latest available prices</small></article><article><span><TrendingUp size={15}/> Practice result</span><b className={totalPnl >= 0 ? 'desk-positive' : 'desk-negative'}>{totalPnl >= 0 ? '+' : '−'}{money(Math.abs(totalPnl))}</b><small>Changes as practice prices move</small></article></div>

    <div className="simple-setup-grid"><form className="simple-budget" onSubmit={updateBudget}><div className="simple-section-title"><span className="simple-icon"><Wallet size={17}/></span><span><b>How much should the strategy use?</b><small>Move practice money from checking to investing cash.</small></span></div><label htmlFor="practice-budget">Investing budget <strong>{money(budget)}</strong></label><input id="practice-budget" type="range" min="500" max={START_BANK} step="500" value={budget} onChange={event => setBudget(Number(event.target.value))}/><div className="simple-range-labels"><span>$500</span><span>{money(START_BANK)}</span></div><button type="submit" className="simple-primary">Set investing budget</button></form>
      <div className="simple-risk"><div className="simple-section-title"><span className="simple-icon risk"><Activity size={17}/></span><span><b>How much price movement feels okay?</b><small>This changes practice trade size and the exit threshold.</small></span><strong>{risk.label}</strong></div><input type="range" min="0" max="100" step="1" value={volatility} onChange={event => setVolatility(Number(event.target.value))} aria-label="Risk level"/><div className="simple-range-labels"><span>Lower risk</span><span>Higher risk</span></div><div className="simple-risk-explain"><ShieldCheck size={14}/> Up to {(risk.maxPositionPct * 100).toFixed(0)}% per stock · practice exit threshold {(risk.stopLossPct * 100).toFixed(1)}%</div></div></div>

    <div className="simple-controls"><div><span className={running ? 'simple-dot' : 'simple-dot paused'}/><b>{running ? 'Automatic practice trading on' : 'Automatic practice trading paused'}</b><small>{loading ? 'Checking prices…' : `Last check: ${freshness}`}</small></div><button type="button" onClick={() => setRunning(value => !value)}>{running ? <><Pause size={15}/> Pause</> : <><Play size={15}/> Start automatic trading</>}</button><button type="button" className="simple-reset" onClick={resetPractice}><RotateCcw size={14}/> Reset practice account</button></div>

    {error && <div className="simple-error" role="alert">{error}</div>}
    {loading && <div className="simple-loading" role="status"><span/>Checking available price history…</div>}

    <div className="simple-watch-grid" aria-label="Stocks watched by the strategy">{SYMBOLS.map(symbol => <article key={symbol}><span>{symbol}</span><b>{prices[symbol] ? money(prices[symbol]) : '—'}</b><small>{markets[symbol]?.source || 'Waiting for price'}</small></article>)}</div>
    <div className="simple-section-title simple-portfolio-title"><span className="simple-icon"><Wallet size={17}/></span><span><b>Your practice stocks</b><small>Each stock's value updates when new market prices are available.</small></span></div>
    {holdings.length ? <div className="simple-holdings"><div className="simple-holding-header"><span>STOCK</span><span>SHARES</span><span>PRICE</span><span>VALUE</span><span>RESULT</span></div>{holdings.map(holding => <div className="simple-holding" key={holding.symbol}><b>{holding.symbol}</b><span>{holding.shares.toFixed(4)}</span><span>{money(holding.price)}</span><b>{money(holding.marketValue)}</b><strong className={holding.pnl >= 0 ? 'desk-positive' : 'desk-negative'}>{holding.pnl >= 0 ? '+' : '−'}{money(Math.abs(holding.pnl))}</strong></div>)}</div> : <div className="simple-empty">No practice stocks yet. The strategy will add a position only when its buy rule is met.</div>}

    <div className="simple-analysis-heading"><div className="simple-section-title simple-analysis-title"><span className="simple-icon ai"><Sparkles size={17}/></span><span><b>Why it acted</b><small>The rules choose each action. Gemini can explain the result if its API key is configured.</small></span></div><button type="button" onClick={explainLatestDecision} disabled={!account.decisions?.length || aiBusy}>{aiBusy ? 'Asking Gemini…' : 'Explain with AI'}</button></div>
    {account.decisions?.length ? <div className="simple-decisions">{account.decisions.slice(0, 5).map(item => <article key={item.id}><span className={`simple-action ${item.action.toLowerCase()}`}>{item.action}</span><div><b>{item.symbol} · {money(item.price)}</b><small>{item.reason}</small></div><time>{item.time ? new Date(item.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Initial setup'}</time></article>)}</div> : <div className="simple-empty">Waiting for a new price update. The strategy will show whether it buys, sells, or waits and why.</div>}
    {aiExplanation && <div className="simple-ai-explanation"><Sparkles size={15}/><p>{aiExplanation}</p></div>}

    {account.fills.length > 0 && <div className="simple-fill-summary"><b>Recent practice orders</b>{account.fills.slice(0, 3).map(fill => <span key={fill.id}><i className={fill.side}/>{fill.side.toUpperCase()} {fill.symbol} · {fill.shares.toFixed(4)} shares at {money(fill.price)}</span>)}</div>}
    <p className="simple-disclosure"><CircleHelp size={14}/> Practice account with fictional balances and simulated trades. Market prices may be delayed. No bank or brokerage is connected, and practice results do not predict future returns.</p>
  </section>;
}
