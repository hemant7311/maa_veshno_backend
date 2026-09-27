const mongoose = require('mongoose')

const sliderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: '' },
    mediaUrl: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true, default: '' },
    videoUrl: { type: String, trim: true, default: '' },
    videoThumbnail: { type: String, trim: true, default: '' },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    targetAudience: { type: String, enum: ['retailer', 'wholesaler', 'both'], default: 'both' },
    buttonText: { type: String, trim: true, default: '' },
    buttonLink: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Slider', sliderSchema)
