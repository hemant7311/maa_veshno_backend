const Product = require('../models/Product')
const Customer = require('../models/Customer')
const Supplier = require('../models/Supplier')
const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const Imei = require('../models/Imei')
const FinanceRecord = require('../models/FinanceRecord')
const Loan = require('../models/Loan')
const LoanPayment = require('../models/LoanPayment')
const CustomerReceivable = require('../models/CustomerReceivable')
const CustomerReceivablePayment = require('../models/CustomerReceivablePayment')
const CompanyReturn = require('../models/CompanyReturn')
const Transaction = require('../models/Transaction')
const Expense = require('../models/Expense')
const Category = require('../models/Category')
const User = require('../models/User')
const Slider = require('../models/Slider')
const Counter = require('../models/Counter')
const archiver = require('archiver')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Timezone & Date Helper
const formatDate = (date) => {
  if (!date) return ''
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch (e) {
    return ''
  }
}

const formatDateTime = (date) => {
  if (!date) return ''
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString('en-IN')
  } catch (e) {
    return ''
  }
}

const buildDateFilter = (startDate, endDate, field = 'createdAt') => {
  const filter = {}
  if (startDate || endDate) {
    filter[field] = {}
    if (startDate) {
      const s = new Date(startDate)
      s.setHours(0, 0, 0, 0)
      filter[field].$gte = s
    }
    if (endDate) {
      const e = new Date(endDate)
      e.setHours(23, 59, 59, 999)
      filter[field].$lte = e
    }
  }
  return filter
}

const escapeCSV = (value) => {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const arrayToCSV = (rows, headers) => {
  if (!headers || headers.length === 0) return ''
  const headerLine = headers.map(h => escapeCSV(h.label)).join(',')
  if (!rows || rows.length === 0) {
    return '\uFEFF' + headerLine
  }
  const dataLines = rows.map(row =>
    headers.map(h => {
      let val = row
      for (const part of h.key.split('.')) {
        if (val === null || val === undefined) break
        val = val[part]
      }
      return escapeCSV(val)
    }).join(',')
  )
  return '\uFEFF' + [headerLine, ...dataLines].join('\n')
}

const sendCSVResponse = (res, filename, csvString) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csvString)
}

/* ============================================================
   MASTER DATA GENERATOR — BUILDS ALL 35+ BUSINESS DATASETS
============================================================ */
const generateBackupDatasets = async (options = {}) => {
  const { startDate, endDate, saleType, gstFilter, financeTypeFilter, statusFilter } = options

  const dateFilterCreated = buildDateFilter(startDate, endDate, 'createdAt')
  const dateFilterDate = buildDateFilter(startDate, endDate, 'date')
  const dateFilterPayment = buildDateFilter(startDate, endDate, 'paymentDate')
  const dateFilterReturn = buildDateFilter(startDate, endDate, 'returnDate')
  const dateFilterTxn = buildDateFilter(startDate, endDate, 'transactionDate')

  // Build Filter queries
  const saleQuery = { ...dateFilterCreated }
  if (saleType && saleType !== 'all') saleQuery.saleType = saleType
  if (statusFilter && statusFilter !== 'all') saleQuery.status = statusFilter

  const purchaseQuery = { ...dateFilterDate }
  if (statusFilter && statusFilter !== 'all') purchaseQuery.status = statusFilter

  const financeQuery = { ...dateFilterPayment }
  if (financeTypeFilter && financeTypeFilter !== 'all') {
    financeQuery.financeType = financeTypeFilter.toLowerCase() === 'company' ? 'Company' : 'Private'
  }

  // Execute database queries in parallel with .lean()
  const [
    sales, customers, products, imeis, suppliers, purchases,
    financeRecords, loans, loanPayments, receivables, receivablePayments,
    companyReturns, transactions, expenses, categories, users, sliders, counters
  ] = await Promise.all([
    Sale.find(saleQuery).sort({ createdAt: -1 }).lean(),
    Customer.find().sort({ customerName: 1 }).lean(),
    Product.find().populate('categoryId', 'categoryName').populate('supplierId', 'name shopName').sort({ productName: 1 }).lean(),
    Imei.find().sort({ createdAt: -1 }).lean(),
    Supplier.find().sort({ name: 1 }).lean(),
    Purchase.find(purchaseQuery).populate('supplier', 'name shopName phone').sort({ date: -1 }).lean(),
    FinanceRecord.find(financeQuery).sort({ createdAt: -1 }).lean(),
    Loan.find(dateFilterDate).sort({ date: -1, createdAt: -1 }).lean(),
    LoanPayment.find(dateFilterDate).sort({ date: -1 }).lean(),
    CustomerReceivable.find(dateFilterDate).populate('customer', 'customerName phone address').sort({ date: -1, createdAt: -1 }).lean(),
    CustomerReceivablePayment.find(dateFilterDate).sort({ date: -1 }).lean(),
    CompanyReturn.find(dateFilterReturn).populate('supplier', 'name shopName phone').populate('product', 'productName brand model').sort({ returnDate: -1 }).lean(),
    Transaction.find(dateFilterTxn).sort({ transactionDate: -1 }).lean(),
    Expense.find(dateFilterDate).sort({ date: -1 }).lean(),
    Category.find().sort({ categoryName: 1 }).lean(),
    User.find().select('-password').sort({ createdAt: -1 }).lean(),
    Slider.find().sort({ order: 1 }).lean(),
    Counter.find().lean()
  ])

  // Available IMEIs count map for products
  const availableImeiCounts = await Imei.aggregate([
    { $match: { status: 'available' } },
    { $group: { _id: '$productId', count: { $sum: 1 } } }
  ])
  const imeiCountMap = new Map(availableImeiCounts.map(i => [String(i._id), i.count]))

  // 01. Sales Sheet (Raw Data)
  const salesHeaders = [
    { key: '_id', label: 'Sale ID' },
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'createdAtFormatted', label: 'Date' },
    { key: 'createdAtIso', label: 'ISO Timestamp' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'saleType', label: 'Sale Type' },
    { key: 'paymentMode', label: 'Payment Mode' },
    { key: 'subTotal', label: 'Sub Total' },
    { key: 'totalDiscount', label: 'Discount' },
    { key: 'totalTax', label: 'Tax' },
    { key: 'grandTotal', label: 'Grand Total' },
    { key: 'amountPaid', label: 'Amount Paid' },
    { key: 'amountDue', label: 'Due Amount' },
    { key: 'partyGst', label: 'Party GST' },
    { key: 'financeType', label: 'Finance Type' },
    { key: 'financeCompany', label: 'Finance Company' },
    { key: 'financeRefNo', label: 'Loan/File No.' },
    { key: 'dpAmount', label: 'DP Amount' },
    { key: 'emiAmount', label: 'EMI Amount' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'warrantySaleAmount', label: 'Warranty Amount' },
    { key: 'pickedBy', label: 'Picked By' },
    { key: 'billStatus', label: 'Bill Status' },
    { key: 'status', label: 'Status' }
  ]
  const salesRows = sales.map(s => ({
    _id: String(s._id),
    invoiceNumber: s.invoiceNumber,
    createdAtFormatted: formatDate(s.createdAt),
    createdAtIso: s.createdAt ? new Date(s.createdAt).toISOString() : '',
    customerName: s.customerName,
    phone: s.phone,
    saleType: s.saleType,
    paymentMode: s.paymentMode,
    subTotal: s.subTotal || 0,
    totalDiscount: s.totalDiscount || 0,
    totalTax: s.totalTax || 0,
    grandTotal: s.grandTotal || 0,
    amountPaid: s.amountPaid || 0,
    amountDue: s.amountDue !== undefined ? s.amountDue : (s.grandTotal || 0) - (s.amountPaid || 0),
    partyGst: s.partyGst || '',
    financeType: s.financeDetails?.financeType || '',
    financeCompany: s.financeDetails?.company || '',
    financeRefNo: s.financeDetails?.loanId || s.financeDetails?.fileNo || '',
    dpAmount: s.financeDetails?.dpAmount || 0,
    emiAmount: s.financeDetails?.emiAmount || 0,
    tenure: s.financeDetails?.tenure || '',
    warrantySaleAmount: s.warrantySaleAmount || 0,
    pickedBy: s.pickedBy || '',
    billStatus: s.billStatus || 'saved',
    status: s.status || 'completed'
  }))

  // 02. Sale Items Sheet
  const saleItemHeaders = [
    { key: 'saleId', label: 'Sale ID' },
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'date', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'productId', label: 'Product ID' },
    { key: 'productName', label: 'Product Name' },
    { key: 'imei', label: 'IMEI' },
    { key: 'qty', label: 'Quantity' },
    { key: 'price', label: 'Sale Price' },
    { key: 'purchasePrice', label: 'Purchase Cost' },
    { key: 'discount', label: 'Discount' },
    { key: 'tax', label: 'Tax' },
    { key: 'total', label: 'Total' },
    { key: 'profit', label: 'Profit' },
    { key: 'saleType', label: 'Sale Type' },
    { key: 'status', label: 'Status' }
  ]
  const saleItemRows = []
  sales.forEach(s => {
    (s.items || []).forEach(item => {
      const pCost = item.purchasePrice || 0
      const qty = item.qty || 1
      const totalCost = pCost * qty
      saleItemRows.push({
        saleId: String(s._id),
        invoiceNumber: s.invoiceNumber,
        date: formatDate(s.createdAt),
        customerName: s.customerName,
        productId: item.productId ? String(item.productId) : '',
        productName: item.productName || '',
        imei: item.imei || '',
        qty,
        price: item.price || 0,
        purchasePrice: pCost,
        discount: item.discount || 0,
        tax: item.tax || 0,
        total: item.total || 0,
        profit: (item.total || 0) - totalCost,
        saleType: s.saleType || 'retail',
        status: s.status || 'completed'
      })
    })
  })

  // 03. Customers Sheet
  const customerHeaders = [
    { key: '_id', label: 'Customer ID' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'email', label: 'Email' },
    { key: 'gstNumber', label: 'GST Number' },
    { key: 'customerType', label: 'Type' },
    { key: 'totalPurchases', label: 'Total Purchases' },
    { key: 'status', label: 'Status' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const customerRows = customers.map(c => ({
    _id: String(c._id),
    customerName: c.customerName,
    phone: c.phone,
    address: c.address || '',
    email: c.email || '',
    gstNumber: c.gstNumber || '',
    customerType: c.customerType || 'retail',
    totalPurchases: c.totalPurchases || 0,
    status: c.status || 'active',
    createdAt: formatDate(c.createdAt)
  }))

  // 04. Products Sheet
  const productHeaders = [
    { key: '_id', label: 'Product ID' },
    { key: 'productName', label: 'Product Name' },
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
    { key: 'variant', label: 'Variant' },
    { key: 'color', label: 'Color' },
    { key: 'category', label: 'Category' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'purchasePrice', label: 'Purchase Price' },
    { key: 'salePrice', label: 'Sale Price' },
    { key: 'gst', label: 'GST %' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'stock', label: 'Product Stock' },
    { key: 'imeiStock', label: 'IMEI Stock' },
    { key: 'totalStock', label: 'Total Stock' },
    { key: 'minStock', label: 'Min Stock' },
    { key: 'status', label: 'Status' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const productRows = products.map(p => {
    const pStock = Number(p.stock) || 0
    const iStock = imeiCountMap.get(String(p._id)) || 0
    return {
      _id: String(p._id),
      productName: p.productName,
      brand: p.brand || '',
      model: p.model || '',
      variant: p.variant || '',
      color: p.color || '',
      category: p.categoryId?.categoryName || '',
      supplier: p.supplierId?.name || '',
      purchasePrice: p.purchasePrice || 0,
      salePrice: p.salePrice || 0,
      gst: p.gst || 0,
      barcode: p.barcode || '',
      stock: pStock,
      imeiStock: iStock,
      totalStock: pStock + iStock,
      minStock: p.minStock || 0,
      status: p.status || 'active',
      createdAt: formatDate(p.createdAt)
    }
  })

  // 05. IMEI Sheet
  const imeiHeaders = [
    { key: '_id', label: 'IMEI ID' },
    { key: 'imeiNumber', label: 'IMEI Number' },
    { key: 'productId', label: 'Product ID' },
    { key: 'status', label: 'Status' },
    { key: 'soldAt', label: 'Sold Date' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const imeiRows = imeis.map(i => ({
    _id: String(i._id),
    imeiNumber: i.imeiNumber,
    productId: i.productId ? String(i.productId) : '',
    status: i.status || 'available',
    soldAt: formatDate(i.soldAt),
    remarks: i.remarks || '',
    createdAt: formatDate(i.createdAt)
  }))

  // 06. Categories Sheet
  const categoryHeaders = [
    { key: '_id', label: 'Category ID' },
    { key: 'categoryName', label: 'Category Name' },
    { key: 'status', label: 'Status' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const categoryRows = categories.map(c => ({
    _id: String(c._id),
    categoryName: c.categoryName || c.name || '',
    status: c.status || 'active',
    createdAt: formatDate(c.createdAt)
  }))

  // 07. Suppliers Sheet
  const supplierHeaders = [
    { key: '_id', label: 'Supplier ID' },
    { key: 'name', label: 'Supplier Name' },
    { key: 'shopName', label: 'Shop Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'type', label: 'Type' },
    { key: 'totalAmount', label: 'Total Purchase Amount' },
    { key: 'paidAmount', label: 'Paid Amount' },
    { key: 'pendingAmount', label: 'Pending Due Amount' },
    { key: 'status', label: 'Status' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const supplierRows = suppliers.map(s => ({
    _id: String(s._id),
    name: s.name,
    shopName: s.shopName || '',
    phone: s.phone || '',
    type: s.type || '',
    totalAmount: s.totalAmount || 0,
    paidAmount: s.paidAmount || 0,
    pendingAmount: s.pendingAmount || 0,
    status: s.status || 'active',
    createdAt: formatDate(s.createdAt)
  }))

  // 08. Purchases Sheet
  const purchaseHeaders = [
    { key: '_id', label: 'Purchase ID' },
    { key: 'purchaseNo', label: 'Purchase No.' },
    { key: 'date', label: 'Purchase Date' },
    { key: 'supplierId', label: 'Supplier ID' },
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'supplierPhone', label: 'Supplier Phone' },
    { key: 'subtotal', label: 'Subtotal' },
    { key: 'discountAmount', label: 'Discount' },
    { key: 'gstAmount', label: 'GST Amount' },
    { key: 'totalAmount', label: 'Total Amount' },
    { key: 'paidAmount', label: 'Paid Amount' },
    { key: 'dueAmount', label: 'Due Amount' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' }
  ]
  const purchaseRows = purchases.map(p => ({
    _id: String(p._id),
    purchaseNo: p.purchaseNo || '',
    date: formatDate(p.date),
    supplierId: p.supplier?._id ? String(p.supplier._id) : '',
    supplierName: p.supplierName || p.supplier?.name || '',
    supplierPhone: p.supplierMobile || p.supplier?.phone || '',
    subtotal: p.subtotal || 0,
    discountAmount: p.discountAmount || 0,
    gstAmount: p.gstAmount || 0,
    totalAmount: p.totalAmount || 0,
    paidAmount: p.paidAmount || 0,
    dueAmount: p.dueAmount !== undefined ? p.dueAmount : ((p.totalAmount || 0) - (p.paidAmount || 0)),
    paymentMethod: p.paymentMethod || '',
    notes: p.notes || '',
    status: p.status || 'completed'
  }))

  // 09. Purchase Items Sheet
  const purchaseItemHeaders = [
    { key: 'purchaseId', label: 'Purchase ID' },
    { key: 'purchaseNo', label: 'Purchase No.' },
    { key: 'date', label: 'Date' },
    { key: 'supplierName', label: 'Supplier' },
    { key: 'productId', label: 'Product ID' },
    { key: 'productName', label: 'Product Name' },
    { key: 'imeis', label: 'IMEI / IMEIs' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'costPrice', label: 'Cost Price' },
    { key: 'total', label: 'Total Amount' }
  ]
  const purchaseItemRows = []
  purchases.forEach(p => {
    (p.items || []).forEach(item => {
      let imeiStr = item.imei || ''
      if (!imeiStr && item.imeis && Array.isArray(item.imeis)) {
        imeiStr = item.imeis.join('; ')
      }
      purchaseItemRows.push({
        purchaseId: String(p._id),
        purchaseNo: p.purchaseNo || '',
        date: formatDate(p.date),
        supplierName: p.supplierName || p.supplier?.name || '',
        productId: item.productId ? String(item.productId) : '',
        productName: item.productName || '',
        imeis: imeiStr,
        quantity: item.quantity || 1,
        costPrice: item.costPrice || 0,
        total: item.total || 0
      })
    })
  })

  // 10. Finance Records Sheet (CRITICAL MODULE)
  const financeHeaders = [
    { key: '_id', label: 'Finance Record ID' },
    { key: 'saleId', label: 'Sale ID' },
    { key: 'financeType', label: 'Finance Type' },
    { key: 'entityName', label: 'Company / Entity Name' },
    { key: 'agentId', label: 'Agent ID' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'mobileNumber', label: 'Mobile Number' },
    { key: 'totalLimit', label: 'Total Limit' },
    { key: 'usedLimit', label: 'Used Limit' },
    { key: 'availableLimit', label: 'Available Limit' },
    { key: 'status', label: 'Status' },
    { key: 'billRef', label: 'Bill Reference' },
    { key: 'productDetails', label: 'Product Details' },
    { key: 'emiAmount', label: 'EMI Amount' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'paymentDate', label: 'Payment Date' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const financeRows = financeRecords.map(f => ({
    _id: String(f._id),
    saleId: f.saleId ? String(f.saleId) : '',
    financeType: f.financeType || 'Company',
    entityName: f.entityName || '',
    agentId: f.agentId ? String(f.agentId) : '',
    customerName: f.customerName || '',
    mobileNumber: f.mobileNumber || '',
    totalLimit: f.totalLimit || 0,
    usedLimit: f.usedLimit || 0,
    availableLimit: f.availableLimit || 0,
    status: f.status || 'Active',
    billRef: f.billRef || '',
    productDetails: f.productDetails || '',
    emiAmount: f.emiAmount || 0,
    tenure: f.tenure || '',
    paymentDate: formatDate(f.paymentDate),
    createdAt: formatDate(f.createdAt)
  }))

  // 11. Finance Installments Sheet
  const financeInstallmentHeaders = [
    { key: 'financeRecordId', label: 'Finance Record ID' },
    { key: 'saleId', label: 'Sale ID' },
    { key: 'billRef', label: 'Bill Reference' },
    { key: 'installmentNumber', label: 'Installment No.' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'expectedAmount', label: 'Expected Amount' },
    { key: 'paidAmount', label: 'Paid Amount' },
    { key: 'remainingAmount', label: 'Remaining Amount' },
    { key: 'status', label: 'Status' },
    { key: 'paymentDate', label: 'Payment Date' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'reference', label: 'Reference' }
  ]
  const financeInstallmentRows = []
  financeRecords.forEach(f => {
    (f.installments || []).forEach(inst => {
      financeInstallmentRows.push({
        financeRecordId: String(f._id),
        saleId: f.saleId ? String(f.saleId) : '',
        billRef: f.billRef || '',
        installmentNumber: inst.installmentNumber,
        dueDate: formatDate(inst.dueDate),
        expectedAmount: inst.expectedAmount || 0,
        paidAmount: inst.paidAmount || 0,
        remainingAmount: inst.remainingAmount || 0,
        status: inst.status || 'Pending',
        paymentDate: formatDate(inst.paymentDate),
        paymentMethod: inst.paymentMethod || '',
        reference: inst.reference || ''
      })
    })
  })

  // 12. Loans Sheet
  const loanHeaders = [
    { key: '_id', label: 'Loan ID' },
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
  const loanRows = loans.map(l => ({
    _id: String(l._id),
    personName: l.personName,
    mobile: l.mobile || '',
    address: l.address || '',
    originalAmount: l.originalAmount || 0,
    paidAmount: l.paidAmount || 0,
    remainingAmount: l.remainingAmount !== undefined ? l.remainingAmount : ((l.originalAmount || 0) - (l.paidAmount || 0)),
    date: formatDate(l.date),
    purpose: l.purpose || '',
    notes: l.notes || '',
    status: l.status || 'active'
  }))

  // 13. Loan Payments Sheet
  const loanPaymentHeaders = [
    { key: '_id', label: 'Payment ID' },
    { key: 'loanId', label: 'Loan ID' },
    { key: 'date', label: 'Payment Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'reference', label: 'Reference' },
    { key: 'notes', label: 'Notes' }
  ]
  const loanPaymentRows = loanPayments.map(p => ({
    _id: String(p._id),
    loanId: p.loan ? String(p.loan) : '',
    date: formatDate(p.date),
    amount: p.amount || 0,
    paymentMethod: p.paymentMethod || '',
    reference: p.reference || '',
    notes: p.notes || ''
  }))

  // 14. Customer Receivables Sheet
  const receivableHeaders = [
    { key: '_id', label: 'Receivable ID' },
    { key: 'customerId', label: 'Customer ID' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'address', label: 'Address' },
    { key: 'givenAmount', label: 'Given Amount' },
    { key: 'receivedAmount', label: 'Received Amount' },
    { key: 'remainingAmount', label: 'Remaining Amount' },
    { key: 'date', label: 'Date' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' }
  ]
  const receivableRows = receivables.map(r => ({
    _id: String(r._id),
    customerId: r.customer?._id ? String(r.customer._id) : '',
    customerName: r.customerName || r.customer?.customerName || '',
    mobile: r.mobile || r.customer?.phone || '',
    address: r.customer?.address || '',
    givenAmount: r.givenAmount || 0,
    receivedAmount: r.receivedAmount || 0,
    remainingAmount: r.remainingAmount !== undefined ? r.remainingAmount : ((r.givenAmount || 0) - (r.receivedAmount || 0)),
    date: formatDate(r.date),
    notes: r.notes || '',
    status: r.status || 'active'
  }))

  // 15. Receivable Payments Sheet
  const receivablePaymentHeaders = [
    { key: '_id', label: 'Payment ID' },
    { key: 'receivableId', label: 'Receivable ID' },
    { key: 'type', label: 'Type' },
    { key: 'date', label: 'Payment Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'reference', label: 'Reference' },
    { key: 'notes', label: 'Notes' }
  ]
  const receivablePaymentRows = receivablePayments.map(p => ({
    _id: String(p._id),
    receivableId: p.receivable ? String(p.receivable) : '',
    type: p.type || 'receive',
    date: formatDate(p.date),
    amount: p.amount || 0,
    paymentMethod: p.paymentMethod || '',
    reference: p.reference || '',
    notes: p.notes || ''
  }))

  // 16. Company Returns Sheet
  const returnHeaders = [
    { key: '_id', label: 'Return ID' },
    { key: 'returnIdCode', label: 'Return Ref Code' },
    { key: 'returnDate', label: 'Return Date' },
    { key: 'supplierId', label: 'Supplier ID' },
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'productId', label: 'Product ID' },
    { key: 'productName', label: 'Product Name' },
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
    { key: 'imeis', label: 'IMEI / IMEIs' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'purchasePrice', label: 'Purchase Price' },
    { key: 'reason', label: 'Reason' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' }
  ]
  const returnRows = companyReturns.map(r => {
    let imeiStr = r.imei || ''
    if (!imeiStr && r.imeis && Array.isArray(r.imeis)) imeiStr = r.imeis.join('; ')
    return {
      _id: String(r._id),
      returnIdCode: r.returnId || String(r._id),
      returnDate: formatDate(r.returnDate),
      supplierId: r.supplier?._id ? String(r.supplier._id) : '',
      supplierName: r.supplierName || r.supplier?.name || '',
      productId: r.product?._id ? String(r.product._id) : '',
      productName: r.productName || r.product?.productName || '',
      brand: r.brand || r.product?.brand || '',
      model: r.model || r.product?.model || '',
      imeis: imeiStr,
      quantity: r.quantity || 1,
      purchasePrice: r.purchasePrice || 0,
      reason: r.reason || '',
      notes: r.notes || '',
      status: r.status || 'Pending'
    }
  })

  // 17. Transactions Sheet
  const transactionHeaders = [
    { key: '_id', label: 'Transaction ID' },
    { key: 'transactionDate', label: 'Date' },
    { key: 'transactionType', label: 'Type' },
    { key: 'referenceNumber', label: 'Ref No.' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'relatedEntity', label: 'Related Entity' },
    { key: 'notes', label: 'Notes' }
  ]
  const transactionRows = transactions.map(t => ({
    _id: String(t._id),
    transactionDate: formatDate(t.transactionDate),
    transactionType: t.transactionType || '',
    referenceNumber: t.referenceNumber || '',
    description: t.description || '',
    amount: t.amount || 0,
    paymentMethod: t.paymentMethod || '',
    relatedEntity: t.relatedEntity || '',
    notes: t.notes || ''
  }))

  // 18. Expenses Sheet
  const expenseHeaders = [
    { key: '_id', label: 'Expense ID' },
    { key: 'date', label: 'Expense Date' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'reference', label: 'Reference' },
    { key: 'notes', label: 'Notes' }
  ]
  const expenseRows = expenses.map(e => ({
    _id: String(e._id),
    date: formatDate(e.date),
    category: e.category || 'general',
    description: e.description || '',
    amount: e.amount || 0,
    paymentMethod: e.paymentMethod || 'cash',
    reference: e.reference || '',
    notes: e.notes || ''
  }))

  // 19. Stock Detail & 20. Valuation
  const stockDetailHeaders = [
    { key: '_id', label: 'Product ID' },
    { key: 'productName', label: 'Product Name' },
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
    { key: 'category', label: 'Category' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'purchasePrice', label: 'Purchase Price' },
    { key: 'salePrice', label: 'Sale Price' },
    { key: 'normalStock', label: 'Normal Stock' },
    { key: 'imeiStock', label: 'IMEI Stock' },
    { key: 'totalStock', label: 'Total Available Stock' },
    { key: 'purchaseValue', label: 'Stock Purchase Value' },
    { key: 'saleValue', label: 'Potential Sale Value' },
    { key: 'status', label: 'Status' }
  ]
  let totalStockUnits = 0, totalStockPurchaseVal = 0, totalStockSaleVal = 0
  const stockDetailRows = products.map(p => {
    const pStock = Number(p.stock) || 0
    const iStock = imeiCountMap.get(String(p._id)) || 0
    const totStock = pStock + iStock
    const pVal = totStock * (p.purchasePrice || 0)
    const sVal = totStock * (p.salePrice || 0)
    totalStockUnits += totStock
    totalStockPurchaseVal += pVal
    totalStockSaleVal += sVal
    return {
      _id: String(p._id),
      productName: p.productName,
      brand: p.brand || '',
      model: p.model || '',
      category: p.categoryId?.categoryName || '',
      supplier: p.supplierId?.name || '',
      purchasePrice: p.purchasePrice || 0,
      salePrice: p.salePrice || 0,
      normalStock: pStock,
      imeiStock: iStock,
      totalStock: totStock,
      purchaseValue: pVal,
      saleValue: sVal,
      status: p.status || 'active'
    }
  })

  const stockValuationHeaders = [
    { key: 'metric', label: 'Stock Metric' },
    { key: 'value', label: 'Value' }
  ]
  const stockValuationRows = [
    { metric: 'Total Unique Products', value: products.length },
    { metric: 'Total Units Available in Stock', value: totalStockUnits },
    { metric: 'Total Inventory Cost (Purchase Value)', value: `₹${totalStockPurchaseVal.toLocaleString('en-IN')}` },
    { metric: 'Total Potential Sales Value', value: `₹${totalStockSaleVal.toLocaleString('en-IN')}` }
  ]

  /* ============================================================
     ACCOUNTING EXPORTS — STRICTLY EXCLUDES DRAFT & CANCELLED SALES
  ============================================================ */
  const validCompletedSales = sales.filter(s =>
    s.status !== 'cancelled' &&
    s.billStatus !== 'draft' &&
    s.billStatus !== 'cancelled'
  )

  // 21. GST Sales Detail & 22. GST Summary
  const gstSaleHeaders = [
    { key: '_id', label: 'Sale ID' },
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'date', label: 'Invoice Date' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'partyGst', label: 'Party GST Number' },
    { key: 'saleType', label: 'Sale Type' },
    { key: 'paymentMode', label: 'Payment Mode' },
    { key: 'taxableAmount', label: 'Taxable Amount' },
    { key: 'gstPercent', label: 'GST %' },
    { key: 'totalTax', label: 'Total GST Amount' },
    { key: 'grandTotal', label: 'Grand Total (Inclusive)' },
    { key: 'status', label: 'Status' }
  ]

  const gstSalesList = validCompletedSales.filter(s =>
    (s.totalTax && s.totalTax > 0) || (s.partyGst && s.partyGst.trim().length > 0)
  )

  let gstTotalTaxable = 0, gstTotalTax = 0, gstTotalGrand = 0
  const gstSaleRows = gstSalesList.map(s => {
    const taxable = Math.max(0, (s.subTotal || 0) - (s.totalDiscount || 0))
    const tax = s.totalTax || 0
    const grand = s.grandTotal || 0
    gstTotalTaxable += taxable
    gstTotalTax += tax
    gstTotalGrand += grand
    return {
      _id: String(s._id),
      invoiceNumber: s.invoiceNumber,
      date: formatDate(s.createdAt),
      customerName: s.customerName,
      partyGst: s.partyGst || '',
      saleType: s.saleType || 'retail',
      paymentMode: s.paymentMode || 'cash',
      taxableAmount: taxable,
      gstPercent: s.gstPercent || 18,
      totalTax: tax,
      grandTotal: grand,
      status: s.status || 'completed'
    }
  })

  const gstSummaryHeaders = [
    { key: 'metric', label: 'GST Metric' },
    { key: 'amount', label: 'Amount (₹)' }
  ]
  const gstSummaryRows = [
    { metric: 'Total GST Sales Count', amount: gstSalesList.length },
    { metric: 'Total Taxable Sales Amount', amount: gstTotalTaxable },
    { metric: 'Total Tax Collected (GST)', amount: gstTotalTax },
    { metric: 'Estimated CGST (50%)', amount: gstTotalTax / 2 },
    { metric: 'Estimated SGST (50%)', amount: gstTotalTax / 2 },
    { metric: 'Total GST Sales Revenue', amount: gstTotalGrand }
  ]

  // 23. Non-GST Sales & 24. Non-GST Summary
  const nonGstSaleHeaders = [
    { key: '_id', label: 'Sale ID' },
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'date', label: 'Invoice Date' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'saleType', label: 'Sale Type' },
    { key: 'paymentMode', label: 'Payment Mode' },
    { key: 'subTotal', label: 'Sub Total' },
    { key: 'discount', label: 'Discount' },
    { key: 'grandTotal', label: 'Grand Total' },
    { key: 'status', label: 'Status' }
  ]

  const nonGstSalesList = validCompletedSales.filter(s =>
    (!s.totalTax || s.totalTax === 0) && (!s.partyGst || s.partyGst.trim().length === 0)
  )

  let nonGstTotalRevenue = 0
  const nonGstSaleRows = nonGstSalesList.map(s => {
    nonGstTotalRevenue += (s.grandTotal || 0)
    return {
      _id: String(s._id),
      invoiceNumber: s.invoiceNumber,
      date: formatDate(s.createdAt),
      customerName: s.customerName,
      saleType: s.saleType || 'retail',
      paymentMode: s.paymentMode || 'cash',
      subTotal: s.subTotal || 0,
      discount: s.totalDiscount || 0,
      grandTotal: s.grandTotal || 0,
      status: s.status || 'completed'
    }
  })

  const nonGstSummaryHeaders = [
    { key: 'metric', label: 'Non-GST Metric' },
    { key: 'amount', label: 'Amount (₹)' }
  ]
  const nonGstSummaryRows = [
    { metric: 'Total Non-GST Sales Count', amount: nonGstSalesList.length },
    { metric: 'Total Non-GST Sales Revenue', amount: nonGstTotalRevenue }
  ]

  // 25. Profit & Loss Detail & 26. Profit & Loss Summary
  const plDetailHeaders = [
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'date', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'productName', label: 'Product' },
    { key: 'imei', label: 'IMEI' },
    { key: 'qty', label: 'Qty' },
    { key: 'salePrice', label: 'Sale Price' },
    { key: 'purchasePrice', label: 'Purchase Cost' },
    { key: 'discount', label: 'Discount' },
    { key: 'tax', label: 'Tax' },
    { key: 'revenue', label: 'Item Revenue' },
    { key: 'cogs', label: 'Item COGS' },
    { key: 'grossProfit', label: 'Gross Profit' },
    { key: 'saleType', label: 'Sale Type' },
    { key: 'paymentMode', label: 'Payment Mode' },
    { key: 'status', label: 'Status' }
  ]

  let plTotalRevenue = 0, plTotalCogs = 0
  const plDetailRows = []

  validCompletedSales.forEach(s => {
    (s.items || []).forEach(item => {
      const q = item.qty || 1
      const rev = item.total || 0
      const cogs = (item.purchasePrice || 0) * q
      const profit = rev - cogs
      plTotalRevenue += rev
      plTotalCogs += cogs
      plDetailRows.push({
        invoiceNumber: s.invoiceNumber,
        date: formatDate(s.createdAt),
        customerName: s.customerName,
        productName: item.productName || '',
        imei: item.imei || '',
        qty: q,
        salePrice: item.price || 0,
        purchasePrice: item.purchasePrice || 0,
        discount: item.discount || 0,
        tax: item.tax || 0,
        revenue: rev,
        cogs,
        grossProfit: profit,
        saleType: s.saleType || 'retail',
        paymentMode: s.paymentMode || 'cash',
        status: s.status || 'completed'
      })
    })
  })

  const totalExpenseVal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const grossProfitVal = plTotalRevenue - plTotalCogs
  const netProfitVal = grossProfitVal - totalExpenseVal

  const plSummaryHeaders = [
    { key: 'metric', label: 'Financial Metric' },
    { key: 'amount', label: 'Amount (₹)' }
  ]
  const plSummaryRows = [
    { metric: 'Total Sales Revenue (Completed Sales)', amount: plTotalRevenue },
    { metric: 'Total Cost of Goods Sold (COGS)', amount: plTotalCogs },
    { metric: 'Gross Profit', amount: grossProfitVal },
    { metric: 'Total Store Expenses', amount: totalExpenseVal },
    { metric: 'Net Profit / Loss', amount: netProfitVal }
  ]

  // 27. Company Finance & 28. Private Finance
  const companyFinanceRows = financeRows.filter(f => f.financeType === 'Company')
  const privateFinanceRows = financeRows.filter(f => f.financeType === 'Private')

  // 29. EMI Records & 30. EMI Installments
  const emiSales = validCompletedSales.filter(s => s.paymentMode === 'finance')
  const emiRecordHeaders = [
    { key: '_id', label: 'Sale ID' },
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'date', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'grandTotal', label: 'Total Bill Amount' },
    { key: 'company', label: 'Finance Company' },
    { key: 'loanRef', label: 'Loan/File No.' },
    { key: 'dpAmount', label: 'DP Amount' },
    { key: 'emiAmount', label: 'EMI Amount' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'status', label: 'Status' }
  ]
  const emiRecordRows = emiSales.map(s => ({
    _id: String(s._id),
    invoiceNumber: s.invoiceNumber,
    date: formatDate(s.createdAt),
    customerName: s.customerName,
    phone: s.phone,
    grandTotal: s.grandTotal || 0,
    company: s.financeDetails?.company || '',
    loanRef: s.financeDetails?.loanId || s.financeDetails?.fileNo || '',
    dpAmount: s.financeDetails?.dpAmount || 0,
    emiAmount: s.financeDetails?.emiAmount || 0,
    tenure: s.financeDetails?.tenure || '',
    status: s.status || 'completed'
  }))

  const emiInstallmentHeaders = [
    { key: 'saleId', label: 'Sale ID' },
    { key: 'invoiceNumber', label: 'Invoice No.' },
    { key: 'customerName', label: 'Customer' },
    { key: 'installmentNumber', label: 'Installment No.' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'dueAmount', label: 'Due Amount' },
    { key: 'paidAmount', label: 'Paid Amount' },
    { key: 'status', label: 'Status' },
    { key: 'actualPaymentDate', label: 'Actual Payment Date' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'reference', label: 'Reference' }
  ]
  const emiInstallmentRows = []
  emiSales.forEach(s => {
    (s.installmentSchedule || []).forEach(inst => {
      emiInstallmentRows.push({
        saleId: String(s._id),
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        installmentNumber: inst.installmentNumber,
        dueDate: formatDate(inst.dueDate),
        dueAmount: inst.dueAmount || 0,
        paidAmount: inst.paidAmount || 0,
        status: inst.status || 'pending',
        actualPaymentDate: formatDate(inst.actualPaymentDate),
        paymentMethod: inst.paymentMethod || '',
        reference: inst.reference || ''
      })
    })
  })

  // 31. Customer Balances
  const customerBalanceHeaders = [
    { key: '_id', label: 'Customer ID' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'totalPurchases', label: 'Total Purchases' },
    { key: 'status', label: 'Status' }
  ]

  // 32. Supplier Balances
  const supplierBalanceHeaders = [
    { key: '_id', label: 'Supplier ID' },
    { key: 'name', label: 'Supplier Name' },
    { key: 'shopName', label: 'Shop Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'totalAmount', label: 'Total Amount' },
    { key: 'paidAmount', label: 'Paid Amount' },
    { key: 'pendingAmount', label: 'Pending Due Amount' },
    { key: 'status', label: 'Status' }
  ]

  // 33. Company Return Details
  const returnDetailHeaders = returnHeaders

  // 34. Users Metadata (WITHOUT PASSWORDS)
  const userHeaders = [
    { key: '_id', label: 'User ID' },
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'role', label: 'Role' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'financeEntityName', label: 'Finance Entity Name' },
    { key: 'status', label: 'Status' },
    { key: 'lastLogin', label: 'Last Login' },
    { key: 'createdAt', label: 'Created Date' }
  ]
  const userRows = users.map(u => ({
    _id: String(u._id),
    name: u.name,
    username: u.username || '',
    email: u.email,
    phone: u.phone || '',
    role: u.role || 'staff',
    permissions: (u.permissions || []).join('; '),
    financeEntityName: u.financeEntityName || '',
    status: u.status || 'active',
    lastLogin: formatDateTime(u.lastLogin),
    createdAt: formatDate(u.createdAt)
  }))

  // 35. Sliders Metadata
  const sliderHeaders = [
    { key: '_id', label: 'Slider ID' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'mediaUrl', label: 'Media URL' },
    { key: 'mediaType', label: 'Media Type' },
    { key: 'isActive', label: 'Is Active' },
    { key: 'order', label: 'Order' }
  ]
  const sliderRows = sliders.map(s => ({
    _id: String(s._id),
    title: s.title,
    subtitle: s.subtitle || '',
    mediaUrl: s.mediaUrl || '',
    mediaType: s.mediaType || 'image',
    isActive: s.isActive !== undefined ? s.isActive : true,
    order: s.order || 0
  }))

  // Complete List of All Data Sheets
  const allSheetsMap = {
    '01_Sales': { filename: '01_Sales.csv', headers: salesHeaders, rows: salesRows },
    '02_Sale_Items': { filename: '02_Sale_Items.csv', headers: saleItemHeaders, rows: saleItemRows },
    '03_Customers': { filename: '03_Customers.csv', headers: customerHeaders, rows: customerRows },
    '04_Products': { filename: '04_Products.csv', headers: productHeaders, rows: productRows },
    '05_IMEI': { filename: '05_IMEI.csv', headers: imeiHeaders, rows: imeiRows },
    '06_Categories': { filename: '06_Categories.csv', headers: categoryHeaders, rows: categoryRows },
    '07_Suppliers': { filename: '07_Suppliers.csv', headers: supplierHeaders, rows: supplierRows },
    '08_Purchases': { filename: '08_Purchases.csv', headers: purchaseHeaders, rows: purchaseRows },
    '09_Purchase_Items': { filename: '09_Purchase_Items.csv', headers: purchaseItemHeaders, rows: purchaseItemRows },
    '10_Finance_Records': { filename: '10_Finance_Records.csv', headers: financeHeaders, rows: financeRows },
    '11_Finance_Installments': { filename: '11_Finance_Installments.csv', headers: financeInstallmentHeaders, rows: financeInstallmentRows },
    '12_Loans': { filename: '12_Loans.csv', headers: loanHeaders, rows: loanRows },
    '13_Loan_Payments': { filename: '13_Loan_Payments.csv', headers: loanPaymentHeaders, rows: loanPaymentRows },
    '14_Receivables': { filename: '14_Receivables.csv', headers: receivableHeaders, rows: receivableRows },
    '15_Receivable_Payments': { filename: '15_Receivable_Payments.csv', headers: receivablePaymentHeaders, rows: receivablePaymentRows },
    '16_Company_Returns': { filename: '16_Company_Returns.csv', headers: returnHeaders, rows: returnRows },
    '17_Transactions': { filename: '17_Transactions.csv', headers: transactionHeaders, rows: transactionRows },
    '18_Expenses': { filename: '18_Expenses.csv', headers: expenseHeaders, rows: expenseRows },
    '19_Stock_Detail': { filename: '19_Stock_Detail.csv', headers: stockDetailHeaders, rows: stockDetailRows },
    '20_Stock_Valuation': { filename: '20_Stock_Valuation.csv', headers: stockValuationHeaders, rows: stockValuationRows },
    '21_GST_Sales': { filename: '21_GST_Sales.csv', headers: gstSaleHeaders, rows: gstSaleRows },
    '22_GST_Summary': { filename: '22_GST_Summary.csv', headers: gstSummaryHeaders, rows: gstSummaryRows },
    '23_Non_GST_Sales': { filename: '23_Non_GST_Sales.csv', headers: nonGstSaleHeaders, rows: nonGstSaleRows },
    '24_Non_GST_Summary': { filename: '24_Non_GST_Summary.csv', headers: nonGstSummaryHeaders, rows: nonGstSummaryRows },
    '25_ProfitLoss_Detail': { filename: '25_ProfitLoss_Detail.csv', headers: plDetailHeaders, rows: plDetailRows },
    '26_ProfitLoss_Summary': { filename: '26_ProfitLoss_Summary.csv', headers: plSummaryHeaders, rows: plSummaryRows },
    '27_Company_Finance': { filename: '27_Company_Finance.csv', headers: financeHeaders, rows: companyFinanceRows },
    '28_Private_Finance': { filename: '28_Private_Finance.csv', headers: financeHeaders, rows: privateFinanceRows },
    '29_EMI_Records': { filename: '29_EMI_Records.csv', headers: emiRecordHeaders, rows: emiRecordRows },
    '30_EMI_Installments': { filename: '30_EMI_Installments.csv', headers: emiInstallmentHeaders, rows: emiInstallmentRows },
    '31_Customer_Balances': { filename: '31_Customer_Balances.csv', headers: customerBalanceHeaders, rows: customerRows },
    '32_Supplier_Balances': { filename: '32_Supplier_Balances.csv', headers: supplierBalanceHeaders, rows: supplierRows },
    '33_Company_Return_Details': { filename: '33_Company_Return_Details.csv', headers: returnDetailHeaders, rows: returnRows },
    '34_Users_Metadata': { filename: '34_Users_Metadata.csv', headers: userHeaders, rows: userRows },
    '35_Sliders_Metadata': { filename: '35_Sliders_Metadata.csv', headers: sliderHeaders, rows: sliderRows }
  }

  // Reconciliation Audit & Integrity Checks
  const manifest = {
    backupDate: new Date().toISOString(),
    applicationName: 'Maa Veshno Mobile Shop ERP',
    applicationVersion: '1.0.0',
    databaseEngine: 'MongoDB',
    backupType: 'Full ERP Business Data Archive',
    environment: process.env.NODE_ENV || 'production',
    totalCollectionsCount: 18,
    exportedFilesCount: Object.keys(allSheetsMap).length + 1,
    recordCounts: {},
    reconciliation: {
      salesCount: sales.length,
      saleItemsCount: saleItemRows.length,
      customersCount: customers.length,
      productsCount: products.length,
      imeiCount: imeis.length,
      financeRecordsCount: financeRecords.length,
      financeInstallmentsCount: financeInstallmentRows.length,
      loansCount: loans.length,
      loanPaymentsCount: loanPaymentRows.length,
      receivablesCount: receivables.length,
      receivablePaymentsCount: receivablePaymentRows.length,
      purchasesCount: purchases.length,
      purchaseItemsCount: purchaseItemRows.length,
      companyReturnsCount: companyReturns.length,
      transactionsCount: transactions.length,
      expensesCount: expenses.length,
      usersCount: users.length, // Password omitted
      orphanChecks: {
        financeRecordsLinkedToSale: financeRecords.filter(f => f.saleId).length,
        loanPaymentsLinkedToLoan: loanPayments.filter(p => p.loan).length,
        receivablePaymentsLinkedToReceivable: receivablePayments.filter(p => p.receivable).length
      }
    }
  }

  for (const [key, obj] of Object.entries(allSheetsMap)) {
    manifest.recordCounts[key] = obj.rows.length
  }

  return { allSheetsMap, manifest }
}

/* ============================================================
   CONTROLLER ACTION HANDLERS
============================================================ */

// 1. Single ZIP Archive Download (Full Backup)
const exportFullBackupZip = async (req, res) => {
  try {
    const { allSheetsMap, manifest } = await generateBackupDatasets()
    const dateStr = new Date().toISOString().split('T')[0]

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="Maa_Veshno_ERP_Backup_${dateStr}.zip"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.pipe(res)

    for (const [key, sheet] of Object.entries(allSheetsMap)) {
      const csvStr = arrayToCSV(sheet.rows, sheet.headers)
      const csvBuffer = Buffer.from(csvStr, 'utf-8')
      archive.append(csvBuffer, { name: sheet.filename })
    }

    archive.append(JSON.stringify(manifest, null, 2), { name: 'BACKUP_MANIFEST.json' })

    await archive.finalize()
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate Full Backup ZIP archive', errors: { error: error.message } })
    }
  }
}

// 2. Custom Backup (Filtered Selection & ZIP Export)
const exportCustomBackup = async (req, res) => {
  try {
    const options = {
      startDate: req.query.startDate || req.body?.startDate,
      endDate: req.query.endDate || req.body?.endDate,
      saleType: req.query.saleType || req.body?.saleType,
      gstFilter: req.query.gstFilter || req.body?.gstFilter,
      financeTypeFilter: req.query.financeTypeFilter || req.body?.financeTypeFilter,
      statusFilter: req.query.statusFilter || req.body?.statusFilter
    }

    let selectedModules = req.query.modules || req.body?.modules
    if (typeof selectedModules === 'string') {
      selectedModules = selectedModules.split(',').map(m => m.trim().toLowerCase())
    } else if (Array.isArray(selectedModules)) {
      selectedModules = selectedModules.map(m => String(m).trim().toLowerCase())
    }

    const { allSheetsMap, manifest } = await generateBackupDatasets(options)
    const dateStr = new Date().toISOString().split('T')[0]

    // Filter sheets if modules specified
    const targetSheets = {}
    if (selectedModules && selectedModules.length > 0) {
      for (const [key, sheet] of Object.entries(allSheetsMap)) {
        const cleanKey = key.toLowerCase()
        const cleanName = sheet.filename.toLowerCase()
        if (selectedModules.some(mod => cleanKey.includes(mod) || cleanName.includes(mod))) {
          targetSheets[key] = sheet
        }
      }
    } else {
      Object.assign(targetSheets, allSheetsMap)
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="Maa_Veshno_ERP_Custom_Backup_${dateStr}.zip"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.pipe(res)

    for (const [key, sheet] of Object.entries(targetSheets)) {
      const csvStr = arrayToCSV(sheet.rows, sheet.headers)
      const csvBuffer = Buffer.from(csvStr, 'utf-8')
      archive.append(csvBuffer, { name: sheet.filename })
    }

    manifest.customFiltersApplied = options
    manifest.selectedModulesCount = Object.keys(targetSheets).length
    archive.append(JSON.stringify(manifest, null, 2), { name: 'BACKUP_MANIFEST.json' })

    await archive.finalize()
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate Custom Backup', errors: { error: error.message } })
    }
  }
}

// 3. Database Dump BSON Archive (mongodump)
const exportDatabaseDump = async (req, res) => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
    if (!mongoUri) {
      return res.status(500).json({
        success: false,
        isAvailable: false,
        message: 'MongoDB URI is not configured on the server environment.'
      })
    }

    const tempFileName = `Maa_Veshno_ERP_DB_Backup_${Date.now()}.archive.gz`
    const tempFilePath = path.join(os.tmpdir(), tempFileName)

    // Execute mongodump securely
    exec(`mongodump --uri="${mongoUri}" --archive="${tempFilePath}" --gzip`, (error, stdout, stderr) => {
      if (error) {
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath) } catch (e) {}
        }
        return res.status(200).json({
          success: false,
          isAvailable: false,
          message: 'Database dump tool (mongodump) is not available on this server environment. Business ZIP backup is still fully available.',
          errorDetail: error.message
        })
      }

      if (!fs.existsSync(tempFilePath)) {
        return res.status(500).json({
          success: false,
          isAvailable: false,
          message: 'Dump file was not created by mongodump.'
        })
      }

      const dateStr = new Date().toISOString().split('T')[0]
      res.setHeader('Content-Type', 'application/gzip')
      res.setHeader('Content-Disposition', `attachment; filename="Maa_Veshno_ERP_DB_Backup_${dateStr}.archive.gz"`)

      const fileStream = fs.createReadStream(tempFilePath)
      fileStream.pipe(res)

      fileStream.on('end', () => {
        try { fs.unlinkSync(tempFilePath) } catch (e) {}
      })
      fileStream.on('error', () => {
        try { fs.unlinkSync(tempFilePath) } catch (e) {}
      })
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to process database dump request', errors: { error: error.message } })
  }
}

// 4. JSON Full Backup (Backward Compatibility for existing API callers)
const fullBackup = async (req, res) => {
  try {
    const { allSheetsMap } = await generateBackupDatasets()
    const dataObj = {}

    for (const [key, sheet] of Object.entries(allSheetsMap)) {
      dataObj[key] = sheet.rows
    }

    const dateStr = new Date().toISOString().split('T')[0]
    res.json({
      success: true,
      message: 'Full ERP business backup generated successfully',
      filename: `Maa_Veshno_ERP_Full_Backup_${dateStr}.json`,
      data: dataObj
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate full backup', errors: { error: error.message } })
  }
}

/* ============================================================
   PRESERVED QUICK EXPORTS (QUICK DOWNLOADS)
============================================================ */

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
      { key: 'barcode', label: 'Barcode' }
    ]

    const csv = arrayToCSV(products, headers)
    sendCSVResponse(res, `products_${Date.now()}.csv`, csv)
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
    const csv = arrayToCSV(customers, headers)
    sendCSVResponse(res, `customers_${Date.now()}.csv`, csv)
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
    const csv = arrayToCSV(suppliers, headers)
    sendCSVResponse(res, `suppliers_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export suppliers', errors: { error: error.message } })
  }
}

const exportSales = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)
    const sales = await Sale.find(filter).sort({ createdAt: -1 }).lean()
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
    const csv = arrayToCSV(sales, headers)
    sendCSVResponse(res, `sales_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export sales', errors: { error: error.message } })
  }
}

const exportPurchases = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')
    const purchases = await Purchase.find(filter).populate('supplier', 'name shopName').sort({ date: -1 }).lean()
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
    const csv = arrayToCSV(purchases, headers)
    sendCSVResponse(res, `purchases_${Date.now()}.csv`, csv)
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

    const stockData = products.map(p => {
      const pStock = Number(p.stock) || 0
      const iStock = imeiMap.get(String(p._id)) || 0
      const totalStock = pStock + iStock
      return {
        ...p,
        stock: pStock,
        imeiStock: iStock,
        totalStock,
        purchaseValue: totalStock * (p.purchasePrice || 0),
        saleValue: totalStock * (p.salePrice || 0)
      }
    })

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

    const csv = arrayToCSV(stockData, headers)
    sendCSVResponse(res, `stock_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export stock', errors: { error: error.message } })
  }
}

const exportFinance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'paymentDate')
    const records = await FinanceRecord.find(filter).sort({ createdAt: -1 }).lean()
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
    const csv = arrayToCSV(records, headers)
    sendCSVResponse(res, `finance_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export finance', errors: { error: error.message } })
  }
}

const exportEmi = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate)
    filter.paymentMode = 'finance'
    const sales = await Sale.find(filter).sort({ createdAt: -1 }).lean()
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
    const csv = arrayToCSV(sales, headers)
    sendCSVResponse(res, `emi_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export EMI', errors: { error: error.message } })
  }
}

const exportLoans = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')
    const loans = await Loan.find(filter).sort({ date: -1, createdAt: -1 }).lean()
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
    const csv = arrayToCSV(loans, headers)
    sendCSVResponse(res, `loans_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export loans', errors: { error: error.message } })
  }
}

const exportCustomerReceivables = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'date')
    const receivables = await CustomerReceivable.find(filter).populate('customer', 'customerName phone address').sort({ date: -1, createdAt: -1 }).lean()
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
    const csv = arrayToCSV(receivables, headers)
    sendCSVResponse(res, `customer_receivables_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export receivables', errors: { error: error.message } })
  }
}

const exportCompanyReturns = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'returnDate')
    const returns = await CompanyReturn.find(filter).populate('supplier', 'name shopName').populate('product', 'productName brand model').sort({ returnDate: -1 }).lean()
    const headers = [
      { key: 'returnId', label: 'Return ID' },
      { key: 'returnDate', label: 'Return Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'productName', label: 'Product' },
      { key: 'product.brand', label: 'Brand' },
      { key: 'product.model', label: 'Model' },
      { key: 'imei', label: 'IMEI' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'reason', label: 'Reason' },
      { key: 'notes', label: 'Notes' },
      { key: 'status', label: 'Status' }
    ]
    const csv = arrayToCSV(returns, headers)
    sendCSVResponse(res, `company_returns_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export returns', errors: { error: error.message } })
  }
}

const exportCompanyReturnsByMobile = async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const filter = buildDateFilter(startDate, endDate, 'returnDate')
    filter.$or = [{ imei: { $exists: true, $ne: '' } }, { imeis: { $exists: true, $not: { $size: 0 } } }]
    const returns = await CompanyReturn.find(filter).populate('supplier', 'name shopName').populate('product', 'productName brand model').sort({ returnDate: -1 }).lean()

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
      { key: 'imei', label: 'IMEI' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'reason', label: 'Reason' },
      { key: 'notes', label: 'Notes' },
      { key: 'status', label: 'Status' }
    ]

    const csv = arrayToCSV(mobileReturns, headers)
    sendCSVResponse(res, `company_returns_mobile_${Date.now()}.csv`, csv)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export mobile returns', errors: { error: error.message } })
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
  fullBackup,
  exportFullBackupZip,
  exportCustomBackup,
  exportDatabaseDump
}
