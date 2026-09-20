const Purchase = require('../models/Purchase')
const Product = require('../models/Product')
const Imei = require('../models/Imei')
const Supplier = require('../models/Supplier')
const Transaction = require('../models/Transaction')

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
  try {
    const { supplier, supplierName, supplierMobile, items, subtotal, discount, discountType, discountAmount, gst, gstType, gstAmount, totalAmount, paidAmount, paymentMethod, paymentMethods, date, notes, invoiceNumber } = req.body

    if (!supplierName && !supplier) {
      return res.status(422).json({ success: false, message: 'Supplier is required', errors: {} })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(422).json({ success: false, message: 'At least one item is required', errors: {} })
    }

    let supplierDoc = null
    if (supplier) {
      supplierDoc = await Supplier.findById(supplier)
      if (!supplierDoc) return res.status(404).json({ success: false, message: 'Supplier not found', errors: {} })
    }

    const processedItems = []
    for (const item of items) {
      if (!item.product) {
        return res.status(422).json({ success: false, message: 'Product is required for each item', errors: {} })
      }
      const productDoc = await Product.findById(item.product)
      if (!productDoc) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.productName || item.product}`, errors: {} })
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

    const purchase = await Purchase.create({
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
    })

    // Update stock and IMEIs
    for (const item of processedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: Math.abs(item.quantity || 1) } })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) {
        const imeiDocs = allImeis.map(imeiNum => ({ productId: item.product, imeiNumber: imeiNum, status: 'available' }))
        await Imei.insertMany(imeiDocs, { ordered: false }).catch(() => {})
      }
    }

    // Update supplier ledger
    if (supplierDoc && totalAmount) {
      supplierDoc.totalAmount = (supplierDoc.totalAmount || 0) + totalAmount
      supplierDoc.pendingAmount = (supplierDoc.pendingAmount || 0) + Math.max(0, totalAmount - (paidAmount || 0))
      supplierDoc.paidAmount = (supplierDoc.paidAmount || 0) + (paidAmount || 0)
      await supplierDoc.save()
    }

    // Create transaction
    await Transaction.create({
      transactionType: 'purchase',
      referenceId: purchase._id,
      referenceNumber: invoiceNumber || purchase._id.toString(),
      description: `Purchase from ${supplierDoc ? supplierDoc.name : supplierName}`,
      amount: totalAmount || 0,
      paymentMethod: paymentMethod || 'cash',
      relatedEntity: supplierDoc ? supplierDoc.name : supplierName,
      transactionDate: new Date(date || Date.now()),
      createdBy: req.user?._id,
    })

    res.status(201).json({ success: true, message: 'Purchase created successfully', data: purchase })
  } catch (error) {
    console.error("CREATE PURCHASE ERROR:", error);
    res.status(500).json({ success: false, message: 'Failed to create purchase', errors: { error: error.message } })
  }
}

const updatePurchase = async (req, res) => {
  try {
    const { supplierName, supplierMobile, subtotal, discount, discountType, discountAmount, gst, gstType, gstAmount, totalAmount, paidAmount, paymentMethod, paymentMethods, date, notes } = req.body
    const purchase = await Purchase.findById(req.params.id)
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    if (purchase.status === 'cancelled') return res.status(422).json({ success: false, message: 'Cannot update a cancelled purchase', errors: {} })
    if (supplierName !== undefined) purchase.supplierName = supplierName
    if (supplierMobile !== undefined) purchase.supplierMobile = supplierMobile
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
    await purchase.save()
    res.json({ success: true, message: 'Purchase updated successfully', data: purchase })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update purchase', errors: { error: error.message } })
  }
}

const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    // Reverse stock impact
    for (const item of purchase.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -Math.abs(item.quantity || 1) } })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) await Imei.deleteMany({ imeiNumber: { $in: allImeis } })
    }
    await Purchase.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Purchase deleted successfully', data: {} })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete purchase', errors: { error: error.message } })
  }
}

const cancelPurchase = async (req, res) => {
  try {
    const { cancelReason } = req.body
    const purchase = await Purchase.findById(req.params.id)
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found', errors: {} })
    if (purchase.status === 'cancelled') return res.status(422).json({ success: false, message: 'Purchase is already cancelled', errors: {} })
    for (const item of purchase.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -Math.abs(item.quantity || 1) } })
      const allImeis = []
      if (item.imei) allImeis.push(item.imei)
      if (item.imeis && Array.isArray(item.imeis)) allImeis.push(...item.imeis)
      if (allImeis.length > 0) await Imei.deleteMany({ imeiNumber: { $in: allImeis } })
    }
    if (purchase.supplier && purchase.totalAmount) {
      const supplierDoc = await Supplier.findById(purchase.supplier)
      if (supplierDoc) {
        supplierDoc.totalAmount = Math.max(0, (supplierDoc.totalAmount || 0) - purchase.totalAmount)
        supplierDoc.pendingAmount = Math.max(0, (supplierDoc.pendingAmount || 0) - Math.max(0, purchase.totalAmount - (purchase.paidAmount || 0)))
        supplierDoc.paidAmount = Math.max(0, (supplierDoc.paidAmount || 0) - (purchase.paidAmount || 0))
        await supplierDoc.save()
      }
    }
    purchase.status = 'cancelled'
    purchase.cancelledAt = new Date()
    purchase.cancelReason = cancelReason || ''
    await purchase.save()
    res.json({ success: true, message: 'Purchase cancelled successfully', data: purchase })
  } catch (error) {
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
