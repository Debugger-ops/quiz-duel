import { MongoClient } from 'mongodb'
import { MemoryDb } from './memdb.js'

export async function connect(uri, dbName = 'quizduel') {
  let db
  if (!uri || uri === 'memory') {
    console.log('[db] using the in-memory database (data is lost on restart). Set MONGODB_URI to use MongoDB Atlas.')
    db = new MemoryDb()
  } else {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
    await client.connect()
    db = client.db(dbName)
    console.log(`[db] connected to MongoDB database "${dbName}"`)
  }
  await db.collection('users').createIndex({ usernameLower: 1 }, { unique: true })
  await db.collection('questions').createIndex({ key: 1 }, { unique: true })
  await db.collection('questions').createIndex({ topic: 1 })
  return db
}
