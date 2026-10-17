import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Landmark, LockKeyhole, Pause, Play, RotateCcw, ShieldCheck, TrendingUp } from 'lucide-react';
import { evaluateMovingAverageCrossover } from './finance';
import './trading-desk.css';

const SYMBOLS = ['SPY', 'AAPL', 'MSFT', 'TSLA'];
const STARTING_BANK_CASH = 25000;
const STARTING_TRADING_CASH = 10000;
const dollars = value => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}`;

function seedAccount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('velora-daytrade-paper') || 'null');
    if (saved?.version === 1 && Number.isFinite(saved.cash) && Array.isArray(saved.fills)) return saved;
  } catch { /* Use the clearly labeled demo-only account. */ }
  return { version: 1, cash: STARTING_TRADING_CASH, bankCash: STARTING_BANK_CASH, positions: {}, fills: [] };
}

export default function TradingDesk({ autoStart = false }) {
  const [symbol, setSymbol] = useState('SPY');
  const [speed, setSpeed] = useState(600);
  const [account, setAccount] = useState(seedAccount);
  const [market, setMarket] = useState(null);
  const [latestMarks, setLatestMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(0);
  const accountRef = useRef(account);
  const cursorRef = useRef(0);
  const currentPrice = market?.points?.[cursor]?.close || null;
  const position = account.positions[symbol] || { shares: 0, entryPrice: 0 };
  const markedValue = Object.entries(account.positions).reduce((sum, [ticker, holding]) => {
    const price = ticker === symbol ? currentPrice : latestMarks[ticker];
    return sum + (Number(price) || Number(holding.entryPrice)) * holding.shares;
  }, 0);
  const equity = account.cash + markedValue;
  const pnl = equity - STARTING_TRADING_CASH;
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
        const response = await fetch(`/api/market?symbol=${symbol}&range=1d`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.points) || data.points.length < 12) throw new Error(data.error || 'Intraday replay needs at least 12 price observations.');
        setMarket(data);
        setLatestMarks(previous => ({ ...previous, [symbol]: data.points.at(-1).close }));
        setRunning(autoStart);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setMarket(null);
          setError(requestError.message || 'Market replay is unavailable.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMarket();
    return () => controller.abort();
  }, [symbol, autoStart]);

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

      const candlePrice = market.points[next].close;
      setLatestMarks(previous => ({ ...previous, [symbol]: candlePrice }));
      const currentAccount = accountRef.current;
      const holding = currentAccount.positions[symbol] || { shares: 0, entryPrice: 0 };
      const signal = evaluateMovingAverageCrossover(market.points.map(point => point.close), next, holding.shares > 0);
      const stopHit = holding.shares > 0 && candlePrice <= holding.entryPrice * 0.98;
      const side = stopHit ? 'sell' : signal;
      if (side === 'buy' && currentAccount.cash > 0) {
        const riskBudget = Math.min(STARTING_TRADING_CASH * 0.05, currentAccount.cash);
        const shares = Number((riskBudget / candlePrice).toFixed(6));
        if (shares > 0) {
          const cost = shares * candlePrice;
          const fill = { id: `${Date.now()}-${next}`, symbol, side: 'buy', shares, price: candlePrice, time: market.points[next].date, reason: 'Fast average crossed above slow average' };
          const nextAccount = { ...currentAccount, cash: Number((currentAccount.cash - cost).toFixed(2)), positions: { ...currentAccount.positions, [symbol]: { shares, entryPrice: candlePrice } }, fills: [fill, ...currentAccount.fills].slice(0, 30) };
          accountRef.current = nextAccount;
          setAccount(nextAccount);
        }
      } else if (side === 'sell' && holding.shares > 0) {
        const proceeds = holding.shares * candlePrice;
        const reason = stopHit ? '2% paper stop reached' : 'Fast average crossed below slow average';
        const fill = { id: `${Date.now()}-${next}`, symbol, side: 'sell', shares: holding.shares, price: candlePrice, time: market.points[next].date, reason };
        const positions = { ...currentAccount.positions };
        delete positions[symbol];
        const nextAccount = { ...currentAccount, cash: Number((currentAccount.cash + proceeds).toFixed(2)), positions, fills: [fill, ...currentAccount.fills].slice(0, 30) };
        accountRef.current = nextAccount;
        setAccount(nextAccount);
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [running, market, symbol, speed]);

  function resetSession() {
    setRunning(false);
    cursorRef.current = 0;
    setCursor(0);
    const fresh = { version: 1, cash: STARTING_TRADING_CASH, bankCash: STARTING_BANK_CASH, positions: {}, fills: [] };
    accountRef.current = fresh;
    setAccount(fresh);
  }

  const lastUpdate = market?.points?.[cursor]?.date ? new Date(market.points[cursor].date) : null;
  const marketDay = market?.points?.at(-1)?.date ? new Date(market.points.at(-1).date) : null;

  return <section className="trading-desk panel" aria-labelledby="trading-desk-title">
    <div className="desk-header"><div><div className="eyebrow">VELORA PAPER DESK <span className="desk-demo-pill"><i/> DEMO · NO REAL MONEY</span></div><h2 id="trading-desk-title">Intraday replay, paper trades.</h2><p>Watch a rules-based strategy step through today's available minute prices.</p></div><div className={running ? 'desk-live-indicator running' : 'desk-live-indicator'}><i/>{running ? 'REPLAYING' : 'READY'}</div></div>
    <div className="desk-account-strip"><div className="desk-bank-icon"><Landmark size={17}/></div><div className="desk-account-name"><b>Velora Demo Checking</b><small>•••• 2048 · fictional practice account</small></div><span className="desk-account-divider"/><div className="desk-bank-balance"><small>DEMO BANK BALANCE</small><b>{dollars(account.bankCash)}</b></div><div className="desk-trading-balance"><small>PAPER BUYING POWER</small><b>{dollars(account.cash)}</b></div><span className="desk-account-lock"><LockKeyhole size={13}/> Sample data</span></div>
    <div className="desk-metrics"><div><span>Paper equity</span><b>{dollars(equity)}</b></div><div><span>Session P/L</span><b className={pnl >= 0 ? 'desk-positive' : 'desk-negative'}>{pnl >= 0 ? '+' : '−'}{dollars(Math.abs(pnl))}</b></div><div><span>Trades today</span><b>{account.fills.length}</b></div><div><span>Open position</span><b>{position.shares ? `${position.shares.toFixed(4)} ${symbol}` : 'None'}</b></div></div>
    <div className="desk-toolbar"><label><span>SYMBOL</span><select value={symbol} disabled={running} onChange={event => setSymbol(event.target.value)}>{SYMBOLS.map(value => <option key={value}>{value}</option>)}</select></label><label><span>REPLAY SPEED</span><select value={speed} disabled={running} onChange={event => setSpeed(Number(event.target.value))}><option value={250}>4 marks/sec · fast</option><option value={600}>1.7 marks/sec · standard</option><option value={1200}>0.8 marks/sec · slow</option></select></label><div className="desk-feed"><span className="desk-feed-dot"/><b>{market?.source || 'Market data'}</b><small>{marketDay && !Number.isNaN(marketDay.getTime()) ? marketDay.toLocaleDateString() : loading ? 'Fetching available session…' : 'No session loaded'} · may be delayed</small></div><button className="desk-reset" type="button" onClick={resetSession}><RotateCcw size={14}/> Reset demo</button></div>
    {error && <div className="desk-error" role="alert">{error}</div>}
    {loading && <div className="desk-loading" role="status"><span/><b>Loading real intraday history…</b></div>}
    {market && <>
      <div className="desk-chart-heading"><div><span>{symbol} · replay price</span><b>{currentPrice ? dollars(currentPrice) : '—'}</b></div><div><small>{cursor + 1} / {market.points.length} price marks</small><small>{lastUpdate && !Number.isNaN(lastUpdate.getTime()) ? lastUpdate.toLocaleTimeString() : 'Waiting to start'}</small></div></div>
      <div className="desk-chart"><div className="desk-chart-grid"><i/><i/><i/></div>{chartPoints && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${symbol} intraday replay chart`}><polyline points={chartPoints}/></svg>}<div className="desk-chart-cursor" style={{ left: `${Math.min(100, (cursor / Math.max(1, market.points.length - 1)) * 100)}%` }}/></div>
      <div className="desk-chart-foot"><span>{market.points[0]?.date ? new Date(market.points[0].date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Session start'}</span><span>Historical session playback · not a streaming quote</span><span>{market.points.at(-1)?.date ? new Date(market.points.at(-1).date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Session end'}</span></div>
      <div className="desk-strategy"><span className="desk-strategy-icon"><Activity size={16}/></span><span><b>Moving-average crossover</b><small>3-mark / 5-mark averages · max 5% demo-cash per entry · 2% simulated stop</small></span><span className="desk-rule-badge"><ShieldCheck size={13}/> RULE-BASED</span></div>
      <div className="desk-actions"><button className="desk-run" type="button" onClick={() => { if (cursor >= market.points.length - 1) { cursorRef.current = 0; setCursor(0); } setRunning(value => !value); }} disabled={loading || Boolean(error)}>{running ? <><Pause size={16}/> Pause replay</> : <><Play size={16}/> {cursor >= market.points.length - 1 ? 'Replay session again' : 'Run paper-trading replay'}</>}</button><span>All orders are hypothetical. This simple strategy is for demonstration, not a trading recommendation.</span></div>
    </>}
    {!market && !loading && !error && <div className="desk-empty">Choose a symbol to load an available market session.</div>}
    <div className="desk-trade-log"><div className="desk-log-head"><b>Paper fill tape</b><span>Browser-local · last 5</span></div>{account.fills.length ? account.fills.slice(0, 5).map(fill => <div className="desk-fill" key={fill.id}><span className={`desk-fill-side ${fill.side}`}>{fill.side === 'buy' ? <ArrowDownRight size={13}/> : <ArrowUpRight size={13}/>} {fill.side.toUpperCase()}</span><b>{fill.symbol}</b><span>{fill.shares.toFixed(4)} shares @ {dollars(fill.price)}</span><small>{fill.reason}</small></div>) : <div className="desk-no-fills"><TrendingUp size={15}/> Run the replay to watch simulated rule-based fills appear here.</div>}</div>
    <div className="desk-safety"><ShieldCheck size={14}/> Demo checking is made-up sample data. Prices are historical market data; fills are local paper simulations. No bank link, bank transfer, broker, or real order is involved.</div>
  </section>;
}
