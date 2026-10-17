import React, { useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Check, CircleHelp, Coins, Heart, LockKeyhole, PartyPopper, PiggyBank, Sparkles, Star, TrendingUp, Wallet, X } from 'lucide-react';
import { addKidAllowance, growKidInvestmentOneMonth, requestKidInvestment, resolveKidInvestment, verifyGuardianPin } from './kidMoney.js';
import './kid-experience.css';

const money = value => `$${new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const dateLabel = value => new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

export default function KidExperience({ page, name, state, setState, guardian, onNavigate }) {
  const [investRequest, setInvestRequest] = useState('');
  const [parentModal, setParentModal] = useState(null);
  const [parentPin, setParentPin] = useState('');
  const [allowanceDraft, setAllowanceDraft] = useState(String(state.weeklyAllowance || 10));
  const [parentError, setParentError] = useState('');
  const pending = state.requests.filter(request => request.status === 'pending');
  const progress = Math.min(100, Math.round((state.allowanceBalance + state.investmentValue) / Math.max(1, state.goalTarget) * 100));
  const historyLine = useMemo(() => {
    const rows = state.investmentHistory.slice(-12);
    const values = rows.map(row => row.value);
    const min = Math.min(0, ...values), max = Math.max(1, ...values);
    return rows.map((row, index) => `${index / Math.max(1, rows.length - 1) * 360},${86 - (row.value - min) / Math.max(1, max - min) * 72}`).join(' ');
  }, [state.investmentHistory]);

  function update(action) { setState(current => action(current)); }
  async function parentResolve(event) {
    event.preventDefault(); setParentError('');
    if (!await verifyGuardianPin(parentPin, guardian)) { setParentError('That parent code did not match. Ask your parent or guardian to try again.'); return; }
    if (parentModal?.type === 'allowance') {
      const amount = Number(allowanceDraft);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) { setParentError('Choose an allowance between $0.01 and $1,000.'); return; }
      update(current => addKidAllowance(current, amount));
      setParentModal(null); setParentPin('');
      return;
    }
    if (parentModal?.type === 'investment') {
      const request = state.requests.find(item => item.id === parentModal.requestId);
      if (request?.amount > state.allowanceBalance) { setParentError('There is not enough allowance left for this request.'); return; }
      update(current => resolveKidInvestment(current, parentModal.requestId, true));
      setParentModal(null); setParentPin('');
    }
  }

  function declineRequest(requestId) {
    setParentModal(null); setParentPin(''); setParentError('');
    update(current => resolveKidInvestment(current, requestId, false));
  }

  return <div className="kid-experience">
    {page === 'KidHome' && <>
      <section className="kid-welcome-card"><div className="kid-welcome-copy"><span className="kid-eyebrow"><Sparkles size={14}/> YOUR MONEY QUEST</span><h2>Hey, {name || 'money explorer'}! <span>✨</span></h2><p>Every little choice helps your money skills grow.</p><div className="kid-level"><span><Star size={14} fill="currentColor"/> Level 1 · Money Explorer</span><div><i style={{ width: '35%' }}/></div><small>3 of 10 stars to your next badge</small></div></div><div className="kid-mascot" aria-hidden="true"><span>🌱</span><i>✨</i><b>!</b></div></section>
      <section className="kid-money-cards"><article className="kid-money-card allowance"><span><Wallet size={17}/> MY ALLOWANCE</span><b>{money(state.allowanceBalance)}</b><small>Ready for saving or spending</small><button onClick={() => onNavigate('KidAllowance')}>See my allowance <ArrowRight size={14}/></button></article><article className="kid-money-card investing"><span><TrendingUp size={17}/> GROWING JAR</span><b>{money(state.investmentValue)}</b><small>{money(state.investedPrincipal)} added with parent approval</small><button onClick={() => onNavigate('KidInvest')}>Visit my investing jar <ArrowRight size={14}/></button></article></section>
      <section className="kid-goal-card"><div className="kid-section-title"><span className="kid-sticker"><Heart size={16} fill="currentColor"/></span><div><b>My big little goal</b><small>Small steps add up!</small></div><span className="kid-goal-pill">{progress}% there</span></div><div className="kid-goal-name">{state.goalName || 'Something fun'}</div><div className="kid-goal-progress"><i style={{ width: `${progress}%` }}/></div><div className="kid-goal-caption"><span>{money(state.allowanceBalance + state.investmentValue)} saved</span><b>{money(state.goalTarget)} goal</b></div></section>
      <section className="kid-tip-card"><span className="kid-tip-icon"><PartyPopper size={19}/></span><div><b>Money tip of the day</b><p>Try saving a little before you spend. Even one dollar is a great start!</p></div><span className="kid-sticker-star">⭐</span></section>
    </>}

    {page === 'KidAllowance' && <>
      <section className="kid-page-intro"><span className="kid-eyebrow"><Coins size={15}/> MY ALLOWANCE</span><h2>Look at you, saving! 🎉</h2><p>Your allowance is practice money. A parent or guardian adds it for you.</p></section>
      <section className="kid-allowance-balance"><span className="kid-round-icon"><Wallet size={22}/></span><div><small>READY TO SAVE OR SPEND</small><b>{money(state.allowanceBalance)}</b></div><span className="kid-confetti">✦</span></section>
      <section className="kid-parent-panel"><div><span className="kid-parent-lock"><LockKeyhole size={15}/></span><div><b>Grown-up corner</b><small>Parents set your weekly allowance here.</small></div></div><button onClick={() => { setParentModal({ type: 'allowance' }); setParentPin(''); setParentError(''); }}>Parent controls</button></section>
      <section className="kid-activity-card"><div className="kid-section-title"><span className="kid-sticker"><Sparkles size={16}/></span><div><b>Allowance activity</b><small>Your money coming in</small></div></div>{state.allowanceHistory.length ? state.allowanceHistory.slice(0, 8).map(item => <div className="kid-transaction" key={item.id}><span className="kid-transaction-icon"><Coins size={15}/></span><div><b>{item.label}</b><small>{dateLabel(item.date)}</small></div><strong>+{money(item.amount)}</strong></div>) : <div className="kid-empty"><span>🪙</span><b>Your first allowance is on its way!</b><small>Ask a parent or guardian to add your weekly allowance.</small></div>}</section>
    </>}

    {page === 'KidInvest' && <>
      <section className="kid-page-intro"><span className="kid-eyebrow"><TrendingUp size={15}/> MY INVESTING JAR</span><h2>Give your money room to grow 🌿</h2><p>Pick some allowance to invest. A parent or guardian checks every request first.</p></section>
      <section className="kid-invest-value"><div><small>SIMULATED INVESTMENT VALUE</small><b>{money(state.investmentValue)}</b><span>Added with parent approval · may go up or down</span></div><div className="kid-invest-chart"><svg viewBox="0 0 360 94" role="img" aria-label="Simulated investment value over time"><polyline points={historyLine || '0,86 360,86'}/></svg></div><div className="kid-invest-stats"><span>Allowance invested <b>{money(state.investedPrincipal)}</b></span><span>Practice months <b>{state.investmentMonths}</b></span></div><button className="kid-grow-button" onClick={() => update(growKidInvestmentOneMonth)} disabled={state.investmentValue <= 0}><Sparkles size={15}/> Skip ahead one month</button><small className="kid-simulation-note">One simulated month. Returns are made up for learning and are not a forecast.</small></section>
      <section className="kid-request-card"><div className="kid-section-title"><span className="kid-sticker"><PiggyBank size={17}/></span><div><b>Move allowance to my growing jar</b><small>Your grown-up approves before anything moves.</small></div></div><form onSubmit={event => { event.preventDefault(); const amount = Number(investRequest); if (!amount || amount > state.allowanceBalance) return; update(current => requestKidInvestment(current, amount)); setInvestRequest(''); }}><span>$</span><input type="number" min="0.01" max={state.allowanceBalance} step="0.01" value={investRequest} onChange={event => setInvestRequest(event.target.value)} placeholder="How much?" aria-label="Amount to ask to invest"/><button disabled={!investRequest || Number(investRequest) > state.allowanceBalance}>Ask my grown-up <ArrowRight size={14}/></button></form><div className="kid-available">You have {money(state.allowanceBalance)} in your allowance jar.</div></section>
      {pending.length > 0 && <section className="kid-activity-card"><div className="kid-section-title"><span className="kid-sticker"><CircleHelp size={16}/></span><div><b>Waiting for a grown-up</b><small>They can approve in Parent controls</small></div></div>{pending.map(request => <div className="kid-transaction" key={request.id}><span className="kid-transaction-icon"><LockKeyhole size={14}/></span><div><b>Investing jar request</b><small>{dateLabel(request.date)} · waiting for approval</small></div><strong>{money(request.amount)}</strong></div>)}</section>}
      {state.investments.length > 0 && <section className="kid-activity-card"><div className="kid-section-title"><span className="kid-sticker"><BadgeCheck size={16}/></span><div><b>My approved contributions</b><small>Grown-up approved</small></div></div>{state.investments.slice(0, 8).map(item => <div className="kid-transaction" key={item.id}><span className="kid-transaction-icon approved"><Check size={14}/></span><div><b>Added to growing jar</b><small>{dateLabel(item.date)}</small></div><strong>{money(item.amount)}</strong></div>)}</section>}
    </>}

    {parentModal && <div className="kid-modal-backdrop" role="presentation"><form className="kid-parent-modal" onSubmit={parentResolve} role="dialog" aria-modal="true" aria-labelledby="kid-parent-title"><button type="button" className="kid-modal-close" onClick={() => setParentModal(null)} aria-label="Close"><X size={18}/></button><span className="kid-modal-badge"><LockKeyhole size={18}/></span><span className="kid-eyebrow">PARENT OR GUARDIAN</span><h2 id="kid-parent-title">Grown-up approval</h2><p>{parentModal.type === 'allowance' ? 'Confirm your child’s weekly allowance. This adds simulated practice money to their allowance jar.' : `Approve moving ${money(state.requests.find(item => item.id === parentModal.requestId)?.amount || 0)} from allowance to the simulated investing jar?`}</p>{parentModal.type === 'allowance' && <label className="kid-parent-input">Weekly allowance amount<input autoFocus type="number" min="0.01" max="1000" step="0.01" value={allowanceDraft} onChange={event => setAllowanceDraft(event.target.value)}/></label>}<label className="kid-parent-input">Parent approval code<input autoFocus={parentModal.type !== 'allowance'} inputMode="numeric" type="password" pattern="[0-9]{4}" maxLength="4" value={parentPin} onChange={event => setParentPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digits" required/></label>{parentError && <div className="kid-parent-error" role="alert">{parentError}</div>}<button className="kid-parent-confirm" type="submit">{parentModal.type === 'allowance' ? 'Add weekly allowance' : 'Approve investment'}</button>{parentModal.type === 'investment' && <button className="kid-parent-decline" type="button" onClick={() => declineRequest(parentModal.requestId)}>Decline request</button>}<small>Simulated money only. Approval code is stored on this device.</small></form></div>}
  </div>;
}
