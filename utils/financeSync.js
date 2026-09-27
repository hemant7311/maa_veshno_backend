const FinanceRecord = require('../models/FinanceRecord')
const Sale = require('../models/Sale')
const User = require('../models/User')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const normalizeEntityName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Find or create a finance_agent User for private/company finance
 */
async function findOrCreateFinanceAgent(entityName, session) {
  if (!entityName || !entityName.trim()) return null
  const trimmed = entityName.trim()
  const normalizedKey = normalizeEntityName(trimmed)

  let agent = await User.findOne({
    role: 'finance_agent',
    $or: [{ financeEntityKey: normalizedKey }, { name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') }]
  }).session(session)

  if (agent) return agent

  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'agent'
  let username = `${slug}-${crypto.randomBytes(3).toString('hex')}`
  let counter = 0
  while (await User.exists({ username })) {
    username = `${slug}-${crypto.randomBytes(3).toString('hex')}`
    counter++
    if (counter > 10) break
  }

  const temporaryPassword = crypto.randomBytes(12).toString('base64url')
  const hashedPassword = await bcrypt.hash(temporaryPassword, 12)

  const created = await User.create([{
    name: trimmed,
    username,
    email: `${username}@finance-agent.local`,
    password: hashedPassword,
    role: 'finance_agent',
    status: 'active',
    financeEntityName: trimmed,
    financeEntityKey: normalizedKey
  }], { session, ordered: true })

  return created[0]
}

/**
 * Synchronize or create a FinanceRecord for a given Sale
 */
async function syncFinanceRecordFromSale(sale, session = null) {
  if (!sale) return null

  const isFinanceSale = sale.paymentMode === 'finance' || !!(sale.financeDetails && (sale.financeDetails.company || sale.financeDetails.emiAmount))
  if (!isFinanceSale) {
    if (sale._id) {
      await FinanceRecord.updateMany(
        { $or: [{ saleId: sale._id }, { billRef: sale.invoiceNumber }] },
        { $set: { status: 'Cancelled' } },
        { session }
      )
    }
    return null
  }

  const company = sale.financeDetails?.company || 'Company Finance'
  const isPrivate = (sale.financeDetails?.company || '').toLowerCase().includes('private') || (sale.financeDetails?.company || '').toLowerCase().includes('smarthub')
  const financeType = isPrivate ? 'Private' : 'Company'
  const entityName = String(company).trim()

  let agentId = null
  if (entityName) {
    const agent = await findOrCreateFinanceAgent(entityName, session)
    if (agent) agentId = agent._id
  }

  const isDraft = sale.billStatus === 'draft'
  const isCancelled = sale.status === 'cancelled' || sale.billStatus === 'cancelled'
  const recordStatus = isCancelled ? 'Cancelled' : (isDraft ? 'Draft' : 'Active')

  const grandTotal = Number(sale.grandTotal) || 0
  const dpAmount = Number(sale.financeDetails?.dpAmount) || 0
  const financedAmount = Math.max(0, grandTotal - dpAmount)

  const productDetails = (sale.items || []).map(i => {
    const pName = i.productName || 'Product'
    const imeiStr = i.imei && i.imei !== 'N/A' && i.imei !== '—' ? ` (IMEI: ${i.imei})` : ''
    return `${pName}${imeiStr}`
  }).join(', ')

  const emiAmount = Number(sale.financeDetails?.emiAmount) || 0
  const tenure = String(sale.financeDetails?.tenure || '6')

  const installments = (sale.installmentSchedule || []).map(inst => {
    const dueAmt = Number(inst.dueAmount) || 0
    const paidAmt = Number(inst.paidAmount) || 0
    const remAmt = Math.max(0, dueAmt - paidAmt)

    let status = 'Pending'
    if (inst.status === 'paid' || remAmt <= 0) status = 'Paid'
    else if (inst.status === 'due' || (inst.dueDate && new Date(inst.dueDate) <= new Date())) status = 'Overdue'
    else if (paidAmt > 0) status = 'Partially Paid'

    return {
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate || new Date(),
      expectedAmount: dueAmt,
      paidAmount: paidAmt,
      remainingAmount: remAmt,
      status,
      paymentDate: inst.actualPaymentDate || null,
      paymentMethod: inst.paymentMethod || '',
      reference: inst.reference || ''
    }
  })

  let existingRecord = await FinanceRecord.findOne({
    $or: [{ saleId: sale._id }, { billRef: sale.invoiceNumber }]
  }).session(session)

  if (existingRecord) {
    existingRecord.saleId = sale._id
    existingRecord.financeType = financeType
    existingRecord.entityName = entityName
    if (agentId) existingRecord.agentId = agentId
    existingRecord.customerName = sale.customerName
    existingRecord.mobileNumber = sale.phone
    existingRecord.totalLimit = grandTotal
    existingRecord.usedLimit = financedAmount
    existingRecord.availableLimit = 0
    existingRecord.status = recordStatus
    existingRecord.billRef = sale.invoiceNumber
    existingRecord.productDetails = productDetails
    existingRecord.emiAmount = emiAmount
    existingRecord.tenure = tenure
    existingRecord.paymentDate = sale.createdAt || new Date()

    if (installments.length > 0) {
      existingRecord.installments = installments
    }

    await existingRecord.save({ session })
    return existingRecord
  } else {
    const newRecords = await FinanceRecord.create([{
      saleId: sale._id,
      financeType,
      entityName,
      agentId,
      customerName: sale.customerName,
      mobileNumber: sale.phone,
      totalLimit: grandTotal,
      usedLimit: financedAmount,
      availableLimit: 0,
      status: recordStatus,
      billRef: sale.invoiceNumber,
      productDetails,
      emiAmount,
      tenure,
      paymentDate: sale.createdAt || new Date(),
      installments
    }], { session, ordered: true })

    return newRecords[0]
  }
}

/**
 * Idempotently scan and sync all existing finance sales in the database
 */
async function syncAllFinanceSales() {
  try {
    const financeSales = await Sale.find({
      $or: [
        { paymentMode: 'finance' },
        { 'financeDetails.company': { $exists: true, $ne: '' } }
      ]
    })

    for (const sale of financeSales) {
      try {
        await syncFinanceRecordFromSale(sale)
      } catch (err) {
        console.error(`[FINANCE SYNC] Error syncing sale ${sale.invoiceNumber}:`, err.message)
      }
    }
  } catch (err) {
    console.error('[FINANCE SYNC] Error loading finance sales for auto-sync:', err.message)
  }
}

module.exports = {
  syncFinanceRecordFromSale,
  syncAllFinanceSales,
  findOrCreateFinanceAgent
}
