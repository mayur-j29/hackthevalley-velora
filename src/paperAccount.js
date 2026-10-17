export const PAPER_ACCOUNT_KEY = 'velora-simple-paper-account';
export const PAPER_ACCOUNT_EVENT = 'velora:paper-account-updated';

export function createInitialPaperAccount() {
  return {
    version: 1,
    bankCash: 20000,
    cash: 5000,
    positions: {},
    fills: [],
    decisions: [],
    realizedPnl: 0,
    budget: 5000,
    volatility: 35,
  };
}

export function readPaperAccount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PAPER_ACCOUNT_KEY) || 'null');
    if (saved?.version === 1 && Number.isFinite(saved.bankCash) && Number.isFinite(saved.cash) && saved.positions && Array.isArray(saved.fills)) {
      const unique = items => [...new Map((items || []).filter(item => item?.id).map(item => [item.id, item])).values()];
      return { ...createInitialPaperAccount(), ...saved, decisions: unique(saved.decisions), fills: unique(saved.fills) };
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
  const positions = Object.entries(account?.positions || {}).reduce((sum, [symbol, position]) => {
    const price = Number(prices[symbol]) || Number(position.mark) || Number(position.entryPrice) || 0;
    return sum + price * (Number(position.shares) || 0);
  }, 0);
  return Number(account?.bankCash || 0) + Number(account?.cash || 0) + positions;
}
