import express from 'express'
import { TOPIC_IDS, addQuestions, bankStats, markSeen, pickQuestions, playable, seenIds } from './questions.js'
import { refreshFromOpenTDB, state as tdbState } from './opentdb.js'

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error.' }) })

export function makeQuestionRoutes({ db, auth }) {
  const router = express.Router()

  // Fresh questions for a solo match, skipping ones this player saw recently.
  router.get('/questions', auth.requireAuth, wrap(async (req, res) => {
    const topic = String(req.query.topic || '')
    if (!TOPIC_IDS.has(topic)) return res.status(400).json({ error: 'Unknown topic.' })
    const count = Math.min(20, Math.max(1, parseInt(req.query.count, 10) || 7))
    const docs = await pickQuestions(db, topic, count, await seenIds(db, req.user._id, topic))
    await markSeen(db, req.user._id, topic, docs.map((d) => String(d._id)))
    res.json({ questions: docs.map(playable) })
  }))

  router.get('/admin/stats', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => {
    res.json({ ...(await bankStats(db)), opentdb: tdbState })
  }))

  router.post('/admin/refresh', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => {
    refreshFromOpenTDB(db) // runs in the background (~90 s); poll /admin/stats
    res.json({ started: true })
  }))

  router.post('/admin/questions', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => {
    const { topic, q, a, w, image } = req.body || {}
    const clean = (s) => String(s || '').trim()
    const wrong = Array.isArray(w) ? w.map(clean).filter(Boolean) : []
    if (!TOPIC_IDS.has(topic)) return res.status(400).json({ error: 'Pick a topic.' })
    if (!clean(q) || !clean(a) || wrong.length !== 3) return res.status(400).json({ error: 'Need a question, the right answer and exactly 3 wrong answers.' })
    if (new Set([clean(a), ...wrong]).size !== 4) return res.status(400).json({ error: 'All four answers must be different.' })
    const img = clean(image)
    if (img && !/^https?:\/\/\S+$/i.test(img)) return res.status(400).json({ error: 'Image must be an http(s) URL.' })
    const added = await addQuestions(db, [{ topic, q: clean(q), a: clean(a), w: wrong, image: img || null, source: 'admin' }])
    if (!added) return res.status(409).json({ error: 'That question already exists.' })
    res.json({ added })
  }))

  return router
}
