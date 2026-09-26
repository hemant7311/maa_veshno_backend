const Counter = require('../models/Counter')

/**
 * Atomic sequence counter using MongoDB findOneAndUpdate
 * @param {string} counterKey - Identifier for the counter (e.g. "invoiceNumber:2026-27", "returnNumber")
 * @param {import('mongoose').ClientSession} [session] - Optional Mongoose session for transaction safety
 * @returns {Promise<number>} - Next sequence number
 */
async function getNextSequence(counterKey, session = null) {
  const options = { new: true, upsert: true }
  if (session) options.session = session

  const counter = await Counter.findByIdAndUpdate(
    counterKey,
    { $inc: { seq: 1 } },
    options
  )
  return counter.seq
}

module.exports = {
  getNextSequence
}
