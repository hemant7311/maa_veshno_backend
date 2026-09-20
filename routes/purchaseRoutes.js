const express = require('express')
const controller = require('../controllers/purchaseController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.get('/', asyncHandler(controller.getAllPurchases))
router.get('/summary', asyncHandler(controller.getPurchaseSummary))
router.get('/:id', asyncHandler(controller.getPurchaseById))
router.post('/', asyncHandler(controller.createPurchase))
router.put('/:id', asyncHandler(controller.updatePurchase))
router.patch('/:id/cancel', asyncHandler(controller.cancelPurchase))
router.delete('/:id', asyncHandler(controller.deletePurchase))

module.exports = router
