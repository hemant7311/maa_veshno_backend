const Product = require('../models/Product')
const Customer = require('../models/Customer')
const Supplier = require('../models/Supplier')
const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const Imei = require('../models/Imei')
const FinanceRecord = require('../models/FinanceRecord')
const Loan = require('../models/Loan')
const CustomerReceivable = require('../models/CustomerReceivable')
const CompanyReturn = require('../models/CompanyReturn')

const buildDateFilter = (startDate, endDate, field = 'createdAt') => {
  const filter = {}
  if (startDate || endDate) {
    filter[field] = {}
    if (startDate) filter[field].$gte = new Date(startDate)
    if (endDate) filter[field].$lte = new Date(endDate)
  }
  return filter
}

const convertToCSV = (rows, headers) => {
  const escapeValue = (value) => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const headerLine = headers.map(h => escapeValue(h.label)).join(',')
  const dataLines = rows.map(row =>
    headers.map(h => {
      let val = row
      for (const part of h.key.split('.')) {
        if (val === null || val === undefined) break
        val = val[part]
      }
      return escapeValue(val)
    }).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

const sendCSV = (res, filename, data) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send('\uFEFF' + data)
}

const exportProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('categoryId', 'categoryName')
      .populate('supplierId', 'name shopName')
      .sort({ productName: 1 })
      .lean()

    const headers = [
      { key: 'productName', label: 'Product Name' },
      { key: 'brand', label: 'Brand' },
      { key: 'model', label: 'Model' },
      { key: 'variant', label: 'Variant' },
      { key: 'color', label: 'Color' },
      { key: 'categoryId.categoryName', label: 'Category' },
      { key: 'supplierId.name', label: 'Supplier' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'salePrice', label: 'Sale Price' },
      { key: 'gst', label: 'GST %' },
      { key: 'stock', label: 'Stock' },
      { key: 'status', label: 'Status' },
      { key: 'barcode', label: 'Barcode' },
      { key: 'imeiNumber', label: 'IMEI' }
    ]

    const csv = convertToCSV(products, headers)
    sendCSV(res, `products_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export products', errors: { error: error.message } })
  }
}

const exportCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ customerName: 1 }).lean()

    const headers = [
      { key: 'customerName', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' },
      { key: 'customerType', label: 'Type' },
      { key: 'totalPurchases', label: 'Total Purchases' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created Date' }
    ]

    const csv = convertToCSV(customers, headers)
    sendCSV(res, `customers_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export customers', errors: { error: error.message } })
  }
}

const exportSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ name: 1 }).lean()

    const headers = [
      { key: 'name', label: 'Name' },
      { key: 'shopName', label: 'Shop Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'type', label: 'Type' },
      { key: 'totalAmount', label: 'Total Amount' },
      { key: 'paidAmount', label: 'Paid Amount' },
      { key: 'pendingAmount', label: 'Pending Amount' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created Date' }
    ]

    const csv = convertToCSV(suppliers, headers)
    sendCSV(res, `suppliers_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export suppliers', errors: { error: error.message } })
  }
}

const exportSales = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const headers = [
      { key: 'invoiceNumber', label: 'Invoice No.' },
      { key: 'createdAt', label: 'Date' },
      { key: 'customerName', label: 'Customer' },
      { key: 'phone', label: 'Phone' },
      { key: 'saleType', label: 'Sale Type' },
      { key: 'paymentMode', label: 'Payment Mode' },
      { key: 'subTotal', label: 'Sub Total' },
      { key: 'totalDiscount', label: 'Discount' },
      { key: 'totalTax', label: 'Tax' },
      { key: 'grandTotal', label: 'Grand Total' },
      { key: 'partyGst', label: 'GST No.' },
      { key: 'status', label: 'Status' }
    ]

    const csv = convertToCSV(sales, headers)
    sendCSV(res, `sales_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export sales', errors: { error: error.message } })
  }
}

const exportPurchases = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')

    const purchases = await Purchase.find(filter)
      .populate('supplier', 'name shopName')
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const headers = [
      { key: 'purchaseNo', label: 'Purchase No.' },
      { key: 'date', label: 'Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'subtotal', label: 'Sub Total' },
      { key: 'discountAmount', label: 'Discount' },
      { key: 'gstAmount', label: 'GST' },
      { key: 'totalAmount', label: 'Total Amount' },
      { key: 'paidAmount', label: 'Paid Amount' },
      { key: 'dueAmount', label: 'Due Amount' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'status', label: 'Status' }
    ]

    const csv = convertToCSV(purchases, headers)
    sendCSV(res, `purchases_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export purchases', errors: { error: error.message } })
  }
}

const exportStock = async (req, res) => {
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

    const stockData = products.map(p => ({
      ...p,
      imeiStock: imeiMap.get(String(p._id)) || 0,
      totalStock: (p.stock || 0) + (imeiMap.get(String(p._id)) || 0),
      purchaseValue: ((p.stock || 0) + (imeiMap.get(String(p._id)) || 0)) * (p.purchasePrice || 0),
      saleValue: ((p.stock || 0) + (imeiMap.get(String(p._id)) || 0)) * (p.salePrice || 0)
    }))

    const headers = [
      { key: 'productName', label: 'Product Name' },
      { key: 'brand', label: 'Brand' },
      { key: 'model', label: 'Model' },
      { key: 'categoryId.categoryName', label: 'Category' },
      { key: 'supplierId.name', label: 'Supplier' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'salePrice', label: 'Sale Price' },
      { key: 'stock', label: 'Product Stock' },
      { key: 'imeiStock', label: 'IMEI Stock' },
      { key: 'totalStock', label: 'Total Stock' },
      { key: 'purchaseValue', label: 'Purchase Value' },
      { key: 'saleValue', label: 'Sale Value' }
    ]

    const csv = convertToCSV(stockData, headers)
    sendCSV(res, `stock_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export stock', errors: { error: error.message } })
  }
}

const exportFinance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'paymentDate')

    const records = await FinanceRecord.find(filter)
      .sort({ createdAt: -1 })
      .lean()

    const headers = [
      { key: 'financeType', label: 'Finance Type' },
      { key: 'entityName', label: 'Company/Entity' },
      { key: 'customerName', label: 'Customer' },
      { key: 'mobileNumber', label: 'Mobile' },
      { key: 'totalLimit', label: 'Total Limit' },
      { key: 'usedLimit', label: 'Used Limit' },
      { key: 'availableLimit', label: 'Available Limit' },
      { key: 'billRef', label: 'Bill Ref.' },
      { key: 'productDetails', label: 'Product' },
      { key: 'emiAmount', label: 'EMI Amount' },
      { key: 'tenure', label: 'Tenure' },
      { key: 'paymentDate', label: 'Date' }
    ]

    const csv = convertToCSV(records, headers)
    sendCSV(res, `finance_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export finance', errors: { error: error.message } })
  }
}

const exportEmi = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)
    filter.paymentMode = 'finance'

    const sales = await Sale.find(filter)
      .populate('customerId', 'customerName phone')
      .sort({ createdAt: -1 })
      .lean()

    const headers = [
      { key: 'invoiceNumber', label: 'Invoice No.' },
      { key: 'createdAt', label: 'Date' },
      { key: 'customerName', label: 'Customer' },
      { key: 'phone', label: 'Phone' },
      { key: 'grandTotal', label: 'Total Amount' },
      { key: 'financeDetails.company', label: 'Finance Company' },
      { key: 'financeDetails.loanId', label: 'Loan/File No.' },
      { key: 'financeDetails.dpAmount', label: 'DP Amount' },
      { key: 'financeDetails.emiAmount', label: 'EMI Amount' },
      { key: 'financeDetails.tenure', label: 'Tenure' }
    ]

    const csv = convertToCSV(sales, headers)
    sendCSV(res, `emi_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export EMI', errors: { error: error.message } })
  }
}

const exportLoans = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')

    const loans = await Loan.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const headers = [
      { key: 'personName', label: 'Person Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'address', label: 'Address' },
      { key: 'originalAmount', label: 'Original Amount' },
      { key: 'paidAmount', label: 'Paid Amount' },
      { key: 'remainingAmount', label: 'Remaining Amount' },
      { key: 'date', label: 'Date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'notes', label: 'Notes' },
      { key: 'status', label: 'Status' }
    ]

    const csv = convertToCSV(loans, headers)
    sendCSV(res, `loans_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export loans', errors: { error: error.message } })
  }
}

const exportCustomerReceivables = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')

    const receivables = await CustomerReceivable.find(filter)
      .populate('customer', 'customerName phone address')
      .sort({ date: -1, createdAt: -1 })
      .lean()

    const headers = [
      { key: 'customerName', label: 'Customer Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'givenAmount', label: 'Given Amount' },
      { key: 'receivedAmount', label: 'Received Amount' },
      { key: 'remainingAmount', label: 'Remaining Amount' },
      { key: 'date', label: 'Date' },
      { key: 'notes', label: 'Notes' },
      { key: 'status', label: 'Status' }
    ]

    const csv = convertToCSV(receivables, headers)
    sendCSV(res, `customer_receivables_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export receivables', errors: { error: error.message } })
  }
}

const exportCompanyReturns = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'returnDate')

    const returns = await CompanyReturn.find(filter)
      .populate('supplier', 'name shopName')
      .populate('product', 'productName brand model')
      .sort({ returnDate: -1 })
      .lean()

    const headers = [
      { key: 'returnId', label: 'Return ID' },
      { key: 'returnDate', label: 'Return Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'productName', label: 'Product' },
      { key: 'product.brand', label: 'Brand' },
      { key: 'product.model', label: 'Model' },
      { key: 'product.sku', label: 'SKU' },
      { key: 'product.barcode', label: 'Barcode' },
      { key: 'imei', label: 'IMEI' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'reason', label: 'Reason' },
      { key: 'notes', label: 'Notes' },
      { key: 'status', label: 'Status' }
    ]

    const csv = convertToCSV(returns, headers)
    sendCSV(res, `company_returns_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export returns', errors: { error: error.message } })
  }
}

const exportCompanyReturnsByMobile = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'returnDate')
    filter.$or = [{ imei: { $exists: true, $ne: '' } }, { imeis: { $exists: true, $not: { $size: 0 } } }]

    const returns = await CompanyReturn.find(filter)
      .populate('supplier', 'name shopName')
      .populate('product', 'productName brand model')
      .sort({ returnDate: -1 })
      .lean()

    const mobileReturns = []
    returns.forEach(ret => {
      const imeisList = []
      if (ret.imei) imeisList.push(ret.imei)
      if (ret.imeis && Array.isArray(ret.imeis)) imeisList.push(...ret.imeis)
      if (imeisList.length === 0) {
        mobileReturns.push({
          returnId: ret.returnId,
          returnDate: ret.returnDate,
          supplierName: ret.supplierName,
          productName: ret.productName,
          product: ret.product,
          purchasePrice: ret.purchasePrice,
          status: ret.status,
          imei: '',
          quantity: ret.quantity,
          reason: ret.reason,
          notes: ret.notes
        })
      } else {
        imeisList.forEach(imeiNum => {
          mobileReturns.push({
            returnId: ret.returnId,
            returnDate: ret.returnDate,
            supplierName: ret.supplierName,
            productName: ret.productName,
            product: ret.product,
            purchasePrice: ret.purchasePrice,
            status: ret.status,
            imei: imeiNum,
            quantity: 1,
            reason: ret.reason,
            notes: ret.notes
          })
        })
      }
    })

    const headers = [
      { key: 'returnId', label: 'Return ID' },
      { key: 'returnDate', label: 'Return Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'productName', label: 'Product' },
      { key: 'product.brand', label: 'Brand' },
      { key: 'product.model', label: 'Model' },
      { key: 'product.sku', label: 'SKU' },
      { key: 'product.barcode', label: 'Barcode' },
      { key: 'imei', label: 'IMEI' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'reason', label: 'Reason' },
      { key: 'notes', label: 'Notes' },
      { key: 'status', label: 'Status' }
    ]

    const csv = convertToCSV(mobileReturns, headers)
    sendCSV(res, `company_returns_mobile_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export mobile returns', errors: { error: error.message } })
  }
}

const LoanPayment = require('../models/LoanPayment')
const CustomerReceivablePayment = require('../models/CustomerReceivablePayment')
const Category = require('../models/Category')
const Transaction = require('../models/Transaction')
const Expense = require('../models/Expense')
const User = require('../models/User')

// Full backup: returns JSON with all sheets
const fullBackup = async (req, res) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0]

    // Fetch all collections in parallel (read-only)
    const [
      sales, customers, products, imeis, suppliers, purchases,
      loans, loanPayments, receivables, receivablePayments,
      companyReturns, transactions, expenses, categories, users
    ] = await Promise.all([
      Sale.find({ status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean(),
      Customer.find().sort({ customerName: 1 }).lean(),
      Product.find().populate('categoryId', 'categoryName').populate('supplierId', 'name shopName').sort({ productName: 1 }).lean(),
      Imei.find().sort({ createdAt: -1 }).lean(),
      Supplier.find().sort({ name: 1 }).lean(),
      Purchase.find().populate('supplier', 'name shopName phone').sort({ date: -1 }).lean(),
      Loan.find().sort({ createdAt: -1 }).lean(),
      LoanPayment.find().sort({ date: -1 }).lean(),
      CustomerReceivable.find().populate('customer', 'customerName phone address').sort({ createdAt: -1 }).lean(),
      CustomerReceivablePayment.find().sort({ date: -1 }).lean(),
      CompanyReturn.find().populate('supplier', 'name shopName phone').populate('product', 'productName brand model').sort({ returnDate: -1 }).lean(),
      Transaction.find().sort({ transactionDate: -1 }).lean(),
      Expense.find().sort({ date: -1 }).lean(),
      Category.find().sort({ categoryName: 1 }).lean(),
      User.find().select('-password').sort({ createdAt: -1 }).lean()
    ])

    // Sales sheet
    const salesSheet = sales.map(s => ({
      'Sale ID': String(s._id),
      'Invoice No.': s.invoiceNumber,
      'Date': s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '',
      'Customer': s.customerName,
      'Phone': s.phone,
      'Sale Type': s.saleType,
      'Payment Mode': s.paymentMode,
      'Sub Total': s.subTotal,
      'Discount': s.totalDiscount,
      'Tax': s.totalTax,
      'Grand Total': s.grandTotal,
      'Party GST': s.partyGst || '',
      'Finance Company': s.financeDetails?.company || '',
      'Finance File/Loan No.': s.financeDetails?.loanId || s.financeDetails?.fileNo || '',
      'DP Amount': s.financeDetails?.dpAmount || '',
      'EMI Amount': s.financeDetails?.emiAmount || '',
      'EMI Tenure': s.financeDetails?.tenure || '',
      'Warranty Sale Amount': s.warrantySaleAmount || 0,
      'Picked By': s.pickedBy || '',
      'Status': s.status
    }))

    // Sale Items sheet (flattened)
    const saleItemsSheet = []
    sales.forEach(s => {
      s.items.forEach(item => {
        saleItemsSheet.push({
          'Invoice No.': s.invoiceNumber,
          'Date': s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '',
          'Customer': s.customerName,
          'Product': item.productName,
          'IMEI': item.imei || '',
          'Qty': item.qty,
          'Sale Price': item.price,
          'Purchase Price': item.purchasePrice || 0,
          'Discount': item.discount || 0,
          'Tax': item.tax || 0,
          'Total': item.total,
          'Profit': item.total - ((item.purchasePrice || 0) * item.qty)
        })
      })
    })

    // Customers sheet
    const customersSheet = customers.map(c => ({
      'Customer ID': String(c._id),
      'Name': c.customerName,
      'Phone': c.phone,
      'Address': c.address || '',
      'Email': c.email || '',
      'GST No.': c.gstNumber || '',
      'Type': c.customerType,
      'Total Purchases': c.totalPurchases || 0,
      'Status': c.status,
      'Created': c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : ''
    }))

    // Products sheet
    const productsSheet = products.map(p => ({
      'Product ID': String(p._id),
      'Product Name': p.productName,
      'Brand': p.brand || '',
      'Model': p.model || '',
      'Variant': p.variant || '',
      'Color': p.color || '',
      'Category': p.categoryId?.categoryName || '',
      'Supplier': p.supplierId?.name || '',
      'Purchase Price': p.purchasePrice || 0,
      'Sale Price': p.salePrice || 0,
      'GST %': p.gst || 0,
      'Barcode': p.barcode || '',
      'Stock': p.stock || 0,
      'Min Stock': p.minStock || 0,
      'Status': p.status,
      'Display Size': p.displaySize || '',
      'Battery': p.battery || '',
      'Processor': p.processor || '',
      'Network': p.network || ''
    }))

    // IMEI sheet
    const imeiSheet = imeis.map(i => ({
      'IMEI': i.imeiNumber,
      'Product ID': String(i.productId),
      'Status': i.status,
      'Sold At': i.soldAt ? new Date(i.soldAt).toLocaleDateString('en-IN') : '',
      'Remarks': i.remarks || '',
      'Created': i.createdAt ? new Date(i.createdAt).toLocaleDateString('en-IN') : ''
    }))

    // Suppliers sheet
    const suppliersSheet = suppliers.map(s => ({
      'Supplier ID': String(s._id),
      'Name': s.name,
      'Shop Name': s.shopName || '',
      'Phone': s.phone || '',
      'Type': s.type || '',
      'Total Amount': s.totalAmount || 0,
      'Paid Amount': s.paidAmount || 0,
      'Pending Amount': s.pendingAmount || 0,
      'Status': s.status,
      'Created': s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : ''
    }))

    // Purchases sheet
    const purchasesSheet = purchases.map(p => ({
      'Purchase ID': String(p._id),
      'Date': p.date ? new Date(p.date).toLocaleDateString('en-IN') : '',
      'Supplier': p.supplierName,
      'Supplier Phone': p.supplierMobile || p.supplier?.phone || '',
      'Subtotal': p.subtotal || 0,
      'Discount': p.discountAmount || 0,
      'GST': p.gstAmount || 0,
      'Total Amount': p.totalAmount || 0,
      'Paid Amount': p.paidAmount || 0,
      'Due Amount': (p.totalAmount || 0) - (p.paidAmount || 0),
      'Payment Method': p.paymentMethod || '',
      'Notes': p.notes || '',
      'Status': p.status
    }))

    // Purchase Items
    const purchaseItemsSheet = []
    purchases.forEach(p => {
      p.items.forEach(item => {
        purchaseItemsSheet.push({
          'Purchase ID': String(p._id),
          'Date': p.date ? new Date(p.date).toLocaleDateString('en-IN') : '',
          'Supplier': p.supplierName,
          'Product': item.productName,
          'IMEI': item.imei || (item.imeis ? item.imeis.join('; ') : ''),
          'Qty': item.quantity,
          'Cost Price': item.costPrice || 0,
          'Total': item.total || 0
        })
      })
    })

    // Loans sheet
    const loansSheet = loans.map(l => ({
      'Loan ID': String(l._id),
      'Person Name': l.personName,
      'Phone': l.mobile || '',
      'Address': l.address || '',
      'Original Amount': l.originalAmount,
      'Paid Amount': l.paidAmount,
      'Remaining Amount': l.remainingAmount || (l.originalAmount - l.paidAmount),
      'Date': l.date ? new Date(l.date).toLocaleDateString('en-IN') : '',
      'Purpose': l.purpose || '',
      'Notes': l.notes || '',
      'Status': l.status
    }))

    // Loan Payments sheet
    const loanPaymentsSheet = loanPayments.map(p => ({
      'Payment ID': String(p._id),
      'Loan ID': String(p.loan),
      'Date': p.date ? new Date(p.date).toLocaleDateString('en-IN') : '',
      'Amount': p.amount,
      'Payment Method': p.paymentMethod || '',
      'Reference': p.reference || '',
      'Notes': p.notes || ''
    }))

    // Customer Receivables sheet
    const receivablesSheet = receivables.map(r => ({
      'Receivable ID': String(r._id),
      'Customer': r.customerName,
      'Phone': r.mobile || r.customer?.phone || '',
      'Address': r.customer?.address || '',
      'Given Amount': r.givenAmount,
      'Received Amount': r.receivedAmount,
      'Remaining Amount': r.remainingAmount || (r.givenAmount - r.receivedAmount),
      'Date': r.date ? new Date(r.date).toLocaleDateString('en-IN') : '',
      'Notes': r.notes || '',
      'Status': r.status
    }))

    // Receivable Payments sheet
    const receivablePaymentsSheet = receivablePayments.map(p => ({
      'Payment ID': String(p._id),
      'Receivable ID': String(p.receivable),
      'Type': p.type || '',
      'Date': p.date ? new Date(p.date).toLocaleDateString('en-IN') : '',
      'Amount': p.amount,
      'Payment Method': p.paymentMethod || '',
      'Reference': p.reference || '',
      'Notes': p.notes || ''
    }))

    // Company Returns sheet
    const returnsSheet = companyReturns.map(r => ({
      'Return ID': r.returnId || String(r._id),
      'Date': r.returnDate ? new Date(r.returnDate).toLocaleDateString('en-IN') : '',
      'Supplier': r.supplierName,
      'Product': r.productName,
      'Brand': r.brand || r.product?.brand || '',
      'Model': r.model || r.product?.model || '',
      'IMEI': r.imei || (r.imeis ? r.imeis.join('; ') : ''),
      'Qty': r.quantity,
      'Purchase Price': r.purchasePrice || 0,
      'Reason': r.reason || '',
      'Notes': r.notes || '',
      'Status': r.status || ''
    }))

    // Transactions sheet
    const transactionsSheet = transactions.map(t => ({
      'Transaction ID': String(t._id),
      'Date': t.transactionDate ? new Date(t.transactionDate).toLocaleDateString('en-IN') : '',
      'Type': t.transactionType,
      'Reference No.': t.referenceNumber || '',
      'Description': t.description,
      'Amount': t.amount,
      'Payment Method': t.paymentMethod,
      'Party': t.relatedEntity || '',
      'Notes': t.notes || ''
    }))

    // Expenses sheet
    const expensesSheet = expenses.map(e => ({
      'Expense ID': String(e._id),
      'Date': e.date ? new Date(e.date).toLocaleDateString('en-IN') : '',
      'Category': e.category || 'general',
      'Description': e.description,
      'Amount': e.amount,
      'Payment Method': e.paymentMethod,
      'Reference': e.reference || '',
      'Notes': e.notes || ''
    }))

    // Categories sheet
    const categoriesSheet = categories.map(c => ({
      'Category ID': String(c._id),
      'Category Name': c.categoryName || c.name || '',
      'Status': c.status || 'active'
    }))

    // P&L Summary
    let totalRevenue = 0, totalCost = 0
    saleItemsSheet.forEach(item => { totalRevenue += item.Total; totalCost += (item['Purchase Price'] * item.Qty) })
    const plSheet = [{ 
      'Metric': 'Total Revenue', 'Amount (₹)': totalRevenue 
    }, { 
      'Metric': 'Total Cost of Goods', 'Amount (₹)': totalCost 
    }, { 
      'Metric': 'Gross Profit', 'Amount (₹)': totalRevenue - totalCost 
    }, { 
      'Metric': 'Total Expenses', 'Amount (₹)': expenses.reduce((s, e) => s + (e.amount || 0), 0) 
    }, { 
      'Metric': 'Net Profit', 'Amount (₹)': (totalRevenue - totalCost) - expenses.reduce((s, e) => s + (e.amount || 0), 0) 
    }]

    // GST Summary
    const gstSheet = sales.filter(s => s.partyGst && s.partyGst.length > 0).map(s => ({
      'Invoice No.': s.invoiceNumber,
      'Date': s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '',
      'Customer': s.customerName,
      'GST No.': s.partyGst || '',
      'Taxable Amount': (s.subTotal || 0) - (s.totalDiscount || 0),
      'GST Amount': s.totalTax || 0,
      'Total': s.grandTotal || 0
    }))

    res.json({
      success: true,
      message: 'Full backup generated',
      filename: `Maa_Veshno_ERP_Full_Backup_${dateStr}.xlsx`,
      data: {
        'Sales': salesSheet,
        'Sale Items': saleItemsSheet,
        'Customers': customersSheet,
        'Products': productsSheet,
        'IMEI': imeiSheet,
        'Suppliers': suppliersSheet,
        'Purchases': purchasesSheet,
        'Purchase Items': purchaseItemsSheet,
        'Loans': loansSheet,
        'Loan Payments': loanPaymentsSheet,
        'Customer Receivables': receivablesSheet,
        'Receivable Payments': receivablePaymentsSheet,
        'Company Returns': returnsSheet,
        'Transactions': transactionsSheet,
        'Expenses': expensesSheet,
        'Categories': categoriesSheet,
        'ProfitLoss': plSheet,
        'GST Summary': gstSheet
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate full backup', errors: { error: error.message } })
  }
}

module.exports = {
  exportProducts,
  exportCustomers,
  exportSuppliers,
  exportSales,
  exportPurchases,
  exportStock,
  exportFinance,
  exportEmi,
  exportLoans,
  exportCustomerReceivables,
  exportCompanyReturns,
  exportCompanyReturnsByMobile,
  fullBackup
}
