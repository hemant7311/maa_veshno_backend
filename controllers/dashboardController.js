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
      Product.countDocuments({ status: 'active' }).catch(() => 0),
      Customer.countDocuments({ status: 'active' }).catch(() => 0),
      Imei.aggregate([{ $match: { status: 'available' } }, { $group: { _id: '$productId', stock: { $sum: 1 } } }]).catch(() => []),
      Imei.aggregate([
        { $match: { status: 'available' } },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.status': 'active' } },
        { $group: { _id: null, stock: { $sum: 1 }, purchaseValue: { $sum: '$product.purchasePrice' }, saleValue: { $sum: '$product.salePrice' } } },
      ]).catch(() => []),
      Sale.find({ status: { $ne: 'cancelled' } }).lean().catch(() => []),
      Sale.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'cancelled' } }).lean().catch(() => []),
      Purchase.find({ status: 'completed' }).lean().catch(() => []),
      Purchase.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: 'completed' }).lean().catch(() => []),
      Expense.find({
        $or: [
          { date: { $gte: dayStart, $lte: dayEnd } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } }
        ]
      }).lean().catch(() => []),
      Expense.find().sort({ date: -1, createdAt: -1 }).lean().catch(() => []),
      CompanyReturn.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'cancelled' } }).lean().catch(() => []),
      Product.find().select('_id productName purchasePrice costPrice').lean().catch(() => [])
    ])

    const safeProducts = Array.isArray(allProducts) ? allProducts : []
    const productCostMap = new Map(safeProducts.map(p => [String(p._id), p.purchasePrice || p.costPrice || 0]))
    const productNameCostMap = new Map(
      safeProducts
        .filter(p => p && p.productName)
        .map(p => [String(p.productName).toLowerCase().trim(), p.purchasePrice || p.costPrice || 0])
    )

    // Helper to calculate revenue, cost, and gross profit for a list of sales
    const calculateSalesMetrics = (salesList) => {
      let revenue = 0
      let cost = 0
      let grossProfit = 0
      let grossCashProfit = 0
      let grossUpiProfit = 0
      let grossCardProfit = 0
      let grossFinanceProfit = 0

      const safeSales = Array.isArray(salesList) ? salesList : []
      safeSales.forEach(sale => {
        if (!sale) return
        const saleRevenue = Number(sale.grandTotal) || 0
        revenue += saleRevenue

        let saleCost = 0
        let saleGrossProfit = 0

        const items = Array.isArray(sale.items) ? sale.items : []
        items.forEach(item => {
          if (!item) return
          const qty = Number(item.qty) || 1
          const itemNetSelling = item.total !== undefined ? Number(item.total) : (((Number(item.price) || 0) * qty) - (Number(item.discount) || 0))
          
          let unitCost = (item.purchasePrice !== undefined && Number(item.purchasePrice) > 0) ? Number(item.purchasePrice) : 0
          if (!unitCost && item.productId) {
            unitCost = productCostMap.get(String(item.productId)) || 0
          }
          if (!unitCost && item.productName) {
            unitCost = productNameCostMap.get(String(item.productName).toLowerCase().trim()) || 0
          }

          const lineCost = unitCost * qty
          const lineGross = itemNetSelling - lineCost

          saleCost += lineCost
          saleGrossProfit += lineGross
        })

        cost += saleCost
        grossProfit += saleGrossProfit

        const mode = String(sale.paymentMode || '').toLowerCase()
        if (mode === 'cash') grossCashProfit += saleGrossProfit
        else if (mode === 'upi') grossUpiProfit += saleGrossProfit
        else if (mode === 'card') grossCardProfit += saleGrossProfit
        else if (mode === 'finance') grossFinanceProfit += saleGrossProfit
      })

      return { revenue, cost, grossProfit, grossCashProfit, grossUpiProfit, grossCardProfit, grossFinanceProfit }
    }

    // Process Overall All-Time Sales Accounting
    const safeAllExpenses = Array.isArray(allExpenses) ? allExpenses : []
    const overall = calculateSalesMetrics(allSales)
    const totalExpenses = safeAllExpenses.reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0)
    const netTotalProfit = overall.grossProfit - totalExpenses

    // Process Today's Sales Accounting
    const safeTodayExpenses = Array.isArray(todayExpenses) ? todayExpenses : []
    const today = calculateSalesMetrics(todaySales)
    const todayExpenseAmount = safeTodayExpenses.reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0)
    const todayNetProfit = today.grossProfit - todayExpenseAmount

    // Calculate Today's Stock In from purchases
    let todayStockIn = 0
    const safeTodayPurchases = Array.isArray(todayPurchases) ? todayPurchases : []
    safeTodayPurchases.forEach(purchase => {
      const pItems = Array.isArray(purchase?.items) ? purchase.items : []
      pItems.forEach(item => {
        todayStockIn += Number(item?.quantity) || 0
      })
    })

    // Calculate Today's Returns
    const safeTodayReturns = Array.isArray(todayCompanyReturns) ? todayCompanyReturns : []
    const todayReturnsCount = safeTodayReturns.reduce((sum, cr) => sum + (Number(cr?.quantity) || 1), 0)
    const todayReturnsAmount = safeTodayReturns.reduce((sum, cr) => sum + ((Number(cr?.purchasePrice) || 0) * (Number(cr?.quantity) || 1)), 0)

    const returnedProducts = safeTodayReturns.map(cr => ({
      id: cr._id,
      name: cr.productName || cr.product?.productName || 'Returned Product',
      brand: cr.brand || '—',
      variant: cr.variant || '—',
      imei: cr.imeiNumber || (Array.isArray(cr.imeiNumbers) ? cr.imeiNumbers.join(', ') : '') || '—',
      price: Number(cr.purchasePrice) || 0,
      date: cr.returnDate ? new Date(cr.returnDate).toISOString().split('T')[0] : (cr.createdAt ? new Date(cr.createdAt).toISOString().split('T')[0] : dateStr)
    }))

    const safeAllSales = Array.isArray(allSales) ? allSales : []
    const recentSales = safeAllSales.slice(0, 15).map(sale => ({
      id: sale.invoiceNumber || sale._id,
      customer: sale.customerName || 'Retail Customer',
      phone: sale.phone || '—',
      date: sale.createdAt ? new Date(sale.createdAt).toISOString() : new Date().toISOString(),
      amount: Number(sale.grandTotal) || 0,
      mode: sale.paymentMode || 'cash',
      products: Array.isArray(sale.items) ? sale.items.map(i => i.productName).join(', ') : ''
    }))

    const safeStockByProduct = Array.isArray(stockByProduct) ? stockByProduct : []
    const stockMap = new Map(safeStockByProduct.map((item) => [String(item._id), Number(item.stock) || 0]))
    const activeProducts = await Product.find({ status: 'active' }).select('productName minStock').lean().catch(() => [])
    const safeActiveProducts = Array.isArray(activeProducts) ? activeProducts : []
    const lowStock = safeActiveProducts
      .map((product) => ({ productName: product.productName, minStock: Number(product.minStock) || 0, stock: stockMap.get(String(product._id)) || 0 }))
      .filter((product) => product.stock <= product.minStock)
      .slice(0, 10)

    const invSummaryObj = Array.isArray(inventorySummary) && inventorySummary.length > 0 ? inventorySummary[0] : {}

    res.json({
      success: true,
      message: 'Dashboard loaded',
      data: {
        productCount: Number(productCount) || 0,
        customerCount: Number(customerCount) || 0,
        stock: Number(invSummaryObj?.stock) || 0,
        availableImeis: Number(invSummaryObj?.stock) || 0,
        purchaseValue: Number(invSummaryObj?.purchaseValue) || 0,
        saleValue: Number(invSummaryObj?.saleValue) || 0,
        potentialProfit: (Number(invSummaryObj?.saleValue) || 0) - (Number(invSummaryObj?.purchaseValue) || 0),
        lowStock,
        
        // Authoritative Accounting Fields
        totalSales: Math.round(overall.revenue),
        totalCost: Math.round(overall.cost),
        totalGrossProfit: Math.round(overall.grossProfit),
        totalExpenses: Math.round(totalExpenses),
        totalNetProfit: Math.round(netTotalProfit),
        
        // TOTAL PROFIT CARD = TOTAL GROSS PROFIT
        totalProfit: Math.round(overall.grossProfit),

        // Gross Profit by Payment Mode (All-Time)
        grossCashProfit: Math.round(overall.grossCashProfit),
        grossUpiProfit: Math.round(overall.grossUpiProfit),
        grossCardProfit: Math.round(overall.grossCardProfit),
        grossFinanceProfit: Math.round(overall.grossFinanceProfit),
        totalCashProfit: Math.round(overall.grossCashProfit),
        totalUpiProfit: Math.round(overall.grossUpiProfit + overall.grossCardProfit + overall.grossFinanceProfit),

        // Today Accounting Fields
        todayTotalSales: Math.round(today.revenue),
        todayTotalCost: Math.round(today.cost),
        todayGrossProfit: Math.round(today.grossProfit),
        todayExpense: Math.round(todayExpenseAmount),
        todayExpenses: Math.round(todayExpenseAmount),
        todayNetProfit: Math.round(todayNetProfit),
        
        // TODAY'S PROFIT CARD = TODAY GROSS PROFIT
        todayProfit: Math.round(today.grossProfit),

        // Gross Profit by Payment Mode (Today)
        todayGrossCashProfit: Math.round(today.grossCashProfit),
        todayGrossUpiProfit: Math.round(today.grossUpiProfit),
        todayGrossCardProfit: Math.round(today.grossCardProfit),
        todayGrossFinanceProfit: Math.round(today.grossFinanceProfit),
        todayCashProfit: Math.round(today.grossCashProfit),
        todayUpiProfit: Math.round(today.grossUpiProfit + today.grossCardProfit + today.grossFinanceProfit),

        todayStockIn,
        todayReturnsCount,
        todayReturnsAmount,
        returnedProducts,
        recentSales,
        soldProducts: recentSales,
        recentExpenses: safeAllExpenses.slice(0, 20)
      },
    })
  } catch (error) {
    console.error('[Dashboard] Error:', error, { date: req.query.date, user: req.user?._id })
    res.status(500).json({ success: false, message: 'Failed to load dashboard data', errors: { error: error.message } })
  }
}

module.exports = { summary }
