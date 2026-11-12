import React, { useEffect, useRef, useState } from 'react'
import { TOPICS, QUESTIONS } from './questions.js'
import { Avatar, LevelBar, levelFromXp } from './shared.jsx'
import AuthScreen from './Auth.jsx'
import Profile from './Profile.jsx'
import Lobby from './Lobby.jsx'
import Live from './Live.jsx'
import { logOut, restoreSession } from './auth.js'
import { api } from './api.js'
import { applyMatch, outcomeOf } from './save.js'
import { QUESTIONS_PER_MATCH, SECONDS_PER_QUESTION, REVEAL_MS, points } from './rules.js'

const BOT_NAMES = [
  'Aarav', 'Mika', 'Sakura', 'Rohan', 'Luna', 'Kenji', 'Zara', 'Ishaan',
  'Hana', 'Dev', 'Nora', 'Yuki', 'Kabir', 'Mei', 'Arjun', 'Riya',
]
const AVATAR_COLORS = ['#ff5d8f', '#4f8cff', '#22c3a6', '#ffb02e', '#a06bff', '#ff7a45']

/* ---------- helpers ---------- */
const rand = (min, max) => Math.random() * (max - min) + min
const randInt = (min, max) => Math.floor(rand(min, max + 1))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuestions(topicId) {
  return shuffle(QUESTIONS[topicId])
    .slice(0, QUESTIONS_PER_MATCH)
    .map((item) => {
      const options = shuffle([item.a, ...item.w])
      return { q: item.q, options, correct: options.indexOf(item.a), image: item.image || null }
    })
}

// Fresh, non-repeating questions from the server; falls back to the built-in bank offline.
async function fetchQuestions(topicId) {
  try {
    const { questions } = await api.questions(topicId, QUESTIONS_PER_MATCH)
    if (questions.length >= QUESTIONS_PER_MATCH) return questions
  } catch (e) {
    /* offline or server error: use the local bank */
  }
  return buildQuestions(topicId)
}

function makeBot(playerLevel) {
  const level = Math.max(1, playerLevel + randInt(-2, 3))
  return {
    name: BOT_NAMES[randInt(0, BOT_NAMES.length - 1)],
    level,
    color: AVATAR_COLORS[randInt(0, AVATAR_COLORS.length - 1)],
    accuracy: clamp(0.5 + level * 0.035, 0.5, 0.92),
    speed: clamp(7 - level * 0.3, 2.6, 7), // typical seconds to answer
  }
}

/* ---------- screens ---------- */
function Home({ save, onPlay, onProfile, onJoin }) {
  const [query, setQuery] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const shown = TOPICS.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <div className="screen">
      <header className="home-head">
        <h1 className="logo small">Quiz<span>Duel</span></h1>
        <button className="me" onClick={onProfile} data-testid="open-profile" title="Open profile">
          <Avatar name={save.name} color={save.color} size={40} />
          <strong>{save.name}</strong>
        </button>
      </header>
      <form
        className="joinrow"
        onSubmit={(e) => { e.preventDefault(); if (joinCode.trim()) onJoin(joinCode.trim().toUpperCase()) }}
      >
        <input
          value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={5}
          placeholder="Have a room code?" aria-label="Room code" data-testid="join-code" autoCapitalize="characters" spellCheck={false}
        />
        <button className="btn primary" disabled={joinCode.trim().length < 5} data-testid="join-btn">Join friend</button>
      </form>
      <h2 className="section">Choose a topic · {TOPICS.length}</h2>
      <input
        className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search topics…" aria-label="Search topics" data-testid="topic-search"
      />
      {shown.length === 0 && <p className="muted center-text">No topics match “{query}”.</p>}
      <div className="topic-grid">
        {shown.map((t) => (
          <button key={t.id} className="topic" style={{ '--c': t.color }} onClick={() => onPlay(t)} data-testid={`topic-${t.id}`}>
            <span className="topic-icon">{t.icon}</span>
            <span className="topic-name">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Matchmaking({ topic, save, bot, onReady }) {
  const [found, setFound] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setFound(true), randInt(1400, 2400))
    return () => clearTimeout(t1)
  }, [])
  useEffect(() => {
    if (!found) return
    const t2 = setTimeout(onReady, 2000)
    return () => clearTimeout(t2)
  }, [found, onReady])

  return (
    <div className="screen center" style={{ '--c': topic.color }}>
      <div className="topic-badge">{topic.icon} {topic.name}</div>
      {!found ? (
        <>
          <div className="spinner" />
          <p className="muted">Searching for an opponent…</p>
        </>
      ) : (
        <div className="vs">
          <div className="vs-side">
            <Avatar name={save.name} color={save.color} size={84} />
            <strong>{save.name}</strong>
            <span className="muted">Lvl {levelFromXp(save.xp)}</span>
          </div>
          <div className="vs-mid">VS</div>
          <div className="vs-side">
            <Avatar name={bot.name} color={bot.color} size={84} />
            <strong>{bot.name}</strong>
            <span className="muted">Lvl {bot.level}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Match({ topic, save, bot, questions, onFinish }) {
  const [qi, setQi] = useState(0)
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION)
  const [picked, setPicked] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [botAnswered, setBotAnswered] = useState(false)
  const [scores, setScores] = useState({ p: 0, b: 0 })
  const [gain, setGain] = useState({ p: 0, b: 0 })
  const [botPick, setBotPick] = useState(null)
  const tally = useRef({ p: 0, b: 0, pCorrect: 0 })
  const plan = useRef(null)
  const startedAt = useRef(0)
  const done = useRef(false)

  const q = questions[qi]
  const isLast = qi === questions.length - 1

  // Start of each question: plan the bot's answer and run the countdown.
  useEffect(() => {
    done.current = false
    setPicked(null)
    setRevealed(false)
    setBotAnswered(false)
    setBotPick(null)
    setGain({ p: 0, b: 0 })
    setTimeLeft(SECONDS_PER_QUESTION)
    startedAt.current = performance.now()

    const delay = clamp(bot.speed * rand(0.6, 1.4), 1.2, SECONDS_PER_QUESTION - 0.5)
    const isCorrect = Math.random() < bot.accuracy
    const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== q.correct))[0]
    plan.current = { delay, isCorrect, pick: isCorrect ? q.correct : wrong }

    const botTimer = setTimeout(() => setBotAnswered(true), delay * 1000)
    const tick = setInterval(() => {
      const elapsed = (performance.now() - startedAt.current) / 1000
      const left = Math.max(0, SECONDS_PER_QUESTION - elapsed)
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(tick)
        settle(null, SECONDS_PER_QUESTION)
      }
    }, 100)
    return () => {
      clearTimeout(botTimer)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi])

  function settle(choice, secondsTaken) {
    if (done.current) return
    done.current = true
    const pCorrect = choice === q.correct
    const pPts = points(pCorrect, secondsTaken, isLast)
    const bPts = points(plan.current.isCorrect, plan.current.delay, isLast)
    tally.current.p += pPts
    tally.current.b += bPts
    if (pCorrect) tally.current.pCorrect += 1
    setPicked(choice)
    setBotPick(plan.current.pick)
    setBotAnswered(true)
    setRevealed(true)
    setGain({ p: pPts, b: bPts })
    setScores({ p: tally.current.p, b: tally.current.b })
    setTimeout(() => {
      if (isLast) {
        onFinish({ p: tally.current.p, b: tally.current.b, correct: tally.current.pCorrect, total: questions.length })
      } else {
        setQi((n) => n + 1)
      }
    }, REVEAL_MS)
  }

  function choose(i) {
    if (done.current) return
    const secondsTaken = (performance.now() - startedAt.current) / 1000
    settle(i, secondsTaken)
  }

  const pct = (timeLeft / SECONDS_PER_QUESTION) * 100

  return (
    <div className="screen match" style={{ '--c': topic.color }}>
      <div className="scoreboard">
        <div className="player">
          <Avatar name={save.name} color={save.color} size={44} />
          <div>
            <strong>{save.name}</strong>
            <div className="score" data-testid="player-score">{scores.p}</div>
          </div>
          {gain.p > 0 && <span className="gain">+{gain.p}</span>}
        </div>
        <div className="qcount">{qi + 1}/{questions.length}</div>
        <div className="player right">
          {gain.b > 0 && <span className="gain">+{gain.b}</span>}
          <div className="textright">
            <strong>{bot.name}</strong>
            <div className="score">{scores.b}</div>
          </div>
          <Avatar name={bot.name} color={bot.color} size={44} />
        </div>
      </div>

      <div className="timer">
        <div className={`timer-fill ${timeLeft < 3 ? 'low' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="status">
        {isLast && <span className="double">Final question: double points</span>}
        {!revealed && botAnswered && <span className="muted">{bot.name} has answered</span>}
      </div>

      <h2 className="question" data-testid="question">{q.q}</h2>
      {q.image && <img key={q.image} className="q-image" src={q.image} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />}

      <div className="options">
        {q.options.map((opt, i) => {
          let cls = 'option'
          if (revealed) {
            if (i === q.correct) cls += ' correct'
            else if (i === picked) cls += ' wrong'
            else cls += ' dim'
          } else if (i === picked) cls += ' chosen'
          return (
            <button key={i} className={cls} disabled={revealed} onClick={() => choose(i)} data-testid="option">
              <span>{opt}</span>
              {revealed && botPick === i && (
                <span className="bot-dot" style={{ background: bot.color }} title={`${bot.name}'s answer`}>
                  {bot.name.slice(0, 1)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {revealed && picked === null && <p className="muted center-text">Time's up!</p>}
    </div>
  )
}

function Results({ topic, save, bot, result, xpGain, leveledUp, onRematch, onHome }) {
  const outcome = outcomeOf(result)
  const headline = { win: 'Victory!', loss: 'Defeat', draw: 'Draw' }[outcome]
  return (
    <div className="screen center" style={{ '--c': topic.color }}>
      <h1 className={`result ${outcome}`} data-testid="result">{headline}</h1>
      <div className="final">
        <div>
          <Avatar name={save.name} color={save.color} size={64} />
          <strong>{save.name}</strong>
          <div className="big">{result.p}</div>
        </div>
        <div className="vs-mid">VS</div>
        <div>
          <Avatar name={bot.name} color={bot.color} size={64} />
          <strong>{bot.name}</strong>
          <div className="big">{result.b}</div>
        </div>
      </div>
      {result.forfeit && <p className="muted">{bot.name} left the match, so you win.</p>}
      <div className="card summary">
        <div><span className="muted">Correct answers</span><strong>{result.correct} / {result.total}</strong></div>
        <div><span className="muted">XP earned</span><strong>+{xpGain}</strong></div>
        {leveledUp && <div className="levelup">Level up! You are now level {levelFromXp(save.xp)}</div>}
      </div>
      <LevelBar xp={save.xp} />
      <div className="actions">
        <button className="btn primary" onClick={onRematch}>Play again</button>
        <button className="btn" onClick={onHome}>Change topic</button>
      </div>
    </div>
  )
}

/* ---------- app shell ---------- */
export default function App() {
  const [boot, setBoot] = useState('loading') // loading | offline | ready
  const [user, setUser] = useState(null)
  const [save, setSaveState] = useState(null)
  const [screen, setScreen] = useState('home') // home | profile | lobby | live | search | match | results
  const [topic, setTopic] = useState(null)
  const [bot, setBot] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [liveCfg, setLiveCfg] = useState(null)
  const [result, setResult] = useState(null)
  const [xpGain, setXpGain] = useState(0)
  const [leveledUp, setLeveledUp] = useState(false)
  const [matchId, setMatchId] = useState(0)
  const pending = useRef(null)

  const resume = () => {
    setBoot('loading')
    restoreSession()
      .then((d) => {
        if (d) { setUser(d.user); setSaveState(d.save) }
        setBoot('ready')
      })
      .catch(() => setBoot('offline'))
  }
  useEffect(resume, [])

  const signedIn = ({ user: u, save: s }) => {
    setUser(u)
    setSaveState(s)
    setScreen('home')
  }
  const signedOut = () => {
    setUser(null)
    setSaveState(null)
    setScreen('home')
  }
  const setSave = (next) => {
    setSaveState(next)
    api.saveProgress(next).catch(() => {}) // progress is re-sent on the next change
  }

  if (boot === 'loading') return <div className="app"><div className="screen center"><div className="spinner" /></div></div>
  if (boot === 'offline') {
    return (
      <div className="app">
        <div className="screen center">
          <h1 className="logo small">Quiz<span>Duel</span></h1>
          <p className="error">Can’t reach the QuizDuel server.</p>
          <p className="muted">Start it with <code>npm run dev</code>, then try again.</p>
          <button className="btn primary" onClick={resume}>Try again</button>
        </div>
      </div>
    )
  }
  if (!user || !save) return <div className="app"><AuthScreen onAuthed={signedIn} /></div>

  // solo match against a bot
  const startSearch = (t) => {
    setMatchId((n) => n + 1)
    setTopic(t)
    setBot(makeBot(levelFromXp(save.xp)))
    pending.current = fetchQuestions(t.id)
    setScreen('search')
  }
  const goMatch = () => {
    pending.current.then((qs) => { setQuestions(qs); setScreen('match') })
  }

  const startLive = (mode, t, code) => {
    setMatchId((n) => n + 1)
    setTopic(t)
    setLiveCfg({ mode, code })
    setScreen('live')
  }

  const finishMatch = (res, opponent = bot, matchTopic = topic) => {
    const before = levelFromXp(save.xp)
    const { next, gained } = applyMatch(save, { topicId: matchTopic.id, res, bot: opponent })
    setSave(next)
    setTopic(matchTopic)
    setBot(opponent)
    setXpGain(gained)
    setLeveledUp(levelFromXp(next.xp) > before)
    setResult(res)
    setScreen('results')
  }

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          save={save}
          onPlay={(t) => { setTopic(t); setScreen('lobby') }}
          onProfile={() => setScreen('profile')}
          onJoin={(code) => startLive('join', null, code)}
        />
      )}
      {screen === 'profile' && (
        <Profile
          user={user} save={save} setSave={setSave} onBack={() => setScreen('home')}
          onLogout={() => { logOut(); signedOut() }} onDeleted={signedOut}
        />
      )}
      {screen === 'lobby' && (
        <Lobby
          topic={topic} onBack={() => setScreen('home')}
          onQuick={() => startLive('queue', topic)} onCreate={() => startLive('create', topic)} onBot={() => startSearch(topic)}
        />
      )}
      {screen === 'live' && (
        <Live
          key={matchId} mode={liveCfg.mode} topic={topic} code={liveCfg.code} save={save}
          onEnd={finishMatch} onBot={() => startSearch(topic)} onCancel={() => setScreen(topic ? 'lobby' : 'home')}
        />
      )}
      {screen === 'search' && <Matchmaking topic={topic} save={save} bot={bot} onReady={goMatch} />}
      {screen === 'match' && <Match key={matchId} topic={topic} save={save} bot={bot} questions={questions} onFinish={finishMatch} />}
      {screen === 'results' && (
        <Results
          topic={topic} save={save} bot={bot} result={result} xpGain={xpGain} leveledUp={leveledUp}
          onRematch={() => (bot.live ? setScreen('lobby') : startSearch(topic))}
          onHome={() => setScreen('home')}
        />
      )}
    </div>
  )
}
