# Velora

Velora is a read-only personal-finance and automated-investing simulation. It turns sample cash-flow events into a 30-day projection, previews recurring contributions, and protects a reserve with a deterministic rules engine.

## Run locally

```sh
npm install
npm run dev
```

The dashboard works with synthetic data and does not require a bank connection or AI key. Use the recurring investing lab to simulate weekly, biweekly, or monthly contributions. Each scheduled contribution is checked against remaining projected obligations and the cash reserve before it is allowed.

## Optional Gemini Copilot

The app includes a server-side Vercel function at `api/copilot.js`. To enable live Gemini explanations, deploy the Vite project to Vercel and add `GEMINI_API_KEY` as a server environment variable. Never put this key in a `VITE_` variable or browser code. Without the key or serverless runtime, the interface clearly stays in demo-insight mode and uses a local sample-data explanation.

Gemini receives only bounded sample aggregates and the user's short question. It provides explanations only. It cannot make, change, or override a deterministic PASS/BLOCK result. The rules engine runs in `src/finance.js`.

## Safety

All balances and events are synthetic. Velora does not connect to a bank, execute or route orders, move funds, or provide formal financial advice. Historic market replay is illustrative, not a prediction.

## Plaid Sandbox account and transfer flow

1. Create a free Plaid developer account at [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup).
2. In the Plaid Dashboard, open **Team Settings → Keys** and copy the **Sandbox** `client_id` and `secret`.
3. In the Vercel project, open **Settings → Environment Variables** and add `PLAID_CLIENT_ID` and `PLAID_SECRET` for Preview (and Development if needed). Keep them server-side. Redeploy after adding them.
4. Open the deployed Vercel site, click **Link a sandbox bank**, and choose a Sandbox institution such as First Platypus Bank. Plaid's standard Sandbox login is `user_good` / `pass_good`.
5. Select a checking account. Velora will load its Sandbox balance, run the server-side deterministic reserve check, then allow a capped test ACH transfer. The browser holds the Sandbox access token only in memory; reload the page to relink.

The app's `/api/plaid` handler is hard-coded to `sandbox.plaid.com` and rejects non-Sandbox access tokens. It cannot connect to a production bank. Plaid Sandbox is free, but it uses fake bank data: creating a transfer creates a Plaid test record and does not move money or place a stock order. Sandbox transfers normally remain pending until you advance their status in Plaid's Dashboard. A production account or brokerage integration is a separate, regulated setup and is not enabled here.

For local testing of Vercel serverless routes, use `npx vercel dev` after adding the same variables to a local `.env.local` file. Do not commit `.env.local`; `.env.example` lists the variable names only.
