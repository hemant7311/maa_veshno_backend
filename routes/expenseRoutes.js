const express = require('express')
const controller = require('../controllers/expenseController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.get('/', asyncHandler(controller.getAllExpenses))
router.get('/summary', asyncHandler(controller.getExpenseSummary))
router.get('/by-category', asyncHandler(controller.getExpensesByCategory))
router.get('/:id', asyncHandler(controller.getExpenseById))
router.post('/', asyncHandler(controller.createExpense))
router.put('/:id', asyncHandler(controller.updateExpense))
router.delete('/:id', asyncHandler(controller.deleteExpense))

module.exports = router
