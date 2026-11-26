/**
 * Seed the archive with the twelve Bibliotheca Obscura folios (seed/specimens.json).
 *
 *   npm run seed                 add every folio whose title is not in the database yet
 *   npm run seed -- --replace    also delete every book that is not one of the folios
 *
 * Each run first saves all current books to seed/backups/books-<time>.json.
 * That folder is git-ignored because the backups hold buyers' email addresses.
 * Uses MONGODB_URI from backend/.env, so it writes to whichever database that names.
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const mongoose = require('mongoose')
const books = require('../models/bookModel')
const specimens = require('./specimens.json')

async function main() {
  const replace = process.argv.includes('--replace')
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in backend/.env')

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  console.log(`Connected to database "${mongoose.connection.name}"`)

  const current = await books.find().lean()
  const dir = path.join(__dirname, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `books-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n')
  console.log(`Backed up ${current.length} book(s) to ${path.relative(process.cwd(), file)}`)

  const present = new Set(current.map((b) => b.title))
  const missing = specimens.filter((s) => !present.has(s.title))
  if (missing.length > 0) await books.insertMany(missing)
  console.log(`Added ${missing.length} folio(s); ${specimens.length - missing.length} were already there`)

  if (replace) {
    const titles = specimens.map((s) => s.title)
    const { deletedCount } = await books.deleteMany({ title: { $nin: titles } })
    console.log(`Removed ${deletedCount} other book(s)`)
  }

  console.log(`The shelf now holds ${await books.countDocuments()} book(s)`)
}

main()
  .catch((err) => {
    console.error(`Seed failed: ${err.message}`)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
