const jwt = require('jsonwebtoken')
const User = require('../models/User')

const requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) return res.status(401).json({ success: false, message: 'Authentication token is required', errors: {} })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.userId)
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'User is not authorized', errors: {} })
    }
    req.user = user
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token', errors: {} })
  }
}

module.exports = requireAuth
