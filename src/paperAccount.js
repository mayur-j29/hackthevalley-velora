export const PAPER_ACCOUNT_KEY = 'velora-simple-paper-account';
export const PAPER_ACCOUNT_EVENT = 'velora:paper-account-updated';

export function createInitialPaperAccount() {
  const now = new Date().toISOString();
  return {
    version: 1,
    bankCash: 20000,
    cash: 5000,
    currency: 'CAD',
    fxUsdCad: null,
    positions: {},
    fills: [],
    decisions: [],
    pendingApprovals: [],
    earningsStartAt: now,
    earnedSinceStart: 0,
    realizedPnl: 0,
    budget: 5000,
    volatility: 35,
  };
}

// Clearly labeled sample gig income accrues smoothly at $500 per 24 hours.
export function accrueSampleEarnings(account, now = Date.now()) {
  const startAt = Number.isFinite(Date.parse(account?.earningsStartAt)) ? Date.parse(account.earningsStartAt) : now;
  const elapsed = Math.max(0, now - startAt);
  const earned = Math.floor((elapsed * 500 / 86400000) * 100) / 100;
  const previous = Number(account?.earnedSinceStart) || 0;
  const delta = Math.max(0, earned - previous);
  if (!delta && account?.earningsStartAt) return account;
  return { ...account, earningsStartAt: new Date(startAt).toISOString(), earnedSinceStart: cents(earned), bankCash: cents((Number(account?.bankCash) || 0) + delta) };
}

function cents(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function readPaperAccount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PAPER_ACCOUNT_KEY) || 'null');
    if (saved?.version === 1 && Number.isFinite(saved.bankCash) && Number.isFinite(saved.cash) && saved.positions && Array.isArray(saved.fills)) {
      const unique = items => [...new Map((items || []).filter(item => item?.id).map(item => [item.id, item])).values()];
      return { ...createInitialPaperAccount(), ...saved, decisions: unique(saved.decisions), fills: unique(saved.fills), pendingApprovals: Array.isArray(saved.pendingApprovals) ? saved.pendingApprovals : [] };
    }
  } catch { /* Start from the sample account when saved data is unavailable. */ }
  return createInitialPaperAccount();
}

export function savePaperAccount(account) {
  try { window.localStorage.setItem(PAPER_ACCOUNT_KEY, JSON.stringify(account)); }
  catch { /* Keep the account usable in this browser session. */ }
  window.dispatchEvent(new CustomEvent(PAPER_ACCOUNT_EVENT, { detail: account }));
}

export function subscribePaperAccount(onChange) {
  const onLocalChange = event => onChange(event.detail || readPaperAccount());
  const onStorageChange = event => {
    if (event.key === PAPER_ACCOUNT_KEY) onChange(readPaperAccount());
  };
  window.addEventListener(PAPER_ACCOUNT_EVENT, onLocalChange);
  window.addEventListener('storage', onStorageChange);
  return () => {
    window.removeEventListener(PAPER_ACCOUNT_EVENT, onLocalChange);
    window.removeEventListener('storage', onStorageChange);
  };
}

export function paperAccountValue(account, prices = {}) {
  const fx = Number(account?.fxUsdCad) > 0 ? Number(account.fxUsdCad) : 1.36;
  const positions = Object.entries(account?.positions || {}).reduce((sum, [symbol, position]) => {
    const price = Number(prices[symbol]) || Number(position.mark) || Number(position.entryPrice) || 0;
    const currencyFactor = symbol.endsWith(':TSX') ? 1 : fx;
    return sum + price * (Number(position.shares) || 0) * currencyFactor;
  }, 0);
  return Number(account?.bankCash || 0) + Number(account?.cash || 0) + positions;
}
