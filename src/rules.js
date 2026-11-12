// Game rules shared by the browser and the server.
export const QUESTIONS_PER_MATCH = 7
export const SECONDS_PER_QUESTION = 10
export const REVEAL_MS = 1800

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// 100 base + up to 100 speed bonus. Final question counts double.
export function points(correct, secondsTaken, isLast) {
  if (!correct) return 0
  const base = Math.round(100 + 100 * (1 - clamp(secondsTaken, 0, SECONDS_PER_QUESTION) / SECONDS_PER_QUESTION))
  return isLast ? base * 2 : base
}

export const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1
export const xpForLevel = (lvl) => Math.pow(lvl - 1, 2) * 60
