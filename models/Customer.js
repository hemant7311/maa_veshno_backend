const mongoose = require('mongoose')

const customerSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    gstNumber: { type: String, trim: true, default: '' },
    customerType: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
    totalPurchases: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Customer', customerSchema)
