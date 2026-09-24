const express = require('express')
const { summary } = require('../controllers/dashboardController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()
router.use(requireAuth, requireAdmin)
router.get('/', asyncHandler(summary))

module.exports = router
