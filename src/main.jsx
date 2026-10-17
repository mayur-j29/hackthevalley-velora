import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, Clock3, CreditCard, Gem, Info, Landmark, LockKeyhole, Menu, MoreHorizontal, Plus, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import './styles.css';

const personas = ['Kid', 'Student', 'Adult'];
const initialSubscriptions = [
  { name: 'Netflix', detail: 'Entertainment · Oct 22', amount: 16.99, icon: 'N', color: '#e94e4e' },
  { name: 'GoodLife Fitness', detail: 'Wellness · Oct 24', amount: 39.99, icon: 'g', color: '#62a587' },
  { name: 'Spotify', detail: 'Music · Oct 27', amount: 12.99, icon: '◖', color: '#1f9c67' },
];
const scheduled = [
  { day: 2, title: 'Phone bill', amount: -68, type: 'bill' }, { day: 5, title: 'Spotify', amount: -13, type: 'bill' },
  { day: 8, title: 'Payday', amount: 2450, type: 'pay' }, { day: 12, title: 'Groceries', amount: -126, type: 'bill' },
  { day: 16, title: 'Internet', amount: -74, type: 'bill' }, { day: 20, title: 'GoodLife', amount: -40, type: 'bill' },
  { day: 22, title: 'Netflix', amount: -17, type: 'bill' }, { day: 23, title: 'Payday', amount: 2450, type: 'pay' },
  { day: 26, title: 'Rent', amount: -1850, type: 'bill' }, { day: 29, title: 'Car insurance', amount: -142, type: 'bill' },
];

function CashFlowChart({ purchase, cancelled, crash }) {
  const [hover, setHover] = useState(null);
  const days = useMemo(() => {
    let cash = 4820 - purchase;
    const flow = [];
    for (let day = 0; day <= 30; day++) {
      scheduled.filter(x => x.day === day).forEach(x => { if (!cancelled.includes(x.title)) cash += x.amount; });
      if (day === 0) cash = 4820 - purchase;
      const bump = crash ? (day > 3 ? Math.sin(day / 3) * 110 : 0) : 0;
      flow.push({ day, value: Math.round(cash + bump), event: scheduled.find(x => x.day === day && !cancelled.includes(x.title)) });
    }
    return flow;
  }, [purchase, cancelled, crash]);
  const min = Math.min(0, ...days.map(d => d.value)) - 250, max = Math.max(...days.map(d => d.value)) + 250;
  const x = d => 35 + (d / 30) * 735;
  const y = v => 172 - ((v - min) / (max - min)) * 145;
  const points = days.map(d => `${x(d.day)},${y(d.value)}`).join(' ');
  const zeroY = y(0);
  const hoverData = hover === null ? null : days[hover];
  return <div className="chart-wrap">
    <div className="chart-labels"><span>$6k</span><span>$4k</span><span>$2k</span><span>$0</span></div>
    <svg className="chart" viewBox="0 0 800 220" role="img" aria-label="Projected cash flow over the next 30 days">
      <defs><linearGradient id="surplus" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#317b5e" stopOpacity=".22"/><stop offset="100%" stopColor="#317b5e" stopOpacity="0"/></linearGradient><linearGradient id="risk" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#dc8271" stopOpacity="0"/><stop offset="100%" stopColor="#dc8271" stopOpacity=".16"/></linearGradient></defs>
      {[0, 1, 2, 3].map(i => <line key={i} x1="35" x2="770" y1={27 + i * 48} y2={27 + i * 48} className="grid-line" />)}
      <line x1="35" x2="770" y1={zeroY} y2={zeroY} className="zero-line" />
      {days.some(d => d.value < 0) && <path d={`M ${points.replaceAll(' ', ' L ')} L 770 ${zeroY} L 35 ${zeroY} Z`} fill="url(#risk)" />}
      <path d={`M 35 ${y(days[0].value)} ${days.map(d => `L ${x(d.day)} ${y(d.value)}`).join(' ')} L 770 ${zeroY} L 35 ${zeroY} Z`} fill="url(#surplus)" />
      <polyline points={points} className="chart-line" />
      {scheduled.filter(e => ['Payday', 'Rent'].includes(e.title)).map(e => <g key={e.title + e.day}><line x1={x(e.day)} x2={x(e.day)} y1="22" y2="184" className="event-line"/><circle cx={x(e.day)} cy={y(days[e.day].value)} r="4" className={e.title === 'Rent' ? 'event-dot rent' : 'event-dot'}/></g>)}
      {hoverData && <g><line x1={x(hoverData.day)} x2={x(hoverData.day)} y1="16" y2="185" className="hover-line"/><circle cx={x(hoverData.day)} cy={y(hoverData.value)} r="5" className="hover-dot"/></g>}
      {days.map((d, i) => <rect key={d.day} x={x(d.day) - 12} y="14" width="24" height="172" fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />)}
      <text x="35" y="211" className="axis-label">TODAY</text><text x="770" y="211" textAnchor="end" className="axis-label">NOV 16</text>
    </svg>
    {hoverData && <div className="chart-tooltip" style={{ left: `${Math.min(83, Math.max(4, (hoverData.day / 30) * 100))}%`, top: `${Math.max(0, y(hoverData.value) - 45)}px` }}><span>OCT {17 + hoverData.day}</span><b>${hoverData.value.toLocaleString()}</b>{hoverData.event && <small>{hoverData.event.title} · {hoverData.event.amount > 0 ? '+' : ''}${Math.abs(hoverData.event.amount).toLocaleString()}</small>}</div>}
    <div className="chart-legend"><span><i className="legend-dot green"/> Projected balance</span><span><i className="legend-dot coral"/> Shortfall risk</span><span><i className="legend-dash"/> Scheduled activity</span></div>
  </div>;
}

function App() {
  const [persona, setPersona] = useState('Adult');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [purchase, setPurchase] = useState(0);
  const [purchaseText, setPurchaseText] = useState('');
  const [subs, setSubs] = useState(initialSubscriptions);
  const [cancelled, setCancelled] = useState([]);
  const [rails, setRails] = useState(true);
  const [ticker, setTicker] = useState('S&P 500');
  const [amount, setAmount] = useState('500');
  const [trade, setTrade] = useState('');
  const [crash, setCrash] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const totalSubs = subs.filter(s => !cancelled.includes(s.name)).reduce((sum, s) => sum + s.amount, 0);
  const lowestBalance = Math.min(...[4820 - purchase, 4752 - purchase, 4739 - purchase, 7190 - purchase, 7064 - purchase, 6990 - purchase, 6950 - purchase, 6933 - purchase, 9383 - purchase, 7533 - purchase, 7391 - purchase]);
  const investable = Math.max(0, lowestBalance - 1200);
  const tradeAmount = Number(amount) || 0;
  const tradePass = !rails || tradeAmount <= investable;
  const displayName = persona === 'Kid' ? 'Your money is growing' : persona === 'Student' ? 'You’ve got this, Alex' : 'A clearer view of your money';
  const parsePurchase = () => {
    const parsed = Number(purchaseText.replace(/[^0-9.]/g, '')) || 1200;
    setPurchase(parsed);
  };
  const demo = () => setShowOnboarding(false);
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Velora home"><span className="brand-mark"><span/><span/><span/></span><span>velora</span></a>
      <nav className={mobileMenu ? 'persona-nav open' : 'persona-nav'} aria-label="Choose your view">{personas.map(p => <button key={p} className={persona === p ? 'persona active' : 'persona'} onClick={() => setPersona(p)}>{p}</button>)}</nav>
      <div className="top-actions"><span className="status"><i/> Read-only sandbox</span><span className="engine"><Sparkles size={13}/> Gemini ready</span><button className="icon-btn" aria-label="Notifications"><Bell size={18}/><i className="notification-dot"/></button><button className="avatar" aria-label="Account menu">A</button><button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu"><Menu size={19}/></button></div>
    </header>
    <main id="top" className="dashboard">
      <div className="welcome-row"><div><div className="eyebrow light-eyebrow"><span className="eyebrow-dash"/> YOUR FINANCIAL SNAPSHOT <span className="date-label">· OCTOBER 17</span></div><h1>{displayName}<span className="period">.</span></h1><p className="welcome-copy">Small steps today. More possibilities tomorrow.</p></div><button className="account-chip"><span className="bank-icon"><Landmark size={17}/></span><span><b>Everyday chequing</b><small>Connected securely</small></span><ChevronDown size={16}/></button></div>
      <section className="summary-grid" aria-label="Account overview">
        <article className="summary-card balance-card"><div className="card-topline"><span>Current balance</span><button className="subtle-icon" aria-label="Balance information"><CircleHelp size={16}/></button></div><div className="balance-amount">$4,820<span>.46</span></div><div className="balance-foot"><span className="up-label"><TrendingUp size={14}/> +$320.00</span><span>from last month</span></div><div className="balance-spark"><svg viewBox="0 0 140 42"><path d="M1 32 C18 26 18 33 33 25 S55 28 65 17 S84 23 98 12 S116 19 139 3" fill="none" stroke="#70b69a" strokeWidth="2"/></svg></div></article>
        <article className="summary-card"><div className="card-topline"><span>Income this month</span><span className="metric-icon income-icon"><ArrowDownLeft size={17}/></span></div><div className="metric-amount">$4,900<span>.00</span></div><div className="metric-foot"><span className="metric-note"><i className="small-green-dot"/> 2 paydays expected</span><span>Next · Oct 25</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>Upcoming bills</span><span className="metric-icon bill-icon"><ArrowUpRight size={17}/></span></div><div className="metric-amount">$2,416<span>.30</span></div><div className="metric-foot"><span className="metric-note">8 scheduled payments</span><span className="bill-alert"><Clock3 size={13}/> Next in 3 days</span></div></article>
        <article className="summary-card"><div className="card-topline"><span>Safe to explore</span><span className="metric-icon safe-icon"><ShieldCheck size={17}/></span></div><div className="metric-amount">${investable.toLocaleString()}<span>.00</span></div><div className="metric-foot"><span className="metric-note">After your essentials</span><button className="text-button" onClick={() => document.getElementById('simulator').scrollIntoView({behavior:'smooth'})}>See how <span>↗</span></button></div></article>
      </section>
      <section className="panel forecast-panel"><div className="panel-heading"><div><div className="eyebrow">30-DAY OUTLOOK <span className="live-pill"><i/> LIVE SIMULATION</span></div><h2>Your cash flow, ahead</h2><p>See your balance change as the month unfolds.</p></div><button className="range-select">Next 30 days <ChevronDown size={15}/></button></div><div className="chart-summary"><div><span>Projected balance</span><strong>${(4820 - purchase).toLocaleString()}<small>.46</small></strong></div><div className="projection-divider"/><div><span>Lowest point</span><strong className={lowestBalance < 0 ? 'coral-text' : ''}>${lowestBalance.toLocaleString()}<small>.00</small></strong></div><div className="forecast-tag"><Activity size={15}/><span>{lowestBalance < 0 ? 'Shortfall to watch' : 'Looking steady'}</span></div></div><CashFlowChart purchase={purchase} cancelled={cancelled} crash={!!crash}/>{crash && <div className="crash-note"><TrendingDown size={15}/><span>{crash} replay · Your simulated balance remains above $0 through the downturn.</span><button onClick={() => setCrash('')} aria-label="Dismiss replay"><X size={14}/></button></div>}</section>
      <div className="lower-grid">
        <section className="panel decision-panel" id="simulator"><div className="section-title"><div className="section-icon violet-icon"><Sparkles size={18}/></div><div><div className="eyebrow">PLAN AHEAD</div><h2>What if you…</h2></div><button className="more-btn" aria-label="More options"><MoreHorizontal size={19}/></button></div><p className="section-description">Try a decision before it becomes real.</p><label className="input-label" htmlFor="purchase-input">PURCHASE AMOUNT</label><div className="purchase-input"><span>$</span><input id="purchase-input" value={purchaseText} onChange={e => setPurchaseText(e.target.value)} onKeyDown={e => e.key === 'Enter' && parsePurchase()} placeholder="1,200 MacBook"/><button onClick={parsePurchase}>Preview <span>→</span></button></div><div className="quick-picks"><span>Try</span>{['$250 weekend trip', '$1,200 laptop'].map((t, i) => <button key={t} onClick={() => {setPurchaseText(i ? '$1,200 laptop' : '$250 weekend trip'); setPurchase(i ? 1200 : 250)}}>{t}</button>)}</div>{purchase > 0 ? <div className="impact-box"><div className="impact-heading"><span className="impact-dot"/> PREVIEW IMPACT <button onClick={() => {setPurchase(0);setPurchaseText('')}}>Clear</button></div><div className="impact-row"><span>Balance after purchase</span><b>${(4820.46 - purchase).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div><div className="impact-row"><span>30-day low point</span><b className={lowestBalance < 0 ? 'coral-text' : ''}>${lowestBalance.toLocaleString()}</b></div><div className="impact-message"><Info size={14}/> You’ll still have room for the essentials you’ve planned.</div></div> : <div className="decision-empty"><div className="empty-spark"><Sparkles size={19}/></div><span>Curious about a big purchase?</span><small>Enter an amount to see how it could fit.</small></div>}<div className="ai-footnote"><Sparkles size={13}/> Explanations by Gemini · calculations by Velora</div></section>
        <section className="panel subscriptions-panel"><div className="section-title"><div className="section-icon coral-icon"><CreditCard size={18}/></div><div><div className="eyebrow">RECURRING EXPENSES</div><h2>Subscriptions</h2></div><button className="manage-button">Manage <span>↗</span></button></div><div className="subscription-total"><span>Monthly total</span><b>${totalSubs.toFixed(2)}<small>/mo</small></b></div><div className="subscription-list">{subs.map(s => <div className={cancelled.includes(s.name) ? 'subscription canceled' : 'subscription'} key={s.name}><div className="service-icon" style={{'--service':s.color}}>{s.icon}</div><div className="service-name"><b>{s.name}</b><small>{cancelled.includes(s.name) ? 'Cancellation simulated' : s.detail}</small></div><div className="service-cost">${s.amount.toFixed(2)}<small>/mo</small></div><button className={cancelled.includes(s.name) ? 'toggle on' : 'toggle'} onClick={() => setCancelled(cancelled.includes(s.name) ? cancelled.filter(n => n !== s.name) : [...cancelled, s.name])} aria-label={`${cancelled.includes(s.name) ? 'Restore' : 'Simulate cancellation'} ${s.name}`}><i/></button></div>)}</div><div className="nudge"><div className="nudge-spark"><Sparkles size={15}/></div><div><span className="nudge-label">A LITTLE NUDGE <span>✦ GEMINI</span></span><p>{cancelled.length ? `Nice exploring. That’s $${subs.filter(s => cancelled.includes(s.name)).reduce((a,s)=>a+s.amount,0).toFixed(2)} back in your monthly plan.` : 'Your subscriptions add up to $69.97 a month. A quick review could free up room for something you love.'}</p></div></div></section>
        <section className="panel invest-panel"><div className="section-title"><div className="section-icon green-icon"><TrendingUp size={18}/></div><div><div className="eyebrow">SIMULATED INVESTING</div><h2>Explore investing</h2></div><span className="sim-only">SIM ONLY</span></div><div className="invest-intro"><div><span>Available safe surplus</span><b>${investable.toLocaleString()}<small>.00</small></b></div><div className="safe-label"><ShieldCheck size={14}/> Essentials protected</div></div><div className="trade-fields"><label><span>ASSET</span><div className="select-wrap"><select value={ticker} onChange={e => setTicker(e.target.value)}><option>S&P 500</option><option>AAPL</option><option>MSFT</option><option>TSLA</option></select><ChevronDown size={15}/></div></label><label><span>AMOUNT</span><div className="amount-input"><b>$</b><input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}/></div></label></div><button className="trade-button" onClick={() => setTrade(tradePass ? 'pass' : 'blocked')}><span>Preview simulated trade</span><ArrowUpRight size={16}/></button><div className={trade ? `rules-verdict ${trade === 'blocked' ? 'blocked' : 'passed'}` : 'rules-verdict'}><div className="verdict-icon">{trade ? trade === 'blocked' ? <X size={15}/> : <Check size={15}/>: <LockKeyhole size={15}/>}</div><div><b>{trade ? trade === 'blocked' ? 'BLOCKED BY RULES' : 'PASS · SIMULATION READY' : 'RULES ENGINE · STANDING BY'}</b><p>{trade ? trade === 'blocked' ? `A $${tradeAmount.toLocaleString()} ${ticker} order could put your planned essentials at risk. Try an amount under $${investable.toLocaleString()}.` : !rails ? 'Safety rails are off. This is an unguarded simulation and could overlap planned essentials.' : `A $${tradeAmount.toLocaleString()} ${ticker} simulation fits within your safe surplus.` : 'A deterministic check protects your upcoming obligations.'}</p></div></div><div className="rails-row"><div><b>Safety rails</b><small>{rails ? 'Rules engine is active' : 'Rules engine is paused'}</small></div><button className={rails ? 'toggle on' : 'toggle'} onClick={() => {setRails(!rails);setTrade('')}} aria-label="Toggle safety rails"><i/></button></div><div className="crash-row"><div><span className="crash-icon"><Activity size={15}/></span><span><b>Market history</b><small>How would your plan hold up?</small></span></div><button onClick={() => {setCrash(crash ? '' : '2008 crash');setTrade('')}}>{crash ? 'Replay off' : 'Replay a crash'} <ArrowUpRight size={14}/></button></div></section>
        <section className="panel activity-panel"><div className="section-title"><div className="section-icon blue-icon"><Clock3 size={18}/></div><div><div className="eyebrow">COMING UP</div><h2>Next in your plan</h2></div><button className="more-btn" aria-label="More activity"><MoreHorizontal size={19}/></button></div><div className="activity-list"><div className="activity-item"><div className="activity-date"><b>20</b><small>OCT</small></div><div className="activity-symbol pay"><ArrowDownLeft size={15}/></div><div className="activity-copy"><b>Payday</b><small>Direct deposit · Everyday chequing</small></div><strong className="positive">+$2,450.00</strong></div><div className="activity-item"><div className="activity-date"><b>22</b><small>OCT</small></div><div className="activity-symbol"><CreditCard size={15}/></div><div className="activity-copy"><b>Netflix</b><small>Subscription · Visa ending in 0428</small></div><strong>−$16.99</strong></div><div className="activity-item"><div className="activity-date"><b>25</b><small>OCT</small></div><div className="activity-symbol"><Landmark size={15}/></div><div className="activity-copy"><b>Rent</b><small>Housing · Everyday chequing</small></div><strong>−$1,850.00</strong></div><div className="activity-item"><div className="activity-date"><b>27</b><small>OCT</small></div><div className="activity-symbol pay"><ArrowDownLeft size={15}/></div><div className="activity-copy"><b>Payday</b><small>Direct deposit · Everyday chequing</small></div><strong className="positive">+$2,450.00</strong></div></div><button className="all-activity">View all activity <span>→</span></button></section>
      </div>
      <footer className="page-footer"><span><LockKeyhole size={13}/> Your data stays yours. Velora is read-only.</span><span>Last synced just now · Demo account</span><button onClick={() => setShowOnboarding(true)}>About this demo <Info size={13}/></button></footer>
    </main>
    <div className="disclaimer"><span><ShieldCheck size={15}/> <b>Educational & simulation tool only.</b> Velora never moves real funds and does not offer formal financial advice.</span><button aria-label="Learn more"><Info size={15}/></button></div>
    {showOnboarding && <div className="modal-backdrop"><div className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><button className="modal-close" onClick={demo} aria-label="Close"><X size={18}/></button><div className="modal-brand"><span className="brand-mark"><span/><span/><span/></span> velora</div><div className="modal-step">A LITTLE CONTEXT <span>01 / 01</span></div><h2 id="onboarding-title">Where are you<br/>on your money journey?</h2><p className="modal-copy">We’ll shape your dashboard around what matters to you.</p><div className="persona-options">{[{name:'Kid', icon:'✦', title:'Learning the basics', sub:'Allowance, goals & saving'}, {name:'Student', icon:'⌂', title:'Making it through school', sub:'Tuition, rent & real life'}, {name:'Adult', icon:'↗', title:'Building your bigger picture', sub:'Cash flow, plans & possibilities'}].map(o => <button key={o.name} onClick={() => setPersona(o.name)} className={persona === o.name ? 'persona-option chosen' : 'persona-option'}><span className="option-icon">{o.icon}</span><span><b>{o.title}</b><small>{o.sub}</small></span><span className="radio-mark">{persona === o.name && <i/>}</span></button>)}</div><button className="link-bank" onClick={demo}><Landmark size={17}/> Link a bank account <span>↗</span></button><div className="or-divider"><span/> or <span/></div><button className="demo-button" onClick={demo}>Explore with sample data <ArrowUpRight size={15}/></button><div className="modal-safe"><LockKeyhole size={13}/> Read-only sandbox · Nothing moves without you</div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
