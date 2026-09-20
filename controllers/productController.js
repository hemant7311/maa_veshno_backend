const Product = require('../models/Product')
const Imei = require('../models/Imei')

const withImeiStock = async (products) => {
  const productIds = products.map((product) => product._id)
  if (!productIds.length) return []
  const stockCounts = await Imei.aggregate([
    { $match: { productId: { $in: productIds }, status: 'available' } },
    { $group: { _id: '$productId', stock: { $sum: 1 } } },
  ])
  const stockByProductId = new Map(stockCounts.map((item) => [String(item._id), item.stock]))
  
  // Fetch first available IMEI for each product
  const imeis = await Imei.find({ productId: { $in: productIds }, status: 'available' }).sort({ createdAt: 1 })
  const firstImeiMap = new Map()
  for (const im of imeis) {
    const key = String(im.productId)
    if (!firstImeiMap.has(key)) {
      firstImeiMap.set(key, im.imeiNumber)
    }
  }

  return products.map((product) => {
    const key = String(product._id)
    return {
      ...product.toObject(),
      stock: stockByProductId.get(key) || 0,
      imeiNumber: firstImeiMap.get(key) || product.imeiNumber || '—'
    }
  })
}

const productData = (body) => {
  const { imeiNumber, imeiNumbers, stock, ...data } = body
  return data
}

const list = async (req, res) => {
  const { search = '' } = req.query
  const imeiProductIds = search ? await Imei.find({ imeiNumber: new RegExp(search, 'i'), status: { $ne: 'archived' } }).distinct('productId') : []
  const filter = search
    ? { $or: [{ productName: new RegExp(search, 'i') }, { brand: new RegExp(search, 'i') }, { model: new RegExp(search, 'i') }, { barcode: new RegExp(search, 'i') }, { imeiNumber: new RegExp(search, 'i') }, { _id: { $in: imeiProductIds } }] }
    : {}
  const products = await Product.find(filter).populate('categoryId', 'categoryName').sort({ createdAt: -1 })
  res.json({ success: true, message: 'Products loaded', data: await withImeiStock(products) })
}

const getOne = async (req, res) => {
  const product = await Product.findById(req.params.id).populate('categoryId', 'categoryName')
  if (!product) return res.status(404).json({ success: false, message: 'Product not found', errors: {} })
  res.json({ success: true, message: 'Product loaded', data: (await withImeiStock([product]))[0] })
}

const Supplier = require('../models/Supplier')

const create = async (req, res) => {
  const initialImei = String(req.body.imeiNumber || '').trim()
  if (initialImei && await Imei.exists({ imeiNumber: initialImei })) {
    return res.status(409).json({ success: false, message: 'This IMEI number already exists', errors: { imeiNumber: 'Duplicate IMEI number' } })
  }
  const product = await Product.create(productData(req.body))
  try {
    if (initialImei) await Imei.create({ productId: product._id, imeiNumber: initialImei })
    
    // Adjust supplier ledger
    if (req.body.supplierId) {
      const supplier = await Supplier.findById(req.body.supplierId)
      if (supplier) {
        const cost = Number(req.body.totalPurchasePrice || req.body.purchasePrice || 0)
        const paid = Number(req.body.amountPaidNow || 0)
        supplier.totalAmount += cost
        supplier.paidAmount += paid
        supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
        await supplier.save()
      }
    }
  } catch (error) {
    await Product.findByIdAndDelete(product._id)
    throw error
  }
  res.status(201).json({ success: true, message: 'Product created', data: (await withImeiStock([product]))[0] })
}

const update = async (req, res) => {
  const oldProduct = await Product.findById(req.params.id)
  if (!oldProduct) return res.status(404).json({ success: false, message: 'Product not found', errors: {} })

  const product = await Product.findByIdAndUpdate(req.params.id, productData(req.body), { returnDocument: 'after', runValidators: true })
  
  const oldPrice = Number(oldProduct.purchasePrice || 0)
  const newPrice = Number(product.purchasePrice || 0)
  const priceDiff = newPrice - oldPrice

  if (priceDiff !== 0 && product.supplierId) {
    const Supplier = require('../models/Supplier')
    const supplier = await Supplier.findById(product.supplierId)
    if (supplier) {
      const imeiCount = await Imei.countDocuments({ productId: product._id, status: { $ne: 'archived' } })
      if (imeiCount > 0) {
        const totalDiff = priceDiff * imeiCount
        supplier.totalAmount = Math.max(0, supplier.totalAmount + totalDiff)
        supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
        await supplier.save()
      }
    }
  }

  res.json({ success: true, message: 'Product updated', data: (await withImeiStock([product]))[0] })
}

const remove = async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return res.status(404).json({ success: false, message: 'Product not found', errors: {} })
  
  // Deduct from supplier balance on delete if active
  if (product.supplierId && product.status !== 'returned') {
    const supplier = await Supplier.findById(product.supplierId)
    if (supplier) {
      const cost = Number(product.purchasePrice || 0)
      supplier.totalAmount = Math.max(0, supplier.totalAmount - cost)
      if (supplier.pendingAmount >= cost) {
        supplier.pendingAmount -= cost
      } else {
        const excess = cost - supplier.pendingAmount
        supplier.pendingAmount = 0
        supplier.paidAmount = Math.max(0, supplier.paidAmount - excess)
      }
      supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
      await supplier.save()
    }
  }

  await Product.findByIdAndDelete(req.params.id)
  await Imei.deleteMany({ productId: product._id })
  res.json({ success: true, message: 'Product deleted', data: {} })
}

module.exports = { list, getOne, create, update, remove }
