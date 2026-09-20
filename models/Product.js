const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    productName: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: '' },
    model: { type: String, trim: true, default: '' },
    variant: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    imeiNumber: { type: String, trim: true, unique: true, sparse: true },
    barcode: { type: String, trim: true, unique: true, sparse: true },
    purchasePrice: { type: Number, min: 0, default: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, min: 0, default: 0 },
    gst: { type: Number, min: 0, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
    minStock: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'returned'], default: 'active' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierType: { type: String, enum: ['company', 'private'], default: null },
    displaySize: { type: String, trim: true, default: '' },
    battery: { type: String, trim: true, default: '' },
    processor: { type: String, trim: true, default: '' },
    network: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    image: { type: String, default: '' },
  },
  { timestamps: true },
)

productSchema.index({ productName: 'text', brand: 'text', model: 'text', barcode: 'text', imeiNumber: 'text' })

module.exports = mongoose.model('Product', productSchema)
