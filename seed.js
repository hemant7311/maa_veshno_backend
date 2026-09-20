const bcrypt = require('bcryptjs')
const connectDatabase = require('./config/database')
const mongoose = require('mongoose')
const User = require('./models/User')
const Category = require('./models/Category')
const Product = require('./models/Product')
const Customer = require('./models/Customer')

const seed = async () => {
  await connectDatabase()

  // Create default admin user
  const admin = {
    username: 'admin',
    name: 'Maa Veshno Admin',
    email: 'admin@maaveshno.local',
    role: 'admin',
    status: 'active',
  }
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  const userExists = await User.exists({ username: admin.username })
  if (!userExists) {
    const hashedPassword = await bcrypt.hash(password, 12)
    await User.create({ ...admin, password: hashedPassword, initialPassword: password })
    console.log('✅ Admin user created (username: admin, password: ' + password + ')')
  }

  const categoryDefinitions = [
    { categoryName: 'Vivo', description: 'Vivo mobile phones' },
    { categoryName: 'Samsung', description: 'Samsung mobile phones' },
    { categoryName: 'Xiaomi', description: 'Xiaomi mobile phones' },
    { categoryName: 'Accessories', description: 'Mobile accessories' },
  ]

  for (const cat of categoryDefinitions) {
    await Category.updateOne({ categoryName: cat.categoryName }, { $setOnInsert: cat }, { upsert: true })
  }

  const categories = await Category.find({ categoryName: { $in: categoryDefinitions.map((cat) => cat.categoryName) } })
  const categoryId = Object.fromEntries(categories.map((cat) => [cat.categoryName, cat._id]))
  const products = [
    { categoryId: categoryId.Vivo, productName: 'Vivo Y28', brand: 'Vivo', model: 'Y28', variant: '8GB / 128GB', color: 'Crystal Purple', barcode: '890100000001', purchasePrice: 12200, salePrice: 13999, gst: 18, stock: 18, minStock: 5 },
    { categoryId: categoryId.Samsung, productName: 'Samsung Galaxy M14', brand: 'Samsung', model: 'M14', variant: '4GB / 64GB', color: 'Smoky Teal', barcode: '890100000002', purchasePrice: 10900, salePrice: 12499, gst: 18, stock: 8, minStock: 10 },
    { categoryId: categoryId.Xiaomi, productName: 'Redmi 13C', brand: 'Xiaomi', model: 'Redmi 13C', variant: '4GB / 128GB', color: 'Stardust Black', barcode: '890100000003', purchasePrice: 8200, salePrice: 9499, gst: 18, stock: 24, minStock: 6 },
    { categoryId: categoryId.Accessories, productName: 'boAt Airdopes 141', brand: 'boAt', model: 'Airdopes 141', variant: 'Wireless Earbuds', color: 'Black', barcode: '890100000004', purchasePrice: 850, salePrice: 1299, gst: 18, stock: 35, minStock: 12 },
  ]

  for (const product of products) {
    await Product.updateOne({ barcode: product.barcode }, { $setOnInsert: product }, { upsert: true })
  }

  const customers = [
    { customerName: 'Rohit Sharma', phone: '9876543210', email: 'rohit@example.com', address: 'Jabalpur, Madhya Pradesh', balance: 0 },
    { customerName: 'Priya Verma', phone: '9876543211', email: 'priya@example.com', address: 'Katni, Madhya Pradesh', balance: 1250 },
    { customerName: 'Aman Gupta', phone: '9876543212', email: 'aman@example.com', address: 'Satna, Madhya Pradesh', balance: 0 },
  ]

  for (const customer of customers) {
    await Customer.updateOne({ phone: customer.phone }, { $setOnInsert: customer }, { upsert: true })
  }

  console.log('Seed data inserted successfully.')
  console.log('Login: admin@maaveshno.com / Admin@123')
  process.exit(0)
}

seed().catch((error) => {
  console.error('Seed failed:', error.message)
  process.exit(1)
})
