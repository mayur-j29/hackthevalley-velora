import React, { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, ChevronDown, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { simulateHistoricalInvestment } from './finance';
import './market.css';

const money = (value, digits = 2) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`;
const options = [
  { label: 'S&P 500 · SPY ETF proxy', symbol: 'S&P 500' },
  { label: 'Apple · AAPL', symbol: 'AAPL' },
  { label: 'Microsoft · MSFT', symbol: 'MSFT' },
  { label: 'Tesla · TSLA', symbol: 'TSLA' },
];

function HistoryChart({ result }) {
  const points = result.equityCurve;
  const values = points.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const line = points.map((point, index) => `${20 + index / (points.length - 1) * 660},${104 - (point.value - min) / span * 76}`).join(' ');
  const positive = result.profitLoss >= 0;
  return <div className="replay-chart-wrap">
    <svg className={`replay-chart ${positive ? 'positive' : 'negative'}`} viewBox="0 0 700 130" role="img" aria-label={`Historical hypothetical value from ${result.startDate} to ${result.endDate}`}>
      <defs><linearGradient id="replayFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={positive ? '#3c8860' : '#ca715d'} stopOpacity=".2"/><stop offset="100%" stopColor={positive ? '#3c8860' : '#ca715d'} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2].map(row => <line key={row} x1="20" x2="680" y1={28 + row * 38} y2={28 + row * 38} className="replay-grid"/>)}
      <polygon points={`20,105 ${line} 680,105`} fill="url(#replayFill)"/>
      <polyline points={line} className="replay-line"/>
      <circle cx="20" cy={104 - (points[0].value - min) / span * 76} r="3.5" className="replay-point start"/>
      <circle cx="680" cy={104 - (points.at(-1).value - min) / span * 76} r="4" className="replay-point end"/>
    </svg>
    <div className="replay-dates"><span>{new Date(result.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span><span>{new Date(result.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span></div>
  </div>;
}

function PriceChart({ points, symbol }) {
  const values = points.map(point => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const line = values.map((value, index) => `${24 + index / Math.max(1, values.length - 1) * 752},${112 - (value - min) / span * 86}`).join(' ');
  const rising = values.at(-1) >= values[0];
  return <div className="live-price-chart"><div className="live-chart-heading"><b>{symbol === 'S&P 500' ? 'S&P 500 ETF proxy' : symbol} · price today</b><span>{money(min)} – {money(max)}</span></div><svg viewBox="0 0 800 140" role="img" aria-label={`${symbol} intraday prices`}><defs><linearGradient id="marketPriceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={rising ? '#37845c' : '#c56b5a'} stopOpacity=".2"/><stop offset="1" stopColor={rising ? '#37845c' : '#c56b5a'} stopOpacity="0"/></linearGradient></defs>{[0,1,2].map(row => <line key={row} x1="24" x2="776" y1={24 + row * 42} y2={24 + row * 42} className="replay-grid"/>)}<polygon points={`24,116 ${line} 776,116`} fill="url(#marketPriceFill)"/><polyline points={line} className={rising ? 'live-price-line' : 'live-price-line down'}/></svg><div className="live-chart-range"><span>Market open</span><span>Latest update</span></div></div>;
}

export default function MarketReplay({ safeSurplus, reserve, rails, persona = 'Adult', initialSymbol = 'S&P 500', onSymbolChange }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [range, setRange] = useState('1d');
  const [amount, setAmount] = useState('500');
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistory() {
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const response = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&range=${range}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.points)) throw new Error(data.error || 'Historical prices are unavailable.');
        setHistory(data);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setHistory(null);
          setError(requestError.message || 'Could not load market history.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadHistory();
    return () => {
      controller.abort();
      requestRef.current?.abort();
    };
  }, [symbol, range, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey(value => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    requestRef.current?.abort();
    setResult(null);
    setReview(null);
    setReviewing(false);
  }, [rails]);

  const close = history?.points.at(-1)?.close;
  const previousClose = range === '1d' ? history?.previousClose : history?.points.at(-2)?.close;
  const dayChange = close && previousClose ? (close / previousClose - 1) * 100 : null;
  const replay = result;
  const fetchFresh = () => setRefreshKey(value => value + 1);

  async function runReplay(event) {
    event.preventDefault();
    if (!history || reviewing) return;
    const simulation = simulateHistoricalInvestment({ amount, safeSurplus, railsEnabled: rails, points: history.points });
    setResult(simulation);
    setReview(null);
    setReviewing(true);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    const verdict = simulation.verdict === 'pass' ? 'PASS' : 'BLOCK';
    const reason = simulation.reason;
    try {
      const response = await fetch('/api/copilot', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Explain this ${history.period} historical paper replay of ${symbol}: the rules engine verdict is ${verdict}; the observed return was ${simulation.returnPct?.toFixed(2) ?? 'unavailable'}% and the observed peak-to-trough drawdown was ${simulation.maxDrawdownPct?.toFixed(2) ?? 'unavailable'}%. Explain that this is historical, not predictive. Do not recommend buying or selling.`,
          persona,
          projectedLow: 0,
          safeSurplus,
          protectedReserve: reserve,
          upcomingBills: 0,
          expectedIncome: 0,
          recurringMonthly: 0,
          investmentVerdict: verdict.toLowerCase(),
          investmentReason: reason,
          paperPlan: {
            asset: symbol,
            contribution: Number(amount) || 0,
            cadence: 'monthly',
            approvedSimulations: simulation.verdict === 'pass' ? 1 : 0,
            blockedSimulations: simulation.verdict === 'pass' ? 0 : 1,
            rulesVerdict: verdict,
            rulesReason: reason,
            historyWindow: range,
            historicalReturnPct: simulation.returnPct ?? 0,
            maxDrawdownPct: simulation.maxDrawdownPct ?? 0,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.answer) throw new Error('Gemini is unavailable');
      setReview({ mode: 'live', answer: data.answer });
    } catch {
      if (controller.signal.aborted) return;
      const answer = simulation.verdict === 'pass'
        ? `Over this historical window, the hypothetical ${symbol} position ${simulation.returnPct >= 0 ? 'gained' : 'lost'} ${Math.abs(simulation.returnPct).toFixed(2)}%, with a maximum observed peak-to-trough drawdown of ${simulation.maxDrawdownPct.toFixed(2)}%. This describes past prices only and does not predict future results; the deterministic rules engine approved this paper amount against today's safe-surplus estimate. No order was sent.`
        : `${reason} The deterministic rules engine blocked this replay; no paper position was recorded and no brokerage order was sent.`;
      setReview({ mode: 'local', answer });
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      setReviewing(false);
    }
  }

  return <section className="panel market-panel" aria-labelledby="market-title">
    <div className="market-head"><div><div className="eyebrow">MARKET WATCH <span className="market-real-pill"><i/> LIVE INTRADAY · MAY BE DELAYED</span></div><h2 id="market-title">Explore real market prices.</h2><p>Compare current prices and see how a practice investment would have moved over time.</p></div><button type="button" className="market-refresh" onClick={fetchFresh} disabled={loading} aria-label="Refresh market prices"><RefreshCw size={15}/></button></div>
    <div className="market-controls"><label><span>COMPANY OR INDEX</span><div className="select-wrap"><select value={symbol} onChange={event => { setSymbol(event.target.value); onSymbolChange?.(event.target.value); }} aria-label="Market symbol">{options.map(option => <option key={option.symbol} value={option.symbol}>{option.label}</option>)}</select><ChevronDown size={15}/></div></label><label><span>PRICE HISTORY</span><div className="select-wrap"><select value={range} onChange={event => setRange(event.target.value)} aria-label="Price history range"><option value="1d">Today · refreshes each minute</option><option value="6mo">6 months</option><option value="1y">1 year</option><option value="5y">5 years</option></select><ChevronDown size={15}/></div></label><div className="market-quote"><small>{range === '1d' ? 'LATEST INTRADAY PRICE' : 'LATEST ADJUSTED CLOSE'}</small><b>{loading ? 'Loading…' : close ? money(close) : '—'}</b>{!loading && dayChange !== null && <span className={dayChange >= 0 ? 'market-up' : 'market-down'}>{dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)}% {range === '1d' ? 'today' : 'last close'}</span>}</div></div>
    {loading && <div className="market-loading" role="status"><span className="market-loader-orb"><Activity size={18}/></span><div><b>Loading verified price history</b><small>Fetching daily adjusted closes for {symbol}…</small></div><span className="market-loading-bar"/></div>}
    {!loading && error && <div className="market-error" role="alert"><AlertTriangle size={17}/><span><b>Price history not loaded</b><small>{error} Check your connection and retry.</small></span><button onClick={fetchFresh}>Retry</button></div>}
    {!loading && history && <>
      <div className="market-data-meta"><span><i className="data-live-dot"/> {range === '1d' ? `${history.points.length} intraday price updates · refreshes every minute` : `${history.points.length} daily observations`}</span><span>{history.displaySymbol} · {history.source} · {history.currency} {range === '1d' ? 'prices' : 'adjusted close'}</span></div>
      {history.points.length > 1 && <PriceChart points={history.points} symbol={symbol}/>}
      <div className="intraday-price-card"><div><b>{symbol === 'S&P 500' ? 'S&P 500 ETF proxy' : symbol}</b><small>{history.marketState === 'REGULAR' ? 'Market is open' : 'Latest available market price'} · as of {history.points.at(-1)?.date ? new Date(history.points.at(-1).date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</small></div><span className={dayChange >= 0 ? 'market-up' : 'market-down'}>{dayChange >= 0 ? '+' : ''}{(dayChange || 0).toFixed(2)}%</span></div>
      <form className="market-replay-form" onSubmit={runReplay}><label><span>HYPOTHETICAL STARTING AMOUNT</span><div className="amount-input"><b>$</b><input type="number" min="1" step="1" max={safeSurplus} value={amount} onChange={event => { setAmount(event.target.value); setResult(null); setReview(null); }} aria-label="Historical paper investment amount"/></div></label><div className="market-safe-cap"><ShieldCheck size={15}/><span>Current safe surplus<b>{money(safeSurplus, 0)}</b></span></div><button type="submit" className="market-replay-button" disabled={reviewing || loading}><Sparkles size={15}/>{reviewing ? 'Reviewing the replay…' : 'Replay paper investment'}<ArrowUpRight size={15}/></button></form>
      {!rails && <div className="market-rails-off"><ShieldCheck size={16}/><span><b>Safety rails are off</b><small>Historical prices remain visible, but rules block every paper investment until rails are enabled.</small></span></div>}
      {replay && replay.verdict === 'blocked' && <div className="market-verdict blocked" role="alert"><ShieldCheck size={15}/><span><b>RULES ENGINE · BLOCK</b><small>{replay.reason}</small></span></div>}
      {replay && replay.verdict === 'unavailable' && <div className="market-verdict blocked" role="alert"><AlertTriangle size={15}/><span><b>REPLAY UNAVAILABLE</b><small>{replay.reason}</small></span></div>}
      {replay && replay.verdict === 'pass' && <div className="replay-result" aria-live="polite"><div className="replay-result-head"><div><span>HYPOTHETICAL OUTCOME · {history.period.toUpperCase()} <i className="rules-pass-pill">RULES PASS</i></span><b>{money(replay.endingValue, 2)}</b></div><div className={replay.profitLoss >= 0 ? 'replay-return positive' : 'replay-return negative'}>{replay.profitLoss >= 0 ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}<b>{replay.profitLoss >= 0 ? '+' : '−'}{money(Math.abs(replay.profitLoss), 2)}</b><small>{replay.returnPct >= 0 ? '+' : ''}{replay.returnPct.toFixed(2)}% total return</small></div></div><HistoryChart result={replay}/><div className="replay-stats"><span>Hypothetical shares<b>{replay.shares.toFixed(4)}</b></span><span>Peak-to-trough drawdown<b className="drawdown">−{replay.maxDrawdownPct.toFixed(2)}%</b></span><span>Period<b>{replay.startDate} — {replay.endDate}</b></span></div><div className="replay-footnote"><Check size={13}/>{replay.reason} Not a forecast: historical performance can differ materially from future results.</div></div>}
      {reviewing && <div className="market-loading" role="status"><span className="market-loader-orb"><Sparkles size={18}/></span><div><b>Gemini is explaining the replay</b><small>Rules made the decision; AI is reviewing historical context…</small></div><span className="market-loading-bar"/></div>}
      {review && <div className={`market-ai-review ${review.mode}`}><div><Sparkles size={14}/><b>{review.mode === 'live' ? 'GEMINI REVIEW' : 'LOCAL EXPLANATION'}</b></div><p>{review.answer}</p></div>}
    </>}
    <div className="market-boundary"><ShieldCheck size={13}/> Public market quotes may be delayed. Historical replay is informational and cannot predict future prices; all orders are pretend and stay in this browser.</div>
  </section>;
}
