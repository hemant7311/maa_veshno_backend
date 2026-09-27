const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const controller = require('../controllers/sliderController')
const asyncHandler = require('../middleware/asyncHandler')
const requireAuth = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')

// Ensure uploads/sliders directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'sliders')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, 'slider-' + uniqueSuffix + ext)
  }
})

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/ogg']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only image (jpg, png, webp, gif) and video (mp4, webm) files are allowed'))
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max limit
})

const router = express.Router()

// Publicly accessible for the storefront
router.get('/', asyncHandler(controller.list))

// Admin routes
router.use(requireAuth, requireAdmin)
router.get('/admin', asyncHandler(controller.listAdmin))
router.get('/:id', asyncHandler(controller.getById))
router.post('/', upload.single('mediaFile'), asyncHandler(controller.create))
router.put('/:id', upload.single('mediaFile'), asyncHandler(controller.update))
router.delete('/:id', asyncHandler(controller.remove))

module.exports = router
