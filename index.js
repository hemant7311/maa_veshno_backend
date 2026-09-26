require('dotenv').config()
// Maa Veshno Mobile Shop ERP - Backend Server v1.0.1
// Updated: 2026-09-25
const express = require('express')
const cors = require('cors')
const connectDatabase = require('./config/database')
const authRoutes = require('./routes/authRoutes')
const categoryRoutes = require('./routes/categoryRoutes')
const productRoutes = require('./routes/productRoutes')
const sliderRoutes = require('./routes/sliderRoutes')
const imeiRoutes = require('./routes/imeiRoutes')
const customerRoutes = require('./routes/customerRoutes')
const dashboardRoutes = require('./routes/dashboardRoutes')
const Product = require('./models/Product')
const Imei = require('./models/Imei')

const supplierRoutes = require('./routes/supplierRoutes')
const financeRoutes = require('./routes/financeRoutes')
const saleRoutes = require('./routes/saleRoutes')
const loanRoutes = require('./routes/loanRoutes')
const customerReceivableRoutes = require('./routes/customerReceivableRoutes')
const purchaseRoutes = require('./routes/purchaseRoutes')
const companyReturnRoutes = require('./routes/companyReturnRoutes')
const transactionRoutes = require('./routes/transactionRoutes')
const reportRoutes = require('./routes/reportRoutes')
const exportRoutes = require('./routes/exportRoutes')
const expenseRoutes = require('./routes/expenseRoutes')
const requireAuth = require('./middleware/auth')
const { requireAdmin, requirePermission } = require('./middleware/authorize')

const app = express()
const port = process.env.PORT || 5000

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

const path = require('path')
const fs = require('fs')
const uploadsDir = path.join(__dirname, 'uploads')
const slidersUploadDir = path.join(uploadsDir, 'sliders')
const billsUploadDir = path.join(uploadsDir, 'bills')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
if (!fs.existsSync(slidersUploadDir)) fs.mkdirSync(slidersUploadDir, { recursive: true })
if (!fs.existsSync(billsUploadDir)) fs.mkdirSync(billsUploadDir, { recursive: true })

app.use('/uploads', express.static(uploadsDir))

app.get('/api/health', (req, res) => {

  res.json({ message: 'Backend is connected', status: 'ok' })
})

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/sliders', sliderRoutes)
app.use('/api/v1/categories', requireAuth, requirePermission('categories'), categoryRoutes)
app.use('/api/v1/products', productRoutes)
app.use('/api/v1/imeis', requireAuth, requirePermission('imeis'), imeiRoutes)
app.use('/api/v1/customers', requireAuth, requirePermission('customers'), customerRoutes)
app.use('/api/v1/dashboard', requireAuth, requirePermission('dashboard'), dashboardRoutes)
app.use('/api/v1/suppliers', requireAuth, requirePermission('suppliers'), supplierRoutes)
app.use('/api/v1/finance', financeRoutes)
app.use('/api/v1/sales', requireAuth, requirePermission('billing'), saleRoutes)
app.use('/api/v1/loans', loanRoutes)
app.use('/api/v1/customer-receivables', customerReceivableRoutes)
app.use('/api/v1/purchases', purchaseRoutes)
app.use('/api/v1/company-returns', companyReturnRoutes)
app.use('/api/v1/transactions', transactionRoutes)
app.use('/api/v1/reports', reportRoutes)
app.use('/api/v1/exports', exportRoutes)
app.use('/api/v1/expenses', expenseRoutes)

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found', errors: {} }))

app.use((error, req, res, next) => {
  if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid record id', errors: {} })
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0]
    return res.status(409).json({ success: false, message: `Duplicate ${field}: ${error.keyValue[field]}`, errors: {} })
  }
  if (error.name === 'ValidationError') {
    const errors = Object.fromEntries(Object.entries(error.errors).map(([key, value]) => [key, value.message]))
    return res.status(422).json({ success: false, message: 'Validation failed', errors })
  }
  console.error('⚠️ ERROR:', error.message)
  console.error('   Stack:', error.stack)
  return res.status(500).json({ 
    success: false, 
    message: 'Internal server error', 
    errors: { details: error.message, stack: error.stack } 
  })
})

const migrateLegacyProductImeis = async () => {
  const products = await Product.find({ imeiNumber: { $exists: true, $ne: '' } }).select('_id imeiNumber status')
  for (const product of products) {
    await Imei.updateOne(
      { imeiNumber: product.imeiNumber },
      { $setOnInsert: { productId: product._id, imeiNumber: product.imeiNumber, status: product.status === 'active' ? 'available' : 'inactive' } },
      { upsert: true },
    )
  }
}

const migrateDatabase = async () => {
  try {
    const mongoose = require('mongoose')
    const db = mongoose.connection.db
    if (!db) return

    // 1. Rename collection 'folders' to 'categories' if 'folders' exists
    const collections = await db.listCollections().toArray()
    const folderExists = collections.some(c => c.name === 'folders')
    const categoryExists = collections.some(c => c.name === 'categories')

    if (folderExists && !categoryExists) {
      console.log('🔄 Migrating: Renaming collection "folders" to "categories"...')
      await db.collection('folders').rename('categories')
      console.log('✅ Migrating: collection "folders" renamed to "categories"')
    }

    // 2. Rename field 'folderId' to 'categoryId' in 'products' collection
    console.log('🔄 Migrating: Renaming field "folderId" to "categoryId" in products...')
    const result = await db.collection('products').updateMany(
      { folderId: { $exists: true } },
      { $rename: { folderId: 'categoryId' } }
    )
    if (result.modifiedCount > 0) {
      console.log(`✅ Migrating: field "folderId" renamed to "categoryId" in ${result.modifiedCount} products`)
    }

    // 3. Rename field 'folderName' to 'categoryName' in 'categories' collection
    console.log('🔄 Migrating: Renaming field "folderName" to "categoryName" in categories...')
    try {
      await db.collection('categories').dropIndex('folderName_1')
      console.log('✅ Migrating: dropped index folderName_1')
    } catch (e) {
      // index does not exist, safe to ignore
    }
    const catResult = await db.collection('categories').updateMany(
      { folderName: { $exists: true } },
      { $rename: { folderName: 'categoryName' } }
    )
    if (catResult.modifiedCount > 0) {
      console.log(`✅ Migrating: field "folderName" renamed to "categoryName" in ${catResult.modifiedCount} categories`)
    }
  } catch (err) {
    console.warn('⚠️ Database migration failed:', err.message)
  }
}

// Start server regardless of DB connection
  app.listen(port, () => {
    // migrateLegacyProductImeis().catch((error) => console.warn('Legacy IMEI migration skipped:', error.message))
    console.log(`Server is running at http://localhost:${port}`)
  })

// Try DB connection (non-blocking)
connectDatabase()
  .then(() => {
    console.log('✅ MongoDB connected')
    // migrateDatabase().catch((error) => console.warn('Database migration skipped:', error.message))
  })
  .catch((error) => {
    console.warn('⚠️  MongoDB not connected:', error.message)
    console.warn('   Server running in limited mode (no database)')
  })

