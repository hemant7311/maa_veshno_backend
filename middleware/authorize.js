const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access is required', errors: {} })
  }
  next()
}

const requirePermission = (moduleName) => {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next()
    if (req.user?.permissions && req.user.permissions.includes(moduleName)) return next()
    return res.status(403).json({ success: false, message: `Access denied to ${moduleName}`, errors: {} })
  }
}

module.exports = { requireAdmin, requirePermission }
