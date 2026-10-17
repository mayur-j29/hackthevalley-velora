import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleHelp, Landmark, Pause, Play, Plus, RotateCcw, Search, ShieldCheck, Sparkles, TrendingUp, Wallet, X } from 'lucide-react';
import { analyzeCandlestickPattern, evaluateMovingAverageCrossover, getVolatilityProfile } from './finance';
import { accrueSampleEarnings, createInitialPaperAccount, readPaperAccount, savePaperAccount } from './paperAccount';
import './trading-desk.css';
import './trading-risk.css';
import './simple-trading.css';

const DEFAULT_SYMBOLS = ['JPM:NYSE', 'KO:NYSE', 'RY:TSX', 'TD:TSX'];
const START_BANK = 25000;
const START_BUDGET = 5000;
const cents = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = value => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const tickerName = symbol => symbol.split(':')[0];
const exchangeName = symbol => symbol.endsWith(':TSX') ? 'TSX' : 'NYSE';

function MiniCandles({ points = [] }) {
  const candles = points.slice(-18);
  if (candles.length < 2) return <div className="simple-candle-empty">Waiting for candle history…</div>;
  const low = Math.min(...candles.map(item => item.low));
  const high = Math.max(...candles.map(item => item.high));
  const y = price => 66 - ((price - low) / Math.max(0.0001, high - low)) * 56;
  const step = 240 / candles.length;
  return <svg className="simple-candle-chart" viewBox="0 0 240 72" role="img" aria-label={`Recent candlestick chart for ${candles.at(-1).symbol || 'stock'}`}>
    {[15, 36, 57].map(level => <line key={level} x1="0" x2="240" y1={level} y2={level} className="simple-candle-gridline"/>)}
    {candles.map((candle, index) => {
      const color = candle.close >= candle.open ? 'up' : 'down';
      const top = Math.min(y(candle.open), y(candle.close));
      const height = Math.max(1.5, Math.abs(y(candle.close) - y(candle.open)));
      const center = index * step + step / 2;
      return <g className={`simple-candle ${color}`} key={`${candle.date}-${index}`}>
        <line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)}/>
        <rect x={center - Math.max(2, step * 0.27)} y={top} width={Math.max(4, step * 0.54)} height={height} rx="1"/>
      </g>;
    })}
  </svg>;
}

function createAccount() { return readPaperAccount(); }

export default function TradingDesk({ autoStart = true, onAiStatus = () => {} }) {
  const [account, setAccount] = useState(createAccount);
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('velora-trading-watchlist') || 'null');
      if (Array.isArray(saved) && saved.length) {
        const migrated = saved.map(value => String(value).includes(':') ? String(value) : `${String(value).replace(/\.TO$/i, '')}:${String(value).endsWith('.TO') ? 'TSX' : 'NYSE'}`);
        const supported = migrated.filter(value => /^[A-Z0-9.-]{1,15}:(NYSE|TSX)$/.test(value));
        if (supported.length) return [...new Set(supported)].slice(0, 10);
      }
    } catch { /* Use the starter symbols. */ }
    return DEFAULT_SYMBOLS;
  });
  const [markets, setMarkets] = useState({});
  const [directoryExchange, setDirectoryExchange] = useState('NYSE');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryResults, setDirectoryResults] = useState([]);
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [aiStatus, setAiStatus] = useState('AI is starting');
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
  const watchlistRef = useRef(watchlist);
  const busyRef = useRef(false);
  const scanAttemptedRef = useRef(false);
  const processedBarsRef = useRef(Object.entries([...(account.decisions || []), ...account.fills].reduce((latest, item) => {
    if (item.symbol && item.time && item.time > (latest[item.symbol] || '')) latest[item.symbol] = item.time;
    return latest;
  }, {})));
  const risk = useMemo(() => getVolatilityProfile(volatility), [volatility]);
  const prices = useMemo(() => Object.fromEntries(watchlist.map(symbol => [symbol, Number(markets[symbol]?.points?.at(-1)?.close) || 0])), [markets, watchlist]);
  const analyses = useMemo(() => Object.fromEntries(watchlist.map(symbol => {
    const quote = markets[symbol]; const points = quote?.points || []; const pattern = analyzeCandlestickPattern(points);
    return [symbol, { pattern, quote, price: Number(points.at(-1)?.close) || 0, action: account.decisions?.find(item => item.symbol === symbol)?.action || 'SCANNING' }];
  })), [account.decisions, markets, watchlist]);
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
  useEffect(() => { setRunning(autoStart); }, [autoStart]);
  useEffect(() => { watchlistRef.current = watchlist; try { window.localStorage.setItem('velora-trading-watchlist', JSON.stringify(watchlist)); } catch { /* Watchlist stays active for this session. */ } }, [watchlist]);
  useEffect(() => {
    let active = true;
    fetch('/api/copilot').then(response => response.json()).then(data => {
      if (active && !scanAttemptedRef.current) { setAiStatus(data.enabled ? 'AI ready · waiting for prices' : 'AI unavailable · using basic checks'); onAiStatus(data.enabled ? 'ready' : 'demo'); }
    }).catch(() => {
      if (active && !scanAttemptedRef.current) { setAiStatus('AI unavailable · using basic checks'); onAiStatus('demo'); }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    savePaperAccount({ ...account, budget, volatility });
  }, [account, budget, volatility]);

  useEffect(() => {
    const controller = new AbortController();
    setDirectoryBusy(true);
    setDirectoryError('');
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ exchange: directoryExchange, page: String(directoryPage) });
        if (directoryQuery.trim()) params.set('q', directoryQuery.trim());
        const result = await fetch(`/api/stocks?${params}`, { signal: controller.signal });
        const data = await result.json();
        if (!result.ok || !Array.isArray(data.stocks)) throw new Error(data.error || 'Stock directory is unavailable.');
        setDirectoryResults(current => directoryPage === 1 ? data.stocks : [...current, ...data.stocks.filter(stock => !current.some(old => old.symbol === stock.symbol))]);
      } catch (directoryFetchError) {
        if (!controller.signal.aborted) { setDirectoryResults([]); setDirectoryError(directoryFetchError.message || 'Stock directory is unavailable.'); }
      } finally { if (!controller.signal.aborted) setDirectoryBusy(false); }
    }, directoryQuery.trim() ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [directoryExchange, directoryPage, directoryQuery]);

  async function scanMarket(signal) {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const symbols = watchlistRef.current;
      const response = await fetch(`/api/market?symbols=${symbols.map(encodeURIComponent).join(',')}`, { signal });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.quotes)) throw new Error(payload.error || 'Prices are temporarily unavailable.');
      const nextMarkets = Object.fromEntries(payload.quotes
        .filter(quote => Array.isArray(quote.points) && quote.points.length >= 2)
        .map(quote => [quote.symbol, quote]));
      if (!Object.keys(nextMarkets).length) throw new Error('No current market-price history is available yet. Try again during market hours.');
      setMarkets(nextMarkets);
      setError('');
      setLastChecked(new Date());

      const nextAccount = { ...accountRef.current, positions: { ...accountRef.current.positions } };
      const newFills = [];
      const newDecisions = [];
      const newApprovals = [];
      const activeRisk = getVolatilityProfile(volatilityRef.current);
      const candidates = [];
      for (const symbol of symbols) {
        const points = nextMarkets[symbol]?.points || [];
        if (points.length < 2) continue;
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
        const pattern = analyzeCandlestickPattern(points);
        candidates.push({ symbol, exchange: exchangeName(symbol), currency: nextMarkets[symbol]?.currency, candles: points.slice(-20), pattern, held: position.shares > 0, shares: position.shares, signal });
      }
      let aiDecisions = {};
      if (candidates.length) {
        try {
          const aiResponse = await fetch('/api/trading-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ riskLevel: activeRisk.label, cash: nextAccount.cash, candidates }) });
          const aiPayload = await aiResponse.json();
          if (!aiResponse.ok || !Array.isArray(aiPayload.decisions)) throw new Error(aiPayload.error || 'AI scan unavailable');
          aiDecisions = Object.fromEntries(aiPayload.decisions.map(item => [item.symbol, item]));
          scanAttemptedRef.current = true;
          setAiStatus(`AI reviewed ${aiPayload.decisions.length} stocks`);
          onAiStatus('live');
        } catch (aiError) {
          if (signal?.aborted) throw aiError;
          scanAttemptedRef.current = true;
          setAiStatus('AI unavailable · using basic checks');
          onAiStatus('demo');
        }
      }
      for (const candidate of candidates) {
        const { symbol, pattern, signal } = candidate;
        const points = nextMarkets[symbol].points;
        const price = candidate.candles.at(-1).close;
        const position = nextAccount.positions[symbol] || { shares: 0, entryPrice: 0 };
        const stopTriggered = position.shares > 0 && price <= position.entryPrice * (1 - activeRisk.stopLossPct);
        const suggestion = aiDecisions[symbol];
        const fallback = signal === 'buy' && pattern.bias === 'bullish' ? 'BUY' : signal === 'sell' && position.shares > 0 ? 'SELL' : 'HOLD';
        const suggestedAction = suggestion?.action || fallback;
        let action = stopTriggered ? 'SELL' : suggestedAction;
        let reason = stopTriggered
          ? `The price reached your ${ (activeRisk.stopLossPct * 100).toFixed(1)}% safety limit.`
          : suggestion?.reason || `${pattern.name}: ${pattern.explanation} Trend check: ${signal}.`;
        let ruleVerdict = 'WAIT';
        if (action === 'BUY' && (pattern.bias !== 'bullish' || signal !== 'buy')) { action = 'HOLD'; reason = `Safety check says wait: ${pattern.bias !== 'bullish' ? `${pattern.name} does not show an upward pattern` : 'the trend does not support a buy'}. ${reason}`; ruleVerdict = 'BLOCKED'; }
        if (action === 'SELL' && position.shares <= 0) { action = 'HOLD'; reason = 'Safety check says wait: there are no shares in this practice account to sell.'; ruleVerdict = 'BLOCKED'; }
        if (action === 'BUY' && nextAccount.cash > 1) {
          const currentValue = position.shares * price;
          const currentPortfolioValue = nextAccount.cash + Object.entries(nextAccount.positions).reduce((sum, [ticker, held]) => sum + (Number(nextMarkets[ticker]?.points?.at(-1)?.close) || held.mark || held.entryPrice) * held.shares, 0);
          const limit = Math.min(budgetRef.current, currentPortfolioValue || budgetRef.current) * activeRisk.maxPositionPct;
          const spend = Math.min(nextAccount.cash, Math.max(0, limit - currentValue));
          const shares = Number((spend / price).toFixed(6));
          if (shares > 0) {
            newApprovals.push({ id: `${symbol}-${barTime}-buy`, symbol, side: 'BUY', price, shares, amount: cents(shares * price), time: barTime, reason, source: suggestion ? 'AI' : 'Strategy' });
            reason += ` Suggested size: ${shares.toFixed(4)} shares (${money(shares * price)}). Waiting for your approval.`;
            ruleVerdict = 'READY';
          } else {
            reason = 'Safety check says wait: this stock is already at its limit.';
            action = 'HOLD';
            ruleVerdict = 'BLOCKED';
          }
        } else if (action === 'BUY') {
          reason = 'Safety check says wait: there is no investing cash available.';
          action = 'HOLD';
          ruleVerdict = 'BLOCKED';
        } else if (action === 'SELL' && position.shares > 0) {
          newApprovals.push({ id: `${symbol}-${barTime}-sell`, symbol, side: 'SELL', price, shares: position.shares, amount: cents(position.shares * price), time: barTime, reason, source: suggestion ? 'AI' : 'Strategy' });
          reason += ` Suggested sale: ${position.shares.toFixed(4)} shares (${money(position.shares * price)}). Waiting for your approval.`;
          ruleVerdict = 'READY';
        }
        const finalAction = newApprovals.at(-1)?.symbol === symbol ? 'PENDING' : action;
        newDecisions.push({ id: `${symbol}-${candidate.candles.at(-1).date}`, symbol, action: finalAction, suggestedAction, ruleVerdict, price, time: candidate.candles.at(-1).date, reason, pattern: pattern.name, bias: pattern.bias, source: suggestion ? 'AI' : 'Strategy' });
      }
      if (newFills.length || newDecisions.length || newApprovals.length) {
        nextAccount.fills = [...newFills, ...nextAccount.fills].slice(0, 60);
        nextAccount.decisions = [...new Map([...newDecisions, ...(nextAccount.decisions || [])].map(item => [item.id, item])).values()].slice(0, 80);
        nextAccount.pendingApprovals = [...newApprovals, ...(nextAccount.pendingApprovals || [])].slice(0, 10);
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
    if (!autoStart) { setLoading(false); return undefined; }
    const controller = new AbortController();
    scanMarket(controller.signal);
    return () => controller.abort();
  }, [autoStart]);

  useEffect(() => {
    if (!running) return undefined;
    const controller = new AbortController();
    const timer = window.setInterval(() => scanMarket(controller.signal), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [running, budget]);

  function finishApproval(requestId, approve) {
    const current = accountRef.current;
    const request = (current.pendingApprovals || []).find(item => item.id === requestId);
    if (!request) return;
    const pendingApprovals = current.pendingApprovals.filter(item => item.id !== requestId);
    if (!approve) {
      const next = { ...current, pendingApprovals, decisions: current.decisions.map(item => item.id === request.id.replace(/-(buy|sell)$/, '') ? { ...item, action: 'SKIPPED', ruleVerdict: 'SKIPPED', reason: 'You chose to skip this idea. No practice order was placed.' } : item) };
      accountRef.current = next; setAccount(next); return;
    }
    const quote = markets[request.symbol];
    const price = Number(quote?.points?.at(-1)?.close) || request.price;
    const position = current.positions[request.symbol] || { shares: 0, entryPrice: 0 };
    const activeRisk = getVolatilityProfile(volatilityRef.current);
    let next = { ...current, pendingApprovals, positions: { ...current.positions } };
    if (request.side === 'BUY') {
      const points = quote?.points || [];
      const pattern = analyzeCandlestickPattern(points);
      const trend = evaluateMovingAverageCrossover(points.map(point => point.close), Math.max(0, points.length - 1), position.shares > 0, activeRisk.fastWindow, activeRisk.slowWindow);
      const currentValue = position.shares * price;
      const portfolioValue = current.cash + Object.values(current.positions).reduce((sum, held) => sum + (Number(quote?.points?.at(-1)?.close) || held.mark || held.entryPrice) * held.shares, 0);
      const limit = Math.min(budgetRef.current, portfolioValue || budgetRef.current) * activeRisk.maxPositionPct;
      const spend = Math.min(next.cash, Math.max(0, limit - currentValue));
      const shares = Number((spend / price).toFixed(6));
      if (pattern.bias !== 'bullish' || trend !== 'buy' || shares <= 0) {
        setError(`This buy no longer passes the safety check for ${tickerName(request.symbol)}. No order was placed.`);
        next.decisions = next.decisions.map(item => item.id === request.id.replace(/-(buy|sell)$/, '') ? { ...item, action: 'BLOCKED', ruleVerdict: 'BLOCKED', reason: 'The latest price pattern or account limit changed before approval.' } : item);
      } else {
        const cost = cents(shares * price);
        next.cash = cents(next.cash - cost);
        next.positions[request.symbol] = { shares: Number((position.shares + shares).toFixed(6)), entryPrice: position.shares ? (position.shares * position.entryPrice + cost) / (position.shares + shares) : price, mark: price };
        const fill = { id: `${request.id}-approved`, symbol: request.symbol, side: 'buy', shares, price, time: new Date().toISOString(), reason: request.reason };
        next.fills = [fill, ...next.fills].slice(0, 60);
        next.decisions = next.decisions.map(item => item.id === request.id.replace(/-(buy|sell)$/, '') ? { ...item, action: 'BOUGHT', ruleVerdict: 'APPROVED', reason: `You approved ${shares.toFixed(4)} shares for ${money(cost)}.` } : item);
        setError('');
      }
    } else if (position.shares <= 0) {
      setError('Those shares are no longer in the account, so no sale was placed.');
    } else {
      const proceeds = cents(position.shares * price);
      const tradePnl = cents((price - position.entryPrice) * position.shares);
      next.cash = cents(next.cash + proceeds); next.realizedPnl = cents(next.realizedPnl + tradePnl); delete next.positions[request.symbol];
      next.fills = [{ id: `${request.id}-approved`, symbol: request.symbol, side: 'sell', shares: position.shares, price, time: new Date().toISOString(), reason: request.reason, pnl: tradePnl }, ...next.fills].slice(0, 60);
      next.decisions = next.decisions.map(item => item.id === request.id.replace(/-(buy|sell)$/, '') ? { ...item, action: 'SOLD', ruleVerdict: 'APPROVED', reason: `You approved selling ${position.shares.toFixed(4)} shares for ${money(proceeds)}.` } : item);
      setError('');
    }
    accountRef.current = next; setAccount(next);
  }

  function addStock(stock) {
    const symbol = `${stock.symbol}:${stock.exchange}`;
    if (watchlistRef.current.includes(symbol)) return;
    if (watchlistRef.current.length >= 10) { setError('Keep up to 10 symbols in the minute-by-minute watchlist. Browse the full directory and swap symbols as needed.'); return; }
    const next = [...watchlistRef.current, symbol];
    watchlistRef.current = next;
    setWatchlist(next);
    setError('');
  }

  function removeStock(symbol) {
    if (watchlistRef.current.length <= 1) { setError('Keep at least one stock in the practice watchlist.'); return; }
    const next = watchlistRef.current.filter(item => item !== symbol);
    watchlistRef.current = next;
    setWatchlist(next);
    setMarkets(current => { const updated = { ...current }; delete updated[symbol]; return updated; });
  }

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
    const fresh = { ...createInitialPaperAccount(), volatility };
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
          question: `Explain this practice-only stock analysis in plain English. The AI suggested ${latest.suggestedAction || latest.action}; after the separate safety checks, the recorded action was ${latest.action} for ${latest.symbol} at ${latest.price}. Reason: ${latest.reason}. Explain the pattern and checks simply. Do not recommend a real trade or predict returns.`,
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
    <header className="simple-trading-head"><div><div className="simple-kicker"><span className="simple-dot"/> AI INVESTING ASSISTANT</div><h2 id="trading-desk-title">Your money, with a second set of eyes.</h2><p>Review price patterns and risk limits, then approve each practice order.</p></div></header>

    <div className="simple-money-cards"><article><span><Landmark size={15}/> Demo account total</span><b>{money(account.bankCash + account.cash + positionsValue)}</b><small>Demo bank + investing cash + stocks</small></article><article><span><Wallet size={15}/> Cash ready to invest</span><b>{money(account.cash)}</b><small>Used only after you approve an idea</small></article><article><span><Activity size={15}/> Stock value</span><b>{money(positionsValue)}</b><small>{holdings.length} stocks · latest available prices</small></article><article><span><TrendingUp size={15}/> Practice result</span><b className={totalPnl >= 0 ? 'desk-positive' : 'desk-negative'}>{totalPnl >= 0 ? '+' : '−'}{money(Math.abs(totalPnl))}</b><small>Changes as practice prices move</small></article></div>

    <div className="simple-setup-grid"><form className="simple-budget" onSubmit={updateBudget}><div className="simple-section-title"><span className="simple-icon"><Wallet size={17}/></span><span><b>How much should the strategy use?</b><small>Move practice money from checking to investing cash.</small></span></div><label htmlFor="practice-budget">Investing budget <strong>{money(budget)}</strong></label><input id="practice-budget" type="range" min="500" max={START_BANK} step="500" value={budget} onChange={event => setBudget(Number(event.target.value))}/><div className="simple-range-labels"><span>$500</span><span>{money(START_BANK)}</span></div><button type="submit" className="simple-primary">Set investing budget</button></form>
      <div className="simple-risk"><div className="simple-section-title"><span className="simple-icon risk"><Activity size={17}/></span><span><b>How much price movement feels okay?</b><small>A calmer setting means smaller stock amounts and a closer sell limit.</small></span><strong>{risk.label}</strong></div><input type="range" min="0" max="100" step="1" value={volatility} onChange={event => setVolatility(Number(event.target.value))} aria-label="Risk level"/><div className="simple-range-labels"><span>Lower risk</span><span>Higher risk</span></div><div className="simple-risk-explain"><ShieldCheck size={14}/> At most {(risk.maxPositionPct * 100).toFixed(0)}% of your account in one stock · review a drop of {(risk.stopLossPct * 100).toFixed(1)}%</div></div></div>

    <div className="simple-controls"><div><span className={running ? 'simple-dot' : 'simple-dot paused'}/><b>{running ? 'AI checking each minute · orders wait for you' : 'AI checks paused'}</b><small>{loading ? 'Checking prices…' : `Last check: ${freshness}`}</small></div><button type="button" onClick={() => setRunning(value => !value)}>{running ? <><Pause size={15}/> Pause</> : <><Play size={15}/> Start AI checks</>}</button><button type="button" className="simple-reset" onClick={resetPractice}><RotateCcw size={14}/> Reset practice account</button></div>

    {error && <div className="simple-error" role="alert">{error}</div>}
    {loading && <div className="simple-loading" role="status"><span/>Checking available price history…</div>}

    {(account.pendingApprovals || []).length > 0 && <section className="simple-approval-panel" aria-label="Trade ideas waiting for approval"><div><span className="simple-icon ai"><Sparkles size={17}/></span><span><b>AI has an idea for you</b><small>Review the reason and price. Nothing changes until you approve.</small></span></div>{account.pendingApprovals.map(request => <article key={request.id}><div className="approval-title"><strong>{request.side === 'BUY' ? 'Buy' : 'Sell'} {tickerName(request.symbol)}</strong><span>{request.shares.toFixed(4)} shares · about {money(request.amount)}</span></div><p>{request.reason}</p><small>Suggested price: {money(request.price)} · {request.source === 'AI' ? 'AI idea' : 'Strategy idea'} · Safety checks passed</small><div className="approval-actions"><button type="button" onClick={() => finishApproval(request.id, true)}>Approve practice order</button><button type="button" onClick={() => finishApproval(request.id, false)}>Skip</button></div></article>)}</section>}

    <div className="simple-analysis-heading"><div className="simple-section-title simple-analysis-title"><span className="simple-icon ai"><Sparkles size={17}/></span><span><b>Price pattern notes · {aiStatus}</b></span></div></div>
    <div className="simple-watch-grid" aria-label="Price pattern notes for selected stocks">{watchlist.map(symbol => { const analysis = analyses[symbol]; const quote = analysis?.quote; return <article className="simple-stock-card" key={symbol}><div className="simple-stock-card-head"><span><b>{tickerName(symbol)}</b><small>{exchangeName(symbol)} · {quote?.interval === '1day' || quote?.interval === '1d' ? 'daily prices' : 'live prices'}</small></span><b className="simple-stock-price">{analysis?.price ? `${quote?.currency === 'CAD' ? 'CA$' : '$'}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(analysis.price)}` : '—'}</b><button type="button" className="simple-remove-stock" aria-label={`Remove ${tickerName(symbol)}`} onClick={() => removeStock(symbol)}><X size={14}/></button></div><MiniCandles points={quote?.points || []}/><div className="simple-pattern-row"><span className={`simple-pattern-badge ${analysis?.pattern.bias || 'neutral'}`}>{analysis?.pattern.name || 'Waiting for candles'}</span><span className={`simple-pattern-bias ${analysis?.pattern.bias || 'neutral'}`}>{analysis?.pattern.bias || 'neutral'}</span></div><p className="simple-pattern-explanation">{analysis?.pattern.explanation || 'A simple price-pattern note will appear when prices load.'}</p><div className="simple-stock-decision"><span className={`simple-action ${(analysis?.action || 'scan').toLowerCase()}`}>{analysis?.action || 'SCANNING'}</span><small>{quote?.source || 'Waiting for market data'}</small></div></article>; })}</div>
    <details className="simple-universe" aria-labelledby="stock-directory-title"><summary className="simple-section-title"><span className="simple-icon"><Search size={17}/></span><span><b id="stock-directory-title">Add or remove stocks</b><small>Optional · search the NYSE and TSX directories.</small></span><span className="simple-details-label">Browse listings</span></summary><div className="simple-directory-controls"><div className="simple-exchange-tabs"><button type="button" className={directoryExchange === 'NYSE' ? 'active' : ''} onClick={() => { setDirectoryExchange('NYSE'); setDirectoryPage(1); }}>NYSE</button><button type="button" className={directoryExchange === 'TSX' ? 'active' : ''} onClick={() => { setDirectoryExchange('TSX'); setDirectoryPage(1); }}>TSX</button></div><label className="simple-directory-search"><Search size={15}/><input value={directoryQuery} onChange={event => { setDirectoryQuery(event.target.value); setDirectoryPage(1); }} placeholder="Search ticker or company" aria-label="Search stock listings"/></label></div>{directoryError && <p className="simple-directory-error" role="status">{directoryError}</p>}<div className="simple-directory-list">{directoryResults.map(stock => { const symbol = `${stock.symbol}:${stock.exchange}`; const added = watchlist.includes(symbol); return <div className="simple-directory-item" key={symbol}><span><b>{stock.symbol}</b><small>{stock.name}</small></span><small>{stock.currency} · {stock.exchange}</small><button type="button" onClick={() => added ? removeStock(symbol) : addStock(stock)} disabled={!added && watchlist.length >= 10}>{added ? <><X size={13}/> Remove</> : <><Plus size={13}/> Add</>}</button></div>; })}{!directoryResults.length && !directoryBusy && <div className="simple-empty">{directoryError ? 'Add your market-data key in Vercel to load the exchange directory.' : 'No matching listings found.'}</div>}{directoryBusy && <div className="simple-directory-loading">Loading {directoryExchange} listings…</div>}</div>{!directoryQuery.trim() && <button type="button" className="simple-directory-more" onClick={() => setDirectoryPage(page => page + 1)} disabled={directoryBusy || directoryResults.length >= 10000}>Load next 100 listings</button>}</details>
    <div className="simple-section-title simple-portfolio-title"><span className="simple-icon"><Wallet size={17}/></span><span><b>Your practice stocks</b></span></div>
    {holdings.length ? <div className="simple-holdings"><div className="simple-holding-header"><span>STOCK</span><span>SHARES</span><span>PRICE</span><span>VALUE</span><span>RESULT</span></div>{holdings.map(holding => <div className="simple-holding" key={holding.symbol}><b>{holding.symbol}</b><span>{holding.shares.toFixed(4)}</span><span>{money(holding.price)}</span><b>{money(holding.marketValue)}</b><strong className={holding.pnl >= 0 ? 'desk-positive' : 'desk-negative'}>{holding.pnl >= 0 ? '+' : '−'}{money(Math.abs(holding.pnl))}</strong></div>)}</div> : <div className="simple-empty">No stocks yet. The assistant will ask before suggesting a practice buy.</div>}

    <div className="simple-analysis-heading"><div className="simple-section-title simple-analysis-title"><span className="simple-icon ai"><Sparkles size={17}/></span><span><b>Why the AI suggested it</b><small>See the idea, safety check, and what you chose.</small></span></div><button type="button" onClick={explainLatestDecision} disabled={!account.decisions?.length || aiBusy}>{aiBusy ? 'Asking AI…' : 'Explain latest'}</button></div>
    {account.decisions?.length ? <div className="simple-decisions">{account.decisions.slice(0, 5).map(item => <article key={item.id}><span className={`simple-action ${item.action.toLowerCase()}`}>{item.action}</span><div><b>{item.symbol} · {money(item.price)}</b><small><strong>{item.source === 'AI' ? 'AI suggestion' : 'Basic check'}: {item.suggestedAction || item.action} · Rules: {item.ruleVerdict || (item.action === 'HOLD' ? 'WAIT' : 'PASS')} · Final: {item.action}.</strong> {item.reason}</small></div><time>{item.time ? new Date(item.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Initial setup'}</time></article>)}</div> : <div className="simple-empty">Waiting for a price update. The assistant will explain whether it suggests buying, selling, or waiting.</div>}
    {aiExplanation && <div className="simple-ai-explanation"><Sparkles size={15}/><p>{aiExplanation}</p></div>}

    {account.fills.length > 0 && <div className="simple-fill-summary"><b>Recent practice orders</b>{account.fills.slice(0, 3).map(fill => <span key={fill.id}><i className={fill.side}/>{fill.side.toUpperCase()} {fill.symbol} · {fill.shares.toFixed(4)} shares at {money(fill.price)}</span>)}</div>}
  </section>;
}
