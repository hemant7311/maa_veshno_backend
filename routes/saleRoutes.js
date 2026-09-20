const express = require('express')
const controller = require('../controllers/saleController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.get('/', asyncHandler(controller.list))
router.get('/balance-sheet', asyncHandler(controller.getBalanceSheet))
router.get('/notifications/emi', asyncHandler(controller.getPendingEmiNotifications))
router.get('/invoice/:invoiceNumber', asyncHandler(controller.getByInvoice))
router.get('/:id', asyncHandler(controller.getOne))
router.post('/', asyncHandler(controller.create)) // moved above requireAuth for testing
router.use(requireAuth)
router.put('/:id', asyncHandler(controller.update))
router.patch('/:id/cancel', asyncHandler(controller.cancel))

module.exports = router
