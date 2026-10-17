import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, BookOpenCheck, CalendarDays, Check, ChevronDown, CircleDollarSign, CircleHelp, Clock3, CreditCard, Landmark, LockKeyhole, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet, Wrench, X, LayoutDashboard, BriefcaseBusiness, Sun, Moon } from 'lucide-react';
import { buildForecast, crashScenarios, evaluateSimulatedTrade, getSafeSurplus, simulateAutoInvest } from './finance';
import MarketReplay from './MarketReplay';
import PaperPortfolio from './PaperPortfolio';
import TradingDesk from './TradingDesk';
import WhatIfCoach from './WhatIfCoach';
import WealthManager from './WealthManager';
import KidLearning from './KidLearning';
import { accrueSampleEarnings, createInitialPaperAccount, readPaperAccount, savePaperAccount, subscribePaperAccount } from './paperAccount';
import { CashCalendar, DebtPlanner, sampleDebtPayments } from './PlanningTools';
import './styles.css';
import './planning.css';
import './portfolio.css';
import './onboarding.css';
import './workspace.css';
import './what-if.css';
import './copilot-chat.css';

const personas = ['Kid', 'Teen', 'Adult'];
const DEMO_CASH_EVENTS = Object.freeze([
  ...Array.from({ length: 30 }, (_, index) => ({ day: index + 1, title: 'Sample work earnings', amount: 500, kind: 'income' })),
  { day: 2, title: 'Rent', amount: -1450, kind: 'bill' },
  { day: 8, title: 'Groceries', amount: -180, kind: 'bill' },
  { day: 12, title: 'Utilities', amount: -125, kind: 'bill' },
  { day: 15, title: 'Phone bill', amount: -75, kind: 'bill' },
  { day: 18, title: 'Transit pass', amount: -110, kind: 'bill' },
  { day: 25, title: 'Groceries', amount: -220, kind: 'bill' },
]);
const themeOptions = [
  { id: 'blue-light', name: 'Blue & white', palette: 'blue', mode: 'light', swatches: ['#3975d5', '#f7faff', '#ffffff'] },
  { id: 'blue-dark', name: 'Blue & charcoal', palette: 'blue', mode: 'dark', swatches: ['#75a5ff', '#182435', '#26364b'] },
  { id: 'green-light', name: 'Green & white', palette: 'green', mode: 'light', swatches: ['#347954', '#f4f8f4', '#ffffff'] },
  { id: 'green-dark', name: 'Green & charcoal', palette: 'green', mode: 'dark', swatches: ['#8ad0a1', '#19251e', '#29382f'] },
  { id: 'gold-beige', name: 'Gold & beige', palette: 'gold', mode: 'light', swatches: ['#a77b2d', '#f7f0df', '#fffaf0'] },
  { id: 'gold-dark', name: 'Gold & charcoal', palette: 'gold', mode: 'dark', swatches: ['#e3bd6a', '#25221a', '#393323'] },
  { id: 'slate-dark', name: 'Slate grey', palette: 'slate', mode: 'dark', swatches: ['#b0bdc9', '#20252c', '#303740'] },
];
const subscriptions = [];
const money = (value, digits = 0) => `$${new Intl.NumberFormat('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)}`;

function readAccountProfile() {
  try {
    const account = JSON.parse(window.localStorage.getItem('velora-account-profile') || 'null');
    return account && !account.demo && personas.includes(account.persona) && account.createdAt ? account : null;
  } catch { return null; }
}

function readActiveAccountProfile() {
  try {
    if (window.localStorage.getItem('velora-session-ended') === 'true') return null;
  } catch { /* A browser without storage keeps the profile in this session. */ }
  return readAccountProfile();
}

function readPalette() {
  try {
    const saved = window.localStorage.getItem('velora-palette');
    if (themeOptions.some(option => option.id === saved)) return saved;
    return window.localStorage.getItem('velora-theme') === 'dark' ? 'green-dark' : 'green-light';
  } catch { return 'green-light'; }
}

function createEmptyPaperAccount() {
  return { ...createInitialPaperAccount(), bankCash: 0, cash: 0, budget: 0, earningsStartAt: null };
}

function ThemePicker({ value, onChange }) {
  return <div className="theme-choice-grid" role="radiogroup" aria-label="Choose a colour theme">{themeOptions.map(option => <button type="button" role="radio" aria-checked={value === option.id} key={option.id} className={`theme-choice ${value === option.id ? 'selected' : ''}`} onClick={() => onChange(option.id)}><span className="theme-swatches">{option.swatches.map((color, index) => <i key={index} style={{ background: color }}/>)}</span><span><b>{option.name}</b><small>{option.mode === 'dark' ? 'Dark mode' : 'Light mode'}</small></span><span className="theme-radio">{value === option.id && <i/>}</span></button>)}</div>;
}

function LocalLogin({ profile, palette, theme, onPaletteChange, onLogin }) {
  const isAdult = profile.persona === 'Adult';
  return <div className="account-setup-backdrop"><section className={`account-setup login-setup ${isAdult ? 'professional-account-setup' : ''}`} data-theme={theme.mode} style={isAdult ? { '--palette-accent':theme.swatches[0], '--palette-canvas':theme.swatches[1], '--palette-surface':theme.swatches[2] } : undefined} role="dialog" aria-modal="true" aria-labelledby="login-title"><div className="setup-brand"><span className="brand-mark"><span/><span/><span/></span><b>velora</b></div><div className="setup-kicker">{isAdult ? 'PERSONAL ACCOUNT' : 'LOCAL DEMO ACCOUNT'}</div><h1 id="login-title">Welcome back{profile.firstName ? `, ${profile.firstName}` : ''}.</h1><p className="setup-lede">Choose your colours, then open your saved {profile.persona.toLowerCase()} workspace.</p><ThemePicker value={palette} onChange={onPaletteChange}/><button className="setup-continue" onClick={onLogin}>Log in <ArrowUpRight size={16}/></button><small className="setup-privacy"><LockKeyhole size={12}/> {isAdult ? 'Your profile is stored on this device. No password or online sign-in is set up.' : 'This demo account stays on this device. It has no password or online sign-in.'}</small></section></div>;
}

function AccountSetup({ onCreate, palette, theme, onPaletteChange }) {
  const [persona, setPersona] = useState(() => {
    try {
      const saved = window.localStorage.getItem('velora-onboarding-choice');
      return personas.includes(saved) ? saved : '';
    } catch { return ''; }
  });
  const [firstName, setFirstName] = useState('');
  const [startingBalance, setStartingBalance] = useState(0);
  const [step, setStep] = useState(0);
  const audience = [
    { id: 'Kid', icon: '✦', title: 'Kid', copy: 'A friendly money-learning space with simple words and small goals.' },
    { id: 'Teen', icon: '↗', title: 'Teen', copy: 'Plan for school, first paychecks, saving goals, and future choices.' },
    { id: 'Adult', icon: '▤', title: 'Adult', copy: 'A clear, detailed view of cash flow, obligations, and portfolio decisions.' },
  ];

  function create(event) {
    event.preventDefault();
    if (!persona) return;
    onCreate({ id: `account-${Date.now()}`, persona, firstName: firstName.trim().slice(0, 32), startingBalance: Math.round((Number(startingBalance) || 0) * 100) / 100, createdAt: new Date().toISOString() }, persona === 'Kid' ? 'green-light' : palette);
  }

  function choosePersona(value) {
    setPersona(value);
    try { window.localStorage.setItem('velora-onboarding-choice', value); }
    catch { /* The selection remains available for this setup flow. */ }
  }

  return <div className="account-setup-backdrop"><section className={`account-setup ${persona && persona !== 'Kid' ? 'professional-account-setup' : ''}`} data-theme={theme.mode} style={persona && persona !== 'Kid' ? { '--palette-accent':theme.swatches[0], '--palette-canvas':theme.swatches[1], '--palette-surface':theme.swatches[2] } : undefined} role="dialog" aria-modal="true" aria-labelledby="setup-title"><div className="setup-brand"><span className="brand-mark"><span/><span/><span/></span><b>velora</b></div><div className="setup-kicker">A FRESH START · STEP {step + 1} OF 2</div>{step === 0 ? <><h1 id="setup-title">Your money, on your terms.</h1><p className="setup-lede">Build a personal planning space from zero. Choose the experience that fits you. This creates a local simulation profile—not a bank, brokerage, or real-money account.</p><div className="setup-audiences">{audience.map(option => <button type="button" key={option.id} className={persona === option.id ? 'setup-audience selected' : 'setup-audience'} onClick={() => choosePersona(option.id)} aria-pressed={persona === option.id}><span className="setup-audience-icon">{option.icon}</span><span><b>{option.title}</b><small>{option.copy}</small></span><span className="setup-radio">{persona === option.id ? <i/> : null}</span></button>)}</div><button className="setup-continue" disabled={!persona} onClick={() => setStep(1)}>Continue <ArrowUpRight size={16}/></button><small className="setup-privacy"><LockKeyhole size={12}/> No sign-in required · your profile is saved in this browser</small></> : <form onSubmit={create}><h1 id="setup-title">Let's make it yours{firstName.trim() ? `, ${firstName.trim()}` : ''}.</h1><p className="setup-lede">Your {persona.toLowerCase()} workspace starts with no holdings or bills. Add only the details you want to plan with.</p><label className="setup-name-field"><span>WHAT SHOULD WE CALL YOU? <small>OPTIONAL</small></span><input autoFocus value={firstName} onChange={event => setFirstName(event.target.value)} maxLength={32} placeholder="First name or nickname"/></label>{persona !== 'Kid' && <div className="setup-theme-picker"><b>Choose your colours</b><small>You can change these when you log in later.</small><ThemePicker value={palette} onChange={onPaletteChange}/></div>}<div className="setup-starting-balance"><div className="setup-starting-heading"><span><b>Starting balance</b><small>Choose how much your account starts with.</small></span><div className="setup-starting-entry"><span>$</span><input type="number" min="0" max="100000" step="any" value={startingBalance} onChange={event => setStartingBalance(Math.min(100000, Math.max(0, Number(event.target.value) || 0)))} aria-label="Starting balance in Canadian dollars"/><span>CAD</span></div></div><input className="setup-starting-slider" type="range" min="0" max="100000" step="100" value={startingBalance} onChange={event => setStartingBalance(Number(event.target.value))} aria-label="Choose starting balance"/><div className="setup-starting-limits"><span>$0</span><span>$100,000</span></div></div><label className="setup-understanding"><input type="checkbox" required/><span>I understand this is an educational paper-investing simulation. It cannot place real trades or move real money.</span></label><div className="setup-buttons"><button className="setup-continue" type="submit">Create my account <ArrowUpRight size={16}/></button></div><small className="setup-privacy"><LockKeyhole size={12}/> Profile and preferences are stored locally on this device</small></form>}</section></div>;
}

function CashFlowChart({ forecast, reserve }) {
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
      <defs><linearGradient id="cashFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--theme-accent)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0"/></linearGradient></defs>
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
    <div className="chart-legend"><span><i className="legend-dot green"/> Projected balance</span><span><i className="legend-dash"/> Scheduled activity</span><span><i className="legend-dot coral"/> Protected reserve · {money(reserve)}</span></div>
  </div>;
}

function PaperTradeAgent({ plan, asset, cadence, rails, forecast, safeSurplus, reserve, bills, income, recurringMonthly, persona, onAiStatus }) {
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
          protectedReserve: reserve,
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
      if (!response.ok || !data.answer) throw new Error('AI is unavailable');
      onAiStatus('live');
      setResult({ plan, review: data.answer, mode: 'live', verdict: rulesVerdict, reason: rulesReason });
    } catch {
      onAiStatus('demo');
      setResult({
        plan,
        review: `Local simulation complete: ${plan.executions.length} contribution${plan.executions.length === 1 ? '' : 's'} approved and ${plan.blocked.length} blocked. ${rulesReason} AI is unavailable, so this explanation is generated locally; no order was sent.`,
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

  const stages = ['Mapping upcoming cash flow', 'Checking reserve & bill guardrails', 'Asking AI to review the paper plan'];

  return <>
    <button className="trade-button agent-run-button" onClick={runReview} disabled={running} aria-busy={running}>
      <span className={running ? 'agent-button-spark active' : 'agent-button-spark'}><Sparkles size={17}/></span>
      <span>{running ? 'Agent is reviewing your plan…' : 'Run AI paper-trade review'}</span>
      {!running && <ArrowUpRight size={16}/>}
    </button>
    {running && <div className="agent-progress" role="status" aria-live="polite">
      <div className="agent-progress-heading"><span className="agent-orb"><Sparkles size={15}/></span><span><b>Velora agent in progress</b><small>Analysis only · no brokerage order is sent</small></span><span className="agent-pulse"/></div>
      <div className="agent-stages">{stages.map((label, index) => <div className={`agent-stage ${index < step ? 'done' : index === step ? 'current' : ''}`} key={label}><span className="stage-mark">{index < step ? <Check size={12}/> : index === step ? <i/> : index + 1}</span><span>{label}</span></div>)}</div>
    </div>}
    {result && <div className="automation-result agent-result" aria-live="polite">
      <div className="result-head"><span className="result-icon"><Check size={15}/></span><div><b>{result.plan.executions.length} simulated contribution{result.plan.executions.length === 1 ? '' : 's'} · {money(result.plan.total)}</b><small>{result.plan.reason}</small></div><span className={`agent-result-mode ${result.mode}`}>{result.mode === 'live' ? 'AI REVIEW' : 'LOCAL REVIEW'}</span></div>
      <div className="agent-review"><div className="agent-review-title"><Sparkles size={13}/>{result.mode === 'live' ? 'AI review' : 'Velora review'}</div><p>{result.review}</p></div>
      {result.plan.executions.length > 0 && <div className="execution-chips">{result.plan.executions.map(run => <span key={run.day}>{run.date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} <b>{money(run.amount)}</b></span>)}</div>}
      {result.plan.blocked.length > 0 && <small className="blocked-count">{result.plan.blocked.length} scheduled contribution{result.plan.blocked.length === 1 ? '' : 's'} blocked by reserve rules.</small>}
      <div className={`agent-verdict ${result.verdict === 'PASS' ? 'pass' : 'block'}`}><ShieldCheck size={14}/><span><b>RULES ENGINE · {result.verdict}</b><small>{result.reason}</small></span></div>
      <small className="agent-disclaimer">Paper simulation only. AI explains the result; deterministic rules decide it. No trade or transfer was sent.</small>
    </div>}
  </>;
}

function App() {
  const [accountProfile, setAccountProfile] = useState(readActiveAccountProfile);
  const persona = accountProfile?.persona || 'Adult';
  const [activePage, setActivePage] = useState('Overview');
  const [selectedPalette, setSelectedPalette] = useState(readPalette);
  const [darkMode, setDarkMode] = useState(() => themeOptions.find(option => option.id === readPalette())?.mode === 'dark');
  const [paperAccount, setPaperAccount] = useState(readPaperAccount);
  const [purchase, setPurchase] = useState(0);
  const [purchaseInput, setPurchaseInput] = useState('');
  const [cancelled, setCancelled] = useState([]);
  const [customEvents, setCustomEvents] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('velora-custom-events') || '[]'); }
    catch { return []; }
  });
  const [debtPayments, setDebtPayments] = useState(() => {
    try { return { ...sampleDebtPayments, ...JSON.parse(window.localStorage.getItem('velora-debt-payments') || '{}') }; }
    catch { return sampleDebtPayments; }
  });
  const [rails, setRails] = useState(true);
  const [ticker, setTicker] = useState('S&P 500');
  const [amount, setAmount] = useState('500');
  const [tradePreview, setTradePreview] = useState(false);
  const [cadence, setCadence] = useState('7');
  const [paperAsset, setPaperAsset] = useState('S&P 500');
  const [contribution, setContribution] = useState('250');
  const [crash, setCrash] = useState('');
  const [question, setQuestion] = useState('');
  const [copilotMessages, setCopilotMessages] = useState([{ id: 'welcome', role: 'assistant', text: `Hi${accountProfile?.firstName ? ` ${accountProfile.firstName}` : ''}! Ask me about your plan, savings, or a decision. ${persona === 'Adult' ? 'I’ll use the details in your account.' : 'I’ll use the numbers in this practice account.'}` }]);
  const [aiStatus, setAiStatus] = useState('demo');
  const [aiLoading, setAiLoading] = useState(false);
  const copilotEndRef = useRef(null);
  const [plaidAccessToken, setPlaidAccessToken] = useState('');
  const [linkedAccount, setLinkedAccount] = useState(null);
  const [linkedInstitution, setLinkedInstitution] = useState('');
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidMessage, setPlaidMessage] = useState('');
  const [sandboxTransfers, setSandboxTransfers] = useState([]);
  const reserve = persona === 'Kid' ? 100 : persona === 'Teen' ? 750 : 1200;
  useEffect(() => { copilotEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [copilotMessages, aiLoading]);
  const cashFloor = persona === 'Kid' ? 0 : persona === 'Teen' ? 100 : 300;
  const accountBalance = linkedAccount?.available ?? linkedAccount?.current ?? Number(paperAccount.bankCash || 0);
  const whatIfCash = linkedAccount?.available ?? linkedAccount?.current ?? Number(paperAccount.bankCash || 0);
  const debtEvents = useMemo(() => [
    { day: 10, title: 'Credit card payment', amount: -Math.max(0, Number(debtPayments.card) || 0), kind: 'bill', debt: true },
    { day: 15, title: 'Student loan payment', amount: -Math.max(0, Number(debtPayments.student) || 0), kind: 'bill', debt: true },
    { day: 24, title: 'Mortgage payment', amount: -Math.max(0, Number(debtPayments.mortgage) || 0), kind: 'bill', debt: true },
  ].filter(event => event.amount < 0 && Number(event.amount) !== 0), [debtPayments]);
  const planningEvents = accountProfile?.demo && customEvents.length === 0 ? DEMO_CASH_EVENTS : customEvents;
  const forecastEvents = useMemo(() => [...debtEvents, ...planningEvents], [debtEvents, planningEvents]);
  const forecast = useMemo(() => buildForecast({ purchase, cancelled, balance: accountBalance, events: forecastEvents }), [purchase, cancelled, accountBalance, forecastEvents]);
  const { lowestBalance, safeSurplus } = useMemo(() => getSafeSurplus(forecast, reserve), [forecast, reserve]);
  const bills = forecast.flatMap(point => point.events).filter(event => event.amount < 0).reduce((sum,event) => sum + Math.abs(event.amount),0);
  const income = forecast.flatMap(point => point.events).filter(event => event.amount > 0).reduce((sum,event) => sum + event.amount,0);
  const recurringTotal = subscriptions.filter(item => !cancelled.includes(item.name)).reduce((sum,item) => sum + item.amount,0);
  const decision = evaluateSimulatedTrade({ amount, safeSurplus, railsEnabled: rails });
  const autoPlan = useMemo(() => simulateAutoInvest({ forecast, amount: contribution, cadence, railsEnabled: rails, reserve, floor: cashFloor }), [forecast, contribution, cadence, rails, reserve, cashFloor]);
  const displayName = persona === 'Kid' ? 'Your money is growing' : persona === 'Teen' ? 'You’ve got this, Alex' : 'A clearer view of your money';
  const personaCopy = persona === 'Kid' ? 'A playful learning view with pretend dollars and a small starter buffer.' : persona === 'Teen' ? 'School, first paychecks, and big goals—in one teen-friendly plan.' : 'See what is coming in, what is going out, and what choices could change.';

  useEffect(() => {
    const choice = themeOptions.find(option => option.id === selectedPalette);
    try {
      window.localStorage.setItem('velora-theme', darkMode ? 'dark' : 'light');
      window.localStorage.setItem('velora-palette', choice?.id || 'green-light');
    }
    catch { /* Theme remains active for this session. */ }
  }, [darkMode, selectedPalette]);

  useEffect(() => {
    if (accountProfile?.demo && !readAccountProfile()) {
      try { window.localStorage.setItem('velora-account-profile', JSON.stringify(accountProfile)); }
      catch { /* The starter account remains available for this session. */ }
    }
  }, [accountProfile]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activePage]);

  useEffect(() => {
    try { window.localStorage.setItem('velora-custom-events', JSON.stringify(customEvents)); }
    catch { /* Local persistence is optional; the active plan remains usable. */ }
  }, [customEvents]);

  useEffect(() => subscribePaperAccount(setPaperAccount), []);

  useEffect(() => {
    if (!accountProfile?.demo || linkedAccount) return undefined;
    const accrue = () => {
      const current = readPaperAccount();
      const next = accrueSampleEarnings(current);
      if (next !== current) savePaperAccount(next);
    };
    accrue();
    const timer = window.setInterval(accrue, 1000);
    return () => window.clearInterval(timer);
  }, [accountProfile?.demo, linkedAccount]);

  useEffect(() => {
    try { window.localStorage.setItem('velora-debt-payments', JSON.stringify(debtPayments)); }
    catch { /* The displayed debt plan remains usable for this browser session. */ }
  }, [debtPayments]);

  function applyPalette(paletteId) {
    const choice = themeOptions.find(option => option.id === paletteId);
    if (!choice) return;
    setSelectedPalette(choice.id);
    setDarkMode(choice.mode === 'dark');
  }

  function toggleColorMode() {
    const nextMode = darkMode ? 'light' : 'dark';
    const accent = themeOptions.find(option => option.id === selectedPalette)?.palette || 'green';
    const match = themeOptions.find(option => option.palette === accent && option.mode === nextMode)
      || themeOptions.find(option => option.mode === nextMode);
    if (match) setSelectedPalette(match.id);
    setDarkMode(nextMode === 'dark');
  }

  function createAccount(profile, paletteId) {
    window.localStorage.setItem('velora-account-profile', JSON.stringify(profile));
    window.localStorage.removeItem('velora-session-ended');
    if (profile.persona !== 'Kid') applyPalette(paletteId || selectedPalette);
    window.localStorage.setItem('velora-paper-portfolio', JSON.stringify({ cash: 0, positions: {}, orders: [] }));
    window.localStorage.setItem('velora-custom-events', '[]');
    window.localStorage.setItem('velora-debt-payments', JSON.stringify({ card: 0, student: 0, mortgage: 0 }));
    window.localStorage.removeItem('velora-auto-invest');
    const initialPaperAccount = { ...createEmptyPaperAccount(), bankCash: Math.max(0, Number(profile.startingBalance) || 0) };
    savePaperAccount(initialPaperAccount);
    setPaperAccount(initialPaperAccount);
    window.localStorage.removeItem('velora-onboarding-choice');
    setAccountProfile(profile);
    setActivePage('Overview');
    setPurchase(0);
    setPurchaseInput('');
    setCancelled([]);
    setRails(true);
    setTicker('S&P 500');
    setAmount('500');
    setTradePreview(false);
    setCadence('7');
    setPaperAsset('SPY');
    setContribution('25');
    setCrash('');
    setQuestion('');
    setAiStatus('demo');
    setAiLoading(false);
    setCustomEvents([]);
    setDebtPayments({ card: 0, student: 0, mortgage: 0 });
    setLinkedAccount(null);
    setLinkedInstitution('');
    setPlaidAccessToken('');
    setSandboxTransfers([]);
  }

  function createNewAccount() {
    if (!window.confirm('Create a new account? This permanently replaces this browser’s local profile, paper holdings, order history, and plan settings.')) return;
    for (const key of ['velora-account-profile', 'velora-paper-portfolio', 'velora-custom-events', 'velora-debt-payments', 'velora-auto-invest', 'velora-session-ended']) window.localStorage.removeItem(key);
    const initialPaperAccount = createEmptyPaperAccount();
    savePaperAccount(initialPaperAccount);
    setPaperAccount(initialPaperAccount);
    setAccountProfile(null);
    setActivePage('Overview');
    setPurchase(0);
    setPurchaseInput('');
    setCancelled([]);
    setRails(true);
    setTicker('S&P 500');
    setAmount('500');
    setTradePreview(false);
    setCadence('7');
    setPaperAsset('SPY');
    setContribution('25');
    setCrash('');
    setQuestion('');
    setAiStatus('demo');
    setAiLoading(false);
    setCustomEvents([]);
    setDebtPayments({ card: 0, student: 0, mortgage: 0 });
    setLinkedAccount(null);
    setLinkedInstitution('');
    setPlaidAccessToken('');
    setSandboxTransfers([]);
  }

  function logIn() {
    const profile = readAccountProfile();
    if (!profile) return;
    window.localStorage.removeItem('velora-session-ended');
    if (profile.persona !== 'Kid') applyPalette(selectedPalette);
    setAccountProfile(profile);
    setActivePage('Overview');
  }

  function logOut() {
    try { window.localStorage.setItem('velora-session-ended', 'true'); }
    catch { /* The in-memory session still ends if storage is unavailable. */ }
    setPlaidAccessToken('');
    setLinkedAccount(null);
    setLinkedInstitution('');
    setAccountProfile(null);
    setActivePage('Overview');
  }

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
    const history = copilotMessages.slice(-8).map(message => ({ role: message.role, text: message.text.slice(0, 500) }));
    setCopilotMessages(messages => [...messages, { id: `user-${Date.now()}`, role: 'user', text }]);
    setQuestion('');
    setAiLoading(true);
    try {
      const response = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, history, persona, projectedLow: lowestBalance, safeSurplus, protectedReserve: reserve, upcomingBills: bills, expectedIncome: income, recurringMonthly: recurringTotal, investmentVerdict: decision.verdict, investmentReason: decision.reason }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.answer) throw Object.assign(new Error('Copilot request failed'), { status: Number(data.code) || response.status });
      const source = data.source === 'fallback' ? 'fallback' : 'ai';
      setCopilotMessages(messages => [...messages, { id: `assistant-${Date.now()}`, role: 'assistant', text: data.answer, source }]);
      setAiStatus(source === 'ai' ? 'live' : 'demo');
    } catch (error) {
      setAiStatus('demo');
      const status = Number(error?.status);
      const diagnostic = status === 401 || status === 403
        ? 'Gemini rejected the API key. Check that its Google AI Studio restrictions allow Gemini API requests from Vercel.'
        : status === 429
          ? 'Gemini rate limit or quota reached. Check the API key project’s quota and billing limits.'
          : status === 404
            ? 'Gemini model not found. Remove GEMINI_MODEL in Vercel to use the app’s default model.'
            : status >= 400
              ? `Gemini returned HTTP ${status}. Check the API key and model settings in Vercel.`
              : 'Velora could not reach its Gemini function. Check that this deployment includes the /api/copilot function.';
      const isPurchase = /buy|purchase|macbook|laptop/i.test(text);
      const isInvest = /invest|stock|trade/i.test(text);
      const fallback = isPurchase
        ? `${persona === 'Adult' ? 'In the current projection' : 'In this sample forecast'}, your lowest projected balance is ${money(lowestBalance)} after planned bills and income. The essentials reserve is protected at ${money(reserve)}. Try the purchase preview to see its exact effect on the 30-day curve.`
        : isInvest
          ? `${decision.verdict === 'pass' ? 'The current order passes' : 'The current order is blocked'} under the deterministic rules engine: ${decision.reason} The AI can explain that result, but it cannot change it.`
          : `Your plan has ${money(safeSurplus)} of projected safe surplus after a ${money(reserve)} reserve. ${cancelled.length ? `The ${cancelled.join(', ')} cancellation simulation is reflected in the forecast.` : 'Try the recurring-charge controls to see how small changes affect the forecast.'} ${persona === 'Adult' ? 'This projection uses the details in your account.' : 'This is sample-data analysis.'}`;
      setCopilotMessages(messages => [...messages, { id: `assistant-${Date.now()}`, role: 'assistant', text: fallback, source: 'fallback', diagnostic }]);
    } finally {
      setAiLoading(false);
    }
  }

  function startNewCopilotChat() {
    setCopilotMessages([{ id: `welcome-${Date.now()}`, role: 'assistant', text: `Hi${accountProfile?.firstName ? ` ${accountProfile.firstName}` : ''}! Ask me about your plan, savings, or a decision. ${persona === 'Adult' ? 'I’ll use the details in your account.' : 'I’ll use the numbers in this practice account.'}` }]);
    setQuestion('');
  }
  const pages = [
    { label: 'Wealth Manager', page: 'Wealth', icon: CircleDollarSign },
    { label: 'Overview', page: 'Overview', icon: LayoutDashboard },
    { label: 'Trading', page: 'Trading', icon: Activity },
    { label: 'What if?', page: 'WhatIf', icon: Sparkles },
    { label: 'Markets', page: 'Markets', icon: TrendingUp },
    { label: 'Planning', page: 'Planning', icon: CalendarDays },
    { label: 'Tools', page: 'Tools', icon: Wrench },
    { label: 'Portfolio', page: 'Portfolio', icon: BriefcaseBusiness },
  ];
  const accountPages = persona === 'Kid' ? [...pages.filter(item => item.page !== 'Wealth'), { label: 'Learn', page: 'Learn', icon: BookOpenCheck }] : pages;
  const activePageLabel = accountPages.find(item => item.page === activePage)?.label || activePage;
  const savedAccount = readAccountProfile();
  const activeTheme = themeOptions.find(option => option.id === selectedPalette) || themeOptions[2];

  if (!accountProfile) {
    return savedAccount
      ? <LocalLogin profile={savedAccount} palette={selectedPalette} theme={activeTheme} onPaletteChange={applyPalette} onLogin={logIn}/>
      : <AccountSetup onCreate={createAccount} palette={selectedPalette} theme={activeTheme} onPaletteChange={applyPalette}/>;
  }

  return <div className={`app-shell ${persona === 'Kid' ? 'kid-theme' : 'professional-theme'}`} data-theme={darkMode ? 'dark' : 'light'} data-palette={activeTheme.palette} style={persona === 'Kid' ? undefined : { '--palette-accent': activeTheme.swatches[0], '--palette-canvas': activeTheme.swatches[1], '--palette-surface': activeTheme.swatches[2] }}>
    <aside className="sidebar">
      <a className="brand sidebar-brand" href="#top" aria-label="Velora overview"><span className="brand-mark"><span/><span/><span/></span><span>velora</span></a>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">{accountPages.map(({ label, page, icon: Icon }) => <button key={page} className={activePage === page ? 'sidebar-link active' : 'sidebar-link'} onClick={() => setActivePage(page)} aria-current={activePage === page ? 'page' : undefined}><Icon size={18}/><span>{persona === 'Kid' && label === 'Portfolio' ? 'My stocks' : label}</span></button>)}</nav>
      {persona === 'Kid' && <div className="kid-glossary"><b>Money words</b><p><strong>Stock</strong> · a tiny piece of a company.</p><p><strong>Price</strong> · what one piece costs right now.</p><p><strong>Paper money</strong> · pretend dollars for practice.</p><p><strong>Risk</strong> · the chance your pretend money goes down.</p></div>}
      <div className="sidebar-bottom"><button className="theme-toggle" onClick={toggleColorMode}><span className="theme-toggle-icon">{darkMode ? <Sun size={16}/> : <Moon size={16}/>}</span>{darkMode ? 'Light mode' : 'Dark mode'}</button><div className="sidebar-profile"><span className="locked-account-avatar">{(accountProfile?.firstName || persona).slice(0, 1).toUpperCase()}</span><span><b>{accountProfile?.firstName || `${persona} account`}</b><small>{persona} account</small></span></div></div>
    </aside>
    <div className="workspace">
    <header className="topbar">
      <div className="top-actions">{activePage !== 'Wealth' && persona !== 'Kid' && (accountProfile || savedAccount) && <button className="session-button" onClick={accountProfile ? logOut : logIn}>{accountProfile ? 'Log out' : 'Log in'}</button>}<button className="new-account-button" onClick={createNewAccount}>New account</button><button className="icon-btn" aria-label="Notifications"><Bell size={18}/></button><button className="avatar" aria-label="Account profile">{(accountProfile?.firstName || persona).slice(0, 1).toUpperCase()}</button></div>
    </header>
    <main id="top" className="dashboard">
      {['Overview','Portfolio','Tools','Learn'].includes(activePage) && <div className="page-title-row"><div><div className="eyebrow">{activePageLabel.toUpperCase()}</div><h1>{activePage === 'Overview' ? (accountProfile?.firstName ? `Welcome, ${accountProfile.firstName}` : displayName) : activePageLabel}</h1><p>{activePage === 'Overview' ? personaCopy : activePage === 'Portfolio' ? (persona === 'Adult' ? 'Account cash, investments, and recent activity.' : 'Your practice cash, stocks, and recent decisions.') : activePage === 'Learn' ? 'Short, friendly lessons about money, stocks, and chart patterns.' : persona === 'Adult' ? 'Review your financial planning tools.' : 'Explore guarded tools for your practice account.'}</p></div><span className="page-persona-tag">{linkedAccount ? 'Plaid Sandbox' : persona === 'Adult' ? 'Personal account' : 'Demo account'} · {persona}</span></div>}
      <div className="page-content">
      {activePage === 'Learn' && persona === 'Kid' && <KidLearning/>}
      {activePage === 'Wealth' && persona !== 'Kid' && <WealthManager userAccount={accountProfile}/>}
      <div style={{ display: activePage === 'Trading' ? 'block' : 'none' }} aria-hidden={activePage !== 'Trading'}><TradingDesk key={accountProfile?.id || 'no-account'} persona={persona}/></div>
      {activePage === 'WhatIf' && <WhatIfCoach persona={persona} cash={whatIfCash - purchase} income={income} bills={bills} safeSurplus={safeSurplus} projectedLow={lowestBalance} reserve={reserve}/>}
      {activePage === 'Overview' && <>
      <section className="summary-grid" aria-label={`${persona} account overview`}>
        <article className="summary-card balance-card"><div className="card-topline"><span>{persona === 'Kid' ? 'Pretend cash' : persona === 'Adult' ? 'Available cash' : linkedAccount ? 'Sandbox bank balance' : 'Practice cash'}</span><CircleHelp size={15}/></div><div className="balance-amount">{money(accountBalance-purchase,2)}</div><div className="balance-foot"><span className="up-label"><TrendingUp size={14}/> {linkedAccount ? 'Plaid Sandbox' : persona === 'Adult' ? 'Paper investing account' : 'Velora practice account'}</span><span>{linkedAccount ? `${linkedAccount.currency} · •••• ${linkedAccount.mask}` : persona === 'Adult' ? 'CAD · educational simulation' : 'CAD · simulated'}</span></div><div className="balance-spark"><svg viewBox="0 0 140 42"><path d="M1 32 C18 26 18 33 33 25 S55 28 65 17 S84 23 98 12 S116 19 139 3" fill="none" stroke="var(--theme-accent)" strokeWidth="2"/></svg></div></article>
        <article className="summary-card"><div className="card-topline"><span>{persona === 'Kid' ? 'Money coming in' : accountProfile?.demo ? 'Sample work · 30 days' : 'Income · 30 days'}</span><span className="metric-icon income-icon"><ArrowDownLeft size={17}/></span></div><div className="metric-amount">{money(income,0)}</div><div className="metric-foot"><span className="metric-note"><i className="small-green-dot"/> {persona === 'Kid' ? 'Planned paydays' : accountProfile?.demo ? '$500 added each day' : 'Income included'}</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>{persona === 'Kid' ? 'Bills to pay' : 'Planned outflows'}</span><span className="metric-icon bill-icon"><ArrowUpRight size={17}/></span></div><div className="metric-amount">{money(bills,0)}</div><div className="metric-foot"><span className="metric-note">{persona === 'Kid' ? 'Planned bills' : 'Scheduled bills included'}</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>{persona === 'Kid' ? 'Left after bills' : 'Safe to explore'}</span><span className="metric-icon safe-icon"><ShieldCheck size={17}/></span></div><div className="metric-amount">{money(safeSurplus,0)}</div><div className="metric-foot"><span className="metric-note">{persona === 'Kid' ? 'Keepsake money protected' : `After a ${money(reserve)} cash buffer`}</span></div></article>
      </section>
      <section className="panel forecast-panel"><div className="panel-heading"><div><div className="eyebrow">{persona === 'Kid' ? 'YOUR MONEY PLAN' : 'CASH FLOW'} <span className="live-pill"><i/> 30-DAY OUTLOOK</span></div><h2>{persona === 'Kid' ? 'See what may happen this month.' : 'See the next 30 days, before they happen.'}</h2><p>{persona === 'Kid' ? 'The line shows how pretend cash could change as money comes in and bills are paid.' : accountProfile?.demo ? 'Sample work earnings add $500 a day to this demo account. Everyday bills are included too.' : 'Your expected income and everyday bills are mapped out for this month.'}</p></div><span className="range-select"><Activity size={14}/> 30-day forecast</span></div><div className="chart-summary"><div><span>{persona === 'Kid' ? 'Today' : 'Projected today'}</span><strong>{money(accountBalance-purchase,2)}</strong></div><div className="projection-divider"/><div><span>{persona === 'Kid' ? 'Lowest this month' : 'Forecast low'}</span><strong className={lowestBalance < reserve ? 'coral-text' : ''}>{money(lowestBalance,2)}</strong></div><div className="forecast-tag"><ShieldCheck size={15}/><span>{lowestBalance >= reserve ? (persona === 'Kid' ? 'Keep-back money is safe' : 'Reserve stays covered') : (persona === 'Kid' ? 'Keep-back money may be used' : 'Reserve needs attention')}</span></div></div><CashFlowChart forecast={forecast} reserve={reserve}/>{crash && <div className="crash-note"><TrendingDown size={15}/><span>{crashScenarios[crash].label}: a {money(Number(amount||0))} hypothetical {ticker} position would be worth about {money(Number(amount||0)*(1-crashScenarios[crash].drawdown),2)} at the scenario low. This replay is illustrative and separate from your cash forecast.</span><button onClick={() => setCrash('')} aria-label="Dismiss crash replay"><X size={14}/></button></div>}</section></>}
      {activePage === 'Tools' && <section className="panel bank-transfer-panel"><div className="section-title"><div className="section-icon blue-icon"><Landmark size={18}/></div><div><div className="eyebrow">PLAID SANDBOX</div><h2>Linked account activity</h2></div><span className={`bank-connection-pill ${linkedAccount?'connected':''}`}><i/>{linkedAccount?'CONNECTED':'TEST MODE'}</span></div><p className="section-description">Connect a Plaid test account, then create a guarded sandbox transfer. The bank API writes a transfer record; no real funds or stock orders move in Sandbox.</p>{linkedAccount ? <div className="linked-bank-row"><span className="bank-icon light"><Landmark size={17}/></span><div><b>{linkedInstitution} · {linkedAccount.name}</b><small>{linkedAccount.subtype} account · •••• {linkedAccount.mask} · {linkedAccount.currency}</small></div><div className="linked-bank-balance"><span>Available</span><b>{money(linkedAccount.available ?? linkedAccount.current,2)}</b></div></div> : <div className="bank-connect-callout"><div><b>Connect a test institution</b><small>Use Plaid's Sandbox sign-in, never your real bank credentials.</small></div><button className="connect-plaid-button" onClick={linkSandboxBank} disabled={plaidBusy}>{plaidBusy?'Connecting…':'Open Plaid Link'} <ArrowUpRight size={15}/></button></div>}<div className="sandbox-transfer-row"><label><span>TRANSFER AMOUNT</span><div className="amount-input"><b>$</b><input type="number" min="1" max="1000" value={amount} onChange={event=>setAmount(event.target.value)} aria-label="Sandbox transfer amount"/></div></label><button className="sandbox-transfer-button" onClick={createSandboxTransfer} disabled={!linkedAccount || plaidBusy || !rails}>{plaidBusy?'Working…':'Create sandbox transfer'} <ArrowUpRight size={15}/></button></div>{!rails&&<div className="sandbox-rules-message"><ShieldCheck size={14}/> Turn deterministic safety rails on before submitting a transfer.</div>}{plaidMessage&&<div className="plaid-message" role="status">{plaidMessage}</div>}{sandboxTransfers.length>0&&<div className="transfer-list"><div className="transfer-list-heading">RECENT SANDBOX TRANSFERS <small>REAL PLAID TEST RECORDS · NO REAL FUNDS</small></div>{sandboxTransfers.map(transfer=><div className="transfer-row" key={transfer.id}><span className="transfer-check"><Check size={14}/></span><div><b>Velora investment contribution</b><small>{new Date(transfer.created).toLocaleString('en-CA')} · {transfer.network?.toUpperCase()} · {transfer.id}</small></div><strong>−{money(transfer.amount,2)}</strong><span className="transfer-status">{transfer.status}</span></div>)}</div>}</section>}
      {activePage === 'Markets' && <MarketReplay safeSurplus={safeSurplus} reserve={reserve} rails={rails} persona={persona} initialSymbol={paperAsset} onSymbolChange={setPaperAsset}/>}
      {activePage === 'Portfolio' && <PaperPortfolio key={accountProfile?.id || 'new-account'} persona={persona}/>}
      {activePage === 'Planning' && <><CashCalendar forecast={forecast} persona={persona} onAddEvent={event => setCustomEvents(current => [...current, event])} onRemoveEvent={eventId => setCustomEvents(current => current.filter(event => event.id !== eventId))}/>
      <DebtPlanner initialPayments={debtPayments} persona={persona} onPaymentChange={(id, payment) => setDebtPayments(current => ({ ...current, [id]: payment }))}/></>}
      {activePage === 'Tools' && <div className="lower-grid">
        <section className="panel invest-panel automation-panel"><div className="section-title"><div className="section-icon green-icon"><Activity size={18}/></div><div><div className="eyebrow">AUTOMATION LAB</div><h2>Recurring investing</h2></div><span className="sim-only">SIMULATION ONLY</span></div><p className="section-description">Set a cadence. Velora checks every future bill before each simulated buy.</p><div className="automation-pool"><div><span>Available safe surplus</span><b>{money(safeSurplus)}</b></div><span className="safe-label"><ShieldCheck size={14}/> {rails ? 'Rules on' : 'Rules off'}</span></div><div className="auto-fields"><label><span>PAPER ASSET</span><div className="select-wrap"><select value={paperAsset} onChange={event => setPaperAsset(event.target.value)} aria-label="Paper investment asset"><option>S&amp;P 500</option><option>AAPL</option><option>MSFT</option><option>TSLA</option></select><ChevronDown size={15}/></div></label><label><span>CONTRIBUTE</span><div className="amount-input"><b>$</b><input type="number" min="1" value={contribution} onChange={event => setContribution(event.target.value)} aria-label="Contribution amount"/></div></label><label><span>CADENCE</span><div className="select-wrap"><select value={cadence} onChange={event => setCadence(event.target.value)}>
        <option value="7">Weekly</option>
        <option value="14">Every 2 weeks</option>
        <option value="30">Monthly</option>
      </select><ChevronDown size={15}/></div></label></div><div className="automation-context"><span>Cash floor</span><b>{money(cashFloor)}</b><span>Protected essentials</span><b>{money(reserve)}</b></div><PaperTradeAgent key={`${contribution}-${cadence}-${paperAsset}-${rails}-${safeSurplus}-${reserve}`} plan={autoPlan} asset={paperAsset} cadence={Number(cadence) === 7 ? 'weekly' : Number(cadence) === 14 ? 'biweekly' : 'monthly'} rails={rails} forecast={forecast} safeSurplus={safeSurplus} reserve={reserve} bills={bills} income={income} recurringMonthly={recurringTotal} persona={persona} onAiStatus={setAiStatus}/><div className="rails-row"><div><b>Deterministic safety rails</b><small>{rails ? 'Rules ON · reserve and cash-floor checks enforced' : 'Rules OFF · all paper orders are blocked'}</small></div><button className={rails ? 'toggle on' : 'toggle'} onClick={() => { setRails(value => !value); setTradePreview(false); }} aria-label="Toggle deterministic safety rails" aria-pressed={rails}><i/></button></div>
      </section>
      <section className="panel copilot-panel"><div className="section-title"><div className="section-icon violet-icon"><Sparkles size={18}/></div><div><div className="eyebrow">VELORA COPILOT</div><h2>Ask away.</h2></div><span className={`ai-mode ${aiStatus}`}>{aiStatus === 'live' ? 'GEMINI LIVE' : 'LOCAL HELPER'}</span><button type="button" className="copilot-new-chat" onClick={startNewCopilotChat}>New chat</button></div><p className="section-description">{persona === 'Adult' ? 'Ask about your plan and financial choices. Velora explains account details and leaves every safety decision unchanged.' : 'Chat about your plan and money choices. Velora uses your practice account and never changes a safety decision.'}</p><div className="copilot-chat" role="log" aria-label="Conversation with Velora Copilot" aria-live="polite">{copilotMessages.map(message => <div className={`copilot-chat-row ${message.role}`} key={message.id}>{message.role === 'assistant' && <span className="copilot-avatar"><Sparkles size={15}/></span>}<div className="copilot-chat-bubble"><small>{message.role === 'user' ? 'YOU' : message.source === 'fallback' ? 'VELORA · LOCAL HELPER' : 'VELORA'}</small><p>{message.text}</p>{message.diagnostic && <small className="copilot-diagnostic">{message.diagnostic}</small>}</div></div>)}{aiLoading && <div className="copilot-chat-row assistant"><span className="copilot-avatar"><Sparkles size={15}/></span><div className="copilot-chat-bubble typing" role="status"><small>VELORA IS THINKING</small><p><i/><i/><i/></p></div></div>}<div ref={copilotEndRef}/></div><form className="copilot-form" onSubmit={event => {event.preventDefault();askCopilot()}}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Message Velora…" aria-label="Message Velora Copilot"/><button type="submit" disabled={aiLoading || !question.trim()} aria-label="Send message">{aiLoading?'Thinking…':'Send'} <ArrowUpRight size={15}/></button></form><div className="prompt-chips"><span>Try</span><button onClick={() => askCopilot('Can I afford a $1,200 laptop?')} disabled={aiLoading}>Can I afford a laptop?</button><button onClick={() => askCopilot('How much could I save safely?')} disabled={aiLoading}>Explain my safe surplus</button></div><div className="ai-boundary"><LockKeyhole size={13}/> Educational chat only · no trades or money transfers.</div></section>
      <section className="panel decision-panel"><div className="section-title"><div className="section-icon coral-icon"><Wallet size={18}/></div><div><div className="eyebrow">WHAT-IF PLANNER</div><h2>Try a decision first.</h2></div></div><p className="section-description">See what a purchase could change across your whole month.</p><form className="purchase-input" onSubmit={event => {event.preventDefault();setPurchase(Number(purchaseInput.replace(/[^0-9.]/g,''))||0)}}><span>$</span><input value={purchaseInput} onChange={event => setPurchaseInput(event.target.value)} placeholder="1,200 laptop" aria-label="Purchase amount"/><button type="submit">Preview <span>→</span></button></form><div className="quick-picks"><span>Try</span><button onClick={() => {setPurchaseInput('250');setPurchase(250)}}>$250 weekend trip</button><button onClick={() => {setPurchaseInput('1,200');setPurchase(1200)}}>$1,200 laptop</button>{purchase>0&&<button onClick={() => {setPurchase(0);setPurchaseInput('')}}>Clear</button>}</div><div className="impact-box"><div className="impact-heading"><span className="impact-dot"/> LIVE SCENARIO</div><div className="impact-row"><span>Purchase impact</span><b>−{money(purchase)}</b></div><div className="impact-row"><span>Projected lowest balance</span><b className={lowestBalance<reserve?'coral-text':''}>{money(lowestBalance)}</b></div><div className="impact-message"><ShieldCheck size={14}/>{lowestBalance>=reserve?`Your ${money(reserve)} reserve remains protected.`:'This scenario dips into the protected reserve.'}</div></div><div className="ai-footnote"><Activity size={13}/> Forecast recalculates instantly · sample data only</div></section>
      <section className="panel subscriptions-panel"><div className="section-title"><div className="section-icon coral-icon"><CreditCard size={18}/></div><div><div className="eyebrow">RECURRING EXPENSES</div><h2>Your recurring charges.</h2></div></div>{recurringTotal > 0 ? <><div className="subscription-total"><span>Monthly total</span><b>{money(recurringTotal,2)}<small>/mo</small></b></div><div className="subscription-list">{subscriptions.map(item => {const isCancelled=cancelled.includes(item.name);return <div className={isCancelled?'subscription canceled':'subscription'} key={item.name}><div className="service-icon" style={{'--service':item.color}}>{item.icon}</div><div className="service-name"><b>{item.name}</b><small>{isCancelled?'Cancellation simulated':item.detail}</small></div><div className="service-cost">{money(item.amount,2)}<small>/mo</small></div><button className={isCancelled?'toggle on':'toggle'} onClick={() => setCancelled(isCancelled ? cancelled.filter(name => name !== item.name) : [...cancelled, item.name])} aria-label={`${isCancelled?'Restore':'Simulate cancellation'} ${item.name}`}><i/></button></div>})}</div></> : <div className="subscriptions-empty"><CreditCard size={18}/><span><b>No recurring charges added</b><small>Your account is empty by design. Add expected bills to the payment calendar when you’re ready.</small></span></div>}<div className="nudge"><div className="nudge-spark"><Sparkles size={15}/></div><div><span className="nudge-label">PLAN INSIGHT</span><p>{recurringTotal ? 'Recurring charges are planning examples; changing a toggle never modifies a service account.' : 'Once you add recurring items, the forecast and cash-reserve checks will update automatically.'}</p></div></div></section>
      </div>}
      </div>
    </main>
    <div className="disclaimer"><span><ShieldCheck size={15}/> <b>Paper investing only.</b> This educational simulation cannot place real trades, move money, or provide formal financial advice.</span></div>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
