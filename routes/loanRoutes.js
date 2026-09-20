const express = require('express')
const controller = require('../controllers/loanController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)

router.get('/', asyncHandler(controller.getAllLoans))
router.get('/summary', asyncHandler(controller.getLoanSummary))
router.get('/:id', asyncHandler(controller.getLoanById))
router.get('/:id/payments', asyncHandler(controller.getPaymentsByLoanId))
router.post('/', asyncHandler(controller.createLoan))
router.post('/:id/payments', asyncHandler(controller.addPayment))
router.put('/:id', asyncHandler(controller.updateLoan))
router.patch('/:id/cancel', asyncHandler(controller.cancelLoan))
router.delete('/:id', asyncHandler(controller.deleteLoan))
router.delete('/:id/payments/:paymentId', asyncHandler(controller.removePayment))

module.exports = router
