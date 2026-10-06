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
  const { imeiNumbers, ...data } = body
  if (data.imeiNumber === 'Multiple' || data.imeiNumber === 'N/A') {
    delete data.imeiNumber
  }
  return data
}

const list = async (req, res) => {
  const { search = '', inventoryUnits } = req.query
  const trimmedSearch = String(search).trim()
  const useInventoryUnits = String(inventoryUnits) === 'true'

  if (trimmedSearch) {
    const is15DigitImei = /^\d{15}$/.test(trimmedSearch)

    if (is15DigitImei) {
      // 1. Search in Imei collection for available/sellable IMEI matching exact 15 digits
      const imeiDoc = await Imei.findOne({
        imeiNumber: trimmedSearch,
        status: { $in: ['available', 'sellable', 'Active', 'active'] }
      })

      if (imeiDoc && imeiDoc.productId) {
        const targetProductId = imeiDoc.productId._id || imeiDoc.productId
        const product = await Product.findById(targetProductId).populate('categoryId', 'categoryName')
        if (product && product.status !== 'inactive') {
          const prodObj = product.toObject()
          prodObj.imeiNumber = trimmedSearch
          prodObj.imeiId = imeiDoc._id
          prodObj.categoryName = product.categoryId?.categoryName || ''
          prodObj.stock = 1
          return res.json({ success: true, message: 'Products loaded', data: [prodObj] })
        }
      }

      // 2. Check Product model direct imeiNumber field
      const directProduct = await Product.findOne({ imeiNumber: trimmedSearch }).populate('categoryId', 'categoryName')
      if (directProduct && directProduct.status !== 'inactive') {
        const isSoldOrArchived = await Imei.exists({
          imeiNumber: trimmedSearch,
          status: { $in: ['sold', 'archived', 'damaged', 'lost', 'returned'] }
        })
        if (!isSoldOrArchived) {
          const prodObj = directProduct.toObject()
          prodObj.imeiNumber = trimmedSearch
          prodObj.categoryName = directProduct.categoryId?.categoryName || ''
          prodObj.stock = 1
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

  if (useInventoryUnits) {
    const units = []
    const productIds = products.map(p => p._id)

    const availableImeis = await Imei.find({
      productId: { $in: productIds },
      status: { $in: ['available', 'sellable', 'Active', 'active'] }
    }).sort({ createdAt: 1 })

    const imeisByProductId = new Map()
    for (const im of availableImeis) {
      const pKey = String(im.productId)
      if (!imeisByProductId.has(pKey)) imeisByProductId.set(pKey, [])
      imeisByProductId.get(pKey).push(im)
    }

    for (const product of products) {
      const pKey = String(product._id)
      const pImeis = imeisByProductId.get(pKey) || []

      if (pImeis.length > 0) {
        for (const im of pImeis) {
          units.push({
            ...product.toObject(),
            categoryName: product.categoryId?.categoryName || '',
            imeiNumber: im.imeiNumber,
            imeiId: im._id,
            stock: 1
          })
        }
      } else if (product.imeiNumber) {
        const isSold = await Imei.exists({ imeiNumber: product.imeiNumber, status: { $in: ['sold', 'archived', 'damaged', 'lost', 'returned'] } })
        if (!isSold) {
          units.push({
            ...product.toObject(),
            categoryName: product.categoryId?.categoryName || '',
            imeiNumber: product.imeiNumber,
            stock: 1
          })
        }
      } else {
        if ((product.stock || 0) > 0) {
          units.push({
            ...product.toObject(),
            categoryName: product.categoryId?.categoryName || '',
            imeiNumber: '—',
            stock: product.stock || 0
          })
        }
      }
    }
    return res.json({ success: true, message: 'Inventory units loaded', data: units })
  }

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
        return res.status(409).json({ success: false, message: 'This IMEI number already exists', code: 'DUPLICATE_IMEI', errors: { imeiNumber: 'Duplicate IMEI number' } })
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
        await supplier.save({ session, validateModifiedOnly: true })
      }
    }
    
    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Product created', data: (await withImeiStock([product]))[0] })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This IMEI number already exists', code: 'DUPLICATE_IMEI', errors: { imeiNumber: 'Duplicate IMEI number' } })
    }
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

    const newImei = String(req.body.imeiNumber || '').trim()

    if (newImei && newImei !== 'N/A' && newImei !== 'Multiple') {
      if (!isValidIMEI(newImei)) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({ success: false, message: 'IMEI must be exactly 15 digits.', errors: { imeiNumber: 'IMEI must be exactly 15 digits.' } })
      }
      
      const existingImei = await Imei.findOne({ imeiNumber: newImei }).session(session)
      if (existingImei && String(existingImei.productId) !== String(oldProduct._id)) {
        await session.abortTransaction()
        session.endSession()
        return res.status(409).json({ success: false, message: 'This IMEI number already exists', code: 'DUPLICATE_IMEI', errors: { imeiNumber: 'Duplicate IMEI number' } })
      }
      
      if (!existingImei) {
        // If it doesn't exist, we need to update the old one or create a new one.
        const currentImeis = await Imei.find({ productId: oldProduct._id }).session(session)
        if (currentImeis.length === 1) {
          // Safe to update the only IMEI
          await Imei.updateOne({ _id: currentImeis[0]._id }, { imeiNumber: newImei }, { session })
        } else if (currentImeis.length === 0) {
          // No IMEI existed, create one
          await Imei.create([{ productId: oldProduct._id, imeiNumber: newImei }], { session })
        } else {
          // Multiple IMEIs exist. We can't safely know WHICH one to rename.
          // But wait, the frontend sends oldImeiNumber! Let's use it if available.
          const oldImeiFromReq = String(req.body.oldImeiNumber || '').trim()
          if (oldImeiFromReq && oldImeiFromReq !== 'N/A' && oldImeiFromReq !== 'Multiple') {
             await Imei.updateOne({ productId: oldProduct._id, imeiNumber: oldImeiFromReq }, { imeiNumber: newImei }, { session })
          }
        }
      }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, productData(req.body), { new: true, runValidators: true, session })
    
    const oldPrice = Number(oldProduct.purchasePrice || 0)
    const newPrice = Number(product.purchasePrice || 0)
    
    const oldSupplierId = oldProduct.supplierId ? String(oldProduct.supplierId) : null
    const newSupplierId = product.supplierId ? String(product.supplierId) : null

    const imeiCount = await Imei.countDocuments({ productId: product._id, status: { $ne: 'archived' } }).session(session)
    
    if (imeiCount > 0) {
      if (oldSupplierId !== newSupplierId) {
        // Supplier changed! Deduct from old, add to new.
        if (oldSupplierId) {
          const oldSupplier = await Supplier.findById(oldSupplierId).session(session)
          if (oldSupplier) {
            const deductAmount = oldPrice * imeiCount
            oldSupplier.totalAmount = Math.max(0, oldSupplier.totalAmount - deductAmount)
            if (oldSupplier.pendingAmount >= deductAmount) {
              oldSupplier.pendingAmount -= deductAmount
            } else {
              const excess = deductAmount - oldSupplier.pendingAmount
              oldSupplier.pendingAmount = 0
              oldSupplier.paidAmount = Math.max(0, oldSupplier.paidAmount - excess)
            }
            oldSupplier.pendingAmount = Math.max(0, oldSupplier.totalAmount - oldSupplier.paidAmount)
            await oldSupplier.save({ session, validateModifiedOnly: true })
          }
        }
        if (newSupplierId) {
          const newSupplier = await Supplier.findById(newSupplierId).session(session)
          if (newSupplier) {
            const addAmount = newPrice * imeiCount
            newSupplier.totalAmount += addAmount
            newSupplier.pendingAmount = Math.max(0, newSupplier.totalAmount - newSupplier.paidAmount)
            await newSupplier.save({ session, validateModifiedOnly: true })
          }
        }
      } else if (oldSupplierId && oldPrice !== newPrice) {
        // Same supplier, price changed
        const priceDiff = newPrice - oldPrice
        const totalDiff = priceDiff * imeiCount
        const supplier = await Supplier.findById(oldSupplierId).session(session)
        if (supplier) {
          supplier.totalAmount = Math.max(0, supplier.totalAmount + totalDiff)
          supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
          await supplier.save({ session, validateModifiedOnly: true })
        }
      }
    }

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Product updated', data: (await withImeiStock([product]))[0] })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This IMEI number already exists', code: 'DUPLICATE_IMEI', errors: { imeiNumber: 'Duplicate IMEI number' } })
    }
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
        await supplier.save({ session, validateModifiedOnly: true })
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


