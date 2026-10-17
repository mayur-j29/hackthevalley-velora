import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CircleHelp, Sparkles, Wallet } from 'lucide-react';
import './what-if.css';

const money = value => `$${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(value) || 0)}`;

export default function WhatIfCoach({ persona = 'Adult', cash = 0, income = 0, bills = 0, safeSurplus = 0, projectedLow = 0, reserve = 0 }) {
  const [goal, setGoal] = useState('');
  const [cost, setCost] = useState('');
  const [monthlySaving, setMonthlySaving] = useState('');
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const amount = Math.max(0, Number(cost) || 0);
  const monthly = Math.max(0, Number(monthlySaving) || 0);
  const remainingCash = cash - amount;
  const remainingSafe = safeSurplus - amount;
  const projectedAfter = projectedLow - amount;
  const monthsToGoal = amount <= Math.max(0, cash) ? 0 : monthly > 0 ? Math.ceil((amount - Math.max(0, cash)) / monthly) : null;
  const personaCopy = persona === 'Kid'
    ? 'Try out a goal and see what it could mean for your money. The coach can help you think of safe ways to save or earn with a grown-up.'
    : persona === 'Teen'
      ? 'Model a planned purchase against your current balance and upcoming commitments, then ask the coach for practical ways to reach the goal.'
      : 'Model a purchase against your cash-flow forecast and ask the coach for practical options.';
  const statistics = useMemo(() => [
    { label: 'Cash after buying', value: money(remainingCash), note: remainingCash < 0 ? 'You would need more money first.' : 'Based on the balance in this account.' },
    { label: 'Left after planned costs', value: money(remainingSafe), note: 'Forecast cushion after bills and this purchase.' },
    { label: 'Lowest forecast balance', value: money(projectedAfter), note: '30-day low if the full cost is added today.' },
  ], [remainingCash, remainingSafe, projectedAfter]);

  async function askCoach(event) {
    event.preventDefault();
    const cleanGoal = goal.trim().slice(0, 80);
    if (!cleanGoal || amount <= 0) {
      setError('Add what you are saving for and its cost.');
      return;
    }
    setError('');
    setCoach(null);
    setLoading(true);
    const scenario = { goal: cleanGoal, cost: amount, cash, income, bills, safeSurplus, projectedLow, reserve, monthlySaving: monthly };
    const question = `Help me think through buying ${cleanGoal} for ${money(amount)}. I can save or earn about ${money(monthly)} per month. Explain the numbers and give practical ways to reach the goal.`;
    try {
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, persona, whatIf: scenario }),
      });
      const result = await response.json();
      if (!response.ok || !result.answer) throw new Error(result.error || 'The coach is temporarily unavailable.');
      setCoach({ text: result.answer, source: 'Gemini coach' });
    } catch {
      const timing = monthsToGoal === null ? 'Add a monthly saving amount to estimate how long the goal could take.' : monthsToGoal === 0 ? 'Your entered balance already covers this goal.' : `Saving ${money(monthly)} per month could reach this goal in about ${monthsToGoal} month${monthsToGoal === 1 ? '' : 's'}.`;
      const ageNote = persona === 'Kid' ? ' Ask a parent or guardian to help choose safe chores or ways to earn.' : persona === 'Teen' ? ' Consider a small savings target from regular income or an agreed extra job.' : ' You could adjust the timing, lower the budget, or set aside a monthly amount.';
      setCoach({ text: `${timing}${ageNote} The forecast suggests ${remainingSafe >= 0 ? `${money(remainingSafe)} would remain after planned costs` : `this would put the plan ${money(Math.abs(remainingSafe))} below its current cushion`}.`, source: 'Velora coach' });
    } finally {
      setLoading(false);
    }
  }

  return <section className="what-if-panel panel" aria-labelledby="what-if-title">
    <div className="what-if-heading"><span className="what-if-icon"><Sparkles size={18}/></span><div><div className="eyebrow">WHAT IF? · {persona.toUpperCase()} COACH</div><h2 id="what-if-title">Try a goal before you spend.</h2><p>{personaCopy}</p></div></div>
    <div className="what-if-layout">
      <form className="what-if-form" onSubmit={askCoach}>
        <label><span>{persona === 'Kid' ? 'WHAT ARE YOU SAVING FOR?' : 'GOAL OR PURCHASE'}</span><input value={goal} onChange={event => setGoal(event.target.value)} maxLength={80} placeholder={persona === 'Kid' ? 'A violin, a bike, art supplies…' : 'A laptop, a course, a trip…'} required/></label>
        <label><span>ESTIMATED COST</span><div className="what-if-input"><b>$</b><input type="number" min="0.01" step="0.01" value={cost} onChange={event => setCost(event.target.value)} placeholder="0.00" required/></div></label>
        <details className="what-if-optional"><summary>{persona === 'Kid' ? 'Add monthly savings (optional)' : 'Add a monthly savings estimate (optional)'}</summary><label><span>{persona === 'Kid' ? 'HOW MUCH COULD YOU SAVE OR EARN EACH MONTH?' : 'MONTHLY SAVINGS AMOUNT'}</span><div className="what-if-input"><b>$</b><input type="number" min="0" step="1" value={monthlySaving} onChange={event => setMonthlySaving(event.target.value)} placeholder="0"/></div></label></details>
        <button type="submit" className="what-if-submit" disabled={loading}>{loading ? 'Thinking…' : <>Ask the coach <ArrowUpRight size={15}/></>}</button>
        {error && <p className="what-if-error" role="alert">{error}</p>}
      </form>
      <div className="what-if-results">
        <div className="what-if-stats">{statistics.map(stat => <article key={stat.label}><span>{stat.label}</span><b>{stat.value}</b><small>{stat.note}</small></article>)}</div>
        <div className="what-if-timeline"><Wallet size={16}/><span>{monthsToGoal === null ? 'Add a monthly savings amount to see a goal timeline.' : monthsToGoal === 0 ? 'Your current account balance covers this goal.' : `At ${money(monthly)} per month, your goal could take about ${monthsToGoal} month${monthsToGoal === 1 ? '' : 's'}.`}</span></div>
        {coach ? <div className="what-if-coach" aria-live="polite"><div><Sparkles size={15}/><b>{coach.source}</b><span>{persona === 'Kid' ? 'A kind idea' : 'Planning suggestions'}</span></div><p>{coach.text}</p></div> : <div className="what-if-empty"><CircleHelp size={17}/><span>Enter a goal to see its account impact and get personalized suggestions.</span></div>}
        <small className="what-if-note">Coach suggestions do not change your account.</small>
      </div>
    </div>
  </section>;
}
