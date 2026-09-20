const CompanyReturn = require('../models/CompanyReturn')
const Product = require('../models/Product')
const Imei = require('../models/Imei')
const Supplier = require('../models/Supplier')
const Transaction = require('../models/Transaction')

const getAllReturns = async (req, res) => {
  try {
    const returns = await CompanyReturn.find()
      .populate('supplier', 'name type shopName phone')
      .populate('product', 'productName brand model sku barcode costPrice')
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
      .populate('product', 'productName brand model sku barcode costPrice')
    if (!companyReturn) return res.status(404).json({ success: false, message: 'Company return not found', errors: {} })
    res.json({ success: true, message: 'Company return loaded', data: companyReturn })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load return', errors: { error: error.message } })
  }
}

const createReturn = async (req, res) => {
  try {
    const { supplier, supplierName, product, productName, imei, imeis, quantity, returnDate, reason, notes, purchasePrice } = req.body

    if (!product || !supplierName) {
      return res.status(422).json({ success: false, message: 'Product and supplier name are required', errors: {} })
    }
    if (!quantity || quantity <= 0) {
      return res.status(422).json({ success: false, message: 'Valid quantity is required', errors: {} })
    }

    const productDoc = await Product.findById(product)
    if (!productDoc) return res.status(404).json({ success: false, message: 'Product not found', errors: {} })

    const allImeis = []
    if (imei) allImeis.push(imei)
    if (imeis && Array.isArray(imeis)) allImeis.push(...imeis)

    if (allImeis.length > 0) {
      const imeiDocs = await Imei.find({ imeiNumber: { $in: allImeis } })
      const foundImeis = imeiDocs.map(i => i.imeiNumber)
      const missingImeis = allImeis.filter(i => !foundImeis.includes(i))
      if (missingImeis.length > 0) {
        return res.status(422).json({ success: false, message: `IMEIs not found: ${missingImeis.join(', ')}`, errors: {} })
      }
      const alreadyReturned = imeiDocs.filter(i => i.status === 'returned').map(i => i.imeiNumber)
      if (alreadyReturned.length > 0) {
        return res.status(422).json({ success: false, message: `IMEIs already returned: ${alreadyReturned.join(', ')}`, errors: {} })
      }
    }

    let supplierDoc = null
    if (supplier) supplierDoc = await Supplier.findById(supplier)

    const companyReturn = await CompanyReturn.create({
      supplier: supplierDoc ? supplierDoc._id : null,
      supplierName: supplierDoc ? supplierDoc.name : supplierName,
      product: productDoc._id,
      productName: productDoc.productName || productName,
      brand: productDoc.brand || '',
      model: productDoc.model || '',
      purchasePrice: purchasePrice || productDoc.purchasePrice || 0,
      status: 'completed',
      imei: imei || (allImeis.length > 0 ? allImeis[0] : undefined),
      imeis: allImeis.length > 0 ? allImeis : undefined,
      quantity,
      returnDate: returnDate || Date.now(),
      reason: reason || '',
      notes: notes || '',
      createdBy: req.user?._id
    })

    if (allImeis.length > 0) {
      await Imei.updateMany({ imeiNumber: { $in: allImeis } }, { $set: { status: 'returned' } })
    }

    await Product.findByIdAndUpdate(productDoc._id, { $inc: { stock: -Math.abs(quantity) } })

    // Create transaction
    await Transaction.create({
      transactionType: 'return',
      referenceId: companyReturn._id,
      referenceNumber: companyReturn.returnId || companyReturn._id.toString(),
      description: `Return to ${supplierDoc ? supplierDoc.name : supplierName} - ${productDoc.productName}`,
      amount: (purchasePrice || productDoc.purchasePrice || 0) * quantity,
      paymentMethod: 'cash',
      relatedEntity: supplierDoc ? supplierDoc.name : supplierName,
      transactionDate: new Date(returnDate || Date.now()),
      createdBy: req.user?._id,
    })

    res.status(201).json({ success: true, message: 'Company return created successfully', data: companyReturn })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create return', errors: { error: error.message } })
  }
}

const deleteReturn = async (req, res) => {
  try {
    const companyReturn = await CompanyReturn.findById(req.params.id)
    if (!companyReturn) return res.status(404).json({ success: false, message: 'Company return not found', errors: {} })

    const allImeis = []
    if (companyReturn.imei) allImeis.push(companyReturn.imei)
    if (companyReturn.imeis && Array.isArray(companyReturn.imeis)) allImeis.push(...companyReturn.imeis)

    if (allImeis.length > 0) {
      await Imei.updateMany({ imeiNumber: { $in: allImeis } }, { $set: { status: 'available' } })
    }

    if (companyReturn.product) {
      await Product.findByIdAndUpdate(companyReturn.product, { $inc: { stock: Math.abs(companyReturn.quantity || 1) } })
    }

    await CompanyReturn.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Company return deleted successfully', data: {} })
  } catch (error) {
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

module.exports = { getAllReturns, getReturnById, createReturn, deleteReturn, getReturnsBySupplier, exportReturns, exportMobileReturns }
