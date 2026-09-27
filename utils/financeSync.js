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
 * Resolve finance type based on explicit sale.financeDetails.financeType and legacy fallbacks
 */
function resolveFinanceType(sale, existingRecord = null) {
  const explicit = sale?.financeDetails?.financeType
  if (explicit === 'private') return { type: 'Private', reason: 'Explicit sale.financeDetails.financeType is private' }
  if (explicit === 'company') return { type: 'Company', reason: 'Explicit sale.financeDetails.financeType is company' }

  const companyStr = String(sale?.financeDetails?.company || existingRecord?.entityName || '').trim()
  const normalized = companyStr.replace(/\s+/g, ' ').toLowerCase()

  // Rule 2: "Self Finance" entity name -> Private
  if (normalized === 'self finance') {
    return { type: 'Private', reason: 'Entity is Self Finance' }
  }

  // Rule 3: Existing fileNo -> Private
  if (sale?.financeDetails?.fileNo) {
    return { type: 'Private', reason: 'fileNo present' }
  }

  // Rule 4: Existing loanId -> Company
  if (sale?.financeDetails?.loanId) {
    return { type: 'Company', reason: 'loanId present' }
  }

  // Rule 5: Existing FinanceRecord.financeType
  if (existingRecord?.financeType) {
    return { type: existingRecord.financeType, reason: 'Preserving existing FinanceRecord.financeType' }
  }

  // Rule 6: Ambiguous record
  return { type: 'Company', reason: 'Ambiguous legacy record (defaulted to Company)', isAmbiguous: true }
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

  let existingRecord = await FinanceRecord.findOne({
    $or: [{ saleId: sale._id }, { billRef: sale.invoiceNumber }]
  }).session(session)

  const { type: financeType } = resolveFinanceType(sale, existingRecord)
  const company = sale.financeDetails?.company || 'Company Finance'
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

/**
 * Safe one-time migration to correct financeType on existing FinanceRecord & Sale documents
 */
async function migrateLegacyFinanceRecords() {
  console.log('[FINANCE TYPE MIGRATION] Starting database audit & migration...')
  let companyCorrected = 0
  let privateCorrected = 0
  let ambiguousCount = 0
  let totalAudited = 0

  try {
    const records = await FinanceRecord.find({})
    totalAudited = records.length

    for (const record of records) {
      let sale = null
      if (record.saleId) {
        sale = await Sale.findById(record.saleId)
      }
      if (!sale && record.billRef) {
        sale = await Sale.findOne({ invoiceNumber: record.billRef })
      }

      const { type: newType, reason, isAmbiguous } = resolveFinanceType(sale, record)

      if (isAmbiguous) {
        ambiguousCount++
        console.log(`[FINANCE TYPE MIGRATION] AMBIGUOUS: Invoice: ${record.billRef || 'N/A'}, Entity: ${record.entityName}, Current: ${record.financeType}. Manual review required.`)
        continue
      }

      const oldType = record.financeType

      if (oldType !== newType) {
        console.log(`[FINANCE TYPE MIGRATION] Invoice: ${record.billRef || 'N/A'}, Entity: ${record.entityName}, Old: ${oldType}, New: ${newType}, Reason: ${reason}`)
        record.financeType = newType
        await record.save()
        if (newType === 'Private') privateCorrected++
        if (newType === 'Company') companyCorrected++
      }

      // Also ensure sale.financeDetails.financeType matches
      if (sale && sale.financeDetails) {
        const expectedSaleType = newType.toLowerCase()
        if (sale.financeDetails.financeType !== expectedSaleType) {
          sale.financeDetails.financeType = expectedSaleType
          await sale.save()
        }
      }
    }

    console.log(`[FINANCE TYPE MIGRATION] Complete. Total Audited: ${totalAudited}, Private Corrected: ${privateCorrected}, Company Corrected: ${companyCorrected}, Ambiguous: ${ambiguousCount}`)
    return { totalAudited, privateCorrected, companyCorrected, ambiguousCount }
  } catch (err) {
    console.error('[FINANCE TYPE MIGRATION] Failed:', err.message)
    return { totalAudited, privateCorrected, companyCorrected, ambiguousCount, error: err.message }
  }
}

module.exports = {
  syncFinanceRecordFromSale,
  syncAllFinanceSales,
  migrateLegacyFinanceRecords,
  findOrCreateFinanceAgent,
  resolveFinanceType
}
