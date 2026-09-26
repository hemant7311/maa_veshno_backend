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
      allCompanyReturns,
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
      Sale.find({ status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean().catch(() => []),
      Sale.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean().catch(() => []),
      Purchase.find({ status: { $ne: 'cancelled' } }).lean().catch(() => []),
      Purchase.find({
        $or: [
          { date: { $gte: dayStart, $lte: dayEnd } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } }
        ],
        status: { $ne: 'cancelled' }
      }).lean().catch(() => []),
      Expense.find({
        $or: [
          { date: { $gte: dayStart, $lte: dayEnd } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } }
        ]
      }).sort({ createdAt: -1 }).lean().catch(() => []),
      Expense.find().sort({ date: -1, createdAt: -1 }).lean().catch(() => []),
      CompanyReturn.find({
        $or: [
          { returnDate: { $gte: dayStart, $lte: dayEnd } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } }
        ],
        status: { $ne: 'rejected' }
      }).sort({ returnDate: -1, createdAt: -1 }).lean().catch(() => []),
      CompanyReturn.find({ status: { $ne: 'rejected' } }).sort({ returnDate: -1, createdAt: -1 }).lean().catch(() => []),
      Product.find().select('_id productName purchasePrice costPrice brand variant categoryName').lean().catch(() => [])
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
    const totalExpensesAmount = safeAllExpenses.reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0)
    const netTotalProfit = overall.grossProfit - totalExpensesAmount

    // Process Today's Sales Accounting
    const safeTodayExpenses = Array.isArray(todayExpenses) ? todayExpenses : []
    const today = calculateSalesMetrics(todaySales)
    const todayExpensesAmount = safeTodayExpenses.reduce((sum, exp) => sum + (Number(exp?.amount) || 0), 0)
    const todayNetProfit = today.grossProfit - todayExpensesAmount

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

    const mapReturn = (cr) => ({
      id: cr._id,
      name: cr.productName || cr.product?.productName || 'Returned Product',
      brand: cr.brand || '—',
      variant: cr.variant || '—',
      imei: cr.imeiNumber || (Array.isArray(cr.imeiNumbers) ? cr.imeiNumbers.join(', ') : '') || '—',
      price: Number(cr.purchasePrice) || 0,
      date: cr.returnDate ? new Date(cr.returnDate).toISOString().split('T')[0] : (cr.createdAt ? new Date(cr.createdAt).toISOString().split('T')[0] : dateStr)
    })

    const mapSale = (sale) => ({
      id: sale.invoiceNumber || sale._id,
      customer: sale.customerName || 'Retail Customer',
      phone: sale.phone || '—',
      date: sale.createdAt ? new Date(sale.createdAt).toISOString() : new Date().toISOString(),
      amount: Number(sale.grandTotal) || 0,
      mode: (sale.paymentMode || 'cash').toUpperCase(),
      products: Array.isArray(sale.items) ? sale.items.map(i => i.productName).join(', ') : ''
    })

    const mapExpense = (exp) => ({
      id: exp._id,
      category: exp.category || 'Expense',
      description: exp.description || '—',
      amount: Number(exp.amount) || 0,
      date: exp.date ? new Date(exp.date).toISOString().split('T')[0] : (exp.createdAt ? new Date(exp.createdAt).toISOString().split('T')[0] : dateStr),
      time: exp.createdAt ? new Date(exp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    })

    const safeStockByProduct = Array.isArray(stockByProduct) ? stockByProduct : []
    const stockMap = new Map(safeStockByProduct.map((item) => [String(item._id), Number(item.stock) || 0]))
    const activeProducts = await Product.find({ status: 'active' }).select('productName minStock').lean().catch(() => [])
    const safeActiveProducts = Array.isArray(activeProducts) ? activeProducts : []
    const lowStock = safeActiveProducts
      .map((product) => ({ productName: product.productName, minStock: Number(product.minStock) || 0, stock: stockMap.get(String(product._id)) || 0 }))
      .filter((product) => product.stock <= product.minStock)
      .slice(0, 10)

    const invSummaryObj = Array.isArray(inventorySummary) && inventorySummary.length > 0 ? inventorySummary[0] : {}

    const safeTodaySales = Array.isArray(todaySales) ? todaySales : []
    const safeAllSalesList = Array.isArray(allSales) ? allSales : []
    const safeAllCompanyReturns = Array.isArray(allCompanyReturns) ? allCompanyReturns : []

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
        
        // Authoritative Accounting Fields (Total Net Profit)
        totalSales: Math.round(overall.revenue),
        totalCost: Math.round(overall.cost),
        totalGrossProfit: Math.round(overall.grossProfit),
        totalExpenses: Math.round(totalExpensesAmount),
        totalNetProfit: Math.round(netTotalProfit),
        
        // TOTAL PROFIT CARD = AUTHORITATIVE TOTAL NET PROFIT (BUG A RESOLVED)
        totalProfit: Math.round(netTotalProfit),

        // Gross Profit / Breakdown by Payment Mode
        totalCashProfit: Math.round(overall.grossCashProfit),
        totalUpiProfit: Math.round(overall.grossUpiProfit + overall.grossCardProfit + overall.grossFinanceProfit),
        grossCashProfit: Math.round(overall.grossCashProfit),
        grossUpiProfit: Math.round(overall.grossUpiProfit),
        grossCardProfit: Math.round(overall.grossCardProfit),
        grossFinanceProfit: Math.round(overall.grossFinanceProfit),

        // Today Accounting Fields (Today Net Profit)
        todayTotalSales: Math.round(today.revenue),
        todayTotalCost: Math.round(today.cost),
        todayGrossProfit: Math.round(today.grossProfit),
        todayExpense: Math.round(todayExpensesAmount),
        todayExpensesAmount: Math.round(todayExpensesAmount),
        todayNetProfit: Math.round(todayNetProfit),
        
        // TODAY'S PROFIT CARD = AUTHORITATIVE TODAY NET PROFIT (BUG B RESOLVED)
        todayProfit: Math.round(todayNetProfit),

        todayCashProfit: Math.round(today.grossCashProfit),
        todayUpiProfit: Math.round(today.grossUpiProfit + today.grossCardProfit + today.grossFinanceProfit),
        todayGrossCashProfit: Math.round(today.grossCashProfit),
        todayGrossUpiProfit: Math.round(today.grossUpiProfit),
        todayGrossCardProfit: Math.round(today.grossCardProfit),
        todayGrossFinanceProfit: Math.round(today.grossFinanceProfit),

        // Today Stock In & Returns
        todayStockIn,
        todayReturnsCount,
        todayReturnsAmount,

        // Mapped Arrays for UI Tables
        todaySoldProducts: safeTodaySales.map(mapSale),
        soldProducts: safeTodaySales.map(mapSale), // Selected date sales for UI table
        allSales: safeAllSalesList.map(mapSale),
        recentSales: safeAllSalesList.slice(0, 15).map(mapSale),
        
        returnedProducts: safeTodayReturns.map(mapReturn),
        allReturnedProducts: safeAllCompanyReturns.map(mapReturn),

        todayExpenses: safeTodayExpenses.map(mapExpense),
        shopExpenses: safeTodayExpenses.map(mapExpense),
        allExpenses: safeAllExpenses.map(mapExpense),
        recentExpenses: safeAllExpenses.slice(0, 20).map(mapExpense)
      },
    })
  } catch (error) {
    console.error('[Dashboard] Error:', error, { date: req.query.date, user: req.user?._id })
    res.status(500).json({ success: false, message: 'Failed to load dashboard data', errors: { error: error.message } })
  }
}

module.exports = { summary }
