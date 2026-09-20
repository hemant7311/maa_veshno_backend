const mongoose = require('mongoose')

const transactionSchema = new mongoose.Schema(
  {
    transactionType: { 
      type: String, 
      enum: ['sale', 'purchase', 'customer_payment', 'supplier_payment', 'loan_payment', 'customer_receivable_payment', 'expense', 'emi', 'return', 'refund'],
      required: true,
      index: true
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Sale, Purchase, Loan, etc.
    referenceNumber: { type: String, default: '' },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cash', 'card', 'upi', 'bank', 'credit', 'check', 'finance'], default: 'cash' },
    relatedEntity: { type: String, default: '' }, // Customer name, Supplier name, etc.
    notes: { type: String, trim: true, default: '' },
    transactionDate: { type: Date, required: true, default: Date.now, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

// Compound index for efficient querying
transactionSchema.index({ transactionDate: -1, transactionType: 1 })
transactionSchema.index({ referenceId: 1 })

module.exports = mongoose.model('Transaction', transactionSchema)
