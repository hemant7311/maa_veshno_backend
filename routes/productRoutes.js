const express = require('express')
const controller = require('../controllers/productController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')
const { requirePermission } = require('../middleware/authorize')

const router = express.Router()

// Public route
router.get('/public', asyncHandler(controller.list))

router.use(requireAuth, requirePermission('products'))
router.get('/', asyncHandler(controller.list))
router.get('/search', asyncHandler(controller.list))
router.get('/:id', asyncHandler(controller.getOne))
router.post('/', asyncHandler(controller.create))
router.put('/:id', asyncHandler(controller.update))
router.patch('/:id', asyncHandler(controller.update))
router.delete('/:id', asyncHandler(controller.remove))

module.exports = router
