const Imei = require('../models/Imei')
const Product = require('../models/Product')

const normalizeImeiNumbers = (numbers) => [...new Set((Array.isArray(numbers) ? numbers : [numbers])
  .map((number) => String(number || '').trim())
  .filter(Boolean))]

const list = async (req, res) => {
  const { search = '', status = '', productId = '' } = req.query
  const filter = { status: { $ne: 'archived' } }
  if (status) filter.status = status
  if (productId) filter.productId = productId
  if (search) filter.imeiNumber = new RegExp(search, 'i')

  const imeis = await Imei.find(filter)
    .populate({ path: 'productId', populate: { path: 'categoryId', select: 'categoryName' } })
    .sort({ createdAt: -1 })
  res.json({ success: true, message: 'IMEIs loaded', data: imeis })
}

const create = async (req, res) => {
  const { productId, imeiNumbers, imeiNumber, status = 'available', remarks = '' } = req.body
  const numbers = normalizeImeiNumbers(imeiNumbers || imeiNumber)
  if (!productId) return res.status(422).json({ success: false, message: 'Product is required', errors: { productId: 'Product is required' } })
  if (!numbers.length) return res.status(422).json({ success: false, message: 'At least one IMEI number is required', errors: { imeiNumbers: 'At least one IMEI number is required' } })
  if (numbers.length !== (Array.isArray(imeiNumbers) ? imeiNumbers.filter((number) => String(number || '').trim()).length : 1)) {
    return res.status(422).json({ success: false, message: 'Duplicate IMEI numbers were entered', errors: { imeiNumbers: 'Duplicate IMEI numbers are not allowed' } })
  }
  const product = await Product.findById(productId)
  if (!product || product.status !== 'active') return res.status(404).json({ success: false, message: 'Active product not found', errors: {} })

  const imeis = await Imei.insertMany(numbers.map((number) => ({ productId, imeiNumber: number, status, remarks })))

  // Also increase the product stock for the newly added IMEIs
  await Product.findByIdAndUpdate(productId, { $inc: { stock: numbers.length } })

  // Adjust supplier ledger balance if supplier is linked
  if (product.supplierId) {
    const Supplier = require('../models/Supplier')
    const supplier = await Supplier.findById(product.supplierId)
    if (supplier) {
      const addedCost = Number(product.purchasePrice || 0) * numbers.length
      supplier.totalAmount += addedCost
      supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
      await supplier.save()
    }
  }

  res.status(201).json({ success: true, message: `${imeis.length} IMEI${imeis.length > 1 ? 's' : ''} added`, data: imeis })
}

const update = async (req, res) => {
  const existing = await Imei.findById(req.params.id)
  if (!existing || existing.status === 'archived') return res.status(404).json({ success: false, message: 'IMEI not found', errors: {} })
  
  const oldStatus = existing.status;
  const newStatus = req.body.status;
  
  if (newStatus && oldStatus !== newStatus) {
    const validTransitions = {
      'available': ['reserved', 'sold', 'damaged', 'lost', 'archived', 'returned'],
      'reserved': ['sold', 'available', 'archived'],
      'sold': ['returned'],
      'returned': ['available', 'damaged', 'archived'],
      'damaged': ['archived'],
      'lost': ['archived'],
      'archived': []
    };
    
    // In Maa Veshno logic, company returns change available -> returned. 
    // Sales change available -> sold or reserved -> sold.
    // Sale cancellations might go sold -> returned or sold -> available. 
    // The prompt says "sold -> returned", so we allow it.
    
    const allowed = validTransitions[oldStatus] || [];
    if (!allowed.includes(newStatus)) {
      return res.status(422).json({ success: false, message: `Invalid state transition from ${oldStatus} to ${newStatus}`, errors: {} })
    }
  }
  
  const allowedParams = ['status', 'remarks']
  for (const key of allowedParams) if (req.body[key] !== undefined) existing[key] = req.body[key]
  if (existing.status === 'sold' && !existing.soldAt) existing.soldAt = new Date()
  await existing.save()
  
  // If status changed from/to available, update product stock
  if (oldStatus === 'available' && existing.status !== 'available') {
    await Product.findByIdAndUpdate(existing.productId, { $inc: { stock: -1 } })
  } else if (oldStatus !== 'available' && existing.status === 'available') {
    await Product.findByIdAndUpdate(existing.productId, { $inc: { stock: 1 } })
  }
  
  res.json({ success: true, message: 'IMEI updated', data: existing })
}

const remove = async (req, res) => {
  const imei = await Imei.findById(req.params.id)
  if (!imei || imei.status === 'archived') return res.status(404).json({ success: false, message: 'IMEI not found', errors: {} })
  if (imei.status === 'sold') return res.status(422).json({ success: false, message: 'Sold IMEI cannot be deleted', errors: {} })
  
  const oldStatus = imei.status;
  imei.status = 'archived'
  await imei.save()

  // If the IMEI was available before archiving, decrease product stock
  if (oldStatus === 'available') {
    await Product.findByIdAndUpdate(imei.productId, { $inc: { stock: -1 } })
  }

  // Adjust supplier ledger balance if supplier is linked
  const product = await Product.findById(imei.productId)
  if (product && product.supplierId) {
    const Supplier = require('../models/Supplier')
    const supplier = await Supplier.findById(product.supplierId)
    if (supplier) {
      const refundCost = Number(product.purchasePrice || 0)
      supplier.totalAmount = Math.max(0, supplier.totalAmount - refundCost)
      
      if (supplier.pendingAmount >= refundCost) {
        supplier.pendingAmount -= refundCost
      } else {
        const excess = refundCost - supplier.pendingAmount
        supplier.pendingAmount = 0
        supplier.paidAmount = Math.max(0, supplier.paidAmount - excess)
      }
      supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
      
      await supplier.save()
    }
  }

  res.json({ success: true, message: 'IMEI archived', data: {} })
}

module.exports = { list, create, update, remove, normalizeImeiNumbers }
