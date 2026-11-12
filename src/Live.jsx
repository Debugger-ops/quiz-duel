import React, { useEffect, useRef, useState } from 'react'
import { TOPICS } from './questions.js'
import { SECONDS_PER_QUESTION } from './rules.js'
import { Avatar, levelFromXp } from './shared.jsx'
import { getSocket, closeSocket } from './socket.js'

// mode: 'queue' | 'create' | 'join'
export default function Live({ mode, topic, code, save, onEnd, onBot, onCancel }) {
  const [phase, setPhase] = useState('connecting') // connecting | waiting | room | found | playing | error
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [opp, setOpp] = useState(null)
  const [liveTopic, setLiveTopic] = useState(topic)
  const [q, setQ] = useState(null)
  const [picked, setPicked] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [oppAnswered, setOppAnswered] = useState(false)
  const [scores, setScores] = useState({ me: 0, opp: 0 })
  const [gain, setGain] = useState({ me: 0, opp: 0 })
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION)
  const [copied, setCopied] = useState(false)
  const startedAt = useRef(0)
  const phaseRef = useRef('connecting')
  const oppRef = useRef(null)
  const topicRef = useRef(topic)
  const go = (p) => { phaseRef.current = p; setPhase(p) }

  useEffect(() => {
    const s = getSocket()
    let joined = false
    const join = () => {
      if (joined) return // reconnects must not re-enter the queue
      joined = true
      if (mode === 'queue') s.emit('queue:join', { topic: topic.id })
      else if (mode === 'create') s.emit('room:create', { topic: topic.id })
      else s.emit('room:join', { code })
    }
    const on = {
      'queue:waiting': () => go('waiting'),
      'queue:timeout': () => onBot(),
      'room:created': (r) => { setRoomCode(r.code); go('room') },
      'room:expired': () => { setError('The room expired. Create a new one.'); go('error') },
      'room:error': (e) => { setError(e.message); go('error') },
      'match:error': (e) => { setError(e.message); go('error') },
      'match:found': (m) => {
        const t = TOPICS.find((x) => x.id === m.topic) || topic
        topicRef.current = t
        setLiveTopic(t)
        oppRef.current = { ...m.opponent, live: true }
        setOpp(oppRef.current)
        go('found')
      },
      'q:show': (qq) => {
        setQ(qq); setPicked(null); setReveal(null); setOppAnswered(false); setGain({ me: 0, opp: 0 })
        setTimeLeft(qq.seconds)
        startedAt.current = performance.now()
        go('playing')
      },
      'q:opponent-answered': () => setOppAnswered(true),
      'q:result': (r) => {
        setReveal(r)
        setScores({ me: r.you.score, opp: r.opp.score })
        setGain({ me: r.you.pts, opp: r.opp.pts })
      },
      'match:end': (e) => {
        phaseRef.current = 'ended'
        onEnd(
          { p: e.you.score, b: e.opp.score, correct: e.you.correct, total: e.total, forced: e.forfeit ? 'win' : undefined, forfeit: e.forfeit },
          oppRef.current, topicRef.current,
        )
      },
      connect_error: () => { setError('Can’t reach the server.'); go('error') },
      connect: join,
    }
    for (const [ev, fn] of Object.entries(on)) s.on(ev, fn)
    if (s.connected) join()
    return () => {
      for (const [ev, fn] of Object.entries(on)) s.off(ev, fn)
      if (phaseRef.current === 'found' || phaseRef.current === 'playing') closeSocket() // leaving mid-match = forfeit
      else { s.emit('queue:leave'); s.emit('room:cancel') }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'playing' || reveal) return undefined
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, SECONDS_PER_QUESTION - (performance.now() - startedAt.current) / 1000))
    }, 100)
    return () => clearInterval(t)
  }, [phase, reveal, q])

  const choose = (i) => {
    if (picked !== null || reveal) return
    setPicked(i)
    getSocket().emit('q:answer', { index: q.index, choice: i })
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch (e) { /* ignore */ }
  }

  const color = liveTopic?.color
  const badge = liveTopic ? <div className="topic-badge">{liveTopic.icon} {liveTopic.name}</div> : null

  if (phase === 'error') {
    return (
      <div className="screen center">
        <p className="error" role="alert">{error}</p>
        <button className="btn" onClick={onCancel}>Back</button>
      </div>
    )
  }
  if (phase === 'connecting' || phase === 'waiting') {
    return (
      <div className="screen center" style={{ '--c': color }}>
        {badge}
        <div className="spinner" />
        <p className="muted">{phase === 'connecting' ? 'Connecting…' : 'Searching for a live opponent…'}</p>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    )
  }
  if (phase === 'room') {
    return (
      <div className="screen center" style={{ '--c': color }}>
        {badge}
        <p className="muted">Share this code with your friend</p>
        <div className="room-code" data-testid="room-code">{roomCode}</div>
        <button className="btn" onClick={copy}>{copied ? 'Copied!' : 'Copy code'}</button>
        <div className="spinner small" />
        <p className="muted">Waiting for them to join…</p>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
    )
  }
  if (phase === 'found') {
    return (
      <div className="screen center" style={{ '--c': color }}>
        {badge}
        <div className="vs">
          <div className="vs-side">
            <Avatar name={save.name} color={save.color} size={84} />
            <strong>{save.name}</strong>
            <span className="muted">Lvl {levelFromXp(save.xp)}</span>
          </div>
          <div className="vs-mid">VS</div>
          <div className="vs-side">
            <Avatar name={opp.name} color={opp.color} size={84} />
            <strong>{opp.name}</strong>
            <span className="muted">Lvl {opp.level}</span>
          </div>
        </div>
        <p className="muted">Live match starting…</p>
      </div>
    )
  }

  const pct = (timeLeft / SECONDS_PER_QUESTION) * 100
  return (
    <div className="screen match" style={{ '--c': color }}>
      <div className="scoreboard">
        <div className="player">
          <Avatar name={save.name} color={save.color} size={44} />
          <div>
            <strong>{save.name}</strong>
            <div className="score" data-testid="player-score">{scores.me}</div>
          </div>
          {gain.me > 0 && <span className="gain">+{gain.me}</span>}
        </div>
        <div className="qcount">{q.index + 1}/{q.total}</div>
        <div className="player right">
          {gain.opp > 0 && <span className="gain">+{gain.opp}</span>}
          <div className="textright">
            <strong>{opp.name}</strong>
            <div className="score">{scores.opp}</div>
          </div>
          <Avatar name={opp.name} color={opp.color} size={44} />
        </div>
      </div>

      <div className="timer"><div className={`timer-fill ${timeLeft < 3 ? 'low' : ''}`} style={{ width: `${pct}%` }} /></div>
      <div className="status">
        {q.isLast && <span className="double">Final question: double points</span>}
        {!reveal && oppAnswered && <span className="muted">{opp.name} has answered</span>}
      </div>

      <h2 className="question" data-testid="question">{q.q}</h2>
      {q.image && <img className="q-image" src={q.image} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />}

      <div className="options">
        {q.options.map((opt, i) => {
          let cls = 'option'
          if (reveal) {
            if (i === reveal.correct) cls += ' correct'
            else if (i === reveal.you.choice) cls += ' wrong'
            else cls += ' dim'
          } else if (i === picked) cls += ' chosen'
          return (
            <button key={i} className={cls} disabled={!!reveal || picked !== null} onClick={() => choose(i)} data-testid="option">
              <span>{opt}</span>
              {reveal && reveal.opp.choice === i && (
                <span className="bot-dot" style={{ background: opp.color }} title={`${opp.name}'s answer`}>{opp.name.slice(0, 1)}</span>
              )}
            </button>
          )
        })}
      </div>
      {reveal && reveal.you.choice === null && <p className="muted center-text">Time's up!</p>}
      {!reveal && picked !== null && <p className="muted center-text">Waiting for {opp.name}…</p>}
    </div>
  )
}
