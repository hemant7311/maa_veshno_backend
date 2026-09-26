const Slider = require('../models/Slider')
const path = require('path')
const fs = require('fs')

const deletePhysicalFile = (mediaUrl) => {
  if (!mediaUrl || !mediaUrl.startsWith('/uploads/sliders/')) return
  try {
    const filename = path.basename(mediaUrl)
    const filePath = path.join(__dirname, '..', 'uploads', 'sliders', filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (err) {
    console.warn('Failed to delete physical slider file:', err.message)
  }
}

exports.list = async (req, res) => {
  try {
    const sliders = await Slider.find({ isActive: true }).sort('order createdAt')
    res.json({ success: true, data: sliders })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list sliders', errors: { error: err.message } })
  }
}

exports.listAdmin = async (req, res) => {
  try {
    const sliders = await Slider.find().sort('order createdAt')
    res.json({ success: true, data: sliders })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list admin sliders', errors: { error: err.message } })
  }
}

exports.create = async (req, res) => {
  try {
    let { title, subtitle, mediaUrl, mediaType, isActive, order } = req.body

    // Handle file upload if present via multer
    if (req.file) {
      mediaUrl = `/uploads/sliders/${req.file.filename}`
      const ext = path.extname(req.file.filename).toLowerCase()
      if (['.mp4', '.webm', '.ogg'].includes(ext)) {
        mediaType = 'video'
      } else {
        mediaType = 'image'
      }
    }

    if (!title || !mediaUrl) {
      return res.status(422).json({ success: false, message: 'Title and media file/URL are required', errors: {} })
    }

    const slider = await Slider.create({
      title,
      subtitle: subtitle || '',
      mediaUrl,
      mediaType: mediaType || 'image',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: Number(order) || 0
    })

    res.status(201).json({ success: true, message: 'Slider created successfully', data: slider })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create slider', errors: { error: err.message } })
  }
}

exports.update = async (req, res) => {
  try {
    const oldSlider = await Slider.findById(req.params.id)
    if (!oldSlider) return res.status(404).json({ success: false, message: 'Slider not found', errors: {} })

    let { title, subtitle, mediaUrl, mediaType, isActive, order } = req.body

    if (req.file) {
      const newMediaUrl = `/uploads/sliders/${req.file.filename}`
      if (oldSlider.mediaUrl && oldSlider.mediaUrl !== newMediaUrl) {
        deletePhysicalFile(oldSlider.mediaUrl)
      }
      mediaUrl = newMediaUrl
      const ext = path.extname(req.file.filename).toLowerCase()
      if (['.mp4', '.webm', '.ogg'].includes(ext)) {
        mediaType = 'video'
      } else {
        mediaType = 'image'
      }
    } else if (mediaUrl && oldSlider.mediaUrl && oldSlider.mediaUrl !== mediaUrl) {
      deletePhysicalFile(oldSlider.mediaUrl)
    }

    const updatedSlider = await Slider.findByIdAndUpdate(
      req.params.id,
      {
        ...(title !== undefined && { title }),
        ...(subtitle !== undefined && { subtitle }),
        ...(mediaUrl !== undefined && { mediaUrl }),
        ...(mediaType !== undefined && { mediaType }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(order !== undefined && { order: Number(order) })
      },
      { new: true, runValidators: true }
    )

    res.json({ success: true, message: 'Slider updated successfully', data: updatedSlider })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update slider', errors: { error: err.message } })
  }
}

exports.remove = async (req, res) => {
  try {
    const slider = await Slider.findById(req.params.id)
    if (!slider) return res.status(404).json({ success: false, message: 'Slider not found', errors: {} })

    if (slider.mediaUrl) {
      deletePhysicalFile(slider.mediaUrl)
    }

    await Slider.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Slider deleted successfully', data: {} })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete slider', errors: { error: err.message } })
  }
}
