import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash, randomUUID } from 'node:crypto'
import { emptySave, normalizeSave } from '../src/save.js'
import { TOPIC_IDS } from './questions.js'

const DUMMY_HASH = bcrypt.hashSync('quizduel-dummy', 10)
const MAX_FAILS = 5
const LOCK_MS = 30000

// bcrypt only reads the first 72 bytes, so hash the password first to support any length.
const prehash = (pw) => createHash('sha256').update(pw).digest('base64')
const publicUser = (u) => ({ username: u.username, createdAt: u.createdAt, isAdmin: !!u.isAdmin })

function sanitizeSave(raw, username) {
  const s = normalizeSave(raw, username)
  const topics = {}
  for (const [id, t] of Object.entries(s.topics)) {
    if (TOPIC_IDS.has(id)) topics[id] = { played: +t.played || 0, wins: +t.wins || 0, draws: +t.draws || 0 }
  }
  return {
    ...s,
    name: String(s.name || username).slice(0, 14),
    color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#a06bff',
    topics,
  }
}

export function makeAuth({ db, secret, adminNames = [] }) {
  const users = db.collection('users')
  const fails = new Map()
  const sign = (u) => jwt.sign({ sub: u._id }, secret, { expiresIn: '14d' })
  const verifyToken = (t) => { try { return jwt.verify(t, secret) } catch { return null } }
  const loadUserById = (id) => users.findOne({ _id: id })

  async function requireAuth(req, res, next) {
    const h = req.headers.authorization || ''
    const payload = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null
    const user = payload && (await loadUserById(payload.sub))
    if (!user) return res.status(401).json({ error: 'Please log in again.' })
    req.user = user
    next()
  }
  const requireAdmin = (req, res, next) =>
    req.user.isAdmin ? next() : res.status(403).json({ error: 'Admins only.' })

  const router = express.Router()
  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error.' }) })

  router.post('/auth/signup', wrap(async (req, res) => {
    const username = String(req.body.username || '').trim()
    const password = req.body.password
    if (username.length < 3 || username.length > 16) return res.status(400).json({ error: 'Username must be 3 to 16 characters.' })
    if (typeof password !== 'string' || !password || password.length > 256) return res.status(400).json({ error: 'Enter a password.' })
    const usernameLower = username.toLowerCase()
    const isAdmin = adminNames.includes(usernameLower) || (adminNames.length === 0 && (await users.countDocuments({})) === 0)
    const user = {
      _id: randomUUID(), username, usernameLower, isAdmin, createdAt: Date.now(),
      passHash: await bcrypt.hash(prehash(password), 10),
      save: sanitizeSave(req.body.initialSave || emptySave(username), username),
    }
    try {
      await users.insertOne(user)
    } catch (e) {
      if (e.code === 11000 || /E11000/.test(e.message)) return res.status(409).json({ error: 'That username is taken.' })
      throw e
    }
    res.json({ token: sign(user), user: publicUser(user), save: user.save })
  }))

  router.post('/auth/login', wrap(async (req, res) => {
    const usernameLower = String(req.body.username || '').trim().toLowerCase()
    const password = req.body.password
    if (!usernameLower || typeof password !== 'string' || !password) return res.status(400).json({ error: 'Enter your username and password.' })
    const key = `${usernameLower}|${req.ip}`
    const f = fails.get(key)
    if (f && f.until > Date.now()) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 1000)}s.` })
    const user = await users.findOne({ usernameLower })
    // Compare even for unknown users so response time doesn't reveal which usernames exist.
    const ok = await bcrypt.compare(prehash(password), user?.passHash || DUMMY_HASH)
    if (!user || !ok) {
      const n = { count: (f?.count || 0) + 1, until: 0 }
      if (n.count >= MAX_FAILS) { n.until = Date.now() + LOCK_MS; n.count = 0 }
      fails.set(key, n)
      return res.status(401).json({ error: 'Incorrect username or password.' })
    }
    fails.delete(key)
    res.json({ token: sign(user), user: publicUser(user), save: sanitizeSave(user.save, user.username) })
  }))

  router.get('/me', requireAuth, wrap(async (req, res) => {
    res.json({ user: publicUser(req.user), save: sanitizeSave(req.user.save, req.user.username) })
  }))

  router.put('/me/save', requireAuth, wrap(async (req, res) => {
    const save = sanitizeSave(req.body.save, req.user.username)
    await users.updateOne({ _id: req.user._id }, { $set: { save } })
    res.json({ save })
  }))

  async function checkPassword(req, res) {
    const ok = typeof req.body.password === 'string' && (await bcrypt.compare(prehash(req.body.password), req.user.passHash))
    if (!ok) res.status(401).json({ error: 'Password is incorrect.' })
    return ok
  }

  router.post('/me/password', requireAuth, wrap(async (req, res) => {
    if (!(await checkPassword(req, res))) return
    const next = req.body.next
    if (typeof next !== 'string' || !next || next.length > 256) return res.status(400).json({ error: 'Enter a new password.' })
    await users.updateOne({ _id: req.user._id }, { $set: { passHash: await bcrypt.hash(prehash(next), 10) } })
    res.json({ ok: true })
  }))

  router.post('/me/delete', requireAuth, wrap(async (req, res) => {
    if (!(await checkPassword(req, res))) return
    await users.deleteOne({ _id: req.user._id })
    res.json({ ok: true })
  }))

  return { router, requireAuth, requireAdmin, verifyToken, loadUserById }
}
