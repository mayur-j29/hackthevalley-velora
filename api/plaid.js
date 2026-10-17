import { buildForecast, evaluateSimulatedTrade, getSafeSurplus } from '../src/finance.js';
import { randomUUID } from 'node:crypto';

const PLAID_URL = 'https://sandbox.plaid.com';
const MAX_TRANSFER = 1000;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const { PLAID_CLIENT_ID: clientId, PLAID_SECRET: secret } = process.env;
  if (!clientId || !secret) return response.status(503).json({ error: 'Plaid Sandbox is not configured. Add server-side Plaid Sandbox credentials in Vercel.' });

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  try {
    if (body.action === 'link-token') {
      const data = await plaid('/link/token/create', {
        client_name: 'Velora Sandbox',
        language: 'en',
        country_codes: ['US'],
        user: { client_user_id: 'velora-hackathon-sandbox' },
        products: ['transfer'],
      });
      return response.status(200).json({ linkToken: data.link_token });
    }

    if (body.action === 'exchange') {
      if (typeof body.public_token !== 'string' || !body.public_token.startsWith('public-')) return response.status(400).json({ error: 'Invalid Plaid Sandbox public token.' });
      const data = await plaid('/item/public_token/exchange', { public_token: body.public_token });
      return response.status(200).json({ accessToken: data.access_token, itemId: data.item_id });
    }

    if (body.action === 'accounts') {
      const data = await plaid('/accounts/balance/get', { access_token: sandboxToken(body.access_token) });
      return response.status(200).json({
        accounts: (data.accounts || []).map(account => ({
          accountId: account.account_id,
          name: account.name,
          officialName: account.official_name,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          current: account.balances?.current,
          available: account.balances?.available,
          currency: account.balances?.iso_currency_code || 'USD',
        })),
      });
    }

    if (body.action === 'transfer') {
      const amount = Number(body.amount);
      const accountId = typeof body.account_id === 'string' ? body.account_id : '';
      const accessToken = sandboxToken(body.access_token);
      if (!accountId || !Number.isFinite(amount) || amount <= 0 || amount > MAX_TRANSFER) {
        return response.status(400).json({ error: `Choose an account and an amount between $0.01 and $${MAX_TRANSFER}.` });
      }

      // Read the linked Sandbox balance on the server; never trust a browser-provided balance.
      const accountData = await plaid('/accounts/balance/get', { access_token: accessToken });
      const account = accountData.accounts?.find(item => item.account_id === accountId);
      if (!account || !['checking', 'savings'].includes(account.subtype)) return response.status(400).json({ error: 'Choose a linked checking or savings account.' });
      const available = account.balances?.available ?? account.balances?.current;
      if (!Number.isFinite(available)) return response.status(409).json({ error: 'The Sandbox account has no available balance to check.' });

      // Every external Sandbox debit goes through the server-side deterministic rules check.
      const forecast = buildForecast({ balance: available });
      const { safeSurplus } = getSafeSurplus(forecast);
      const verdict = evaluateSimulatedTrade({ amount, safeSurplus, railsEnabled: true });
      if (verdict.verdict !== 'pass') return response.status(409).json({ error: `BLOCKED BY VELORA RULES: ${verdict.reason}` });

      const authorization = await plaid('/transfer/authorization/create', {
        access_token: accessToken,
        account_id: accountId,
        type: 'debit',
        network: 'ach',
        amount: amount.toFixed(2),
        ach_class: 'web',
        idempotency_key: randomUUID(),
        user: { legal_name: 'Velora Demo User' },
      });
      const decision = authorization.authorization?.decision;
      if (decision !== 'approved' || authorization.authorization?.decision_rationale?.code) {
        return response.status(409).json({ error: `Plaid Sandbox declined the transfer (${authorization.authorization?.decision_rationale?.code || decision || 'unknown'}). No transfer was created.` });
      }

      const transferData = await plaid('/transfer/create', {
        access_token: accessToken,
        account_id: accountId,
        authorization_id: authorization.authorization.id,
        amount: amount.toFixed(2),
        description: 'VELORA INVEST',
        metadata: { purpose: 'Velora hackathon sandbox contribution' },
      });
      const transfer = transferData.transfer;
      return response.status(201).json({
        transfer: { id: transfer.id, status: transfer.status, amount: transfer.amount, created: transfer.created, type: transfer.type, network: transfer.network },
        rules: { verdict: 'PASS', safeSurplus, checkedAvailableBalance: available },
      });
    }

    return response.status(400).json({ error: 'Unknown Plaid action.' });
  } catch (error) {
    const status = error.status || 502;
    return response.status(status).json({ error: error.message || 'Plaid Sandbox request failed.' });
  }
}

function sandboxToken(value) {
  // Plaid Sandbox access tokens carry this prefix; Production tokens are rejected.
  if (typeof value !== 'string' || !value.startsWith('access-sandbox-')) {
    const error = new Error('Only Plaid Sandbox accounts are supported. No live bank connection is allowed.');
    error.status = 400;
    throw error;
  }
  return value;
}

async function plaid(path, payload) {
  const upstream = await fetch(`${PLAID_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, ...payload }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const message = data.display_message || data.error_message || 'Plaid Sandbox rejected the request.';
    const error = new Error(message);
    error.status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    throw error;
  }
  return data;
}
