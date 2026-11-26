const mongoose = require('mongoose')

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookstore'

let pending = null

/**
 * Connect on demand and reuse the connection.
 *
 * Serverless hosts such as Vercel pause the process as soon as a response is
 * sent, so a connection started in the background at import time can stall
 * and fail, and Mongoose never retries a failed first connection. Awaiting
 * this inside the request keeps the process alive until the database answers,
 * and a failed attempt is cleared so the next request tries again.
 */
function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection)
  if (!pending) {
    pending = mongoose
      .connect(mongoUri, { serverSelectionTimeoutMS: 8000 })
      .then((m) => {
        console.log('MongoDB Connected successfully')
        return m.connection
      })
      .catch((err) => {
        pending = null
        console.error('MongoDB Connection error: ' + err.message)
        throw err
      })
  }
  return pending
}

module.exports = connectDB
