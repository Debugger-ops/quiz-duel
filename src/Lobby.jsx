import React from 'react'

export default function Lobby({ topic, onBack, onQuick, onBot, onCreate }) {
  return (
    <div className="screen center" style={{ '--c': topic.color }}>
      <button className="back" onClick={onBack} data-testid="lobby-back">&larr; Topics</button>
      <div className="topic-badge">{topic.icon} {topic.name}</div>
      <h2 className="lobby-title">How do you want to play?</h2>
      <div className="lobby-modes">
        <button className="mode" onClick={onQuick} data-testid="mode-quick">
          <strong>⚔️ Quick match</strong>
          <span className="muted">Face a real player. If nobody is online in 12 s you get a bot.</span>
        </button>
        <button className="mode" onClick={onCreate} data-testid="mode-create">
          <strong>🔗 Play a friend</strong>
          <span className="muted">Create a room and share a 5-letter code.</span>
        </button>
        <button className="mode" onClick={onBot} data-testid="mode-bot">
          <strong>🤖 Practice vs bot</strong>
          <span className="muted">Instant match against a simulated opponent.</span>
        </button>
      </div>
    </div>
  )
}
