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
  const trimmedSearch = String(search).trim()

  if (trimmedSearch) {
    const is15DigitImei = /^\d{15}$/.test(trimmedSearch)

    if (is15DigitImei) {
      // 1. Search in Imei collection for available IMEI matching exact 15 digits
      const imeiDoc = await Imei.findOne({
        imeiNumber: trimmedSearch,
        status: { $in: ['available', 'sellable', 'Active'] }
      }).populate({
        path: 'productId',
        populate: { path: 'categoryId', select: 'categoryName' }
      })

      if (imeiDoc && imeiDoc.productId) {
        const prodObj = imeiDoc.productId.toObject()
        prodObj.imeiNumber = trimmedSearch
        const availStock = await Imei.countDocuments({ productId: imeiDoc.productId._id, status: 'available' })
        prodObj.stock = availStock > 0 ? availStock : (prodObj.stock || 1)
        return res.json({ success: true, message: 'Products loaded', data: [prodObj] })
      }

      // 2. Check Product model direct imeiNumber field
      const directProduct = await Product.findOne({ imeiNumber: trimmedSearch }).populate('categoryId', 'categoryName')
      if (directProduct) {
        const isSoldOrArchived = await Imei.exists({
          imeiNumber: trimmedSearch,
          status: { $in: ['sold', 'archived', 'damaged', 'lost', 'returned'] }
        })
        if (!isSoldOrArchived) {
          const prodObj = directProduct.toObject()
          prodObj.imeiNumber = trimmedSearch
          return res.json({ success: true, message: 'Products loaded', data: [prodObj] })
        }
      }

      // If a 15-digit IMEI was searched but no available stock matching this exact IMEI exists, return empty list
      return res.json({ success: true, message: 'Products loaded', data: [] })
    }
  }

  // General text / Barcode search
  const imeiProductIds = trimmedSearch
    ? await Imei.find({ imeiNumber: new RegExp(trimmedSearch, 'i'), status: { $ne: 'archived' } }).distinct('productId')
    : []

  const filter = trimmedSearch
    ? {
        $or: [
          { productName: new RegExp(trimmedSearch, 'i') },
          { brand: new RegExp(trimmedSearch, 'i') },
          { model: new RegExp(trimmedSearch, 'i') },
          { barcode: new RegExp(trimmedSearch, 'i') },
          { imeiNumber: new RegExp(trimmedSearch, 'i') },
          { _id: { $in: imeiProductIds } }
        ]
      }
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

const { isValidIMEI } = require('../utils/imeiValidator')

const create = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const initialImei = String(req.body.imeiNumber || '').trim()
    if (initialImei && initialImei !== 'N/A') {
      if (!isValidIMEI(initialImei)) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({ success: false, message: 'IMEI must be exactly 15 digits.', errors: { imeiNumber: 'IMEI must be exactly 15 digits.' } })
      }
      if (await Imei.exists({ imeiNumber: initialImei })) {
        await session.abortTransaction()
        session.endSession()
        return res.status(409).json({ success: false, message: 'This IMEI number already exists', errors: { imeiNumber: 'Duplicate IMEI number' } })
      }
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
