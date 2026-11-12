const BASE = import.meta.env.VITE_API_URL || ''
const KEY = 'quizduel-token-v3'

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

export const getToken = () => {
  try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) } catch (e) { return null }
}
export function clearToken() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY) } catch (e) { /* ignore */ }
}
export function setToken(token, remember) {
  clearToken()
  try { (remember ? localStorage : sessionStorage).setItem(KEY, token) } catch (e) { /* ignore */ }
}
export const serverUrl = () => BASE || undefined

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken()
  let res
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new ApiError('Can’t reach the server. Make sure it is running (npm run dev).', 0)
  }
  let data = {}
  try { data = await res.json() } catch (e) { /* empty body */ }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  return data
}

export const api = {
  signup: (username, password, initialSave) => request('/auth/signup', { method: 'POST', body: { username, password, initialSave } }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/me'),
  saveProgress: (save) => request('/me/save', { method: 'PUT', body: { save } }),
  changePassword: (password, next) => request('/me/password', { method: 'POST', body: { password, next } }),
  deleteAccount: (password) => request('/me/delete', { method: 'POST', body: { password } }),
  questions: (topic, count = 7) => request(`/questions?topic=${encodeURIComponent(topic)}&count=${count}`),
  adminStats: () => request('/admin/stats'),
  adminRefresh: () => request('/admin/refresh', { method: 'POST' }),
  adminAddQuestion: (q) => request('/admin/questions', { method: 'POST', body: q }),
}
