import React from 'react';
import { ArrowRight, BookOpenCheck, CircleHelp, Compass, Lightbulb, Sparkles, Target, Wallet } from 'lucide-react';
import './student-experience.css';

const money = value => `$${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;

export default function StudentExperience({ name, cash, safeSurplus, onNavigate }) {
  return <div className="student-experience">
    <section className="student-welcome"><span className="student-eyebrow"><Sparkles size={15}/> YOUR MONEY, YOUR NEXT STEP</span><h2>Hey{name ? `, ${name}` : ''}. You’ve got this.</h2><p>A simple place to practice with goals, savings, and pretend investing.</p></section>
    <section className="student-summary"><article><span><Wallet size={16}/> PRACTICE CASH</span><b>{money(cash)}</b><small>Simulated balance</small></article><article><span><Target size={16}/> ROOM TO PLAN</span><b>{money(safeSurplus)}</b><small>After your planned buffer</small></article></section>
    <section className="student-next-step"><span className="student-step-icon"><Lightbulb size={20}/></span><div><span className="student-eyebrow">A GOOD NEXT STEP</span><h3>Give your money a job.</h3><p>Choose one goal to save for, keep a little cash handy, and learn how a small simulated investment can change over time.</p><button onClick={() => onNavigate('WhatIf')}>Get advice <ArrowRight size={15}/></button></div></section>
    <section className="student-shortcuts"><button onClick={() => onNavigate('Portfolio')}><span><BookOpenCheck size={18}/></span><b>Practice investing</b><small>Explore a small paper portfolio</small><ArrowRight size={15}/></button><button onClick={() => onNavigate('WhatIf')}><span><CircleHelp size={18}/></span><b>Ask Velora</b><small>Get help with a goal or choice</small><ArrowRight size={15}/></button><button onClick={() => onNavigate('WhatIf')}><span><Compass size={18}/></span><b>Make a plan</b><small>Try a savings goal or purchase</small><ArrowRight size={15}/></button></section>
    <p className="student-note">Practice only. No real money or bank account is connected.</p>
  </div>;
}
