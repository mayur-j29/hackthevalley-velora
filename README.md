# Velora

Velora is an educational money-planning prototype with a sidebar workspace for the overview, markets, portfolio, planning, and extra tools. It includes light and dark themes, a playful Kid experience with plain-language definitions, and a more restrained Teen and Adult experience. Paper orders stay in the browser.

## Run locally

```sh
npm install
npm run dev
```

The introduction asks for a Kid, Teen, or Adult profile, then locks that choice on this device. There is no back-to-profile control; explicitly creating a new local account erases and replaces the current browser profile and paper ledger. A new profile starts with $0, no portfolio positions, no recurring charges, and no invented cash-flow events. Add only the income, bills, or debt you want to model. This profile is not authentication and does not create an online financial account.

Simulated income may be recorded to fund the local paper portfolio. The opt-in recurring-investment schedule runs only as a paper account: while this browser is open, it checks each due cycle against refreshed price marks, virtual buying power, current forecast surplus, and enabled rules before updating the local ledger. Market quotes and portfolio marks refresh every minute while their page is open. Quotes may be delayed. The schedule pauses when the app is closed and does not backfill missed cycles. The Kid profile gets supervised-learning messaging and cannot enable the scheduler. No broker connection is used.

The Trading page includes a fictional checking account and separate paper portfolio, with an internal pretend-cash transfer, holdings, marked value, profit/loss, automated analysis log, and fills. A volatility-preference slider changes deterministic paper position caps, moving-average windows, and simulated stops. The rules engine reviews one-minute historical prices for the supported sample symbols and can automatically record local paper fills as the session replays. This is not an AI choosing suitable investments, an actual bank connection, live-streaming feed, brokerage account, investment signal, or real order. The slider does not predict risk or returns, and cannot make the strategy profitable. Use Reset demo to restore its sample balances and clear its local history.

Recurring contributions are simulated weekly, biweekly, or monthly. The deterministic rules engine checks the remaining forecast, configured reserve, and cash floor before every simulated contribution. The market page uses Yahoo Finance's chart endpoint via the server-side `api/market.js` route for one-minute intraday prices and daily adjusted closes. It shows today's prices and can replay a hypothetical buy-and-hold over a selected 6-month, 1-year, or 5-year window. Quotes may be delayed; provider availability and rate limits can affect refreshes. Historical replay is not a forecast, signal, or brokerage order.

The Vite development server mounts local adapters for market data, Gemini, and the sandbox-only Plaid API, so `npm run dev` can exercise the app routes without Vercel. Add optional server-only keys to an untracked `.env.local` to enable Gemini explanations or Plaid Sandbox locally; the market lab and simulated portfolio work without those credentials. Local AI review is clearly labeled when Gemini is unconfigured or unavailable. Run `npm test` for rules and API validation tests, and `npm run build` for a production bundle.

## Deploy the simulation

Import the GitHub repository into Vercel using the Vite preset. Use `npm run build` as the build command and `dist` as the output directory; Vercel will deploy the functions in `api/` alongside the frontend. Add `GEMINI_API_KEY` and the **Sandbox-only** `PLAID_CLIENT_ID` / `PLAID_SECRET` as server environment variables only if those integrations are wanted. The historical-price and paper-account simulation need no secret. There is no user authentication or shared server-side account database: editable plan items and paper brokerage state are stored in each browser's local storage, so separate devices do not share an account.

## Optional Gemini Copilot

The app includes a server-side Vercel function at `api/copilot.js`. To enable live Gemini explanations, deploy the Vite project to Vercel and add `GEMINI_API_KEY` as a server environment variable. Never put this key in a `VITE_` variable or browser code. Without the key or serverless runtime, the interface clearly stays in demo-insight mode and uses a local sample-data explanation.

Gemini receives only bounded sample aggregates and the user's short question. It provides explanations only. It cannot make, change, or override a deterministic PASS/BLOCK result. The rules engine runs in `src/finance.js`.

## What is—and is not—live

Market prices are fetched from an upstream public data source and may be delayed. Demo balances, portfolio cash, holdings, orders, default income/bills, and debt examples are synthetic. The only bank connection available is Plaid Sandbox. Velora does not execute or route securities orders, move real funds, or provide formal financial advice. Historical replay excludes taxes, fees, spreads, and actual fills. Past performance does not predict future results.

Recurring auto-invest and historical market replays are paper simulations only. The deterministic rules engine blocks investment simulations when safety rails are disabled or the forecast surplus is invalid. Auto-invest schedules run only while the browser app is open and do not run as a background server job. Plaid is Sandbox-only; Sandbox transfers create fake test records and do not place stock orders. Gemini provides explanations only and cannot authorize or execute transactions. There is no production login, broker, live order execution, or production Plaid integration in this application. A live brokerage product would require an authorized broker integration, real account authentication, server-side background scheduling, explicit customer consents, audit and kill-switch controls, and security, operational, licensing, and legal/compliance work; adding credentials alone will not enable real trading.

Run the safety-engine regression tests with `npm test` and build the frontend with `npm run build`.

## Plaid Sandbox account and transfer flow

1. Create a free Plaid developer account at [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup).
2. In the Plaid Dashboard, open **Team Settings → Keys** and copy the **Sandbox** `client_id` and `secret`.
3. In the Vercel project, open **Settings → Environment Variables** and add `PLAID_CLIENT_ID` and `PLAID_SECRET` for Preview (and Development if needed). Keep them server-side. Redeploy after adding them.
4. Open the deployed Vercel site, click **Link a sandbox bank**, and choose a Sandbox institution such as First Platypus Bank. Plaid's standard Sandbox login is `user_good` / `pass_good`.
5. Select a checking account. Velora will load its Sandbox balance, run the server-side deterministic reserve check, then allow a capped test ACH transfer. The browser holds the Sandbox access token only in memory; reload the page to relink.

The app's `/api/plaid` handler is hard-coded to `sandbox.plaid.com` and rejects non-Sandbox access tokens. It cannot connect to a production bank. Plaid Sandbox is free, but it uses fake bank data: creating a transfer creates a Plaid test record and does not move money or place a stock order. Sandbox transfers normally remain pending until you advance their status in Plaid's Dashboard. A production account or brokerage integration is a separate, regulated setup and is not enabled here.

For local use, run the Vite development server. Vite's local adapter loads `GEMINI_API_KEY` or Sandbox credentials from `.env.local` on the server only. Do not commit `.env.local`; `.env.example` lists variable names only. `npx vercel dev` can still be used when testing the actual Vercel function runtime.
