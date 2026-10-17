export const KID_MONEY_KEY = 'velora-kid-money-v1';
export const KID_GUARDIAN_KEY = 'velora-kid-guardian-v1';

export function createKidMoney() {
  return {
    version: 1,
    allowanceBalance: 0,
    weeklyAllowance: 10,
    allowanceHistory: [],
    investmentValue: 0,
    investedPrincipal: 0,
    investments: [],
    requests: [],
    investmentMonths: 0,
    investmentHistory: [{ month: 0, value: 0, change: 0 }],
    goalName: 'Something fun',
    goalTarget: 30,
  };
}

export function readKidMoney() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KID_MONEY_KEY) || 'null');
    if (saved?.version === 1) return { ...createKidMoney(), ...saved };
  } catch { /* Use a fresh practice account when browser storage is unavailable. */ }
  return createKidMoney();
}

export function saveKidMoney(state) {
  try { window.localStorage.setItem(KID_MONEY_KEY, JSON.stringify(state)); }
  catch { /* The current practice session remains usable. */ }
  return state;
}

export function hashGuardianPin(pin) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  return window.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
    .then(key => window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256))
    .then(bits => ({ salt: encodeBytes(salt), hash: encodeBytes(new Uint8Array(bits)) }));
}

export async function verifyGuardianPin(pin, stored) {
  if (!stored?.salt || !stored?.hash) return false;
  try {
    const salt = decodeBytes(stored.salt);
    const expected = decodeBytes(stored.hash);
    const key = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const result = new Uint8Array(await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256));
    return result.length === expected.length && result.every((byte, index) => byte === expected[index]);
  } catch { return false; }
}

export function addKidAllowance(state, amount) {
  const nextAmount = cents(amount);
  if (!Number.isFinite(nextAmount) || nextAmount <= 0 || nextAmount > 1000) return state;
  return { ...state, weeklyAllowance: nextAmount, allowanceBalance: cents(state.allowanceBalance + nextAmount), allowanceHistory: [{ id: `allowance-${Date.now()}`, amount: nextAmount, date: new Date().toISOString(), label: 'Weekly allowance' }, ...state.allowanceHistory].slice(0, 30) };
}

export function requestKidInvestment(state, amount) {
  const nextAmount = cents(amount);
  if (!Number.isFinite(nextAmount) || nextAmount <= 0 || nextAmount > state.allowanceBalance || nextAmount > 1000) return state;
  return { ...state, requests: [{ id: `invest-${Date.now()}`, amount: nextAmount, date: new Date().toISOString(), status: 'pending' }, ...state.requests].slice(0, 30) };
}

export function resolveKidInvestment(state, requestId, approve) {
  const request = state.requests.find(item => item.id === requestId && item.status === 'pending');
  if (!request || (approve && request.amount > state.allowanceBalance)) return state;
  const requests = state.requests.map(item => item.id === requestId ? { ...item, status: approve ? 'approved' : 'declined', resolvedAt: new Date().toISOString() } : item);
  if (!approve) return { ...state, requests };
  const investment = { id: `contribution-${Date.now()}`, amount: request.amount, date: new Date().toISOString() };
  const investmentValue = cents(state.investmentValue + request.amount);
  return {
    ...state,
    allowanceBalance: cents(state.allowanceBalance - request.amount),
    investedPrincipal: cents(state.investedPrincipal + request.amount),
    investmentValue,
    investments: [investment, ...state.investments].slice(0, 100),
    requests,
    investmentHistory: [...state.investmentHistory, { month: state.investmentMonths, value: investmentValue, change: 0 }].slice(-36),
  };
}

export function growKidInvestmentOneMonth(state) {
  if (state.investmentValue <= 0) return state;
  const month = state.investmentMonths + 1;
  let hash = (Math.imul(month + 17, 2654435761) + Math.floor(state.investmentPrincipal * 100) + 1013904223) >>> 0;
  hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
  const change = (hash / 4294967296) * 0.1 - 0.045;
  const investmentValue = cents(Math.max(0, state.investmentValue * (1 + change)));
  return { ...state, investmentMonths: month, investmentValue, investmentHistory: [...state.investmentHistory, { month, value: investmentValue, change }].slice(-36) };
}

function cents(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function encodeBytes(bytes) { return btoa(String.fromCharCode(...bytes)); }
function decodeBytes(value) { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
