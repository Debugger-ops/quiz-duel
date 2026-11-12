import React, { useState } from 'react'
import { TOPICS } from './questions.js'
import { Avatar, LevelBar, levelFromXp, rankFor, xpForLevel } from './shared.jsx'
import { AuthError, changePassword, deleteAccount } from './auth.js'
import Admin from './Admin.jsx'
import { emptySave } from './save.js'

const PROFILE_COLORS = ['#a06bff', '#ff5d8f', '#4f8cff', '#22c3a6', '#ffb02e', '#ff8a3d', '#ef5350', '#2fb26b']
const topicById = Object.fromEntries(TOPICS.map((t) => [t.id, t]))
const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Draw' }

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function LevelRing({ xp, color, name }) {
  const lvl = levelFromXp(xp)
  const lo = xpForLevel(lvl)
  const pct = (xp - lo) / (xpForLevel(lvl + 1) - lo)
  const r = 54, c = 2 * Math.PI * r
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="ring-bg" />
        <circle cx="60" cy="60" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <Avatar name={name} color={color} size={88} />
      <span className="ring-lvl">Lv {lvl}</span>
    </div>
  )
}

function ChangePassword() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState({ ok: false, text: '' })
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await changePassword(cur, next)
      setMsg({ ok: true, text: 'Password updated.' })
      setCur(''); setNext('')
    } catch (err) {
      setMsg({ ok: false, text: err instanceof AuthError ? err.message : 'Could not update password.' })
    }
    setBusy(false)
  }
  return (
    <form className="subform" onSubmit={submit}>
      <input type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>
      <button className="btn" disabled={busy || !cur || !next}>Update password</button>
    </form>
  )
}

function DeleteAccount({ onDeleted }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    try {
      await deleteAccount(pw)
      onDeleted()
    } catch (ex) {
      setErr(ex instanceof AuthError ? ex.message : 'Could not delete account.')
    }
  }
  return (
    <form className="subform" onSubmit={submit}>
      <p className="muted">This permanently deletes your account and all progress on this device.</p>
      <input type="password" placeholder="Confirm with your password" aria-label="Password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <p className="error" role="alert">{err}</p>
      <button className="btn danger" disabled={!pw}>Delete my account</button>
    </form>
  )
}

export default function Profile({ user, save, setSave, onBack, onLogout, onDeleted }) {
  const username = user.username
  const [name, setName] = useState(save.name)
  const [panel, setPanel] = useState('') // '' | password | delete
  const [showAll, setShowAll] = useState(false)
  const createdAt = user.createdAt
  const st = save.stats
  const lvl = levelFromXp(save.xp)
  const color = save.color

  const rows = TOPICS.map((t) => {
    const s = save.topics[t.id] || { played: 0, wins: 0, draws: 0 }
    const draws = s.draws || 0
    return { ...t, played: s.played, wins: s.wins, draws, losses: s.played - s.wins - draws, rate: s.played ? Math.round((s.wins / s.played) * 100) : 0 }
  })
  // Played topics first (most played on top); the rest are behind "Show all".
  const sortedRows = [...rows].sort((a, b) => b.played - a.played)
  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, 8)
  const best = rows.filter((r) => r.played > 0).sort((a, b) => b.rate - a.rate || b.wins - a.wins)[0]
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

  const tiles = [
    ['Matches', st.matches], ['Wins', st.wins], ['Losses', st.losses], ['Draws', st.draws],
    ['Win rate', `${pct(st.wins, st.matches)}%`], ['Accuracy', `${pct(st.correct, st.answered)}%`],
    ['Total XP', save.xp.toLocaleString()], ['Best score', st.bestScore],
    ['Avg score', st.matches ? Math.round(st.totalScore / st.matches) : 0],
    ['Win streak', st.streak], ['Best streak', st.bestStreak], ['Correct answers', st.correct],
  ]

  const badges = [
    { icon: '🎮', title: 'First match', ok: st.matches >= 1 },
    { icon: '🏆', title: 'First win', ok: st.wins >= 1 },
    { icon: '🔥', title: '10 matches', ok: st.matches >= 10 },
    { icon: '👑', title: '10 wins', ok: st.wins >= 10 },
    { icon: '⚡', title: '3-win streak', ok: st.bestStreak >= 3 },
    { icon: '🎯', title: '80% accuracy (10+ matches)', ok: st.matches >= 10 && pct(st.correct, st.answered) >= 80 },
    { icon: '⭐', title: 'Level 5', ok: lvl >= 5 },
    { icon: '🧭', title: 'Tried every topic', ok: rows.every((r) => r.played > 0) },
  ]

  const commitName = () => {
    const n = name.trim().slice(0, 14)
    if (n && n !== save.name) setSave({ ...save, name: n })
    else setName(save.name)
  }

  return (
    <div className="screen profile">
      <button className="back" onClick={onBack} data-testid="back-home">&larr; Back</button>

      <section className="card profile-hero">
        <LevelRing xp={save.xp} color={color} name={save.name} />
        <div className="profile-id">
          <input
            className="name-input" value={name} maxLength={14} aria-label="Display name"
            onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="handle">@{username} · Joined {new Date(createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
          <span className="rank">{rankFor(lvl)}</span>
          {best && <span className="muted">Best topic: {best.icon} {best.name} ({best.rate}%)</span>}
        </div>
        <div className="swatches" role="radiogroup" aria-label="Avatar colour">
          {PROFILE_COLORS.map((c) => (
            <button
              key={c} role="radio" aria-checked={c === color} aria-label={c}
              className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }}
              onClick={() => setSave({ ...save, color: c })}
            />
          ))}
        </div>
      </section>

      <LevelBar xp={save.xp} />
      <p className="muted center-text" style={{ marginTop: -8 }}>
        {(xpForLevel(lvl + 1) - save.xp).toLocaleString()} XP to level {lvl + 1}
      </p>

      <h2 className="section">Stats</h2>
      <div className="stats grid12" data-testid="stats">
        {tiles.map(([label, value]) => (
          <div key={label}><b>{value}</b><span>{label}</span></div>
        ))}
      </div>

      <h2 className="section">Recent matches</h2>
      <div className="card history">
        {save.history.length === 0 && <p className="muted">No matches yet. Pick a topic and play one!</p>}
        {save.history.map((h, i) => {
          const t = topicById[h.topic] || { icon: '❓', name: h.topic, color: '#888' }
          return (
            <div className="hrow" key={h.at + '-' + i} style={{ '--c': t.color }}>
              <span className="trow-icon">{t.icon}</span>
              <div className="hmain">
                <strong>{t.name}</strong>
                <span className="muted">vs {h.bot} (Lv {h.botLevel}) · {h.correct}/{h.total} correct · {timeAgo(h.at)}</span>
              </div>
              <div className="hscore">
                <span className={`pill ${h.outcome}`}>{OUTCOME[h.outcome]}</span>
                <span className="muted">{h.p}–{h.b} · +{h.xp} XP</span>
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="section">By topic · {rows.filter((r) => r.played > 0).length}/{rows.length} tried</h2>
      <div className="card topic-rows">
        {visibleRows.map((r) => (
          <div className="trow" key={r.id} style={{ '--c': r.color }}>
            <span className="trow-icon">{r.icon}</span>
            <div className="trow-main">
              <div className="trow-top"><strong>{r.name}</strong><span className="muted">{r.wins}W · {r.draws}D · {r.losses}L · {r.rate}%</span></div>
              <div className="track"><div className="fill" style={{ width: `${r.rate}%`, background: r.color, boxShadow: 'none' }} /></div>
            </div>
          </div>
        ))}
        <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${rows.length} topics`}
        </button>
      </div>

      <h2 className="section">Badges</h2>
      <div className="badges">
        {badges.map((b) => (
          <div key={b.title} className={`badge ${b.ok ? 'on' : ''}`}>
            <span>{b.ok ? b.icon : '🔒'}</span>{b.title}
          </div>
        ))}
      </div>

      {user.isAdmin && <Admin />}

      <h2 className="section">Account</h2>
      <div className="card account">
        <div className="account-actions">
          <button className="btn" onClick={() => setPanel(panel === 'password' ? '' : 'password')}>Change password</button>
          <button className="btn" onClick={onLogout} data-testid="logout">Log out</button>
        </div>
        {panel === 'password' && <ChangePassword />}
        <div className="account-actions">
          <button
            className="link-btn"
            onClick={() => window.confirm('Reset your XP, stats and match history? Your account stays.') && setSave(emptySave(save.name))}
          >Reset progress</button>
          <button className="link-btn danger-text" onClick={() => setPanel(panel === 'delete' ? '' : 'delete')}>Delete account</button>
        </div>
        {panel === 'delete' && <DeleteAccount onDeleted={onDeleted} />}
      </div>
    </div>
  )
}
