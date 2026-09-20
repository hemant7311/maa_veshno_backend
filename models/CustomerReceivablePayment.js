const mongoose = require('mongoose');

const CustomerReceivablePaymentSchema = new mongoose.Schema({
  receivable: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerReceivable',
    required: true
  },
  type: {
    type: String,
    enum: ['give', 'receive'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank', 'card', 'cheque', 'other'],
    default: 'cash'
  },
  reference: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CustomerReceivablePayment', CustomerReceivablePaymentSchema);
