import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Landmark, LockKeyhole, Pause, Play, RotateCcw, ShieldCheck, SlidersHorizontal, TrendingUp, Wallet } from 'lucide-react';
import { evaluateMovingAverageCrossover, getVolatilityProfile } from './finance';
import './trading-desk.css';
import './trading-risk.css';

const SYMBOLS = ['SPY', 'AAPL', 'MSFT', 'TSLA'];
const STARTING_BANK_CASH = 25000;
const STARTING_TRADING_CASH = 10000;
const dollars = value => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}`;

function createSeededPaperAccount(bankCash, marks, maxPositionPct) {
  const positions = {};
  const decisions = [];
  let cash = STARTING_TRADING_CASH;
  for (const symbol of SYMBOLS) {
    const price = Number(marks[symbol]);
    if (!Number.isFinite(price) || price <= 0) continue;
    const allocation = STARTING_TRADING_CASH * Math.min(0.1, maxPositionPct);
    const shares = Number((allocation / price).toFixed(6));
    const cost = shares * price;
    positions[symbol] = { shares, entryPrice: price, mark: price };
    cash -= cost;
    decisions.push({ id: `starter-${symbol}`, symbol, action: 'START', price, reason: 'Fictional demo starter holding at the displayed mark; not an investment recommendation.' });
  }
  return { version: 2, cash: Number(cash.toFixed(2)), bankCash, positions, fills: [], decisions, realizedPnl: 0, deposits: 0, seededDemoPortfolio: Object.keys(positions).length > 0 };
}

function seedAccount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('velora-daytrade-paper') || 'null');
    if (saved?.version === 2 && Number.isFinite(saved.cash) && Number.isFinite(saved.bankCash) && saved.positions && Array.isArray(saved.fills)) return saved;
  } catch { /* Use the clearly labeled demo-only account. */ }
  return { version: 2, cash: STARTING_TRADING_CASH, bankCash: STARTING_BANK_CASH, positions: {}, fills: [], decisions: [], realizedPnl: 0, deposits: 0, seededDemoPortfolio: false };
}

export default function TradingDesk({ autoStart = false }) {
  const [symbol, setSymbol] = useState('SPY');
  const [speed, setSpeed] = useState(600);
  const [volatility, setVolatility] = useState(35);
  const [transferAmount, setTransferAmount] = useState('1000');
  const [account, setAccount] = useState(seedAccount);
  const [markets, setMarkets] = useState({});
  const [latestMarks, setLatestMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(0);
  const accountRef = useRef(account);
  const cursorRef = useRef(0);
  const processedIndexRef = useRef({});
  const latestMarksRef = useRef(latestMarks);
  const market = markets[symbol] || null;
  const riskProfile = useMemo(() => getVolatilityProfile(volatility), [volatility]);
  const currentPrice = market?.points?.[cursor]?.close || null;
  const position = account.positions[symbol] || { shares: 0, entryPrice: 0 };
  const markedValue = Object.entries(account.positions).reduce((sum, [ticker, holding]) => {
    const selectedPrice = ticker === symbol ? currentPrice : latestMarks[ticker];
    const price = Number(selectedPrice || holding.mark || holding.entryPrice);
    return sum + (Number(price) || Number(holding.entryPrice)) * holding.shares;
  }, 0);
  const equity = account.cash + markedValue;
  const pnl = account.realizedPnl + Object.entries(account.positions).reduce((sum, [ticker, holding]) => {
    const price = Number(ticker === symbol ? currentPrice : latestMarks[ticker]) || Number(holding.mark) || Number(holding.entryPrice);
    return sum + (price - holding.entryPrice) * holding.shares;
  }, 0);
  const replayPoints = useMemo(() => market?.points?.slice(0, cursor + 1) || [], [market, cursor]);
  const chartPoints = useMemo(() => {
    const visible = replayPoints.slice(-90);
    if (visible.length < 2) return '';
    const prices = visible.map(point => point.close);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const spread = high - low || 1;
    return prices.map((price, index) => `${index / (prices.length - 1) * 100},${96 - ((price - low) / spread) * 82}`).join(' ');
  }, [replayPoints]);

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { latestMarksRef.current = latestMarks; }, [latestMarks]);
  useEffect(() => {
    try { window.localStorage.setItem('velora-daytrade-paper', JSON.stringify(account)); }
    catch { /* The simulation is still available for this browser session. */ }
  }, [account]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarket() {
      setLoading(true);
      setError('');
      setRunning(false);
      cursorRef.current = 0;
      setCursor(0);
      try {
        const response = await fetch(`/api/market?symbols=${SYMBOLS.join(',')}&range=1d`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.quotes)) throw new Error(data.error || 'Intraday replay is unavailable.');
        const available = Object.fromEntries(data.quotes.filter(quote => Array.isArray(quote.points) && quote.points.length >= 12).map(quote => [quote.symbol, quote]));
        if (!Object.keys(available).length) throw new Error('Intraday replay needs at least 12 available price observations.');
        const marks = Object.fromEntries(Object.entries(available).map(([ticker, quote]) => [ticker, quote.points.at(-1).close]));
        setMarkets(available);
        processedIndexRef.current = {};
        setLatestMarks(previous => ({ ...previous, ...marks }));
        if (!accountRef.current.seededDemoPortfolio) {
          const current = accountRef.current;
          const hasExistingActivity = Object.keys(current.positions || {}).length > 0 || current.fills.length > 0;
          const seeded = hasExistingActivity
            ? { ...current, seededDemoPortfolio: true }
            : createSeededPaperAccount(current.bankCash, marks, riskProfile.maxPositionPct);
          accountRef.current = seeded;
          setAccount(seeded);
        }
        setRunning(autoStart);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setMarkets({});
          setError(requestError.message || 'Market replay is unavailable.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMarket();
    return () => controller.abort();
  }, [autoStart]);

  useEffect(() => {
    if (!running || !market?.points?.length) return undefined;
    const timer = window.setInterval(() => {
      const next = cursorRef.current + 1;
      if (next >= market.points.length) {
        setRunning(false);
        return;
      }
      cursorRef.current = next;
      setCursor(next);
      const replayTime = Date.parse(market.points[next].date);
      let currentAccount = accountRef.current;
      const markUpdates = {};
      const newDecisions = [];
      const newFills = [];
      const positions = { ...currentAccount.positions };
      let cash = currentAccount.cash;
      let realizedPnl = currentAccount.realizedPnl;

      for (const ticker of SYMBOLS) {
        const series = markets[ticker]?.points || [];
        let historyIndex = -1;
        for (let pointIndex = 0; pointIndex < series.length; pointIndex += 1) {
          if (Date.parse(series[pointIndex].date) <= replayTime) historyIndex = pointIndex;
          else break;
        }
        if (historyIndex < 0) continue;
        if (historyIndex <= (processedIndexRef.current[ticker] ?? -1)) continue;
        processedIndexRef.current[ticker] = historyIndex;
        const candlePrice = Number(series[historyIndex].close);
        if (!Number.isFinite(candlePrice) || candlePrice <= 0) continue;
        markUpdates[ticker] = candlePrice;
        const holding = positions[ticker] || { shares: 0, entryPrice: 0 };
        const closeSeries = series.slice(0, historyIndex + 1).map(point => point.close);
        const signal = evaluateMovingAverageCrossover(closeSeries, closeSeries.length - 1, holding.shares > 0, riskProfile.fastWindow, riskProfile.slowWindow);
        const stopHit = holding.shares > 0 && candlePrice <= holding.entryPrice * (1 - riskProfile.stopLossPct);
        const side = stopHit ? 'sell' : signal;
        if (side === 'buy' && cash > 0) {
          const portfolioEquity = cash + Object.entries(positions).reduce((sum, [heldTicker, held]) => sum + (markUpdates[heldTicker] || latestMarksRef.current[heldTicker] || held.mark || held.entryPrice) * held.shares, 0);
          const tickerValue = holding.shares * (markUpdates[ticker] || holding.entryPrice);
          const desired = Math.max(0, portfolioEquity * riskProfile.maxPositionPct - tickerValue);
          const allocation = Math.min(cash, desired);
          const shares = Number((allocation / candlePrice).toFixed(6));
          if (shares > 0) {
            const cost = shares * candlePrice;
            positions[ticker] = {
              shares: Number((holding.shares + shares).toFixed(6)),
              entryPrice: (holding.shares * holding.entryPrice + cost) / (holding.shares + shares),
              mark: candlePrice,
            };
            cash = Number((cash - cost).toFixed(2));
            const fill = { id: `${Date.now()}-${ticker}-${next}`, symbol: ticker, side: 'buy', shares, price: candlePrice, time: series[historyIndex].date, reason: `Fast ${riskProfile.fastWindow}-mark average crossed above slow ${riskProfile.slowWindow}-mark average` };
            newFills.push(fill);
            newDecisions.push({ id: `decision-${fill.id}`, symbol: ticker, action: 'BUY', price: candlePrice, time: fill.time, reason: fill.reason });
          }
        } else if (side === 'sell' && holding.shares > 0) {
          const proceeds = holding.shares * candlePrice;
          const tradePnl = (candlePrice - holding.entryPrice) * holding.shares;
          const reason = stopHit ? `${(riskProfile.stopLossPct * 100).toFixed(1)}% volatility-profile stop reached` : 'Fast average crossed below slow average';
          const fill = { id: `${Date.now()}-${ticker}-${next}`, symbol: ticker, side: 'sell', shares: holding.shares, price: candlePrice, time: series[historyIndex].date, reason, pnl: tradePnl };
          newFills.push(fill);
          newDecisions.push({ id: `decision-${fill.id}`, symbol: ticker, action: 'SELL', price: candlePrice, time: fill.time, reason, pnl: tradePnl });
          cash = Number((cash + proceeds).toFixed(2));
          realizedPnl += tradePnl;
          delete positions[ticker];
        } else if (next % 15 === 0) {
          newDecisions.push({ id: `hold-${ticker}-${next}`, symbol: ticker, action: 'HOLD', price: candlePrice, time: series[historyIndex].date, reason: signal === 'hold' ? 'No qualifying moving-average crossover; no order.' : 'Position and cash guardrails prevent another entry.' });
        }
      }

      if (newFills.length || newDecisions.length) {
        const updated = {
          ...currentAccount,
          cash,
          positions,
          realizedPnl,
          fills: [...newFills, ...currentAccount.fills].slice(0, 60),
          decisions: [...newDecisions, ...(currentAccount.decisions || [])].slice(0, 80),
        };
        accountRef.current = updated;
        setAccount(updated);
      }
      if (Object.keys(markUpdates).length) setLatestMarks(previous => ({ ...previous, ...markUpdates }));
    }, speed);
    return () => window.clearInterval(timer);
  }, [running, market, markets, riskProfile, speed]);

  function resetSession() {
    setRunning(false);
    cursorRef.current = 0;
    processedIndexRef.current = {};
    setCursor(0);
    const fresh = createSeededPaperAccount(account.bankCash, latestMarks, riskProfile.maxPositionPct);
    accountRef.current = fresh;
    setAccount(fresh);
  }

  function fundPaperPortfolio(event) {
    event.preventDefault();
    const amount = Number(transferAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > accountRef.current.bankCash) {
      setError(`Enter an amount between $0.01 and ${dollars(accountRef.current.bankCash)} of demo checking cash.`);
      return;
    }
    setError('');
    const updated = {
      ...accountRef.current,
      bankCash: Number((accountRef.current.bankCash - amount).toFixed(2)),
      cash: Number((accountRef.current.cash + amount).toFixed(2)),
      deposits: accountRef.current.deposits + amount,
    };
    accountRef.current = updated;
    setAccount(updated);
  }

  const lastUpdate = market?.points?.[cursor]?.date ? new Date(market.points[cursor].date) : null;
  const marketDay = market?.points?.at(-1)?.date ? new Date(market.points.at(-1).date) : null;

  return <section className="trading-desk panel" aria-labelledby="trading-desk-title">
    <div className="desk-header"><div><div className="eyebrow">VELORA PAPER DESK <span className="desk-demo-pill"><i/> FICTIONAL DEMO · PAPER ONLY</span></div><h2 id="trading-desk-title">Your wealth, analyzed in real time.</h2><p>Watch a transparent rules-based strategy analyze prices and place simulated portfolio trades.</p></div><div className={running ? 'desk-live-indicator running' : 'desk-live-indicator'}><i/>{running ? 'REPLAYING' : 'READY'}</div></div>
    <div className="desk-account-strip"><div className="desk-bank-icon"><Landmark size={17}/></div><div className="desk-account-name"><b>Velora Fictional Checking</b><small>•••• 2048 · invented demo balance, not a bank connection</small></div><span className="desk-account-divider"/><div className="desk-bank-balance"><small>DEMO BANK BALANCE</small><b>{dollars(account.bankCash)}</b></div><div className="desk-trading-balance"><small>PAPER BUYING POWER</small><b>{dollars(account.cash)}</b></div><span className="desk-account-lock"><LockKeyhole size={13}/> Fake funds</span></div>
    <div className="desk-metrics"><div><span>Total fictional wealth</span><b>{dollars(account.bankCash + equity)}</b></div><div><span>Paper portfolio value</span><b>{dollars(equity)}</b></div><div><span>Portfolio P/L</span><b className={pnl >= 0 ? 'desk-positive' : 'desk-negative'}>{pnl >= 0 ? '+' : '−'}{dollars(Math.abs(pnl))}</b></div><div><span>Trades · open holdings</span><b>{account.fills.length} · {Object.keys(account.positions).length}</b></div></div>
    <form className="desk-fund-row" onSubmit={fundPaperPortfolio}><div><Wallet size={16}/><span><b>Move demo cash to paper buying power</b><small>Internal fictional transfer only. No real funds move.</small></span></div><label><span>DEMO AMOUNT</span><input type="number" min="0.01" step="0.01" max={account.bankCash} value={transferAmount} onChange={event => setTransferAmount(event.target.value)} aria-label="Demo cash transfer amount"/></label><button type="submit" disabled={account.bankCash <= 0}>Add to paper portfolio</button></form>
    <div className="desk-volatility"><div className="desk-volatility-heading"><span className="desk-volatility-icon"><SlidersHorizontal size={16}/></span><span><b>Investment volatility preference</b><small>{riskProfile.label} · affects new paper entries, stop distance, and trend window</small></span><strong>{volatility}/100</strong></div><input type="range" min="0" max="100" step="1" value={volatility} onChange={event => setVolatility(Number(event.target.value))} aria-label="Investment volatility preference"/><div className="desk-volatility-scale"><span>Lower swings · smaller exposure</span><span>Higher swings · larger exposure</span></div><div className="desk-risk-details"><span>Max new-stock weight <b>{(riskProfile.maxPositionPct * 100).toFixed(0)}%</b></span><span>Simulated stop <b>{(riskProfile.stopLossPct * 100).toFixed(1)}%</b></span><span>Trend windows <b>{riskProfile.fastWindow}/{riskProfile.slowWindow} marks</b></span></div></div>
    <div className="desk-toolbar"><label><span>SYMBOL</span><select value={symbol} disabled={running} onChange={event => setSymbol(event.target.value)}>{SYMBOLS.map(value => <option key={value}>{value}</option>)}</select></label><label><span>REPLAY SPEED</span><select value={speed} disabled={running} onChange={event => setSpeed(Number(event.target.value))}><option value={250}>4 marks/sec · fast</option><option value={600}>1.7 marks/sec · standard</option><option value={1200}>0.8 marks/sec · slow</option></select></label><div className="desk-feed"><span className="desk-feed-dot"/><b>{market?.source || 'Market data'}</b><small>{marketDay && !Number.isNaN(marketDay.getTime()) ? marketDay.toLocaleDateString() : loading ? 'Fetching available session…' : 'No session loaded'} · may be delayed</small></div><button className="desk-reset" type="button" onClick={resetSession}><RotateCcw size={14}/> Reset demo</button></div>
    {error && <div className="desk-error" role="alert">{error}</div>}
    {loading && <div className="desk-loading" role="status"><span/><b>Loading real intraday history…</b></div>}
    {market && <>
      <div className="desk-chart-heading"><div><span>{symbol} · replay price</span><b>{currentPrice ? dollars(currentPrice) : '—'}</b></div><div><small>{cursor + 1} / {market.points.length} price marks</small><small>{lastUpdate && !Number.isNaN(lastUpdate.getTime()) ? lastUpdate.toLocaleTimeString() : 'Waiting to start'}</small></div></div>
      <div className="desk-chart"><div className="desk-chart-grid"><i/><i/><i/></div>{chartPoints && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${symbol} intraday replay chart`}><polyline points={chartPoints}/></svg>}<div className="desk-chart-cursor" style={{ left: `${Math.min(100, (cursor / Math.max(1, market.points.length - 1)) * 100)}%` }}/></div>
      <div className="desk-chart-foot"><span>{market.points[0]?.date ? new Date(market.points[0].date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Session start'}</span><span>Historical session playback · not a streaming quote</span><span>{market.points.at(-1)?.date ? new Date(market.points.at(-1).date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Session end'}</span></div>
      <div className="desk-strategy"><span className="desk-strategy-icon"><Activity size={16}/></span><span><b>Automated trend analysis · {riskProfile.label.toLowerCase()} volatility</b><small>Scans {Object.keys(markets).join(', ')} · max {(riskProfile.maxPositionPct * 100).toFixed(0)}% portfolio weight per stock · {(riskProfile.stopLossPct * 100).toFixed(1)}% paper stop</small></span><span className="desk-rule-badge"><ShieldCheck size={13}/> EXPLAINABLE RULES</span></div>
      <div className="desk-actions"><button className="desk-run" type="button" onClick={() => { if (cursor >= market.points.length - 1) { cursorRef.current = 0; processedIndexRef.current = {}; setCursor(0); } setRunning(value => !value); }} disabled={loading || Boolean(error)}>{running ? <><Pause size={16}/> Pause replay</> : <><Play size={16}/> {cursor >= market.points.length - 1 ? 'Replay session again' : 'Run paper-trading replay'}</>}</button><span>All orders are hypothetical. This simple strategy is for demonstration, not a trading recommendation.</span></div>
    </>}
    {!market && !loading && !error && <div className="desk-empty">Choose a symbol to load an available market session.</div>}
    <div className="desk-positions"><div className="desk-log-head"><b>Paper stock portfolio</b><span>Simulated holdings · marked to replay prices</span></div>{Object.entries(account.positions).length ? Object.entries(account.positions).map(([ticker, holding]) => { const mark = Number(latestMarks[ticker] || holding.mark || holding.entryPrice); const positionValue = mark * holding.shares; const positionPnl = (mark - holding.entryPrice) * holding.shares; return <div className="desk-position" key={ticker}><b>{ticker}</b><span>{holding.shares.toFixed(4)} shares</span><span>Avg. {dollars(holding.entryPrice)}</span><span>Mark {dollars(mark)}</span><strong className={positionPnl >= 0 ? 'desk-positive' : 'desk-negative'}>{positionPnl >= 0 ? '+' : '−'}{dollars(Math.abs(positionPnl))}</strong><span>{dollars(positionValue)}</span></div>; }) : <div className="desk-no-fills">No open paper positions yet. The strategy will show its first buy only if a trend rule triggers.</div>}</div>
    <div className="desk-trade-log"><div className="desk-log-head"><b>Automated analysis & paper fills</b><span>Latest decisions first · browser-local</span></div>{account.decisions?.length ? account.decisions.slice(0, 6).map(decision => <div className="desk-fill" key={decision.id}><span className={`desk-fill-side ${decision.action.toLowerCase()}`}>{decision.action}</span><b>{decision.symbol}</b><span>{dollars(decision.price)}</span><small>{decision.reason}</small></div>) : <div className="desk-no-fills"><TrendingUp size={15}/> The replay records BUY, SELL, or HOLD analysis here as each price mark is reviewed.</div>}</div>
    <div className="desk-trade-log"><div className="desk-log-head"><b>Paper fill tape</b><span>Last 5 simulated fills</span></div>{account.fills.length ? account.fills.slice(0, 5).map(fill => <div className="desk-fill" key={fill.id}><span className={`desk-fill-side ${fill.side}`}>{fill.side === 'buy' ? <ArrowDownRight size={13}/> : <ArrowUpRight size={13}/>} {fill.side.toUpperCase()}</span><b>{fill.symbol}</b><span>{fill.shares.toFixed(4)} shares @ {dollars(fill.price)}</span><small>{fill.reason}</small></div>) : <div className="desk-no-fills">No simulated fills yet. A HOLD is a valid analysis; trades occur only when the rule triggers.</div>}</div>
    <div className="desk-safety"><ShieldCheck size={14}/> The volatility slider adjusts deterministic paper sizing and stops; it does not control an AI or guarantee returns. Demo balances are fictional, quotes may be delayed, and no real bank or broker is connected.</div>
  </section>;
}
