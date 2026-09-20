const express = require('express')
const controller = require('../controllers/imeiController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth)
router.get('/', asyncHandler(controller.list))
router.post('/', asyncHandler(controller.create))
router.put('/:id', asyncHandler(controller.update))
router.patch('/:id', asyncHandler(controller.update))
router.delete('/:id', asyncHandler(controller.remove))

module.exports = router
