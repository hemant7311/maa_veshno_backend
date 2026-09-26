const Product = require('../models/Product')
const Customer = require('../models/Customer')
const Imei = require('../models/Imei')
const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const Expense = require('../models/Expense')
const Transaction = require('../models/Transaction')

const summary = async (req, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [
      productCount,
      customerCount,
      stockByProduct,
      inventorySummary,
      allSales,
      todaySales,
      allPurchases,
      todayExpenses,
      allExpenses
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
      Sale.find({ createdAt: { $gte: today, $lt: tomorrow }, status: { $ne: 'cancelled' } }).lean(),
      Purchase.find({ createdAt: { $gte: today, $lt: tomorrow }, status: 'completed' }).lean(),
      Expense.find({ date: { $gte: today, $lt: tomorrow } }).lean(),
      Expense.find().sort({ date: -1, createdAt: -1 }).lean()
    ])

    // Process Sales Data - Total
    let totalGrossProfit = 0
    let totalCashProfit = 0
    let totalUpiProfit = 0
    let totalSales = 0

    allSales.forEach(sale => {
      let saleProfit = 0
      sale.items.forEach(item => {
        saleProfit += (item.total - ((item.purchasePrice || 0) * item.qty))
      })
      totalGrossProfit += saleProfit
      totalSales += sale.grandTotal
      if (sale.paymentMode === 'cash') totalCashProfit += saleProfit
      if (sale.paymentMode === 'upi') totalUpiProfit += saleProfit
    })

    const totalExpenseAmount = allExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0)
    const netTotalProfit = totalGrossProfit - totalExpenseAmount

    // Process Today's Sales Data
    let todayGrossProfit = 0
    let todayCashProfit = 0
    let todayUpiProfit = 0
    let todayTotalSales = 0

    todaySales.forEach(sale => {
      let saleProfit = 0
      sale.items.forEach(item => {
        saleProfit += (item.total - ((item.purchasePrice || 0) * item.qty))
      })
      todayGrossProfit += saleProfit
      todayTotalSales += sale.grandTotal
      if (sale.paymentMode === 'cash') todayCashProfit += saleProfit
      if (sale.paymentMode === 'upi') todayUpiProfit += saleProfit
    })

    const todayExpenseAmount = todayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0)
    const todayNetProfit = todayGrossProfit - todayExpenseAmount

    // Calculate Today's Stock In from purchases
    let todayStockIn = 0
    allPurchases.forEach(purchase => {
      purchase.items.forEach(item => {
        todayStockIn += item.quantity || 0
      })
    })

    const recentSales = []
    allSales.slice(0, 15).forEach(sale => {
      recentSales.push({
        id: sale.invoiceNumber,
        customer: sale.customerName,
        phone: sale.phone,
        date: sale.createdAt,
        amount: sale.grandTotal,
        mode: sale.paymentMode,
        products: sale.items.map(i => i.productName).join(', ')
      })
    })

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
        totalProfit: Math.round(netTotalProfit),
        todayProfit: Math.round(todayNetProfit),
        todayExpense: Math.round(todayExpenseAmount),
        totalCashProfit: Math.round(totalCashProfit - totalExpenseAmount),
        totalUpiProfit: Math.round(totalUpiProfit),
        todayCashProfit: Math.round(todayCashProfit - todayExpenseAmount),
        todayUpiProfit: Math.round(todayUpiProfit),
        todayTotalSales: Math.round(todayTotalSales),
        totalSales: Math.round(totalSales),
        todayStockIn,
        recentSales: recentSales,
        recentExpenses: allExpenses.slice(0, 20)
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load dashboard data', errors: { error: error.message } })
  }
}

module.exports = { summary }
