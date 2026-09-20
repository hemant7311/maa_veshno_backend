const mongoose = require('mongoose');

const CustomerReceivableSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    trim: true,
    default: ''
  },
  givenAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  receivedAmount: {
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
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'received', 'cancelled'],
    default: 'pending'
  },
  cancelledAt: {
    type: Date
  }
}, {
  timestamps: true
});

CustomerReceivableSchema.pre('save', function() {
  this.remainingAmount = Math.max(0, this.givenAmount - this.receivedAmount);
  if (this.cancelledAt) {
    this.status = 'cancelled';
  } else if (this.receivedAmount >= this.givenAmount && this.givenAmount > 0) {
    this.status = 'received';
  } else if (this.receivedAmount > 0) {
    this.status = 'partial';
  } else {
    this.status = 'pending';
  }
});

module.exports = mongoose.model('CustomerReceivable', CustomerReceivableSchema);
