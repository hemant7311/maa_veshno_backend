const mongoose = require('mongoose');

const sliderSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['video', 'image'], default: 'image' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Slider', sliderSchema);
