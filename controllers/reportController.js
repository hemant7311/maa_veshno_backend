const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const Loan = require('../models/Loan')
const CustomerReceivable = require('../models/CustomerReceivable')
const Expense = require('../models/Expense')
const CompanyReturn = require('../models/CompanyReturn')
const Product = require('../models/Product')
const Customer = require('../models/Customer')
const Supplier = require('../models/Supplier')
const FinanceRecord = require('../models/FinanceRecord')
const Imei = require('../models/Imei')

/**
 * Helper to compute precise start and end dates based on range option or ISO dates
 */
const getDateRangeBounds = (range, customStartDate, customEndDate) => {
  const now = new Date()

  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return { startDate: start, endDate: end }
  }

  if (range === 'week' || range === '7days') {
    // Last 7 calendar days including today
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return { startDate: start, endDate: end }
  }

  if (range === 'month' || range === 'this_month') {
    // First day of current calendar month through current date/end of today
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return { startDate: start, endDate: end }
  }

  if (customStartDate || customEndDate) {
    const start = customStartDate ? new Date(customStartDate) : null
    const end = customEndDate ? new Date(customEndDate) : null
    if (end) end.setHours(23, 59, 59, 999)
    return { startDate: start, endDate: end }
  }

  // 'all' or default -> no date filter
  return { startDate: null, endDate: null }
}

/**
 * Filter for valid completed sales (excludes cancelled and draft sales)
 */
const getValidCompletedSaleFilter = (range, customStartDate, customEndDate, field = 'createdAt', extra = {}) => {
  const { startDate, endDate } = getDateRangeBounds(range, customStartDate, customEndDate)
  
  const filter = {
    status: { $nin: ['cancelled', 'Cancelled'] },
    billStatus: { $nin: ['draft', 'Draft', 'cancelled', 'Cancelled'] },
    ...extra
  }

  if (startDate || endDate) {
    filter[field] = {}
    if (startDate) filter[field].$gte = startDate
    if (endDate) filter[field].$lte = endDate
  }

  return filter
}

/**
 * Filter for non-sale models (Purchases, Expenses, Loans, etc.)
 */
const getValidGenericFilter = (range, customStartDate, customEndDate, field = 'date', extra = {}) => {
  const { startDate, endDate } = getDateRangeBounds(range, customStartDate, customEndDate)
  const filter = { ...extra }

  if (startDate || endDate) {
    filter[field] = {}
    if (startDate) filter[field].$gte = startDate
    if (endDate) filter[field].$lte = endDate
  }

  return filter
}

const getAllReports = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate } = req.query
    const selectedRange = range || dateRange || 'all'

    const saleFilter = getValidCompletedSaleFilter(selectedRange, startDate, endDate, 'createdAt')
    const purchaseFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', { status: { $nin: ['cancelled', 'Cancelled'] } })
    const loanFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', { status: { $nin: ['cancelled', 'Cancelled'] } })
    const receivableFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', { status: { $nin: ['cancelled', 'Cancelled'] } })
    const expenseFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'date')
    const returnFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'returnDate')

    const [sales, purchases, loans, receivables, expenses, returns, products, availableImeis] = await Promise.all([
      Sale.find(saleFilter).lean(),
      Purchase.find(purchaseFilter).lean(),
      Loan.find(loanFilter).lean(),
      CustomerReceivable.find(receivableFilter).lean(),
      Expense.find(expenseFilter).lean(),
      CompanyReturn.find(returnFilter).lean(),
      Product.find({ status: 'active' }).lean(),
      Imei.aggregate([
        { $match: { status: 'available' } },
        { $group: { _id: '$productId', count: { $sum: 1 } } }
      ])
    ])

    const totalSales = sales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0)
    const retailSales = sales.filter(s => s.saleType === 'retail').reduce((sum, s) => sum + Number(s.grandTotal || 0), 0)
    const wholesaleSales = sales.filter(s => s.saleType === 'wholesale').reduce((sum, s) => sum + Number(s.grandTotal || 0), 0)
    const totalTax = sales.reduce((sum, s) => sum + Number(s.totalTax || 0), 0)
    const salesCount = sales.length

    const imeiMap = new Map(availableImeis.map(i => [String(i._id), i.count]))
    let totalStockCount = 0
    let totalStockValuation = 0

    products.forEach(p => {
      const pStock = Number(p.stock) || 0
      const imeiCount = imeiMap.get(String(p._id)) || 0
      const actualStock = pStock + imeiCount
      totalStockCount += actualStock
      totalStockValuation += actualStock * (Number(p.purchasePrice ?? p.costPrice ?? 0) || 0)
    })

    const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0)
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

    let totalCOGS = 0
    sales.forEach(s => {
      (s.items || []).forEach(item => {
        totalCOGS += (Number(item.purchasePrice) || 0) * (Number(item.qty) || 1)
      })
    })

    const grossProfit = totalSales - totalCOGS
    const netProfit = grossProfit - totalExpenses

    res.json({
      success: true,
      message: 'All reports loaded',
      data: {
        dateRange: selectedRange,
        sales: {
          total: totalSales,
          count: salesCount,
          retail: retailSales,
          wholesale: wholesaleSales,
          totalTax
        },
        stock: {
          totalCount: totalStockCount,
          totalValue: totalStockValuation
        },
        purchases: { total: totalPurchases, count: purchases.length },
        loans: {
          totalBorrowed: loans.reduce((sum, l) => sum + Number(l.originalAmount || 0), 0),
          totalRepaid: loans.reduce((sum, l) => sum + Number(l.paidAmount || 0), 0)
        },
        receivables: {
          totalGiven: receivables.reduce((sum, r) => sum + Number(r.givenAmount || 0), 0),
          totalReceived: receivables.reduce((sum, r) => sum + Number(r.receivedAmount || 0), 0)
        },
        expenses: { total: totalExpenses, count: expenses.length },
        returns: { count: returns.length, totalQuantity: returns.reduce((sum, r) => sum + Number(r.quantity || 0), 0) },
        summary: {
          totalSales,
          retailSales,
          wholesaleSales,
          totalTax,
          totalStockCount,
          totalStockValue: totalStockValuation,
          grossProfit,
          netProfit,
          totalPurchases,
          totalExpenses
        }
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load reports', errors: { error: error.message } })
  }
}

const getSalesReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate, saleType, paymentMode } = req.query
    const selectedRange = range || dateRange || 'all'
    const extra = {}
    if (saleType) extra.saleType = saleType
    if (paymentMode) extra.paymentMode = paymentMode

    const filter = getValidCompletedSaleFilter(selectedRange, startDate, endDate, 'createdAt', extra)

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalSales: sales.length,
      grandTotal: sales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0),
      totalTax: sales.reduce((sum, s) => sum + Number(s.totalTax || 0), 0),
      totalDiscount: sales.reduce((sum, s) => sum + Number(s.totalDiscount || 0), 0),
      byPaymentMode: {},
      bySaleType: {}
    }

    sales.forEach(s => {
      const mode = s.paymentMode || 'unknown'
      summary.byPaymentMode[mode] = summary.byPaymentMode[mode] || { count: 0, total: 0 }
      summary.byPaymentMode[mode].count += 1
      summary.byPaymentMode[mode].total += Number(s.grandTotal || 0)

      const type = s.saleType || 'unknown'
      summary.bySaleType[type] = summary.bySaleType[type] || { count: 0, total: 0 }
      summary.bySaleType[type].count += 1
      summary.bySaleType[type].total += Number(s.grandTotal || 0)
    })

    res.json({ success: true, message: 'Sales report loaded', data: { sales, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load sales report', errors: { error: error.message } })
  }
}

const getPurchaseReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate, supplierId, paymentMethod } = req.query
    const selectedRange = range || dateRange || 'all'
    const extra = { status: { $nin: ['cancelled', 'Cancelled'] } }
    if (supplierId) extra.supplier = supplierId
    if (paymentMethod) extra.paymentMethod = paymentMethod

    const filter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', extra)

    const purchases = await Purchase.find(filter)
      .populate('supplier', 'name shopName phone')
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const summary = {
      totalPurchases: purchases.length,
      totalAmount: purchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0),
      totalPaid: purchases.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0),
      totalDue: purchases.reduce((sum, p) => sum + Math.max(0, Number(p.totalAmount || 0) - Number(p.paidAmount || 0)), 0),
      totalGst: purchases.reduce((sum, p) => sum + Number(p.gstAmount || 0), 0),
      totalDiscount: purchases.reduce((sum, p) => sum + Number(p.discountAmount || 0), 0)
    }

    res.json({ success: true, message: 'Purchase report loaded', data: { purchases, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load purchase report', errors: { error: error.message } })
  }
}

const getStockReport = async (req, res) => {
  try {
    const products = await Product.find({ status: 'active' })
      .populate('categoryId', 'categoryName')
      .populate('supplierId', 'name shopName')
      .sort({ productName: 1 })
      .lean()

    const availableImeis = await Imei.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$productId', count: { $sum: 1 } } }
    ])
    const imeiMap = new Map(availableImeis.map(i => [String(i._id), i.count]))

    const stockReport = products.map(p => {
      const pStock = Number(p.stock) || 0
      const imeiStock = imeiMap.get(String(p._id)) || 0
      const totalStock = pStock + imeiStock
      const purchasePrice = Number(p.purchasePrice ?? p.costPrice ?? 0)
      const salePrice = Number(p.salePrice || 0)
      return {
        ...p,
        stock: pStock,
        imeiStock,
        totalStock,
        valuation: totalStock * purchasePrice,
        potentialRevenue: totalStock * salePrice
      }
    })

    const summary = {
      totalProducts: products.length,
      totalStockCount: stockReport.reduce((sum, p) => sum + p.totalStock, 0),
      totalStockValue: stockReport.reduce((sum, p) => sum + p.valuation, 0),
      totalSaleValue: stockReport.reduce((sum, p) => sum + p.potentialRevenue, 0),
      lowStockCount: stockReport.filter(p => p.totalStock <= (Number(p.minStock) || 0)).length,
      outOfStockCount: stockReport.filter(p => p.totalStock === 0).length
    }

    res.json({ success: true, message: 'Stock report loaded', data: { products: stockReport, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load stock report', errors: { error: error.message } })
  }
}

const getCustomerReport = async (req, res) => {
  try {
    const customers = await Customer.find({ status: 'active' }).sort({ customerName: 1 }).lean()
    const customerIds = customers.map(c => c._id)

    const customerSales = await Sale.aggregate([
      { 
        $match: { 
          customerId: { $in: customerIds }, 
          status: { $nin: ['cancelled', 'Cancelled'] },
          billStatus: { $nin: ['draft', 'Draft', 'cancelled', 'Cancelled'] }
        } 
      },
      { $group: {
        _id: '$customerId',
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$grandTotal' }
      }}
    ])
    const salesMap = new Map(customerSales.map(s => [String(s._id), s]))

    const report = customers.map(c => {
      const saleData = salesMap.get(String(c._id)) || { totalPurchases: 0, totalAmount: 0 }
      return {
        ...c,
        purchaseCount: saleData.totalPurchases,
        purchaseAmount: saleData.totalAmount
      }
    })

    const summary = {
      totalCustomers: customers.length,
      totalPurchaseValue: report.reduce((sum, c) => sum + Number(c.purchaseAmount || 0), 0),
      avgPurchaseValue: report.length > 0 ? report.reduce((sum, c) => sum + Number(c.purchaseAmount || 0), 0) / report.length : 0
    }

    res.json({ success: true, message: 'Customer report loaded', data: { customers: report, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load customer report', errors: { error: error.message } })
  }
}

const getSupplierReport = async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ name: 1 }).lean()
    const supplierIds = suppliers.map(s => s._id)

    const supplierPurchases = await Purchase.aggregate([
      { $match: { supplier: { $in: supplierIds }, status: { $nin: ['cancelled', 'Cancelled'] } } },
      { $group: {
        _id: '$supplier',
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' }
      }}
    ])
    const purchaseMap = new Map(supplierPurchases.map(p => [String(p._id), p]))

    const supplierReturns = await CompanyReturn.aggregate([
      { $match: { supplier: { $in: supplierIds } } },
      { $group: { _id: '$supplier', totalReturns: { $sum: 1 }, totalQty: { $sum: '$quantity' } } }
    ])
    const returnMap = new Map(supplierReturns.map(r => [String(r._id), r]))

    const report = suppliers.map(s => {
      const pData = purchaseMap.get(String(s._id)) || { totalPurchases: 0, totalAmount: 0, totalPaid: 0 }
      const rData = returnMap.get(String(s._id)) || { totalReturns: 0, totalQty: 0 }
      return {
        ...s,
        purchaseCount: pData.totalPurchases,
        purchaseAmount: pData.totalAmount,
        paidAmount: pData.totalPaid,
        dueAmount: Math.max(0, Number(pData.totalAmount || 0) - Number(pData.totalPaid || 0)),
        returnCount: rData.totalReturns,
        returnQty: rData.totalQty
      }
    })

    const summary = {
      totalSuppliers: suppliers.length,
      totalPurchaseValue: report.reduce((sum, s) => sum + Number(s.purchaseAmount || 0), 0),
      totalDue: report.reduce((sum, s) => sum + Number(s.dueAmount || 0), 0)
    }

    res.json({ success: true, message: 'Supplier report loaded', data: { suppliers: report, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load supplier report', errors: { error: error.message } })
  }
}

const getFinanceReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate, financeType } = req.query
    const selectedRange = range || dateRange || 'all'
    const extra = { status: { $nin: ['Cancelled', 'cancelled'] } }
    if (financeType) extra.financeType = financeType

    const filter = getValidGenericFilter(selectedRange, startDate, endDate, 'paymentDate', extra)

    const records = await FinanceRecord.find(filter).sort({ createdAt: -1 }).lean()

    const summary = {
      totalRecords: records.length,
      totalFinanced: records.reduce((sum, r) => sum + Number(r.usedLimit || 0), 0),
      totalLimit: records.reduce((sum, r) => sum + Number(r.totalLimit || 0), 0),
      byType: {},
      byEntity: {}
    }

    records.forEach(r => {
      const type = r.financeType || 'Unknown'
      summary.byType[type] = summary.byType[type] || { count: 0, totalFinanced: 0 }
      summary.byType[type].count += 1
      summary.byType[type].totalFinanced += Number(r.usedLimit || 0)

      const entity = r.entityName || 'Unknown'
      summary.byEntity[entity] = summary.byEntity[entity] || { count: 0, totalFinanced: 0 }
      summary.byEntity[entity].count += 1
      summary.byEntity[entity].totalFinanced += Number(r.usedLimit || 0)
    })

    res.json({ success: true, message: 'Finance report loaded', data: { records, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load finance report', errors: { error: error.message } })
  }
}

const getEmiReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate } = req.query
    const selectedRange = range || dateRange || 'all'
    const filter = getValidCompletedSaleFilter(selectedRange, startDate, endDate, 'createdAt', { paymentMode: 'finance' })

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalEmiSales: sales.length,
      totalAmount: sales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0),
      totalEmiAmount: sales.reduce((sum, s) => sum + (Number(s.financeDetails?.emiAmount || 0) * (parseInt(s.financeDetails?.tenure) || 1)), 0),
      byFinanceCompany: {}
    }

    sales.forEach(s => {
      const company = s.financeDetails?.company || 'Private/Unknown'
      summary.byFinanceCompany[company] = summary.byFinanceCompany[company] || { count: 0, total: 0 }
      summary.byFinanceCompany[company].count += 1
      summary.byFinanceCompany[company].total += Number(s.grandTotal || 0)
    })

    res.json({ success: true, message: 'EMI report loaded', data: { sales, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load EMI report', errors: { error: error.message } })
  }
}

const getWholesaleReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate } = req.query
    const selectedRange = range || dateRange || 'all'
    const filter = getValidCompletedSaleFilter(selectedRange, startDate, endDate, 'createdAt', { saleType: 'wholesale' })

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalWholesaleSales: sales.length,
      totalAmount: sales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0),
      totalDiscount: sales.reduce((sum, s) => sum + Number(s.totalDiscount || 0), 0),
      totalTax: sales.reduce((sum, s) => sum + Number(s.totalTax || 0), 0)
    }

    res.json({ success: true, message: 'Wholesale report loaded', data: { sales, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load wholesale report', errors: { error: error.message } })
  }
}

const getProfitLossReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate } = req.query
    const selectedRange = range || dateRange || 'all'
    const saleFilter = getValidCompletedSaleFilter(selectedRange, startDate, endDate)
    const purchaseFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', { status: { $nin: ['cancelled', 'Cancelled'] } })
    const expenseFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'date')
    const returnFilter = getValidGenericFilter(selectedRange, startDate, endDate, 'returnDate')

    const [sales, purchases, expenses, returns] = await Promise.all([
      Sale.find(saleFilter).lean(),
      Purchase.find(purchaseFilter).lean(),
      Expense.find(expenseFilter).lean(),
      CompanyReturn.find(returnFilter).lean()
    ])

    let totalSales = 0
    let totalPurchaseCost = 0
    sales.forEach(sale => {
      totalSales += Number(sale.grandTotal || 0)
      ;(sale.items || []).forEach(item => {
        totalPurchaseCost += (Number(item.purchasePrice) || 0) * (Number(item.qty) || 1)
      })
    })

    const grossProfit = totalSales - totalPurchaseCost
    const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0)
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const totalReturns = returns.reduce((sum, r) => sum + Number(r.quantity || 0), 0)
    const netProfit = grossProfit - totalExpenses
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
    const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0

    res.json({
      success: true,
      message: 'Profit & Loss report loaded',
      data: {
        dateRange: { selectedRange, startDate, endDate },
        income: {
          totalSales,
          salesCount: sales.length
        },
        costOfGoodsSold: {
          totalPurchaseCost,
          purchaseCount: purchases.length,
          totalPurchasesAmount: totalPurchases
        },
        grossProfit,
        grossMargin: `${grossMargin.toFixed(2)}%`,
        expenses: {
          total: totalExpenses,
          count: expenses.length
        },
        returns: {
          count: returns.length,
          totalQuantity: totalReturns
        },
        netProfit,
        profitMargin: `${profitMargin.toFixed(2)}%`
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load P&L report', errors: { error: error.message } })
  }
}

const getGstReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate } = req.query
    const selectedRange = range || dateRange || 'all'
    const filter = getValidCompletedSaleFilter(selectedRange, startDate, endDate, 'createdAt', {
      $or: [{ partyGst: { $exists: true, $ne: '' } }, { totalTax: { $gt: 0 } }, { gstPercent: { $gt: 0 } }]
    })

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalGstSales: sales.length,
      totalTaxableValue: sales.reduce((sum, s) => sum + Math.max(0, Number(s.subTotal || 0) - Number(s.totalDiscount || 0)), 0),
      totalTax: sales.reduce((sum, s) => sum + Number(s.totalTax || 0), 0),
      grandTotal: sales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0),
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0
    }

    const gstDetails = sales.map(s => {
      const taxableValue = Math.max(0, Number(s.subTotal || 0) - Number(s.totalDiscount || 0))
      let cgst = 0, sgst = 0, igst = 0
      const totalTax = Number(s.totalTax || 0)
      if (totalTax > 0) {
        cgst = totalTax / 2
        sgst = totalTax / 2
      }
      summary.cgstTotal += cgst
      summary.sgstTotal += sgst
      summary.igstTotal += igst
      return {
        date: s.createdAt,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        partyGst: s.partyGst || '',
        taxableValue,
        cgst,
        sgst,
        igst,
        totalTax,
        grandTotal: Number(s.grandTotal || 0)
      }
    })

    res.json({ success: true, message: 'GST report loaded', data: { gstDetails, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load GST report', errors: { error: error.message } })
  }
}

const getCompanyReturnsReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate, supplierId } = req.query
    const selectedRange = range || dateRange || 'all'
    const extra = {}
    if (supplierId) extra.supplier = supplierId

    const filter = getValidGenericFilter(selectedRange, startDate, endDate, 'returnDate', extra)

    const returns = await CompanyReturn.find(filter)
      .populate('supplier', 'name shopName')
      .populate('product', 'productName brand model')
      .sort({ returnDate: -1 })
      .lean()

    const summary = {
      totalReturns: returns.length,
      totalQuantity: returns.reduce((sum, r) => sum + Number(r.quantity || 0), 0),
      bySupplier: {},
      byProduct: {}
    }

    returns.forEach(r => {
      const supplier = r.supplierName || 'Unknown'
      summary.bySupplier[supplier] = summary.bySupplier[supplier] || { count: 0, totalQty: 0 }
      summary.bySupplier[supplier].count += 1
      summary.bySupplier[supplier].totalQty += Number(r.quantity || 0)

      const product = r.productName || 'Unknown'
      summary.byProduct[product] = summary.byProduct[product] || { count: 0, totalQty: 0 }
      summary.byProduct[product].count += 1
      summary.byProduct[product].totalQty += Number(r.quantity || 0)
    })

    res.json({ success: true, message: 'Company returns report loaded', data: { returns, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load returns report', errors: { error: error.message } })
  }
}

const getLoansReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate, status } = req.query
    const selectedRange = range || dateRange || 'all'
    const extra = {}
    if (status) extra.status = status

    const filter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', extra)

    const loans = await Loan.find(filter).sort({ date: -1, createdAt: -1 }).lean()

    const summary = {
      totalLoans: loans.length,
      totalBorrowed: loans.reduce((sum, l) => sum + Number(l.originalAmount || 0), 0),
      totalRepaid: loans.reduce((sum, l) => sum + Number(l.paidAmount || 0), 0),
      totalOutstanding: loans.reduce((sum, l) => sum + Math.max(0, Number(l.originalAmount || 0) - Number(l.paidAmount || 0)), 0),
      byStatus: {}
    }

    loans.forEach(l => {
      const status = l.status || 'pending'
      summary.byStatus[status] = summary.byStatus[status] || { count: 0, totalBorrowed: 0, totalRepaid: 0 }
      summary.byStatus[status].count += 1
      summary.byStatus[status].totalBorrowed += Number(l.originalAmount || 0)
      summary.byStatus[status].totalRepaid += Number(l.paidAmount || 0)
    })

    res.json({ success: true, message: 'Loans report loaded', data: { loans, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load loans report', errors: { error: error.message } })
  }
}

const getCustomerReceivablesReport = async (req, res) => {
  try {
    const { range, dateRange, startDate, endDate, status } = req.query
    const selectedRange = range || dateRange || 'all'
    const extra = {}
    if (status) extra.status = status

    const filter = getValidGenericFilter(selectedRange, startDate, endDate, 'date', extra)

    const receivables = await CustomerReceivable.find(filter)
      .populate('customer', 'customerName phone address')
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const summary = {
      totalReceivables: receivables.length,
      totalGiven: receivables.reduce((sum, r) => sum + Number(r.givenAmount || 0), 0),
      totalReceived: receivables.reduce((sum, r) => sum + Number(r.receivedAmount || 0), 0),
      totalOutstanding: receivables.reduce((sum, r) => sum + Math.max(0, Number(r.givenAmount || 0) - Number(r.receivedAmount || 0)), 0),
      byStatus: {}
    }

    receivables.forEach(r => {
      const status = r.status || 'pending'
      summary.byStatus[status] = summary.byStatus[status] || { count: 0, totalGiven: 0, totalReceived: 0 }
      summary.byStatus[status].count += 1
      summary.byStatus[status].totalGiven += Number(r.givenAmount || 0)
      summary.byStatus[status].totalReceived += Number(r.receivedAmount || 0)
    })

    res.json({ success: true, message: 'Customer receivables report loaded', data: { receivables, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load receivables report', errors: { error: error.message } })
  }
}

module.exports = {
  getAllReports,
  getSalesReport,
  getPurchaseReport,
  getStockReport,
  getCustomerReport,
  getSupplierReport,
  getFinanceReport,
  getEmiReport,
  getWholesaleReport,
  getProfitLossReport,
  getGstReport,
  getCompanyReturnsReport,
  getLoansReport,
  getCustomerReceivablesReport
}
