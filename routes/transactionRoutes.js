const express = require('express')
const controller = require('../controllers/transactionController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')
const { requirePermission } = require('../middleware/authorize')

const router = express.Router()
router.use(requireAuth)
router.use(requirePermission('transactions'))

router.get('/', asyncHandler(controller.list))
router.get('/summary', asyncHandler(controller.getSummary))

module.exports = router
