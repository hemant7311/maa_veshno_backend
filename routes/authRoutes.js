const express = require('express')
const { login, profile, register, getAgents, getUsers, updateUser, deleteUser } = require('../controllers/authController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()
router.post('/login', asyncHandler(login))
router.get('/profile', requireAuth, asyncHandler(profile))
router.post('/register', requireAuth, requireAdmin, asyncHandler(register))
router.get('/agents', requireAuth, requireAdmin, asyncHandler(getAgents))
router.get('/users', requireAuth, requireAdmin, asyncHandler(getUsers))
router.put('/users/:id', requireAuth, requireAdmin, asyncHandler(updateUser))
router.delete('/users/:id', requireAuth, requireAdmin, asyncHandler(deleteUser))

module.exports = router
