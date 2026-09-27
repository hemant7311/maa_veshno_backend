const express = require('express')
const controller = require('../controllers/saleController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')
const { requirePermission } = require('../middleware/authorize')

const router = express.Router()

// All sale routes require authentication
router.use(requireAuth)

// Public invoice preview for printed link/QR
router.get('/invoice/:invoiceNumber', asyncHandler(controller.getByInvoice))

// Balance sheet requires finance permission
router.get('/balance-sheet', requirePermission('finance'), asyncHandler(controller.getBalanceSheet))

// Billing management routes require billing permission
router.get('/', requirePermission('billing'), asyncHandler(controller.list))
router.get('/notifications/emi', requirePermission('billing'), asyncHandler(controller.getPendingEmiNotifications))
router.get('/:id', requirePermission('billing'), asyncHandler(controller.getOne))
router.post('/', requirePermission('billing'), asyncHandler(controller.create))
router.put('/:id', requirePermission('billing'), asyncHandler(controller.update))
router.post('/:id/bill-image', requirePermission('billing'), asyncHandler(controller.saveBillImage))
router.patch('/:id/convert', requirePermission('billing'), asyncHandler(controller.convertDraft))
router.patch('/:id/cancel', requirePermission('billing'), asyncHandler(controller.cancel))
router.delete('/:id', requirePermission('billing'), asyncHandler(controller.deleteDraft))
router.post('/:id/installment', requirePermission('billing'), asyncHandler(controller.payInstallment))
router.patch('/:id', requirePermission('billing'), asyncHandler(controller.receivePayment))

module.exports = router
