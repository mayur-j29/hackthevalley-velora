import React, { useState } from 'react';
import { BookOpenCheck, Check, ChevronRight, Sparkles, Star } from 'lucide-react';
import './kid-learning.css';

const lessons = [
  {
    id: 'money', category: 'Money basics', emoji: '🌱', title: 'Give every dollar a job',
    intro: 'A simple plan can make allowance feel less mysterious. Split money between things you want now, things you are saving for, and things you want to share.',
    points: ['Spend: enjoy something today.', 'Save: move toward a goal, a little at a time.', 'Invest: own a tiny piece of a company. Its price can go down, too.'],
    questions: [
      { question: 'You get $10 and want a game that costs $20. What helps most?', emoji: '🎮', choices: ['Spend it all on snacks', 'Save some each time until you reach your goal', 'Give up on the game'], answer: 1, why: ['Snacks use the money before it can grow toward your game.', '', 'A goal can take time. Saving a little can help you reach it.'] },
      { question: 'You have $8. A book costs $5. How much is left after buying it?', emoji: '📚', choices: ['$2', '$3', '$5'], answer: 1, why: ['Eight minus five is three.', '', 'Five is what the book costs, not what is left.'] },
      { question: 'You want to save for a bike. What is a helpful first step?', emoji: '🚲', choices: ['Find out how much it costs', 'Spend your savings right away', 'Guess and never check'], answer: 0, why: ['', 'Spending it now moves you farther from the bike goal.', 'Knowing the price helps you make a saving plan.'] },
    ],
  },
  {
    id: 'stocks', category: 'Stocks & investing', emoji: '🏢', title: 'What is a stock?',
    intro: 'A stock is a tiny share of a company. If people want its shares more, the price may rise. If the company struggles, the price may fall. There is no sure outcome.',
    points: ['A share is a small piece of ownership.', 'A group fund can hold pieces of many companies.', 'Spreading money around means one company matters less. Prices can still fall.'],
    questions: [
      { question: 'What do you own when you buy one share of a company?', emoji: '🧩', choices: ['A tiny piece of that company', 'The whole company', 'A promise that you will make money'], answer: 0, why: ['', 'One share is only a small part of a company.', 'A share price can go down, so money is never promised.'] },
      { question: 'What might happen to a stock price?', emoji: '📈', choices: ['It can only go up', 'It can go up or down', 'It never changes'], answer: 1, why: ['Prices can fall as well as rise.', '', 'Prices can change as people buy and sell shares.'] },
      { question: 'Why might someone spread their money across many companies?', emoji: '🧺', choices: ['So one company matters less', 'To make sure there are no losses', 'So prices cannot change'], answer: 0, why: ['', 'Spreading money around does not remove all risk.', 'Prices can still move up or down.'] },
    ],
  },
  {
    id: 'candles', category: 'Candlestick charts', emoji: '🕯️', title: 'Read one candle',
    intro: 'A candle shows how a price moved during one time period, such as one day. The thick part shows the start and end prices. Thin lines show the highest and lowest prices.',
    points: ['Open: price at the start.', 'Close: price at the end.', 'High and low: the top and bottom reached.', 'Green usually means the price ended higher; red means it ended lower.'],
    questions: [
      { question: 'A candle opens at $10 and closes at $12. Which colour is it usually?', emoji: '🟩', choices: ['Green', 'Red', 'Blue'], answer: 0, why: ['', 'It ended higher than it began, which is usually shown in green.', 'Blue is not the usual up-or-down candle colour.'] },
      { question: 'A candle opens at $12 and closes at $10. What happened?', emoji: '🟥', choices: ['The price ended higher', 'The price ended lower', 'The price stayed the same'], answer: 1, why: ['It ended at $10, below its $12 start.', '', 'The start and end prices are different.'] },
      { question: 'On this candle, which part shows the highest price? 📈', emoji: '🔝', choices: ['The top of the thin line', 'The middle of the thick body', 'The bottom of the candle'], answer: 0, why: ['', 'The body shows the opening and closing prices.', 'The bottom of the thin line shows the lowest price.'] },
    ],
  },
  {
    id: 'patterns', category: 'Candlestick patterns', emoji: '🔎', title: 'Patterns are clues, not promises',
    intro: 'People name some candle shapes. The shapes describe what happened during that time. They cannot tell us for sure what will happen next.',
    points: ['Doji: open and close are very close.', 'Hammer: a small body with a long lower line.', 'Engulfing: one candle body is much bigger than the one before it.', 'A chart shape is never a promise about tomorrow.'],
    questions: [
      { question: 'What does a candle pattern tell you for sure?', emoji: '🔍', choices: ['Exactly what price will do tomorrow', 'A clue about what happened', 'That investing cannot lose money'], answer: 1, why: ['No shape can know tomorrow’s price.', '', 'Investing can lose money when prices fall.'] },
      { question: 'A doji candle opens and closes at nearly the same price. What does that show?', emoji: '⚖️', choices: ['The price ended near where it began', 'The price must rise tomorrow', 'The company closed'], answer: 0, why: ['', 'A doji does not predict tomorrow.', 'The candle only shows price movement during its time period.'] },
      { question: 'You see a candle shape people call a hammer. What is a smart next thought?', emoji: '🔨', choices: ['It guarantees the price will go up', 'It is one clue; prices can still fall', 'I should buy right away'], answer: 1, why: ['No candle shape is a guarantee.', '', 'A shape alone is not enough to make a decision.'] },
    ],
  },
];

const totalQuestions = lessons.reduce((sum, lesson) => sum + lesson.questions.length, 0);

function Candle({ kind, label, color }) {
  const geometry = kind === 'doji' ? { wickTop: 10, bodyTop: 43, bodyHeight: 5, wickBottom: 81 } : kind === 'hammer' ? { wickTop: 14, bodyTop: 29, bodyHeight: 14, wickBottom: 82 } : { wickTop: 9, bodyTop: 28, bodyHeight: 33, wickBottom: 78 };
  return <div className="kid-candle-example"><svg viewBox="0 0 44 94" role="img" aria-label={`${label} candle`}><line x1="22" x2="22" y1={geometry.wickTop} y2={geometry.wickBottom} stroke={color} strokeWidth="3"/><rect x="12" y={geometry.bodyTop} width="20" height={geometry.bodyHeight} rx="3" fill={color}/></svg><b>{label}</b></div>;
}

export default function KidLearning() {
  const [selected, setSelected] = useState(lessons[0].id);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const lesson = lessons.find(item => item.id === selected) || lessons[0];
  const question = lesson.questions[questionIndex];
  const answerKey = `${lesson.id}:${questionIndex}`;
  const selectedAnswer = answers[answerKey];
  const isCorrect = selectedAnswer === question.answer;
  const overallProgress = Object.entries(answers).filter(([key, answer]) => {
    const [lessonId, index] = key.split(':');
    const item = lessons.find(entry => entry.id === lessonId);
    return item?.questions[Number(index)]?.answer === answer;
  }).length;

  function chooseLesson(id) {
    setSelected(id);
    setQuestionIndex(0);
  }

  function nextQuestion() {
    if (questionIndex < lesson.questions.length - 1) setQuestionIndex(index => index + 1);
    else {
      const nextLesson = lessons[(lessons.findIndex(item => item.id === lesson.id) + 1) % lessons.length];
      chooseLesson(nextLesson.id);
    }
  }

  return <main className="kid-learn-page">
    <section className="kid-learn-hero"><div className="kid-learn-orbit">✨</div><div><span className="kid-learn-kicker"><BookOpenCheck size={14}/> VELORA MONEY CLUB</span><h2>Little lessons, <em>big ideas.</em></h2><p>Explore money, investing, and chart clues at your own pace. Ask a grown-up if you have questions.</p><div className="kid-learn-progress"><span><Star size={15} fill="currentColor"/> {overallProgress} of {totalQuestions} questions right</span><i><b style={{ width: `${overallProgress / totalQuestions * 100}%` }}/></i></div></div></section>
    <div className="kid-learn-layout"><nav className="kid-lesson-list" aria-label="Money lessons">{lessons.map((item, index) => <button key={item.id} className={`kid-lesson-tab ${selected === item.id ? 'active' : ''}`} onClick={() => chooseLesson(item.id)}><span className="kid-lesson-number">{answers[`${item.id}:2`] === item.questions[2].answer ? <Check size={15}/> : index + 1}</span><span className="kid-lesson-tab-copy"><small>{item.category}</small><b>{item.title}</b></span><ChevronRight size={17}/></button>)}</nav>
      <article className="kid-lesson-card"><div className="kid-lesson-heading"><span className="kid-lesson-emoji">{lesson.emoji}</span><div><small>{lesson.category} · {questionIndex + 1} OF {lesson.questions.length}</small><h3>{lesson.title}</h3></div><Sparkles size={19}/></div><p className="kid-lesson-intro">{lesson.intro}</p>
        {lesson.id === 'patterns' && <div className="kid-candle-gallery"><Candle kind="doji" label="Doji" color="#c39b48"/><Candle kind="hammer" label="Hammer" color="#168b65"/><Candle kind="engulfing" label="Engulfing" color="#e27464"/></div>}
        <ul className="kid-lesson-points">{lesson.points.map(point => <li key={point}><span>✦</span>{point}</li>)}</ul>
        {lesson.id === 'candles' && <div className="kid-candle-anatomy"><Candle kind="hammer" label="One day" color="#168b65"/><span><b>Top wick</b> = high of the day<br/><b>Top of body</b> = open<br/><b>Bottom of body</b> = close<br/><b>Bottom wick</b> = low of the day</span></div>}
        <div className="kid-quiz"><div className="kid-quiz-label">QUESTION {questionIndex + 1} OF {lesson.questions.length} <span>⭐</span></div><h4><span aria-hidden="true">{question.emoji}</span> {question.question}</h4><div className="kid-quiz-choices">{question.choices.map((choice, index) => {
          const picked = selectedAnswer === index;
          const correctChoice = picked && index === question.answer;
          const wrongChoice = picked && index !== question.answer;
          return <button key={choice} className={correctChoice ? 'correct' : wrongChoice ? 'incorrect' : ''} onClick={() => !isCorrect && setAnswers(current => ({ ...current, [answerKey]: index }))} aria-pressed={picked} disabled={isCorrect && !picked}>{choice}{picked && <span>{correctChoice ? 'Nice work! 🎉' : 'Not quite yet'}</span>}{wrongChoice && <small className="kid-answer-why"><b>Why?</b> {question.why[index]}</small>}</button>;
        })}</div>{isCorrect && <button className="kid-next-question" onClick={nextQuestion}>{questionIndex < lesson.questions.length - 1 ? 'Next question' : 'Next lesson'} <ChevronRight size={16}/></button>}</div>
        <p className="kid-learning-note">These lessons are for learning. Prices can rise or fall, and candle shapes cannot tell us what a stock will do next. Ask a grown-up to help with money choices.</p>
      </article></div>
  </main>;
}
