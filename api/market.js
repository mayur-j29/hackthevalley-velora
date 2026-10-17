const REQUEST_TIMEOUT_MS = 12000;
const MAX_SYMBOLS = 20;

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const params = new URL(request.url || '/', 'http://localhost').searchParams;
  const requested = params.has('symbols') ? params.get('symbols').split(',').map(value => value.trim()).filter(Boolean) : [params.get('symbol') || 'S&P 500'];
  if (requested.some(symbol => !symbol.includes(':'))) return handleLegacy(requested, params.get('range') || '1d', response);
  const symbols = [...new Set((params.get('symbols') || 'SPY:NYSE,AAPL:NYSE,MSFT:NYSE,TSLA:NYSE').split(',').map(value => value.trim()).filter(Boolean))];
  const range = params.get('range') || '1d';
  if (!['1d', '5d', '1mo', '6mo', '1y'].includes(range)) return response.status(400).json({ error: 'Choose a supported chart range: 1d, 5d, 1mo, 6mo, or 1y.' });
  if (!symbols.length || symbols.length > MAX_SYMBOLS || symbols.some(value => !/^[A-Z0-9.-]{1,15}:(NYSE|NASDAQ|TSX)$/.test(value))) {
    return response.status(400).json({ error: `Choose up to ${MAX_SYMBOLS} supported NYSE, Nasdaq, or TSX ticker symbols.` });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const results = await Promise.allSettled(symbols.map(async symbol => {
      if (!process.env.TWELVE_DATA_API_KEY) return fetchYahoo(symbol, controller.signal, range);
      try { return await fetchTwelveData(symbol, process.env.TWELVE_DATA_API_KEY, controller.signal, range); }
      catch { return fetchYahoo(symbol, controller.signal, range); }
    }));
    const available = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const unavailable = results.flatMap((result, index) => result.status === 'rejected' ? [symbols[index]] : []);
    if (!available.length) return response.status(502).json({ error: 'No candles are available for the selected symbols. Check data access and try again.' });
    const fx = await fetchUsdCad(controller.signal).catch(() => null);
    return response.status(200).json({ quotes: available, unavailable, fx, fetchedAt: new Date().toISOString(), source: process.env.TWELVE_DATA_API_KEY ? 'Twelve Data with Yahoo Finance fallback' : 'Yahoo Finance' });
  } catch (error) {
    const message = error?.message || 'Could not retrieve candle data.';
    return response.status(502).json({ error: message.slice(0, 240) });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleLegacy(symbols, range, response) {
  const mapped = { 'S&P 500': 'SPY', SPY: 'SPY', AAPL: 'AAPL', MSFT: 'MSFT', TSLA: 'TSLA' };
  if (!['1d', '5d', '1mo', '6mo', '1y', '5y'].includes(range)) return response.status(400).json({ error: 'Choose a supported history window: 1d, 5d, 1mo, 6mo, 1y, or 5y.' });
  if (!symbols.length || symbols.length > 4 || symbols.some(symbol => !mapped[symbol])) return response.status(400).json({ error: 'Choose up to four supported symbols: SPY, S&P 500, AAPL, MSFT, or TSLA.' });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const quotes = await Promise.all(symbols.map(symbol => fetchLegacyHistory(mapped[symbol], range, controller.signal)));
    if (symbols.length > 1) return response.status(200).json({ quotes, fetchedAt: new Date().toISOString() });
    return response.status(200).json({ ...quotes[0], displaySymbol: symbols[0] === 'S&P 500' || symbols[0] === 'SPY' ? 'S&P 500 ETF proxy (SPY)' : symbols[0] });
  } catch { return response.status(502).json({ error: 'Could not retrieve historical prices. Check your connection and retry.' }); }
  finally { clearTimeout(timeout); }
}

async function fetchLegacyHistory(symbol, range, signal) {
  const interval = range === '1d' ? '1m' : range === '5d' ? '5m' : range === '1mo' ? '30m' : '1d';
  const result = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&events=div%2Csplits`, { headers: { 'User-Agent': 'VeloraHackathon/1.0' }, signal });
  const payload = await result.json(); const chart = payload.chart?.result?.[0];
  if (!result.ok || payload.chart?.error || !chart) throw new Error('No market history available.');
  const intraday = ['1d', '5d', '1mo'].includes(range);
  const source = intraday ? chart.indicators?.quote?.[0]?.close || [] : chart.indicators?.adjclose?.[0]?.adjclose || chart.indicators?.quote?.[0]?.close || [];
  const quote = chart.indicators?.quote?.[0] || {};
  const points = (chart.timestamp || []).flatMap((timestamp, index) => { const close = Number(source[index]); return Number.isFinite(close) && close > 0 ? [{ date: intraday ? new Date(timestamp * 1000).toISOString() : new Date(timestamp * 1000).toISOString().slice(0, 10), close: Number(close.toFixed(4)), open: Number(quote.open?.[index]) || close, high: Number(quote.high?.[index]) || close, low: Number(quote.low?.[index]) || close, volume: Number(quote.volume?.[index]) || 0 }] : []; }).slice(-1260);
  if (points.length < 2) throw new Error('Not enough history.');
  return { symbol, displayName: chart.meta?.shortName || chart.meta?.longName || symbol, currency: chart.meta?.currency || 'USD', period: range, interval, points, source: 'Yahoo Finance chart API', fetchedAt: new Date().toISOString(), open: chart.meta?.regularMarketOpen, previousClose: chart.meta?.previousClose, dayHigh: chart.meta?.regularMarketDayHigh, dayLow: chart.meta?.regularMarketDayLow, yearHigh: chart.meta?.fiftyTwoWeekHigh, yearLow: chart.meta?.fiftyTwoWeekLow, volume: quote.volume?.at(-1) };
}

async function fetchTwelveData(symbol, apiKey, signal, range) {
  const [ticker, exchange] = symbol.split(':');
  // Twelve Data currently exposes Toronto Stock Exchange bars at end of day;
  // NYSE bars are requested intraday.
  const interval = exchange === 'TSX' || ['6mo', '1y'].includes(range) ? '1day' : range === '1d' ? '1min' : range === '5d' ? '5min' : '30min';
  const url = new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol', `${ticker}:${exchange}`);
  url.searchParams.set('interval', interval);
  url.searchParams.set('outputsize', ['6mo', '1y'].includes(range) ? (range === '1y' ? '252' : '126') : '100');
  url.searchParams.set('apikey', apiKey);
  const result = await fetch(url, { signal });
  const payload = await result.json();
  if (!result.ok || payload.status === 'error' || !Array.isArray(payload.values)) {
    throw new Error(payload.message || `No ${interval} candles returned for ${symbol}.`);
  }
  const points = payload.values.map(point => ({
    date: point.datetime,
    open: Number(point.open), high: Number(point.high), low: Number(point.low), close: Number(point.close), volume: Number(point.volume) || 0,
  })).filter(point => [point.open, point.high, point.low, point.close].every(value => Number.isFinite(value) && value > 0)).reverse();
  return {
    symbol, displayName: payload.meta?.name || ticker, exchange, currency: payload.meta?.currency || (exchange === 'TSX' ? 'CAD' : 'USD'), interval, period: range, points,
    source: `Twelve Data · ${interval} candles`, fetchedAt: new Date().toISOString(),
  };
}

async function fetchUsdCad(signal) {
  const result = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/CAD=X?range=5d&interval=1d', { signal, headers: { 'User-Agent': 'VeloraHackathon/1.0' } });
  const payload = await result.json();
  const chart = payload.chart?.result?.[0];
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const rate = [...closes].reverse().map(Number).find(value => Number.isFinite(value) && value > 0);
  if (!result.ok || payload.chart?.error || !rate) throw new Error('USD/CAD rate unavailable');
  return { pair: 'USD/CAD', rate: Number(rate.toFixed(5)), source: 'Yahoo Finance', fetchedAt: new Date().toISOString() };
}

async function fetchYahoo(symbol, signal, requestedRange = '1d') {
  const [ticker, exchange] = symbol.split(':');
  const mapped = exchange === 'TSX' ? `${ticker}.TO` : ticker;
  const range = exchange === 'TSX' ? (requestedRange === '1y' ? '1y' : requestedRange === '6mo' ? '6mo' : '3mo') : requestedRange;
  const interval = exchange === 'TSX' || ['6mo', '1y'].includes(range) ? '1d' : range === '1d' ? '1m' : range === '5d' ? '5m' : '30m';
  const result = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}?range=${range}&interval=${interval}`, { signal, headers: { 'User-Agent': 'VeloraHackathon/1.0' } });
  const payload = await result.json();
  const chart = payload.chart?.result?.[0];
  if (!result.ok || payload.chart?.error || !chart) throw new Error(`Could not load candles for ${symbol}.`);
  const quote = chart.indicators?.quote?.[0] || {};
  const points = (chart.timestamp || []).flatMap((timestamp, index) => {
    const open = Number(quote.open?.[index]); const high = Number(quote.high?.[index]); const low = Number(quote.low?.[index]); const close = Number(quote.close?.[index]);
    if (![open, high, low, close].every(value => Number.isFinite(value) && value > 0)) return [];
    return [{ date: new Date(timestamp * 1000).toISOString(), open, high, low, close, volume: Number(quote.volume?.[index]) || 0 }];
  });
  return { symbol, displayName: chart.meta?.shortName || chart.meta?.longName || ticker, exchange, currency: chart.meta?.currency || (exchange === 'TSX' ? 'CAD' : 'USD'), interval, period: requestedRange, points, source: `Yahoo Finance · ${interval} candles`, fetchedAt: new Date().toISOString() };
}
