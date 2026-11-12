import React, { useState } from 'react'
import { AuthError, legacyProgress, logIn, signUp, validatePassword, validateUsername } from './auth.js'

function PasswordField({ id, label, value, onChange, autoComplete, describedBy }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input
          id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} 
        />
        <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login') // login | signup
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const legacy = mode === 'signup' ? legacyProgress() : null

  const switchMode = (m) => {
    setMode(m); setError(''); setPassword(''); setConfirm('')
    if (m === 'signup' && !username.trim()) setUsername((legacyProgress()?.name || '').slice(0, 16))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'signup') {
      const msg = validateUsername(username) || validatePassword(password, username) || (password !== confirm ? 'Passwords do not match.' : '')
      if (msg) return setError(msg)
    }
    setBusy(true)
    try {
      const result = mode === 'signup' ? await signUp(username, password, remember) : await logIn(username, password, remember)
      onAuthed(result)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  const signup = mode === 'signup'
  return (
    <div className="screen center">
      <h1 className="logo">Quiz<span>Duel</span></h1>
      <p className="muted">Challenge opponents head to head. Answer fast, score big.</p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => switchMode('login')} data-testid="tab-login">Log in</button>
        <button role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => switchMode('signup')} data-testid="tab-signup">Sign up</button>
      </div>

      <form className="card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username" value={username} maxLength={16} autoFocus autoCapitalize="none" spellCheck={false}
            autoComplete="username" onChange={(e) => setUsername(e.target.value)}
            placeholder={signup ? '3-16 characters' : ''}
          />
        </div>
        <PasswordField
          id="password" label="Password" value={password} onChange={setPassword}
          autoComplete={signup ? 'new-password' : 'current-password'} 
        />
        {signup && <PasswordField id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />}

        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me logged in on this device
        </label>

        {legacy && <p className="note">Progress from this device{legacy.name ? ` (${legacy.name})` : ''} will be added to your new account.</p>}
        <p className="error" role="alert" data-testid="auth-error">{error}</p>
        <button className="btn primary" type="submit" disabled={busy || !username.trim() || !password} data-testid="auth-submit">
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
        </button>
      </form>
      <p className="muted small">Your account and progress are saved in the QuizDuel database. Passwords are salted and hashed, never stored in plain text.</p>
    </div>
  )
}
