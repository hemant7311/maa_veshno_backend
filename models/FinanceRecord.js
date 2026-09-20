const mongoose = require('mongoose')

const financeRecordSchema = new mongoose.Schema(
  {
    financeType: { type: String, enum: ['Company', 'Private'], required: true },
    entityName: { type: String, required: true }, // Name of the company or the private agent
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    customerName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    totalLimit: { type: Number, required: true },
    usedLimit: { type: Number, default: 0 },
    availableLimit: { type: Number, default: 0 },
    status: { type: String, default: 'Active' },
    billRef: { type: String }, // Invoice number reference
    productDetails: { type: String }, // E.g., Mobile name + IMEI
    emiAmount: { type: Number, default: 0 },
    tenure: { type: String }, // E.g., '6 Months'
    paymentDate: { type: Date },
    paidEmis: [{ type: Number }] // Stores IDs/Indices of paid EMIs (e.g. 1, 2, 3)
  },
  { timestamps: true }
)

module.exports = mongoose.model('FinanceRecord', financeRecordSchema)
