const Product = require('../models/Product')
const Customer = require('../models/Customer')
const Imei = require('../models/Imei')
const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const Expense = require('../models/Expense')
const CompanyReturn = require('../models/CompanyReturn')
const { getIndiaDayBounds, getIndiaFYBounds } = require('../utils/dateUtils')

const summary = async (req, res) => {
  try {
    const targetDate = req.query.date || new Date()
    const { start: dayStart, end: dayEnd, dateStr } = getIndiaDayBounds(targetDate)
    const { start: fyStart, end: fyEnd } = getIndiaFYBounds(targetDate)

    const [
      productCount,
      customerCount,
      stockByProduct,
      inventorySummary,
      allSales,
      todaySales,
      allPurchases,
      todayPurchases,
      todayExpenses,
      allExpenses,
      todayCompanyReturns,
      allProducts
    ] = await Promise.all([
      Product.countDocuments({ status: 'active' }),
      Customer.countDocuments({ status: 'active' }),
      Imei.aggregate([{ $match: { status: 'available' } }, { $group: { _id: '$productId', stock: { $sum: 1 } } }]),
      Imei.aggregate([
        { $match: { status: 'available' } },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.status': 'active' } },
        { $group: { _id: null, stock: { $sum: 1 }, purchaseValue: { $sum: '$product.purchasePrice' }, saleValue: { $sum: '$product.salePrice' } } },
      ]),
      Sale.find({ status: { $ne: 'cancelled' } }).lean(),
      Sale.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'cancelled' } }).lean(),
      Purchase.find({ status: 'completed' }).lean(),
      Purchase.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: 'completed' }).lean(),
      Expense.find({
        $or: [
          { date: { $gte: dayStart, $lte: dayEnd } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } }
        ]
      }).lean(),
      Expense.find().sort({ date: -1, createdAt: -1 }).lean(),
      CompanyReturn.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'cancelled' } }).lean(),
      Product.find().select('_id purchasePrice costPrice').lean()
    ])

    const productCostMap = new Map(allProducts.map(p => [String(p._id), p.purchasePrice || p.costPrice || 0]))

    // Helper to calculate revenue, cost, and gross profit for a list of sales
    const calculateSalesMetrics = (salesList) => {
      let revenue = 0
      let cost = 0
      let grossProfit = 0
      let grossCashProfit = 0
      let grossUpiProfit = 0
      let grossCardProfit = 0
      let grossFinanceProfit = 0

      salesList.forEach(sale => {
        const saleRevenue = sale.grandTotal || 0
        revenue += saleRevenue

        let saleCost = 0
        let saleGrossProfit = 0

        sale.items.forEach(item => {
          const qty = item.qty || 1
          const itemNetSelling = item.total !== undefined ? item.total : (((item.price || 0) * qty) - (item.discount || 0))
          const unitCost = (item.purchasePrice !== undefined && item.purchasePrice !== 0) 
            ? item.purchasePrice 
            : (item.productId ? (productCostMap.get(String(item.productId)) || 0) : 0)
          const lineCost = unitCost * qty
          const lineGross = itemNetSelling - lineCost

          saleCost += lineCost
          saleGrossProfit += lineGross
        })

        cost += saleCost
        grossProfit += saleGrossProfit

        if (sale.paymentMode === 'cash') grossCashProfit += saleGrossProfit
        else if (sale.paymentMode === 'upi') grossUpiProfit += saleGrossProfit
        else if (sale.paymentMode === 'card') grossCardProfit += saleGrossProfit
        else if (sale.paymentMode === 'finance') grossFinanceProfit += saleGrossProfit
      })

      return { revenue, cost, grossProfit, grossCashProfit, grossUpiProfit, grossCardProfit, grossFinanceProfit }
    }

    // Process Overall All-Time Sales Accounting
    const overall = calculateSalesMetrics(allSales)
    const totalExpenses = allExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0)
    const netTotalProfit = overall.grossProfit - totalExpenses

    // Process Today's Sales Accounting
    const today = calculateSalesMetrics(todaySales)
    const todayExpenseAmount = todayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0)
    const todayNetProfit = today.grossProfit - todayExpenseAmount

    // Calculate Today's Stock In from purchases
    let todayStockIn = 0
    todayPurchases.forEach(purchase => {
      purchase.items.forEach(item => {
        todayStockIn += item.quantity || 0
      })
    })

    // Calculate Today's Returns
    const todayReturnsCount = todayCompanyReturns.reduce((sum, cr) => sum + (cr.quantity || 1), 0)
    const todayReturnsAmount = todayCompanyReturns.reduce((sum, cr) => sum + ((cr.purchasePrice || 0) * (cr.quantity || 1)), 0)

    const recentSales = allSales.slice(0, 15).map(sale => ({
      id: sale.invoiceNumber,
      customer: sale.customerName,
      phone: sale.phone,
      date: sale.createdAt,
      amount: sale.grandTotal,
      mode: sale.paymentMode,
      products: sale.items.map(i => i.productName).join(', ')
    }))

    const stockMap = new Map(stockByProduct.map((item) => [String(item._id), item.stock]))
    const activeProducts = await Product.find({ status: 'active' }).select('productName minStock')
    const lowStock = activeProducts
      .map((product) => ({ productName: product.productName, minStock: product.minStock, stock: stockMap.get(String(product._id)) || 0 }))
      .filter((product) => product.stock <= product.minStock)
      .slice(0, 10)

    res.json({
      success: true,
      message: 'Dashboard loaded',
      data: {
        productCount,
        customerCount,
        stock: inventorySummary[0]?.stock || 0,
        availableImeis: inventorySummary[0]?.stock || 0,
        purchaseValue: inventorySummary[0]?.purchaseValue || 0,
        saleValue: inventorySummary[0]?.saleValue || 0,
        potentialProfit: (inventorySummary[0]?.saleValue || 0) - (inventorySummary[0]?.purchaseValue || 0),
        lowStock,
        
        // Authoritative Accounting Fields
        totalSales: Math.round(overall.revenue),
        totalCost: Math.round(overall.cost),
        totalGrossProfit: Math.round(overall.grossProfit),
        totalExpenses: Math.round(totalExpenses),
        totalNetProfit: Math.round(netTotalProfit),
        totalProfit: Math.round(netTotalProfit),

        // Gross Profit by Payment Mode (All-Time)
        grossCashProfit: Math.round(overall.grossCashProfit),
        grossUpiProfit: Math.round(overall.grossUpiProfit),
        grossCardProfit: Math.round(overall.grossCardProfit),
        grossFinanceProfit: Math.round(overall.grossFinanceProfit),
        totalCashProfit: Math.round(overall.grossCashProfit),
        totalUpiProfit: Math.round(overall.grossUpiProfit),

        // Today Accounting Fields
        todayTotalSales: Math.round(today.revenue),
        todayTotalCost: Math.round(today.cost),
        todayGrossProfit: Math.round(today.grossProfit),
        todayExpense: Math.round(todayExpenseAmount),
        todayExpenses: Math.round(todayExpenseAmount),
        todayNetProfit: Math.round(todayNetProfit),
        todayProfit: Math.round(todayNetProfit),

        // Gross Profit by Payment Mode (Today)
        todayGrossCashProfit: Math.round(today.grossCashProfit),
        todayGrossUpiProfit: Math.round(today.grossUpiProfit),
        todayGrossCardProfit: Math.round(today.grossCardProfit),
        todayGrossFinanceProfit: Math.round(today.grossFinanceProfit),
        todayCashProfit: Math.round(today.grossCashProfit),
        todayUpiProfit: Math.round(today.grossUpiProfit),

        todayStockIn,
        todayReturnsCount,
        todayReturnsAmount,
        recentSales,
        recentExpenses: allExpenses.slice(0, 20)
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load dashboard data', errors: { error: error.message } })
  }
}

module.exports = { summary }
