// Pulls fresh multiple-choice questions from the free Open Trivia DB (opentdb.com) and
// stores them in MongoDB, so the bank keeps growing and works offline afterwards.
import { addQuestions, keyOf } from './questions.js'

// QuizDuel topic id -> Open Trivia DB category id
export const CATEGORY = {
  general: 9, literature: 10, movies: 11, gaming: 15, science: 17, tech: 18, math: 19,
  greekmyth: 20, sports: 21, geography: 22, history: 23, art: 25, animals: 27,
  superheroes: 29, anime: 31,
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dec = (s) => decodeURIComponent(s)
export const state = { running: false, lastRun: 0, lastAdded: 0, error: '' }

async function fetchCategory(db, topic, category) {
  const url = `https://opentdb.com/api.php?amount=50&category=${category}&type=multiple&encode=url3986`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.response_code === 5) throw new Error('rate limited')
  if (data.response_code !== 0) throw new Error(`response_code ${data.response_code}`)
  const rows = data.results.map((r) => ({
    topic, q: dec(r.question), a: dec(r.correct_answer), w: r.incorrect_answers.map(dec), source: 'opentdb',
  }))
  const have = new Set((await db.collection('questions').find({ topic }).toArray()).map((d) => d.key))
  return addQuestions(db, rows.filter((r) => !have.has(keyOf(topic, r.q, r.a))))
}

export async function refreshFromOpenTDB(db) {
  if (state.running) return state
  state.running = true
  state.error = ''
  let added = 0
  try {
    for (const [topic, category] of Object.entries(CATEGORY)) {
      try {
        added += await fetchCategory(db, topic, category)
      } catch (e) {
        state.error = `${topic}: ${e.message}`
        if (e.message === 'rate limited') await sleep(6000)
        else if (/fetch failed|timeout|abort/i.test(e.message)) break // offline: stop early
      }
      await sleep(5500) // the API allows one request per 5 s
    }
  } finally {
    state.running = false
    state.lastRun = Date.now()
    state.lastAdded = added
    await db.collection('meta').updateOne({ _id: 'opentdb' }, { $set: { lastRefresh: Date.now() } }, { upsert: true })
    console.log(`[opentdb] added ${added} new questions${state.error ? ` (last issue: ${state.error})` : ''}`)
  }
  return state
}

export async function maybeRefresh(db, everyMs = 12 * 3600 * 1000) {
  const meta = await db.collection('meta').findOne({ _id: 'opentdb' })
  if (!meta || Date.now() - meta.lastRefresh > everyMs) refreshFromOpenTDB(db)
}
