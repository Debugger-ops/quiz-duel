// Live 1v1 matches over Socket.IO. The server owns the questions, the clock and the
// scoring, so players can't cheat by editing the page.
import { Server } from 'socket.io'
import { randomUUID } from 'node:crypto'
import { QUESTIONS_PER_MATCH, SECONDS_PER_QUESTION, REVEAL_MS, points, levelFromXp } from '../src/rules.js'
import { TOPIC_IDS, markSeen, pickQuestions, playable, seenIds } from './questions.js'

const QUEUE_TIMEOUT_MS = 12000
const COUNTDOWN_MS = 3200
const GRACE_MS = 700
const ROOM_TTL_MS = 10 * 60 * 1000
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function attachMultiplayer(httpServer, { db, auth, origin }) {
  const io = new Server(httpServer, { cors: origin ? { origin } : undefined })
  const queues = new Map() // topic -> [{ player, timer }]
  const rooms = new Map() // code -> { topic, player, timer }
  const inMatch = new Map() // socket.id -> match

  io.use(async (socket, next) => {
    try {
      const payload = auth.verifyToken(socket.handshake.auth?.token)
      const u = payload && (await auth.loadUserById(payload.sub))
      if (!u) return next(new Error('unauthorized'))
      socket.data.user = {
        id: String(u._id),
        name: u.save?.name || u.username,
        color: u.save?.color || '#a06bff',
        level: levelFromXp(u.save?.xp || 0),
      }
      next()
    } catch (e) {
      next(new Error('unauthorized'))
    }
  })

  const card = (u) => ({ name: u.name, color: u.color, level: u.level })
  const playerOf = (socket) => ({ socket, user: socket.data.user, score: 0, correct: 0, answer: null, pts: 0 })

  function leaveQueues(socket) {
    for (const [topic, list] of queues) {
      const keep = list.filter((e) => {
        if (e.player.socket.id !== socket.id) return true
        clearTimeout(e.timer)
        return false
      })
      if (keep.length) queues.set(topic, keep)
      else queues.delete(topic)
    }
  }
  function closeRoom(socket) {
    for (const [code, r] of rooms) {
      if (r.player.socket.id === socket.id) { clearTimeout(r.timer); rooms.delete(code) }
    }
  }

  async function startMatch(topic, a, b) {
    try {
      const exclude = new Set([...(await seenIds(db, a.user.id, topic)), ...(await seenIds(db, b.user.id, topic))])
      const docs = await pickQuestions(db, topic, QUESTIONS_PER_MATCH, exclude)
      if (docs.length < QUESTIONS_PER_MATCH) throw new Error('Not enough questions in this topic yet.')
      const ids = docs.map((d) => String(d._id))
      await Promise.all([markSeen(db, a.user.id, topic, ids), markSeen(db, b.user.id, topic, ids)])
      const match = {
        id: randomUUID(), topic, players: [a, b], questions: docs.map(playable),
        qi: -1, state: 'countdown', timer: null, qStart: 0, ended: false,
      }
      for (const p of match.players) inMatch.set(p.socket.id, match)
      const [pa, pb] = match.players
      pa.socket.emit('match:found', { id: match.id, topic, total: match.questions.length, opponent: card(pb.user), countdownMs: COUNTDOWN_MS })
      pb.socket.emit('match:found', { id: match.id, topic, total: match.questions.length, opponent: card(pa.user), countdownMs: COUNTDOWN_MS })
      match.timer = setTimeout(() => nextQuestion(match), COUNTDOWN_MS)
    } catch (e) {
      console.error('[mp] start failed:', e.message)
      for (const p of [a, b]) p.socket.emit('match:error', { message: e.message })
    }
  }

  function nextQuestion(match) {
    if (match.ended) return
    match.qi += 1
    if (match.qi >= match.questions.length) return finish(match)
    const q = match.questions[match.qi]
    match.state = 'asking'
    for (const p of match.players) { p.answer = null; p.pts = 0 }
    match.qStart = Date.now()
    io.to(match.players.map((p) => p.socket.id)).emit('q:show', {
      index: match.qi, total: match.questions.length, q: q.q, options: q.options, image: q.image,
      seconds: SECONDS_PER_QUESTION, isLast: match.qi === match.questions.length - 1,
    })
    match.timer = setTimeout(() => reveal(match), (SECONDS_PER_QUESTION * 1000) + GRACE_MS)
  }

  function reveal(match) {
    if (match.ended || match.state !== 'asking') return
    clearTimeout(match.timer)
    match.state = 'reveal'
    const q = match.questions[match.qi]
    const isLast = match.qi === match.questions.length - 1
    for (const p of match.players) {
      const right = p.answer && p.answer.choice === q.correct
      p.pts = points(!!right, p.answer ? p.answer.elapsed : SECONDS_PER_QUESTION, isLast)
      p.score += p.pts
      if (right) p.correct += 1
    }
    const [a, b] = match.players
    const side = (p) => ({ choice: p.answer ? p.answer.choice : null, pts: p.pts, score: p.score })
    a.socket.emit('q:result', { index: match.qi, correct: q.correct, you: side(a), opp: side(b) })
    b.socket.emit('q:result', { index: match.qi, correct: q.correct, you: side(b), opp: side(a) })
    match.timer = setTimeout(() => nextQuestion(match), REVEAL_MS)
  }

  function finish(match, forfeitBy = null) {
    if (match.ended) return
    match.ended = true
    clearTimeout(match.timer)
    const [a, b] = match.players
    for (const [me, opp] of [[a, b], [b, a]]) {
      inMatch.delete(me.socket.id)
      me.socket.emit('match:end', {
        total: match.questions.length,
        you: { score: me.score, correct: me.correct },
        opp: { score: opp.score, correct: opp.correct },
        forfeit: !!forfeitBy && forfeitBy !== me, // the opponent left
      })
    }
  }

  io.on('connection', (socket) => {
    socket.on('queue:join', ({ topic } = {}) => {
      if (!TOPIC_IDS.has(topic)) return socket.emit('match:error', { message: 'Unknown topic.' })
      if (inMatch.has(socket.id)) return
      leaveQueues(socket)
      closeRoom(socket)
      const me = playerOf(socket)
      const list = queues.get(topic) || []
      const waiting = list.find((e) => e.player.user.id !== me.user.id && e.player.socket.connected)
      if (waiting) {
        clearTimeout(waiting.timer)
        queues.set(topic, list.filter((e) => e !== waiting))
        return startMatch(topic, waiting.player, me)
      }
      const timer = setTimeout(() => {
        leaveQueues(socket)
        socket.emit('queue:timeout')
      }, QUEUE_TIMEOUT_MS)
      queues.set(topic, [...list, { player: me, timer }])
      socket.emit('queue:waiting', { seconds: QUEUE_TIMEOUT_MS / 1000 })
    })
    socket.on('queue:leave', () => leaveQueues(socket))

    socket.on('room:create', ({ topic } = {}) => {
      if (!TOPIC_IDS.has(topic)) return socket.emit('room:error', { message: 'Unknown topic.' })
      if (inMatch.has(socket.id)) return
      leaveQueues(socket)
      closeRoom(socket)
      let code
      do { code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('') } while (rooms.has(code))
      const timer = setTimeout(() => { rooms.delete(code); socket.emit('room:expired') }, ROOM_TTL_MS)
      rooms.set(code, { topic, player: playerOf(socket), timer })
      socket.emit('room:created', { code, topic })
    })
    socket.on('room:cancel', () => closeRoom(socket))
    socket.on('room:join', ({ code } = {}) => {
      if (inMatch.has(socket.id)) return
      const key = String(code || '').trim().toUpperCase()
      const room = rooms.get(key)
      if (!room || !room.player.socket.connected) return socket.emit('room:error', { message: 'Room not found or expired.' })
      if (room.player.user.id === socket.data.user.id) return socket.emit('room:error', { message: 'You can’t join your own room.' })
      clearTimeout(room.timer)
      rooms.delete(key)
      leaveQueues(socket)
      startMatch(room.topic, room.player, playerOf(socket))
    })

    socket.on('q:answer', ({ index, choice } = {}) => {
      const match = inMatch.get(socket.id)
      if (!match || match.state !== 'asking' || index !== match.qi) return
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) return
      const me = match.players.find((p) => p.socket.id === socket.id)
      if (me.answer) return
      me.answer = { choice, elapsed: Math.min(SECONDS_PER_QUESTION, (Date.now() - match.qStart) / 1000) }
      const opp = match.players.find((p) => p !== me)
      opp.socket.emit('q:opponent-answered', { index })
      if (match.players.every((p) => p.answer)) reveal(match)
    })

    socket.on('disconnect', () => {
      leaveQueues(socket)
      closeRoom(socket)
      const match = inMatch.get(socket.id)
      if (match) finish(match, match.players.find((p) => p.socket.id === socket.id))
    })
  })

  return io
}
