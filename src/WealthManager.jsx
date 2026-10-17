import React, { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Bot, CalendarDays, ChevronDown, CircleDollarSign, RotateCcw, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { ASSETS, PERSONAS, REGIMES, loadSimulation, saveSimulation } from './simulation.js';
import { checkAgentAction, dailyDrawdown, DAILY_DRAWDOWN_LIMIT, generateFallbackActions, targetWeights } from './wealth-agent.js';
import './wealth-manager.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const precise = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

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

export default function WealthManager() {
  const [simulation, setSimulation] = useState(() => loadSimulation());
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
  const [, setHistoryVersion] = useState(0);
  const portfolio = simulation.getPortfolio(accountId);
  const prices = simulation.getPrices();
  const history = simulation.getHistory(accountId).portfolio;
  const activity = simulation.getActivity(accountId);
  const decisions = activity.decisions;
  const currentDrawdown = dailyDrawdown(history);
  const autoPaused = activity.mode === 'auto' && currentDrawdown <= -DAILY_DRAWDOWN_LIMIT;
  const persona = PERSONAS.find(item => item.id === accountId) || PERSONAS[1];
  const pnl = portfolio.netWorth - persona.startingCash;
  const pnlPct = persona.startingCash ? pnl / persona.startingCash * 100 : 0;
  const allocation = useMemo(() => {
    const items = [{ label: 'Cash', value: portfolio.cash, color: '#8ea997' }, ...portfolio.holdings.map((holding, index) => ({ label: holding.ticker, value: holding.marketValue, color: ['#8dc89e', '#70ad88', '#b7cdbb', '#d0b48a', '#74947d', '#9ab7a0'][index % 6] }))].filter(item => item.value > 0);
    let total = 0;
    const stops = items.map(item => { const from = total / portfolio.netWorth * 100; total += item.value; return `${item.color} ${from}% ${total / portfolio.netWorth * 100}%`; });
    return { items, background: `conic-gradient(${stops.join(', ')})` };
  }, [portfolio.cash, portfolio.holdings, portfolio.netWorth]);

  function update(action, successMessage) {
    try {
      action();
      saveSimulation(simulation);
      setHistoryVersion(value => value + 1);
      setMessage(successMessage || 'Simulation updated.');
    } catch {
      setMessage('The simulation could not be updated. Try again.');
    }
  }

  function setPersona(id) {
    setAccountId(id);
    window.localStorage.setItem('velora-simulation-active-account', id);
  }

  function reset() {
    const fresh = simulation.reset();
    setSimulation(fresh);
    saveSimulation(fresh);
    setHistoryVersion(value => value + 1);
    setMessage('All three demo accounts and the market have been reset.');
  }

  async function runCycle(progressLabel = 'Reviewing simulated prices, goals and portfolio…') {
    if (agentBusy) return;
    setAgentBusy(true);
    setCycleProgress(progressLabel);
    const currentPortfolio = simulation.getPortfolio(accountId);
    const marketHistory = simulation.getHistory(accountId).market;
    const body = {
      accountId,
      profile: currentPortfolio.profile,
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
        const response = await fetch('/api/wealth-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) });
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
    saveSimulation(simulation);
    setHistoryVersion(value => value + 1);
    setCycleProgress('');
    setAgentBusy(false);
    setMessage(result.source === 'fallback' ? 'Fallback mode · review is based on deterministic persona targets.' : result.summary);
  }

  function resolveProposal(decision, approve) {
    if (!approve) {
      simulation.updateDecision(accountId, decision.id, { status: 'rejected', outcome: 'You rejected this simulated proposal.' });
      saveSimulation(simulation);
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
    saveSimulation(simulation);
    setHistoryVersion(value => value + 1);
  }

  async function advanceWeek() {
    simulation.advanceTime(7);
    saveSimulation(simulation);
    setHistoryVersion(value => value + 1);
    await runCycle();
  }

  async function fastForwardMonth() {
    if (fastForwardBusy || agentBusy) return;
    setFastForwardBusy(true);
    for (let week = 0; week < 4; week += 1) {
      simulation.advanceTime(7);
      saveSimulation(simulation);
      setHistoryVersion(value => value + 1);
      await runCycle(`Week ${week + 1} of 4 · running AI decision cycle…`);
    }
    setFastForwardBusy(false);
    setCycleProgress('');
    setMessage('Four weekly simulation and AI cycles are complete.');
  }

  function changeMode(mode) {
    simulation.setTradingMode(accountId, mode);
    saveSimulation(simulation);
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
    saveSimulation(simulation);
    setHistoryVersion(value => value + 1);
    setMessage('Crash scenario loaded. Velora is reviewing exposure and cash buffers.');
    await runCycle('Reviewing crash response and portfolio risk…');
  }

  const timelineIndex = Math.max(0, history.length - 1);
  const selectedIndex = Math.min(selectedTimeline, timelineIndex);
  const selectedHistory = history.slice(0, selectedIndex + 1).slice(-windowDays - 1);

  return <div className="wealth-manager">
    <header className="wm-header">
      <div className="wm-brand-lockup"><span className="wm-brand-icon"><span/><span/><span/></span><div><b>velora</b><small>SIMULATED WEALTH</small></div></div>
      <div className="wm-market-status"><span className="wm-status-dot"/> SIM MARKET <span className="wm-status-divider"/> {prices.date}</div>
    </header>

    <section className="wm-welcome-row"><div><div className="wm-eyebrow">YOUR SIMULATED WEALTH PLAN</div><h1>Good day, {persona.name}.</h1><p>Your portfolio, market and AI activity in one calm view.</p></div><label className="wm-persona-picker"><span>DEMO ACCOUNT</span><div><select value={accountId} onChange={event => setPersona(event.target.value)} aria-label="Select a demo account">{PERSONAS.map(person => <option key={person.id} value={person.id}>{person.name}, {person.age} · {person.risk}</option>)}</select><ChevronDown size={15}/></div></label></section>

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

    <section className="wm-panel wm-holdings-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">YOUR INVESTMENTS</span><h2>Holdings</h2></div><span className="wm-holdings-note">Prices update as simulated time advances</span></div><div className="wm-table-scroll"><table><thead><tr><th>ASSET</th><th>SHARES</th><th>PRICE</th><th>MARKET VALUE</th><th>UNREALIZED P&amp;L</th></tr></thead><tbody>{portfolio.holdings.length ? portfolio.holdings.map(holding => <tr key={holding.ticker}><td><b className="wm-ticker">{holding.ticker}</b><span className="wm-asset-name">{holding.name} · {holding.type.toUpperCase()}</span></td><td>{holding.quantity.toFixed(4)}</td><td>{precise(prices.prices[holding.ticker])}</td><td>{precise(holding.marketValue)}</td><td className={holding.unrealizedPnl >= 0 ? 'wm-positive' : 'wm-negative'}>{holding.unrealizedPnl >= 0 ? '+' : '−'}{precise(Math.abs(holding.unrealizedPnl))}</td></tr>) : <tr><td colSpan="5" className="wm-empty-holdings"><span><Sparkles size={18}/><b>Your simulated portfolio is ready</b><small>AI recommendations will appear here after your first decision cycle.</small></span></td></tr>}</tbody></table></div></section>

    <section className="wm-panel wm-ai-activity"><div className="wm-panel-heading"><div><span className="wm-eyebrow">VELORA AI</span><h2>Activity feed</h2></div><span className={decisions[0]?.source === 'fallback' ? 'wm-source-badge fallback' : 'wm-source-badge'}>{decisions[0]?.source === 'fallback' ? 'FALLBACK MODE' : 'SIMULATION FEED'}</span></div>{decisions.length ? <div className="wm-decision-list">{decisions.slice(0, 12).map(decision => <article className="wm-decision" key={decision.id}><span className={`wm-decision-icon ${decision.status}`}><Sparkles size={14}/></span><div className="wm-decision-copy"><div className="wm-decision-title"><b>{decision.actionType.toUpperCase()} {decision.ticker !== '—' ? decision.ticker : ''}</b><span className={`wm-status-badge ${decision.status}`}>{decision.status}</span><span className={`wm-risk-badge ${decision.risk}`}>{decision.risk} risk</span></div><p>{decision.reason}</p><small>{decision.simDate} {decision.createdAt ? `· ${new Date(decision.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''} · {decision.source === 'fallback' ? 'fallback mode' : 'AI proposal'} · {Math.round((decision.confidence || 0) * 100)}% confidence{decision.amountUsd > 0 ? ` · ${money(decision.amountUsd)}` : ''}</small></div>{decision.status === 'pending' && <div className="wm-decision-actions"><button onClick={() => resolveProposal(decision, true)}>Approve</button><button onClick={() => resolveProposal(decision, false)}>Reject</button></div>}</article>)}</div> : <div className="wm-no-events">Run an AI cycle to see a portfolio review, risk level and proposed next steps.</div>}</section>

    <div className="wm-bottom-grid"><section className="wm-panel wm-market-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">MARKET SETTING</span><h2>Choose a market regime</h2></div><select value={prices.regime} onChange={event => update(() => simulation.setRegime(event.target.value))} aria-label="Market regime">{Object.keys(REGIMES).map(regime => <option value={regime} key={regime}>{regime[0].toUpperCase() + regime.slice(1)}</option>)}</select></div><p>Regimes change the drift and volatility used for every future simulated market day.</p><div className="wm-market-quotes">{Object.entries(ASSETS).slice(0, 5).map(([ticker, asset]) => <div key={ticker}><span>{ticker}</span><small>{asset.name}</small><b>{precise(prices.prices[ticker])}</b></div>)}</div><button className="wm-crash-button" disabled={agentBusy || fastForwardBusy} onClick={loadDemoCrash}>Load demo crash scenario <TrendingDown size={13}/></button></section>
      <section className="wm-panel wm-activity-panel"><div className="wm-panel-heading"><div><span className="wm-eyebrow">MARKET FEED</span><h2>Recent events</h2></div><span className="wm-feed-live"><i/> LIVE SIM</span></div>{simulation.getEvents().slice(-4).reverse().map(event => <article className="wm-event" key={event.id}><span className="wm-event-icon"><Activity size={15}/></span><div><b>{event.headline}</b><small>{event.date} · {event.tickers.join(', ')}</small></div></article>)}{!simulation.getEvents().length && <div className="wm-no-events">Market events will appear as the simulation advances.</div>}</section></div>

    {message && <div className="wm-toast" role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
    <footer className="wm-footer"><span><ShieldCheck size={14}/> Simulated environment. Not financial advice.</span><span>Velora market engine · seeded demo data</span></footer>
  </div>;
}
