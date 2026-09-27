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

// Public list for storefronts with audience filtering
exports.list = async (req, res) => {
  try {
    const { audience } = req.query
    const filter = { isActive: true }

    if (audience === 'retailer') {
      filter.$or = [
        { targetAudience: 'retailer' },
        { targetAudience: 'both' },
        { targetAudience: { $exists: false } },
        { targetAudience: null }
      ]
    } else if (audience === 'wholesaler') {
      filter.$or = [
        { targetAudience: 'wholesaler' },
        { targetAudience: 'both' },
        { targetAudience: { $exists: false } },
        { targetAudience: null }
      ]
    }

    const sliders = await Slider.find(filter).sort('order createdAt')
    res.json({ success: true, data: sliders })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list sliders', errors: { error: err.message } })
  }
}

// Admin list for management table
exports.listAdmin = async (req, res) => {
  try {
    const sliders = await Slider.find().sort('order createdAt')
    res.json({ success: true, data: sliders })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list admin sliders', errors: { error: err.message } })
  }
}

// Get single slider
exports.getById = async (req, res) => {
  try {
    const slider = await Slider.findById(req.params.id)
    if (!slider) return res.status(404).json({ success: false, message: 'Slider not found', errors: {} })
    res.json({ success: true, data: slider })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get slider', errors: { error: err.message } })
  }
}

// Create slide
exports.create = async (req, res) => {
  try {
    let {
      title,
      subtitle,
      mediaUrl,
      mediaType,
      targetAudience,
      buttonText,
      buttonLink,
      isActive,
      order
    } = req.body

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
      title: title.trim(),
      subtitle: (subtitle || '').trim(),
      mediaUrl,
      imageUrl: mediaType === 'image' ? mediaUrl : '',
      videoUrl: mediaType === 'video' ? mediaUrl : '',
      mediaType: mediaType || 'image',
      targetAudience: ['retailer', 'wholesaler', 'both'].includes(targetAudience) ? targetAudience : 'both',
      buttonText: (buttonText || '').trim(),
      buttonLink: (buttonLink || '').trim(),
      isActive: isActive !== undefined ? Boolean(isActive === 'true' || isActive === true) : true,
      order: Number(order) || 0
    })

    res.status(201).json({ success: true, message: 'Slider created successfully', data: slider })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create slider', errors: { error: err.message } })
  }
}

// Update slide
exports.update = async (req, res) => {
  try {
    const oldSlider = await Slider.findById(req.params.id)
    if (!oldSlider) return res.status(404).json({ success: false, message: 'Slider not found', errors: {} })

    let {
      title,
      subtitle,
      mediaUrl,
      mediaType,
      targetAudience,
      buttonText,
      buttonLink,
      isActive,
      order
    } = req.body

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

    const updateFields = {}
    if (title !== undefined) updateFields.title = title.trim()
    if (subtitle !== undefined) updateFields.subtitle = subtitle.trim()
    if (mediaUrl !== undefined) {
      updateFields.mediaUrl = mediaUrl
      if (mediaType === 'image') updateFields.imageUrl = mediaUrl
      if (mediaType === 'video') updateFields.videoUrl = mediaUrl
    }
    if (mediaType !== undefined) updateFields.mediaType = mediaType
    if (targetAudience !== undefined && ['retailer', 'wholesaler', 'both'].includes(targetAudience)) {
      updateFields.targetAudience = targetAudience
    }
    if (buttonText !== undefined) updateFields.buttonText = buttonText.trim()
    if (buttonLink !== undefined) updateFields.buttonLink = buttonLink.trim()
    if (isActive !== undefined) updateFields.isActive = Boolean(isActive === 'true' || isActive === true)
    if (order !== undefined) updateFields.order = Number(order)

    const updatedSlider = await Slider.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    )

    res.json({ success: true, message: 'Slider updated successfully', data: updatedSlider })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update slider', errors: { error: err.message } })
  }
}

// Delete slide
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
