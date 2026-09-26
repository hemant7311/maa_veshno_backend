const CompanyReturn = require('../models/CompanyReturn')
const Product = require('../models/Product')
const Imei = require('../models/Imei')
const Supplier = require('../models/Supplier')
const Transaction = require('../models/Transaction')
const mongoose = require('mongoose')
const { normalizePaymentMethod } = require('../utils/paymentMapper')

const getAllReturns = async (req, res) => {
  try {
    const returns = await CompanyReturn.find()
      .populate('supplier', 'name type shopName phone')
      .populate('product', 'productName brand model sku barcode purchasePrice salePrice stock')
      .sort({ createdAt: -1 })
    res.json({ success: true, message: 'Company returns loaded', data: returns })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load returns', errors: { error: error.message } })
  }
}

const getReturnById = async (req, res) => {
  try {
    const companyReturn = await CompanyReturn.findById(req.params.id)
      .populate('supplier', 'name type shopName phone')
      .populate('product', 'productName brand model sku barcode purchasePrice salePrice stock')
    if (!companyReturn) return res.status(404).json({ success: false, message: 'Company return not found', errors: {} })
    res.json({ success: true, message: 'Company return loaded', data: companyReturn })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load return', errors: { error: error.message } })
  }
}

const createReturn = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    // Canonical payload fields with backward-compatibility fallbacks
    const supplierId = req.body.supplier || req.body.supplierId
    const productId = req.body.product || req.body.productId
    const rawQuantity = req.body.quantity
    const returnDate = req.body.returnDate
    const reason = req.body.reason || ''
    const notes = req.body.notes || ''
    
    // Process IMEIs (supporting array or string fallbacks)
    const rawImeis = req.body.imeis || req.body.imeiNumbers || []
    let allImeis = Array.isArray(rawImeis) ? [...rawImeis] : []
    if (req.body.imei && !allImeis.includes(req.body.imei)) {
      allImeis.unshift(req.body.imei)
    }
    // Clean and deduplicate IMEI strings
    allImeis = [...new Set(allImeis.map(i => String(i || '').trim()).filter(Boolean))]

    // 1. Basic Field Validations
    if (!supplierId) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Supplier is required', errors: {} })
    }
    if (!productId) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Product is required', errors: {} })
    }

    // 2. Fetch & Validate Supplier from DB
    const supplierDoc = await Supplier.findById(supplierId).session(session)
    if (!supplierDoc) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Selected supplier does not exist', errors: {} })
    }

    // 3. Fetch & Validate Product from DB
    const productDoc = await Product.findById(productId).session(session)
    if (!productDoc) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Selected product does not exist', errors: {} })
    }

    // Determine quantity
    let quantity = Number(rawQuantity)
    if (isNaN(quantity) || quantity <= 0) {
      if (allImeis.length > 0) {
        quantity = allImeis.length
      } else {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Valid positive quantity is required', errors: {} })
      }
    }

    // 4. Validate IMEI requirement and matching
    if (allImeis.length > 0) {
      if (allImeis.length !== quantity) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: `Quantity (${quantity}) must match the number of IMEIs provided (${allImeis.length})`, errors: {} })
      }

      // Check all IMEIs exist in database, belong to this product, and are eligible for return (available/sellable)
      const imeiDocs = await Imei.find({ imeiNumber: { $in: allImeis } }).session(session)
      if (imeiDocs.length !== allImeis.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'One or more invalid IMEI numbers provided', errors: {} })
      }

      for (const imeiDoc of imeiDocs) {
        if (String(imeiDoc.productId) !== String(productDoc._id)) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `IMEI ${imeiDoc.imeiNumber} does not belong to the selected product`, errors: {} })
        }
        const statusLower = String(imeiDoc.status || '').toLowerCase()
        if (statusLower !== 'available' && statusLower !== 'sellable') {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `IMEI ${imeiDoc.imeiNumber} is not available for return (current status: ${imeiDoc.status})`, errors: {} })
        }
      }

      // Atomically update IMEIs to returned
      const imeiResult = await Imei.updateMany(
        { imeiNumber: { $in: allImeis }, status: { $in: ['available', 'sellable'] } },
        { $set: { status: 'returned' } },
        { session }
      )
      if (imeiResult.modifiedCount !== allImeis.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Could not update IMEI statuses. Some IMEIs may have changed status concurrently.', errors: {} })
      }
    }

    // 5. Atomically Deduct Product Stock
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productDoc._id, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { session, new: true }
    )
    if (!updatedProduct) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: `Insufficient stock to perform return (available: ${productDoc.stock}, requested: ${quantity})`, errors: {} })
    }

    // Resolve authoritative purchase price from productDoc
    const purchasePrice = Number(productDoc.purchasePrice || productDoc.costPrice || 0)
    const returnAmount = purchasePrice * quantity

    // 6. Update Supplier Balance
    if (returnAmount > 0) {
      supplierDoc.totalAmount = Math.max(0, (supplierDoc.totalAmount || 0) - returnAmount)
      if ((supplierDoc.pendingAmount || 0) >= returnAmount) {
        supplierDoc.pendingAmount -= returnAmount
      } else {
        const excess = returnAmount - (supplierDoc.pendingAmount || 0)
        supplierDoc.pendingAmount = 0
        supplierDoc.paidAmount = Math.max(0, (supplierDoc.paidAmount || 0) - excess)
      }
      supplierDoc.pendingAmount = Math.max(0, supplierDoc.totalAmount - (supplierDoc.paidAmount || 0))
      await supplierDoc.save({ session })
    }

    // 7. Create CompanyReturn record
    const createdReturns = await CompanyReturn.create([{
      supplier: supplierDoc._id,
      supplierName: supplierDoc.name,
      product: productDoc._id,
      productName: productDoc.productName,
      brand: productDoc.brand || '',
      model: productDoc.model || '',
      purchasePrice,
      status: 'completed',
      imei: allImeis.length > 0 ? allImeis[0] : undefined,
      imeis: allImeis.length > 0 ? allImeis : undefined,
      quantity,
      returnDate: returnDate ? new Date(returnDate) : new Date(),
      reason,
      notes,
      createdBy: req.user?._id
    }], { session })
    const companyReturn = createdReturns[0]

    // 8. Create Financial Transaction Record
    await Transaction.create([{
      transactionType: 'return',
      referenceId: companyReturn._id,
      referenceNumber: companyReturn.returnId || companyReturn._id.toString(),
      description: `Stock Return to ${supplierDoc.name} - ${productDoc.productName} (Qty: ${quantity})`,
      amount: returnAmount,
      paymentMethod: 'cash',
      relatedEntity: supplierDoc.name,
      transactionDate: new Date(returnDate || Date.now()),
      createdBy: req.user?._id,
    }], { session })

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Company return recorded successfully', data: companyReturn })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    console.error('[COMPANY_RETURN] Create Error:', error.message)
    res.status(500).json({ success: false, message: error.message || 'Failed to create return', errors: { error: error.message } })
  }
}

const deleteReturn = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const companyReturn = await CompanyReturn.findById(req.params.id).session(session)
    if (!companyReturn) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Company return not found', errors: {} })
    }

    const allImeis = []
    if (companyReturn.imei) allImeis.push(companyReturn.imei)
    if (companyReturn.imeis && Array.isArray(companyReturn.imeis)) allImeis.push(...companyReturn.imeis)

    if (allImeis.length > 0) {
      const imeiResult = await Imei.updateMany(
        { imeiNumber: { $in: allImeis }, status: 'returned' },
        { $set: { status: 'available' } },
        { session }
      )
      if (imeiResult.modifiedCount !== allImeis.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Cannot delete return: Some items are no longer in returned state.', errors: {} })
      }
    }

    if (companyReturn.product) {
      await Product.findByIdAndUpdate(companyReturn.product, { $inc: { stock: Math.abs(companyReturn.quantity || 1) } }, { session })
    }

    if (companyReturn.supplier) {
      const supplierDoc = await Supplier.findById(companyReturn.supplier).session(session)
      if (supplierDoc) {
        const returnAmount = (companyReturn.purchasePrice || 0) * (companyReturn.quantity || 1)
        if (returnAmount > 0) {
          supplierDoc.totalAmount = (supplierDoc.totalAmount || 0) + returnAmount
          supplierDoc.pendingAmount = (supplierDoc.pendingAmount || 0) + returnAmount
          supplierDoc.pendingAmount = Math.max(0, supplierDoc.totalAmount - (supplierDoc.paidAmount || 0))
          await supplierDoc.save({ session })
        }
      }
    }

    await Transaction.findOneAndDelete({ referenceId: companyReturn._id, transactionType: 'return' }, { session })
    await CompanyReturn.findByIdAndDelete(req.params.id, { session })

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Company return deleted successfully', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to delete return', errors: { error: error.message } })
  }
}

const getReturnsBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params
    const returns = await CompanyReturn.find({ supplier: supplierId })
      .populate('product', 'productName brand model')
      .sort({ returnDate: -1, createdAt: -1 })
    res.json({ success: true, message: 'Returns by supplier loaded', data: returns })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load returns by supplier', errors: { error: error.message } })
  }
}

const exportReturns = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const match = {}
    if (startDate || endDate) {
      match.returnDate = {}
      if (startDate) match.returnDate.$gte = new Date(startDate)
      if (endDate) match.returnDate.$lte = new Date(endDate)
    }
    const returns = await CompanyReturn.find(match)
      .populate('supplier', 'name shopName phone')
      .populate('product', 'productName brand model sku barcode')
      .sort({ returnDate: -1 })
    res.json({ success: true, message: 'Export data loaded', data: returns })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export returns', errors: { error: error.message } })
  }
}

const exportMobileReturns = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const match = {}
    if (startDate || endDate) {
      match.returnDate = {}
      if (startDate) match.returnDate.$gte = new Date(startDate)
      if (endDate) match.returnDate.$lte = new Date(endDate)
    }
    match.$or = [{ imei: { $exists: true, $ne: '' } }, { imeis: { $exists: true, $not: { $size: 0 } } }]
    const returns = await CompanyReturn.find(match)
      .populate('supplier', 'name shopName phone')
      .populate('product', 'productName brand model sku barcode')
      .sort({ returnDate: -1 })
    res.json({ success: true, message: 'Mobile returns export data loaded', data: returns })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export mobile returns', errors: { error: error.message } })
  }
}

module.exports = {
  getAllReturns,
  getReturnById,
  createReturn,
  deleteReturn,
  getReturnsBySupplier,
  exportReturns,
  exportMobileReturns
}
