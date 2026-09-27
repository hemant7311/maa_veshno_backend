const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin authorization is required', errors: {} })
  }
  next()
}

const requirePermission = (moduleName) => {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next()
    if (req.user?.role === 'staff' && Array.isArray(req.user.permissions) && req.user.permissions.includes(moduleName)) {
      return next()
    }
    return res.status(403).json({ success: false, message: `Access denied: Permission '${moduleName}' is required`, errors: {} })
  }
}

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next()
    if (Array.isArray(allowedRoles) && allowedRoles.includes(req.user?.role)) {
      return next()
    }
    return res.status(403).json({ success: false, message: 'Access denied: Role unauthorized', errors: {} })
  }
}

const requireStrictRole = (allowedRoles) => {
  return (req, res, next) => {
    if (Array.isArray(allowedRoles) && allowedRoles.includes(req.user?.role)) {
      return next()
    }
    return res.status(403).json({ success: false, message: 'Access denied: Role unauthorized', errors: {} })
  }
}

module.exports = {
  requireAdmin,
  requirePermission,
  requireRole,
  requireStrictRole
}
