const express = require('express')
const { login, profile, register, getAgents, getUsers, updateUser, resetPassword, deleteUser } = require('../controllers/authController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')

const router = express.Router()

// Login brute-force rate limiter (15 attempts per IP per 15 mins)
const loginAttempts = new Map()

const loginRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown_ip'
  const now = Date.now()
  const windowMs = 15 * 60 * 1000 // 15 minutes window
  const maxAttempts = 15

  const userAttempts = (loginAttempts.get(ip) || []).filter(timestamp => now - timestamp < windowMs)

  if (userAttempts.length >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again after 15 minutes.',
      errors: {}
    })
  }

  userAttempts.push(now)
  loginAttempts.set(ip, userAttempts)
  next()
}

router.post('/login', loginRateLimiter, asyncHandler(login))
router.get('/profile', requireAuth, asyncHandler(profile))
router.post('/register', requireAuth, requireAdmin, asyncHandler(register))
router.get('/agents', requireAuth, requireAdmin, asyncHandler(getAgents))
router.get('/users', requireAuth, requireAdmin, asyncHandler(getUsers))
router.put('/users/:id/password', requireAuth, requireAdmin, asyncHandler(resetPassword))
router.put('/users/:id', requireAuth, requireAdmin, asyncHandler(updateUser))
router.delete('/users/:id', requireAuth, requireAdmin, asyncHandler(deleteUser))

module.exports = router
