import React, { useEffect, useState } from 'react';
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
  {
    id: 'market-candles', category: 'Real stock charts', emoji: '📊', title: 'Guess the next move',
    intro: 'Look at a real month of daily price candles, make a guess about the month after, then reveal what actually happened.',
    points: ['Each candle shows one real trading day.', 'The next month is hidden until you choose an answer.', 'Past prices are clues to explore, never promises about the future.'],
    questions: [],
  },
];

const historicalStocks = [
  { symbol: 'AAPL:NASDAQ', name: 'Apple' },
  { symbol: 'MSFT:NASDAQ', name: 'Microsoft' },
  { symbol: 'NVDA:NASDAQ', name: 'NVIDIA' },
  { symbol: 'AMZN:NASDAQ', name: 'Amazon' },
  { symbol: 'TSLA:NASDAQ', name: 'Tesla' },
];
const historicalQuestionCount = historicalStocks.length;
const totalQuestions = lessons.reduce((sum, lesson) => sum + lesson.questions.length, historicalQuestionCount);
const shortDate = value => value ? new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'the end of that month';

function historicalQuestions(quotes) {
  return historicalStocks.map(stock => {
    const quote = quotes[stock.symbol];
    const points = (quote?.points || []).filter(point => [point.open, point.high, point.low, point.close].every(value => Number.isFinite(Number(value)) && Number(value) > 0)).slice(-42);
    const past = points.slice(0, 21);
    const next = points.slice(21);
    const nextOpen = Number(next[0]?.open);
    const nextClose = Number(next.at(-1)?.close);
    const changePct = nextOpen && nextClose ? ((nextClose - nextOpen) / nextOpen) * 100 : null;
    const answer = changePct === null ? null : changePct > 1 ? 0 : changePct < -1 ? 1 : 2;
    const actualDirection = answer === 0 ? 'mostly up' : answer === 1 ? 'mostly down' : answer === 2 ? 'about the same' : 'unavailable';
    return {
      stock,
      quote,
      chartPoints: past,
      nextStart: next[0]?.date,
      nextEnd: next.at(-1)?.date,
      changePct,
      answer,
      question: `This is ${stock.name}’s real daily price chart from ${shortDate(past[0]?.date)} to ${shortDate(past.at(-1)?.date)}. Which way did its price move over the following month?`,
      emoji: '🔮',
      choices: ['Mostly up', 'Mostly down', 'About the same'],
      why: [
        answer === 0 ? '' : `The real prices over the following month went ${actualDirection}${changePct === null ? '.' : ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`}`,
        answer === 1 ? '' : `The real prices over the following month went ${actualDirection}${changePct === null ? '.' : ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`}`,
        answer === 2 ? '' : `The real prices over the following month went ${actualDirection}${changePct === null ? '.' : ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`}`,
      ],
    };
  });
}

function Candle({ kind, label, color }) {
  const geometry = kind === 'doji' ? { wickTop: 10, bodyTop: 43, bodyHeight: 5, wickBottom: 81 } : kind === 'hammer' ? { wickTop: 14, bodyTop: 29, bodyHeight: 14, wickBottom: 82 } : { wickTop: 9, bodyTop: 28, bodyHeight: 33, wickBottom: 78 };
  return <div className="kid-candle-example"><svg viewBox="0 0 44 94" role="img" aria-label={`${label} candle`}><line x1="22" x2="22" y1={geometry.wickTop} y2={geometry.wickBottom} stroke={color} strokeWidth="3"/><rect x="12" y={geometry.bodyTop} width="20" height={geometry.bodyHeight} rx="3" fill={color}/></svg><b>{label}</b></div>;
}

function HistoricalCandles({ question }) {
  const points = question.chartPoints;
  if (!points.length) return <div className="kid-history-empty">Loading real daily stock candles…</div>;
  const width = 720; const height = 220; const pad = { top: 14, right: 55, bottom: 29, left: 8 };
  const min = Math.min(...points.map(point => Number(point.low)));
  const max = Math.max(...points.map(point => Number(point.high)));
  const spread = Math.max(max - min, max * .01, .01);
  const low = min - spread * .08; const high = max + spread * .08;
  const chartHeight = height - pad.top - pad.bottom; const chartWidth = width - pad.left - pad.right;
  const y = price => pad.top + ((high - price) / (high - low)) * chartHeight;
  const step = chartWidth / points.length; const bodyWidth = Math.max(4, Math.min(13, step * .56));
  const currency = question.quote?.currency || 'USD';
  const format = value => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  const dateLabel = value => new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return <div className="kid-history-chart-wrap">
    <svg className="kid-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${question.stock.name} real daily candlestick prices from ${dateLabel(points[0].date)} to ${dateLabel(points.at(-1).date)}`}>
      {[0, 1, 2, 3].map(index => { const value = high - ((high - low) * index / 3); return <g key={index}><line className="kid-history-grid" x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)}/><text className="kid-history-axis" x={width - pad.right + 5} y={y(value) + 4}>{format(value)}</text></g>; })}
      {points.map((point, index) => {
        const open = Number(point.open); const close = Number(point.close); const x = pad.left + index * step + step / 2;
        const bodyTop = Math.min(y(open), y(close)); const bodyHeight = Math.max(1.5, Math.abs(y(open) - y(close)));
        return <g className={close >= open ? 'kid-history-candle up' : 'kid-history-candle down'} key={`${point.date}-${index}`}><title>{dateLabel(point.date)} · open {format(open)}, high {format(Number(point.high))}, low {format(Number(point.low))}, close {format(close)}</title><line x1={x} x2={x} y1={y(Number(point.high))} y2={y(Number(point.low))}/><rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight}/></g>;
      })}
      <text className="kid-history-date" x={pad.left} y={height - 6}>{dateLabel(points[0].date)}</text><text className="kid-history-date" textAnchor="end" x={width - pad.right} y={height - 6}>{dateLabel(points.at(-1).date)}</text>
    </svg>
    <div className="kid-history-key"><span><i className="up"/> Price ended higher that day</span><span><i className="down"/> Price ended lower that day</span></div>
  </div>;
}

export default function KidLearning() {
  const [selected, setSelected] = useState(lessons[0].id);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marketQuotes, setMarketQuotes] = useState({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [marketRetry, setMarketRetry] = useState(0);
  const marketQuestions = historicalQuestions(marketQuotes);
  const lesson = lessons.find(item => item.id === selected) || lessons[0];
  const currentQuestions = lesson.id === 'market-candles' ? marketQuestions : lesson.questions;
  const question = currentQuestions[questionIndex];
  const answerKey = `${lesson.id}:${questionIndex}`;
  const selectedAnswer = answers[answerKey];
  const isCorrect = question?.answer !== null && question?.answer !== undefined && selectedAnswer === question.answer;
  const overallProgress = Object.entries(answers).filter(([key, answer]) => {
    const [lessonId, index] = key.split(':');
    const item = lessons.find(entry => entry.id === lessonId);
    const expected = lessonId === 'market-candles' ? marketQuestions[Number(index)]?.answer : item?.questions[Number(index)]?.answer;
    return expected !== null && expected !== undefined && expected === answer;
  }).length;

  useEffect(() => {
    let active = true;
    async function loadHistoricalPrices() {
      setMarketLoading(true); setMarketError('');
      try {
        const symbols = historicalStocks.map(stock => encodeURIComponent(stock.symbol)).join(',');
        const response = await fetch(`/api/market?symbols=${symbols}&range=6mo`);
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.quotes)) throw new Error(result.error || 'Historical prices are not available right now.');
        if (!active) return;
        setMarketQuotes(Object.fromEntries(result.quotes.map(quote => [quote.symbol, quote])));
        if (result.unavailable?.length) setMarketError(`Some stock charts could not load: ${result.unavailable.map(symbol => symbol.split(':')[0]).join(', ')}.`);
      } catch (error) {
        if (active) setMarketError(error.message || 'Could not load real stock charts. Check your connection and try again.');
      } finally { if (active) setMarketLoading(false); }
    }
    void loadHistoricalPrices();
    return () => { active = false; };
  }, [marketRetry]);

  function chooseLesson(id) {
    setSelected(id);
    setQuestionIndex(0);
  }

  function nextQuestion() {
    if (questionIndex < currentQuestions.length - 1) setQuestionIndex(index => index + 1);
    else {
      const nextLesson = lessons[(lessons.findIndex(item => item.id === lesson.id) + 1) % lessons.length];
      chooseLesson(nextLesson.id);
    }
  }

  return <main className="kid-learn-page">
    <section className="kid-learn-hero"><div className="kid-learn-orbit">✨</div><div><span className="kid-learn-kicker"><BookOpenCheck size={14}/> VELORA MONEY CLUB</span><h2>Little lessons, <em>big ideas.</em></h2><p>Explore money, investing, and chart clues at your own pace. Ask a grown-up if you have questions.</p><div className="kid-learn-progress"><span><Star size={15} fill="currentColor"/> {overallProgress} of {totalQuestions} questions right</span><i><b style={{ width: `${overallProgress / totalQuestions * 100}%` }}/></i></div></div></section>
    <div className="kid-learn-layout"><nav className="kid-lesson-list" aria-label="Money lessons">{lessons.map((item, index) => { const done = item.id === 'market-candles' ? marketQuestions.length > 0 && marketQuestions.every((entry, questionNumber) => entry.answer !== null && answers[`${item.id}:${questionNumber}`] === entry.answer) : answers[`${item.id}:${item.questions.length - 1}`] === item.questions.at(-1)?.answer; return <button key={item.id} className={`kid-lesson-tab ${selected === item.id ? 'active' : ''}`} onClick={() => chooseLesson(item.id)}><span className="kid-lesson-number">{done ? <Check size={15}/> : index + 1}</span><span className="kid-lesson-tab-copy"><small>{item.category}</small><b>{item.title}</b></span><ChevronRight size={17}/></button>; })}</nav>
      <article className="kid-lesson-card"><div className="kid-lesson-heading"><span className="kid-lesson-emoji">{lesson.emoji}</span><div><small>{lesson.category} · {questionIndex + 1} OF {currentQuestions.length}</small><h3>{lesson.title}</h3></div><Sparkles size={19}/></div><p className="kid-lesson-intro">{lesson.intro}</p>
        {lesson.id === 'patterns' && <div className="kid-candle-gallery"><Candle kind="doji" label="Doji" color="#c39b48"/><Candle kind="hammer" label="Hammer" color="#168b65"/><Candle kind="engulfing" label="Engulfing" color="#e27464"/></div>}
        <ul className="kid-lesson-points">{lesson.points.map(point => <li key={point}><span>✦</span>{point}</li>)}</ul>
        {lesson.id === 'candles' && <div className="kid-candle-anatomy"><Candle kind="hammer" label="One day" color="#168b65"/><span><b>Top wick</b> = high of the day<br/><b>Top of body</b> = open<br/><b>Bottom of body</b> = close<br/><b>Bottom wick</b> = low of the day</span></div>}
        {lesson.id === 'market-candles' && question && <><HistoricalCandles question={question}/><p className="kid-history-prompt"><b>🧠 Your guess:</b> Looking at this month of real candles, which way do you think the price moved during the next month?</p><small className="kid-history-disclaimer">Past price moves are learning examples; they cannot tell us what a stock will do next. Data: {question.quote?.source || 'market history'}.</small>{marketLoading && <p className="kid-history-status">Getting the latest historical candles…</p>}{question.answer === null && !marketLoading && !marketError && <p className="kid-history-status" role="status">Not enough price history is available for this chart right now.</p>}{marketError && <p className="kid-history-status error" role="status">{marketError} <button type="button" onClick={() => setMarketRetry(value => value + 1)}>Try loading again</button></p>}</>}
        {question && <div className="kid-quiz"><div className="kid-quiz-label">QUESTION {questionIndex + 1} OF {currentQuestions.length} <span>⭐</span></div><h4><span aria-hidden="true">{question.emoji}</span> {question.question}</h4><div className="kid-quiz-choices">{question.choices.map((choice, index) => {
          const picked = selectedAnswer === index;
          const correctChoice = picked && index === question.answer;
          const wrongChoice = picked && index !== question.answer;
          return <button key={choice} className={correctChoice ? 'correct' : wrongChoice ? 'incorrect' : ''} onClick={() => !isCorrect && question.answer !== null && setAnswers(current => ({ ...current, [answerKey]: index }))} aria-pressed={picked} disabled={question.answer === null || (isCorrect && !picked)}>{choice}{picked && <span>{correctChoice ? 'Nice work! 🎉' : 'Not quite yet'}</span>}{wrongChoice && <small className="kid-answer-why"><b>Why?</b> {question.why[index]}</small>}</button>;
        })}</div>{lesson.id === 'market-candles' && isCorrect && <div className="kid-history-result"><b>What actually happened?</b><span>{question.changePct > 1 ? 'Mostly up' : question.changePct < -1 ? 'Mostly down' : 'About the same'}: {question.stock.name} moved {question.changePct >= 0 ? '+' : ''}{question.changePct.toFixed(2)}% from {shortDate(question.nextStart)} to {shortDate(question.nextEnd)}.</span><small>The answer comes from the real prices after the chart. A chart clue is a guess, never a guarantee.</small></div>}{isCorrect && <button className="kid-next-question" onClick={nextQuestion}>{questionIndex < currentQuestions.length - 1 ? 'Next question' : 'Next lesson'} <ChevronRight size={16}/></button>}</div>}
        <p className="kid-learning-note">These lessons are for learning. Prices can rise or fall, and candle shapes cannot tell us what a stock will do next. Ask a grown-up to help with money choices.</p>
      </article></div>
  </main>;
}
