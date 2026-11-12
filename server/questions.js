import { createHash, randomUUID } from 'node:crypto'
import { TOPICS, QUESTIONS } from '../src/questions.js'

export const TOPIC_IDS = new Set(TOPICS.map((t) => t.id))

export const keyOf = (topic, q, a) =>
  createHash('sha1').update(`${topic}|${q}|${a}`.toLowerCase()).digest('hex')

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const isDup = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''))

// Inserts questions whose key doesn't exist yet. Returns how many were added.
export async function addQuestions(db, rows) {
  const col = db.collection('questions')
  const docs = rows.map((r) => ({
    _id: randomUUID(),
    topic: r.topic, q: r.q, a: r.a, w: r.w, image: r.image || null, source: r.source,
    key: keyOf(r.topic, r.q, r.a), createdAt: Date.now(),
  }))
  if (!docs.length) return 0
  try {
    await col.insertMany(docs, { ordered: false })
    return docs.length
  } catch (e) {
    if (!isDup(e) && !e.writeErrors) throw e
    return e.result?.insertedCount ?? e.insertedCount ?? 0
  }
}

// Copies the built-in bank (src/questions*.js) into MongoDB. Safe to run on every boot.
export async function seedBuiltIn(db) {
  const col = db.collection('questions')
  const have = new Set((await col.find({ source: 'builtin' }).toArray()).map((d) => d.key))
  const rows = []
  for (const t of TOPICS) {
    for (const item of QUESTIONS[t.id] || []) {
      if (!have.has(keyOf(t.id, item.q, item.a))) rows.push({ ...item, topic: t.id, source: 'builtin' })
    }
  }
  const added = await addQuestions(db, rows)
  if (added) console.log(`[questions] seeded ${added} built-in questions`)
  return added
}

// ---- no-repeat tracking: the last 300 questions each user saw per topic ----
const SEEN_LIMIT = 300
export async function seenIds(db, userId, topic) {
  const d = await db.collection('seen').findOne({ _id: `${userId}:${topic}` })
  return new Set(d?.ids || [])
}
export async function markSeen(db, userId, topic, ids) {
  const id = `${userId}:${topic}`
  const old = (await db.collection('seen').findOne({ _id: id }))?.ids || []
  const next = [...old.filter((x) => !ids.includes(x)), ...ids].slice(-SEEN_LIMIT)
  await db.collection('seen').updateOne({ _id: id }, { $set: { ids: next, userId, topic } }, { upsert: true })
}

// Random questions the user hasn't seen recently. If the unseen pool runs dry, the
// oldest-seen questions are reused, so a match is always full.
export async function pickQuestions(db, topic, n, exclude = new Set()) {
  const all = await db.collection('questions').find({ topic }).toArray()
  const fresh = shuffle(all.filter((d) => !exclude.has(String(d._id))))
  let pick = fresh.slice(0, n)
  if (pick.length < n) {
    const rest = shuffle(all.filter((d) => !pick.includes(d)))
    pick = pick.concat(rest.slice(0, n - pick.length))
  }
  return pick
}

// Shuffles the answer options; `correct` is the index of the right one.
export function playable(doc) {
  const options = shuffle([doc.a, ...doc.w])
  return { id: String(doc._id), q: doc.q, options, correct: options.indexOf(doc.a), image: doc.image || null }
}

export async function bankStats(db) {
  const all = await db.collection('questions').find({}).toArray()
  const byTopic = {}
  const bySource = {}
  for (const d of all) {
    byTopic[d.topic] = (byTopic[d.topic] || 0) + 1
    bySource[d.source] = (bySource[d.source] || 0) + 1
  }
  return { total: all.length, byTopic, bySource }
}
