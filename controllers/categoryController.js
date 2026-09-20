const Category = require('../models/Category')
const Product = require('../models/Product')
const Imei = require('../models/Imei')

const list = async (req, res) => {
  const categories = await Category.find().sort({ categoryName: 1 })
  const products = await Product.find({ status: 'active' }).select('categoryId')
  const productIdsByCategory = new Map()
  for (const product of products) {
    const key = String(product.categoryId)
    productIdsByCategory.set(key, [...(productIdsByCategory.get(key) || []), product._id])
  }
  const allProductIds = products.map((product) => product._id)
  const stockCounts = allProductIds.length ? await Imei.aggregate([
    { $match: { productId: { $in: allProductIds }, status: 'available' } },
    { $group: { _id: '$productId', stock: { $sum: 1 } } },
  ]) : []
  const stockByProductId = new Map(stockCounts.map((item) => [String(item._id), item.stock]))
  const data = categories.map((category) => {
    const categoryProductIds = productIdsByCategory.get(String(category._id)) || []
    return {
      ...category.toObject(),
      productCount: categoryProductIds.length,
      stock: categoryProductIds.reduce((sum, productId) => sum + (stockByProductId.get(String(productId)) || 0), 0),
    }
  })
  res.json({ success: true, message: 'Categories loaded', data })
}

const getOne = async (req, res) => {
  const category = await Category.findById(req.params.id)
  if (!category) return res.status(404).json({ success: false, message: 'Category not found', errors: {} })
  res.json({ success: true, message: 'Category loaded', data: category })
}

const create = async (req, res) => {
  const { categoryName, description, status } = req.body
  if (!categoryName) return res.status(422).json({ success: false, message: 'Category name is required', errors: {} })
  
  const trimmedName = categoryName.trim()
  const existing = await Category.findOne({ categoryName: { $regex: new RegExp(`^${trimmedName}$`, 'i') } })
  if (existing) {
    return res.status(409).json({ success: false, message: 'Category name already exists', errors: {} })
  }

  const category = await Category.create({ categoryName: trimmedName, description, status })
  res.status(201).json({ success: true, message: 'Category created', data: category })
}

const update = async (req, res) => {
  if (req.body.categoryName) {
    const trimmedName = req.body.categoryName.trim()
    const existing = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      _id: { $ne: req.params.id }
    })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Category name already exists', errors: {} })
    }
    req.body.categoryName = trimmedName
  }

  const category = await Category.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!category) return res.status(404).json({ success: false, message: 'Category not found', errors: {} })
  res.json({ success: true, message: 'Category updated', data: category })
}

const remove = async (req, res) => {
  const productsCount = await Product.countDocuments({ categoryId: req.params.id, status: { $ne: 'returned' } })
  if (productsCount > 0) {
    return res.status(400).json({ success: false, message: 'Cannot delete category because it contains active products', errors: {} })
  }

  const category = await Category.findByIdAndDelete(req.params.id)
  if (!category) return res.status(404).json({ success: false, message: 'Category not found', errors: {} })
  res.json({ success: true, message: 'Category deleted', data: {} })
}

module.exports = { list, getOne, create, update, remove }
