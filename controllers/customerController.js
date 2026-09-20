const Customer = require('../models/Customer')

const list = async (req, res) => {
  const customers = await Customer.find().sort({ createdAt: -1 })
  res.json({ success: true, message: 'Customers loaded', data: customers })
}

const getOne = async (req, res) => {
  const customer = await Customer.findById(req.params.id)
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found', errors: {} })
  res.json({ success: true, message: 'Customer loaded', data: customer })
}

const create = async (req, res) => {
  const { customerName, phone } = req.body
  if (!customerName || !phone) return res.status(422).json({ success: false, message: 'Customer name and phone are required', errors: {} })
  const customer = await Customer.create(req.body)
  res.status(201).json({ success: true, message: 'Customer created', data: customer })
}

const update = async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found', errors: {} })
  res.json({ success: true, message: 'Customer updated', data: customer })
}

const remove = async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id)
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found', errors: {} })
  res.json({ success: true, message: 'Customer deleted', data: {} })
}

module.exports = { list, getOne, create, update, remove }
