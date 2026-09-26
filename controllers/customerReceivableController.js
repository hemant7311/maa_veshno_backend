const CustomerReceivable = require('../models/CustomerReceivable')
const CustomerReceivablePayment = require('../models/CustomerReceivablePayment')
const Customer = require('../models/Customer')
const Transaction = require('../models/Transaction')
const mongoose = require('mongoose')
const { normalizePaymentMethod } = require('../utils/paymentMapper')

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
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { customer, customerName, mobile, givenAmount, date, notes } = req.body
    if (!customerName || givenAmount === undefined || givenAmount === null) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Customer name and given amount are required', errors: {} })
    }
    let customerDoc = null
    if (customer) {
      customerDoc = await Customer.findById(customer).session(session)
      if (!customerDoc) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({ success: false, message: 'Customer not found', errors: {} })
      }
    } else if (mobile) {
      customerDoc = await Customer.findOne({ phone: mobile }).session(session)
      if (!customerDoc) {
        const custData = [{ customerName, phone: mobile, customerType: 'retail' }]
        const createdCusts = await Customer.create(custData, { session, ordered: true })
        customerDoc = createdCusts[0]
      }
    }
    const recData = [{
      customer: customerDoc ? customerDoc._id : null,
      customerName: customerDoc ? customerDoc.customerName : customerName,
      mobile: customerDoc ? customerDoc.phone : (mobile || ''),
      givenAmount, receivedAmount: 0,
      date: date || Date.now(), notes: notes || '', status: 'pending'
    }]
    const createdRecs = await CustomerReceivable.create(recData, { session, ordered: true })
    const receivable = createdRecs[0]

    // Create transaction
    await Transaction.create([{
      transactionType: 'customer_receivable_payment',
      referenceId: receivable._id,
      referenceNumber: receivable._id.toString(),
      description: `Money given to ${customerName}`,
      amount: givenAmount,
      paymentMethod: 'cash',
      relatedEntity: customerName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })
    
    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Receivable created successfully', data: receivable })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to create receivable', errors: { error: error.message } })
  }
}

const updateReceivable = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { customerName, mobile, givenAmount, date, notes } = req.body
    const receivable = await CustomerReceivable.findById(req.params.id).session(session)
    if (!receivable) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    }
    if (receivable.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot update a cancelled receivable', errors: {} })
    }
    
    let amountChanged = false;
    if (customerName !== undefined) receivable.customerName = customerName
    if (mobile !== undefined) receivable.mobile = mobile
    if (givenAmount !== undefined && givenAmount !== receivable.givenAmount) {
      if (givenAmount < receivable.receivedAmount) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Given amount cannot be less than received amount', errors: {} })
      }
      receivable.givenAmount = givenAmount
      amountChanged = true;
    }
    if (date !== undefined) receivable.date = date
    if (notes !== undefined) receivable.notes = notes
    
    await receivable.save({ session })

    if (amountChanged || customerName !== undefined || date !== undefined) {
       const updateData = {};
       if (amountChanged) updateData.amount = receivable.givenAmount;
       if (customerName !== undefined) {
          updateData.relatedEntity = receivable.customerName;
          updateData.description = `Money given to ${receivable.customerName}`;
       }
       if (date !== undefined) updateData.transactionDate = new Date(date);
       
       await Transaction.findOneAndUpdate(
         { referenceId: receivable._id, transactionType: 'customer_receivable_payment', referenceNumber: receivable._id.toString() },
         { $set: updateData },
         { session }
       );
    }

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Receivable updated successfully', data: receivable })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to update receivable', errors: { error: error.message } })
  }
}

const deleteReceivable = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const receivable = await CustomerReceivable.findById(req.params.id).session(session)
    if (!receivable) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    }
    await CustomerReceivablePayment.deleteMany({ receivable: receivable._id }, { session })
    await Transaction.deleteMany({ referenceId: receivable._id, transactionType: 'customer_receivable_payment' }, { session })
    await CustomerReceivable.findByIdAndDelete(req.params.id, { session })
    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Receivable deleted successfully', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to delete receivable', errors: { error: error.message } })
  }
}

const cancelReceivable = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const receivable = await CustomerReceivable.findById(req.params.id).session(session)
    if (!receivable) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    }
    if (receivable.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Receivable is already cancelled', errors: {} })
    }
    receivable.status = 'cancelled'
    receivable.cancelledAt = new Date()
    await receivable.save({ session })

    const outstanding = receivable.givenAmount - receivable.receivedAmount
    if (outstanding > 0) {
       await Transaction.create([{
         transactionType: 'refund',
         referenceId: receivable._id,
         referenceNumber: receivable._id.toString(),
         description: `Receivable cancellation - ${receivable.customerName}`,
         amount: outstanding,
         paymentMethod: 'cash',
         relatedEntity: receivable.customerName,
         transactionDate: new Date(),
         createdBy: req.user?._id,
       }], { session })
    }

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Receivable cancelled successfully', data: receivable })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to cancel receivable', errors: { error: error.message } })
  }
}

const giveMoney = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { amount, date, paymentMethod, reference, notes } = req.body
    const receivableId = req.params.id
    if (!amount || amount <= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Amount must be greater than 0', errors: {} })
    }
    const receivable = await CustomerReceivable.findById(receivableId).session(session)
    if (!receivable) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    }
    if (receivable.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot give money for a cancelled receivable', errors: {} })
    }
    
    const normPaymentMethod = normalizePaymentMethod(paymentMethod || 'cash')
    const paymentData = [{
      receivable: receivableId, type: 'give', amount, date: date || Date.now(),
      paymentMethod: normPaymentMethod, reference: reference || '', notes: notes || ''
    }]
    const createdPayments = await CustomerReceivablePayment.create(paymentData, { session, ordered: true })
    const payment = createdPayments[0]

    receivable.givenAmount += amount
    await receivable.save({ session })

    await Transaction.create([{
      transactionType: 'customer_receivable_payment',
      referenceId: receivable._id, referenceNumber: payment._id.toString(),
      description: `Additional money given to ${receivable.customerName}`,
      amount, paymentMethod: normPaymentMethod,
      relatedEntity: receivable.customerName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })
    
    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Money given recorded successfully', data: payment })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to record give money', errors: { error: error.message } })
  }
}

const receiveMoney = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { amount, date, paymentMethod, reference, notes } = req.body
    const receivableId = req.params.id
    if (!amount || amount <= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Amount must be greater than 0', errors: {} })
    }
    const receivable = await CustomerReceivable.findById(receivableId).session(session)
    if (!receivable) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Receivable not found', errors: {} })
    }
    if (receivable.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot receive money for a cancelled receivable', errors: {} })
    }
    if (amount > receivable.remainingAmount) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({
        success: false,
        message: `Receive amount (${amount}) cannot exceed remaining amount (${receivable.remainingAmount})`,
        errors: {}
      })
    }
    
    const normRecPaymentMethod = normalizePaymentMethod(paymentMethod || 'cash')
    const paymentData = [{
      receivable: receivableId, type: 'receive', amount, date: date || Date.now(),
      paymentMethod: normRecPaymentMethod, reference: reference || '', notes: notes || ''
    }]
    const createdPayments = await CustomerReceivablePayment.create(paymentData, { session, ordered: true })
    const payment = createdPayments[0]

    receivable.receivedAmount += amount
    await receivable.save({ session })

    await Transaction.create([{
      transactionType: 'customer_receivable_payment',
      referenceId: receivable._id, referenceNumber: payment._id.toString(),
      description: `Money received from ${receivable.customerName}`,
      amount, paymentMethod: normRecPaymentMethod,
      relatedEntity: receivable.customerName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })
    
    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Money received recorded successfully', data: payment })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
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
