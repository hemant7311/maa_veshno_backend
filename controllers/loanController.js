const Loan = require('../models/Loan')
const LoanPayment = require('../models/LoanPayment')
const Transaction = require('../models/Transaction')
const mongoose = require('mongoose')
const { normalizePaymentMethod } = require('../utils/paymentMapper')

const getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find().sort({ createdAt: -1 })
    res.json({ success: true, message: 'Loans loaded', data: loans })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load loans', errors: { error: error.message } })
  }
}

const getLoanById = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    res.json({ success: true, message: 'Loan loaded', data: loan })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load loan', errors: { error: error.message } })
  }
}

const createLoan = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { personName, mobile, address, originalAmount, date, purpose, notes } = req.body
    if (!personName || originalAmount === undefined || originalAmount === null) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Person name and original amount are required', errors: {} })
    }
    const loanData = [{
      personName, mobile: mobile || '', address: address || '',
      originalAmount, paidAmount: 0,
      date: date || Date.now(),
      purpose: purpose || '', notes: notes || '', status: 'pending'
    }]
    const createdLoans = await Loan.create(loanData, { session })
    const loan = createdLoans[0]

    // Create transaction record
    await Transaction.create([{
      transactionType: 'loan_payment',
      referenceId: loan._id,
      referenceNumber: loan._id.toString(),
      description: `Loan given to ${personName}`,
      amount: originalAmount,
      paymentMethod: 'cash',
      relatedEntity: personName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Loan created successfully', data: loan })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to create loan', errors: { error: error.message } })
  }
}

const updateLoan = async (req, res) => {
  try {
    const { personName, mobile, address, originalAmount, date, purpose, notes } = req.body
    const loan = await Loan.findById(req.params.id)
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    if (loan.status === 'cancelled') return res.status(422).json({ success: false, message: 'Cannot update a cancelled loan', errors: {} })
    if (personName !== undefined) loan.personName = personName
    if (mobile !== undefined) loan.mobile = mobile
    if (address !== undefined) loan.address = address
    if (originalAmount !== undefined) {
      if (originalAmount < loan.paidAmount) {
        return res.status(422).json({ success: false, message: 'Original amount cannot be less than paid amount', errors: {} })
      }
      loan.originalAmount = originalAmount
    }
    if (date !== undefined) loan.date = date
    if (purpose !== undefined) loan.purpose = purpose
    if (notes !== undefined) loan.notes = notes
    await loan.save()
    res.json({ success: true, message: 'Loan updated successfully', data: loan })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update loan', errors: { error: error.message } })
  }
}

const deleteLoan = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const loan = await Loan.findById(req.params.id).session(session)
    if (!loan) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    }
    await LoanPayment.deleteMany({ loan: loan._id }, { session })
    await Transaction.deleteMany({ referenceId: loan._id, transactionType: 'loan_payment' }, { session })
    await Loan.findByIdAndDelete(req.params.id, { session })
    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Loan deleted successfully', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to delete loan', errors: { error: error.message } })
  }
}

const cancelLoan = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { cancelReason } = req.body
    const loan = await Loan.findById(req.params.id).session(session)
    if (!loan) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    }
    if (loan.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Loan is already cancelled', errors: {} })
    }
    loan.status = 'cancelled'
    loan.cancelledAt = new Date()
    loan.cancelReason = cancelReason || ''
    await loan.save({ session })

    // Create reversing transaction for the principal
    const cancelTxns = [{
      transactionType: 'refund',
      referenceId: loan._id,
      referenceNumber: loan._id.toString(),
      description: `Loan cancellation (principal reversal) - ${loan.personName}`,
      amount: loan.originalAmount,
      paymentMethod: 'cash',
      relatedEntity: loan.personName,
      transactionDate: new Date(),
      createdBy: req.user?._id,
    }];
    
    // If they made any payments, reverse those too
    if (loan.paidAmount > 0) {
      cancelTxns.push({
        transactionType: 'refund',
        referenceId: loan._id,
        referenceNumber: loan._id.toString(),
        description: `Loan cancellation (payment refund) - ${loan.personName}`,
        amount: loan.paidAmount,
        paymentMethod: 'cash',
        relatedEntity: loan.personName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      });
    }

    await Transaction.create(cancelTxns, { session })

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Loan cancelled successfully', data: loan })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to cancel loan', errors: { error: error.message } })
  }
}

const addPayment = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { amount, date, paymentMethod, reference, notes } = req.body
    const loanId = req.params.id
    if (!amount || amount <= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Amount must be greater than 0', errors: {} })
    }
    const loan = await Loan.findById(loanId).session(session)
    if (!loan) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    }
    if (loan.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot add payment to a cancelled loan', errors: {} })
    }
    if (amount > loan.remainingAmount) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Payment amount cannot exceed remaining amount', errors: {} })
    }
    
    const normPaymentMethod = normalizePaymentMethod(paymentMethod || 'cash')
    const paymentData = [{
      loan: loanId, amount, date: date || Date.now(),
      paymentMethod: normPaymentMethod,
      reference: reference || '', notes: notes || ''
    }]
    const createdPayments = await LoanPayment.create(paymentData, { session })
    const payment = createdPayments[0]

    loan.paidAmount += amount
    await loan.save({ session })

    // Create transaction
    await Transaction.create([{
      transactionType: 'loan_payment',
      referenceId: loan._id,
      referenceNumber: payment._id.toString(),
      description: `Loan repayment from ${loan.personName}`,
      amount,
      paymentMethod: normPaymentMethod,
      relatedEntity: loan.personName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Payment recorded successfully', data: payment })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to add payment', errors: { error: error.message } })
  }
}

const removePayment = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const paymentId = req.params.paymentId
    const payment = await LoanPayment.findById(paymentId).session(session)
    if (!payment) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Payment not found', errors: {} })
    }
    const loan = await Loan.findById(payment.loan).session(session)
    if (!loan) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    }
    if (loan.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot remove payment from a cancelled loan', errors: {} })
    }
    loan.paidAmount = Math.max(0, loan.paidAmount - payment.amount)
    await loan.save({ session })
    
    // Delete the transaction associated with this payment
    await Transaction.findOneAndDelete({ referenceNumber: paymentId.toString(), transactionType: 'loan_payment' }, { session })

    await LoanPayment.findByIdAndDelete(paymentId, { session })
    
    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Payment removed successfully', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to remove payment', errors: { error: error.message } })
  }
}

const getPaymentsByLoanId = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found', errors: {} })
    const payments = await LoanPayment.find({ loan: req.params.id }).sort({ date: -1, createdAt: -1 })
    res.json({ success: true, message: 'Payments loaded', data: payments })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load payments', errors: { error: error.message } })
  }
}

const getLoanSummary = async (req, res) => {
  try {
    const activeLoans = await Loan.find({ status: { $ne: 'cancelled' } })
    const totalBorrowed = activeLoans.reduce((sum, loan) => sum + (loan.originalAmount || 0), 0)
    const totalRepaid = activeLoans.reduce((sum, loan) => sum + (loan.paidAmount || 0), 0)
    const totalOutstanding = totalBorrowed - totalRepaid
    res.json({
      success: true, message: 'Loan summary loaded',
      data: { totalBorrowed, totalRepaid, totalOutstanding, totalLoans: activeLoans.length }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load loan summary', errors: { error: error.message } })
  }
}

module.exports = { getAllLoans, getLoanById, createLoan, updateLoan, deleteLoan, cancelLoan, addPayment, removePayment, getPaymentsByLoanId, getLoanSummary }
