import React, { useState } from 'react';
import { BookOpenCheck, Check, ChevronRight, Sparkles, Star } from 'lucide-react';
import './kid-learning.css';

const lessons = [
  {
    id: 'money', category: 'Money basics', emoji: '🌱', title: 'Give every dollar a job',
    intro: 'A simple plan can make allowance feel less mysterious. Try splitting pretend money between things you want now, things you are saving for, and things you want to share.',
    points: ['Spend: enjoy something today.', 'Save: move toward a goal, a little at a time.', 'Invest: practice owning tiny pieces of many companies for the long run. Prices can go down, too.'],
    question: 'You get $10 of allowance and want a game that costs $20. What helps most?', choices: ['Spend it all on snacks', 'Save some each time until you reach your goal', 'Borrow lots of pretend money'], answer: 1,
  },
  {
    id: 'stocks', category: 'Stocks & investing', emoji: '🏢', title: 'What is a stock?',
    intro: 'A stock is a tiny share of a company. If the company does well, people may want its shares more. If it struggles, the price can fall. There is no guaranteed outcome.',
    points: ['A share is a small piece of ownership.', 'An ETF is like a basket holding pieces of many companies.', 'Spreading practice investments across a basket can mean less reliance on one company.'],
    question: 'Which is the basket that can hold many investments?', choices: ['A single stock', 'An ETF', 'A price chart'], answer: 1,
  },
  {
    id: 'candles', category: 'Candlestick charts', emoji: '🕯️', title: 'Read one candle',
    intro: 'A candle summarizes how a price moved during one time period, like one day. The thick middle is the open-to-close range; thin lines show the highest and lowest prices.',
    points: ['Open: price at the start.', 'Close: price at the end.', 'High and low: the top and bottom reached during that time.', 'Green means the close was higher than the open; red means it was lower.'],
    question: 'A candle opens at $10 and closes at $12. Which colour is it usually?', choices: ['Green', 'Red', 'Blue'], answer: 0,
  },
  {
    id: 'patterns', category: 'Candlestick patterns', emoji: '🔎', title: 'Patterns are clues, not promises',
    intro: 'Traders sometimes give candle shapes names. They are ways to describe what happened, not magic signals about what happens next.',
    points: ['Doji: open and close are very close; the price ended near where it began.', 'Hammer: a small body with a long lower wick; it shows price fell and then bounced during that period.', 'Engulfing: one candle body is much larger than the one before it.', 'None can predict the future. One chart shape is never a guarantee.'],
    question: 'What does a candlestick pattern tell you for sure?', choices: ['Exactly what price will do tomorrow', 'A clue about what happened, not a promise about tomorrow', 'That investing cannot lose money'], answer: 1,
  },
];

function Candle({ kind, label, color }) {
  const geometry = kind === 'doji' ? { wickTop: 10, bodyTop: 43, bodyHeight: 5, wickBottom: 81 } : kind === 'hammer' ? { wickTop: 14, bodyTop: 29, bodyHeight: 14, wickBottom: 82 } : { wickTop: 9, bodyTop: 28, bodyHeight: 33, wickBottom: 78 };
  return <div className="kid-candle-example"><svg viewBox="0 0 44 94" role="img" aria-label={`${label} candle`}><line x1="22" x2="22" y1={geometry.wickTop} y2={geometry.wickBottom} stroke={color} strokeWidth="3"/><rect x="12" y={geometry.bodyTop} width="20" height={geometry.bodyHeight} rx="3" fill={color}/></svg><b>{label}</b></div>;
}

export default function KidLearning() {
  const [selected, setSelected] = useState(lessons[0].id);
  const [answers, setAnswers] = useState({});
  const lesson = lessons.find(item => item.id === selected) || lessons[0];
  const complete = Object.keys(answers).length;
  return <main className="kid-learn-page">
    <section className="kid-learn-hero"><div className="kid-learn-orbit">✨</div><div><span className="kid-learn-kicker"><BookOpenCheck size={14}/> VELORA MONEY CLUB</span><h2>Little lessons, <em>big ideas.</em></h2><p>Explore money, investing, and chart clues at your own pace. Practice with pretend money and ask a grown-up if you have questions.</p><div className="kid-learn-progress"><span><Star size={15} fill="currentColor"/> {complete} of {lessons.length} lessons tried</span><i><b style={{ width: `${complete / lessons.length * 100}%` }}/></i></div></div></section>
    <div className="kid-learn-layout"><nav className="kid-lesson-list" aria-label="Money lessons">{lessons.map((item, index) => <button key={item.id} className={`kid-lesson-tab ${selected === item.id ? 'active' : ''}`} onClick={() => setSelected(item.id)}><span className="kid-lesson-number">{answers[item.id] ? <Check size={15}/> : index + 1}</span><span className="kid-lesson-tab-copy"><small>{item.category}</small><b>{item.title}</b></span><ChevronRight size={17}/></button>)}</nav>
      <article className="kid-lesson-card"><div className="kid-lesson-heading"><span className="kid-lesson-emoji">{lesson.emoji}</span><div><small>{lesson.category} · 2 MIN</small><h3>{lesson.title}</h3></div><Sparkles size={19}/></div><p className="kid-lesson-intro">{lesson.intro}</p>
        {lesson.id === 'patterns' && <div className="kid-candle-gallery"><Candle kind="doji" label="Doji" color="#c39b48"/><Candle kind="hammer" label="Hammer" color="#168b65"/><Candle kind="engulfing" label="Engulfing" color="#e27464"/></div>}
        <ul className="kid-lesson-points">{lesson.points.map(point => <li key={point}><span>✦</span>{point}</li>)}</ul>
        {lesson.id === 'candles' && <div className="kid-candle-anatomy"><Candle kind="hammer" label="One day" color="#168b65"/><span><b>Top wick</b> = high of the day<br/><b>Top of body</b> = open<br/><b>Bottom of body</b> = close<br/><b>Bottom wick</b> = low of the day</span></div>}
        <div className="kid-quiz"><div className="kid-quiz-label">QUICK CHECK <span>⭐</span></div><h4>{lesson.question}</h4><div className="kid-quiz-choices">{lesson.choices.map((choice, index) => <button key={choice} className={answers[lesson.id] === index ? (index === lesson.answer ? 'correct' : 'incorrect') : ''} onClick={() => setAnswers(current => ({ ...current, [lesson.id]: index }))} aria-pressed={answers[lesson.id] === index}>{choice}{answers[lesson.id] === index && <span>{index === lesson.answer ? 'Nice work! 🎉' : 'Try another answer'}</span>}</button>)}</div></div>
        <p className="kid-learning-note">Practice only: prices can rise or fall. Candle shapes and lessons cannot tell you what a stock will do next. An adult should help with any real money decisions.</p>
      </article></div>
  </main>;
}
