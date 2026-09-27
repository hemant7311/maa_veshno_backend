const FinanceRecord = require('../models/FinanceRecord')
const User = require('../models/User')
const Sale = require('../models/Sale')
const Transaction = require('../models/Transaction')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const mongoose = require('mongoose')
const { generateEmiSchedule } = require('../utils/financeUtils')
const { syncAllFinanceSales } = require('../utils/financeSync')

const normalizeEntityName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildAgentUsername = async (agentName) => {
  const slug = String(agentName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'agent'

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const username = `${slug}-${crypto.randomBytes(3).toString('hex')}`
    if (!(await User.exists({ username }))) return username
  }
  throw new Error('Unable to generate a unique finance-agent username')
}

const findOrCreateAgent = async (entityName, session) => {
  const normalizedName = normalizeEntityName(entityName)
  const exactName = new RegExp(`^${escapeRegex(String(entityName).trim())}$`, 'i')
  let agent = await User.findOne({
    role: 'finance_agent',
    $or: [{ financeEntityKey: normalizedName }, { name: exactName }],
  }).session(session)

  if (agent) {
    if (!agent.financeEntityKey) {
      agent.financeEntityName = String(entityName).trim()
      agent.financeEntityKey = normalizedName
      await agent.save({ session })
    }
    return { agent, credentials: null, created: false }
  }

  const username = await buildAgentUsername(entityName)
  const temporaryPassword = crypto.randomBytes(12).toString('base64url')
  
  const createdAgents = await User.create([{
    name: String(entityName).trim(),
    username,
    email: `${username}@finance-agent.local`,
    password: await bcrypt.hash(temporaryPassword, 12),
    role: 'finance_agent',
    status: 'active',
    financeEntityName: String(entityName).trim(),
    financeEntityKey: normalizedName,
  }], { session })
  agent = createdAgents[0]

  return {
    agent,
    created: true,
    credentials: { username, password: temporaryPassword },
  }
}

const agentFinanceFilter = (user) => ({
  $or: [{ agentId: user._id }, { entityName: user.financeEntityName || '__no_finance_entity__' }],
})

exports.deleteFinanceEntity = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { entityName } = req.params
    const exactNameRegex = new RegExp(`^${escapeRegex(entityName.trim())}$`, 'i')

    const records = await FinanceRecord.find({ entityName: exactNameRegex }).session(session)
    if (records.length === 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Finance entity not found' })
    }

    const hasPayments = records.some(r => r.installments && r.installments.some(inst => inst.paidAmount > 0))
    if (hasPayments) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot delete entity: Some records have active payment history. Reverse payments first.' })
    }

    await FinanceRecord.deleteMany({ entityName: exactNameRegex }, { session })

    const privateRecord = records.find(r => r.financeType === 'Private')
    if (privateRecord) {
      await User.findOneAndDelete({ role: 'finance_agent', financeEntityName: exactNameRegex }, { session })
    }

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: `Successfully deleted entity and its ${records.length} records.` })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.updateFinanceEntity = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { entityName } = req.params
    const { newEntityName } = req.body
    if (!newEntityName || !newEntityName.trim()) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'New entity name is required' })
    }

    const exactNameRegex = new RegExp(`^${escapeRegex(entityName.trim())}$`, 'i')
    const newNameTrimmed = newEntityName.trim()
    const newNameNormalized = normalizeEntityName(newNameTrimmed)

    const result = await FinanceRecord.updateMany(
      { entityName: exactNameRegex },
      { $set: { entityName: newNameTrimmed } },
      { session }
    )

    if (result.matchedCount === 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Finance entity not found' })
    }

    await User.findOneAndUpdate(
      { role: 'finance_agent', financeEntityName: exactNameRegex },
      { $set: { financeEntityName: newNameTrimmed, financeEntityKey: newNameNormalized, name: newNameTrimmed } },
      { session }
    )

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: `Successfully updated entity name in ${result.modifiedCount} records.` })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.createFinanceRecord = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    if (req.user && req.user.role === 'wholesaler') {
      await session.abortTransaction()
      session.endSession()
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { financeType, entityName, customerName, mobileNumber, totalLimit, usedLimit, billRef, productDetails, emiAmount, tenure, emiPayDate } = req.body
    
    if (!financeType || !entityName || !customerName || !mobileNumber) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Missing required fields' })
    }

    if (totalLimit == null || (typeof totalLimit === 'string' && totalLimit.trim() === '')) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Total limit is missing or empty' })
    }

    const tLimit = Number(totalLimit);
    const uLimit = usedLimit === undefined ? 0 : Number(usedLimit);

    if (!Number.isFinite(tLimit) || tLimit <= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Total limit must be a finite number greater than 0' })
    }
    if (!Number.isFinite(uLimit) || uLimit < 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Used limit must be a valid non-negative finite number' })
    }
    if (uLimit > tLimit) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ success: false, message: 'Used limit cannot exceed total limit' })
    }

    const calculatedAvailableLimit = tLimit - uLimit;

    let agentAccount = null
    if (financeType === 'Private' && normalizeEntityName(entityName) !== 'self finance') {
      agentAccount = await findOrCreateAgent(entityName, session)
    }

    const schedule = generateEmiSchedule(tenure, Number(emiAmount) || 0, new Date(), 1, emiPayDate);

    const createdRecords = await FinanceRecord.create([{
      financeType,
      entityName,
      agentId: agentAccount?.agent._id || null,
      customerName,
      mobileNumber,
      totalLimit: tLimit,
      usedLimit: uLimit,
      availableLimit: calculatedAvailableLimit,
      billRef,
      productDetails,
      emiAmount,
      tenure,
      paymentDate: new Date(),
      installments: schedule
    }], { session })
    const record = createdRecords[0]

    const agentCredentials = agentAccount?.credentials
      ? { name: agentAccount.agent.name, username: agentAccount.credentials.username }
      : null

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, data: record, meta: { agentCredentials } })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    next(error)
  }
}

exports.getFinanceSummary = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'wholesaler') {
       return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Auto-sync existing/legacy finance sales into FinanceRecords
    await syncAllFinanceSales()

    const baseFilter = { status: { $nin: ['Cancelled', 'Draft', 'cancelled', 'draft'] } }
    const filter = req.user.role === 'finance_agent'
      ? { ...baseFilter, ...agentFinanceFilter(req.user) }
      : baseFilter

    const summary = await FinanceRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { entityName: '$entityName', financeType: '$financeType' },
          totalCount: { $sum: 1 },
          totalFinancedAmount: { $sum: '$usedLimit' },
          sampleAgentId: { $first: '$agentId' }
        }
      },
      {
        $project: {
          _id: 0,
          entityName: '$_id.entityName',
          financeType: '$_id.financeType',
          totalCount: 1,
          totalFinancedAmount: 1,
          sampleAgentId: 1
        }
      }
    ])

    const entities = summary.map(s => s.entityName)
    if (entities.length > 0) {
      const agents = await User.find({
        role: 'finance_agent',
        $or: [
          { financeEntityName: { $in: entities } },
          { _id: { $in: summary.map(s => s.sampleAgentId).filter(Boolean) } }
        ]
      }).select('_id name username financeEntityName')

      summary.forEach(s => {
        const agent = agents.find(a => 
          (s.sampleAgentId && String(a._id) === String(s.sampleAgentId)) ||
          (a.financeEntityName && String(a.financeEntityName).trim().toLowerCase() === String(s.entityName).trim().toLowerCase())
        )
        if (agent) {
          s.agentId = agent._id
          s.agentName = agent.name
          s.agentUsername = agent.username
        } else {
          s.agentId = s.sampleAgentId || 'N/A'
          s.agentName = s.entityName
          s.agentUsername = 'N/A'
        }
      })
    }

    res.status(200).json({ success: true, data: summary })
  } catch (error) {
    next(error)
  }
}

exports.getFinanceByEntity = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'wholesaler') {
       return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { entityName } = req.params
    const exactNameRegex = new RegExp(`^${escapeRegex(entityName.trim())}$`, 'i')
    const filter = req.user.role === 'finance_agent'
      ? agentFinanceFilter(req.user)
      : { entityName: exactNameRegex }

    const records = await FinanceRecord.find(filter).sort({ createdAt: -1 })
    res.status(200).json({ success: true, data: records })
  } catch (error) {
    next(error)
  }
}

exports.getCustomerFinanceDetails = async (req, res, next) => {
  try {
    const { mobileNumber } = req.params
    if (!mobileNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' })
    }

    const record = await FinanceRecord.findOne({ mobileNumber, status: { $ne: 'Cancelled' } }).sort({ createdAt: -1 })
    
    if (!record) {
      return res.status(404).json({ success: false, message: 'No active finance record found for this number' })
    }

    res.json({
      success: true,
      data: {
        _id: record._id,
        customerName: record.customerName,
        productDetails: record.productDetails,
        emiAmount: record.emiAmount,
        tenure: record.tenure,
        paymentDate: record.paymentDate,
        paidEmis: record.paidEmis || [],
        installments: record.installments || [],
        createdAt: record.createdAt,
        billRef: record.billRef,
        financeType: record.financeType,
        entityName: record.entityName,
        totalLimit: record.totalLimit,
        usedLimit: record.usedLimit
      }
    })
  } catch (error) {
    next(error)
  }
}

exports.getMyFinanceRecords = async (req, res, next) => {
  try {
    if (req.user.role !== 'finance_agent') {
      return res.status(403).json({ success: false, message: 'This endpoint is for finance agents only', errors: {} })
    }
    const records = await FinanceRecord.find(agentFinanceFilter(req.user)).sort({ createdAt: -1 })
    res.json({ success: true, data: records })
  } catch (error) {
    next(error)
  }
}

exports.updateEmiStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (req.user && req.user.role === 'wholesaler') {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { recordId, emiId } = req.params
    const { status, amount } = req.body
    
    const emiNumber = parseInt(emiId, 10)
    const record = await FinanceRecord.findById(recordId).session(session)
    if (!record) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Finance record not found' })
    }

    if (!record.installments || record.installments.length === 0) {
      const schedule = generateEmiSchedule(record.tenure, record.emiAmount, record.createdAt || new Date(), 1);
      (record.paidEmis || []).forEach(paidId => {
        const inst = schedule.find(s => s.installmentNumber === paidId);
        if (inst) {
          inst.paidAmount = inst.expectedAmount;
          inst.remainingAmount = 0;
          inst.status = 'Paid';
        }
      });
      record.installments = schedule;
    }

    const installment = record.installments.find(i => i.installmentNumber === emiNumber);
    if (!installment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Installment not found' });
    }

    let paymentAmount = amount !== undefined ? Number(amount) : installment.remainingAmount;
    let refundAmount = 0;

    if (status === 'Paid') {
      if (paymentAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(422).json({ success: false, message: 'Payment amount must be greater than zero.' });
      }
      if (paymentAmount > installment.remainingAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(422).json({ success: false, message: `Payment (₹${paymentAmount}) exceeds valid outstanding amount (₹${installment.remainingAmount}).` });
      }

      installment.paidAmount += paymentAmount;
      installment.remainingAmount -= paymentAmount;
      
      if (installment.remainingAmount === 0) {
        installment.status = 'Paid';
        if (!record.paidEmis.includes(emiNumber)) {
          record.paidEmis.push(emiNumber);
        }
      } else {
        installment.status = 'Partially Paid';
      }
      installment.paymentDate = new Date();

      await Transaction.create([{
        transactionType: 'emi_payment',
        referenceId: record._id,
        referenceNumber: record.billRef || `EMI-${record._id}`,
        description: `EMI Payment ${emiNumber} for ${record.customerName}`,
        amount: paymentAmount,
        paymentMethod: 'cash',
        relatedEntity: record.customerName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      }], { session });

    } else if (status === 'Pending') {
      if (installment.paidAmount === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(422).json({ success: false, message: 'No payment exists to reverse.' });
      }
      
      refundAmount = installment.paidAmount;
      installment.paidAmount = 0;
      installment.remainingAmount = installment.expectedAmount;
      installment.status = 'Pending';
      installment.paymentDate = null;
      record.paidEmis = record.paidEmis.filter(id => id !== emiNumber);

      await Transaction.create([{
        transactionType: 'refund',
        referenceId: record._id,
        referenceNumber: record.billRef || `EMI-${record._id}`,
        description: `EMI Payment ${emiNumber} REVERSAL for ${record.customerName}`,
        amount: refundAmount,
        paymentMethod: 'cash',
        relatedEntity: record.customerName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      }], { session });
    }

    await record.save({ session });

    // Two-way sync to Sale document if present
    if (record.saleId || record.billRef) {
      const sale = await Sale.findOne({ $or: [{ _id: record.saleId }, { invoiceNumber: record.billRef }] }).session(session)
      if (sale && sale.installmentSchedule) {
        const saleInst = sale.installmentSchedule.find(s => s.installmentNumber === emiNumber)
        if (saleInst) {
          saleInst.paidAmount = installment.paidAmount
          saleInst.actualPaymentDate = installment.paymentDate
          saleInst.status = installment.status === 'Paid' ? 'paid' : (installment.status === 'Partially Paid' ? 'partial' : 'pending')
          
          if (status === 'Paid' && paymentAmount > 0) {
            sale.amountPaid = (sale.amountPaid || 0) + paymentAmount
          } else if (status === 'Pending' && refundAmount > 0) {
            sale.amountPaid = Math.max(0, (sale.amountPaid || 0) - refundAmount)
          }
          sale.amountDue = Math.max(0, (sale.grandTotal || 0) - sale.amountPaid)
          if (sale.amountDue <= 0) sale.billStatus = 'paid'
          else if (sale.amountPaid > 0) sale.billStatus = 'partially_paid'
          else sale.billStatus = 'due'

          await sale.save({ session })
        }
      }
    }

    await session.commitTransaction();
    session.endSession();
    
    res.json({ success: true, data: record });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error)
  }
}
