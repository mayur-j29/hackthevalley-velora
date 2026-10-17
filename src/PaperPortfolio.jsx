import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, BriefcaseBusiness, CircleHelp, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { readPaperAccount, subscribePaperAccount } from './paperAccount';
import './portfolio.css';

const money = value => `$${new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const tickerName = symbol => String(symbol).split(':')[0];

export default function PaperPortfolio() {
  const [account, setAccount] = useState(readPaperAccount);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const positions = useMemo(() => Object.entries(account.positions || {}).map(([symbol, position]) => {
    const mark = Number(quotes[symbol]) || Number(position.mark) || Number(position.entryPrice) || 0;
    const shares = Number(position.shares) || 0;
    const averageCost = Number(position.entryPrice) || 0;
    const marketValue = mark * shares;
    const cost = averageCost * shares;
    return { symbol, shares, mark, averageCost, marketValue, cost, pnl: marketValue - cost };
  }), [account.positions, quotes]);
  const investmentCash = Number(account.bankCash || 0) + Number(account.cash || 0);
  const holdingsValue = positions.reduce((sum, item) => sum + item.marketValue, 0);
  const totalValue = investmentCash + holdingsValue;
  const netPnl = Number(account.realizedPnl || 0) + positions.reduce((sum, item) => sum + item.pnl, 0);

  useEffect(() => subscribePaperAccount(setAccount), []);

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const symbols = Object.keys(account.positions || {});
    if (!symbols.length) { setQuotes({}); setError(''); setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ symbols: symbols.join(','), range: '1d' });
    fetch(`/api/market?${params}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.quotes)) throw new Error(data.error || 'Latest prices could not be loaded.');
        setQuotes(Object.fromEntries(data.quotes.map(quote => [quote.symbol, Number(quote.points?.at(-1)?.close) || 0])));
      })
      .catch(fetchError => { if (!controller.signal.aborted) setError(fetchError.message || 'Latest prices could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [account.positions, refresh]);

  return <section className="panel shared-portfolio" aria-labelledby="portfolio-title">
    <header className="shared-portfolio-head"><div><div className="eyebrow">ONE ACCOUNT · SAME AS AI TRADING</div><h2 id="portfolio-title">Your portfolio</h2><p>Checking cash, investing cash, stock holdings, and orders all come from the same demo account.</p></div><button className="portfolio-refresh" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Refresh stock prices"><RefreshCw size={15}/></button></header>
    <div className="shared-portfolio-summary">
      <article className="shared-total"><span><BriefcaseBusiness size={15}/> Total account value</span><b>{money(totalValue)}</b><small>Demo bank + investing cash + stock holdings</small></article>
      <article><span><LandmarkIcon/> Demo bank cash</span><b>{money(account.bankCash)}</b><small>Available to move into the strategy</small></article>
      <article><span><Wallet size={15}/> Investing cash</span><b>{money(account.cash)}</b><small>Available to the AI strategy</small></article>
      <article><span><Activity size={15}/> Practice result</span><b className={netPnl >= 0 ? 'portfolio-positive' : 'portfolio-negative'}>{netPnl >= 0 ? '+' : '−'}{money(Math.abs(netPnl))}</b><small>Based on saved fills and latest marks</small></article>
    </div>
    {loading && <div className="shared-portfolio-note" role="status"><span/> Updating stock prices…</div>}
    {error && <div className="portfolio-warning" role="status">{error} The last saved prices are still shown.</div>}
    {positions.length ? <div className="shared-holdings"><div className="shared-holdings-head"><span>STOCK</span><span>SHARES</span><span>AVG. COST</span><span>LAST PRICE</span><span>VALUE</span><span>CHANGE</span></div>{positions.map(item => <article key={item.symbol}><span><b>{tickerName(item.symbol)}</b><small>{item.symbol.includes(':') ? item.symbol.split(':')[1] : 'Market'}</small></span><span>{item.shares.toFixed(4)}</span><span>{money(item.averageCost)}</span><span>{money(item.mark)}</span><b>{money(item.marketValue)}</b><strong className={item.pnl >= 0 ? 'portfolio-positive' : 'portfolio-negative'}>{item.pnl >= 0 ? '+' : '−'}{money(Math.abs(item.pnl))}</strong></article>)}</div> : <div className="shared-portfolio-empty"><BriefcaseBusiness size={18}/><span><b>No stock holdings yet</b><small>When the strategy places a practice order, the holding will appear here automatically.</small></span></div>}
    <section className="shared-orders"><div className="shared-section-heading"><div><b>Recent AI decisions</b><small>Suggestions and final actions from the trading tab</small></div><span>{account.decisions?.length || 0} decisions</span></div>{account.decisions?.length ? account.decisions.slice(0, 5).map(item => <article key={item.id}><span className={`shared-action ${String(item.action).toLowerCase()}`}>{item.action}</span><div><b>{tickerName(item.symbol)} · {money(item.price)}</b><small>{item.source === 'AI' ? 'AI suggested' : 'Strategy suggested'} {item.suggestedAction || item.action} · final action {item.action}</small></div><time>{item.time ? new Date(item.time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Recently'}</time></article>) : <p className="shared-portfolio-muted">The first decision will show here after the next market scan.</p>}</section>
    {account.fills?.length > 0 && <section className="shared-orders"><div className="shared-section-heading"><div><b>Recent practice orders</b><small>Fills made by the strategy</small></div><span>{account.fills.length} orders</span></div>{account.fills.slice(0, 5).map(fill => <article key={fill.id}><span className={`shared-action ${fill.side}`}>{fill.side === 'buy' ? <ArrowDownLeft size={13}/> : <ArrowUpRight size={13}/>} {fill.side.toUpperCase()}</span><div><b>{tickerName(fill.symbol)} · {Number(fill.shares).toFixed(4)} shares</b><small>{money(fill.price)} per share · {fill.reason || 'Strategy practice order'}</small></div><time>{fill.time ? new Date(fill.time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Recently'}</time></article>)}</section>}
    <div className="shared-portfolio-foot"><ShieldCheck size={14}/><span>The bank and orders shown here are a demo account. No real bank or brokerage is connected.</span><CircleHelp size={14}/></div>
  </section>;
}

function LandmarkIcon() { return <BriefcaseBusiness size={15}/>; }
