const SYMBOLS = Object.freeze({
  'S&P 500': 'SPY',
  SPY: 'SPY',
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  TSLA: 'TSLA',
});
const PERIODS = Object.freeze({ '6mo': '6mo', '1y': '1y', '5y': '5y' });
const MARKET_ORIGIN = 'https://query1.finance.yahoo.com';
const REQUEST_TIMEOUT_MS = 10000;

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });

  const params = new URL(request.url || '/', 'http://localhost').searchParams;
  const range = PERIODS[params.get('range') || '1y'];
  if (!range) return response.status(400).json({ error: 'Choose a supported history window: 6mo, 1y, or 5y.' });

  const requestedSymbols = params.has('symbols')
    ? [...new Set((params.get('symbols') || '').split(',').map(value => value.trim()).filter(Boolean))]
    : [params.get('symbol') || 'S&P 500'];
  if (!requestedSymbols.length || requestedSymbols.length > 4 || requestedSymbols.some(value => !SYMBOLS[value])) {
    return response.status(400).json({ error: 'Choose up to four supported symbols: SPY, S&P 500, AAPL, MSFT, or TSLA.' });
  }

  try {
    const quotes = await Promise.all(requestedSymbols.map(requestedSymbol => fetchHistory(requestedSymbol, range)));
    if (requestedSymbols.length > 1) return response.status(200).json({ quotes, fetchedAt: new Date().toISOString() });
    return response.status(200).json(quotes[0]);
  } catch {
    return response.status(502).json({ error: 'Could not retrieve historical prices. Check your connection and retry.' });
  }
}

async function fetchHistory(requestedSymbol, range) {
  const symbol = SYMBOLS[requestedSymbol];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${MARKET_ORIGIN}/v8/finance/chart/${symbol}?range=${range}&interval=1d&events=div%2Csplits`, {
      headers: { 'User-Agent': 'VeloraHackathon/1.0 (historical paper simulation)' },
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error('Historical price provider is temporarily unavailable.');

    const payload = await upstream.json();
    const result = payload.chart?.result?.[0];
    if (payload.chart?.error || !result) throw new Error(`No historical prices were returned for ${symbol}.`);
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
    const points = timestamps.flatMap((timestamp, index) => {
      const close = Number(closes[index]);
      return Number.isFinite(close) && close > 0 ? [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close: Number(close.toFixed(4)) }] : [];
    }).slice(-1260);
    if (points.length < 2) throw new Error(`Not enough valid history for ${symbol}.`);

    const meta = result.meta || {};
    return {
      symbol,
      displaySymbol: requestedSymbol === 'S&P 500' || requestedSymbol === 'SPY' ? 'S&P 500 ETF proxy (SPY)' : symbol,
      currency: meta.currency || 'USD',
      period: range,
      points,
      source: 'Yahoo Finance chart API',
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
