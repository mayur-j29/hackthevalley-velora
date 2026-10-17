import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleHelp, Landmark, Pause, Play, Plus, RotateCcw, Search, ShieldCheck, Sparkles, TrendingUp, Wallet, X } from 'lucide-react';
import { analyzeCandlestickPattern, evaluateMovingAverageCrossover, getVolatilityProfile } from './finance';
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

function createAccount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('velora-simple-paper-account') || 'null');
    if (saved?.version === 1 && Number.isFinite(saved.bankCash) && Number.isFinite(saved.cash) && saved.positions && Array.isArray(saved.fills)) {
      const unique = items => [...new Map((items || []).filter(item => item?.id).map(item => [item.id, item])).values()];
      return { decisions: [], realizedPnl: 0, ...saved, decisions: unique(saved.decisions), fills: unique(saved.fills) };
    }
  } catch { /* Start a fresh practice ledger if saved data is unavailable. */ }
  return { version: 1, bankCash: START_BANK - START_BUDGET, cash: START_BUDGET, positions: {}, fills: [], decisions: [], realizedPnl: 0, budget: START_BUDGET, volatility: 35 };
}

export default function TradingDesk({ autoStart = true }) {
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
  const [aiStatus, setAiStatus] = useState('Checking AI');
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
      if (active && !scanAttemptedRef.current) setAiStatus(data.enabled ? 'AI ready · awaiting scan' : 'Rules mode · AI unavailable');
    }).catch(() => {
      if (active && !scanAttemptedRef.current) setAiStatus('Rules mode · AI status unavailable');
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('velora-simple-paper-account', JSON.stringify({ ...account, budget, volatility })); }
    catch { /* Keep this practice account usable for the current session. */ }
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
        } catch (aiError) {
          if (signal?.aborted) throw aiError;
          scanAttemptedRef.current = true;
          setAiStatus(`Rules fallback · ${aiError.message || 'AI unavailable'}`);
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
        let action = stopTriggered ? 'SELL' : suggestion?.action || fallback;
        let reason = stopTriggered
          ? `Safety exit: price reached the ${(activeRisk.stopLossPct * 100).toFixed(1)}% limit.`
          : suggestion?.reason || `${pattern.name}: ${pattern.explanation} Moving-average check: ${signal}.`;
        const suggestedAction = action;
        if (action === 'BUY' && (pattern.bias !== 'bullish' || signal !== 'buy')) { action = 'HOLD'; reason = `Rules blocked the buy: ${pattern.bias !== 'bullish' ? `${pattern.name} is not bullish` : 'the moving-average check is not a buy'}. ${reason}`; }
        if (action === 'SELL' && position.shares <= 0) { action = 'HOLD'; reason = 'Risk check blocked the sell: there is no practice holding to sell.'; }
        if (action === 'BUY' && nextAccount.cash > 1) {
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
            action = 'HOLD';
          }
        } else if (action === 'BUY') {
          reason = 'Wait: there is no investing cash available for this practice order.';
          action = 'HOLD';
        } else if (action === 'SELL' && position.shares > 0) {
          const proceeds = position.shares * price;
          const tradePnl = (price - position.entryPrice) * position.shares;
          nextAccount.cash = cents(nextAccount.cash + proceeds);
          nextAccount.realizedPnl = cents(nextAccount.realizedPnl + tradePnl);
          delete nextAccount.positions[symbol];
          newFills.push({ id: `${symbol}-${barTime}-sell`, symbol, side: 'sell', shares: position.shares, price, time: barTime, reason, pnl: tradePnl });
          reason += ` Practice sale: ${money(proceeds)}; result ${tradePnl >= 0 ? '+' : '−'}${money(Math.abs(tradePnl))}.`;
        }
        newDecisions.push({ id: `${symbol}-${candidate.candles.at(-1).date}`, symbol, action: newFills.at(-1)?.symbol === symbol ? newFills.at(-1).side.toUpperCase() : action, suggestedAction, price, time: candidate.candles.at(-1).date, reason, pattern: pattern.name, bias: pattern.bias, source: suggestion ? 'AI' : 'Rules' });
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
    <header className="simple-trading-head"><div><div className="simple-kicker"><span className="simple-dot"/> CONTINUOUS SCAN · NYSE MINUTE CANDLES · TSX DAILY</div><h2 id="trading-desk-title">Your investing desk</h2><p>AI reviews each new candle and suggests an action. Safety rules check every order before a practice trade.</p></div><span className="practice-badge"><Landmark size={14}/> Sample practice account</span></header>

    <div className="simple-money-cards"><article><span><Landmark size={15}/> Sample account balance</span><b>{money(account.bankCash + account.cash)}</b><small>Preloaded practice balance · not a linked bank</small></article><article><span><Wallet size={15}/> Investing cash</span><b>{money(account.cash)}</b><small>Available to the strategy</small></article><article><span><Activity size={15}/> Stock portfolio</span><b>{money(positionsValue)}</b><small>{holdings.length} stocks · latest available prices</small></article><article><span><TrendingUp size={15}/> Practice result</span><b className={totalPnl >= 0 ? 'desk-positive' : 'desk-negative'}>{totalPnl >= 0 ? '+' : '−'}{money(Math.abs(totalPnl))}</b><small>Changes as practice prices move</small></article></div>

    <div className="simple-setup-grid"><form className="simple-budget" onSubmit={updateBudget}><div className="simple-section-title"><span className="simple-icon"><Wallet size={17}/></span><span><b>How much should the strategy use?</b><small>Move practice money from checking to investing cash.</small></span></div><label htmlFor="practice-budget">Investing budget <strong>{money(budget)}</strong></label><input id="practice-budget" type="range" min="500" max={START_BANK} step="500" value={budget} onChange={event => setBudget(Number(event.target.value))}/><div className="simple-range-labels"><span>$500</span><span>{money(START_BANK)}</span></div><button type="submit" className="simple-primary">Set investing budget</button></form>
      <div className="simple-risk"><div className="simple-section-title"><span className="simple-icon risk"><Activity size={17}/></span><span><b>How much price movement feels okay?</b><small>This changes practice trade size and the exit threshold.</small></span><strong>{risk.label}</strong></div><input type="range" min="0" max="100" step="1" value={volatility} onChange={event => setVolatility(Number(event.target.value))} aria-label="Risk level"/><div className="simple-range-labels"><span>Lower risk</span><span>Higher risk</span></div><div className="simple-risk-explain"><ShieldCheck size={14}/> Up to {(risk.maxPositionPct * 100).toFixed(0)}% per stock · practice exit threshold {(risk.stopLossPct * 100).toFixed(1)}%</div></div></div>

    <div className="simple-controls"><div><span className={running ? 'simple-dot' : 'simple-dot paused'}/><b>{running ? 'Automatic practice trading on' : 'Automatic practice trading paused'}</b><small>{loading ? 'Checking prices…' : `Last check: ${freshness}`}</small></div><button type="button" onClick={() => setRunning(value => !value)}>{running ? <><Pause size={15}/> Pause</> : <><Play size={15}/> Start automatic trading</>}</button><button type="button" className="simple-reset" onClick={resetPractice}><RotateCcw size={14}/> Reset practice account</button></div>

    <div className="simple-how-it-works" aria-label="How the automated scan works"><article><span>01</span><div><b>Read the candles</b><small>Checks your {watchlist.length} selected stocks once a minute. TSX gets daily candles.</small></div></article><article><span>02</span><div><b>AI explains the pattern</b><small>Reviews candle shape and trend, then suggests buy, sell, or wait.</small></div></article><article><span>03</span><div><b>Rules check the order</b><small>Cash, position limits, candle bias, and exit rules are checked independently.</small></div></article></div>

    {error && <div className="simple-error" role="alert">{error}</div>}
    {loading && <div className="simple-loading" role="status"><span/>Checking available price history…</div>}

    <div className="simple-analysis-heading"><div className="simple-section-title simple-analysis-title"><span className="simple-icon ai"><Sparkles size={17}/></span><span><b>Market scan · {aiStatus}</b><small>New candles only trigger a fresh AI review. Safety rules can change a suggestion to HOLD.</small></span></div></div>
    <div className="simple-watch-grid" aria-label="Candlestick analysis for every watched stock">{watchlist.map(symbol => { const analysis = analyses[symbol]; const quote = analysis?.quote; return <article className="simple-stock-card" key={symbol}><div className="simple-stock-card-head"><span><b>{tickerName(symbol)}</b><small>{exchangeName(symbol)} · {quote?.interval === '1day' || quote?.interval === '1d' ? 'daily candles' : 'minute candles'}</small></span><b className="simple-stock-price">{analysis?.price ? `${quote?.currency === 'CAD' ? 'CA$' : '$'}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(analysis.price)}` : '—'}</b><button type="button" className="simple-remove-stock" aria-label={`Remove ${tickerName(symbol)}`} onClick={() => removeStock(symbol)}><X size={14}/></button></div><MiniCandles points={quote?.points || []}/><div className="simple-pattern-row"><span className={`simple-pattern-badge ${analysis?.pattern.bias || 'neutral'}`}>{analysis?.pattern.name || 'Waiting for candles'}</span><span className={`simple-pattern-bias ${analysis?.pattern.bias || 'neutral'}`}>{analysis?.pattern.bias || 'neutral'}</span></div><p className="simple-pattern-explanation">{analysis?.pattern.explanation || 'Candlestick analysis will appear when price history loads.'}</p><div className="simple-stock-decision"><span className={`simple-action ${(analysis?.action || 'scan').toLowerCase()}`}>{analysis?.action || 'SCANNING'}</span><small>{quote?.source || 'Waiting for market data'}</small></div></article>; })}</div>
    <section className="simple-universe" aria-labelledby="stock-directory-title"><div className="simple-section-title"><span className="simple-icon"><Search size={17}/></span><span><b id="stock-directory-title">Browse all NYSE & TSX listings</b><small>Search the full exchange directory, then add stocks to the scan watchlist. Up to 10 can be scanned each minute.</small></span></div><div className="simple-directory-controls"><div className="simple-exchange-tabs"><button type="button" className={directoryExchange === 'NYSE' ? 'active' : ''} onClick={() => { setDirectoryExchange('NYSE'); setDirectoryPage(1); }}>NYSE</button><button type="button" className={directoryExchange === 'TSX' ? 'active' : ''} onClick={() => { setDirectoryExchange('TSX'); setDirectoryPage(1); }}>TSX</button></div><label className="simple-directory-search"><Search size={15}/><input value={directoryQuery} onChange={event => { setDirectoryQuery(event.target.value); setDirectoryPage(1); }} placeholder="Search ticker or company" aria-label="Search stock listings"/></label></div>{directoryError && <p className="simple-directory-error" role="status">{directoryError}</p>}<div className="simple-directory-list">{directoryResults.map(stock => { const symbol = `${stock.symbol}:${stock.exchange}`; const added = watchlist.includes(symbol); return <div className="simple-directory-item" key={symbol}><span><b>{stock.symbol}</b><small>{stock.name}</small></span><small>{stock.currency} · {stock.exchange}</small><button type="button" onClick={() => added ? removeStock(symbol) : addStock(stock)} disabled={!added && watchlist.length >= 10}>{added ? <><X size={13}/> Remove</> : <><Plus size={13}/> Add</>}</button></div>; })}{!directoryResults.length && !directoryBusy && <div className="simple-empty">{directoryError ? 'Add your market-data key in Vercel to load the exchange directory.' : 'No matching listings found.'}</div>}{directoryBusy && <div className="simple-directory-loading">Loading {directoryExchange} listings…</div>}</div>{!directoryQuery.trim() && <button type="button" className="simple-directory-more" onClick={() => setDirectoryPage(page => page + 1)} disabled={directoryBusy || directoryResults.length >= 10000}>Load next 100 listings</button>}</section>
    <div className="simple-section-title simple-portfolio-title"><span className="simple-icon"><Wallet size={17}/></span><span><b>Your practice stocks</b><small>Each stock's value updates when new market prices are available.</small></span></div>
    {holdings.length ? <div className="simple-holdings"><div className="simple-holding-header"><span>STOCK</span><span>SHARES</span><span>PRICE</span><span>VALUE</span><span>RESULT</span></div>{holdings.map(holding => <div className="simple-holding" key={holding.symbol}><b>{holding.symbol}</b><span>{holding.shares.toFixed(4)}</span><span>{money(holding.price)}</span><b>{money(holding.marketValue)}</b><strong className={holding.pnl >= 0 ? 'desk-positive' : 'desk-negative'}>{holding.pnl >= 0 ? '+' : '−'}{money(Math.abs(holding.pnl))}</strong></div>)}</div> : <div className="simple-empty">No practice stocks yet. The strategy will add a position only when its buy rule is met.</div>}

    <div className="simple-analysis-heading"><div className="simple-section-title simple-analysis-title"><span className="simple-icon ai"><Sparkles size={17}/></span><span><b>Decision log</b><small>See the AI suggestion, any rule checks, and why the final action was taken.</small></span></div><button type="button" onClick={explainLatestDecision} disabled={!account.decisions?.length || aiBusy}>{aiBusy ? 'Asking AI…' : 'Explain latest'}</button></div>
    {account.decisions?.length ? <div className="simple-decisions">{account.decisions.slice(0, 5).map(item => <article key={item.id}><span className={`simple-action ${item.action.toLowerCase()}`}>{item.action}</span><div><b>{item.symbol} · {money(item.price)}</b><small><strong>{item.source && item.source !== 'Rules' ? 'AI' : 'Rules'}{item.suggestedAction && item.suggestedAction !== item.action ? ` suggested ${item.suggestedAction} → rules changed it to ${item.action}` : item.suggestedAction ? ` suggested ${item.suggestedAction}` : ' check'}:</strong> {item.reason}</small></div><time>{item.time ? new Date(item.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Initial setup'}</time></article>)}</div> : <div className="simple-empty">Waiting for a new price update. The strategy will show whether it buys, sells, or waits and why.</div>}
    {aiExplanation && <div className="simple-ai-explanation"><Sparkles size={15}/><p>{aiExplanation}</p></div>}

    {account.fills.length > 0 && <div className="simple-fill-summary"><b>Recent practice orders</b>{account.fills.slice(0, 3).map(fill => <span key={fill.id}><i className={fill.side}/>{fill.side.toUpperCase()} {fill.symbol} · {fill.shares.toFixed(4)} shares at {money(fill.price)}</span>)}</div>}
    <p className="simple-disclosure"><CircleHelp size={14}/> Practice account with fictional balances and simulated trades. Market prices may be delayed. No bank or brokerage is connected, and practice results do not predict future returns.</p>
  </section>;
}
