const express = require('express')
const { summary } = require('../controllers/dashboardController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)
router.get('/', asyncHandler(summary))

module.exports = router
