import React from 'react'

import { levelFromXp, xpForLevel } from './rules.js'
export { levelFromXp, xpForLevel }

const RANKS = [[18, 'Legend'], [12, 'Master'], [8, 'Veteran'], [5, 'Contender'], [3, 'Challenger'], [1, 'Rookie']]
export const rankFor = (lvl) => RANKS.find(([min]) => lvl >= min)[1]

export function Avatar({ name, color, size = 56 }) {
  return (
    <div className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}>
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  )
}

export function LevelBar({ xp }) {
  const lvl = levelFromXp(xp)
  const lo = xpForLevel(lvl)
  const hi = xpForLevel(lvl + 1)
  const pct = ((xp - lo) / (hi - lo)) * 100
  return (
    <div className="levelbar">
      <div className="levelbar-top">
        <span>Level {lvl}</span>
        <span className="muted">{xp - lo} / {hi - lo} XP</span>
      </div>
      <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
