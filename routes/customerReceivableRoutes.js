const express = require('express')
const controller = require('../controllers/customerReceivableController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.get('/', asyncHandler(controller.getAllReceivables))
router.get('/summary', asyncHandler(controller.getReceivableSummary))
router.get('/:id', asyncHandler(controller.getReceivableById))
router.get('/:id/payments', asyncHandler(controller.getPaymentsByReceivableId))
router.post('/', asyncHandler(controller.createReceivable))
router.post('/:id/give', asyncHandler(controller.giveMoney))
router.post('/:id/receive', asyncHandler(controller.receiveMoney))
router.put('/:id', asyncHandler(controller.updateReceivable))
router.patch('/:id/cancel', asyncHandler(controller.cancelReceivable))
router.delete('/:id', asyncHandler(controller.deleteReceivable))

module.exports = router
