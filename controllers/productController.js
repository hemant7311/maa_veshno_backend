const Product = require('../models/Product')
const Imei = require('../models/Imei')

const withImeiStock = async (products) => {
  const productIds = products.map((product) => product._id)
  if (!productIds.length) return []
  
  const productsWithImeis = await Imei.distinct('productId', { productId: { $in: productIds } })
  const productsWithImeisStr = new Set(productsWithImeis.map(String))

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
    const isImeiProduct = productsWithImeisStr.has(key) || Boolean(product.imeiNumber)
    return {
      ...product.toObject(),
      stock: isImeiProduct ? (stockByProductId.get(key) || 0) : (product.stock || 0),
      imeiNumber: firstImeiMap.get(key) || product.imeiNumber || '—'
    }
  })
}

const productData = (body) => {
  const { imeiNumber, imeiNumbers, ...data } = body
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

const listPublic = async (req, res) => {
  const { search = '' } = req.query
  const filter = search
    ? { $or: [{ productName: new RegExp(search, 'i') }, { brand: new RegExp(search, 'i') }, { model: new RegExp(search, 'i') }] }
    : { status: 'active' }
  // Only select non-sensitive fields
  const products = await Product.find(filter)
    .select('-purchasePrice -supplierId -supplierType -wholesalePrice -imeiNumber -barcode')
    .populate('categoryId', 'categoryName')
    .sort({ createdAt: -1 })
  
  // Do not expose actual IMEI numbers or exact stock breakdown for public.
  // We can just return a boolean inStock.
  res.json({ 
    success: true, 
    message: 'Products loaded', 
    data: products.map(p => ({
      ...p.toObject(),
      inStock: p.stock > 0
    }))
  })
}

const listWholesale = async (req, res) => {
  const { search = '' } = req.query
  const filter = search
    ? { $or: [{ productName: new RegExp(search, 'i') }, { brand: new RegExp(search, 'i') }, { model: new RegExp(search, 'i') }] }
    : { status: 'active' }
  // Select fields for wholesalers (includes wholesalePrice, but hides purchasePrice and supplier details)
  const products = await Product.find(filter)
    .select('-purchasePrice -supplierId -supplierType -imeiNumber -barcode')
    .populate('categoryId', 'categoryName')
    .sort({ createdAt: -1 })
  
  res.json({ 
    success: true, 
    message: 'Products loaded', 
    data: products.map(p => ({
      ...p.toObject(),
      inStock: p.stock > 0
    }))
  })
}

const getOne = async (req, res) => {
  const product = await Product.findById(req.params.id).populate('categoryId', 'categoryName')
  if (!product) return res.status(404).json({ success: false, message: 'Product not found', errors: {} })
  res.json({ success: true, message: 'Product loaded', data: (await withImeiStock([product]))[0] })
}

const mongoose = require('mongoose')
const Supplier = require('../models/Supplier')

const create = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const initialImei = String(req.body.imeiNumber || '').trim()
    if (initialImei && await Imei.exists({ imeiNumber: initialImei })) {
      await session.abortTransaction()
      session.endSession()
      return res.status(409).json({ success: false, message: 'This IMEI number already exists', errors: { imeiNumber: 'Duplicate IMEI number' } })
    }
    
    const pData = productData(req.body)
    if (initialImei) {
      pData.stock = 1
    }
    const createdProducts = await Product.create([pData], { session, ordered: true })
    const product = createdProducts[0]

    if (initialImei) await Imei.create([{ productId: product._id, imeiNumber: initialImei }], { session, ordered: true })
    
    // Adjust supplier ledger
    if (req.body.supplierId) {
      const supplier = await Supplier.findById(req.body.supplierId).session(session)
      if (supplier) {
        const cost = Number(req.body.totalPurchasePrice || req.body.purchasePrice || 0)
        const paid = Number(req.body.amountPaidNow || 0)
        supplier.totalAmount = (supplier.totalAmount || 0) + cost
        supplier.paidAmount = (supplier.paidAmount || 0) + paid
        supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
        await supplier.save({ session })
      }
    }
    
    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Product created', data: (await withImeiStock([product]))[0] })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to create product', errors: { error: error.message } })
  }
}

const update = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const oldProduct = await Product.findById(req.params.id).session(session)
    if (!oldProduct) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Product not found', errors: {} })
    }

    const product = await Product.findByIdAndUpdate(req.params.id, productData(req.body), { new: true, runValidators: true, session })
    
    const oldPrice = Number(oldProduct.purchasePrice || 0)
    const newPrice = Number(product.purchasePrice || 0)
    const priceDiff = newPrice - oldPrice

    if (priceDiff !== 0 && product.supplierId) {
      const supplier = await Supplier.findById(product.supplierId).session(session)
      if (supplier) {
        const imeiCount = await Imei.countDocuments({ productId: product._id, status: { $ne: 'archived' } }).session(session)
        if (imeiCount > 0) {
          const totalDiff = priceDiff * imeiCount
          supplier.totalAmount = Math.max(0, supplier.totalAmount + totalDiff)
          supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
          await supplier.save({ session })
        }
      }
    }

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Product updated', data: (await withImeiStock([product]))[0] })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to update product', errors: { error: error.message } })
  }
}

const remove = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const product = await Product.findById(req.params.id).session(session)
    if (!product) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Product not found', errors: {} })
    }
    
    // Deduct from supplier balance on delete if active
    if (product.supplierId && product.status !== 'returned') {
      const supplier = await Supplier.findById(product.supplierId).session(session)
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
        await supplier.save({ session })
      }
    }

    await Product.findByIdAndDelete(req.params.id, { session })
    await Imei.deleteMany({ productId: product._id }, { session })
    
    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Product deleted', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to delete product', errors: { error: error.message } })
  }
}

module.exports = { list, listPublic, listWholesale, getOne, create, update, remove }
