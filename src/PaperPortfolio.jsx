import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, BriefcaseBusiness, CircleDollarSign, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { executePaperOrder } from './finance';
import './portfolio.css';

const assets = [
  { symbol: 'SPY', label: 'S&P 500 ETF proxy', name: 'SPDR S&P 500 ETF' },
  { symbol: 'AAPL', label: 'Apple', name: 'Apple Inc.' },
  { symbol: 'MSFT', label: 'Microsoft', name: 'Microsoft Corp.' },
  { symbol: 'TSLA', label: 'Tesla', name: 'Tesla Inc.' },
];
const initialPortfolio = { cash: 0, positions: {}, orders: [] };
const currency = (value, digits = 2) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`;

export default function PaperPortfolio({ safeSurplus, rails, persona = 'Adult', virtualCash = 0, onCashChange = () => {} }) {
  const [portfolio, setPortfolio] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('velora-paper-portfolio') || 'null');
      if (saved && Number.isFinite(Number(saved.cash)) && saved.positions && Array.isArray(saved.orders)) return saved;
    } catch { /* Reset invalid demo state below. */ }
    return initialPortfolio;
  });
  const [quotes, setQuotes] = useState({});
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [symbol, setSymbol] = useState('SPY');
  const [side, setSide] = useState('buy');
  const [shares, setShares] = useState('0.1');
  const [message, setMessage] = useState(null);
  const [incomeAmount, setIncomeAmount] = useState('');

  useEffect(() => {
    try { window.localStorage.setItem('velora-paper-portfolio', JSON.stringify(portfolio)); }
    catch { /* The account remains usable for this browser session. */ }
    onCashChange(portfolio.cash);
  }, [portfolio]);

  useEffect(() => {
    if (Number(portfolio.cash) !== Number(virtualCash)) setPortfolio(current => ({ ...current, cash: Number(virtualCash) || 0 }));
  }, [virtualCash]);

  useEffect(() => {
    try { window.localStorage.removeItem('velora-auto-invest'); } catch { /* No saved schedule can be cleared in this browser. */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadQuotes() {
      setQuoteLoading(true);
      setQuoteError('');
      try {
        const response = await fetch('/api/market?symbols=SPY,AAPL,MSFT,TSLA&range=1d', { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.quotes)) throw new Error(data.error || 'Market prices are unavailable.');
        setQuotes(Object.fromEntries(data.quotes.map(quote => [quote.symbol, quote])));
      } catch (error) {
        if (!controller.signal.aborted) setQuoteError(error.message || 'Unable to refresh portfolio prices.');
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }
    loadQuotes();
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey(value => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const marks = useMemo(() => Object.fromEntries(assets.map(asset => [asset.symbol, quotes[asset.symbol]?.points?.at(-1)?.close || null])), [quotes]);
  const positionRows = assets.map(asset => {
    const position = portfolio.positions[asset.symbol] || { shares: 0, averageCost: 0 };
    const mark = marks[asset.symbol];
    const marketValue = mark ? Number(position.shares) * mark : 0;
    const bookValue = Number(position.shares) * Number(position.averageCost);
    return { ...asset, ...position, mark, marketValue, bookValue, profitLoss: marketValue - bookValue };
  });
  const positionsValue = positionRows.reduce((sum, position) => sum + position.marketValue, 0);
  const totalValue = Number(portfolio.cash) + positionsValue;
  const selectedAsset = assets.find(asset => asset.symbol === symbol);
  const selectedPrice = marks[symbol];
  const proposedAmount = (Number(shares) || 0) * (selectedPrice || 0);
  const availableToPaperTrade = Math.max(0, Math.min(Number(safeSurplus) || 0, Number(portfolio.cash) || 0));

  function recordVirtualIncome(event) {
    event.preventDefault();
    const amount = Number(incomeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({ type: 'error', text: 'Enter income greater than $0.' });
      return;
    }
    const nextPortfolio = { ...portfolio, cash: Number((portfolio.cash + amount).toFixed(2)) };
    setPortfolio(nextPortfolio);
    onCashChange(nextPortfolio.cash);
    setIncomeAmount('');
    setMessage({ type: 'success', text: `${currency(amount)} added to account cash.` });
  }

  function placePaperOrder(event) {
    event.preventDefault();
    const price = marks[symbol];
    const result = executePaperOrder({ portfolio, symbol, side, shares, price, safeSurplus, railsEnabled: rails });
    if (!result.ok) {
      setMessage({ type: 'error', text: result.reason });
      return;
    }
    setPortfolio(result.portfolio);
    onCashChange(result.portfolio.cash);
    setMessage({ type: 'success', text: `${side === 'buy' ? 'Bought' : 'Sold'} ${Number(shares)} ${symbol} share${Number(shares) === 1 ? '' : 's'} at ${currency(price)}.` });
  }


  return <section className="panel portfolio-panel" aria-labelledby="portfolio-title">
    <div className="portfolio-head"><div><div className="eyebrow">INVESTMENT ACCOUNT</div><h2 id="portfolio-title">Your portfolio, built from zero.</h2><p>Add income to track account cash and get started with investments.</p></div><button className="portfolio-refresh" onClick={() => setRefreshKey(value => value + 1)} disabled={quoteLoading} aria-label="Refresh market prices"><RefreshCw size={15}/></button></div>
    <div className="portfolio-summary"><div className="portfolio-value-card"><span><BriefcaseBusiness size={14}/> Total portfolio value</span><b>{currency(totalValue)}</b><small>Account cash + investments at latest available price</small></div><div className="portfolio-metric"><span><Wallet size={14}/> Account cash</span><b>{currency(portfolio.cash)}</b><small>{portfolio.cash > 0 ? 'Income added to this account' : 'Fresh start · $0.00'}</small></div><div className="portfolio-metric"><span><CircleDollarSign size={14}/> Safe to deploy</span><b>{currency(availableToPaperTrade, 0)}</b><small>Lower of account cash and forecast safe surplus</small></div></div>
    {quoteLoading && <div className="portfolio-load" role="status"><span/><b>Refreshing real price marks…</b></div>}
    {!quoteLoading && quoteError && <div className="portfolio-warning" role="status">{quoteError} Existing ledger is unchanged; try refreshing prices.</div>}
    {positionRows.some(position => Number(position.shares) > 0) ? <div className="portfolio-table"><div className="portfolio-table-head"><span>ASSET</span><span>SHARES</span><span>AVG. COST</span><span>LIVE PRICE</span><span>MARKET VALUE</span><span>YOUR CHANGE</span></div>{positionRows.filter(position => Number(position.shares) > 0).map(position => <div className="portfolio-row" key={position.symbol}><span className="portfolio-asset"><b>{position.symbol}</b><small>{position.name}</small></span><span>{Number(position.shares).toFixed(4)}</span><span>{currency(position.averageCost)}</span><span>{position.mark ? currency(position.mark) : '—'}</span><b>{currency(position.marketValue)}</b><b className={position.profitLoss >= 0 ? 'portfolio-positive' : 'portfolio-negative'}>{position.mark ? <>{position.profitLoss >= 0 ? '+' : '−'}{currency(Math.abs(position.profitLoss))}<small>{position.bookValue ? `${position.profitLoss >= 0 ? '+' : ''}${(position.profitLoss / position.bookValue * 100).toFixed(2)}% from your buy price` : 'from your buy price'}</small></> : '—'}</b></div>)}</div> : <div className="portfolio-empty"><BriefcaseBusiness size={17}/><span><b>No investments yet</b><small>Your holdings will appear here after you place an order or set up a recurring investment.</small></span></div>}
    <form className="paper-income-form" onSubmit={recordVirtualIncome}><div><b>Add account cash</b><small>Add income or an opening amount to your account.</small></div><label><span>INCOME</span><div className="amount-input"><b>$</b><input type="number" min="1" step="0.01" value={incomeAmount} onChange={event => setIncomeAmount(event.target.value)} placeholder="0.00" aria-label="Income amount"/></div></label><button type="submit" className="income-record-button">Add income <ArrowDownLeft size={14}/></button></form>
    <form className="paper-order-form" onSubmit={placePaperOrder}><div className="paper-order-heading"><div><BadgeCheck size={16}/><span><b>Investment order</b><small>Checks your available balance before updating your portfolio</small></span></div></div><label><span>SIDE</span><select value={side} onChange={event => setSide(event.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label><span>ASSET</span><select value={symbol} onChange={event => setSymbol(event.target.value)}>{assets.map(asset => <option key={asset.symbol} value={asset.symbol}>{asset.symbol} · {asset.label}</option>)}</select></label><label><span>SHARES</span><input type="number" min="0.0001" step="0.0001" value={shares} onChange={event => setShares(event.target.value)}/></label><div className="paper-order-estimate"><small>ESTIMATED VALUE</small><b>{selectedPrice ? currency(proposedAmount) : 'Load price marks'}</b><span>{selectedAsset.name} · {selectedPrice ? `${currency(selectedPrice)} per share` : 'quote unavailable'}</span></div><button className="paper-order-submit" type="submit" disabled={quoteLoading || !selectedPrice || !rails}>{side === 'buy' ? <ArrowDownLeft size={15}/> : <ArrowUpRight size={15}/>} Place {side}</button></form>
    {!rails && <div className="portfolio-warning"><ShieldCheck size={14}/> Rails are off. The ledger remains visible, but new buy and sell orders are blocked.</div>}
    {message && <div className={`portfolio-message ${message.type}`} role="status">{message.text}</div>}
    {portfolio.orders.length > 0 && <div className="paper-order-history"><b>Recent orders</b>{portfolio.orders.slice(0, 4).map(order => <div key={order.id}><span className={order.side}>{order.side.toUpperCase()}</span><span>{order.shares} {order.symbol}</span><span>{currency(order.amount)}</span><small>{new Date(order.createdAt).toLocaleString()}</small></div>)}</div>}
  </section>;
}
