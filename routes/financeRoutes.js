const express = require('express')
const { createFinanceRecord, getFinanceSummary, getFinanceByEntity, getMyFinanceRecords, updateEmiStatus, deleteFinanceEntity, updateFinanceEntity, getCustomerFinanceDetails } = require('../controllers/financeController')
const asyncHandler = require('../middleware/asyncHandler')
const { requireAdmin } = require('../middleware/authorize')
const requireAuth = require('../middleware/auth')

const router = express.Router()

// Public Route (No Auth required for customer QR scanning)
router.get('/customer/:mobileNumber', asyncHandler(getCustomerFinanceDetails))

// Protected Routes
router.use(requireAuth)

router.post('/', asyncHandler(createFinanceRecord))
router.get('/summary', asyncHandler(getFinanceSummary))
router.get('/my-records', asyncHandler(getMyFinanceRecords))
router.get('/:entityName', asyncHandler(getFinanceByEntity))
router.put('/:recordId/emi/:emiId', asyncHandler(updateEmiStatus))
router.delete('/entity/:entityName', requireAdmin, asyncHandler(deleteFinanceEntity))
router.put('/entity/:entityName', requireAdmin, asyncHandler(updateFinanceEntity))

module.exports = router
