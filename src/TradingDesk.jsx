import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Clock3, Plus, RefreshCw, Search, Wallet } from 'lucide-react';
import { readPaperAccount, savePaperAccount } from './paperAccount';
import './trading-manual.css';

const DEFAULT_SYMBOLS = ['AAPL:NASDAQ', 'MSFT:NASDAQ', 'NVDA:NASDAQ', 'AMZN:NASDAQ', 'GOOGL:NASDAQ', 'TSLA:NASDAQ', 'JPM:NYSE', 'KO:NYSE', 'SPY:NYSE', 'RY:TSX', 'SHOP:TSX', 'TD:TSX'];
const money = (value, currency = 'CAD') => new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const ticker = symbol => symbol.split(':')[0];
const cents = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const readWatchlist = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem('velora-trading-watchlist') || 'null');
    const normalized = Array.isArray(stored) ? stored.map(value => String(value).includes(':') ? String(value) : `${String(value).replace(/\.TO$/i, '')}:${String(value).endsWith('.TO') ? 'TSX' : 'NYSE'}`).filter(value => /^[A-Z0-9.-]{1,15}:(NYSE|TSX)$/.test(value)) : [];
    if (normalized.length) return [...new Set([...normalized, ...DEFAULT_SYMBOLS])].slice(0, 20);
  } catch { /* Use the starter watchlist. */ }
  return DEFAULT_SYMBOLS;
};

function CandlestickChart({ quote, symbol }) {
  const points = quote?.points || [];
  if (points.length < 2) return <div className="manual-chart-empty">{quote ? 'There is not enough price history to draw this chart.' : 'Loading real market candles…'}</div>;
  const width = 900; const height = 320; const pad = { top: 20, right: 72, bottom: 28, left: 12 };
  const candles = points.slice(-70);
  const min = Math.min(...candles.map(point => point.low)); const max = Math.max(...candles.map(point => point.high));
  const spread = Math.max(max - min, max * 0.005, 0.01); const low = min - spread * 0.08; const high = max + spread * 0.08;
  const chartH = height - pad.top - pad.bottom; const chartW = width - pad.left - pad.right;
  const y = price => pad.top + ((high - price) / (high - low)) * chartH;
  const step = chartW / candles.length; const bodyW = Math.max(3, Math.min(10, step * 0.58));
  const last = candles.at(-1); const levels = [0, 1, 2, 3].map(index => high - (high - low) * index / 3);
  return <div className="manual-chart-wrap"><svg className="manual-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${ticker(symbol)} candlestick chart, showing ${candles.length} recent price bars`}>
    {levels.map((price, index) => <g key={index}><line className="manual-grid" x1={pad.left} x2={width - pad.right} y1={y(price)} y2={y(price)}/><text className="manual-axis" x={width - pad.right + 8} y={y(price) + 4}>{money(price, quote.currency)}</text></g>)}
    {candles.map((point, index) => {
      const rising = point.close >= point.open; const x = pad.left + index * step + step / 2; const top = Math.min(y(point.open), y(point.close)); const bodyH = Math.max(1.5, Math.abs(y(point.open) - y(point.close)));
      return <g className={rising ? 'manual-candle up' : 'manual-candle down'} key={`${point.date}-${index}`}><line x1={x} x2={x} y1={y(point.high)} y2={y(point.low)}/><rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH}/></g>;
    })}
    <line className="manual-last-price" x1={pad.left} x2={width - pad.right} y1={y(last.close)} y2={y(last.close)}/>
    <text className="manual-time" x={pad.left} y={height - 5}>{new Date(candles[0].date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</text>
    <text className="manual-time" textAnchor="end" x={width - pad.right} y={height - 5}>{new Date(last.date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</text>
  </svg></div>;
}

export default function TradingDesk({ persona = 'Teen' }) {
  const adult = persona === 'Adult';
  const [account, setAccount] = useState(readPaperAccount);
  const [watchlist, setWatchlist] = useState(readWatchlist);
  const [markets, setMarkets] = useState({});
  const [fxRate, setFxRate] = useState(() => Number(readPaperAccount().fxUsdCad) || null);
  const [selected, setSelected] = useState(() => readWatchlist()[0]);
  const [chartRange, setChartRange] = useState('1d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [orderValue, setOrderValue] = useState('100');
  const [fundAmount, setFundAmount] = useState('');
  const [orderSide, setOrderSide] = useState('buy');
  const [stockQuery, setStockQuery] = useState('');
  const [directory, setDirectory] = useState([]);
  const [directoryExchange, setDirectoryExchange] = useState('NYSE');
  const [directoryError, setDirectoryError] = useState('');
  const quote = markets[selected]; const points = quote?.points || []; const latest = points.at(-1);
  const price = Number(latest?.close) || 0; const previous = Number(points.at(-2)?.close) || price;
  const change = price - previous; const changePct = previous ? change / previous * 100 : 0;
  const holdings = useMemo(() => Object.entries(account.positions || {}).map(([symbol, position]) => {
    const mark = Number(markets[symbol]?.points?.at(-1)?.close) || Number(position.mark) || Number(position.entryPrice) || 0;
    return { symbol, ...position, mark, value: mark * position.shares, pnl: (mark - position.entryPrice) * position.shares, currency: markets[symbol]?.currency || position.currency || (symbol.endsWith(':TSX') ? 'CAD' : 'USD') };
  }), [account.positions, markets]);
  const toCad = (amount, currency) => Number(amount) * (currency === 'CAD' ? 1 : fxRate);
  const needsFx = holdings.some(holding => holding.currency !== 'CAD');
  const stockValue = holdings.reduce((sum, holding) => sum + toCad(holding.value, holding.currency), 0);
  const openPnl = holdings.reduce((sum, holding) => {
    const entryFx = holding.currency === 'CAD' ? 1 : Number(holding.entryFxUsdCad) || fxRate || 0;
    const entryCostCad = Number(holding.entryCostCadPerShare) || holding.entryPrice * entryFx;
    return sum + (toCad(holding.mark, holding.currency) - entryCostCad) * holding.shares;
  }, 0);
  const profit = (Number(account.realizedPnl) || 0) + openPnl;
  const position = account.positions?.[selected] || { shares: 0, entryPrice: 0 };

  useEffect(() => { savePaperAccount(account); }, [account]);
  useEffect(() => {
    try { window.localStorage.setItem('velora-trading-watchlist', JSON.stringify(watchlist)); } catch { /* Keep the watchlist for this session. */ }
    if (!watchlist.includes(selected)) setSelected(watchlist[0]);
  }, [watchlist, selected]);

  async function refreshPrices() {
    if (!watchlist.length) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/market?symbols=${watchlist.map(encodeURIComponent).join(',')}&range=${chartRange}`);
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.quotes)) throw new Error(result.error || 'Market prices are unavailable right now.');
      const next = Object.fromEntries(result.quotes.filter(item => Array.isArray(item.points) && item.points.length > 1).map(item => [item.symbol, item]));
      if (result.unavailable?.length) setError(`Some prices could not be loaded: ${result.unavailable.map(ticker).join(', ')}. Other stocks remain available.`);
      setMarkets(current => ({ ...current, ...next })); setUpdatedAt(new Date()); if (!result.unavailable?.length) setError('');
      const nextFx = Number(result.fx?.rate) || fxRate;
      setFxRate(nextFx);
      setAccount(current => ({ ...current, fxUsdCad: nextFx, positions: Object.fromEntries(Object.entries(current.positions || {}).map(([symbol, holding]) => [symbol, { ...holding, mark: Number(next[symbol]?.points?.at(-1)?.close) || holding.mark, currency: next[symbol]?.currency || (symbol.endsWith(':TSX') ? 'CAD' : 'USD') }])) }));
    } catch (fetchError) { setError(fetchError.message || 'Could not refresh prices.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { refreshPrices(); const timer = window.setInterval(refreshPrices, 60_000); return () => window.clearInterval(timer); }, [watchlist.join(','), chartRange]);

  async function searchStocks(event) {
    event?.preventDefault(); setDirectoryError('');
    try {
      const params = new URLSearchParams({ exchange: directoryExchange, page: '1' });
      if (stockQuery.trim()) params.set('q', stockQuery.trim());
      const response = await fetch(`/api/stocks?${params}`); const result = await response.json();
      if (!response.ok || !Array.isArray(result.stocks)) throw new Error(result.error || 'Stock search is unavailable.');
      setDirectory(result.stocks.slice(0, 30));
    } catch (searchError) { setDirectory([]); setDirectoryError(searchError.message || 'Stock search is unavailable.'); }
  }

  function addStock(stock) {
    const symbol = `${stock.symbol}:${stock.exchange}`;
    if (watchlist.includes(symbol)) { setSelected(symbol); return; }
    if (watchlist.length >= 20) { setError('The watchlist can hold up to 20 stocks. Remove one before adding another.'); return; }
    setWatchlist(current => [...current, symbol]); setSelected(symbol); setError('');
  }
  function removeStock(symbol) {
    if (watchlist.length <= 1) return setError('Keep at least one stock in the watchlist.');
    setWatchlist(current => current.filter(item => item !== symbol));
  }
  function placeOrder(event) {
    event.preventDefault(); setError('');
    const quantity = Number(orderValue);
    if (!price || !Number.isFinite(quantity) || quantity <= 0) return setError('Enter a valid order amount after prices load.');
    const current = readPaperAccount();
    const held = current.positions?.[selected] || { shares: 0, entryPrice: 0 };
    const currency = quote?.currency || (selected.endsWith(':TSX') ? 'CAD' : 'USD');
    if (orderSide === 'buy') {
      const spendCad = cents(quantity);
      const shares = Number((spendCad / (price * (currency === 'CAD' ? 1 : fxRate))).toFixed(6)); const cost = cents(shares * price);
      const cadCost = cents(shares * price * (currency === 'CAD' ? 1 : fxRate));
      if (cadCost > current.cash) return setError(`This order is larger than the available investing balance of ${money(current.cash, 'CAD')}.`);
      const totalShares = Number((held.shares + shares).toFixed(6));
      const nextEntryFx = currency === 'CAD' ? 1 : fxRate;
      const existingEntryCad = Number(held.entryCostCadPerShare) || held.entryPrice * (Number(held.entryFxUsdCad) || nextEntryFx);
      const entryCostCadPerShare = (held.shares * existingEntryCad + cadCost) / totalShares;
      const next = { ...current, cash: cents(current.cash - cadCost), fxUsdCad: fxRate, positions: { ...current.positions, [selected]: { shares: totalShares, entryPrice: (held.shares * held.entryPrice + cost) / totalShares, entryFxUsdCad: currency === 'CAD' ? 1 : nextEntryFx, entryCostCadPerShare, mark: price, currency } }, fills: [{ id: `manual-${Date.now()}`, symbol: selected, side: 'buy', shares, price, currency, cadAmount: cadCost, time: new Date().toISOString() }, ...(current.fills || [])].slice(0, 60) };
      setAccount(next);
    } else {
      const shares = Number(quantity.toFixed(6));
      if (shares > held.shares) return setError(`You have ${Number(held.shares || 0).toFixed(6)} ${ticker(selected)} shares available to sell.`);
      const proceeds = cents(shares * price); const cadProceeds = cents(proceeds * (currency === 'CAD' ? 1 : fxRate)); const entryCostCadPerShare = Number(held.entryCostCadPerShare) || held.entryPrice * (currency === 'CAD' ? 1 : Number(held.entryFxUsdCad) || fxRate); const pnlCad = cents(cadProceeds - shares * entryCostCadPerShare); const remaining = Number((held.shares - shares).toFixed(6));
      const positions = { ...current.positions };
      if (remaining > 0.000001) positions[selected] = { ...held, shares: remaining, mark: price }; else delete positions[selected];
      setAccount({ ...current, cash: cents(current.cash + cadProceeds), fxUsdCad: fxRate, realizedPnl: cents((Number(current.realizedPnl) || 0) + pnlCad), positions, fills: [{ id: `manual-${Date.now()}`, symbol: selected, side: 'sell', shares, price, currency, cadAmount: cadProceeds, time: new Date().toISOString(), pnl: pnlCad }, ...(current.fills || [])].slice(0, 60) });
    }
  }

  function moveCashToTrading(event) {
    event.preventDefault();
    const amount = cents(Number(fundAmount));
    const current = readPaperAccount();
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than zero.');
    if (amount > current.bankCash) return setError(`Only ${money(current.bankCash)} is available in account cash.`);
    const next = { ...current, bankCash: cents(current.bankCash - amount), cash: cents(current.cash + amount) };
    setAccount(next); setFundAmount(''); setError('');
  }

  return <section className="trading-desk panel simple-trading manual-trading" aria-labelledby="manual-trading-title">
    <header className="manual-head"><div><div className="simple-kicker"><span className="simple-dot"/> MANUAL STOCK TRADING</div><h2 id="manual-trading-title">Trading</h2><p>Read live market candles and place your own paper buy or sell orders.</p></div><button type="button" className="manual-refresh" onClick={refreshPrices} disabled={loading}><RefreshCw size={16} className={loading ? 'manual-spin' : ''}/>{loading ? 'Updating' : 'Refresh prices'}</button></header>
    <div className="manual-summary" aria-label="Account summary"><article><span><Wallet size={15}/> Trading cash</span><b>{money(account.cash, 'CAD')}</b><small>CAD available for orders</small></article><article><span><Activity size={15}/> Stock value</span><b>{needsFx && !fxRate ? '—' : money(stockValue, 'CAD')}</b><small>{needsFx && !fxRate ? 'Waiting for USD/CAD rate' : `${holdings.length} holdings · converted to CAD`}</small></article><article><span><ArrowUpFromLine size={15}/> Total profit / loss</span><b className={profit >= 0 ? 'desk-positive' : 'desk-negative'}>{profit >= 0 ? '+' : '−'}{money(Math.abs(profit), 'CAD')}</b><small>{needsFx && !fxRate ? 'Waiting for USD/CAD rate' : 'Realized + current holdings · CAD'}</small></article></div>
    {error && <div className="manual-error" role="alert">{error}</div>}
    <div className="manual-workspace">
      <div className="manual-market-panel">
        <div className="manual-symbol-row"><label htmlFor="manual-stock">Stock</label><select id="manual-stock" value={selected} onChange={event => setSelected(event.target.value)}>{watchlist.map(symbol => <option key={symbol} value={symbol}>{ticker(symbol)} · {symbol.split(':')[1]}</option>)}</select><label htmlFor="manual-chart-range">History</label><select id="manual-chart-range" value={chartRange} onChange={event => setChartRange(event.target.value)}><option value="1d">1 day</option><option value="5d">5 days</option><option value="1mo">1 month</option><option value="6mo">6 months</option><option value="1y">1 year</option></select><button type="button" className="manual-remove" onClick={() => removeStock(selected)} aria-label={`Remove ${ticker(selected)} from watchlist`}>Remove</button></div>
        <div className="manual-price-line"><div><span className="manual-symbol-name">{ticker(selected)}</span><span className="manual-exchange">{quote?.displayName || (selected.endsWith(':TSX') ? 'Toronto Stock Exchange' : 'New York Stock Exchange')}</span></div><strong>{price ? money(price, quote.currency || 'USD') : '—'}</strong><span className={change >= 0 ? 'manual-positive' : 'manual-negative'}>{price ? `${change >= 0 ? '+' : '−'}${money(Math.abs(change), quote.currency || 'USD')} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)` : 'Waiting for price'}</span></div>
        <div className="manual-ohlc">{['open','high','low','close','volume'].map(key => <div key={key}><small>{key.toUpperCase()}</small><b>{latest ? key === 'volume' ? new Intl.NumberFormat().format(latest.volume || 0) : money(latest[key], quote.currency || 'USD') : '—'}</b></div>)}</div>
        <CandlestickChart quote={quote} symbol={selected}/>
        <div className="manual-chart-caption"><span>{quote?.source || 'Waiting for market data'}</span><span><Clock3 size={13}/> Updated {updatedAt ? updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'}</span></div>
      </div>
      <aside className="manual-order-panel"><div className="manual-order-heading"><span className="simple-icon"><Activity size={17}/></span><div><b>Place a paper order</b><small>{ticker(selected)} at {price ? money(price, quote?.currency || 'USD') : 'current market price'}</small></div></div>
        <div className="manual-side-switch" role="group" aria-label="Order type"><button type="button" className={orderSide === 'buy' ? 'active buy' : ''} onClick={() => { setOrderSide('buy'); setOrderValue('100'); }}>Buy</button><button type="button" className={orderSide === 'sell' ? 'active sell' : ''} onClick={() => { setOrderSide('sell'); setOrderValue(String(position.shares || '')); }}>Sell</button></div>
        <form onSubmit={placeOrder} className="manual-order-form"><label htmlFor="manual-order-value">{orderSide === 'buy' ? 'Amount to spend (CAD)' : 'Shares to sell'}<span>{orderSide === 'buy' ? `Available ${money(account.cash, 'CAD')}` : `Owned ${Number(position.shares || 0).toFixed(4)}`}</span></label><div className="manual-order-input-wrap"><span>{orderSide === 'buy' ? 'CA$' : 'SH'}</span><input id="manual-order-value" type="number" min={orderSide === 'buy' ? '0.01' : '0.000001'} step={orderSide === 'buy' ? '0.01' : '0.000001'} max={orderSide === 'buy' ? account.cash : position.shares || 0} value={orderValue} onChange={event => setOrderValue(event.target.value)} placeholder="0.00"/></div><div className="manual-estimate"><span>Estimated {orderSide === 'buy' ? 'shares' : 'proceeds'}</span><b>{price && Number(orderValue) > 0 ? orderSide === 'buy' ? fxRate || (quote?.currency === 'CAD') ? `${(Number(orderValue) / (price * (quote?.currency === 'CAD' ? 1 : fxRate))).toFixed(6)} shares` : 'Waiting for USD/CAD rate' : fxRate || (quote?.currency === 'CAD') ? money(toCad(Number(orderValue) * price, quote?.currency || 'USD'), 'CAD') : 'Waiting for USD/CAD rate' : '—'}</b></div><button className={`manual-submit ${orderSide}`} type="submit" disabled={!price || ((quote?.currency || 'USD') !== 'CAD' && !fxRate)}>{orderSide === 'buy' ? <><ArrowDownToLine size={16}/> Buy {ticker(selected)}</> : <><ArrowUpFromLine size={16}/> Sell {ticker(selected)}</>}</button><small className="manual-order-note">{(quote?.currency || 'USD') === 'CAD' ? 'Prices and account balances are CAD.' : fxRate ? `US stock prices convert to CAD at ${fxRate.toFixed(4)} USD/CAD.` : 'Waiting for the latest USD/CAD rate before enabling US orders.'} Orders use the latest available price and update this account only.</small></form>
      </aside>
    </div>
    <form className="manual-funding" onSubmit={moveCashToTrading}><div><span className="simple-icon"><Wallet size={17}/></span><span><b>Add account cash to trading</b><small>{money(account.bankCash, 'CAD')} available in your account cash balance</small></span></div><label><span>CA$</span><input type="number" min="0.01" max={account.bankCash} step="0.01" value={fundAmount} onChange={event => setFundAmount(event.target.value)} placeholder="Amount" aria-label="Amount of account cash to move to trading"/><small>CAD</small></label><button type="submit" disabled={!Number(account.bankCash) || !fundAmount}>Move to trading</button></form>
    <details className="manual-add-stock"><summary><Plus size={15}/> Add a stock</summary><form onSubmit={searchStocks}><div className="manual-search-row"><select aria-label="Exchange" value={directoryExchange} onChange={event => setDirectoryExchange(event.target.value)}><option>NYSE</option><option>NASDAQ</option><option>TSX</option></select><label><Search size={15}/><input value={stockQuery} onChange={event => setStockQuery(event.target.value)} placeholder="Search by ticker or company"/></label><button type="submit">Search</button></div></form>{directoryError && <p className="manual-directory-error">{directoryError}</p>}{directory.length > 0 && <div className="manual-directory">{directory.map(stock => { const symbol = `${stock.symbol}:${stock.exchange}`; return <button type="button" key={symbol} onClick={() => addStock(stock)}><span><b>{stock.symbol}</b><small>{stock.name}</small></span><span>{watchlist.includes(symbol) ? 'Selected' : 'Add'}</span></button>; })}</div>}</details>
    <section className="manual-holdings"><h3>Your holdings</h3>{holdings.length ? <div className="manual-holdings-table"><div className="manual-holding-row manual-holding-labels"><span>Stock</span><span>Shares</span><span>Market price</span><span>Value</span><span>Profit / loss</span></div>{holdings.map(holding => <div className="manual-holding-row" key={holding.symbol}><b>{ticker(holding.symbol)}</b><span>{holding.shares.toFixed(4)}</span><span>{money(holding.mark, holding.currency)}</span><span>{money(holding.value, holding.currency)}</span><strong className={holding.pnl >= 0 ? 'desk-positive' : 'desk-negative'}>{holding.pnl >= 0 ? '+' : '−'}{money(Math.abs(holding.pnl), holding.currency)}</strong></div>)}</div> : <div className="manual-empty">Your holdings will appear here after your first buy order.</div>}</section>
    {account.fills?.length > 0 && <section className="manual-orders"><h3>Recent orders</h3>{account.fills.slice(0, 5).map(fill => <div className="manual-order-row" key={fill.id}><span className={`manual-order-badge ${fill.side}`}>{fill.side}</span><b>{ticker(fill.symbol)}</b><span>{Number(fill.shares).toFixed(4)} shares</span><span>{money(fill.price, fill.symbol?.endsWith(':TSX') ? 'CAD' : 'USD')}</span><time>{new Date(fill.time).toLocaleString()}</time></div>)}</section>}
    <p className="manual-disclosure">Paper investing only. This educational simulation cannot place real trades, move money, or provide formal financial advice.</p>
  </section>;
}
