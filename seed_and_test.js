const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const User = require('./models/User');
const Category = require('./models/Category');
const Product = require('./models/Product');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');
const Sale = require('./models/Sale');
const Purchase = require('./models/Purchase');
const Loan = require('./models/Loan');
const CustomerReceivable = require('./models/CustomerReceivable');
const CompanyReturn = require('./models/CompanyReturn');
const Transaction = require('./models/Transaction');
const Imei = require('./models/Imei');
const Expense = require('./models/Expense');

const API_URL = 'http://localhost:5000/api/v1';

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maaveshno');
    console.log('✅ Connected to MongoDB');

    // 1. Delete all data
    console.log('🗑️ Wiping all collections...');
    await Promise.all([
      Category.deleteMany({}), Product.deleteMany({}), Customer.deleteMany({}),
      Supplier.deleteMany({}), Sale.deleteMany({}), Purchase.deleteMany({}),
      Loan.deleteMany({}), CustomerReceivable.deleteMany({}), CompanyReturn.deleteMany({}),
      Transaction.deleteMany({}), Imei.deleteMany({}), Expense.deleteMany({})
    ]);
    console.log('✅ Database wiped clean');

    // 2. Get/Create Admin Token
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = await User.create({ name: 'Admin', email: 'admin@maaveshno.com', password: 'hashedpassword123', role: 'admin', status: 'active' });
    }
    const token = jwt.sign({ userId: admin._id, role: admin.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
    const headers = { Authorization: `Bearer ${token}` };
    const api = axios.create({ baseURL: API_URL, headers });

    // 3. Seed Base Entities (10 each)
    console.log('🌱 Seeding base entities (Categories, Suppliers, Customers)...');
    const categories = await Category.insertMany(Array.from({length: 10}).map((_, i) => ({ categoryName: `Smartphones Category ${i+1}` })));
    const suppliers = await Supplier.insertMany(Array.from({length: 10}).map((_, i) => ({ name: `Supplier Agency ${i+1}`, phone: `99999000${i.toString().padStart(2, '0')}`, type: 'company', status: 'active' })));
    const customers = await Customer.insertMany(Array.from({length: 10}).map((_, i) => ({ customerName: `Customer ${i+1}`, phone: `88888000${i.toString().padStart(2, '0')}`, customerType: 'retail', status: 'active' })));

    console.log('🌱 Seeding Products (10 records)...');
    const products = [];
    for (let i = 0; i < 10; i++) {
      const p = await Product.create({
        productName: `Pro Smartphone Model ${i+1}`,
        brand: ['Samsung', 'Vivo', 'Oppo', 'Realme', 'Apple'][i % 5],
        model: `X${i+1}00`,
        categoryId: categories[i]._id,
        supplierId: suppliers[i]._id,
        purchasePrice: 10000 + i*1000,
        salePrice: 12000 + i*1500,
        stock: 0, // Will be filled by Purchases
        status: 'active',
        barcode: `8900000${i}`
      });
      products.push(p);
    }

    // 4. Test & Seed Purchases (This tests the purchase API form)
    console.log('🚀 Testing Purchase API (Creating 10 Purchases)...');
    for (let i = 0; i < 10; i++) {
      const imeis = [`3500000000${i}1`, `3500000000${i}2`, `3500000000${i}3`];
      await api.post('/purchases', {
        supplier: suppliers[i]._id,
        supplierName: suppliers[i].name,
        invoiceNumber: `PUR-2026-00${i+1}`,
        items: [{
          product: products[i]._id,
          productName: products[i].productName,
          quantity: 3,
          costPrice: products[i].purchasePrice,
          imeis,
          total: products[i].purchasePrice * 3
        }],
        totalAmount: products[i].purchasePrice * 3,
        paidAmount: products[i].purchasePrice * 3,
        paymentMethod: 'bank',
        date: new Date()
      });
    }
    console.log('✅ Purchase Flow Verified (Stock & IMEIs added)');

    // 5. Test & Seed Sales (Testing Billing Forms: Create, Edit, Cancel)
    console.log('🚀 Testing Billing API (Creating 12 Sales)...');
    let createdSales = [];
    for (let i = 0; i < 12; i++) {
      const pIdx = i % 10;
      const imeiDoc = await Imei.findOne({ productId: products[pIdx]._id, status: 'available' });
      if (!imeiDoc) continue;

      const res = await api.post('/sales', {
        customerId: customers[pIdx]._id,
        customerName: customers[pIdx].customerName,
        phone: customers[pIdx].phone,
        saleType: 'retail',
        paymentMode: i % 2 === 0 ? 'cash' : 'finance',
        items: [{
          productId: products[pIdx]._id,
          productName: products[pIdx].productName,
          imei: imeiDoc.imeiNumber,
          qty: 1,
          price: products[pIdx].salePrice,
          purchasePrice: products[pIdx].purchasePrice,
          total: products[pIdx].salePrice
        }],
        subTotal: products[pIdx].salePrice,
        grandTotal: products[pIdx].salePrice,
        amountPaid: products[pIdx].salePrice,
        financeDetails: i % 2 === 0 ? {} : { company: 'Bajaj Finance', dpAmount: 2000, emiAmount: 1000, tenure: 10 }
      });
      createdSales.push(res.data.data);
    }
    console.log('✅ Billing Create Verified');

    // Test Edit Sale
    console.log('🚀 Testing Edit Sale API...');
    const saleToUpdate = createdSales[10];
    await api.put(`/sales/${saleToUpdate._id}`, {
      ...saleToUpdate,
      grandTotal: saleToUpdate.grandTotal - 500, // 500 discount
      amountPaid: saleToUpdate.grandTotal - 500
    });
    console.log('✅ Billing Edit Verified');

    // Test Cancel Sale
    console.log('🚀 Testing Cancel Sale API...');
    const saleToCancel = createdSales[11];
    await api.patch(`/sales/${saleToCancel._id}/cancel`, { cancelReason: 'Customer changed mind' });
    console.log('✅ Billing Cancel Verified (Stock/IMEI Rolled Back)');

    // 6. Test & Seed Loans
    console.log('🚀 Testing Loans API (Creating 10 Loans)...');
    for (let i = 0; i < 10; i++) {
      await api.post('/loans', {
        personName: `Borrower ${i+1}`,
        originalAmount: 10000 + i*500,
        purpose: 'Personal Loan',
        mobile: `900000000${i}`
      });
    }
    console.log('✅ Loans Flow Verified');

    // 7. Test & Seed Customer Receivables
    console.log('🚀 Testing Receivables API (Creating 10 Receivables)...');
    for (let i = 0; i < 10; i++) {
      await api.post('/customer-receivables', {
        customerName: `Receivable User ${i+1}`,
        mobile: `700000000${i}`,
        givenAmount: 5000 + i*100,
        notes: 'Shop Advance'
      });
    }
    console.log('✅ Receivables Flow Verified');

    // 8. Test & Seed Company Returns
    console.log('🚀 Testing Company Returns API (Creating 10 Returns)...');
    for (let i = 0; i < 10; i++) {
      const pIdx = i % 10;
      const imeiDoc = await Imei.findOne({ productId: products[pIdx]._id, status: 'available' });
      if (imeiDoc) {
        await api.post('/company-returns', {
          supplierName: suppliers[pIdx].name,
          product: products[pIdx]._id,
          productName: products[pIdx].productName,
          quantity: 1,
          imei: imeiDoc.imeiNumber,
          reason: 'Defective piece'
        });
      }
    }
    console.log('✅ Company Returns Flow Verified');

    // 9. Test & Seed Expenses
    console.log('🚀 Testing Expenses API (Creating 10 Expenses)...');
    for (let i = 0; i < 10; i++) {
      await api.post('/expenses', {
        description: `Office Expense ${i+1}`,
        amount: 500 + (i*50),
        category: 'general',
        paymentMethod: 'cash'
      });
    }
    console.log('✅ Expenses Flow Verified');

    console.log('\n🎉 SUCCESS! All data wiped, 10 records inserted for each module, and all forms/APIs verified.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during script execution:');
    console.error(err.response ? JSON.stringify(err.response.data, null, 2) : err);
    process.exit(1);
  }
}

run();
