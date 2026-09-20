const Sale = require('../models/Sale')
const Customer = require('../models/Customer')
const Imei = require('../models/Imei')
const Product = require('../models/Product')
const Transaction = require('../models/Transaction')

const list = async (req, res) => {
  try {
    const { status, saleType, startDate, endDate, search } = req.query
    const filter = {}
    if (status) filter.status = status
    if (saleType) filter.saleType = saleType
    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = end
      }
    }
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ]
    }
    const sales = await Sale.find(filter).sort({ createdAt: -1 })
    res.json({ success: true, message: 'Sales loaded', data: sales })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load sales', errors: { error: error.message } })
  }
}

const getOne = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    res.json({ success: true, message: 'Sale loaded', data: sale })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load sale', errors: { error: error.message } })
  }
}

const create = async (req, res) => {
  // Track created objects for manual rollback
  let createdSaleId = null
  let imeiMarkedSold = []
  let stockDecrements = []
  let customerBalanceAdded = 0
  let customerId = null

  try {
    const { 
      invoiceNumber, customerName, phone, saleType, paymentMode, 
      items, subTotal, totalDiscount, totalTax, grandTotal, financeDetails,
      pickedBy, partyGst, warrantySaleAmount, delayPaymentExpected, amountPaid, amountDue, promisedDate


    } = req.body

    
    if (!customerName || !phone || !items || !items.length) {
      return res.status(422).json({ success: false, message: 'Missing required sale details', errors: {} })
    }
    if (subTotal === undefined || grandTotal === undefined) {
      return res.status(422).json({ success: false, message: 'Missing amount fields', errors: {} })
    }

    // 1. Find or create customer
    let customer = await Customer.findOne({ phone })
    if (!customer) {
      customer = await Customer.create({ 
        customerName, phone, 
        customerType: saleType === 'wholesale' ? 'wholesale' : 'retail',
        totalPurchases: grandTotal,
        address: req.body.address || '',
        gstNumber: req.body.partyGst || ''
      })
    } else {
      customer.totalPurchases = (customer.totalPurchases || 0) + grandTotal
      customerBalanceAdded = grandTotal
      customerId = customer._id
      if (saleType === 'wholesale') customer.customerType = 'wholesale'
      if (req.body.address) customer.address = req.body.address
      if (req.body.partyGst) customer.gstNumber = req.body.partyGst
      await customer.save()
    }
    customerId = customer._id

    // 2. Lookup Purchase Prices for items
    for (const item of items) {
      if (item.productId) {
        const p = await Product.findById(item.productId)
        if (p) item.purchasePrice = p.purchasePrice || 0
      }
    }

    // 3. Validate IMEI before creating sale
    const imeiList = items.map(item => item.imei).filter(Boolean)
    if (imeiList.length > 0) {
      const existingSold = await Imei.find({ imeiNumber: { $in: imeiList }, status: 'sold' })
      if (existingSold.length > 0) {
        // Rollback customer balance
        if (customerBalanceAdded > 0) {
          await Customer.findByIdAndUpdate(customerId, { $inc: { totalPurchases: -customerBalanceAdded } })
        }
        return res.status(422).json({ success: false, message: `IMEI ${existingSold[0].imeiNumber} is already sold.`, errors: {} })
      }
    }

    // 4. Create the sale record
    let inv = invoiceNumber;
    if (!inv || String(inv).includes('MVM-RET') || String(inv).includes('INV-')) {
      const lastSale = await Sale.findOne({ invoiceNumber: { $regex: '^[0-9]+$' } }).sort({ createdAt: -1 });
      let nextInv = 1;
      if (lastSale && !isNaN(lastSale.invoiceNumber)) {
        nextInv = parseInt(lastSale.invoiceNumber) + 1;
      } else {
        const count = await Sale.countDocuments();
        nextInv = count + 1;
      }
      inv = nextInv.toString();
    }
    const sale = await Sale.create({
      invoiceNumber: inv,
      customerId: customer._id,
      customerName,
      phone,
      saleType,
      paymentMode,
      items,
      subTotal,
      totalDiscount,
      totalTax,
      grandTotal,
      financeDetails,
      pickedBy,
      partyGst,
      warrantySaleAmount,
      delayPaymentExpected,
      createdBy: req.user?._id
    })
    createdSaleId = sale._id

    // 5. Update IMEIs as sold
    if (imeiList.length > 0) {
      await Imei.updateMany(
        { imeiNumber: { $in: imeiList } },
        { $set: { status: 'sold', soldAt: new Date() } }
      )
      imeiMarkedSold = imeiList
    }

    // 6. Decrement Product Stock
    for (const item of items) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -Math.abs(item.qty || 1) } })
        stockDecrements.push({ productId: item.productId, qty: item.qty || 1 })
      }
    }

    // 7. Create transaction record
    await Transaction.create({
      transactionType: 'sale',
      referenceId: sale._id,
      referenceNumber: sale.invoiceNumber,
      description: `Sale to ${customerName}`,
      amount: grandTotal,
      paymentMethod: paymentMode === 'finance' ? 'credit' : (paymentMode || 'cash'),
      relatedEntity: customerName,
      transactionDate: new Date(),
      createdBy: req.user?._id,
    })

    res.status(201).json({ success: true, message: 'Sale created successfully', data: sale })
  } catch (error) {
    // Manual rollback
    try {
      if (createdSaleId) await Sale.findByIdAndDelete(createdSaleId)
      if (imeiMarkedSold.length > 0) {
        await Imei.updateMany({ imeiNumber: { $in: imeiMarkedSold } }, { $set: { status: 'available', soldAt: null } })
      }
      for (const d of stockDecrements) {
        await Product.findByIdAndUpdate(d.productId, { $inc: { stock: d.qty } })
      }
      if (customerBalanceAdded > 0 && customerId) {
        await Customer.findByIdAndUpdate(customerId, { $inc: { totalPurchases: -customerBalanceAdded } })
      }
    } catch (rollbackError) {
      console.error('[SALE] Rollback error:', rollbackError.message)
    }
    console.error('[SALE] ERROR:', error.message)
    res.status(500).json({ success: false, message: error.message || 'Failed to create sale', errors: { error: error.message } })
  }
}

const getPendingEmiNotifications = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28)
    
    const sales = await Sale.find({
      saleType: 'retail',
      status: { $ne: 'cancelled' },
      $or: [
        { paymentMode: 'finance', createdAt: { $lte: thirtyDaysAgo } },
        { delayPaymentExpected: true }
      ]
    }).sort({ createdAt: -1 })

    const notifications = sales.map(s => {
      let daysSince = Math.floor((new Date() - new Date(s.createdAt)) / (1000 * 60 * 60 * 24))
      if (s.promisedDate) {
         daysSince = Math.floor((new Date() - new Date(s.promisedDate)) / (1000 * 60 * 60 * 24))
      }
      const type = s.delayPaymentExpected ? 'Delayed Payment' : 'EMI Due'
      const dueAmount = s.amountDue !== undefined ? s.amountDue : (s.financeDetails?.emiAmount || s.grandTotal)
      return { id: s._id, customerName: s.customerName, phone: s.phone, type, daysSince, dueAmount, invoiceNumber: s.invoiceNumber, date: s.createdAt, promisedDate: s.promisedDate }
    }).filter(n => n.dueAmount > 0)
    res.json({ success: true, data: notifications })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get EMI notifications', errors: { error: error.message } })
  }
}

const getBalanceSheet = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const matchObj = { status: { $ne: 'cancelled' } }
    if (startDate || endDate) {
      matchObj.createdAt = {}
      if (startDate) matchObj.createdAt.$gte = new Date(startDate)
      if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); matchObj.createdAt.$lte = e }
    }

    const allSales = await Sale.find(matchObj).sort({ createdAt: -1 })

    const gstSales = allSales.filter(s => s.partyGst && s.partyGst.length > 0)
    let totalGstSales = 0, totalGstTaxCollected = 0
    const gstLedger = gstSales.map(s => {
      totalGstSales += s.grandTotal || 0
      totalGstTaxCollected += s.totalTax || 0
      return {
        date: s.createdAt, invoiceNumber: s.invoiceNumber, customerName: s.customerName,
        partyGst: s.partyGst, taxableValue: (s.subTotal || 0) - (s.totalDiscount || 0),
        taxAmount: s.totalTax, totalAmount: s.grandTotal
      }
    })

    const stockLedger = allSales.map(s => ({
      date: s.createdAt, type: 'Sale',
      invoiceNumber: s.invoiceNumber,
      items: s.items.map(i => `${i.productName} (x${i.qty})`).join(', '),
      amount: s.grandTotal
    }))

    const financeSales = allSales.filter(s => s.paymentMode === 'finance')
    const financeLedger = financeSales.map(s => ({
      date: s.createdAt, invoiceNumber: s.invoiceNumber, customerName: s.customerName,
      company: s.financeDetails?.company || 'Unknown',
      financeType: s.financeDetails?.company ? 'Company' : 'Private',
      loanId: s.financeDetails?.loanId || s.financeDetails?.fileNo || '-',
      amount: s.grandTotal, emiAmount: s.financeDetails?.emiAmount || 0, tenure: s.financeDetails?.tenure || '0'
    }))

    res.json({
      success: true,
      data: {
        gst: { ledger: gstLedger, totalSales: totalGstSales, totalTax: totalGstTaxCollected },
        stock: { ledger: stockLedger, totalSold: allSales.reduce((a, s) => a + (s.grandTotal || 0), 0) },
        finance: { ledger: financeLedger, totalAmount: financeSales.reduce((a, s) => a + (s.grandTotal || 0), 0) }
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get balance sheet', errors: { error: error.message } })
  }
}

const update = async (req, res) => {
  try {
    const saleId = req.params.id
    const oldSale = await Sale.findById(saleId)
    
    if (!oldSale) return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    if (oldSale.status === 'cancelled') return res.status(422).json({ success: false, message: 'Cannot edit a cancelled sale', errors: {} })

    const { items, subTotal, totalDiscount, totalTax, grandTotal, partyGst, amountPaid, amountDue, promisedDate } = req.body

    // 1. Reverse old IMEI and stock changes
    const oldImeiList = oldSale.items.map(item => item.imei).filter(Boolean)
    if (oldImeiList.length > 0) {
      await Imei.updateMany({ imeiNumber: { $in: oldImeiList } }, { $set: { status: 'available', soldAt: null } })
    }
    for (const item of oldSale.items) {
      if (item.productId) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty || 1 } })
    }

    // 2. Apply new IMEI and stock changes
    const newImeiList = items.map(item => item.imei).filter(Boolean)
    if (newImeiList.length > 0) {
      await Imei.updateMany({ imeiNumber: { $in: newImeiList } }, { $set: { status: 'sold', soldAt: new Date() } })
    }
    for (const item of items) {
      if (item.productId) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -Math.abs(item.qty || 1) } })
    }

    // 3. Update customer balance difference
    const diff = grandTotal - oldSale.grandTotal
    if (diff !== 0) {
      await Customer.findByIdAndUpdate(oldSale.customerId, { $inc: { totalPurchases: diff } })
      await Transaction.findOneAndUpdate({ referenceId: saleId, transactionType: 'sale' }, { amount: grandTotal })
    }

    // 4. Update sale fields
    oldSale.items = items
    oldSale.subTotal = subTotal
    oldSale.totalDiscount = totalDiscount
    oldSale.totalTax = totalTax
    oldSale.grandTotal = grandTotal
    oldSale.partyGst = partyGst
    if (req.body.customerName) oldSale.customerName = req.body.customerName
    if (req.body.phone) oldSale.phone = req.body.phone
    if (req.body.paymentMode) oldSale.paymentMode = req.body.paymentMode
    if (req.body.financeDetails) oldSale.financeDetails = req.body.financeDetails
    if (req.body.warrantySaleAmount !== undefined) oldSale.warrantySaleAmount = req.body.warrantySaleAmount
    if (req.body.delayPaymentExpected !== undefined) oldSale.delayPaymentExpected = req.body.delayPaymentExpected
    if (amountPaid !== undefined) oldSale.amountPaid = amountPaid
    if (amountDue !== undefined) oldSale.amountDue = amountDue
    if (promisedDate !== undefined) oldSale.promisedDate = promisedDate
    await oldSale.save()

    res.json({ success: true, message: 'Sale updated successfully', data: oldSale })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update sale', errors: { error: error.message } })
  }
}

const cancel = async (req, res) => {
  try {
    const saleId = req.params.id
    const sale = await Sale.findById(saleId)
    
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    if (sale.status === 'cancelled') return res.status(422).json({ success: false, message: 'Sale is already cancelled', errors: {} })

    // 1. Reverse IMEI status
    const imeiList = sale.items.map(item => item.imei).filter(Boolean)
    if (imeiList.length > 0) {
      await Imei.updateMany({ imeiNumber: { $in: imeiList } }, { $set: { status: 'available', soldAt: null } })
    }

    // 2. Restore product stock
    for (const item of sale.items) {
      if (item.productId) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty || 1 } })
    }

    // 3. Update customer balance
    if (sale.customerId) {
      await Customer.findByIdAndUpdate(sale.customerId, { $inc: { totalPurchases: -sale.grandTotal } })
    }

    // 4. Mark sale as cancelled
    sale.status = 'cancelled'
    await sale.save()

    // 5. Create transaction record for cancellation
    await Transaction.create({
      transactionType: 'refund',
      referenceId: saleId,
      referenceNumber: sale.invoiceNumber,
      description: `Sale cancellation - ${sale.customerName}`,
      amount: sale.grandTotal,
      paymentMethod: sale.paymentMode === 'finance' ? 'credit' : (sale.paymentMode || 'cash'),
      relatedEntity: sale.customerName,
      transactionDate: new Date(),
      createdBy: req.user?._id,
    })

    res.json({ success: true, message: 'Sale cancelled successfully', data: sale })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel sale', errors: { error: error.message } })
  }
}

const getByInvoice = async (req, res) => {
  try {
    const sale = await Sale.findOne({ invoiceNumber: req.params.invoiceNumber }).populate('createdBy', 'name');
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
    res.json({ success: true, data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getByInvoice,  list, getOne, create, getPendingEmiNotifications, getBalanceSheet, update, cancel }