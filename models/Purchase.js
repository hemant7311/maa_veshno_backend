const mongoose = require('mongoose');

const PurchaseItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: String,
  imei: String,
  imeis: [{ type: String }],
  quantity: {
    type: Number,
    required: true,
    default: 1
  },
  costPrice: {
    type: Number,
    required: true,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    default: 0
  }
});

const PurchaseSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierName: String,
  supplierMobile: String,
  purchaseNo: {
    type: String,
    unique: true
  },
  items: [PurchaseItemSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  discountType: {
    type: String,
    enum: ['fixed', 'percent'],
    default: 'fixed'
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  gst: {
    type: Number,
    default: 0
  },
  gstType: {
    type: String,
    enum: ['none', 'cgst-sgst', 'igst'],
    default: 'none'
  },
  gstAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  dueAmount: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank', 'card', 'cheque', 'credit', 'other'],
    default: 'cash'
  },
  paymentMethods: [{
    method: {
      type: String,
      enum: ['cash', 'upi', 'bank', 'card', 'cheque', 'credit', 'other'],
      default: 'cash'
    },
    amount: { type: Number, default: 0 },
    reference: { type: String, default: '' }
  }],
  date: {
    type: Date,
    default: Date.now
  },
  notes: String,
  status: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'cancelled'],
    default: 'pending'
  },
  cancelledAt: Date,
  cancelReason: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

PurchaseSchema.pre('save', async function() {
  if (this.isNew && !this.purchaseNo) {
    const count = await this.constructor.countDocuments();
    const prefix = 'PUR';
    const year = new Date().getFullYear();
    this.purchaseNo = `${prefix}${year}${String(count + 1).padStart(6, '0')}`;
  }
  this.dueAmount = Math.max(0, this.totalAmount - this.paidAmount);
  if (this.cancelledAt) {
    this.status = 'cancelled';
  } else if (this.paidAmount >= this.totalAmount && this.totalAmount > 0) {
    this.status = 'paid';
  } else if (this.paidAmount > 0) {
    this.status = 'partial';
  } else {
    this.status = 'pending';
  }
});

module.exports = mongoose.model('Purchase', PurchaseSchema);
