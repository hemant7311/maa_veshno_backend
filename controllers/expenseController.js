const Expense = require('../models/Expense')
const mongoose = require('mongoose')

const getAllExpenses = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query
    const match = {}
    if (startDate || endDate) {
      match.date = {}
      if (startDate) match.date.$gte = new Date(startDate)
      if (endDate) match.date.$lte = new Date(endDate)
    }
    if (category) match.category = category
    const expenses = await Expense.find(match).sort({ date: -1, createdAt: -1 })
    res.json({ success: true, message: 'Expenses loaded', data: expenses })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load expenses', errors: { error: error.message } })
  }
}

const getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found', errors: {} })
    res.json({ success: true, message: 'Expense loaded', data: expense })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load expense', errors: { error: error.message } })
  }
}

const createExpense = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { category, description, amount, date, paymentMethod, reference, notes } = req.body
    if (!description || amount === undefined || amount === null || amount <= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Description and valid amount are required', errors: {} })
    }
    const createdExpenses = await Expense.create([{
      category: category || 'general',
      description,
      amount,
      date: date || Date.now(),
      paymentMethod: paymentMethod || 'cash',
      reference: reference || '',
      notes: notes || '',
      createdBy: req.user?._id
    }], { session })
    const expense = createdExpenses[0]

    const Transaction = require('../models/Transaction')
    await Transaction.create([{
      transactionType: 'expense',
      referenceId: expense._id,
      referenceNumber: expense._id.toString(),
      description: `Expense: ${description}`,
      amount,
      paymentMethod: paymentMethod || 'cash',
      relatedEntity: category || 'general',
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Expense created successfully', data: expense })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to create expense', errors: { error: error.message } })
  }
}

const updateExpense = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { category, description, amount, date, paymentMethod, reference, notes } = req.body
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { category, description, amount, date, paymentMethod, reference, notes },
      { new: true, runValidators: true, session }
    )
    if (!expense) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Expense not found', errors: {} })
    }

    const Transaction = require('../models/Transaction')
    await Transaction.findOneAndUpdate(
      { referenceId: expense._id, transactionType: 'expense' },
      {
        description: `Expense: ${description}`,
        amount,
        paymentMethod: paymentMethod || 'cash',
        relatedEntity: category || 'general',
        transactionDate: new Date(date || Date.now())
      },
      { session }
    )

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Expense updated successfully', data: expense })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to update expense', errors: { error: error.message } })
  }
}

const deleteExpense = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id, { session })
    if (!expense) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Expense not found', errors: {} })
    }

    const Transaction = require('../models/Transaction')
    await Transaction.findOneAndDelete({ referenceId: req.params.id, transactionType: 'expense' }, { session })

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Expense deleted successfully', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to delete expense', errors: { error: error.message } })
  }
}

const getExpenseSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const match = {}
    if (startDate || endDate) {
      match.date = {}
      if (startDate) match.date.$gte = new Date(startDate)
      if (endDate) match.date.$lte = new Date(endDate)
    }
    const expenses = await Expense.find(match)
    const totalExpenses = expenses.length
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const byCategory = {}
    expenses.forEach(e => {
      const cat = e.category || 'general'
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 }
      byCategory[cat].count += 1
      byCategory[cat].total += e.amount || 0
    })
    res.json({
      success: true,
      message: 'Expense summary loaded',
      data: {
        totalExpenses,
        totalAmount,
        byCategory
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load expense summary', errors: { error: error.message } })
  }
}

const getExpensesByCategory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const match = {}
    if (startDate || endDate) {
      match.date = {}
      if (startDate) match.date.$gte = new Date(startDate)
      if (endDate) match.date.$lte = new Date(endDate)
    }
    const expenses = await Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$category', 'general'] },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          expenses: {
            $push: {
              _id: '$_id',
              description: '$description',
              amount: '$amount',
              date: '$date',
              paymentMethod: '$paymentMethod',
              notes: '$notes'
            }
          }
        }
      },
      { $sort: { totalAmount: -1 } }
    ])
    res.json({ success: true, message: 'Expenses by category loaded', data: expenses })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load expenses by category', errors: { error: error.message } })
  }
}

module.exports = {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
  getExpensesByCategory
}
