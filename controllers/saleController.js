const Sale = require('../models/Sale')
const Customer = require('../models/Customer')
const Imei = require('../models/Imei')
const Product = require('../models/Product')
const Transaction = require('../models/Transaction')
const mongoose = require('mongoose')
const { getNextSequence } = require('../utils/counter')
const { getFinancialYear } = require('../utils/financialYear')
const { normalizePaymentMethod } = require('../utils/paymentMapper')

/**
 * Generate EMI Installment Schedule
 */
function generateInstallmentSchedule(firstEmiDate, emiAmount, tenureStr) {
  const tenureMonths = Math.max(1, parseInt(String(tenureStr).match(/\d+/)?.[0] || '1', 10))
  const amount = Number(emiAmount) || 0
  const schedule = []

  const baseDate = firstEmiDate ? new Date(firstEmiDate) : new Date()
  if (isNaN(baseDate.getTime())) {
    baseDate.setTime(Date.now())
  }
  const originalDay = baseDate.getDate()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 1; i <= tenureMonths; i++) {
    const dueDate = new Date(baseDate)
    // Add (i - 1) months
    dueDate.setMonth(baseDate.getMonth() + (i - 1))
    // Handle month-end fallback if day overflows
    if (dueDate.getDate() !== originalDay) {
      dueDate.setDate(0) // Last day of previous month
    }
    dueDate.setHours(0, 0, 0, 0)

    let status = 'pending'
    if (dueDate <= today) {
      status = 'due'
    }

    schedule.push({
      installmentNumber: i,
      dueDate,
      dueAmount: amount,
      paidAmount: 0,
      status,
      actualPaymentDate: null,
      paymentMethod: '',
      reference: '',
      notes: ''
    })
  }

  return schedule
}

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
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { 
      invoiceNumber, customerName, phone, saleType = 'retail', paymentMode: rawPaymentMode, 
      items, subTotal, totalDiscount, totalTax, gstPercent: inputGstPercent, grandTotal, financeDetails,
      pickedBy, partyGst, warrantySaleAmount, delayPaymentExpected, amountPaid, promisedDate
    } = req.body

    const paymentMode = normalizePaymentMethod(rawPaymentMode || (financeDetails ? 'finance' : 'cash'))

    if (!customerName || !phone || !items || !items.length) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Missing required sale details (customer name, phone, items)', errors: {} })
    }

    // Recalculate totals authoritatively
    let calcSubTotal = 0
    for (const item of items) {
      item.discount = Number(item.discount) || 0
      item.qty = Math.max(1, parseInt(item.qty, 10) || 1)
      item.price = Number(item.price) || 0
      const itemTotal = (item.price * item.qty) - item.discount
      item.total = itemTotal
      calcSubTotal += itemTotal
    }

    let calcTotalDiscount = Number(totalDiscount) || 0
    const gstPercent = inputGstPercent !== undefined ? Number(inputGstPercent) : 18
    const taxableAmount = Math.max(0, calcSubTotal - calcTotalDiscount)
    let calcTotalTax = Number(totalTax)
    if (isNaN(calcTotalTax)) {
      calcTotalTax = (taxableAmount * gstPercent) / 100
    }
    const calcWarranty = Number(warrantySaleAmount) || 0
    let calculatedGrandTotal = taxableAmount + calcTotalTax + calcWarranty

    if (grandTotal !== undefined && Math.abs(calculatedGrandTotal - Number(grandTotal)) > 1) {
      // If grandTotal was explicitly overridden, adjust discount to balance equation authoritatively
      calcTotalDiscount = calcSubTotal + calcTotalTax + calcWarranty - Number(grandTotal)
      calculatedGrandTotal = Number(grandTotal)
    }

    const finalGrandTotal = Math.round(calculatedGrandTotal * 100) / 100
    let finalAmountPaid = amountPaid !== undefined ? Number(amountPaid) : (paymentMode === 'finance' ? (Number(financeDetails?.dpAmount) || 0) : finalGrandTotal)
    if (finalAmountPaid < 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Payment amount cannot be negative', errors: {} })
    }
    if (finalAmountPaid > finalGrandTotal) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Payment cannot exceed grand total', errors: {} })
    }

    const finalAmountDue = Math.round((finalGrandTotal - finalAmountPaid) * 100) / 100
    let billStatus = 'saved'
    if (finalAmountDue <= 0) billStatus = 'paid'
    else if (finalAmountPaid > 0) billStatus = 'partially_paid'
    else billStatus = 'due'

    // 1. Find or create customer
    let customer = await Customer.findOne({ phone }).session(session)
    if (!customer) {
      const custData = [{ 
        customerName, phone, 
        customerType: saleType === 'wholesale' ? 'wholesale' : 'retail',
        totalPurchases: finalGrandTotal,
        balance: finalAmountDue,
        address: req.body.address || '',
        gstNumber: req.body.partyGst || ''
      }]
      const createdCustomers = await Customer.create(custData, { session })
      customer = createdCustomers[0]
    } else {
      customer.totalPurchases = (customer.totalPurchases || 0) + finalGrandTotal
      customer.balance = (customer.balance || 0) + finalAmountDue
      if (saleType === 'wholesale') customer.customerType = 'wholesale'
      if (req.body.address) customer.address = req.body.address
      if (req.body.partyGst) customer.gstNumber = req.body.partyGst
      await customer.save({ session })
    }

    // 2. Lookup Purchase Prices for items
    for (const item of items) {
      if (item.productId) {
        const p = await Product.findById(item.productId).session(session)
        if (p) item.purchasePrice = p.purchasePrice || p.costPrice || 0
      }
    }

    // 3. Validate and reserve IMEIs before sale
    const imeiList = items.map(item => item.imei).filter(Boolean)
    const uniqueImeis = new Set(imeiList)
    if (uniqueImeis.size !== imeiList.length) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Duplicate IMEI numbers in sale items list.', errors: {} })
    }

    if (imeiList.length > 0) {
      const imeiResult = await Imei.updateMany(
        { imeiNumber: { $in: imeiList }, status: { $in: ['available', 'sellable'] } },
        { $set: { status: 'sold', soldAt: new Date() } },
        { session }
      )
      if (imeiResult.modifiedCount !== imeiList.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'One or more IMEIs are not available or already sold.', errors: {} })
      }
    }

    // 4. Generate Centralized Sequential Invoice Number using Financial Year
    let inv = invoiceNumber
    if (!inv || String(inv).includes('MVM-') || String(inv).includes('INV-') || String(inv).includes('Pending')) {
      const fy = getFinancialYear()
      const counterKey = saleType === 'wholesale' ? `wholesale_invoice:${fy}` : `invoiceNumber:${fy}`
      const seq = await getNextSequence(counterKey, session)
      inv = String(seq)
    }

    // 5. Generate Installment Schedule if Finance Sale
    let installmentSchedule = []
    if (paymentMode === 'finance' && financeDetails) {
      installmentSchedule = generateInstallmentSchedule(
        financeDetails.emiPayDate,
        financeDetails.emiAmount,
        financeDetails.tenure
      )
    }

    const saleData = [{
      invoiceNumber: inv,
      customerId: customer._id,
      customerName,
      phone,
      saleType,
      paymentMode,
      items,
      subTotal: calcSubTotal,
      totalDiscount: calcTotalDiscount,
      gstPercent,
      totalTax: calcTotalTax,
      grandTotal: finalGrandTotal,
      financeDetails,
      installmentSchedule,
      pickedBy,
      partyGst,
      warrantySaleAmount: calcWarranty,
      delayPaymentExpected: !!delayPaymentExpected,
      createdBy: req.user?._id,
      amountPaid: finalAmountPaid,
      amountDue: finalAmountDue,
      billStatus,
      promisedDate: promisedDate ? new Date(promisedDate) : undefined
    }]
    const createdSales = await Sale.create(saleData, { session })
    const sale = createdSales[0]

    // 6. Decrement Product Stock Atomically
    for (const item of items) {
      if (item.productId) {
        const qtyToDeduct = Math.abs(item.qty || 1)
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: qtyToDeduct } },
          { $inc: { stock: -qtyToDeduct } },
          { session, new: true }
        )
        if (!updatedProduct) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Insufficient stock for product: ${item.productName || 'Unknown'}`, errors: {} })
        }
      }
    }

    // 7. Create Financial Transactions
    const txns = [{
      transactionType: 'sale',
      referenceId: sale._id,
      referenceNumber: sale.invoiceNumber,
      description: `${saleType.toUpperCase()} Sale to ${customerName} (Invoice #${sale.invoiceNumber})`,
      amount: finalGrandTotal,
      paymentMethod: paymentMode,
      relatedEntity: customerName,
      transactionDate: new Date(),
      createdBy: req.user?._id,
    }]
    
    if (finalAmountPaid > 0) {
      txns.push({
        transactionType: 'customer_payment',
        referenceId: sale._id,
        referenceNumber: sale.invoiceNumber,
        description: `Payment received for Invoice #${sale.invoiceNumber}`,
        amount: finalAmountPaid,
        paymentMethod: paymentMode === 'finance' ? 'cash' : paymentMode,
        relatedEntity: customerName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      })
    }
    await Transaction.create(txns, { session })

    await session.commitTransaction()
    session.endSession()

    res.status(201).json({ success: true, message: 'Sale created successfully', data: sale })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    console.error('[SALE] Create Error:', error.message)
    res.status(500).json({ success: false, message: error.message || 'Failed to create sale', errors: { error: error.message } })
  }
}

const update = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const saleId = req.params.id
    const oldSale = await Sale.findById(saleId).session(session)
    
    if (!oldSale) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    }
    if (oldSale.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot edit a cancelled sale', errors: {} })
    }

    const { items, subTotal, totalDiscount, totalTax, gstPercent: inputGstPercent, grandTotal, partyGst, amountPaid, promisedDate } = req.body

    // Recalculate totals
    let calcSubTotal = 0
    for (const item of items) {
      item.discount = Number(item.discount) || 0
      item.qty = Math.max(1, parseInt(item.qty, 10) || 1)
      item.price = Number(item.price) || 0
      const itemTotal = (item.price * item.qty) - item.discount
      item.total = itemTotal
      calcSubTotal += itemTotal
    }

    let calcTotalDiscount = Number(totalDiscount) || 0
    const gstPercent = inputGstPercent !== undefined ? Number(inputGstPercent) : (oldSale.gstPercent || 18)
    const taxableAmount = Math.max(0, calcSubTotal - calcTotalDiscount)
    let calcTotalTax = Number(totalTax)
    if (isNaN(calcTotalTax)) {
      calcTotalTax = (taxableAmount * gstPercent) / 100
    }
    const calcWarranty = Number(req.body.warrantySaleAmount) || 0
    let calculatedGrandTotal = taxableAmount + calcTotalTax + calcWarranty

    if (grandTotal !== undefined && Math.abs(calculatedGrandTotal - Number(grandTotal)) > 1) {
      calcTotalDiscount = calcSubTotal + calcTotalTax + calcWarranty - Number(grandTotal)
      calculatedGrandTotal = Number(grandTotal)
    }

    const finalGrandTotal = Math.round(calculatedGrandTotal * 100) / 100
    let additionalPayment = 0
    if (req.body.totalAmountPaid !== undefined) {
      additionalPayment = Number(req.body.totalAmountPaid) - (oldSale.amountPaid || 0)
    } else if (req.body.isTotalPaid && amountPaid !== undefined) {
      additionalPayment = Number(amountPaid) - (oldSale.amountPaid || 0)
    } else if (amountPaid !== undefined) {
      additionalPayment = Number(amountPaid)
    }
    
    const finalAmountPaid = (oldSale.amountPaid || 0) + additionalPayment
    if (finalAmountPaid < 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Total payment cannot be negative', errors: {} })
    }
    if (finalAmountPaid > finalGrandTotal) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Total payment exceeds grand total', errors: {} })
    }
    if (finalGrandTotal < oldSale.amountPaid && additionalPayment >= 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: `Cannot reduce bill total below already paid amount (₹${oldSale.amountPaid}). Process a refund first.`, errors: {} })
    }
    const finalAmountDue = Math.round((finalGrandTotal - finalAmountPaid) * 100) / 100
    let billStatus = 'saved'
    if (finalAmountDue <= 0) billStatus = 'paid'
    else if (finalAmountPaid > 0) billStatus = 'partially_paid'
    else billStatus = 'due'

    // 1. Reverse old IMEI and stock changes
    const oldImeiList = oldSale.items.map(item => item.imei).filter(Boolean)
    if (oldImeiList.length > 0) {
      const revImei = await Imei.updateMany(
        { imeiNumber: { $in: oldImeiList }, status: 'sold' }, 
        { $set: { status: 'available', soldAt: null } }, 
        { session }
      )
      if (revImei.modifiedCount !== oldImeiList.length) {
         await session.abortTransaction()
         session.endSession()
         return res.status(422).json({ success: false, message: 'Cannot edit sale: Some items are no longer in sold state (possibly returned).', errors: {} })
      }
    }
    for (const item of oldSale.items) {
      if (item.productId) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: Math.abs(item.qty || 1) } }, { session })
    }

    // 2. Apply new IMEI and stock changes atomically
    const newImeiList = items.map(item => item.imei).filter(Boolean)
    const uniqueNewImeis = new Set(newImeiList)
    if (uniqueNewImeis.size !== newImeiList.length) {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Duplicate IMEI numbers in updated sale items list.', errors: {} })
    }

    if (newImeiList.length > 0) {
      const imeiResult = await Imei.updateMany(
        { imeiNumber: { $in: newImeiList }, status: { $in: ['available', 'sellable'] } },
        { $set: { status: 'sold', soldAt: new Date() } },
        { session }
      )
      if (imeiResult.modifiedCount !== newImeiList.length) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'One or more new IMEIs are not available.', errors: {} })
      }
    }
    for (const item of items) {
      if (item.productId) {
        const qtyToDeduct = Math.abs(item.qty || 1)
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: qtyToDeduct } },
          { $inc: { stock: -qtyToDeduct } },
          { session, new: true }
        )
        if (!updatedProduct) {
          await session.abortTransaction()
          session.endSession()
          return res.status(422).json({ success: false, message: `Insufficient stock for product: ${item.productName || 'Unknown'}`, errors: {} })
        }
      }
    }

    // 3. Update customer balance difference
    const diff = finalGrandTotal - oldSale.grandTotal
    if (diff !== 0 || additionalPayment !== 0) {
      const balanceChange = diff - additionalPayment
      await Customer.findByIdAndUpdate(oldSale.customerId, { 
        $inc: { totalPurchases: diff, balance: balanceChange } 
      }, { session })
      if (diff !== 0) {
        await Transaction.findOneAndUpdate({ referenceId: saleId, transactionType: 'sale' }, { amount: finalGrandTotal }, { session })
      }
      if (additionalPayment > 0) {
        await Transaction.create([{
          transactionType: 'customer_payment',
          referenceId: oldSale._id,
          referenceNumber: oldSale.invoiceNumber,
          description: `Additional Payment on Edit - Invoice #${oldSale.invoiceNumber}`,
          amount: additionalPayment,
          paymentMethod: normalizePaymentMethod(req.body.paymentMode || oldSale.paymentMode),
          relatedEntity: oldSale.customerName,
          transactionDate: new Date(),
          createdBy: req.user?._id,
        }], { session })
      } else if (additionalPayment < 0) {
        await Transaction.create([{
          transactionType: 'refund',
          referenceId: oldSale._id,
          referenceNumber: oldSale.invoiceNumber,
          description: `Payment Reversal on Edit - Invoice #${oldSale.invoiceNumber}`,
          amount: Math.abs(additionalPayment),
          paymentMethod: normalizePaymentMethod(req.body.paymentMode || oldSale.paymentMode),
          relatedEntity: oldSale.customerName,
          transactionDate: new Date(),
          createdBy: req.user?._id,
        }], { session })
      }
    }

    // 4. Update sale fields PRESERVING original invoiceNumber
    oldSale.items = items
    oldSale.subTotal = calcSubTotal
    oldSale.totalDiscount = calcTotalDiscount
    oldSale.gstPercent = gstPercent
    oldSale.totalTax = calcTotalTax
    oldSale.grandTotal = finalGrandTotal
    oldSale.partyGst = partyGst
    if (req.body.customerName) oldSale.customerName = req.body.customerName
    if (req.body.phone) oldSale.phone = req.body.phone
    if (req.body.paymentMode) oldSale.paymentMode = normalizePaymentMethod(req.body.paymentMode)
    if (req.body.financeDetails) {
      oldSale.financeDetails = req.body.financeDetails
      if (oldSale.paymentMode === 'finance') {
        oldSale.installmentSchedule = generateInstallmentSchedule(
          req.body.financeDetails.emiPayDate,
          req.body.financeDetails.emiAmount,
          req.body.financeDetails.tenure
        )
      }
    }
    oldSale.warrantySaleAmount = calcWarranty
    if (req.body.delayPaymentExpected !== undefined) oldSale.delayPaymentExpected = req.body.delayPaymentExpected
    oldSale.amountPaid = finalAmountPaid
    oldSale.amountDue = finalAmountDue
    oldSale.billStatus = billStatus
    if (promisedDate !== undefined) oldSale.promisedDate = promisedDate ? new Date(promisedDate) : null
    await oldSale.save({ session })

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Sale updated successfully', data: oldSale })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: error.message || 'Failed to update sale', errors: { error: error.message } })
  }
}

const cancel = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const saleId = req.params.id
    const sale = await Sale.findById(saleId).session(session)
    
    if (!sale) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    }
    if (sale.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Sale is already cancelled', errors: {} })
    }

    // 1. Reverse IMEI status
    const imeiList = sale.items.map(item => item.imei).filter(Boolean)
    if (imeiList.length > 0) {
      const revImei = await Imei.updateMany(
        { imeiNumber: { $in: imeiList }, status: 'sold' }, 
        { $set: { status: 'available', soldAt: null } }, 
        { session }
      )
      if (revImei.modifiedCount !== imeiList.length) {
         await session.abortTransaction()
         session.endSession()
         return res.status(422).json({ success: false, message: 'Cannot cancel sale: Some items are no longer in sold state.', errors: {} })
      }
    }

    // 2. Restore product stock
    for (const item of sale.items) {
      if (item.productId) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty || 1 } }, { session })
    }

    // 3. Update customer balance
    if (sale.customerId) {
      await Customer.findByIdAndUpdate(sale.customerId, { 
        $inc: { totalPurchases: -sale.grandTotal, balance: -sale.amountDue } 
      }, { session })
    }

    // 4. Mark sale as cancelled
    sale.status = 'cancelled'
    sale.billStatus = 'cancelled'
    await sale.save({ session })

    // 5. Create transaction record for cancellation (if money was actually paid)
    const cancelTxns = []
    if (sale.amountPaid > 0) {
      cancelTxns.push({
        transactionType: 'refund',
        referenceId: saleId,
        referenceNumber: sale.invoiceNumber,
        description: `Customer payment refund due to cancellation - Invoice #${sale.invoiceNumber}`,
        amount: sale.amountPaid,
        paymentMethod: sale.paymentMode === 'finance' ? 'cash' : sale.paymentMode,
        relatedEntity: sale.customerName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      })
    }
    
    await Transaction.create(cancelTxns, { session })

    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Sale cancelled successfully', data: sale })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel sale', errors: { error: error.message } })
  }
}

const getByInvoice = async (req, res) => {
  try {
    const sale = await Sale.findOne({ invoiceNumber: req.params.invoiceNumber }).populate('createdBy', 'name')
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    res.json({ success: true, data: sale })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', errors: { error: error.message } })
  }
}

const receivePayment = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const saleId = req.params.id
    const sale = await Sale.findById(saleId).session(session)
    if (!sale) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    }
    if (sale.status === 'cancelled') {
      await session.abortTransaction()
      session.endSession()
      return res.status(422).json({ success: false, message: 'Cannot receive payment for a cancelled bill', errors: {} })
    }

    if (req.body.amountPaid !== undefined) {
      const newAmountPaid = Number(req.body.amountPaid)
      const paymentDelta = newAmountPaid - (sale.amountPaid || 0)

      if (newAmountPaid < 0) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Total payment cannot be less than zero.', errors: {} })
      }
      if (paymentDelta === 0) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: 'Payment amount must be non-zero.', errors: {} })
      }

      const remainingDue = (sale.grandTotal || 0) - (sale.amountPaid || 0)
      if (paymentDelta > remainingDue) {
        await session.abortTransaction()
        session.endSession()
        return res.status(422).json({ success: false, message: `Payment cannot exceed remaining due (₹${remainingDue}).`, errors: {} })
      }

      sale.amountPaid = newAmountPaid
      sale.amountDue = Math.max(0, (sale.grandTotal || 0) - sale.amountPaid)

      if (sale.amountDue <= 0) {
        sale.billStatus = 'paid'
        sale.amountDue = 0
      } else if (sale.amountPaid > 0) {
        sale.billStatus = 'partially_paid'
      } else {
        sale.billStatus = 'due'
      }

      await Transaction.create([{
        transactionType: paymentDelta > 0 ? 'customer_payment' : 'refund',
        referenceId: sale._id,
        referenceNumber: sale.invoiceNumber,
        description: paymentDelta > 0 ? `Payment received for invoice #${sale.invoiceNumber}` : `Payment reversal for invoice #${sale.invoiceNumber}`,
        amount: Math.abs(paymentDelta),
        paymentMethod: normalizePaymentMethod(req.body.paymentMode || 'cash'),
        relatedEntity: sale.customerName,
        transactionDate: new Date(),
        createdBy: req.user?._id,
      }], { session })

      if (sale.customerId) {
        const customer = await Customer.findById(sale.customerId).session(session)
        if (customer) {
          customer.balance = (customer.balance || 0) - paymentDelta
          await customer.save({ session })
        }
      }
    }

    await sale.save({ session })
    await session.commitTransaction()
    session.endSession()
    res.json({ success: true, message: 'Payment received successfully', data: sale })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({ success: false, message: error.message || 'Failed to receive payment', errors: { error: error.message } })
  }
}

const saveBillImage = async (req, res) => {
  try {
    const saleId = req.params.id
    const { billImageUrl } = req.body
    if (!billImageUrl) {
      return res.status(422).json({ success: false, message: 'billImageUrl is required', errors: {} })
    }
    const sale = await Sale.findByIdAndUpdate(saleId, { billImageUrl }, { new: true })
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found', errors: {} })
    res.json({ success: true, message: 'Bill image saved successfully', data: sale })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save bill image', errors: { error: error.message } })
  }
}

const getPendingEmiNotifications = async (req, res) => {
  try {
    const sales = await Sale.find({
      saleType: 'retail',
      status: { $ne: 'cancelled' },
      $or: [
        { paymentMode: 'finance' },
        { delayPaymentExpected: true }
      ]
    }).sort({ createdAt: -1 })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const notifications = sales.map(s => {
      if (s.delayPaymentExpected) {
         let isDue = false
         let daysSince = 0
         if (s.promisedDate) {
            const promDate = new Date(s.promisedDate)
            promDate.setHours(0,0,0,0)
            daysSince = Math.floor((today - promDate) / (1000 * 60 * 60 * 24))
            if (daysSince >= -2) isDue = true
         } else {
            const createDate = new Date(s.createdAt)
            createDate.setHours(0,0,0,0)
            daysSince = Math.floor((today - createDate) / (1000 * 60 * 60 * 24))
            if (daysSince >= 28) isDue = true
         }
         
         if (isDue) {
             const dueAmount = s.amountDue !== undefined ? s.amountDue : s.grandTotal
             if (dueAmount > 0) {
                 return { id: s._id, customerName: s.customerName, phone: s.phone, type: 'Delayed Payment', daysSince, dueAmount, invoiceNumber: s.invoiceNumber, date: s.createdAt, promisedDate: s.promisedDate }
             }
         }
         return null
      }
      
      if (s.paymentMode === 'finance') {
         let isDue = false
         let daysSince = 0
         let promDateStr = null
         
         if (s.financeDetails?.emiPayDate) {
             const emiDate = new Date(s.financeDetails.emiPayDate)
             emiDate.setHours(0,0,0,0)
             daysSince = Math.floor((today - emiDate) / (1000 * 60 * 60 * 24))
             if (daysSince >= -2) isDue = true
             promDateStr = emiDate
         } else {
             const createDate = new Date(s.createdAt)
             createDate.setHours(0,0,0,0)
             daysSince = Math.floor((today - createDate) / (1000 * 60 * 60 * 24))
             if (daysSince >= 28) isDue = true
         }
         
         if (isDue) {
             const dueAmount = s.financeDetails?.emiAmount || 0
             return { id: s._id, customerName: s.customerName, phone: s.phone, type: 'EMI Due', daysSince, dueAmount, invoiceNumber: s.invoiceNumber, date: s.createdAt, promisedDate: promDateStr }
         }
      }
      return null
    }).filter(n => n !== null)
    
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

module.exports = { getByInvoice, list, getOne, create, getPendingEmiNotifications, getBalanceSheet, update, cancel, receivePayment, saveBillImage }