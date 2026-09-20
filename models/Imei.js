const mongoose = require('mongoose')

const imeiSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    imeiNumber: { type: String, required: true, trim: true, unique: true },
    status: {
      type: String,
      enum: ['available', 'reserved', 'sold', 'returned', 'damaged', 'lost', 'archived'],
      default: 'available',
      index: true,
    },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    soldAt: { type: Date, default: null },
  },
  { timestamps: true },
)

imeiSchema.index({ productId: 1, status: 1 })

module.exports = mongoose.model('Imei', imeiSchema)
