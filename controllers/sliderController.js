const Slider = require('../models/Slider');

exports.list = async (req, res) => {
  const sliders = await Slider.find({ isActive: true }).sort('order createdAt');
  res.json({ success: true, data: sliders });
};

exports.listAdmin = async (req, res) => {
  const sliders = await Slider.find().sort('order createdAt');
  res.json({ success: true, data: sliders });
};

exports.create = async (req, res) => {
  const slider = await Slider.create(req.body);
  res.json({ success: true, data: slider });
};

exports.update = async (req, res) => {
  const slider = await Slider.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: slider });
};

exports.remove = async (req, res) => {
  await Slider.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};
