import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleDollarSign, Landmark, Plus, Trash2 } from 'lucide-react';
import { calculateDebtPayoff } from './finance';
import './planning.css';

const money = (value, digits = 0) => `$${new Intl.NumberFormat('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`;

export function CashCalendar({ forecast, onAddEvent, onRemoveEvent }) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('1');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('bill');
  const entries = forecast.flatMap(point => point.events.map(event => ({ ...event, date: point.date, day: point.day }))).filter(event => event.day > 0).sort((a, b) => a.day - b.day).slice(0, 12);

  function submit(event) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || !Number.isFinite(value) || value <= 0) return;
    onAddEvent({
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim().slice(0, 48),
      day: Math.max(1, Math.min(30, Math.floor(Number(day) || 1))),
      amount: kind === 'income' ? value : -value,
      kind,
      userAdded: true,
    });
    setTitle('');
    setAmount('');
  }

  return <section className="panel planning-panel calendar-panel" aria-labelledby="calendar-title">
    <div className="section-title"><div className="section-icon blue-icon"><CalendarDays size={18}/></div><div><div className="eyebrow">PAYMENT CALENDAR</div><h2 id="calendar-title">Your next month, itemized.</h2></div><span className="calendar-count">{entries.length} UPCOMING</span></div>
    <p className="section-description">Add a bill or payday to see its effect flow straight into your cash forecast.</p>
    <div className="calendar-list">{entries.map((event, index) => <div className="calendar-entry" key={event.id || `${event.title}-${event.day}-${index}`}><span className={`calendar-entry-icon ${event.amount > 0 ? 'income' : 'bill'}`}>{event.amount > 0 ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>}</span><span className="calendar-entry-date"><b>{event.date.toLocaleDateString('en-CA', { day: '2-digit' })}</b><small>{event.date.toLocaleDateString('en-CA', { month: 'short' }).toUpperCase()}</small></span><span className="calendar-entry-name"><b>{event.title}</b><small>{event.userAdded ? 'Added to this plan' : event.subscription ? 'Recurring expense' : event.kind === 'income' ? 'Expected income' : 'Scheduled bill'}</small></span><b className={`calendar-entry-amount ${event.amount > 0 ? 'income' : ''}`}>{event.amount > 0 ? '+' : '−'}{money(Math.abs(event.amount), 2)}</b>{event.userAdded && <button className="calendar-remove" onClick={() => onRemoveEvent(event.id)} aria-label={`Remove ${event.title}`}><Trash2 size={13}/></button>}</div>)}{entries.length === 0 && <p className="calendar-empty">Nothing scheduled yet. Add an item below.</p>}</div>
    <form className="calendar-add-form" onSubmit={submit}><label><span>DESCRIPTION</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={48} placeholder="e.g. Tuition payment" required/></label><label><span>DAY</span><input type="number" value={day} min="1" max="30" onChange={event => setDay(event.target.value)} required/></label><label><span>TYPE</span><div className="select-wrap"><select value={kind} onChange={event => setKind(event.target.value)}><option value="bill">Bill</option><option value="income">Income</option></select><ChevronDown size={14}/></div></label><label><span>AMOUNT</span><div className="amount-input"><b>$</b><input type="number" value={amount} min="0.01" step="0.01" onChange={event => setAmount(event.target.value)} placeholder="0.00" required/></div></label><button className="calendar-add-button" type="submit"><Plus size={15}/> Add to forecast</button></form>
    <div className="calendar-note"><Check size={13}/> Sample schedule · no account transactions are changed.</div>
  </section>;
}

export const sampleDebtPayments = { card: 0, student: 0, mortgage: 0 };

const sampleDebts = [
  { id: 'card', name: 'Credit card', balance: 0, apr: 0, payment: 0 },
  { id: 'student', name: 'Student loan', balance: 0, apr: 0, payment: 0 },
  { id: 'mortgage', name: 'Mortgage', balance: 0, apr: 0, payment: 0 },
];

function avalanche(debts, extraPayment) {
  const active = debts.map(debt => ({ ...debt, remaining: Number(debt.balance), totalInterest: 0, firstInterest: 0 }));
  if (active.some(debt => !Number.isFinite(debt.remaining) || debt.remaining < 0 || !Number.isFinite(Number(debt.apr)) || Number(debt.apr) < 0 || !Number.isFinite(Number(debt.payment)) || (debt.remaining > 0 && Number(debt.payment) <= 0))) return null;
  let month = 0;
  while (active.some(debt => debt.remaining > 0) && month < 1200) {
    month += 1;
    let extra = Number(extraPayment);
    if (!Number.isFinite(extra) || extra < 0) return null;
    for (const debt of active) {
      if (debt.remaining <= 0) continue;
      const interest = debt.remaining * Number(debt.apr) / 1200;
      if (month === 1) debt.firstInterest = interest;
      debt.totalInterest += interest;
      debt.remaining += interest;
      const required = Math.min(debt.remaining, Number(debt.payment));
      if (required < interest && debt.payment <= interest) return null;
      debt.remaining -= required;
      extra += Number(debt.payment) - required;
    }
    const priority = [...active].filter(debt => debt.remaining > 0).sort((a, b) => Number(b.apr) - Number(a.apr));
    for (const debt of priority) {
      if (extra <= 0) break;
      const applied = Math.min(debt.remaining, extra);
      debt.remaining -= applied;
      extra -= applied;
    }
  }
  if (month >= 1200 && active.some(debt => debt.remaining > 0)) return null;
  return { months: month, totalInterest: active.reduce((sum, debt) => sum + debt.totalInterest, 0), monthlyInterest: active.reduce((sum, debt) => sum + debt.firstInterest, 0) };
}

export function DebtPlanner({ onPaymentChange, initialPayments = sampleDebtPayments }) {
  const [debts, setDebts] = useState(() => sampleDebts.map(debt => ({ ...debt, payment: Number(initialPayments[debt.id] ?? debt.payment) })));
  const [extra, setExtra] = useState('100');
  const totals = useMemo(() => avalanche(debts, extra), [debts, extra]);
  const totalBalance = debts.reduce((sum, debt) => sum + (Number(debt.balance) || 0), 0);
  const monthlyMinimums = debts.reduce((sum, debt) => sum + (Number(debt.balance) > 0 ? Number(debt.payment) || 0 : 0), 0);
  const payoffByDebt = debts.map(debt => ({ ...debt, payoff: calculateDebtPayoff(debt) }));

  function updateDebt(id, key, value) {
    setDebts(current => current.map(debt => {
      if (debt.id !== id) return debt;
      const next = { ...debt, [key]: value };
      if (key === 'balance' && Number(value) > 0 && Number(debt.balance) === 0) {
        if (Number(debt.apr) === 0) next.apr = id === 'card' ? 21.99 : id === 'student' ? 5.5 : 4.15;
        if (Number(debt.payment) === 0) next.payment = id === 'card' ? 35 : id === 'student' ? 50 : 500;
      }
      return next;
    }));
    if (key === 'payment') onPaymentChange?.(id, value);
  }

  return <section className="panel planning-panel debt-panel" aria-labelledby="debt-title">
    <div className="section-title"><div className="section-icon coral-icon"><CircleDollarSign size={18}/></div><div><div className="eyebrow">DEBT &amp; INTEREST PLANNER</div><h2 id="debt-title">See what your balances cost over time.</h2></div><span className="debt-sample-label">EDITABLE SCENARIO</span></div>
    <p className="section-description">Edit the clearly labeled sample debts. The estimate applies fixed APRs monthly and sends extra payment to the highest-rate balance first.</p>
    <div className="debt-summary"><div><span>{totalBalance > 0 ? 'Recorded principal' : 'Debt balances'}</span><b>{money(totalBalance)}</b></div><div><span>First-month interest est.</span><b>{money(totals?.monthlyInterest ?? 0, 2)}</b></div><div><span>Debt-free estimate</span><b>{totalBalance === 0 ? 'No debt added' : totals ? `${Math.floor(totals.months / 12)}y ${totals.months % 12}m` : 'Check inputs'}</b></div></div>
    <div className="debt-table"><div className="debt-table-head"><span>ACCOUNT</span><span>BALANCE</span><span>APR</span><span>MONTHLY PAY</span><span>PAYOFF EST.</span></div>{payoffByDebt.map(debt => <div className="debt-row" key={debt.id}><div className="debt-row-name"><Landmark size={14}/><b>{debt.name}</b></div><label><span className="mobile-debt-label">BALANCE</span><div className="debt-input"><b>$</b><input type="number" min="0" step="100" value={debt.balance} onChange={event => updateDebt(debt.id, 'balance', event.target.value)} aria-label={`${debt.name} balance`}/></div></label><label><span className="mobile-debt-label">APR</span><div className="debt-input"><input type="number" min="0" max="99" step="0.01" value={debt.apr} onChange={event => updateDebt(debt.id, 'apr', event.target.value)} aria-label={`${debt.name} APR`}/><b>%</b></div></label><label><span className="mobile-debt-label">MONTHLY PAYMENT</span><div className="debt-input"><b>$</b><input type="number" min="1" step="10" value={debt.payment} onChange={event => updateDebt(debt.id, 'payment', event.target.value)} aria-label={`${debt.name} monthly payment`}/></div></label><b className="debt-payoff">{debt.payoff.valid ? `${Math.floor(debt.payoff.months / 12)}y ${debt.payoff.months % 12}m` : 'Payment too low'}</b></div>)}</div>
    <label className="extra-payment"><span>EXTRA MONTHLY PAYMENT</span><div className="amount-input"><b>$</b><input type="number" min="0" step="10" value={extra} onChange={event => setExtra(event.target.value)} aria-label="Extra debt payment per month"/></div><small>{money(monthlyMinimums, 0)} minimums + {money(Number(extra) || 0, 0)} extra allocated by highest APR first.</small></label>
    {totals && totalBalance === 0 ? <div className="debt-interest-note"><Check size={14}/><span>No debts entered. Add a balance to estimate payoff timing, interest, and a highest-rate-first extra-payment plan.</span></div> : totals ? <div className="debt-interest-note"><Check size={14}/><span>Estimated interest: <b>{money(totals.totalInterest)}</b> across your entered balances. Estimates exclude fees, rate changes, taxes, and lender-specific rules.</span></div> : <div className="debt-interest-note invalid"><Landmark size={14}/><span>At least one minimum payment doesn't cover its interest, or an input is invalid. Increase the payment or review the values.</span></div>}
  </section>;
}
