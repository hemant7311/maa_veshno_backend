const mongoose = require('mongoose');

const LoanSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  originalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingAmount: {
    type: Number,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  purpose: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'cancelled'],
    default: 'pending'
  },
  cancelledAt: {
    type: Date
  },
  cancelReason: {
    type: String
  }
}, {
  timestamps: true
});

LoanSchema.pre('save', function() {
  this.remainingAmount = Math.max(0, this.originalAmount - this.paidAmount);
  if (this.cancelledAt) {
    this.status = 'cancelled';
  } else if (this.paidAmount >= this.originalAmount && this.originalAmount > 0) {
    this.status = 'paid';
  } else if (this.paidAmount > 0) {
    this.status = 'partial';
  } else {
    this.status = 'pending';
  }
});

module.exports = mongoose.model('Loan', LoanSchema);
