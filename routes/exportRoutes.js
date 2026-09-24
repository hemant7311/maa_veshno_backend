const express = require('express')
const controller = require('../controllers/exportController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()
router.use(requireAuth, requireAdmin)

router.get('/products', asyncHandler(controller.exportProducts))
router.get('/customers', asyncHandler(controller.exportCustomers))
router.get('/suppliers', asyncHandler(controller.exportSuppliers))
router.get('/sales', asyncHandler(controller.exportSales))
router.get('/purchases', asyncHandler(controller.exportPurchases))
router.get('/stock', asyncHandler(controller.exportStock))
router.get('/finance', asyncHandler(controller.exportFinance))
router.get('/emi', asyncHandler(controller.exportEmi))
router.get('/loans', asyncHandler(controller.exportLoans))
router.get('/customer-receivables', asyncHandler(controller.exportCustomerReceivables))
router.get('/company-returns', asyncHandler(controller.exportCompanyReturns))
router.get('/company-returns/mobile', asyncHandler(controller.exportCompanyReturnsByMobile))
router.get('/full-backup', asyncHandler(controller.fullBackup))

module.exports = router
