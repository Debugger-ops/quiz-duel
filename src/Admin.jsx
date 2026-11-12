import React, { useEffect, useState } from 'react'
import { TOPICS } from './questions.js'
import { api } from './api.js'

const blank = { topic: TOPICS[0].id, q: '', a: '', w1: '', w2: '', w3: '', image: '' }

export default function Admin() {
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState(blank)
  const [msg, setMsg] = useState({ ok: true, text: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = () => api.adminStats().then(setStats).catch(() => {})
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!stats?.opentdb?.running) return undefined
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [stats?.opentdb?.running])

  async function add(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.adminAddQuestion({ topic: form.topic, q: form.q, a: form.a, w: [form.w1, form.w2, form.w3], image: form.image })
      setMsg({ ok: true, text: 'Question added.' })
      setForm({ ...blank, topic: form.topic })
      load()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
    setBusy(false)
  }

  async function refresh() {
    try {
      await api.adminRefresh()
      setMsg({ ok: true, text: 'Fetching fresh questions from the internet. This takes about 90 seconds.' })
      setTimeout(load, 1000)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  return (
    <>
      <h2 className="section">Admin · question bank</h2>
      <div className="card admin">
        {stats && (
          <p className="muted">
            {stats.total} questions in MongoDB ({Object.entries(stats.bySource).map(([k, v]) => `${v} ${k}`).join(' · ')})
            {stats.opentdb?.running ? ' · fetching from the internet…' : ''}
          </p>
        )}
        <button className="btn" onClick={refresh} disabled={stats?.opentdb?.running}>Fetch fresh questions from the internet</button>

        <form className="subform" onSubmit={add}>
          <select value={form.topic} onChange={set('topic')} aria-label="Topic">
            {TOPICS.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
          </select>
          <input placeholder="Question" value={form.q} onChange={set('q')} />
          <input placeholder="Correct answer" value={form.a} onChange={set('a')} />
          <input placeholder="Wrong answer 1" value={form.w1} onChange={set('w1')} />
          <input placeholder="Wrong answer 2" value={form.w2} onChange={set('w2')} />
          <input placeholder="Wrong answer 3" value={form.w3} onChange={set('w3')} />
          <input placeholder="Image URL (optional)" value={form.image} onChange={set('image')} />
          {form.image && /^https?:\/\//i.test(form.image) && <img className="q-image preview" src={form.image} alt="Preview" />}
          <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>
          <button className="btn primary" disabled={busy || !form.q || !form.a}>Add question</button>
        </form>
      </div>
    </>
  )
}
