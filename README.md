# Velora

Velora’s primary **Wealth Manager** workspace runs a seeded market simulation with three dummy portfolios. Its prices are generated in the browser; no broker or market-data API is used by this workspace. When Supabase is configured, users sign in, enter a short profile, and save simulation state in a private per-user database row. Without Supabase, it stays in clearly labeled local mode. Gemini is optional and runs only from server-side Vercel functions; without a key or when AI is unavailable, Velora uses deterministic persona-based rules.

The existing educational planning, paper-trading, market replay, and Plaid Sandbox pages remain available from the sidebar. Those older pages retain their existing data providers and Sandbox-only bank flow; no page can connect to a brokerage or place a real securities order.

## Simulated Wealth Manager

- Aisha, Marcus, and Elena have seeded cash balances, goals, risk profiles, and horizons. New users enter a name, age, occupation, risk comfort, goal, and horizon; Velora greets them by name and selects a starting simulated portfolio based on their risk choice. The AI fallback uses visibly different target mixes for aggressive, balanced, and conservative profiles.
- The simulated market includes ten stocks and ETFs, seeded geometric price paths, four switchable regimes, market events, simulated fees/slippage, and two years of chart history.
- The Approve mode queues AI proposals for review. Auto mode applies the same deterministic limits: a 25% per-stock cap, persona cash buffers, three trades per cycle, no shorting or leverage, and a daily drawdown circuit breaker.
- Fast-forward runs weekly AI cycles. Demo crash setup seeds a persona-based paper portfolio, applies a crash, and asks Velora to review risk. The SPY and cash comparisons use the same seeded history.
- Ask Velora receives the active dummy account, its portfolio, market events, and saved decision log. It must rely on that log when describing trades; the fallback reports when no matching trade is recorded.

Run `npm test` for the deterministic engine, agent guardrail, and API tests. Run `npm run typecheck` to check the TypeScript simulation core and `npm run build` to check the production bundle. To enable the live LLM routes, set the server-side `GEMINI_API_KEY`; the simulated market and rule fallback work without it.

## Run locally

```sh
npm install
npm run dev
```

The introduction asks for a Kid, Teen, or Adult profile, then saves that choice on this device. Adult and Teen profiles have local demo login and logout controls; logging out preserves the profile and paper ledger, and logging back in lets the user choose a color theme. This is not password-based authentication and does not create an online financial account. Explicitly creating a new local account erases and replaces the current browser profile and paper ledger. A new profile starts with $0, no portfolio positions, no recurring charges, and no invented cash-flow events. Add only the income, bills, or debt you want to model.

Simulated income may be recorded to fund the local paper portfolio. The opt-in recurring-investment schedule runs only as a paper account: while this browser is open, it checks each due cycle against refreshed price marks, virtual buying power, current forecast surplus, and enabled rules before updating the local ledger. Market quotes and portfolio marks refresh every minute while their page is open. Quotes may be delayed. The schedule pauses when the app is closed and does not backfill missed cycles. The Kid profile gets supervised-learning messaging and cannot enable the scheduler. No broker connection is used.

The Trading page is a paper-trading workspace. Gemini can review candlestick patterns for up to 10 selected NYSE/TSX symbols and suggest BUY, SELL, or HOLD actions. A separate deterministic rules layer rejects buys that fail its bullish-pattern, cash, position-cap, or stop checks; accepted orders update only this browser's practice ledger. The complete supported exchange directory is searchable and paginated, so users choose which names enter the scan. TSX uses daily bars and U.S. listings use intraday bars. Checks happen while the page is open and do not run as a background service. These suggestions are educational, can be wrong, and are not investment advice or real orders.

Recurring contributions are simulated weekly, biweekly, or monthly. The deterministic rules engine checks the remaining forecast, configured reserve, and cash floor before every simulated contribution. The market page uses Yahoo Finance's chart endpoint via the server-side `api/market.js` route for one-minute intraday prices and daily adjusted closes. It shows today's prices and can replay a hypothetical buy-and-hold over a selected 6-month, 1-year, or 5-year window. Quotes may be delayed; provider availability and rate limits can affect refreshes. Historical replay is not a forecast, signal, or brokerage order.

The Vite development server mounts local adapters for the legacy market tools, Gemini, the stock directory, and the Sandbox-only Plaid API. Add server-only keys to an untracked `.env.local` to enable Gemini and Twelve Data locally. Twelve Data is only used by the existing market and trading pages; the Wealth Manager uses its seeded simulated market. Without Gemini, its deterministic fallback rules remain active.

## Deploy the simulation

Import the GitHub repository into Vercel using the Vite preset. Use `npm run build` as the build command and `dist` as the output directory; Vercel deploys the functions in `api/` alongside the frontend. Add `GEMINI_API_KEY` in Vercel Project Settings → Environment Variables to enable LLM responses; without it, the wealth agent and chat advisor use their local rule fallbacks. `TWELVE_DATA_API_KEY` is optional for stock directory search and market candles; Yahoo Finance is used as a fallback. These keys are read server-side only; never use `VITE_`-prefixed secrets. Add the **Sandbox-only** `PLAID_CLIENT_ID` / `PLAID_SECRET` only if the legacy Plaid Sandbox page is wanted. Velora accounts are stored locally in the current browser profile, so separate Chrome profiles keep separate account data.

## Optional Gemini Copilot

The app includes server-side Vercel functions at `api/copilot.js` and `api/trading-ai.js`. Add `GEMINI_API_KEY` as a server environment variable to enable AI explanations and candlestick reviews. `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Never put these values in a `VITE_` variable or browser code. Without the key or serverless runtime, the interface uses deterministic fallback rules.

The trading endpoint sends Gemini at most 10 symbols and 20 recent candles per symbol. Gemini returns a suggested action plus a short explanation. The app checks those suggestions locally against candlestick bias, available cash, position caps, and stop thresholds before recording paper fills. Gemini cannot bypass these deterministic checks. Keep the API key server-side.

## What is—and is not—live

The Wealth Manager's prices, balances, holdings, events, and orders are synthetic and seeded locally. The older Markets and AI Trading pages may fetch external quote data, and the legacy bank flow is Plaid Sandbox only. Velora does not connect to a broker, route securities orders, or move real funds. Simulated results are educational and are not financial advice; historical paths are not forecasts.

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
