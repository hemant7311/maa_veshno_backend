const Transaction = require('../models/Transaction')

const list = async (req, res) => {
  const { startDate, endDate, type } = req.query
  const matchStage = {}

  if (type) matchStage.transactionType = type

  if (startDate || endDate) {
    matchStage.transactionDate = {}
    if (startDate) matchStage.transactionDate.$gte = new Date(startDate)
    if (endDate) matchStage.transactionDate.$lte = new Date(endDate)
  }

  const transactions = await Transaction.find(matchStage)
    .populate('createdBy', 'username')
    .sort({ transactionDate: -1 })

  res.json({ success: true, message: 'Transactions loaded', data: transactions })
}

const getSummary = async (req, res) => {
  const { startDate, endDate } = req.query
  const matchStage = {}

  if (startDate || endDate) {
    matchStage.transactionDate = {}
    if (startDate) matchStage.transactionDate.$gte = new Date(startDate)
    if (endDate) matchStage.transactionDate.$lte = new Date(endDate)
  }

  const summary = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$transactionType',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const paymentMethodSummary = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ])

  res.json({
    success: true,
    message: 'Transaction summary loaded',
    data: {
      byType: summary,
      byPaymentMethod: paymentMethodSummary,
    },
  })
}

module.exports = { list, getSummary }
