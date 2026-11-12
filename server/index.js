import 'dotenv/config'
import express from 'express'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connect } from './db.js'
import { makeAuth } from './auth.js'
import { makeQuestionRoutes } from './routes.js'
import { attachMultiplayer } from './multiplayer.js'
import { seedBuiltIn } from './questions.js'
import { maybeRefresh } from './opentdb.js'

const PORT = Number(process.env.PORT) || 4000
let secret = process.env.JWT_SECRET
if (!secret || secret === 'change-me') {
  secret = randomBytes(32).toString('hex')
  console.warn('[auth] JWT_SECRET is not set: using a random one, so everyone is logged out whenever the server restarts.')
}

export async function createServer({ mongoUri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'quizduel' } = {}) {
  const db = await connect(mongoUri, dbName)
  await seedBuiltIn(db)

  const adminNames = (process.env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const auth = makeAuth({ db, secret, adminNames })

  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '200kb' }))
  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api', auth.router)
  app.use('/api', makeQuestionRoutes({ db, auth }))
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

  // Serve the built front-end when it exists (npm start).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  const server = http.createServer(app)
  attachMultiplayer(server, { db, auth, origin: process.env.CLIENT_ORIGIN })
  return { app, server, db }
}

// Run directly: `node server/index.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer()
    .then(({ server, db }) => {
      server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`))
      if (process.env.FETCH_OPENTDB !== '0') {
        maybeRefresh(db)
        setInterval(() => maybeRefresh(db), 6 * 3600 * 1000)
      }
    })
    .catch((e) => {
      console.error('[server] failed to start:', e.message)
      process.exit(1)
    })
}
