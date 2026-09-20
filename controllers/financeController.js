const FinanceRecord = require('../models/FinanceRecord')
const User = require('../models/User')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const normalizeEntityName = (value) => String(value).trim().replace(/\s+/g, ' ').toLowerCase()
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

const findOrCreateAgent = async (entityName) => {
  const normalizedName = normalizeEntityName(entityName)
  const exactName = new RegExp(`^${escapeRegex(String(entityName).trim())}$`, 'i')
  let agent = await User.findOne({
    role: 'finance_agent',
    $or: [{ financeEntityKey: normalizedName }, { name: exactName }],
  })

  if (agent) {
    if (!agent.financeEntityKey) {
      agent.financeEntityName = String(entityName).trim()
      agent.financeEntityKey = normalizedName
      await agent.save()
    }
    return { agent, credentials: null, created: false }
  }

  const username = await buildAgentUsername(entityName)
  const temporaryPassword = crypto.randomBytes(12).toString('base64url')
  agent = await User.create({
    name: String(entityName).trim(),
    username,
    email: `${username}@finance-agent.local`,
    password: await bcrypt.hash(temporaryPassword, 12),
    initialPassword: temporaryPassword,
    role: 'finance_agent',
    status: 'active',
    financeEntityName: String(entityName).trim(),
    financeEntityKey: normalizedName,
  })

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
  try {
    const { entityName } = req.params
    const exactNameRegex = new RegExp(`^${escapeRegex(entityName.trim())}$`, 'i')

    // Find all finance records for this entity
    const records = await FinanceRecord.find({ entityName: exactNameRegex })
    if (records.length === 0) {
      return res.status(404).json({ success: false, message: 'Finance entity not found' })
    }

    // Delete records
    await FinanceRecord.deleteMany({ entityName: exactNameRegex })

    // If any record was 'Private', check if a finance_agent user exists and delete them
    const privateRecord = records.find(r => r.financeType === 'Private')
    if (privateRecord) {
      await User.findOneAndDelete({ role: 'finance_agent', financeEntityName: exactNameRegex })
    }

    res.json({ success: true, message: `Successfully deleted entity and its ${records.length} records.` })
  } catch (error) {
    next(error)
  }
}

exports.updateFinanceEntity = async (req, res, next) => {
  try {
    const { entityName } = req.params
    const { newEntityName } = req.body
    if (!newEntityName || !newEntityName.trim()) {
      return res.status(400).json({ success: false, message: 'New entity name is required' })
    }

    const exactNameRegex = new RegExp(`^${escapeRegex(entityName.trim())}$`, 'i')
    const newNameTrimmed = newEntityName.trim()
    const newNameNormalized = normalizeEntityName(newNameTrimmed)

    // Update all finance records
    const result = await FinanceRecord.updateMany(
      { entityName: exactNameRegex },
      { $set: { entityName: newNameTrimmed } }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Finance entity not found' })
    }

    // Also update associated user if Private
    await User.findOneAndUpdate(
      { role: 'finance_agent', financeEntityName: exactNameRegex },
      { $set: { financeEntityName: newNameTrimmed, financeEntityKey: newNameNormalized, name: newNameTrimmed } }
    )

    res.json({ success: true, message: `Successfully updated entity name in ${result.modifiedCount} records.` })
  } catch (error) {
    next(error)
  }
}

exports.createFinanceRecord = async (req, res, next) => {
  let newlyCreatedAgent = null
  try {
    // Ignoring availableLimit from client to ensure backend is the single source of truth
    const { financeType, entityName, customerName, mobileNumber, totalLimit, usedLimit, billRef, productDetails, emiAmount, tenure } = req.body
    console.log('Finance POST Payload:', req.body);
    
    if (!financeType || !entityName || !customerName || !mobileNumber) {
      return res.status(400).json({ success: false, message: 'Missing required fields' })
    }

    if (totalLimit == null || (typeof totalLimit === 'string' && totalLimit.trim() === '')) {
      return res.status(400).json({ success: false, message: 'Total limit is missing or empty' })
    }
    if (usedLimit !== undefined && (usedLimit === null || (typeof usedLimit === 'string' && usedLimit.trim() === ''))) {
      return res.status(400).json({ success: false, message: 'Used limit cannot be empty when provided' })
    }

    const tLimit = Number(totalLimit);
    const uLimit = usedLimit === undefined ? 0 : Number(usedLimit);

    if (!Number.isFinite(tLimit) || tLimit <= 0) {
      return res.status(400).json({ success: false, message: 'Total limit must be a finite number greater than 0' })
    }
    if (!Number.isFinite(uLimit) || uLimit < 0) {
      return res.status(400).json({ success: false, message: 'Used limit must be a valid non-negative finite number' })
    }
    if (uLimit > tLimit) {
      return res.status(400).json({ success: false, message: 'Used limit cannot exceed total limit' })
    }

    const calculatedAvailableLimit = tLimit - uLimit;

    let agentAccount = null
    if (financeType === 'Private' && normalizeEntityName(entityName) !== 'self finance') {
      agentAccount = await findOrCreateAgent(entityName)
      if (agentAccount.created) newlyCreatedAgent = agentAccount.agent
    }

    const record = new FinanceRecord({
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
      paymentDate: new Date()
    })

    await record.save()

    const agentCredentials = agentAccount?.credentials
      ? { name: agentAccount.agent.name, ...agentAccount.credentials }
      : null

    res.status(201).json({ success: true, data: record, meta: { agentCredentials } })
  } catch (error) {
    if (newlyCreatedAgent) await User.findByIdAndDelete(newlyCreatedAgent._id).catch(() => {})
    next(error)
  }
}

exports.getFinanceSummary = async (req, res, next) => {
  try {
    const filter = req.user.role === 'finance_agent'
      ? agentFinanceFilter(req.user)
      : {}
    const summary = await FinanceRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { entityName: '$entityName', financeType: '$financeType' },
          totalCount: { $sum: 1 },
          totalFinancedAmount: { $sum: '$usedLimit' }
        }
      },
      {
        $project: {
          _id: 0,
          entityName: '$_id.entityName',
          financeType: '$_id.financeType',
          totalCount: 1,
          totalFinancedAmount: 1
        }
      }
    ])

    // Fetch and attach agent credentials for Private finances
    const privateEntities = summary.filter(s => s.financeType === 'Private').map(s => s.entityName)
    if (privateEntities.length > 0) {
      const agents = await User.find({ role: 'finance_agent', financeEntityName: { $in: privateEntities } }).select('financeEntityName username initialPassword')
      // Debug logic to see what is failing
      summary.forEach(s => {
        if (s.financeType === 'Private') {
          const agent = agents.find(a => String(a.financeEntityName).trim().toLowerCase() === String(s.entityName).trim().toLowerCase())
          if (agent) {
            s.agentUsername = agent.username
            s.agentPassword = agent.initialPassword
          } else {
            s.agentUsername = 'Not Found'
            s.agentPassword = 'Not Found'
          }
        }
      })

      res.status(200).json({ success: true, data: summary, debug_agents: agents.map(a => a.financeEntityName) })
    } else {
      res.status(200).json({ success: true, data: summary })
    }
  } catch (error) {
    next(error)
  }
}

exports.getFinanceByEntity = async (req, res, next) => {
  try {
    const { entityName } = req.params
    const filter = req.user.role === 'finance_agent'
      ? agentFinanceFilter(req.user)
      : { entityName }
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

    // Find the latest active finance record for this customer
    const record = await FinanceRecord.findOne({ mobileNumber, status: 'Active' }).sort({ createdAt: -1 })
    
    if (!record) {
      return res.status(404).json({ success: false, message: 'No active finance record found for this number' })
    }

    // Only return safe public details
    res.json({
      success: true,
      data: {
        customerName: record.customerName,
        productDetails: record.productDetails,
        emiAmount: record.emiAmount,
        tenure: record.tenure,
        paymentDate: record.paymentDate,
        paidEmis: record.paidEmis || [],
        createdAt: record.createdAt,
        billRef: record.billRef
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
  try {
    const { recordId, emiId } = req.params
    const { status } = req.body // 'Paid' or 'Pending'
    const record = await FinanceRecord.findById(recordId)
    if (!record) {
      return res.status(404).json({ success: false, message: 'Finance record not found' })
    }
    
    const emiNumber = parseInt(emiId, 10)
    const currentPaid = new Set(record.paidEmis || [])
    
    if (status === 'Paid') {
      currentPaid.add(emiNumber)
    } else {
      currentPaid.delete(emiNumber)
    }
    
    record.paidEmis = Array.from(currentPaid)
    await record.save()
    
    res.json({ success: true, data: record })
  } catch (error) {
    next(error)
  }
}
