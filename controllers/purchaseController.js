const Purchase = require('../models/Purchase')
const Product = require('../models/Product')
const Imei = require('../models/Imei')
const Supplier = require('../models/Supplier')
const Transaction = require('../models/Transaction')
const mongoose = require('mongoose')
const Counter = require('../models/Counter')

const getAllPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find()
      .populate('supplier', 'name shopName phone')
      .sort({ createdAt: -1 })
    res.json({ success: true, message: 'Purchases loaded', data: purchases })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load purchases', errors: { error: error.message } })
  }
}

const getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id).populate('supplier', 'name shopName phone')
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    res.json({ success: true, message: 'Purchase loaded', data: purchase })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load purchase', errors: { error: error.message } })
  }
}

const createPurchase = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { supplier, supplierName, supplierMobile, items, subtotal, discount, discountType, discountAmount, gst, gstType, gstAmount, totalAmount, paidAmount, paymentMethod, paymentMethods, date, notes, invoiceNumber } = req.body

    if (!supplierName && !supplier) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Supplier is required', errors: {} })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'At least one item is required', errors: {} })
    }

    let supplierDoc = null
    if (supplier) {
      supplierDoc = await Supplier.findById(supplier).session(session)
      if (!supplierDoc) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({ success: false, message: 'Supplier not found', errors: {} })
      }
    }

    const processedItems = []
    const allRequestImeis = []
    for (const item of items) {
      if (!item.product) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Product is required for each item', errors: {} })
      }
      const productDoc = await Product.findById(item.product).session(session)
      if (!productDoc) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({ success: false, message: `Product not found: ${item.productName || item.product}`, errors: {} })
      }

      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      
      const qty = Math.abs(item.quantity || 1)
      if (allImeis.length > 0) {
        if (allImeis.length !== qty) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Quantity must match number of IMEIs for product ${productDoc.productName}`, errors: {} })
        }
        allRequestImeis.push(...allImeis)
      }
      processedItems.push({
        product: productDoc._id,
        productName: productDoc.productName || item.productName,
        imei: item.imei || undefined,
        imeis: item.imeis || undefined,
        quantity: item.quantity || 1,
        costPrice: item.costPrice || 0,
        total: item.total || ((item.costPrice || 0) * (item.quantity || 1))
      })
    }

    if (allRequestImeis.length > 0) {
      if (new Set(allRequestImeis).size !== allRequestImeis.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Duplicate IMEIs found in the request', errors: {} })
      }
      const existingImeis = await Imei.find({ imeiNumber: { $in: allRequestImeis } }).session(session)
      if (existingImeis.length > 0) {
         await session.abortTransaction()
         session.endSession()
         return res.status(422).json({ success: false, message: `IMEIs already exist in database: ${existingImeis.map(i => i.imeiNumber).join(', ')}`, errors: {} })
      }
    }

    const purchaseData = [{
      supplier: supplierDoc ? supplierDoc._id : null,
      supplierName: supplierDoc ? supplierDoc.name : (supplierName || ''),
      supplierMobile: supplierDoc ? supplierDoc.phone : (supplierMobile || ''),
      invoiceNumber: invoiceNumber || '',
      items: processedItems,
      subtotal: subtotal || 0,
      discount: discount || 0,
      discountType: discountType || 'fixed',
      discountAmount: discountAmount || 0,
      gst: gst || 0,
      gstType: gstType || 'none',
      gstAmount: gstAmount || 0,
      totalAmount: totalAmount || 0,
      paidAmount: paidAmount || 0,
      paymentMethod: paymentMethod || 'cash',
      paymentMethods: paymentMethods || undefined,
      date: date || Date.now(),
      notes: notes || '',
      createdBy: req.user?._id
    }]
    const createdPurchases = await Purchase.create(purchaseData, { session, ordered: true })
    const purchase = createdPurchases[0]

    // Update stock and IMEIs
    for (const item of processedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: Math.abs(item.quantity || 1) } }, { session })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) {
        const imeiDocs = allImeis.map(imeiNum => ({ productId: item.product, imeiNumber: imeiNum, status: 'available' }))
        await Imei.insertMany(imeiDocs, { session })
      }
    }

    // Update supplier ledger
    if (supplierDoc && totalAmount) {
      supplierDoc.totalAmount = (supplierDoc.totalAmount || 0) + totalAmount
      supplierDoc.pendingAmount = (supplierDoc.pendingAmount || 0) + Math.max(0, totalAmount - (paidAmount || 0))
      supplierDoc.paidAmount = (supplierDoc.paidAmount || 0) + (paidAmount || 0)
      await supplierDoc.save({ session })
    }

    // Create transaction
    await Transaction.create([{
      transactionType: 'purchase',
      referenceId: purchase._id,
      referenceNumber: invoiceNumber || purchase._id.toString(),
      description: `Purchase from ${supplierDoc ? supplierDoc.name : supplierName}`,
      amount: totalAmount || 0,
      paymentMethod: paymentMethod || 'cash',
      relatedEntity: supplierDoc ? supplierDoc.name : supplierName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    }], { session })

    await session.commitTransaction()
    session.endSession()
    res.status(201).json({ success: true, message: 'Purchase created successfully', data: purchase })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    console.error("CREATE PURCHASE ERROR:", error);
    res.status(500).json({ success: false, message: 'Failed to create purchase', errors: { error: error.message } })
  }
}

const updatePurchase = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { supplier, supplierName, supplierMobile, items, subtotal, discount, discountType, discountAmount, gst, gstType, gstAmount, totalAmount, paidAmount, paymentMethod, paymentMethods, date, notes, invoiceNumber } = req.body
    const purchase = await Purchase.findById(req.params.id).session(session)
    if (!purchase) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    }
    if (purchase.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot update a cancelled purchase', errors: {} })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'At least one item is required', errors: {} })
    }

    // 0. Ensure no old IMEIs were sold
    const oldImeis = []
    for (const item of purchase.items) {
      if (item.imei) oldImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) oldImeis.push(...item.imeis)
    }
    if (oldImeis.length > 0) {
       const nonAvailable = await Imei.find({ imeiNumber: { $in: oldImeis }, status: { $ne: 'available' } }).session(session)
       if (nonAvailable.length > 0) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: 'Cannot update purchase because some items have already been sold or moved.', errors: {} })
       }
    }
    for (const item of purchase.items) {
       const qtyToDeduct = Math.abs(item.quantity || 1)
       const p = await Product.findOne({ _id: item.product, stock: { $gte: qtyToDeduct } }).session(session)
       if (!p) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Cannot update purchase: Stock for ${item.productName || 'product'} would become negative.`, errors: {} })
       }
    }

    // 1. Reverse stock impact and IMEIs of old items
    for (const item of purchase.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -Math.abs(item.quantity || 1) } }, { session })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) await Imei.deleteMany({ imeiNumber: { $in: allImeis } }, { session })
    }

    // 2. Reverse supplier ledger of old purchase
    let oldSupplierDoc = null
    if (purchase.supplier) {
      oldSupplierDoc = await Supplier.findById(purchase.supplier).session(session)
      if (oldSupplierDoc) {
        oldSupplierDoc.totalAmount = Math.max(0, (oldSupplierDoc.totalAmount || 0) - (purchase.totalAmount || 0))
        oldSupplierDoc.pendingAmount = Math.max(0, (oldSupplierDoc.pendingAmount || 0) - Math.max(0, (purchase.totalAmount || 0) - (purchase.paidAmount || 0)))
        oldSupplierDoc.paidAmount = Math.max(0, (oldSupplierDoc.paidAmount || 0) - (purchase.paidAmount || 0))
        await oldSupplierDoc.save({ session })
      }
    }

    // 3. Process new items
    let newSupplierDoc = null
    if (supplier) {
      newSupplierDoc = await Supplier.findById(supplier).session(session)
      if (!newSupplierDoc) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({ success: false, message: 'New Supplier not found', errors: {} })
      }
    }

    const processedItems = []
    for (const item of items) {
      if (!item.product) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Product is required for each item', errors: {} })
      }
      const productDoc = await Product.findById(item.product).session(session)
      if (!productDoc) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({ success: false, message: `Product not found: ${item.productName || item.product}`, errors: {} })
      }
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      
      const qty = Math.abs(item.quantity || 1)
      if (allImeis.length > 0) {
        if (allImeis.length !== qty) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Quantity must match number of IMEIs for product ${productDoc.productName}`, errors: {} })
        }
      }

      processedItems.push({
        product: productDoc._id,
        productName: productDoc.productName || item.productName,
        imei: item.imei || undefined,
        imeis: item.imeis || undefined,
        quantity: item.quantity || 1,
        costPrice: item.costPrice || 0,
        total: item.total || ((item.costPrice || 0) * (item.quantity || 1))
      })
    }
    
    // Check for duplicates in new IMEIs (excluding the old ones we are replacing)
    const newRequestImeis = [];
    for (const item of processedItems) {
       if (item.imei) newRequestImeis.push(item.imei)
       if (item.imeis && Array.isArray(item.imeis)) newRequestImeis.push(...item.imeis)
    }
    if (newRequestImeis.length > 0) {
      if (new Set(newRequestImeis).size !== newRequestImeis.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Duplicate IMEIs found in the new request items', errors: {} })
      }
      
      // existingImeis should not include oldImeis because they were reversed earlier in the transaction
      // but just to be safe, we query the DB within the session
      const existingImeis = await Imei.find({ imeiNumber: { $in: newRequestImeis } }).session(session)
      if (existingImeis.length > 0) {
         await session.abortTransaction()
         session.endSession()
         return res.status(422).json({ success: false, message: `IMEIs already exist in database: ${existingImeis.map(i => i.imeiNumber).join(', ')}`, errors: {} })
      }
    }

    // 4. Apply new items stock and IMEIs
    for (const item of processedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: Math.abs(item.quantity || 1) } }, { session })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) {
        const imeiDocs = allImeis.map(imeiNum => ({ productId: item.product, imeiNumber: imeiNum, status: 'available' }))
        await Imei.insertMany(imeiDocs, { session })
      }
    }

    // 5. Update supplier ledger
    if (newSupplierDoc && totalAmount !== undefined) {
      newSupplierDoc.totalAmount = (newSupplierDoc.totalAmount || 0) + totalAmount
      newSupplierDoc.pendingAmount = (newSupplierDoc.pendingAmount || 0) + Math.max(0, totalAmount - (paidAmount || 0))
      newSupplierDoc.paidAmount = (newSupplierDoc.paidAmount || 0) + (paidAmount || 0)
      await newSupplierDoc.save({ session })
    } else if (!newSupplierDoc && oldSupplierDoc && supplier === undefined) {
       // if we didn't get a new supplier, keep the old one, but we must update its ledger for the new amounts
       if (totalAmount !== undefined) {
          oldSupplierDoc.totalAmount = (oldSupplierDoc.totalAmount || 0) + totalAmount
          oldSupplierDoc.pendingAmount = (oldSupplierDoc.pendingAmount || 0) + Math.max(0, totalAmount - (paidAmount || 0))
          oldSupplierDoc.paidAmount = (oldSupplierDoc.paidAmount || 0) + (paidAmount || 0)
          await oldSupplierDoc.save({ session })
       }
    }

    // 6. Update purchase fields
    if (supplier !== undefined) purchase.supplier = newSupplierDoc ? newSupplierDoc._id : null
    if (supplierName !== undefined) purchase.supplierName = newSupplierDoc ? newSupplierDoc.name : supplierName
    if (supplierMobile !== undefined) purchase.supplierMobile = newSupplierDoc ? newSupplierDoc.phone : supplierMobile
    if (invoiceNumber !== undefined) purchase.invoiceNumber = invoiceNumber
    purchase.items = processedItems
    if (subtotal !== undefined) purchase.subtotal = subtotal
    if (discount !== undefined) purchase.discount = discount
    if (discountType !== undefined) purchase.discountType = discountType
    if (discountAmount !== undefined) purchase.discountAmount = discountAmount
    if (gst !== undefined) purchase.gst = gst
    if (gstType !== undefined) purchase.gstType = gstType
    if (gstAmount !== undefined) purchase.gstAmount = gstAmount
    if (totalAmount !== undefined) purchase.totalAmount = totalAmount
    if (paidAmount !== undefined) purchase.paidAmount = paidAmount
    if (paymentMethod !== undefined) purchase.paymentMethod = paymentMethod
    if (paymentMethods !== undefined) purchase.paymentMethods = paymentMethods
    if (date !== undefined) purchase.date = date
    if (notes !== undefined) purchase.notes = notes
    await purchase.save({ session })

    // 7. Update transaction record
    await Transaction.findOneAndUpdate(
      { referenceId: purchase._id, transactionType: 'purchase' }, 
      { amount: totalAmount || 0, paymentMethod: paymentMethod || 'cash' }, 
      { session }
    )

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Purchase updated successfully', data: purchase })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to update purchase', errors: { error: error.message } })
  }
}

const deletePurchase = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const purchase = await Purchase.findById(req.params.id).session(session)
    if (!purchase) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    }
    // Before reversing, ensure no items were sold
    const oldImeis = []
    for (const item of purchase.items) {
      if (item.imei) oldImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) oldImeis.push(...item.imeis)
    }
    if (oldImeis.length > 0) {
       const nonAvailable = await Imei.find({ imeiNumber: { $in: oldImeis }, status: { $ne: 'available' } }).session(session)
       if (nonAvailable.length > 0) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: 'Cannot delete purchase because some items have already been sold.', errors: {} })
       }
    }
    for (const item of purchase.items) {
       const qtyToDeduct = Math.abs(item.quantity || 1)
       const p = await Product.findOne({ _id: item.product, stock: { $gte: qtyToDeduct } }).session(session)
       if (!p) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Cannot delete purchase: Stock for ${item.productName || 'product'} would become negative.`, errors: {} })
       }
    }

    // Reverse stock impact
    for (const item of purchase.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -Math.abs(item.quantity || 1) } }, { session })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) await Imei.deleteMany({ imeiNumber: { $in: allImeis } }, { session })
    }

    // Reverse supplier ledger
    if (purchase.supplier && purchase.totalAmount) {
      const supplierDoc = await Supplier.findById(purchase.supplier).session(session)
      if (supplierDoc) {
        supplierDoc.totalAmount = Math.max(0, (supplierDoc.totalAmount || 0) - (purchase.totalAmount || 0))
        supplierDoc.pendingAmount = Math.max(0, (supplierDoc.pendingAmount || 0) - Math.max(0, (purchase.totalAmount || 0) - (purchase.paidAmount || 0)))
        supplierDoc.paidAmount = Math.max(0, (supplierDoc.paidAmount || 0) - (purchase.paidAmount || 0))
        await supplierDoc.save({ session })
      }
    }

    // Delete associated transaction
    await Transaction.findOneAndDelete({ referenceId: purchase._id, transactionType: 'purchase' }, { session })

    await Purchase.findByIdAndDelete(req.params.id, { session })
    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Purchase deleted successfully', data: {} })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to delete purchase', errors: { error: error.message } })
  }
}

const cancelPurchase = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { cancelReason } = req.body
    const purchase = await Purchase.findById(req.params.id).session(session)
    if (!purchase) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    }
    if (purchase.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Purchase is already cancelled', errors: {} })
    }
    // Before reversing, ensure no items were sold
    const oldImeis = []
    for (const item of purchase.items) {
      if (item.imei) oldImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) oldImeis.push(...item.imeis)
    }
    if (oldImeis.length > 0) {
       const nonAvailable = await Imei.find({ imeiNumber: { $in: oldImeis }, status: { $ne: 'available' } }).session(session)
       if (nonAvailable.length > 0) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: 'Cannot cancel purchase because some items have already been sold.', errors: {} })
       }
    }
    for (const item of purchase.items) {
       const qtyToDeduct = Math.abs(item.quantity || 1)
       const p = await Product.findOne({ _id: item.product, stock: { $gte: qtyToDeduct } }).session(session)
       if (!p) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Cannot cancel purchase: Stock for ${item.productName || 'product'} would become negative.`, errors: {} })
       }
    }
    for (const item of purchase.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -Math.abs(item.quantity || 1) } }, { session })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) await Imei.deleteMany({ imeiNumber: { $in: allImeis } }, { session })
    }
    if (purchase.supplier && purchase.totalAmount) {
      const supplierDoc = await Supplier.findById(purchase.supplier).session(session)
      if (supplierDoc) {
        supplierDoc.totalAmount = Math.max(0, (supplierDoc.totalAmount || 0) - purchase.totalAmount)
        supplierDoc.pendingAmount = Math.max(0, (supplierDoc.pendingAmount || 0) - Math.max(0, purchase.totalAmount - (purchase.paidAmount || 0)))
        supplierDoc.paidAmount = Math.max(0, (supplierDoc.paidAmount || 0) - (purchase.paidAmount || 0))
        await supplierDoc.save({ session })
      }
    }
    purchase.status = 'cancelled'
    purchase.cancelledAt = new Date()
    purchase.cancelReason = cancelReason || ''
    await purchase.save({ session })

    // Create transaction record for cancellation (if money was paid)
    if (purchase.paidAmount > 0) {
      await Transaction.create([{
        transactionType: 'refund',
        referenceId: purchase._id,
        referenceNumber: purchase.invoiceNumber || purchase._id.toString(),
        description: `Purchase cancellation refund from ${purchase.supplierName}`,
        amount: purchase.paidAmount,
        paymentMethod: purchase.paymentMethod || 'cash',
        relatedEntity: purchase.supplierName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      }], { session })
    }

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Purchase cancelled successfully', data: purchase })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: 'Failed to cancel purchase', errors: { error: error.message } })
  }
}

const getPurchaseSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const match = { status: { $ne: 'cancelled' } }
    if (startDate || endDate) {
      match.date = {}
      if (startDate) match.date.$gte = new Date(startDate)
      if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); match.date.$lte = e }
    }
    const purchases = await Purchase.find(match)
    const totalPurchases = purchases.length
    const totalAmount = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0)
    const totalPaid = purchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0)
    let totalItems = 0
    purchases.forEach(p => { p.items.forEach(item => { totalItems += item.quantity || 1 }) })
    res.json({
      success: true, message: 'Purchase summary loaded',
      data: { totalPurchases, totalAmount, totalPaid, totalDue: totalAmount - totalPaid, totalItems }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load purchase summary', errors: { error: error.message } })
  }
}

module.exports = { getAllPurchases, getPurchaseById, createPurchase, updatePurchase, deletePurchase, cancelPurchase, getPurchaseSummary }
