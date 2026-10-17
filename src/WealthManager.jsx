import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Baby, Bot, BriefcaseBusiness, CalendarDays, ChevronDown, CircleDollarSign, GraduationCap, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { ASSETS, PERSONAS, REGIMES, buildBenchmarkSeries, createSimulation, loadSimulation, saveSimulation } from './simulation.ts';
import { checkAgentAction, dailyDrawdown, DAILY_DRAWDOWN_LIMIT, generateFallbackActions, targetWeights } from './wealth-agent.js';
import { supabase, supabaseConfigured } from './supabase.js';
import './wealth-manager.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const precise = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
function localChatAnswer(question, persona, portfolio, decisions, date) {
  const sale = question.match(/\b(?:sell|selling|sold)\s+(?:of\s+)?([A-Z]{1,5})\b/i);
  if (sale) {
    const ticker = sale[1].toUpperCase();
    const entry = decisions.find(item => item.actionType === 'sell' && item.ticker === ticker);
    if (entry?.status === 'executed') return `Velora’s log shows a simulated ${ticker} sale on ${entry.simDate}: ${entry.reason} No real shares were sold.`;
    return `I don’t see a recorded ${ticker} sale in Velora’s decision log, so I can’t give a reason for one.`;
  }
  if (/goal|track|progress|on track/i.test(question)) return `${persona.name}’s demo goal is “${persona.goal}” with a ${persona.horizonYears}-year horizon. Current simulated net worth is ${money(portfolio.netWorth)}; the profile has no target amount or dated milestone to measure progress against.`;
  return `As of ${date}, simulated net worth is ${money(portfolio.netWorth)} with ${money(portfolio.cash)} cash and ${portfolio.holdings.length} holdings. I can only confirm trades that appear in the saved decision log.`;
}

function readLocalUserProfile() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('velora-wealth-user-profile') || 'null');
    return saved && typeof saved.name === 'string' && ['aggressive', 'balanced', 'conservative'].includes(saved.risk) ? saved : null;
  } catch { return null; }
}

const ACCOUNT_TYPES = [
  { id: 'kids', title: 'Kid', description: 'A friendly money-learning space with simple words and small goals.', detail: 'Learning first · steady growth', risk: 'conservative', persona: 'elena', Icon: Baby },
  { id: 'teen', title: 'Teen', description: 'Plan for school, first paychecks, saving goals, and future choices.', detail: 'Start small · growth focused', risk: 'aggressive', persona: 'aisha', Icon: TrendingUp },
  { id: 'adult', title: 'Adult', description: 'A clear, detailed view of cash flow, obligations, and portfolio decisions.', detail: 'Flexible goals · balanced plan', risk: 'balanced', persona: 'marcus', Icon: BriefcaseBusiness },
];

function LineChart({ rows, selected }) {
  const points = rows.slice(-selected - 1);
  const values = points.map(point => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(high - low, high * 0.025, 1);
  const coords = values.map((value, index) => `${index / Math.max(1, values.length - 1) * 760},${120 - ((value - low) / spread) * 96}`).join(' ');
  const rising = values.at(-1) >= values[0];
  return <div className="wm-chart-wrap"><svg className="wm-line-chart" viewBox="0 0 760 140" role="img" aria-label="Portfolio value history"><defs><linearGradient id="wealthFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#80c49b" stopOpacity=".24"/><stop offset="1" stopColor="#80c49b" stopOpacity="0"/></linearGradient></defs><polygon points={`0,140 ${coords} 760,140`} fill="url(#wealthFill)"/><polyline points={coords} fill="none" stroke={rising ? '#8acfa0' : '#df9283'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg><div className="wm-chart-labels"><span>{points[0]?.date}</span><span>{points.at(-1)?.date}</span></div></div>;
}

function BenchmarkChart({ rows }) {
  if (rows.length < 2) return <div className="wm-no-events">Benchmark history is warming up.</div>;
  const values = rows.flatMap(row => [row.managed, row.spy, row.cash]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.025, 1);
  const points = key => rows.map((row, index) => `${index / Math.max(1, rows.length - 1) * 900},${125 - ((row[key] - min) / spread) * 100}`).join(' ');
  return <div className="wm-benchmark-chart"><svg viewBox="0 0 900 145" role="img" aria-label="Velora managed portfolio compared with SPY and cash"><polyline points={points('managed')} fill="none" stroke="#8fc99b" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/><polyline points={points('spy')} fill="none" stroke="#d2b379" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/><polyline points={points('cash')} fill="none" stroke="#84958b" strokeWidth="1.6" strokeDasharray="5 6" vectorEffect="non-scaling-stroke"/></svg><div className="wm-benchmark-dates"><span>{rows[0].date}</span><span>{rows.at(-1).date}</span></div><div className="wm-benchmark-legend"><span><i className="managed"/> Velora managed</span><span><i className="spy"/> Buy-and-hold SPY</span><span><i className="cash"/> Cash</span></div></div>;
}

export default function WealthManager() {
  const [simulation, setSimulation] = useState(() => loadSimulation());
  const [session, setSession] = useState(null);
  const [authStatus, setAuthStatus] = useState(supabaseConfigured ? 'loading' : 'local');
  const [authMode, setAuthMode] = useState('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [userProfile, setUserProfile] = useState(() => supabaseConfigured ? null : readLocalUserProfile());
  const [profileDraft, setProfileDraft] = useState({ name: '', age: '', occupation: '', risk: 'balanced', goal: 'Build long-term wealth', horizonYears: 20 });
  const [profileBusy, setProfileBusy] = useState(false);
  const [landingComplete, setLandingComplete] = useState(false);
  const [setupStarted, setSetupStarted] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState(null);
  const [syncError, setSyncError] = useState('');
  const sessionRef = useRef(null);
  const cloudReadyUserRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const [accountId, setAccountId] = useState(() => {
    const saved = window.localStorage.getItem('velora-simulation-active-account');
    return PERSONAS.some(person => person.id === saved) ? saved : 'marcus';
  });
  const [windowDays, setWindowDays] = useState(365);
  const [selectedTimeline, setSelectedTimeline] = useState(729);
  const [message, setMessage] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [fastForwardBusy, setFastForwardBusy] = useState(false);
  const [cycleProgress, setCycleProgress] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFallback, setChatFallback] = useState(false);
  const [, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let active = true;
    async function hydrate(nextSession) {
      sessionRef.current = nextSession;
      cloudReadyUserRef.current = null;
      setSession(nextSession);
      setAuthMessage('');
      setAuthError('');
      if (!nextSession) {
        setAuthStatus('signedout');
        return;
      }
      setAuthStatus('loading');
      try {
        const { data, error } = await supabase.from('velora_simulations').select('state, profile').eq('user_id', nextSession.user.id).maybeSingle();
        if (error) throw error;
        let restored = createSimulation();
        if (data?.state) {
          restored = createSimulation({ seed: data.state.seed, initialSeed: data.state.initialSeed, currentDate: data.state.date, regime: data.state.regime });
          restored.importState(data.state);
        } else {
          const { error: insertError } = await supabase.from('velora_simulations').upsert({ user_id: nextSession.user.id, state: restored.exportState(), profile: {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
          if (insertError) throw insertError;
        }
        if (!active || sessionRef.current?.user?.id !== nextSession.user.id) return;
        setSimulation(restored);
        const savedProfile = data?.profile && typeof data.profile.name === 'string' ? data.profile : null;
        setUserProfile(savedProfile);
        const savedAccount = window.localStorage.getItem(`velora-simulation-active-account-${nextSession.user.id}`);
        const riskPersona = savedProfile?.risk === 'aggressive' ? 'aisha' : savedProfile?.risk === 'conservative' ? 'elena' : 'marcus';
        setAccountId(PERSONAS.some(person => person.id === savedAccount) ? savedAccount : riskPersona);
        if (savedProfile) setProfileDraft(current => ({ ...current, ...savedProfile }));
        cloudReadyUserRef.current = nextSession.user.id;
        setAuthStatus('ready');
        setHistoryVersion(value => value + 1);
      } catch {
        if (!active) return;
        setAuthStatus('error');
        setAuthError('Velora could not load your saved simulation. Check the Supabase setup and try again.');
      }
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) { setAuthStatus('error'); setAuthError('Could not restore your sign-in. Please sign in again.'); return; }
      void hydrate(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED') { sessionRef.current = nextSession; setSession(nextSession); return; }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void hydrate(nextSession);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  function persistSimulation(target = simulation) {
    if (!supabaseConfigured) return saveSimulation(target);
    const userId = sessionRef.current?.user?.id;
    if (!userId || cloudReadyUserRef.current !== userId) return false;
    const state = target.exportState();
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      const { error } = await supabase.from('velora_simulations').upsert({ user_id: userId, state, profile: userProfile || {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      if (sessionRef.current?.user?.id === userId) setSyncError('');
    }).catch(() => {
      if (sessionRef.current?.user?.id === userId) setSyncError('The latest change was not confirmed as saved. Keep this page open and reconnect before leaving.');
    });
    return true;
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!supabase || authBusy) return;
    setAuthBusy(true); setAuthError(''); setAuthMessage('');
    try {
      const result = authMode === 'signup'
        ? await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) setAuthMessage('Check your email to confirm your account, then sign in here.');
      else setAuthMessage('Signed in. Loading your saved simulation…');
      setAuthPassword('');
    } catch {
      setAuthError(authMode === 'signup' ? 'Could not create the account. Check the email and password, then try again.' : 'Sign-in failed. Check your email and password, then try again.');
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError('Could not sign out. Try again.');
  }

  async function saveUserProfile(event) {
    event.preventDefault();
    if (profileBusy) return;
    const name = profileDraft.name.trim().slice(0, 48);
    const age = Number(profileDraft.age);
    const horizonYears = Number(profileDraft.horizonYears);
    if (!name || !Number.isInteger(age) || age < 18 || age > 100 || !Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 60) {
      setAuthError('Enter a name, an age from 18 to 100, and a horizon from 1 to 60 years.');
      return;
    }
    const nextProfile = { ...profileDraft, name, age, horizonYears, accountType: selectedAccountType || profileDraft.accountType || 'adult', occupation: profileDraft.occupation.trim().slice(0, 48), goal: profileDraft.goal.trim().slice(0, 120) || 'Build long-term wealth' };
    setProfileBusy(true); setAuthError('');
    const preferredAccount = ACCOUNT_TYPES.find(type => type.id === nextProfile.accountType)?.persona || (nextProfile.risk === 'aggressive' ? 'aisha' : nextProfile.risk === 'conservative' ? 'elena' : 'marcus');
    if (!supabaseConfigured) {
      try {
        window.localStorage.setItem('velora-wealth-user-profile', JSON.stringify(nextProfile));
        setUserProfile(nextProfile);
        setAccountId(preferredAccount);
        window.localStorage.setItem('velora-simulation-active-account', preferredAccount);
        setSetupStarted(false);
      } catch { setAuthError('Could not save your profile in this browser. Check storage settings and try again.'); }
      setProfileBusy(false);
      return;
    }
    if (!supabase || !session?.user?.id) { setProfileBusy(false); return; }
    const nextSimulation = simulation;
    const { error } = await supabase.from('velora_simulations').upsert({ user_id: session.user.id, state: nextSimulation.exportState(), profile: nextProfile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) setAuthError('Could not save your profile. Check the database setup and try again.');
    else {
      setUserProfile(nextProfile);
      setAccountId(preferredAccount);
      window.localStorage.setItem(`velora-simulation-active-account-${session.user.id}`, preferredAccount);
      setAuthStatus('ready');
      setSetupStarted(false);
    }
    setProfileBusy(false);
  }

  function continueFromLanding() {
    const choice = ACCOUNT_TYPES.find(type => type.id === selectedAccountType);
    if (!choice) return;
    setSelectedAccountType(choice.id);
    const defaultOccupation = choice.id === 'teen' ? 'Student' : choice.id === 'kids' ? 'Parent / guardian' : 'Working professional';
    setProfileDraft(current => ({ ...current, ...(userProfile || {}), accountType: choice.id, risk: choice.risk, occupation: defaultOccupation }));
    setSetupStarted(true);
    setLandingComplete(true);
  }
  const portfolio = simulation.getPortfolio(accountId);
  const prices = simulation.getPrices();
  const completeHistory = simulation.getHistory(accountId);
  const history = completeHistory.portfolio;
  const marketHistory = completeHistory.market;
  const activity = simulation.getActivity(accountId);
  const decisions = activity.decisions;
  const currentDrawdown = dailyDrawdown(history);
  const autoPaused = activity.mode === 'auto' && currentDrawdown <= -DAILY_DRAWDOWN_LIMIT;
  const persona = PERSONAS.find(item => item.id === accountId) || PERSONAS[1];
  const pnl = portfolio.netWorth - persona.startingCash;
  const pnlPct = persona.startingCash ? pnl / persona.startingCash * 100 : 0;
  const benchmark = buildBenchmarkSeries({ portfolioHistory: history, spyHistory: marketHistory.SPY || [], startingCapital: persona.startingCash });
  const benchmarkLatest = benchmark.at(-1);
  const spyDifference = benchmarkLatest?.spy > 0 ? ((benchmarkLatest.managed / benchmarkLatest.spy) - 1) * 100 : 0;
  const allocation = useMemo(() => {
    const items = [{ label: 'Cash', value: portfolio.cash, color: '#8ea997' }, ...portfolio.holdings.map((holding, index) => ({ label: holding.ticker, value: holding.marketValue, color: ['#8dc89e', '#70ad88', '#b7cdbb', '#d0b48a', '#74947d', '#9ab7a0'][index % 6] }))].filter(item => item.value > 0);
    let total = 0;
    const stops = items.map(item => { const from = total / portfolio.netWorth * 100; total += item.value; return `${item.color} ${from}% ${total / portfolio.netWorth * 100}%`; });
    return { items, background: `conic-gradient(${stops.join(', ')})` };
  }, [portfolio.cash, portfolio.holdings, portfolio.netWorth]);

  function update(action, successMessage) {
    try {
      action();
      persistSimulation(simulation);
      setHistoryVersion(value => value + 1);
      setMessage(successMessage || 'Simulation updated.');
    } catch {
      setMessage('The simulation could not be updated. Try again.');
    }
  }

  function setPersona(id) {
    setAccountId(id);
    window.localStorage.setItem(session?.user?.id ? `velora-simulation-active-account-${session.user.id}` : 'velora-simulation-active-account', id);
    setChatMessages([]);
    setChatFallback(false);
  }

  function reset() {
    const fresh = simulation.reset();
    setSimulation(fresh);
    persistSimulation(fresh);
    setHistoryVersion(value => value + 1);
    setMessage('All three demo accounts and the market have been reset.');
    setChatMessages([]);
  }

  async function runCycle(progressLabel = 'Reviewing simulated prices, goals and portfolio…') {
    if (agentBusy) return;
    setAgentBusy(true);
    setCycleProgress(progressLabel);
    const currentPortfolio = simulation.getPortfolio(accountId);
    const marketHistory = simulation.getHistory(accountId).market;
    const body = {
      accountId,
      profile: { ...currentPortfolio.profile, ...(userProfile ? { name: userProfile.name, age: userProfile.age, occupation: userProfile.occupation, goal: userProfile.goal, horizonYears: userProfile.horizonYears } : {}) },
      portfolio: currentPortfolio,
      history: Object.fromEntries(Object.entries(marketHistory).map(([ticker, rows]) => [ticker, rows.slice(-30)])),
      events: simulation.getEvents().slice(-8),
      lastDecisions: decisions.slice(0, 5).map(item => ({ type: item.actionType, ticker: item.ticker, reason: item.reason, status: item.status })),
    };
    let result;
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/wealth-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, signal: controller.signal, body: JSON.stringify(body) });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.actions)) throw new Error('AI unavailable');
        result = payload;
      } finally { window.clearTimeout(timer); }
    } catch {
      result = { actions: generateFallbackActions({ profile: currentPortfolio.profile, portfolio: currentPortfolio, prices: body.history, events: body.events }), summary: 'AI is unavailable, so the seeded persona strategy prepared a fallback review.', market_view: 'Using only the simulated market history and event feed.', source: 'fallback' };
    }
    const currentMode = simulation.getActivity(accountId).mode;
    const drawdown = dailyDrawdown(simulation.getHistory(accountId).portfolio);
    let tradesUsed = 0;
    const cycleId = `${accountId}-${simulation.getDate()}-${Date.now()}`;
    for (const action of result.actions.slice(0, 8)) {
      const tradeType = action.type === 'rebalance' ? 'buy' : action.type;
      const common = { cycleId, actionType: action.type, ticker: action.ticker || '—', amountUsd: Number(action.amount_usd) || 0, reason: action.reason, risk: action.risk, confidence: action.confidence, source: result.source, mode: currentMode, marketView: result.market_view, summary: result.summary, simDate: simulation.getDate() };
      if (action.type === 'hold') {
        simulation.addDecision(accountId, { ...common, status: 'executed' });
        continue;
      }
      const portfolioNow = simulation.getPortfolio(accountId);
      const verdict = checkAgentAction({ action: { ...action, type: tradeType }, portfolio: portfolioNow, profile: portfolioNow.profile, tradesSoFar: tradesUsed, mode: currentMode, drawdown });
      tradesUsed += 1;
      if (!verdict.allowed) {
        simulation.addDecision(accountId, { ...common, status: 'blocked', reason: `Blocked by guardrail: ${verdict.reason}` });
      } else if (currentMode === 'approve') {
        simulation.addDecision(accountId, { ...common, status: 'pending' });
      } else {
        const price = simulation.getPrices().prices[action.ticker];
        const order = simulation.placeOrder(accountId, action.ticker, common.amountUsd / price, tradeType);
        if (!order.ok) simulation.addDecision(accountId, { ...common, status: 'blocked', reason: `Blocked by guardrail: ${order.reason}` });
        else simulation.addDecision(accountId, { ...common, status: 'executed', fillPrice: order.order.price, fillQuantity: order.order.quantity, fee: order.order.fee });
      }
    }
    persistSimulation(simulation);
    setHistoryVersion(value => value + 1);
    setCycleProgress('');
    setAgentBusy(false);
    setMessage(result.source === 'fallback' ? 'Fallback mode · review is based on deterministic persona targets.' : result.summary);
  }

  function resolveProposal(decision, approve) {
    if (!approve) {
      simulation.updateDecision(accountId, decision.id, { status: 'rejected', outcome: 'You rejected this simulated proposal.' });
      persistSimulation(simulation);
      setHistoryVersion(value => value + 1);
      setMessage('Proposal rejected. No simulated order was placed.');
      return;
    }
    const portfolioNow = simulation.getPortfolio(accountId);
    const alreadyExecuted = simulation.getActivity(accountId).decisions.filter(item => item.cycleId === decision.cycleId && item.status === 'executed' && item.actionType !== 'hold').length;
    const tradeType = decision.actionType === 'rebalance' ? 'buy' : decision.actionType;
    const verdict = checkAgentAction({ action: { type: tradeType, ticker: decision.ticker, amount_usd: decision.amountUsd }, portfolio: portfolioNow, profile: portfolioNow.profile, tradesSoFar: alreadyExecuted, mode: 'approve', drawdown: dailyDrawdown(simulation.getHistory(accountId).portfolio) });
    if (!verdict.allowed) {
      simulation.updateDecision(accountId, decision.id, { status: 'blocked', reason: `Blocked by guardrail: ${verdict.reason}` });
      setMessage(`Blocked by guardrail: ${verdict.reason}`);
    } else {
      const price = simulation.getPrices().prices[decision.ticker];
      const order = simulation.placeOrder(accountId, decision.ticker, decision.amountUsd / price, tradeType);
      if (!order.ok) {
        simulation.updateDecision(accountId, decision.id, { status: 'blocked', reason: `Blocked by guardrail: ${order.reason}` });
        setMessage(`Blocked by guardrail: ${order.reason}`);
      } else {
        simulation.updateDecision(accountId, decision.id, { status: 'executed', fillPrice: order.order.price, fillQuantity: order.order.quantity, fee: order.order.fee, outcome: 'Approved and executed in the simulated market.' });
        setMessage('Approved. The simulated order has been recorded.');
      }
    }
    persistSimulation(simulation);
    setHistoryVersion(value => value + 1);
  }

  async function advanceWeek() {
    simulation.advanceTime(7);
    persistSimulation(simulation);
    setHistoryVersion(value => value + 1);
    await runCycle();
  }

  async function fastForwardMonth() {
    if (fastForwardBusy || agentBusy) return;
    setFastForwardBusy(true);
    for (let week = 0; week < 4; week += 1) {
      simulation.advanceTime(7);
      persistSimulation(simulation);
      setHistoryVersion(value => value + 1);
      await runCycle(`Week ${week + 1} of 4 · running AI decision cycle…`);
    }
    setFastForwardBusy(false);
    setCycleProgress('');
    setMessage('Four weekly simulation and AI cycles are complete.');
  }

  function changeMode(mode) {
    simulation.setTradingMode(accountId, mode);
    persistSimulation(simulation);
    setHistoryVersion(value => value + 1);
    setMessage(mode === 'auto' ? 'Auto mode is on. Guardrails still review every simulated order.' : 'Approve mode is on. Review each proposal before it is placed.');
  }

  async function loadDemoCrash() {
    const before = simulation.getPortfolio(accountId);
    if (!before.holdings.length) {
      const targets = targetWeights(before.profile.risk);
      for (const [ticker, weight] of Object.entries(targets)) {
        const amountUsd = before.netWorth * weight * 0.99;
        if (amountUsd < 10) continue;
        simulation.placeOrder(accountId, ticker, amountUsd / simulation.getPrices().prices[ticker], 'buy');
      }
    }
    simulation.advanceTime(1);
    simulation.setDemoCrash();
    persistSimulation(simulation);
    setHistoryVersion(value => value + 1);
    setMessage('Crash scenario loaded. Velora is reviewing exposure and cash buffers.');
    await runCycle('Reviewing crash response and portfolio risk…');
  }

  async function askQuestion(question = chatQuestion) {
    const prompt = String(question || '').trim().slice(0, 280);
    if (!prompt || chatBusy) return;
    const currentPortfolio = simulation.getPortfolio(accountId);
    const currentDecisions = simulation.getActivity(accountId).decisions;
    const currentEvents = simulation.getEvents().slice(-8);
    const submitted = { role: 'user', text: prompt };
    setChatMessages(items => [...items, submitted].slice(-16));
    setChatQuestion('');
    setChatBusy(true);
    let answer;
    let source = 'ai';
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/wealth-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, signal: controller.signal, body: JSON.stringify({ accountId, asOf: simulation.getDate(), question: prompt, profile: { ...currentPortfolio.profile, ...(userProfile ? { name: userProfile.name, age: userProfile.age, occupation: userProfile.occupation, goal: userProfile.goal, horizonYears: userProfile.horizonYears } : {}) }, portfolio: currentPortfolio, events: currentEvents, decisions: currentDecisions.slice(0, 30) }) });
        const payload = await response.json();
        if (!response.ok || typeof payload.answer !== 'string') throw new Error('Advisor unavailable');
        answer = payload.answer;
        source = payload.source || 'ai';
      } finally { window.clearTimeout(timer); }
    } catch {
      answer = localChatAnswer(prompt, { ...persona, ...(userProfile || {}) }, currentPortfolio, currentDecisions, simulation.getDate());
      source = 'fallback';
    }
    setChatFallback(source === 'fallback');
    setChatMessages(items => [...items, { role: 'assistant', text: answer, source }].slice(-16));
    setChatBusy(false);
  }

  const timelineIndex = Math.max(0, history.length - 1);
  const selectedIndex = Math.min(selectedTimeline, timelineIndex);
  const selectedHistory = history.slice(0, selectedIndex + 1).slice(-windowDays - 1);

  if (supabaseConfigured && authStatus === 'loading') return <div className="wm-auth-state"><span className="wm-spinner"/><p>Loading your saved simulation…</p></div>;
  if (!landingComplete) return <main className="wm-landing">
    <section className="wm-onboarding-card wm-onboarding-first">
      <div className="wm-onboarding-brand"><span className="wm-brand-icon"><span/><span/><span/></span><b>velora</b></div>
      <span className="wm-onboarding-step">A FRESH START · STEP 1 OF 2</span>
      <h1>Your money, on your terms.</h1>
      <p>Build a personal planning space from zero. Choose the experience that fits you. This creates a local simulation profile—not a bank, brokerage, or real-money account.</p>
      <section className="wm-account-options" aria-label="Choose an account type">{ACCOUNT_TYPES.map(({ id, title, description, Icon }) => <button type="button" key={id} className={`wm-account-option${selectedAccountType === id ? ' selected' : ''}`} onClick={() => setSelectedAccountType(id)} aria-pressed={selectedAccountType === id}><span className={`wm-account-icon ${id}`}><Icon size={18}/></span><span className="wm-account-copy"><span className="wm-account-title">{title}</span><span className="wm-account-description">{description}</span></span><span className="wm-account-radio"/></button>)}</section>
      <button className="wm-onboarding-continue" onClick={continueFromLanding} disabled={!selectedAccountType}>Continue <span aria-hidden="true">↗</span></button>
      <div className="wm-onboarding-privacy"><LockKeyhole size={12}/>{supabaseConfigured ? 'Sign in to sync your private profile across devices' : 'No sign-in required · your profile is saved in this browser'}</div>
    </section>
  </main>;
  if (supabaseConfigured && authStatus !== 'ready') return <section className="wm-auth-card">
    <div className="wm-brand-lockup"><span className="wm-brand-icon"><span/><span/><span/></span><div><b>velora</b><small>SIMULATED WEALTH</small></div></div>
    <span className="wm-eyebrow">PRIVATE SIMULATED WORKSPACE</span>
    <h1>{authMode === 'signup' ? 'Create your Velora login' : 'Sign in to Velora'}</h1>
    <p>Your simulated accounts and activity will sync to your private database and follow you across devices.</p>
    <form onSubmit={submitAuth} className="wm-auth-form">
      <label>Email<input type="email" autoComplete="email" required value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength="8" required value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder="At least 8 characters"/></label>
      <button className="wm-primary-button" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
    </form>
    {authError && <div className="wm-auth-error" role="alert">{authError}</div>}
    {authMessage && <div className="wm-auth-message" role="status">{authMessage}</div>}
    <button className="wm-auth-switch" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); setAuthMessage(''); }}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New to Velora? Create an account'}</button>
    <button className="wm-auth-switch" onClick={() => { setSetupStarted(false); setLandingComplete(false); }}>← Choose a different account type</button>
    {authStatus === 'error' && <button className="wm-auth-switch" onClick={async () => { await supabase.auth.signOut(); setAuthStatus('signedout'); setAuthError(''); }}>Sign out and try again</button>}
    <small>Simulated environment only. No real money or brokerage account is connected.</small>
  </section>;
  if (setupStarted && (!supabaseConfigured || authStatus === 'ready')) return <section className="wm-auth-card wm-profile-card wm-onboarding-card wm-onboarding-setup">
    <div className="wm-onboarding-brand"><span className="wm-brand-icon"><span/><span/><span/></span><b>velora</b></div>
    <span className="wm-onboarding-step">A FRESH START · STEP 2 OF 2</span>
    <h1>Let’s make this yours.</h1>
    <p>{selectedAccountType === 'kids' ? 'A parent or guardian sets up this learning space. Enter the adult account holder’s details.' : 'Tell Velora a little about you so we can shape your simulated planning space.'} Your details stay {supabaseConfigured ? 'in your private account' : 'in this browser'}.</p>
    <form onSubmit={saveUserProfile} className="wm-auth-form wm-profile-form">
      <label>Your name<input autoComplete="name" required maxLength="48" value={profileDraft.name} onChange={event => setProfileDraft(current => ({ ...current, name: event.target.value }))} placeholder="Name to show in Velora"/></label>
      <div className="wm-profile-fields"><label>Your age<input type="number" min="18" max="100" required value={profileDraft.age} onChange={event => setProfileDraft(current => ({ ...current, age: event.target.value }))} placeholder="35"/></label><label>What best describes you?<select value={profileDraft.occupation} onChange={event => setProfileDraft(current => ({ ...current, occupation: event.target.value }))}><option value="">Choose one</option><option>Student</option><option>Parent / guardian</option><option>Working professional</option><option>Business owner</option><option>Near retirement</option><option>Retired</option><option>Other</option></select></label></div>
      <label>Your investing comfort<select value={profileDraft.risk} onChange={event => setProfileDraft(current => ({ ...current, risk: event.target.value }))}><option value="conservative">Conservative · protect stability</option><option value="balanced">Balanced · grow steadily</option><option value="aggressive">Aggressive · pursue long-term growth</option></select></label>
      <label>What are you working toward?<input maxLength="120" value={profileDraft.goal} onChange={event => setProfileDraft(current => ({ ...current, goal: event.target.value }))} placeholder="Build long-term wealth"/></label>
      <label>Time horizon (years)<input type="number" min="1" max="60" required value={profileDraft.horizonYears} onChange={event => setProfileDraft(current => ({ ...current, horizonYears: event.target.value }))}/></label>
      {authError && <div className="wm-auth-error" role="alert">{authError}</div>}
      <button className="wm-primary-button" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Create my workspace'}</button>
    </form>
    <button className="wm-auth-switch" onClick={() => { setSetupStarted(false); setLandingComplete(false); }}>← Choose a different account type</button>
    {supabaseConfigured && <button className="wm-auth-switch" onClick={signOut}>Sign out</button>}
    <small>Simulated environment only. The selected risk level chooses a starting paper portfolio.{supabaseConfigured ? '' : ' Add Supabase settings to sync across devices.'}</small>
  </section>;

  return <div className="wealth-manager">
    <header className="wm-header">
      <div className="wm-brand-lockup"><span className="wm-brand-icon"><span/><span/><span/></span><div><b>velora</b><small>SIMULATED WEALTH</small></div></div>
      <div className="wm-header-right">{supabaseConfigured ? <><span className="wm-sync-badge"><i className={syncError ? 'error' : ''}/>{syncError ? 'SYNC ISSUE' : 'CLOUD SYNC'}</span><button className="wm-signout-button" onClick={signOut}>Sign out</button></> : <span className="wm-sync-badge local"><i/> SAVED ON THIS DEVICE</span>}<div className="wm-market-status"><span className="wm-status-dot"/> SIM MARKET <span className="wm-status-divider"/> {prices.date}</div></div>
    </header>

    <section className="wm-welcome-row"><div><div className="wm-eyebrow">YOUR SIMULATED WEALTH PLAN</div><h1>Good day, {userProfile?.name || persona.name}.</h1><p>{userProfile ? `Your ${persona.name} simulated portfolio is personalized for a ${userProfile.risk} risk profile.` : 'Your portfolio, market and AI activity in one calm view.'}</p></div><label className="wm-persona-picker"><span>{ACCOUNT_TYPES.find(type => type.id === selectedAccountType)?.title || 'SIMULATED'} ACCOUNT · SWITCH PORTFOLIO</span><div><select value={accountId} onChange={event => setPersona(event.target.value)} aria-label="Select a demo account">{PERSONAS.map(person => <option key={person.id} value={person.id}>{person.name}, {person.age} · {person.risk}</option>)}</select><ChevronDown size={15}/></div></label></section>

    <section className="wm-metrics" aria-label="Portfolio summary">
      <article className="wm-metric wm-net-worth"><div className="wm-metric-label">NET WORTH <CircleDollarSign size={16}/></div><strong>{money(portfolio.netWorth)}</strong><span>USD · simulated account</span><div className="wm-metric-spark"><Activity size={16}/><span>{pnl >= 0 ? '+' : ''}{money(pnl)} since start</span></div></article>
      <article className="wm-metric"><div className="wm-metric-label">TOTAL P&amp;L <span className={pnl >= 0 ? 'wm-positive' : 'wm-negative'}>{pnl >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}</span></div><strong className={pnl >= 0 ? 'wm-positive' : 'wm-negative'}>{pnl >= 0 ? '+' : '−'}{money(Math.abs(pnl))}</strong><span className={pnl >= 0 ? 'wm-positive' : 'wm-negative'}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}% overall</span></article>
      <article className="wm-metric"><div className="wm-metric-label">SIMULATED CASH <Wallet size={16}/></div><strong>{money(portfolio.cash)}</strong><span>{(portfolio.cash / portfolio.netWorth * 100 || 0).toFixed(0)}% of net worth</span></article>
      <article className="wm-metric"><div className="wm-metric-label">RISK PROFILE <ShieldCheck size={16}/></div><strong className="wm-risk-name">{persona.risk}</strong><span>{persona.horizonYears}-year investing horizon</span></article>
    </section>

    <section className="wm-controls"><div className="wm-control-date"><CalendarDays size={17}/><span><small>SIMULATION DATE</small><b>{prices.date}</b></span></div><div className="wm-control-buttons"><button disabled={agentBusy || fastForwardBusy} onClick={() => update(() => simulation.advanceTime(1), 'Market advanced one day.')}>Next day <ArrowDownRight size={14}/></button><button disabled={agentBusy || fastForwardBusy} onClick={advanceWeek}>Next week <ArrowDownRight size={14}/></button><button className="wm-primary-button" disabled={agentBusy || fastForwardBusy} onClick={fastForwardMonth}>Fast-forward 1 month <ArrowDownRight size={14}/></button><button className="wm-reset-button" disabled={agentBusy || fastForwardBusy} onClick={reset} title="Reset the simulation"><RotateCcw size={15}/><span>Reset</span></button></div></section>

    <section className="wm-agent-controls"><div className="wm-mode-control"><span>AI TRADING MODE</span><div><button className={activity.mode === 'approve' ? 'selected' : ''} onClick={() => changeMode('approve')}>Approve</button><button className={activity.mode === 'auto' ? 'selected' : ''} onClick={() => changeMode('auto')}>Auto</button></div></div><div className="wm-agent-explainer"><Bot size={16}/><span>{activity.mode === 'approve' ? 'Review each suggestion before it becomes a simulated order.' : 'Velora executes simulated orders inside the guardrails.'}</span></div><button className="wm-run-agent" onClick={() => runCycle()} disabled={agentBusy || fastForwardBusy}>{agentBusy ? <><span className="wm-spinner"/> Reviewing…</> : <><Sparkles size={15}/> Run AI cycle</>}</button>{autoPaused && <div className="wm-circuit-breaker"><ShieldCheck size={14}/> Daily loss reached {(currentDrawdown * 100).toFixed(1)}%. Auto trading is paused by the circuit breaker.</div>}{cycleProgress && <div className="wm-cycle-progress" role="status"><span className="wm-progress-bar"/>{cycleProgress}</div>}</section>

    <div className="wm-main-grid">
      <section className="wm-panel wm-performance-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">PERFORMANCE</span><h2>Portfolio value</h2></div><div className="wm-period-tabs">{[30, 90, 365, 730].map(days => <button key={days} className={windowDays === days ? 'selected' : ''} onClick={() => setWindowDays(days)}>{days === 730 ? '2Y' : days === 365 ? '1Y' : `${days}D`}</button>)}</div></div><div className="wm-chart-total">{precise(portfolio.netWorth)} <span className={pnl >= 0 ? 'wm-positive' : 'wm-negative'}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</span></div><LineChart rows={selectedHistory} selected={selectedHistory.length - 1}/><div className="wm-timeline"><span>{history[0]?.date}</span><input type="range" min="0" max={timelineIndex} value={selectedIndex} onChange={event => setSelectedTimeline(Number(event.target.value))} aria-label="Simulation history timeline"/><span>{history[selectedIndex]?.date}</span></div></section>

      <section className="wm-panel wm-allocation-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">PORTFOLIO MIX</span><h2>Allocation</h2></div><span className="wm-sim-chip">SIMULATED</span></div><div className="wm-allocation-body"><div className="wm-donut" style={{ background: allocation.items.length ? allocation.background : '#273c33' }}><div><b>{portfolio.holdings.length}</b><small>holdings</small></div></div><div className="wm-allocation-legend">{allocation.items.map(item => <div key={item.label}><i style={{ background: item.color }}/><span>{item.label}</span><b>{money(item.value)}</b></div>)}</div></div></section>
    </div>

    <section className="wm-panel wm-benchmark-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">THE SAME SEEDED MARKET PATH</span><h2>Velora vs. buy-and-hold</h2></div><div className={`wm-benchmark-difference ${spyDifference >= 0 ? 'wm-positive' : 'wm-negative'}`}><b>{spyDifference >= 0 ? '+' : ''}{spyDifference.toFixed(2)}%</b><small>vs. SPY buy-and-hold</small></div></div><p className="wm-benchmark-copy">Starting capital is compared with the Velora-managed account, buy-and-hold SPY, and holding cash across the same simulated dates.</p><BenchmarkChart rows={benchmark}/></section>

    <section className="wm-panel wm-holdings-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">YOUR INVESTMENTS</span><h2>Holdings</h2></div><span className="wm-holdings-note">Prices update as simulated time advances</span></div><div className="wm-table-scroll"><table><thead><tr><th>ASSET</th><th>SHARES</th><th>PRICE</th><th>MARKET VALUE</th><th>UNREALIZED P&amp;L</th></tr></thead><tbody>{portfolio.holdings.length ? portfolio.holdings.map(holding => <tr key={holding.ticker}><td><b className="wm-ticker">{holding.ticker}</b><span className="wm-asset-name">{holding.name} · {holding.type.toUpperCase()}</span></td><td>{holding.quantity.toFixed(4)}</td><td>{precise(prices.prices[holding.ticker])}</td><td>{precise(holding.marketValue)}</td><td className={holding.unrealizedPnl >= 0 ? 'wm-positive' : 'wm-negative'}>{holding.unrealizedPnl >= 0 ? '+' : '−'}{precise(Math.abs(holding.unrealizedPnl))}</td></tr>) : <tr><td colSpan="5" className="wm-empty-holdings"><span><Sparkles size={18}/><b>Your simulated portfolio is ready</b><small>AI recommendations will appear here after your first decision cycle.</small></span></td></tr>}</tbody></table></div></section>

    <section className="wm-panel wm-ai-activity"><div className="wm-panel-heading"><div><span className="wm-eyebrow">VELORA AI</span><h2>Activity feed</h2></div><span className={decisions[0]?.source === 'fallback' ? 'wm-source-badge fallback' : 'wm-source-badge'}>{decisions[0]?.source === 'fallback' ? 'FALLBACK MODE' : 'SIMULATION FEED'}</span></div>{decisions.length ? <div className="wm-decision-list">{decisions.slice(0, 12).map(decision => <article className="wm-decision" key={decision.id}><span className={`wm-decision-icon ${decision.status}`}><Sparkles size={14}/></span><div className="wm-decision-copy"><div className="wm-decision-title"><b>{decision.actionType.toUpperCase()} {decision.ticker !== '—' ? decision.ticker : ''}</b><span className={`wm-status-badge ${decision.status}`}>{decision.status}</span><span className={`wm-risk-badge ${decision.risk}`}>{decision.risk} risk</span></div><p>{decision.reason}</p><small>{decision.simDate} {decision.createdAt ? `· ${new Date(decision.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''} · {decision.source === 'fallback' ? 'fallback mode' : 'AI proposal'} · {Math.round((decision.confidence || 0) * 100)}% confidence{decision.amountUsd > 0 ? ` · ${money(decision.amountUsd)}` : ''}</small></div>{decision.status === 'pending' && <div className="wm-decision-actions"><button onClick={() => resolveProposal(decision, true)}>Approve</button><button onClick={() => resolveProposal(decision, false)}>Reject</button></div>}</article>)}</div> : <div className="wm-no-events">Run an AI cycle to see a portfolio review, risk level and proposed next steps.</div>}</section>

    <section className="wm-panel wm-chat-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">ASK VELORA</span><h2>Your simulated portfolio, explained.</h2></div><span className={chatFallback ? 'wm-source-badge fallback' : 'wm-source-badge'}>{chatFallback ? 'FALLBACK MODE' : 'GROUNDED IN YOUR LOG'}</span></div><div className="wm-chat-history" aria-live="polite">{chatMessages.length ? chatMessages.map((item, index) => <div className={`wm-chat-message ${item.role}`} key={`${index}-${item.role}`}><span>{item.role === 'user' ? 'You' : 'Velora'}</span><p>{item.text}</p></div>) : <div className="wm-chat-empty"><Bot size={17}/><span>Ask about a decision, your goal, or the current portfolio. Velora uses the saved activity log and will say when something is not recorded.</span></div>}{chatBusy && <div className="wm-chat-loading"><span className="wm-spinner"/> Reading the portfolio and activity log…</div>}</div><form className="wm-chat-form" onSubmit={event => { event.preventDefault(); askQuestion(); }}><input value={chatQuestion} onChange={event => setChatQuestion(event.target.value)} maxLength={280} placeholder="Ask about a decision or your goal…" aria-label="Ask Velora about your portfolio"/><button type="submit" disabled={chatBusy || !chatQuestion.trim()}>Ask <ArrowUpRight size={14}/></button></form><div className="wm-chat-prompts"><button type="button" onClick={() => askQuestion('Why did you sell TSLA?')} disabled={chatBusy}>Why did you sell TSLA?</button><button type="button" onClick={() => askQuestion('Am I on track for my goal?')} disabled={chatBusy}>Am I on track for my goal?</button></div><small className="wm-chat-disclaimer">Answers are based on this simulated account and saved decision log.</small></section>

    <div className="wm-bottom-grid"><section className="wm-panel wm-market-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">MARKET SETTING</span><h2>Choose a market regime</h2></div><select value={prices.regime} onChange={event => update(() => simulation.setRegime(event.target.value))} aria-label="Market regime">{Object.keys(REGIMES).map(regime => <option value={regime} key={regime}>{regime[0].toUpperCase() + regime.slice(1)}</option>)}</select></div><p>Regimes change the drift and volatility used for every future simulated market day.</p><div className="wm-market-quotes">{Object.entries(ASSETS).slice(0, 5).map(([ticker, asset]) => <div key={ticker}><span>{ticker}</span><small>{asset.name}</small><b>{precise(prices.prices[ticker])}</b></div>)}</div><button className="wm-crash-button" disabled={agentBusy || fastForwardBusy} onClick={loadDemoCrash}>Load demo crash scenario <TrendingDown size={13}/></button></section>
      <section className="wm-panel wm-activity-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">MARKET FEED</span><h2>Recent events</h2></div><span className="wm-feed-live"><i/> LIVE SIM</span></div>{simulation.getEvents().slice(-4).reverse().map(event => <article className="wm-event" key={event.id}><span className="wm-event-icon"><Activity size={15}/></span><div><b>{event.headline}</b><small>{event.date} · {event.tickers.join(', ')}</small></div></article>)}{!simulation.getEvents().length && <div className="wm-no-events">Market events will appear as the simulation advances.</div>}</section></div>

    {(message || syncError) && <div className="wm-toast" role="status">{syncError || message}<button onClick={() => { setMessage(''); setSyncError(''); }} aria-label="Dismiss message">×</button></div>}
    <footer className="wm-footer"><span><ShieldCheck size={14}/> Simulated environment. Not financial advice.</span><span>{supabaseConfigured ? `Private cloud simulation · ${session?.user?.email || 'signed in'}` : 'Velora market engine · saved in this browser'}</span></footer>
  </div>;
}
