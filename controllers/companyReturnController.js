const CompanyReturn = require('../models/CompanyReturn')
const Product = require('../models/Product')
const Imei = require('../models/Imei')
const Supplier = require('../models/Supplier')
const Transaction = require('../models/Transaction')
const mongoose = require('mongoose')

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
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { supplier, supplierName, product, productName, imei, imeis, quantity, returnDate, reason, notes, purchasePrice } = req.body

    if (!product || !supplierName) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Product and supplier name are required', errors: {} })
    }
    if (!quantity || quantity <= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Valid quantity is required', errors: {} })
    }

    const productDoc = await Product.findById(product).session(session)
    if (!productDoc) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Product not found', errors: {} })
    }

    const allImeis = []
    if (imei) allImeis.push(imei)
    if (imeis && Array.isArray(imeis)) allImeis.push(...imeis)

    if (allImeis.length > 0) {
      if (allImeis.length !== quantity) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Quantity must match number of IMEIs provided', errors: {} })
      }
      const imeiResult = await Imei.updateMany(
        { imeiNumber: { $in: allImeis }, status: 'available' },
        { $set: { status: 'returned' } },
        { session }
      )
      if (imeiResult.modifiedCount !== allImeis.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'One or more IMEIs are not available.', errors: {} })
      }
    }

    let supplierDoc = null
    if (supplier) supplierDoc = await Supplier.findById(supplier).session(session)

    const returnData = [{
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
    }]
    const createdReturns = await CompanyReturn.create(returnData, { session })
    const companyReturn = createdReturns[0]

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productDoc._id, stock: { $gte: Math.abs(quantity) } },
      { $inc: { stock: -Math.abs(quantity) } },
      { session, new: true }
    )
    if (!updatedProduct) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Insufficient stock to return', errors: {} })
    }

    const returnAmount = (purchasePrice || productDoc.purchasePrice || 0) * quantity;
    if (supplierDoc && returnAmount > 0) {
      supplierDoc.totalAmount = Math.max(0, (supplierDoc.totalAmount || 0) - returnAmount);
      
      if ((supplierDoc.pendingAmount || 0) >= returnAmount) {
        supplierDoc.pendingAmount -= returnAmount;
      } else {
        const excess = returnAmount - (supplierDoc.pendingAmount || 0);
        supplierDoc.pendingAmount = 0;
        supplierDoc.paidAmount = Math.max(0, (supplierDoc.paidAmount || 0) - excess);
      }
      
      supplierDoc.pendingAmount = Math.max(0, supplierDoc.totalAmount - (supplierDoc.paidAmount || 0));
      await supplierDoc.save({ session });
    }

    // Create transaction
    await Transaction.create([{
      transactionType: 'return',
      referenceId: companyReturn._id,
      referenceNumber: companyReturn.returnId || companyReturn._id.toString(),
      description: `Return to ${supplierDoc ? supplierDoc.name : supplierName} - ${productDoc.productName}`,
      amount: (purchasePrice || productDoc.purchasePrice || 0) * quantity,
      paymentMethod: 'cash',
      relatedEntity: supplierDoc ? supplierDoc.name : supplierName,
      transactionDate: new Date(returnDate || Date.now()),
      createdBy: req.user?._id,
    }], { session })

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Company return created successfully', data: companyReturn })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to create return', errors: { error: error.message } })
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
      const supplierDoc = await Supplier.findById(companyReturn.supplier).session(session);
      if (supplierDoc) {
        const returnAmount = (companyReturn.purchasePrice || 0) * (companyReturn.quantity || 1);
        if (returnAmount > 0) {
          supplierDoc.totalAmount = (supplierDoc.totalAmount || 0) + returnAmount;
          // When we reverse the return, the supplier's total pending increases again.
          // Because we don't know exactly if the original return deducted from pending or paid,
          // we add it back to pending first (assuming no real money changed hands yet, just credit).
          // If we want it perfectly symmetrical, we could just add it to pending.
          supplierDoc.pendingAmount = (supplierDoc.pendingAmount || 0) + returnAmount;
          supplierDoc.pendingAmount = Math.max(0, supplierDoc.totalAmount - (supplierDoc.paidAmount || 0));
          await supplierDoc.save({ session });
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

module.exports = { getAllReturns, getReturnById, createReturn, deleteReturn, getReturnsBySupplier, exportReturns, exportMobileReturns }
