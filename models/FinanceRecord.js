const mongoose = require('mongoose')

const emiInstallmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  expectedAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Paid', 'Partially Paid', 'Overdue', 'Cancelled'], default: 'Pending' },
  paymentDate: { type: Date },
  paymentMethod: { type: String },
  reference: { type: String }
}, { _id: true });

const financeRecordSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null, index: true },
    financeType: { type: String, enum: ['Company', 'Private'], required: true },
    entityName: { type: String, required: true, index: true }, // Name of the company or private financier
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    customerName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    totalLimit: { type: Number, required: true },
    usedLimit: { type: Number, default: 0 },
    availableLimit: { type: Number, default: 0 },
    status: { type: String, default: 'Active' },
    billRef: { type: String, index: true }, // Invoice number reference
    productDetails: { type: String }, // E.g., Mobile name + IMEI
    emiAmount: { type: Number, default: 0 },
    tenure: { type: String }, // E.g., '6 Months' or '6'
    paymentDate: { type: Date },
    installments: [emiInstallmentSchema],
    paidEmis: [{ type: Number }]
  },
  { timestamps: true }
)

module.exports = mongoose.model('FinanceRecord', financeRecordSchema)
