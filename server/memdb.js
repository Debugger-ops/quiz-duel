// Tiny in-memory stand-in for the handful of MongoDB calls the app uses.
// Used when MONGODB_URI=memory (zero-setup trial runs and tests).
import { randomUUID } from 'node:crypto'

const matches = (doc, q = {}) =>
  Object.entries(q).every(([k, cond]) => {
    const v = doc[k]
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond) return cond.$in.includes(v)
      if ('$nin' in cond) return !cond.$nin.includes(v)
      if ('$ne' in cond) return v !== cond.$ne
      if ('$lt' in cond) return v < cond.$lt
      if ('$gt' in cond) return v > cond.$gt
    }
    return v === cond
  })

class Cursor {
  constructor(docs) { this.docs = docs }
  async toArray() { return this.docs.map((d) => structuredClone(d)) }
}

class Collection {
  constructor() { this.docs = []; this.unique = [] }
  async createIndex(spec, opts = {}) { if (opts.unique) this.unique.push(Object.keys(spec)[0]) }
  _checkUnique(doc) {
    for (const f of this.unique) {
      if (this.docs.some((d) => d._id !== doc._id && d[f] === doc[f])) {
        const e = new Error(`E11000 duplicate key: ${f}`)
        e.code = 11000
        throw e
      }
    }
  }
  async insertOne(doc) {
    const d = { _id: randomUUID(), ...structuredClone(doc) }
    this._checkUnique(d)
    this.docs.push(d)
    return { insertedId: d._id }
  }
  async insertMany(docs) { for (const d of docs) await this.insertOne(d); return { insertedCount: docs.length } }
  async findOne(q) { const d = this.docs.find((x) => matches(x, q)); return d ? structuredClone(d) : null }
  find(q) { return new Cursor(this.docs.filter((x) => matches(x, q))) }
  async countDocuments(q) { return this.docs.filter((x) => matches(x, q)).length }
  async updateOne(q, update, opts = {}) {
    let d = this.docs.find((x) => matches(x, q))
    if (!d && opts.upsert) {
      d = { _id: q._id ?? randomUUID(), ...Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v !== 'object')) }
      this.docs.push(d)
    }
    if (!d) return { matchedCount: 0 }
    Object.assign(d, structuredClone(update.$set || {}))
    this._checkUnique(d)
    return { matchedCount: 1 }
  }
  async deleteOne(q) {
    const i = this.docs.findIndex((x) => matches(x, q))
    if (i >= 0) this.docs.splice(i, 1)
    return { deletedCount: i >= 0 ? 1 : 0 }
  }
}

export class MemoryDb {
  constructor() { this.cols = new Map() }
  collection(name) {
    if (!this.cols.has(name)) this.cols.set(name, new Collection())
    return this.cols.get(name)
  }
}
