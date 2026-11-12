// Shape of a player's saved progress + helpers to update it.

export const DEFAULT_COLOR = '#a06bff'
export const HISTORY_LIMIT = 15

export const emptyStats = () => ({
  matches: 0, wins: 0, losses: 0, draws: 0,
  correct: 0, answered: 0,
  bestScore: 0, totalScore: 0,
  streak: 0, bestStreak: 0,
})

export const emptySave = (name = '') => ({
  name, color: DEFAULT_COLOR, xp: 0, topics: {}, stats: emptyStats(), history: [],
})

// Accepts anything (old v1 saves included) and returns a complete, valid save.
export function normalizeSave(raw, fallbackName = '') {
  const s = raw && typeof raw === 'object' ? raw : {}
  const topics = s.topics && typeof s.topics === 'object' ? s.topics : {}
  const stats = { ...emptyStats(), ...(s.stats || {}) }
  if (!s.stats) {
    // Legacy save: rebuild totals from the per-topic counters.
    const vals = Object.values(topics)
    stats.matches = vals.reduce((n, t) => n + (t.played || 0), 0)
    stats.wins = vals.reduce((n, t) => n + (t.wins || 0), 0)
    stats.losses = stats.matches - stats.wins
  }
  return {
    name: s.name || fallbackName,
    color: s.color || DEFAULT_COLOR,
    xp: Number(s.xp) || 0,
    topics,
    stats,
    history: Array.isArray(s.history) ? s.history.slice(0, HISTORY_LIMIT) : [],
  }
}

export const xpForResult = (outcome, correct) =>
  (outcome === 'win' ? 60 : outcome === 'draw' ? 35 : 20) + correct * 5

export const outcomeOf = (res) => res.forced || (res.p > res.b ? 'win' : res.p < res.b ? 'loss' : 'draw')

// Returns { next, gained, outcome } after folding a finished match into the save.
export function applyMatch(save, { topicId, res, bot }) {
  const outcome = outcomeOf(res)
  const gained = xpForResult(outcome, res.correct)
  const st = save.stats
  const prev = save.topics[topicId] || { played: 0, wins: 0, draws: 0 }
  const streak = outcome === 'win' ? st.streak + 1 : 0
  const next = {
    ...save,
    xp: save.xp + gained,
    topics: {
      ...save.topics,
      [topicId]: {
        played: prev.played + 1,
        wins: prev.wins + (outcome === 'win' ? 1 : 0),
        draws: (prev.draws || 0) + (outcome === 'draw' ? 1 : 0),
      },
    },
    stats: {
      matches: st.matches + 1,
      wins: st.wins + (outcome === 'win' ? 1 : 0),
      losses: st.losses + (outcome === 'loss' ? 1 : 0),
      draws: st.draws + (outcome === 'draw' ? 1 : 0),
      correct: st.correct + res.correct,
      answered: st.answered + res.total,
      bestScore: Math.max(st.bestScore, res.p),
      totalScore: st.totalScore + res.p,
      streak,
      bestStreak: Math.max(st.bestStreak, streak),
    },
    history: [
      { topic: topicId, outcome, p: res.p, b: res.b, bot: bot.name, botLevel: bot.level, correct: res.correct, total: res.total, xp: gained, at: Date.now() },
      ...save.history,
    ].slice(0, HISTORY_LIMIT),
  }
  return { next, gained, outcome }
}
