import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, Clock3, CreditCard, Landmark, LockKeyhole, Menu, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { buildForecast, crashScenarios, evaluateSimulatedTrade, getSafeSurplus, simulateAutoInvest, startingBalance } from './finance';
import './styles.css';

const personas = ['Kid', 'Student', 'Adult'];
const subscriptions = [
  { name: 'Netflix', detail: 'Entertainment · monthly', amount: 16.99, icon: 'N', color: '#e94e4e' },
  { name: 'GoodLife Fitness', detail: 'Wellness · monthly', amount: 39.99, icon: 'g', color: '#62a587' },
  { name: 'Spotify', detail: 'Music · monthly', amount: 12.99, icon: '◖', color: '#1f9c67' },
];
const money = (value, digits = 0) => `$${new Intl.NumberFormat('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)}`;

function CashFlowChart({ forecast }) {
  const [hover, setHover] = useState(null);
  const minValue = Math.min(0, ...forecast.map(point => point.value));
  const maxValue = Math.max(...forecast.map(point => point.value));
  const min = minValue - 250, max = maxValue + 250;
  const x = day => 35 + (day / 30) * 735;
  const y = value => 174 - ((value - min) / Math.max(1, max - min)) * 145;
  const points = forecast.map(point => `${x(point.day)},${y(point.value)}`).join(' ');
  const zeroY = y(0);
  const hovered = hover === null ? null : forecast[hover];
  return <div className="chart-wrap">
    <div className="chart-labels"><span>{money(max, 0)}</span><span>{money((max + min) / 2, 0)}</span><span>$0</span></div>
    <svg className="chart" viewBox="0 0 800 220" role="img" aria-label="Projected cash flow over the next 30 days">
      <defs><linearGradient id="cashFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#317b5e" stopOpacity=".2"/><stop offset="100%" stopColor="#317b5e" stopOpacity="0"/></linearGradient></defs>
      {[0,1,2,3].map(i => <line key={i} x1="35" x2="770" y1={27 + i * 48} y2={27 + i * 48} className="grid-line"/>)}
      <line x1="35" x2="770" y1={zeroY} y2={zeroY} className="zero-line"/>
      <path d={`M 35 ${y(forecast[0].value)} ${forecast.map(point => `L ${x(point.day)} ${y(point.value)}`).join(' ')} L 770 184 L 35 184 Z`} fill="url(#cashFill)"/>
      <polyline points={points} className="chart-line"/>
      {forecast.filter(point => point.events.length).map(point => <g key={point.day}><line x1={x(point.day)} x2={x(point.day)} y1="22" y2="184" className="event-line"/><circle cx={x(point.day)} cy={y(point.value)} r="4" className={point.events.some(event => event.title === 'Rent') ? 'event-dot rent' : 'event-dot'}/></g>)}
      {hovered && <g><line x1={x(hovered.day)} x2={x(hovered.day)} y1="16" y2="185" className="hover-line"/><circle cx={x(hovered.day)} cy={y(hovered.value)} r="5" className="hover-dot"/></g>}
      {forecast.map((point, index) => <rect key={point.day} x={x(point.day)-12} y="14" width="24" height="172" fill="transparent" onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} tabIndex="0" aria-label={`${point.date.toLocaleDateString()} projected balance ${money(point.value, 2)}`}/>)}
      <text x="35" y="211" className="axis-label">TODAY</text><text x="770" y="211" textAnchor="end" className="axis-label">30 DAYS</text>
    </svg>
    {hovered && <div className="chart-tooltip" style={{ left: `${Math.min(82, Math.max(5, hovered.day / 30 * 100))}%`, top: `${Math.max(0, y(hovered.value)-44)}px` }}><span>{hovered.date.toLocaleDateString('en-CA',{month:'short',day:'numeric'}).toUpperCase()}</span><b>{money(hovered.value,0)}</b>{hovered.events.map(event => <small key={event.title}>{event.title} · {event.amount > 0 ? '+' : '−'}{money(Math.abs(event.amount),2)}</small>)}{!hovered.events.length && <small>No scheduled activity</small>}</div>}
    <div className="chart-legend"><span><i className="legend-dot green"/> Projected balance</span><span><i className="legend-dash"/> Scheduled activity</span><span><i className="legend-dot coral"/> Protected reserve · {money(1200)}</span></div>
  </div>;
}

function PaperTradeAgent({ plan, asset, cadence, rails, forecast, safeSurplus, bills, income, recurringMonthly, persona, onAiStatus }) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState(null);

  async function runReview() {
    if (running) return;
    setRunning(true);
    setStep(0);
    setResult(null);
    const wait = duration => new Promise(resolve => setTimeout(resolve, duration));
    const rulesVerdict = rails && plan.executions.length > 0 ? 'PASS' : 'BLOCK';
    const rulesReason = !rails
      ? 'Safety rails are off, so all scheduled contributions are blocked.'
      : plan.executions.length === 0
        ? 'No contribution passed the current reserve and cash-floor checks.'
        : `${plan.executions.length} contribution${plan.executions.length === 1 ? '' : 's'} passed the reserve and cash-floor checks; ${plan.blocked.length} were blocked.`;
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 12000);

    try {
      await wait(450);
      setStep(1);
      await wait(450);
      setStep(2);
      const response = await fetch('/api/copilot', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Review this ${cadence} ${money(Number(plan.executions[0]?.amount ?? plan.blocked[0]?.amount ?? 0), 2)} ${asset} paper-investing schedule. Explain what the simulation and its deterministic result mean; do not make an investment recommendation.`,
          persona,
          projectedLow: plan.lowestBalance ?? Math.min(...forecast.map(point => point.value)),
          safeSurplus,
          upcomingBills: bills,
          expectedIncome: income,
          recurringMonthly,
          investmentVerdict: rulesVerdict.toLowerCase(),
          investmentReason: rulesReason,
          paperPlan: {
            asset,
            contribution: plan.executions[0]?.amount ?? plan.blocked[0]?.amount ?? 0,
            cadence,
            approvedSimulations: plan.executions.length,
            blockedSimulations: plan.blocked.length,
            rulesVerdict,
            rulesReason,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.answer) throw new Error('Gemini is unavailable');
      onAiStatus('live');
      setResult({ plan, review: data.answer, mode: 'live', verdict: rulesVerdict, reason: rulesReason });
    } catch {
      onAiStatus('demo');
      setResult({
        plan,
        review: `Local simulation complete: ${plan.executions.length} contribution${plan.executions.length === 1 ? '' : 's'} approved and ${plan.blocked.length} blocked. ${rulesReason} Gemini is unavailable, so this explanation is generated locally; no order was sent.`,
        mode: 'demo',
        verdict: rulesVerdict,
        reason: rulesReason,
      });
    } finally {
      clearTimeout(requestTimeout);
      setStep(3);
      setRunning(false);
    }
  }

  const stages = ['Mapping upcoming cash flow', 'Checking reserve & bill guardrails', 'Asking Gemini to review the paper plan'];

  return <>
    <button className="trade-button agent-run-button" onClick={runReview} disabled={running} aria-busy={running}>
      <span className={running ? 'agent-button-spark active' : 'agent-button-spark'}><Sparkles size={17}/></span>
      <span>{running ? 'Agent is reviewing your plan…' : 'Run AI paper-trade review'}</span>
      {!running && <ArrowUpRight size={16}/>}
    </button>
    {running && <div className="agent-progress" role="status" aria-live="polite">
      <div className="agent-progress-heading"><span className="agent-orb"><Sparkles size={15}/></span><span><b>Velora agent in progress</b><small>Analysis only · no brokerage order is sent</small></span><span className="agent-pulse"/></div>
      <div className="agent-stages">{stages.map((label, index) => <div className={`agent-stage ${index < step ? 'done' : index === step ? 'current' : ''}`} key={label}><span className="stage-mark">{index < step ? <Check size={12}/> : index === step ? <i/> : index + 1}</span><span>{label}</span>{index === 2 && <span className="gemini-stage">GEMINI</span>}</div>)}</div>
    </div>}
    {result && <div className="automation-result agent-result" aria-live="polite">
      <div className="result-head"><span className="result-icon"><Check size={15}/></span><div><b>{result.plan.executions.length} simulated contribution{result.plan.executions.length === 1 ? '' : 's'} · {money(result.plan.total)}</b><small>{result.plan.reason}</small></div><span className={`agent-result-mode ${result.mode}`}>{result.mode === 'live' ? 'GEMINI LIVE' : 'LOCAL REVIEW'}</span></div>
      <div className="agent-review"><div className="agent-review-title"><Sparkles size={13}/>{result.mode === 'live' ? 'Gemini review' : 'Velora review'}</div><p>{result.review}</p></div>
      {result.plan.executions.length > 0 && <div className="execution-chips">{result.plan.executions.map(run => <span key={run.day}>{run.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} <b>{money(run.amount)}</b></span>)}</div>}
      {result.plan.blocked.length > 0 && <small className="blocked-count">{result.plan.blocked.length} scheduled contribution{result.plan.blocked.length === 1 ? '' : 's'} blocked by reserve rules.</small>}
      <div className={`agent-verdict ${result.verdict === 'PASS' ? 'pass' : 'block'}`}><ShieldCheck size={14}/><span><b>RULES ENGINE · {result.verdict}</b><small>{result.reason}</small></span></div>
      <small className="agent-disclaimer">Paper simulation only. AI explains the result; deterministic rules decide it. No trade or transfer was sent.</small>
    </div>}
  </>;
}

function App() {
  const [persona, setPersona] = useState('Adult');
  const [purchase, setPurchase] = useState(0);
  const [purchaseInput, setPurchaseInput] = useState('');
  const [cancelled, setCancelled] = useState([]);
  const [rails, setRails] = useState(true);
  const [ticker, setTicker] = useState('S&P 500');
  const [amount, setAmount] = useState('500');
  const [tradePreview, setTradePreview] = useState(false);
  const [cadence, setCadence] = useState('7');
  const [paperAsset, setPaperAsset] = useState('S&P 500');
  const [contribution, setContribution] = useState('250');
  const [crash, setCrash] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('Your 30-day plan is steady. Essentials stay covered in the forecast, leaving room to build a small, repeatable investing habit. Start with a schedule you can comfortably pause.');
  const [aiStatus, setAiStatus] = useState('demo');
  const [aiLoading, setAiLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [plaidAccessToken, setPlaidAccessToken] = useState('');
  const [linkedAccount, setLinkedAccount] = useState(null);
  const [linkedInstitution, setLinkedInstitution] = useState('');
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidMessage, setPlaidMessage] = useState('');
  const [sandboxTransfers, setSandboxTransfers] = useState([]);
  const accountBalance = linkedAccount?.available ?? linkedAccount?.current ?? startingBalance;
  const forecast = useMemo(() => buildForecast({ purchase, cancelled, balance: accountBalance }), [purchase, cancelled, accountBalance]);
  const { lowestBalance, safeSurplus } = useMemo(() => getSafeSurplus(forecast), [forecast]);
  const bills = forecast.flatMap(point => point.events).filter(event => event.amount < 0).reduce((sum,event) => sum + Math.abs(event.amount),0);
  const income = forecast.flatMap(point => point.events).filter(event => event.amount > 0).reduce((sum,event) => sum + event.amount,0);
  const recurringTotal = subscriptions.filter(item => !cancelled.includes(item.name)).reduce((sum,item) => sum + item.amount,0);
  const decision = evaluateSimulatedTrade({ amount, safeSurplus, railsEnabled: rails });
  const autoPlan = useMemo(() => simulateAutoInvest({ forecast, amount: contribution, cadence, railsEnabled: rails, floor: 300 }), [forecast, contribution, cadence, rails]);
  const displayName = persona === 'Kid' ? 'Your money is growing' : persona === 'Student' ? 'You’ve got this, Alex' : 'A clearer view of your money';
  const personaCopy = persona === 'Kid' ? 'Every small choice is a chance to learn.' : persona === 'Student' ? 'Tuition, rent, and the rest of life—in one clear plan.' : 'Your next move, with a little more clarity.';

  async function plaidRequest(payload) {
    const response = await fetch('/api/plaid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Plaid Sandbox is unavailable.');
    return data;
  }

  async function linkSandboxBank() {
    if (!window.Plaid) { setPlaidMessage('Plaid Link could not load. Open the deployed Vercel app with internet access.'); return; }
    setPlaidBusy(true);
    setPlaidMessage('');
    try {
      const { linkToken } = await plaidRequest({ action: 'link-token' });
      const linkHandler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const { accessToken } = await plaidRequest({ action: 'exchange', public_token: publicToken });
            const { accounts } = await plaidRequest({ action: 'accounts', access_token: accessToken });
            const selected = metadata.accounts?.[0]?.id;
            const account = accounts.find(item => item.accountId === selected) || accounts.find(item => ['checking', 'savings'].includes(item.subtype));
            if (!account) throw new Error('No eligible checking or savings account was returned.');
            setPlaidAccessToken(accessToken);
            setLinkedAccount(account);
            setLinkedInstitution(metadata.institution?.name || 'Plaid Sandbox Bank');
            setPlaidMessage('Sandbox account connected for this browser session.');
          } catch (error) { setPlaidMessage(error.message); }
          finally { setPlaidBusy(false); }
        },
        onExit: () => setPlaidBusy(false),
      });
      linkHandler.open();
    } catch (error) {
      setPlaidMessage(error.message);
      setPlaidBusy(false);
    }
  }

  async function createSandboxTransfer() {
    if (!plaidAccessToken || !linkedAccount) return;
    if (!rails) { setPlaidMessage('Turn safety rails on before creating a bank transfer.'); return; }
    setPlaidBusy(true);
    setPlaidMessage('');
    try {
      const result = await plaidRequest({ action: 'transfer', access_token: plaidAccessToken, account_id: linkedAccount.accountId, amount });
      setSandboxTransfers(previous => [result.transfer, ...previous]);
      setPlaidMessage(`Transfer ${result.transfer.status} · ${money(result.transfer.amount,2)} · ${result.transfer.id}`);
      const { accounts } = await plaidRequest({ action: 'accounts', access_token: plaidAccessToken });
      setLinkedAccount(accounts.find(account => account.accountId === linkedAccount.accountId) || linkedAccount);
    } catch (error) { setPlaidMessage(error.message); }
    finally { setPlaidBusy(false); }
  }

  async function askCopilot(prompt = question) {
    const text = prompt.trim();
    if (!text || aiLoading) return;
    setQuestion(text);
    setAiLoading(true);
    try {
      const response = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, persona, projectedLow: lowestBalance, safeSurplus, upcomingBills: bills, expectedIncome: income, recurringMonthly: recurringTotal, investmentVerdict: decision.verdict, investmentReason: decision.reason }) });
      const data = await response.json();
      if (!response.ok || !data.answer) throw new Error('AI endpoint unavailable');
      setAnswer(data.answer);
      setAiStatus('live');
    } catch {
      setAiStatus('demo');
      const isPurchase = /buy|purchase|macbook|laptop/i.test(text);
      const isInvest = /invest|stock|trade/i.test(text);
      setAnswer(isPurchase
        ? `In this sample forecast, your lowest projected balance is ${money(lowestBalance)} after planned bills and income. The essentials reserve is protected at ${money(1200)}. Try the purchase preview to see its exact effect on the 30-day curve.`
        : isInvest
          ? `${decision.verdict === 'pass' ? 'The current order passes' : 'The current order is blocked'} under the deterministic rules engine: ${decision.reason} The AI can explain that result, but it cannot change it.`
          : `Your plan has ${money(safeSurplus)} of projected safe surplus after a ${money(1200)} reserve. ${cancelled.length ? `The ${cancelled.join(', ')} cancellation simulation is reflected in the forecast.` : 'Try the recurring-charge controls to see how small changes affect the forecast.'} This is sample-data analysis.`);
    } finally {
      setAiLoading(false);
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Velora home"><span className="brand-mark"><span/><span/><span/></span><span>velora</span></a>
      <nav className={mobileMenu ? 'persona-nav open' : 'persona-nav'} aria-label="Choose your view">{personas.map(item => <button key={item} className={persona === item ? 'persona active' : 'persona'} onClick={() => setPersona(item)}>{item}</button>)}</nav>
      <div className="top-actions"><span className="status"><i/> {linkedAccount ? 'Sandbox bank linked' : 'Sandbox bank ready'}</span><span className="engine"><Sparkles size={13}/> Gemini {aiStatus === 'live' ? 'connected' : 'demo mode'}</span><button className="icon-btn" aria-label="Notifications"><Bell size={18}/></button><button className="avatar" aria-label="Account profile">A</button><button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle persona menu"><Menu size={19}/></button></div>
    </header>
    <main id="top" className="dashboard">
      <div className="welcome-row"><div><div className="eyebrow light-eyebrow"><span className="eyebrow-dash"/> YOUR FINANCIAL SNAPSHOT <span className="date-label">· NEXT 30 DAYS</span></div><h1>{displayName}<span className="period">.</span></h1><p className="welcome-copy">{personaCopy}</p></div><button className="account-chip" onClick={linkSandboxBank} disabled={plaidBusy}><span className="bank-icon"><Landmark size={17}/></span><span><b>{linkedAccount ? linkedInstitution : 'Link a sandbox bank'}</b><small>{linkedAccount ? `${linkedAccount.name} · •••• ${linkedAccount.mask}` : plaidBusy ? 'Opening secure Plaid Link…' : 'Test account · no real funds'}</small></span><ChevronDown size={16}/></button></div>
      <section className="summary-grid" aria-label="Account overview">
        <article className="summary-card balance-card"><div className="card-topline"><span>{linkedAccount ? 'Linked bank balance' : 'Starting balance'}</span><CircleHelp size={15}/></div><div className="balance-amount">{money(accountBalance-purchase,2)}</div><div className="balance-foot"><span className="up-label"><TrendingUp size={14}/> {linkedAccount ? 'Plaid Sandbox' : 'Sample account'}</span><span>{linkedAccount ? `${linkedAccount.currency} · •••• ${linkedAccount.mask}` : 'Demo data'}</span></div><div className="balance-spark"><svg viewBox="0 0 140 42"><path d="M1 32 C18 26 18 33 33 25 S55 28 65 17 S84 23 98 12 S116 19 139 3" fill="none" stroke="#70b69a" strokeWidth="2"/></svg></div></article>
        <article className="summary-card"><div className="card-topline"><span>Income · 30 days</span><span className="metric-icon income-icon"><ArrowDownLeft size={17}/></span></div><div className="metric-amount">{money(income,0)}</div><div className="metric-foot"><span className="metric-note"><i className="small-green-dot"/> Paydays included</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>Planned outflows</span><span className="metric-icon bill-icon"><ArrowUpRight size={17}/></span></div><div className="metric-amount">{money(bills,0)}</div><div className="metric-foot"><span className="metric-note">Scheduled bills included</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>Safe to explore</span><span className="metric-icon safe-icon"><ShieldCheck size={17}/></span></div><div className="metric-amount">{money(safeSurplus,0)}</div><div className="metric-foot"><span className="metric-note">After a {money(1200)} cash buffer</span></div></article>
      </section>
      <section className="panel forecast-panel"><div className="panel-heading"><div><div className="eyebrow">CASH FLOW <span className="live-pill"><i/> 30-DAY OUTLOOK</span></div><h2>See the next 30 days, before they happen.</h2><p>Scheduled income and bills shape every planning decision.</p></div><span className="range-select"><Activity size={14}/> 30-day forecast</span></div><div className="chart-summary"><div><span>Projected today</span><strong>{money(accountBalance-purchase,2)}</strong></div><div className="projection-divider"/><div><span>Forecast low</span><strong className={lowestBalance < 1200 ? 'coral-text' : ''}>{money(lowestBalance,2)}</strong></div><div className="forecast-tag"><ShieldCheck size={15}/><span>{lowestBalance >= 1200 ? 'Reserve stays covered' : 'Reserve needs attention'}</span></div></div><CashFlowChart forecast={forecast}/>{crash && <div className="crash-note"><TrendingDown size={15}/><span>{crashScenarios[crash].label}: a {money(Number(amount||0))} hypothetical {ticker} position would be worth about {money(Number(amount||0)*(1-crashScenarios[crash].drawdown),2)} at the scenario low. This replay is illustrative and separate from your cash forecast.</span><button onClick={() => setCrash('')} aria-label="Dismiss crash replay"><X size={14}/></button></div>}</section>
      <section className="panel bank-transfer-panel"><div className="section-title"><div className="section-icon blue-icon"><Landmark size={18}/></div><div><div className="eyebrow">PLAID SANDBOX</div><h2>Linked account activity</h2></div><span className={`bank-connection-pill ${linkedAccount?'connected':''}`}><i/>{linkedAccount?'CONNECTED':'TEST MODE'}</span></div><p className="section-description">Connect a Plaid test account, then create a guarded sandbox transfer. The bank API writes a transfer record; no real funds or stock orders move in Sandbox.</p>{linkedAccount ? <div className="linked-bank-row"><span className="bank-icon light"><Landmark size={17}/></span><div><b>{linkedInstitution} · {linkedAccount.name}</b><small>{linkedAccount.subtype} account · •••• {linkedAccount.mask} · {linkedAccount.currency}</small></div><div className="linked-bank-balance"><span>Available</span><b>{money(linkedAccount.available ?? linkedAccount.current,2)}</b></div></div> : <div className="bank-connect-callout"><div><b>Connect a test institution</b><small>Use Plaid's Sandbox sign-in, never your real bank credentials.</small></div><button className="connect-plaid-button" onClick={linkSandboxBank} disabled={plaidBusy}>{plaidBusy?'Connecting…':'Open Plaid Link'} <ArrowUpRight size={15}/></button></div>}<div className="sandbox-transfer-row"><label><span>TRANSFER AMOUNT</span><div className="amount-input"><b>$</b><input type="number" min="1" max="1000" value={amount} onChange={event=>setAmount(event.target.value)} aria-label="Sandbox transfer amount"/></div></label><button className="sandbox-transfer-button" onClick={createSandboxTransfer} disabled={!linkedAccount || plaidBusy || !rails}>{plaidBusy?'Working…':'Create sandbox transfer'} <ArrowUpRight size={15}/></button></div>{!rails&&<div className="sandbox-rules-message"><ShieldCheck size={14}/> Turn deterministic safety rails on before submitting a transfer.</div>}{plaidMessage&&<div className="plaid-message" role="status">{plaidMessage}</div>}{sandboxTransfers.length>0&&<div className="transfer-list"><div className="transfer-list-heading">RECENT SANDBOX TRANSFERS <small>REAL PLAID TEST RECORDS · NO REAL FUNDS</small></div>{sandboxTransfers.map(transfer=><div className="transfer-row" key={transfer.id}><span className="transfer-check"><Check size={14}/></span><div><b>Velora investment contribution</b><small>{new Date(transfer.created).toLocaleString('en-CA')} · {transfer.network?.toUpperCase()} · {transfer.id}</small></div><strong>−{money(transfer.amount,2)}</strong><span className="transfer-status">{transfer.status}</span></div>)}</div>}</section>
      <div className="lower-grid">
        <section className="panel invest-panel automation-panel"><div className="section-title"><div className="section-icon green-icon"><Activity size={18}/></div><div><div className="eyebrow">AUTOMATION LAB</div><h2>Recurring investing</h2></div><span className="sim-only">SIMULATION ONLY</span></div><p className="section-description">Set a cadence. Velora checks every future bill before each simulated buy.</p><div className="automation-pool"><div><span>Available safe surplus</span><b>{money(safeSurplus)}</b></div><span className="safe-label"><ShieldCheck size={14}/> {rails ? 'Rules on' : 'Rules off'}</span></div><div className="auto-fields"><label><span>PAPER ASSET</span><div className="select-wrap"><select value={paperAsset} onChange={event => setPaperAsset(event.target.value)} aria-label="Paper investment asset"><option>S&amp;P 500</option><option>AAPL</option><option>MSFT</option><option>TSLA</option></select><ChevronDown size={15}/></div></label><label><span>CONTRIBUTE</span><div className="amount-input"><b>$</b><input type="number" min="1" value={contribution} onChange={event => setContribution(event.target.value)} aria-label="Contribution amount"/></div></label><label><span>CADENCE</span><div className="select-wrap"><select value={cadence} onChange={event => setCadence(event.target.value)}>
        <option value="7">Weekly</option>
        <option value="14">Every 2 weeks</option>
        <option value="30">Monthly</option>
      </select><ChevronDown size={15}/></div></label></div><div className="automation-context"><span>Cash floor</span><b>{money(300)}</b><span>Protected essentials</span><b>{money(1200)}</b></div><PaperTradeAgent key={`${contribution}-${cadence}-${paperAsset}-${rails}-${safeSurplus}`} plan={autoPlan} asset={paperAsset} cadence={Number(cadence) === 7 ? 'weekly' : Number(cadence) === 14 ? 'biweekly' : 'monthly'} rails={rails} forecast={forecast} safeSurplus={safeSurplus} bills={bills} income={income} recurringMonthly={recurringTotal} persona={persona} onAiStatus={setAiStatus}/>
      </section>
      <section className="panel copilot-panel"><div className="section-title"><div className="section-icon violet-icon"><Sparkles size={18}/></div><div><div className="eyebrow">VELORA COPILOT</div><h2>Make the numbers make sense.</h2></div><span className={`ai-mode ${aiStatus}`}>{aiStatus === 'live' ? 'GEMINI LIVE' : 'DEMO INSIGHT'}</span></div><p className="section-description">Ask a question about your plan. Gemini explains the picture; it never changes a safety verdict.</p><div className="copilot-message"><span className="copilot-avatar"><Sparkles size={15}/></span><div><div className="message-meta">{aiStatus==='live'?'Gemini · grounded in this forecast':'Velora sample insight'}<span>JUST NOW</span></div><p>{answer}</p></div></div><form className="copilot-form" onSubmit={event => {event.preventDefault();askCopilot()}}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about a purchase, bill, or investing plan…" aria-label="Ask Velora Copilot"/><button type="submit" disabled={aiLoading || !question.trim()}>{aiLoading?'Thinking…':'Ask'} <ArrowUpRight size={15}/></button></form><div className="prompt-chips"><span>Try</span><button onClick={() => askCopilot('Can I afford a $1,200 laptop?')}>Can I afford a laptop?</button><button onClick={() => askCopilot('How much could I invest safely?')}>Explain my safe surplus</button></div><div className="ai-boundary"><LockKeyhole size={13}/> Explanations are informational. Rules Engine owns every PASS / BLOCK result.</div></section>
      <section className="panel decision-panel"><div className="section-title"><div className="section-icon coral-icon"><Wallet size={18}/></div><div><div className="eyebrow">WHAT-IF PLANNER</div><h2>Try a decision first.</h2></div></div><p className="section-description">See what a purchase could change across your whole month.</p><form className="purchase-input" onSubmit={event => {event.preventDefault();setPurchase(Number(purchaseInput.replace(/[^0-9.]/g,''))||0)}}><span>$</span><input value={purchaseInput} onChange={event => setPurchaseInput(event.target.value)} placeholder="1,200 laptop" aria-label="Purchase amount"/><button type="submit">Preview <span>→</span></button></form><div className="quick-picks"><span>Try</span><button onClick={() => {setPurchaseInput('250');setPurchase(250)}}>$250 weekend trip</button><button onClick={() => {setPurchaseInput('1,200');setPurchase(1200)}}>$1,200 laptop</button>{purchase>0&&<button onClick={() => {setPurchase(0);setPurchaseInput('')}}>Clear</button>}</div><div className="impact-box"><div className="impact-heading"><span className="impact-dot"/> LIVE SCENARIO</div><div className="impact-row"><span>Purchase impact</span><b>−{money(purchase)}</b></div><div className="impact-row"><span>Projected lowest balance</span><b className={lowestBalance<1200?'coral-text':''}>{money(lowestBalance)}</b></div><div className="impact-message"><ShieldCheck size={14}/>{lowestBalance>=1200?'Your $1,200 reserve remains protected.':'This scenario dips into the protected reserve.'}</div></div><div className="ai-footnote"><Activity size={13}/> Forecast recalculates instantly · sample data only</div></section>
      <section className="panel subscriptions-panel"><div className="section-title"><div className="section-icon coral-icon"><CreditCard size={18}/></div><div><div className="eyebrow">RECURRING EXPENSES</div><h2>Small charges, in view.</h2></div></div><div className="subscription-total"><span>Monthly total</span><b>{money(recurringTotal,2)}<small>/mo</small></b></div><div className="subscription-list">{subscriptions.map(item => {const isCancelled=cancelled.includes(item.name);return <div className={isCancelled?'subscription canceled':'subscription'} key={item.name}><div className="service-icon" style={{'--service':item.color}}>{item.icon}</div><div className="service-name"><b>{item.name}</b><small>{isCancelled?'Cancellation simulated':item.detail}</small></div><div className="service-cost">{money(item.amount,2)}<small>/mo</small></div><button className={isCancelled?'toggle on':'toggle'} onClick={() => setCancelled(isCancelled ? cancelled.filter(name => name !== item.name) : [...cancelled, item.name])} aria-label={`${isCancelled?'Restore':'Simulate cancellation'} ${item.name}`}><i/></button></div>})}</div><div className="nudge"><div className="nudge-spark"><Sparkles size={15}/></div><div><span className="nudge-label">PLAN INSIGHT</span><p>{cancelled.length ? `The simulation frees up ${money(subscriptions.filter(item=>cancelled.includes(item.name)).reduce((sum,item)=>sum+item.amount,0),2)} each month and updates every forecast.` : `Your recurring total is ${money(recurringTotal,2)} per month. Toggle a charge to test a cancellation—nothing changes outside this demo.`}</p></div></div></section>
      </div>
      <footer className="page-footer"><span><LockKeyhole size={13}/> Synthetic sample data · no bank connection</span><span>Calculations update as you explore</span><span className="footer-right">Built for clearer decisions</span></footer>
    </main>
    <div className="disclaimer"><span><ShieldCheck size={15}/> <b>Educational &amp; simulation tool only.</b> Velora never moves real funds and does not offer formal financial advice.</span></div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
