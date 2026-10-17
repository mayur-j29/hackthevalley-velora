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
