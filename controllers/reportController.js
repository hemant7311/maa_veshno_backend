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

const buildDateFilter = (startDate, endDate, field = 'createdAt') => {
  const filter = {}
  if (startDate || endDate) {
    filter[field] = {}
    if (startDate) filter[field].$gte = new Date(startDate)
    if (endDate) filter[field].$lte = new Date(endDate)
  }
  return filter
}

const getAllReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const saleFilter = buildDateFilter(startDate, endDate)
    saleFilter.status = { $ne: 'cancelled' }
    const purchaseFilter = buildDateFilter(startDate, endDate, 'date')
    purchaseFilter.status = { $ne: 'cancelled' }
    const loanFilter = buildDateFilter(startDate, endDate, 'date')
    loanFilter.status = { $ne: 'cancelled' }
    const receivableFilter = buildDateFilter(startDate, endDate, 'date')
    receivableFilter.status = { $ne: 'cancelled' }
    const expenseFilter = buildDateFilter(startDate, endDate, 'date')
    const returnFilter = buildDateFilter(startDate, endDate, 'returnDate')

    const [sales, purchases, loans, receivables, expenses, returns] = await Promise.all([
      Sale.find(saleFilter).lean(),
      Purchase.find(purchaseFilter).lean(),
      Loan.find(loanFilter).lean(),
      CustomerReceivable.find(receivableFilter).lean(),
      Expense.find(expenseFilter).lean(),
      CompanyReturn.find(returnFilter).lean()
    ])

    const totalSales = sales.reduce((sum, s) => sum + (s.grandTotal || 0), 0)
    const salesCount = sales.length
    const totalPurchases = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0)
    const purchasesCount = purchases.length
    const totalLoansBorrowed = loans.reduce((sum, l) => sum + (l.originalAmount || 0), 0)
    const totalLoansRepaid = loans.reduce((sum, l) => sum + (l.paidAmount || 0), 0)
    const totalReceivablesGiven = receivables.reduce((sum, r) => sum + (r.givenAmount || 0), 0)
    const totalReceivablesReceived = receivables.reduce((sum, r) => sum + (r.receivedAmount || 0), 0)
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const returnsCount = returns.length
    const returnsQty = returns.reduce((sum, r) => sum + (r.quantity || 0), 0)

    let profit = totalSales - totalPurchases - totalExpenses

    res.json({
      success: true,
      message: 'All reports loaded',
      data: {
        dateRange: { startDate, endDate },
        sales: { total: totalSales, count: salesCount },
        purchases: { total: totalPurchases, count: purchasesCount },
        loans: { totalBorrowed: totalLoansBorrowed, totalRepaid: totalLoansRepaid },
        receivables: { totalGiven: totalReceivablesGiven, totalReceived: totalReceivablesReceived },
        expenses: { total: totalExpenses, count: expenses.length },
        returns: { count: returnsCount, totalQuantity: returnsQty },
        summary: {
          grossProfit: totalSales - totalPurchases,
          netProfit: profit,
          totalSales,
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
    const { startDate, endDate, saleType, paymentMode } = req.query
    const filter = buildDateFilter(startDate, endDate)
    filter.status = { $ne: 'cancelled' }
    if (saleType) filter.saleType = saleType
    if (paymentMode) filter.paymentMode = paymentMode

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalSales: sales.length,
      grandTotal: sales.reduce((sum, s) => sum + (s.grandTotal || 0), 0),
      totalTax: sales.reduce((sum, s) => sum + (s.totalTax || 0), 0),
      totalDiscount: sales.reduce((sum, s) => sum + (s.totalDiscount || 0), 0),
      byPaymentMode: {},
      bySaleType: {}
    }

    sales.forEach(s => {
      const mode = s.paymentMode || 'unknown'
      summary.byPaymentMode[mode] = summary.byPaymentMode[mode] || { count: 0, total: 0 }
      summary.byPaymentMode[mode].count += 1
      summary.byPaymentMode[mode].total += s.grandTotal || 0

      const type = s.saleType || 'unknown'
      summary.bySaleType[type] = summary.bySaleType[type] || { count: 0, total: 0 }
      summary.bySaleType[type].count += 1
      summary.bySaleType[type].total += s.grandTotal || 0
    })

    res.json({ success: true, message: 'Sales report loaded', data: { sales, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load sales report', errors: { error: error.message } })
  }
}

const getPurchaseReport = async (req, res) => {
  try {
    const { startDate, endDate, supplierId, paymentMethod } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')
    filter.status = { $ne: 'cancelled' }
    if (supplierId) filter.supplier = supplierId
    if (paymentMethod) filter.paymentMethod = paymentMethod

    const purchases = await Purchase.find(filter)
      .populate('supplier', 'name shopName phone')
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const summary = {
      totalPurchases: purchases.length,
      totalAmount: purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0),
      totalPaid: purchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0),
      totalDue: purchases.reduce((sum, p) => sum + Math.max(0, (p.totalAmount || 0) - (p.paidAmount || 0)), 0),
      totalGst: purchases.reduce((sum, p) => sum + (p.gstAmount || 0), 0),
      totalDiscount: purchases.reduce((sum, p) => sum + (p.discountAmount || 0), 0)
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

    const stockReport = products.map(p => ({
      ...p,
      imeiStock: imeiMap.get(String(p._id)) || 0,
      totalStock: (p.stock || 0) + (imeiMap.get(String(p._id)) || 0)
    }))

    const summary = {
      totalProducts: products.length,
      totalStockValue: stockReport.reduce((sum, p) => sum + ((p.stock || 0) * (p.purchasePrice || 0)), 0),
      totalSaleValue: stockReport.reduce((sum, p) => sum + ((p.stock || 0) * (p.salePrice || 0)), 0),
      lowStockCount: stockReport.filter(p => (p.stock || 0) <= (p.minStock || 0)).length,
      outOfStockCount: stockReport.filter(p => (p.stock || 0) === 0).length
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
      { $match: { customerId: { $in: customerIds }, status: { $ne: 'cancelled' } } },
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
      totalPurchaseValue: report.reduce((sum, c) => sum + (c.purchaseAmount || 0), 0),
      avgPurchaseValue: report.length > 0 ? report.reduce((sum, c) => sum + (c.purchaseAmount || 0), 0) / report.length : 0
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
      { $match: { supplier: { $in: supplierIds }, status: { $ne: 'cancelled' } } },
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
        dueAmount: Math.max(0, (pData.totalAmount || 0) - (pData.totalPaid || 0)),
        returnCount: rData.totalReturns,
        returnQty: rData.totalQty
      }
    })

    const summary = {
      totalSuppliers: suppliers.length,
      totalPurchaseValue: report.reduce((sum, s) => sum + (s.purchaseAmount || 0), 0),
      totalDue: report.reduce((sum, s) => sum + (s.dueAmount || 0), 0)
    }

    res.json({ success: true, message: 'Supplier report loaded', data: { suppliers: report, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load supplier report', errors: { error: error.message } })
  }
}

const getFinanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'paymentDate')

    const records = await FinanceRecord.find(filter).sort({ createdAt: -1 }).lean()

    const summary = {
      totalRecords: records.length,
      totalFinanced: records.reduce((sum, r) => sum + (r.usedLimit || 0), 0),
      totalLimit: records.reduce((sum, r) => sum + (r.totalLimit || 0), 0),
      byType: {},
      byEntity: {}
    }

    records.forEach(r => {
      const type = r.financeType || 'Unknown'
      summary.byType[type] = summary.byType[type] || { count: 0, totalFinanced: 0 }
      summary.byType[type].count += 1
      summary.byType[type].totalFinanced += r.usedLimit || 0

      const entity = r.entityName || 'Unknown'
      summary.byEntity[entity] = summary.byEntity[entity] || { count: 0, totalFinanced: 0 }
      summary.byEntity[entity].count += 1
      summary.byEntity[entity].totalFinanced += r.usedLimit || 0
    })

    res.json({ success: true, message: 'Finance report loaded', data: { records, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load finance report', errors: { error: error.message } })
  }
}

const getEmiReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)
    filter.paymentMode = 'finance'
    filter.status = { $ne: 'cancelled' }

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalEmiSales: sales.length,
      totalAmount: sales.reduce((sum, s) => sum + (s.grandTotal || 0), 0),
      totalEmiAmount: sales.reduce((sum, s) => sum + ((s.financeDetails?.emiAmount || 0) * (parseInt(s.financeDetails?.tenure) || 0)), 0),
      byFinanceCompany: {}
    }

    sales.forEach(s => {
      const company = s.financeDetails?.company || 'Private/Unknown'
      summary.byFinanceCompany[company] = summary.byFinanceCompany[company] || { count: 0, total: 0 }
      summary.byFinanceCompany[company].count += 1
      summary.byFinanceCompany[company].total += s.grandTotal || 0
    })

    res.json({ success: true, message: 'EMI report loaded', data: { sales, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load EMI report', errors: { error: error.message } })
  }
}

const getWholesaleReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)
    filter.saleType = 'wholesale'
    filter.status = { $ne: 'cancelled' }

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalWholesaleSales: sales.length,
      totalAmount: sales.reduce((sum, s) => sum + (s.grandTotal || 0), 0),
      totalDiscount: sales.reduce((sum, s) => sum + (s.totalDiscount || 0), 0),
      totalTax: sales.reduce((sum, s) => sum + (s.totalTax || 0), 0)
    }

    res.json({ success: true, message: 'Wholesale report loaded', data: { sales, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load wholesale report', errors: { error: error.message } })
  }
}

const getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const saleFilter = buildDateFilter(startDate, endDate)
    saleFilter.status = { $ne: 'cancelled' }
    const purchaseFilter = buildDateFilter(startDate, endDate, 'date')
    purchaseFilter.status = { $ne: 'cancelled' }
    const expenseFilter = buildDateFilter(startDate, endDate, 'date')
    const returnFilter = buildDateFilter(startDate, endDate, 'returnDate')

    const [sales, purchases, expenses, returns] = await Promise.all([
      Sale.find(saleFilter).lean(),
      Purchase.find(purchaseFilter).lean(),
      Expense.find(expenseFilter).lean(),
      CompanyReturn.find(returnFilter).lean()
    ])

    let totalSales = 0
    let totalPurchaseCost = 0
    sales.forEach(sale => {
      totalSales += sale.grandTotal || 0
      sale.items.forEach(item => {
        totalPurchaseCost += (item.purchasePrice || 0) * (item.qty || 1)
      })
    })

    const grossProfit = totalSales - totalPurchaseCost
    const totalPurchases = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0)
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const totalReturns = returns.reduce((sum, r) => sum + (r.quantity || 0), 0)
    const netProfit = grossProfit - totalExpenses
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
    const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0

    res.json({
      success: true,
      message: 'Profit & Loss report loaded',
      data: {
        dateRange: { startDate, endDate },
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
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)
    filter.status = { $ne: 'cancelled' }
    filter.$or = [{ partyGst: { $exists: true, $ne: '' } }, { totalTax: { $gt: 0 } }]

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const summary = {
      totalGstSales: sales.length,
      totalTaxableValue: sales.reduce((sum, s) => sum + ((s.subTotal || 0) - (s.totalDiscount || 0)), 0),
      totalTax: sales.reduce((sum, s) => sum + (s.totalTax || 0), 0),
      grandTotal: sales.reduce((sum, s) => sum + (s.grandTotal || 0), 0),
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0
    }

    const gstDetails = sales.map(s => {
      const taxableValue = (s.subTotal || 0) - (s.totalDiscount || 0)
      let cgst = 0, sgst = 0, igst = 0
      const totalTax = s.totalTax || 0
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
        grandTotal: s.grandTotal
      }
    })

    res.json({ success: true, message: 'GST report loaded', data: { gstDetails, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load GST report', errors: { error: error.message } })
  }
}

const getCompanyReturnsReport = async (req, res) => {
  try {
    const { startDate, endDate, supplierId } = req.query
    const filter = buildDateFilter(startDate, endDate, 'returnDate')
    if (supplierId) filter.supplier = supplierId

    const returns = await CompanyReturn.find(filter)
      .populate('supplier', 'name shopName')
      .populate('product', 'productName brand model')
      .sort({ returnDate: -1 })
      .lean()

    const summary = {
      totalReturns: returns.length,
      totalQuantity: returns.reduce((sum, r) => sum + (r.quantity || 0), 0),
      bySupplier: {},
      byProduct: {}
    }

    returns.forEach(r => {
      const supplier = r.supplierName || 'Unknown'
      summary.bySupplier[supplier] = summary.bySupplier[supplier] || { count: 0, totalQty: 0 }
      summary.bySupplier[supplier].count += 1
      summary.bySupplier[supplier].totalQty += r.quantity || 0

      const product = r.productName || 'Unknown'
      summary.byProduct[product] = summary.byProduct[product] || { count: 0, totalQty: 0 }
      summary.byProduct[product].count += 1
      summary.byProduct[product].totalQty += r.quantity || 0
    })

    res.json({ success: true, message: 'Company returns report loaded', data: { returns, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load returns report', errors: { error: error.message } })
  }
}

const getLoansReport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')
    if (status) filter.status = status

    const loans = await Loan.find(filter).sort({ date: -1, createdAt: -1 }).lean()

    const summary = {
      totalLoans: loans.length,
      totalBorrowed: loans.reduce((sum, l) => sum + (l.originalAmount || 0), 0),
      totalRepaid: loans.reduce((sum, l) => sum + (l.paidAmount || 0), 0),
      totalOutstanding: loans.reduce((sum, l) => sum + Math.max(0, (l.originalAmount || 0) - (l.paidAmount || 0)), 0),
      byStatus: {}
    }

    loans.forEach(l => {
      const status = l.status || 'pending'
      summary.byStatus[status] = summary.byStatus[status] || { count: 0, totalBorrowed: 0, totalRepaid: 0 }
      summary.byStatus[status].count += 1
      summary.byStatus[status].totalBorrowed += l.originalAmount || 0
      summary.byStatus[status].totalRepaid += l.paidAmount || 0
    })

    res.json({ success: true, message: 'Loans report loaded', data: { loans, summary } })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load loans report', errors: { error: error.message } })
  }
}

const getCustomerReceivablesReport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')
    if (status) filter.status = status

    const receivables = await CustomerReceivable.find(filter)
      .populate('customer', 'customerName phone address')
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const summary = {
      totalReceivables: receivables.length,
      totalGiven: receivables.reduce((sum, r) => sum + (r.givenAmount || 0), 0),
      totalReceived: receivables.reduce((sum, r) => sum + (r.receivedAmount || 0), 0),
      totalOutstanding: receivables.reduce((sum, r) => sum + Math.max(0, (r.givenAmount || 0) - (r.receivedAmount || 0)), 0),
      byStatus: {}
    }

    receivables.forEach(r => {
      const status = r.status || 'pending'
      summary.byStatus[status] = summary.byStatus[status] || { count: 0, totalGiven: 0, totalReceived: 0 }
      summary.byStatus[status].count += 1
      summary.byStatus[status].totalGiven += r.givenAmount || 0
      summary.byStatus[status].totalReceived += r.receivedAmount || 0
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
