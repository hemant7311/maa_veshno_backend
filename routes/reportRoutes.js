const express = require('express')
const controller = require('../controllers/reportController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.get('/', asyncHandler(controller.getAllReports))
router.get('/sales', asyncHandler(controller.getSalesReport))
router.get('/purchases', asyncHandler(controller.getPurchaseReport))
router.get('/stock', asyncHandler(controller.getStockReport))
router.get('/customers', asyncHandler(controller.getCustomerReport))
router.get('/suppliers', asyncHandler(controller.getSupplierReport))
router.get('/finance', asyncHandler(controller.getFinanceReport))
router.get('/emi', asyncHandler(controller.getEmiReport))
router.get('/wholesale', asyncHandler(controller.getWholesaleReport))
router.get('/profit-loss', asyncHandler(controller.getProfitLossReport))
router.get('/gst', asyncHandler(controller.getGstReport))
router.get('/company-returns', asyncHandler(controller.getCompanyReturnsReport))
router.get('/loans', asyncHandler(controller.getLoansReport))
router.get('/customer-receivables', asyncHandler(controller.getCustomerReceivablesReport))

module.exports = router
