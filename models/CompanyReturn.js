const mongoose = require('mongoose');

const CompanyReturnSchema = new mongoose.Schema({
  returnId: {
    type: String,
    unique: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierName: {
    type: String,
    required: true,
    trim: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  purchasePrice: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  imei: String,
  imeis: [{ type: String }],
  quantity: {
    type: Number,
    required: true,
    default: 1
  },
  returnDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  reason: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

CompanyReturnSchema.pre('save', async function() {
  if (this.isNew && !this.returnId) {
    const count = await this.constructor.countDocuments();
    const prefix = 'RET';
    const year = new Date().getFullYear();
    this.returnId = `${prefix}${year}${String(count + 1).padStart(5, '0')}`;
  }
});

module.exports = mongoose.model('CompanyReturn', CompanyReturnSchema);
