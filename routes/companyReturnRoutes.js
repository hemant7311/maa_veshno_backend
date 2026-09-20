const express = require('express')
const controller = require('../controllers/companyReturnController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.get('/', asyncHandler(controller.getAllReturns))
router.get('/export', asyncHandler(controller.exportReturns))
router.get('/export/mobile', asyncHandler(controller.exportMobileReturns))
router.get('/supplier/:supplierId', asyncHandler(controller.getReturnsBySupplier))
router.get('/:id', asyncHandler(controller.getReturnById))
router.post('/', asyncHandler(controller.createReturn))
router.delete('/:id', asyncHandler(controller.deleteReturn))

module.exports = router
