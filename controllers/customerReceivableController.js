const CustomerReceivable = require('../models/CustomerReceivable')
const CustomerReceivablePayment = require('../models/CustomerReceivablePayment')
const Customer = require('../models/Customer')
const Transaction = require('../models/Transaction')

const getAllReceivables = async (req, res) => {
  try {
    const receivables = await CustomerReceivable.find()
      .populate('customer', 'customerName phone address')
      .sort({ createdAt: -1 })
    res.json({ success: true, message: 'Receivables loaded', data: receivables })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load receivables', errors: { error: error.message } })
  }
}

const getReceivableById = async (req, res) => {
  try {
    const receivable = await CustomerReceivable.findById(req.params.id)
      .populate('customer', 'customerName phone address')
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    res.json({ success: true, message: 'Receivable loaded', data: receivable })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load receivable', errors: { error: error.message } })
  }
}

const createReceivable = async (req, res) => {
  try {
    const { customer, customerName, mobile, givenAmount, date, notes } = req.body
    if (!customerName || givenAmount === undefined || givenAmount === null) {
      return res.status(422).json({ success: false, message: 'Customer name and given amount are required', errors: {} })
    }
    let customerDoc = null
    if (customer) {
      customerDoc = await Customer.findById(customer)
      if (!customerDoc) return res.status(404).json({ success: false, message: 'Customer not found', errors: {} })
    } else if (mobile) {
      customerDoc = await Customer.findOne({ phone: mobile })
      if (!customerDoc) customerDoc = await Customer.create({ customerName, phone: mobile, customerType: 'retail' })
    }
    const receivable = await CustomerReceivable.create({
      customer: customerDoc ? customerDoc._id : null,
      customerName: customerDoc ? customerDoc.customerName : customerName,
      mobile: customerDoc ? customerDoc.phone : (mobile || ''),
      givenAmount, receivedAmount: 0,
      date: date || Date.now(), notes: notes || '', status: 'pending'
    })
    // Create transaction
    await Transaction.create({
      transactionType: 'customer_receivable_payment',
      referenceId: receivable._id,
      referenceNumber: receivable._id.toString(),
      description: `Money given to ${customerName}`,
      amount: givenAmount,
      paymentMethod: 'cash',
      relatedEntity: customerName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    })
    res.status(201).json({ success: true, message: 'Receivable created successfully', data: receivable })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create receivable', errors: { error: error.message } })
  }
}

const updateReceivable = async (req, res) => {
  try {
    const { customerName, mobile, givenAmount, date, notes } = req.body
    const receivable = await CustomerReceivable.findById(req.params.id)
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    if (receivable.status === 'cancelled') return res.status(422).json({ success: false, message: 'Cannot update a cancelled receivable', errors: {} })
    if (customerName !== undefined) receivable.customerName = customerName
    if (mobile !== undefined) receivable.mobile = mobile
    if (givenAmount !== undefined) {
      if (givenAmount < receivable.receivedAmount) {
        return res.status(422).json({ success: false, message: 'Given amount cannot be less than received amount', errors: {} })
      }
      receivable.givenAmount = givenAmount
    }
    if (date !== undefined) receivable.date = date
    if (notes !== undefined) receivable.notes = notes
    await receivable.save()
    res.json({ success: true, message: 'Receivable updated successfully', data: receivable })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update receivable', errors: { error: error.message } })
  }
}

const deleteReceivable = async (req, res) => {
  try {
    const receivable = await CustomerReceivable.findById(req.params.id)
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    await CustomerReceivablePayment.deleteMany({ receivable: receivable._id })
    await CustomerReceivable.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Receivable deleted successfully', data: {} })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete receivable', errors: { error: error.message } })
  }
}

const cancelReceivable = async (req, res) => {
  try {
    const receivable = await CustomerReceivable.findById(req.params.id)
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    if (receivable.status === 'cancelled') return res.status(422).json({ success: false, message: 'Receivable is already cancelled', errors: {} })
    receivable.status = 'cancelled'
    receivable.cancelledAt = new Date()
    await receivable.save()
    res.json({ success: true, message: 'Receivable cancelled successfully', data: receivable })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel receivable', errors: { error: error.message } })
  }
}

const giveMoney = async (req, res) => {
  try {
    const { amount, date, paymentMethod, reference, notes } = req.body
    const receivableId = req.params.id
    if (!amount || amount <= 0) return res.status(422).json({ success: false, message: 'Amount must be greater than 0', errors: {} })
    const receivable = await CustomerReceivable.findById(receivableId)
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    if (receivable.status === 'cancelled') return res.status(422).json({ success: false, message: 'Cannot give money for a cancelled receivable', errors: {} })
    const payment = await CustomerReceivablePayment.create({
      receivable: receivableId, type: 'give', amount, date: date || Date.now(),
      paymentMethod: paymentMethod || 'cash', reference: reference || '', notes: notes || ''
    })
    receivable.givenAmount += amount
    await receivable.save()
    await Transaction.create({
      transactionType: 'customer_receivable_payment',
      referenceId: receivable._id, referenceNumber: receivableId,
      description: `Additional money given to ${receivable.customerName}`,
      amount, paymentMethod: paymentMethod || 'cash',
      relatedEntity: receivable.customerName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    })
    res.status(201).json({ success: true, message: 'Money given recorded successfully', data: payment })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to record give money', errors: { error: error.message } })
  }
}

const receiveMoney = async (req, res) => {
  try {
    const { amount, date, paymentMethod, reference, notes } = req.body
    const receivableId = req.params.id
    if (!amount || amount <= 0) return res.status(422).json({ success: false, message: 'Amount must be greater than 0', errors: {} })
    const receivable = await CustomerReceivable.findById(receivableId)
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    if (receivable.status === 'cancelled') return res.status(422).json({ success: false, message: 'Cannot receive money for a cancelled receivable', errors: {} })
    if (amount > receivable.remainingAmount) {
      return res.status(422).json({
        success: false,
        message: `Receive amount (${amount}) cannot exceed remaining amount (${receivable.remainingAmount})`,
        errors: {}
      })
    }
    const payment = await CustomerReceivablePayment.create({
      receivable: receivableId, type: 'receive', amount, date: date || Date.now(),
      paymentMethod: paymentMethod || 'cash', reference: reference || '', notes: notes || ''
    })
    receivable.receivedAmount += amount
    await receivable.save()
    await Transaction.create({
      transactionType: 'customer_receivable_payment',
      referenceId: receivable._id, referenceNumber: receivableId,
      description: `Money received from ${receivable.customerName}`,
      amount, paymentMethod: paymentMethod || 'cash',
      relatedEntity: receivable.customerName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    })
    res.status(201).json({ success: true, message: 'Money received recorded successfully', data: payment })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to record receive money', errors: { error: error.message } })
  }
}

const getPaymentsByReceivableId = async (req, res) => {
  try {
    const receivable = await CustomerReceivable.findById(req.params.id)
    if (!receivable) return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    const payments = await CustomerReceivablePayment.find({ receivable: req.params.id }).sort({ date: -1, createdAt: -1 })
    res.json({ success: true, message: 'Payments loaded', data: payments })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load payments', errors: { error: error.message } })
  }
}

const getReceivableSummary = async (req, res) => {
  try {
    const activeReceivables = await CustomerReceivable.find({ status: { $ne: 'cancelled' } })
    const totalGiven = activeReceivables.reduce((sum, r) => sum + (r.givenAmount || 0), 0)
    const totalReceived = activeReceivables.reduce((sum, r) => sum + (r.receivedAmount || 0), 0)
    res.json({
      success: true, message: 'Receivable summary loaded',
      data: { totalGiven, totalReceived, totalOutstanding: totalGiven - totalReceived, totalReceivables: activeReceivables.length }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load receivable summary', errors: { error: error.message } })
  }
}

module.exports = { getAllReceivables, getReceivableById, createReceivable, updateReceivable, deleteReceivable, cancelReceivable, giveMoney, receiveMoney, getPaymentsByReceivableId, getReceivableSummary }
