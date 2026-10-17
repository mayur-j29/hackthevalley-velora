export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  if (!process.env.TWELVE_DATA_API_KEY) return response.status(503).json({ error: 'Add TWELVE_DATA_API_KEY in Vercel to browse the full exchange listings.' });
  const params = new URL(request.url || '/', 'http://localhost').searchParams;
  const exchange = params.get('exchange') === 'TSX' ? 'TSX' : 'NYSE';
  const query = (params.get('q') || '').trim().slice(0, 60);
  const page = Math.max(1, Math.min(100, Number(params.get('page')) || 1));
  const upstreamUrl = new URL(query ? 'https://api.twelvedata.com/symbol_search' : 'https://api.twelvedata.com/stocks');
  upstreamUrl.searchParams.set(query ? 'symbol' : 'mic_code', query || (exchange === 'TSX' ? 'XTSE' : 'XNYS'));
  upstreamUrl.searchParams.set('apikey', process.env.TWELVE_DATA_API_KEY);
  if (!query) {
    upstreamUrl.searchParams.set('page', String(page));
    upstreamUrl.searchParams.set('outputsize', '100');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const result = await fetch(upstreamUrl, { signal: controller.signal });
    const payload = await result.json();
    if (!result.ok || payload.status === 'error') return response.status(502).json({ error: payload.message || 'Could not load the exchange directory.' });
    const source = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.data?.stocks) ? payload.data.stocks : [];
    const rows = source.filter(item => {
      const mic = String(item.mic_code || '').toUpperCase();
      const name = String(item.exchange || '').toUpperCase();
      return exchange === 'TSX' ? mic === 'XTSE' || name.includes('TORONTO') || name === 'TSX' : mic === 'XNYS' || name.includes('NEW YORK STOCK EXCHANGE') || name === 'NYSE';
    }).map(item => ({ symbol: item.symbol, name: item.name || item.instrument_name || item.symbol, exchange, micCode: item.mic_code || (exchange === 'TSX' ? 'XTSE' : 'XNYS'), currency: item.currency || (exchange === 'TSX' ? 'CAD' : 'USD'), type: item.type || 'Stock' })).filter(item => item.symbol);
    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return response.status(200).json({ exchange, page, count: payload.count || rows.length, stocks: rows });
  } catch {
    return response.status(502).json({ error: 'Could not reach the exchange directory. Try again shortly.' });
  } finally {
    clearTimeout(timeout);
  }
}
