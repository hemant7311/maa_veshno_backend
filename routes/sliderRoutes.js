const express = require('express');
const controller = require('../controllers/sliderController');
const asyncHandler = require('../middleware/asyncHandler');
const requireAuth = require('../middleware/auth');

const { requireAdmin } = require('../middleware/authorize');

const router = express.Router();

// Publicly accessible for the storefront (or accessible by authenticated wholesalers)
router.get('/', asyncHandler(controller.list));

// Admin only
router.use(requireAuth, requireAdmin);
router.get('/admin', asyncHandler(controller.listAdmin));
router.post('/', asyncHandler(controller.create));
router.put('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

module.exports = router;
