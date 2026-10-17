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
const money = (value, digits = 0) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

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
  const [contribution, setContribution] = useState('250');
  const [autoResult, setAutoResult] = useState(null);
  const [crash, setCrash] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('Your 30-day plan is steady. Essentials stay covered in the forecast, leaving room to build a small, repeatable investing habit. Start with a schedule you can comfortably pause.');
  const [aiStatus, setAiStatus] = useState('demo');
  const [aiLoading, setAiLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const forecast = useMemo(() => buildForecast({ purchase, cancelled }), [purchase, cancelled]);
  const { lowestBalance, safeSurplus } = useMemo(() => getSafeSurplus(forecast), [forecast]);
  const bills = forecast.flatMap(point => point.events).filter(event => event.amount < 0).reduce((sum,event) => sum + Math.abs(event.amount),0);
  const income = forecast.flatMap(point => point.events).filter(event => event.amount > 0).reduce((sum,event) => sum + event.amount,0);
  const recurringTotal = subscriptions.filter(item => !cancelled.includes(item.name)).reduce((sum,item) => sum + item.amount,0);
  const decision = evaluateSimulatedTrade({ amount, safeSurplus, railsEnabled: rails });
  const autoPlan = useMemo(() => simulateAutoInvest({ forecast, amount: contribution, cadence, railsEnabled: rails, floor: 300 }), [forecast, contribution, cadence, rails]);
  const displayName = persona === 'Kid' ? 'Your money is growing' : persona === 'Student' ? 'You’ve got this, Alex' : 'A clearer view of your money';
  const personaCopy = persona === 'Kid' ? 'Every small choice is a chance to learn.' : persona === 'Student' ? 'Tuition, rent, and the rest of life—in one clear plan.' : 'Your next move, with a little more clarity.';

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
      <div className="top-actions"><span className="status"><i/> Sample account · read only</span><span className="engine"><Sparkles size={13}/> Gemini {aiStatus === 'live' ? 'connected' : 'demo mode'}</span><button className="icon-btn" aria-label="Notifications"><Bell size={18}/></button><button className="avatar" aria-label="Account profile">A</button><button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle persona menu"><Menu size={19}/></button></div>
    </header>
    <main id="top" className="dashboard">
      <div className="welcome-row"><div><div className="eyebrow light-eyebrow"><span className="eyebrow-dash"/> YOUR FINANCIAL SNAPSHOT <span className="date-label">· NEXT 30 DAYS</span></div><h1>{displayName}<span className="period">.</span></h1><p className="welcome-copy">{personaCopy}</p></div><div className="account-chip"><span className="bank-icon"><Landmark size={17}/></span><span><b>Demo chequing</b><small>Sample data · read only</small></span><ChevronDown size={16}/></div></div>
      <section className="summary-grid" aria-label="Account overview">
        <article className="summary-card balance-card"><div className="card-topline"><span>Current balance</span><CircleHelp size={15}/></div><div className="balance-amount">{money(startingBalance-purchase,2)}</div><div className="balance-foot"><span className="up-label"><TrendingUp size={14}/> Plan in view</span><span>Sample account</span></div><div className="balance-spark"><svg viewBox="0 0 140 42"><path d="M1 32 C18 26 18 33 33 25 S55 28 65 17 S84 23 98 12 S116 19 139 3" fill="none" stroke="#70b69a" strokeWidth="2"/></svg></div></article>
        <article className="summary-card"><div className="card-topline"><span>Income · 30 days</span><span className="metric-icon income-icon"><ArrowDownLeft size={17}/></span></div><div className="metric-amount">{money(income,0)}</div><div className="metric-foot"><span className="metric-note"><i className="small-green-dot"/> Paydays included</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>Planned outflows</span><span className="metric-icon bill-icon"><ArrowUpRight size={17}/></span></div><div className="metric-amount">{money(bills,0)}</div><div className="metric-foot"><span className="metric-note">Scheduled bills included</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>Safe to explore</span><span className="metric-icon safe-icon"><ShieldCheck size={17}/></span></div><div className="metric-amount">{money(safeSurplus,0)}</div><div className="metric-foot"><span className="metric-note">After a {money(1200)} cash buffer</span></div></article>
      </section>
      <section className="panel forecast-panel"><div className="panel-heading"><div><div className="eyebrow">CASH FLOW <span className="live-pill"><i/> SCENARIO MODEL</span></div><h2>See the next 30 days, before they happen.</h2><p>Scheduled income and bills shape every simulation.</p></div><span className="range-select"><Activity size={14}/> 30-day forecast</span></div><div className="chart-summary"><div><span>Projected today</span><strong>{money(startingBalance-purchase,2)}</strong></div><div className="projection-divider"/><div><span>Forecast low</span><strong className={lowestBalance < 1200 ? 'coral-text' : ''}>{money(lowestBalance,2)}</strong></div><div className="forecast-tag"><ShieldCheck size={15}/><span>{lowestBalance >= 1200 ? 'Reserve stays covered' : 'Reserve needs attention'}</span></div></div><CashFlowChart forecast={forecast}/>{crash && <div className="crash-note"><TrendingDown size={15}/><span>{crashScenarios[crash].label}: a {money(Number(amount||0))} hypothetical {ticker} position would be worth about {money(Number(amount||0)*(1-crashScenarios[crash].drawdown),2)} at the scenario low. This replay is illustrative and separate from your cash forecast.</span><button onClick={() => setCrash('')} aria-label="Dismiss crash replay"><X size={14}/></button></div>}</section>
      <div className="lower-grid">
        <section className="panel invest-panel automation-panel"><div className="section-title"><div className="section-icon green-icon"><Activity size={18}/></div><div><div className="eyebrow">AUTOMATION LAB</div><h2>Recurring investing</h2></div><span className="sim-only">SIMULATION ONLY</span></div><p className="section-description">Set a cadence. Velora checks every future bill before each simulated buy.</p><div className="automation-pool"><div><span>Available safe surplus</span><b>{money(safeSurplus)}</b></div><span className="safe-label"><ShieldCheck size={14}/> {rails ? 'Rules on' : 'Rules off'}</span></div><div className="auto-fields"><label><span>CONTRIBUTE</span><div className="amount-input"><b>$</b><input type="number" min="1" value={contribution} onChange={event => {setContribution(event.target.value);setAutoResult(null)}} aria-label="Contribution amount"/></div></label><label><span>CADENCE</span><div className="select-wrap"><select value={cadence} onChange={event => {setCadence(event.target.value);setAutoResult(null)}}><option value="7">Weekly</option><option value="14">Every 2 weeks</option><option value="30">Monthly</option></select><ChevronDown size={15}/></div></label></div><div className="automation-context"><span>Cash floor</span><b>{money(300)}</b><span>Protected essentials</span><b>{money(1200)}</b></div><button className="trade-button" onClick={() => setAutoResult(autoPlan)}><span>Run 30-day auto-invest</span><ArrowUpRight size={16}/></button>{autoResult && <div className="automation-result"><div className="result-head"><span className="result-icon"><Check size={15}/></span><div><b>{autoResult.executions.length} simulated contribution{autoResult.executions.length===1?'':'s'} · {money(autoResult.total)}</b><small>{autoResult.reason}</small></div></div>{autoResult.executions.length > 0 ? <div className="execution-chips">{autoResult.executions.map(run => <span key={run.day}>{run.date.toLocaleDateString('en-CA',{month:'short',day:'numeric'})} <b>+{money(run.amount)}</b></span>)}</div> : <div className="execution-empty">No contribution cleared the current guardrails. Lower the amount or review the cash floor.</div>}{autoResult.blocked.length > 0 && <small className="blocked-count">{autoResult.blocked.length} scheduled attempt{autoResult.blocked.length===1?'':'s'} blocked to protect bills.</small>}</div>}<div className="rails-row"><div><b>Deterministic safety rails</b><small>Only rules decide PASS or BLOCK</small></div><button className={rails ? 'toggle on' : 'toggle'} onClick={() => {setRails(!rails);setTradePreview(false);setAutoResult(null)}} aria-label="Toggle deterministic safety rails"><i/></button></div>
          <div className="manual-trade"><div className="manual-heading"><div><b>One-time trade check</b><small>Separate from your recurring plan</small></div><span>RULES ENGINE</span></div><div className="trade-fields"><label><span>ASSET</span><div className="select-wrap"><select value={ticker} onChange={event => setTicker(event.target.value)}><option>S&amp;P 500</option><option>AAPL</option><option>MSFT</option><option>TSLA</option></select><ChevronDown size={15}/></div></label><label><span>AMOUNT</span><div className="amount-input"><b>$</b><input type="number" min="1" value={amount} onChange={event => {setAmount(event.target.value);setTradePreview(false)}}/></div></label></div><button className="trade-button secondary-trade" onClick={() => setTradePreview(true)}>Check simulated order <ArrowUpRight size={15}/></button>{tradePreview && <div className={`rules-verdict ${decision.verdict==='blocked'?'blocked':'passed'}`}><div className="verdict-icon">{decision.verdict==='blocked'?<X size={15}/>:<Check size={15}/>}</div><div><b>{decision.verdict==='blocked'?'BLOCKED BY RULES':'PASS · SIMULATION READY'}</b><p>{decision.reason}</p></div></div>}</div>
          <div className="crash-row"><div><span className="crash-icon"><TrendingDown size={15}/></span><span><b>Historic crash replay</b><small>Stress-test a hypothetical position</small></span></div><div className="crash-actions"><button onClick={() => setCrash(crash==='2008-style'?'':'2008-style')}>2008</button><button onClick={() => setCrash(crash==='2020-style'?'':'2020-style')}>2020</button></div></div>
        </section>
        <section className="panel copilot-panel"><div className="section-title"><div className="section-icon violet-icon"><Sparkles size={18}/></div><div><div className="eyebrow">VELORA COPILOT</div><h2>Make the numbers make sense.</h2></div><span className={`ai-mode ${aiStatus}`}>{aiStatus === 'live' ? 'GEMINI LIVE' : 'DEMO INSIGHT'}</span></div><p className="section-description">Ask a question about your plan. Gemini explains the picture; it never changes a safety verdict.</p><div className="copilot-message"><span className="copilot-avatar"><Sparkles size={15}/></span><div><div className="message-meta">{aiStatus==='live'?'Gemini · grounded in this forecast':'Velora sample insight'}<span>JUST NOW</span></div><p>{answer}</p></div></div><form className="copilot-form" onSubmit={event => {event.preventDefault();askCopilot()}}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about a purchase, bill, or investing plan…" aria-label="Ask Velora Copilot"/><button type="submit" disabled={aiLoading || !question.trim()}>{aiLoading?'Thinking…':'Ask'} <ArrowUpRight size={15}/></button></form><div className="prompt-chips"><span>Try</span><button onClick={() => askCopilot('Can I afford a $1,200 laptop?')}>Can I afford a laptop?</button><button onClick={() => askCopilot('How much could I invest safely?')}>Explain my safe surplus</button></div><div className="ai-boundary"><LockKeyhole size={13}/> Explanations are informational. Rules Engine owns every PASS / BLOCK result.</div></section>
        <section className="panel decision-panel"><div className="section-title"><div className="section-icon coral-icon"><Wallet size={18}/></div><div><div className="eyebrow">WHAT-IF PLANNER</div><h2>Try a decision first.</h2></div></div><p className="section-description">See what a purchase could change across your whole month.</p><form className="purchase-input" onSubmit={event => {event.preventDefault();setPurchase(Number(purchaseInput.replace(/[^0-9.]/g,''))||0)}}><span>$</span><input value={purchaseInput} onChange={event => setPurchaseInput(event.target.value)} placeholder="1,200 laptop" aria-label="Purchase amount"/><button type="submit">Preview <span>→</span></button></form><div className="quick-picks"><span>Try</span><button onClick={() => {setPurchaseInput('250');setPurchase(250)}}>$250 weekend trip</button><button onClick={() => {setPurchaseInput('1,200');setPurchase(1200)}}>$1,200 laptop</button>{purchase>0&&<button onClick={() => {setPurchase(0);setPurchaseInput('')}}>Clear</button>}</div><div className="impact-box"><div className="impact-heading"><span className="impact-dot"/> LIVE SCENARIO</div><div className="impact-row"><span>Purchase impact</span><b>−{money(purchase)}</b></div><div className="impact-row"><span>Projected lowest balance</span><b className={lowestBalance<1200?'coral-text':''}>{money(lowestBalance)}</b></div><div className="impact-message"><ShieldCheck size={14}/>{lowestBalance>=1200?'Your $1,200 reserve remains protected.':'This scenario dips into the protected reserve.'}</div></div><div className="ai-footnote"><Activity size={13}/> Forecast recalculates instantly · sample data only</div></section>
        <section className="panel subscriptions-panel"><div className="section-title"><div className="section-icon coral-icon"><CreditCard size={18}/></div><div><div className="eyebrow">RECURRING EXPENSES</div><h2>Small charges, in view.</h2></div></div><div className="subscription-total"><span>Monthly total</span><b>{money(recurringTotal,2)}<small>/mo</small></b></div><div className="subscription-list">{subscriptions.map(item => {const isCancelled=cancelled.includes(item.name);return <div className={isCancelled?'subscription canceled':'subscription'} key={item.name}><div className="service-icon" style={{'--service':item.color}}>{item.icon}</div><div className="service-name"><b>{item.name}</b><small>{isCancelled?'Cancellation simulated':item.detail}</small></div><div className="service-cost">{money(item.amount,2)}<small>/mo</small></div><button className={isCancelled?'toggle on':'toggle'} onClick={() => setCancelled(isCancelled?cancelled.filter(name=>name!==item.name):[...cancelled,item.name])} aria-label={`${isCancelled?'Restore':'Simulate cancellation'} ${item.name}`}><i/></button></div>})}</div><div className="nudge"><div className="nudge-spark"><Sparkles size={15}/></div><div><span className="nudge-label">PLAN INSIGHT</span><p>{cancelled.length ? `The simulation frees up ${money(subscriptions.filter(item=>cancelled.includes(item.name)).reduce((sum,item)=>sum+item.amount,0),2)} each month and updates every forecast.` : `Your recurring total is ${money(recurringTotal,2)} per month. Toggle a charge to test a cancellation—nothing changes outside this demo.`}</p></div></div></section>
      </div>
      <footer className="page-footer"><span><LockKeyhole size={13}/> Synthetic sample data · no bank connection</span><span>Calculations update as you explore</span><span className="footer-right">Built for clearer decisions</span></footer>
    </main>
    <div className="disclaimer"><span><ShieldCheck size={15}/> <b>Educational &amp; simulation tool only.</b> Velora never moves real funds and does not offer formal financial advice.</span></div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
