const mongoose = require('mongoose')

const saleItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  imei: { type: String, default: '' },
  qty: { type: Number, required: true, default: 1 },
  price: { type: Number, required: true },
  purchasePrice: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true }
}, { _id: false })

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    saleType: { type: String, enum: ['retail', 'wholesale'], required: true },
    paymentMode: { type: String, enum: ['cash', 'card', 'upi', 'finance'], required: true },
    
    items: [saleItemSchema],
    
    subTotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    
    // Wholesale specific
    pickedBy: { type: String, default: '' },
    
    // Retail specific
    partyGst: { type: String, default: '' },
    warrantySaleAmount: { type: Number, default: 0 },
    delayPaymentExpected: { type: Boolean, default: false },

    // For finance sales
    financeDetails: {
      company: { type: String, default: '' },
      loanId: { type: String, default: '' }, // For Company Finance
      fileNo: { type: String, default: '' }, // For Private Finance
      emiPaymentMethod: { type: String, enum: ['shop', 'bank', ''], default: '' },
      dpAmount: { type: Number, default: 0 },
      emiAmount: { type: Number, default: 0 },
      tenure: { type: String, default: '' },
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },

    // Bill payment tracking
    billStatus: { type: String, enum: ['draft', 'saved', 'paid', 'partially_paid', 'due', 'cancelled'], default: 'saved' },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountDue: { type: Number, default: function() { return this.grandTotal } },
    promisedDate: { type: Date },
    
    status: { type: String, enum: ['completed', 'cancelled', 'refunded'], default: 'completed' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true },
)

module.exports = mongoose.model('Sale', saleSchema)
