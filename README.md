# Velora

Velora is an educational money-planning prototype with a sidebar workspace for the overview, markets, portfolio, planning, and extra tools. It includes light and dark themes, a playful Kid experience with plain-language definitions, and a more restrained Teen and Adult experience. Paper orders stay in the browser.

## Run locally

```sh
npm install
npm run dev
```

The introduction asks for a Kid, Teen, or Adult profile, then saves that choice on this device. Adult and Teen profiles have local demo login and logout controls; logging out preserves the profile and paper ledger, and logging back in lets the user choose a color theme. This is not password-based authentication and does not create an online financial account. Explicitly creating a new local account erases and replaces the current browser profile and paper ledger. A new profile starts with $0, no portfolio positions, no recurring charges, and no invented cash-flow events. Add only the income, bills, or debt you want to model.

Simulated income may be recorded to fund the local paper portfolio. The opt-in recurring-investment schedule runs only as a paper account: while this browser is open, it checks each due cycle against refreshed price marks, virtual buying power, current forecast surplus, and enabled rules before updating the local ledger. Market quotes and portfolio marks refresh every minute while their page is open. Quotes may be delayed. The schedule pauses when the app is closed and does not backfill missed cycles. The Kid profile gets supervised-learning messaging and cannot enable the scheduler. No broker connection is used.

The Trading page is a paper-trading workspace. Gemini can review candlestick patterns for up to 10 selected NYSE/TSX symbols and suggest BUY, SELL, or HOLD actions. A separate deterministic rules layer rejects buys that fail its bullish-pattern, cash, position-cap, or stop checks; accepted orders update only this browser's practice ledger. The complete supported exchange directory is searchable and paginated, so users choose which names enter the scan. TSX uses daily bars and U.S. listings use intraday bars. Checks happen while the page is open and do not run as a background service. These suggestions are educational, can be wrong, and are not investment advice or real orders.

Recurring contributions are simulated weekly, biweekly, or monthly. The deterministic rules engine checks the remaining forecast, configured reserve, and cash floor before every simulated contribution. The market page uses Yahoo Finance's chart endpoint via the server-side `api/market.js` route for one-minute intraday prices and daily adjusted closes. It shows today's prices and can replay a hypothetical buy-and-hold over a selected 6-month, 1-year, or 5-year window. Quotes may be delayed; provider availability and rate limits can affect refreshes. Historical replay is not a forecast, signal, or brokerage order.

The Vite development server mounts local adapters for market data, Gemini, the stock directory, and the sandbox-only Plaid API. Add server-only keys to an untracked `.env.local` to enable Gemini and Twelve Data locally. Without Twelve Data, price data may fall back to Yahoo Finance but the full exchange directory is unavailable. Without Gemini, deterministic fallback rules remain active. Run `npm test` for rules and API validation tests, and `npm run build` for a production bundle.

## Deploy the simulation

Import the GitHub repository into Vercel using the Vite preset. Use `npm run build` as the build command and `dist` as the output directory; Vercel will deploy the functions in `api/` alongside the frontend. Add `GEMINI_API_KEY` and `TWELVE_DATA_API_KEY` in Vercel Project Settings → Environment Variables, then redeploy. These keys are read server-side only; never use `VITE_`-prefixed secrets. Add the **Sandbox-only** `PLAID_CLIENT_ID` / `PLAID_SECRET` only if Plaid Sandbox is wanted. There is no user authentication or shared server-side account database: editable plan items and practice portfolio state are stored in each browser's local storage.

## Optional Gemini Copilot

The app includes server-side Vercel functions at `api/copilot.js` and `api/trading-ai.js`. Add `GEMINI_API_KEY` as a server environment variable to enable AI explanations and candlestick reviews. `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Never put these values in a `VITE_` variable or browser code. Without the key or serverless runtime, the interface uses deterministic fallback rules.

The trading endpoint sends Gemini at most 10 symbols and 20 recent candles per symbol. Gemini returns a suggested action plus a short explanation. The app checks those suggestions locally against candlestick bias, available cash, position caps, and stop thresholds before recording paper fills. Gemini cannot bypass these deterministic checks. Keep the API key server-side.

## What is—and is not—live

Market prices are fetched from an upstream public data source and may be delayed. Demo balances, portfolio cash, holdings, orders, default income/bills, and debt examples are synthetic. The only bank connection available is Plaid Sandbox. Velora does not execute or route securities orders, move real funds, or provide formal financial advice. Historical replay excludes taxes, fees, spreads, and actual fills. Past performance does not predict future results.

Recurring auto-invest and historical market replays are paper simulations only. The strategy scan runs while the browser app is open, up to once per minute, and can only write to the local practice ledger. It does not connect to a broker, place real orders, or move money. Plaid is Sandbox-only. Gemini and candle patterns can be wrong and do not predict returns. A live brokerage product would require a separate authorized broker integration, authenticated brokerage accounts, secure background order infrastructure, explicit customer consents, audit and kill-switch controls, and security, operational, licensing, and legal/compliance work; adding credentials alone will not enable real trading.

Run the safety-engine regression tests with `npm test` and build the frontend with `npm run build`.

## Plaid Sandbox account and transfer flow

1. Create a free Plaid developer account at [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup).
2. In the Plaid Dashboard, open **Team Settings → Keys** and copy the **Sandbox** `client_id` and `secret`.
3. In the Vercel project, open **Settings → Environment Variables** and add `PLAID_CLIENT_ID` and `PLAID_SECRET` for Preview (and Development if needed). Keep them server-side. Redeploy after adding them.
4. Open the deployed Vercel site, click **Link a sandbox bank**, and choose a Sandbox institution such as First Platypus Bank. Plaid's standard Sandbox login is `user_good` / `pass_good`.
5. Select a checking account. Velora will load its Sandbox balance, run the server-side deterministic reserve check, then allow a capped test ACH transfer. The browser holds the Sandbox access token only in memory; reload the page to relink.

The app's `/api/plaid` handler is hard-coded to `sandbox.plaid.com` and rejects non-Sandbox access tokens. It cannot connect to a production bank. Plaid Sandbox is free, but it uses fake bank data: creating a transfer creates a Plaid test record and does not move money or place a stock order. Sandbox transfers normally remain pending until you advance their status in Plaid's Dashboard. A production account or brokerage integration is a separate, regulated setup and is not enabled here.

For local use, run the Vite development server. Vite's local adapter loads `GEMINI_API_KEY` or Sandbox credentials from `.env.local` on the server only. Do not commit `.env.local`; `.env.example` lists variable names only. `npx vercel dev` can still be used when testing the actual Vercel function runtime.
