const express = require('express')
const router = express.Router()
const Supplier = require('../models/Supplier')
const Product = require('../models/Product')
const Imei = require('../models/Imei')
const requireAuth = require('../middleware/auth')
const { requirePermission } = require('../middleware/authorize')

// Protect all routes with authentication and supplier permission
router.use(requireAuth)
router.use(requirePermission('suppliers'))

// 1. GET / - List all suppliers
router.get('/', async (req, res, next) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 }).lean()
    const suppliersWithCount = await Promise.all(
      suppliers.map(async (s) => {
        // Find active product IDs under this supplier
        const supplierProducts = await Product.find({ supplierId: s._id, status: { $ne: 'returned' } }).select('_id')
        const supplierProductIds = supplierProducts.map(p => p._id)

        // Count available stock (IMEIs) for these products
        const stockCount = supplierProductIds.length
          ? await Imei.countDocuments({ productId: { $in: supplierProductIds }, status: 'available' })
          : 0

        return {
          ...s,
          totalProducts: stockCount
        }
      })
    )
    res.json({ success: true, data: suppliersWithCount })
  } catch (err) {
    next(err)
  }
})

// 2. POST / - Create a new supplier
router.post('/', async (req, res, next) => {
  try {
    const { name, type, shopName, phone, status, totalAmount, paidAmount, pendingAmount } = req.body
    
    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'Supplier name and type are required' })
    }

    const supplier = new Supplier({
      name,
      type,
      shopName: shopName || '',
      phone: phone || '',
      status: status || 'active',
      totalAmount: Number(totalAmount || 0),
      paidAmount: Number(paidAmount || 0),
      pendingAmount: Number(pendingAmount ?? (totalAmount - paidAmount || 0))
    })

    await supplier.save()
    res.status(201).json({ success: true, data: supplier })
  } catch (err) {
    next(err)
  }
})

// 3. GET /:id/products - Get all products supplied by this supplier ("kya kya maal aaya")
router.get('/:id/products', async (req, res, next) => {
  try {
    const { id } = req.params
    const products = await Product.find({ supplierId: id }).populate('categoryId').sort({ createdAt: -1 })
    
    // Fetch associated IMEIs from the Imei collection
    const productIds = products.map(p => p._id)
    const imeis = productIds.length ? await Imei.find({ productId: { $in: productIds } }) : []
    const imeiMap = new Map()
    for (const imei of imeis) {
      const key = String(imei.productId)
      if (!imeiMap.has(key)) {
        imeiMap.set(key, imei.imeiNumber)
      }
    }

    const data = products.map(p => {
      const key = String(p._id)
      return {
        ...p.toObject(),
        imeiNumber: imeiMap.get(key) || p.imeiNumber || '—'
      }
    })

    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// 4. POST /:id/pay - Record an additional payment to reduce the pending balance
router.post('/:id/pay', async (req, res, next) => {
  try {
    const { id } = req.params
    const { amount } = req.body

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' })
    }

    const supplier = await Supplier.findById(id)
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' })
    }

    const payVal = Number(amount)
    supplier.paidAmount += payVal
    supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)

    await supplier.save()
    res.json({ success: true, message: 'Payment recorded successfully', data: supplier })
  } catch (err) {
    next(err)
  }
})

// 5. POST /products/:productId/return - Return a product to supplier
router.post('/products/:productId/return', async (req, res, next) => {
  try {
    const { productId } = req.params
    const product = await Product.findById(productId)
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    if (product.status === 'returned') {
      return res.status(400).json({ success: false, message: 'Product is already returned' })
    }

    // Mark product as returned
    product.status = 'returned'
    await product.save()

    // If it has a linked supplier, deduct from supplier ledger balances
    if (product.supplierId) {
      const supplier = await Supplier.findById(product.supplierId)
      if (supplier) {
        const refundVal = Number(product.purchasePrice || 0)
        
        supplier.totalAmount = Math.max(0, supplier.totalAmount - refundVal)
        
        // If the balance is pending, deduct from pending first. Else adjust paid/pending.
        if (supplier.pendingAmount >= refundVal) {
          supplier.pendingAmount -= refundVal
        } else {
          const excess = refundVal - supplier.pendingAmount
          supplier.pendingAmount = 0
          supplier.paidAmount = Math.max(0, supplier.paidAmount - excess)
        }
        
        // Recalculate pending amount to be absolutely sure
        supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)
        await supplier.save()
      }
    }

    res.json({ success: true, message: 'Product returned to supplier successfully', data: product })
  } catch (err) {
    next(err)
  }
})

// 6. PUT /:id - Update supplier details
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, type, shopName, phone, status } = req.body

    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'Supplier name and type are required' })
    }

    const supplier = await Supplier.findById(id)
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' })
    }

    supplier.name = name
    supplier.type = type
    supplier.shopName = shopName || ''
    supplier.phone = phone || ''
    supplier.status = status || 'active'
    
    // Recalculate pending amount in case
    supplier.pendingAmount = Math.max(0, supplier.totalAmount - supplier.paidAmount)

    await supplier.save()
    res.json({ success: true, message: 'Supplier details updated successfully', data: supplier })
  } catch (err) {
    next(err)
  }
})

// 7. DELETE /:id - Delete supplier and unlink products
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const supplier = await Supplier.findByIdAndDelete(id)
    
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' })
    }

    // Unlink products
    await Product.updateMany({ supplierId: id }, { $set: { supplierId: null, supplierType: null } })

    res.json({ success: true, message: 'Supplier deleted successfully' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
