// Client side of accounts. Everything real (hashing, tokens, lockout) happens on the server.
import { api, ApiError, clearToken, getToken, setToken } from './api.js'
import { closeSocket } from './socket.js'

export class AuthError extends Error {}
export const LEGACY_KEY = 'quizduel-save-v1'

const wrap = (e) => (e instanceof ApiError ? new AuthError(e.message) : e)

export function validateUsername(u) {
  const v = String(u || '').trim()
  if (v.length < 3) return 'Username must be at least 3 characters.'
  if (v.length > 16) return 'Username can be at most 16 characters.'
  return ''
}
export const validatePassword = (p) => (p ? '' : 'Enter a password.')

// Progress saved by the very first (pre-accounts) version of the game, if any.
export function legacyProgress() {
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null')
    return old && (old.xp > 0 || old.name) ? old : null
  } catch (e) {
    return null
  }
}

export async function signUp(username, password, remember = true) {
  try {
    const d = await api.signup(username.trim(), password, legacyProgress() || undefined)
    setToken(d.token, remember)
    try { localStorage.removeItem(LEGACY_KEY) } catch (e) { /* ignore */ }
    return { user: d.user, save: d.save }
  } catch (e) {
    throw wrap(e)
  }
}

export async function logIn(username, password, remember = true) {
  try {
    const d = await api.login(username.trim(), password)
    setToken(d.token, remember)
    return { user: d.user, save: d.save }
  } catch (e) {
    throw wrap(e)
  }
}

// Resumes a saved login. Returns null if there is none; throws if the server is unreachable.
export async function restoreSession() {
  if (!getToken()) return null
  try {
    return await api.me()
  } catch (e) {
    if (e.status === 401) { clearToken(); return null }
    throw e
  }
}

export function logOut() {
  clearToken()
  closeSocket()
}

export async function changePassword(current, next) {
  try { await api.changePassword(current, next) } catch (e) { throw wrap(e) }
}

export async function deleteAccount(password) {
  try { await api.deleteAccount(password); logOut() } catch (e) { throw wrap(e) }
}
