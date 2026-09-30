require('dotenv').config()
const mongoose = require('mongoose')
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const connectDatabase = require('./config/database')
const { syncFinanceRecordFromSale, resolveFinanceType } = require('./utils/financeSync')
const User = require('./models/User')
const FinanceRecord = require('./models/FinanceRecord')
const Sale = require('./models/Sale')

describe('Finance Synchronization and Rules', () => {
  before(async () => {
    await connectDatabase()
  })

  after(async () => {
    await mongoose.connection.close()
  })

  it('1 & 2. Creating or updating a Company Finance sale does not create a Finance Agent user or Agent ID', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-COMP-1',
      paymentMode: 'finance',
      customerName: 'Test Company Customer',
      phone: '1231231234',
      grandTotal: 10000,
      financeDetails: {
        financeType: 'company',
        company: 'Test Company Finance Co'
      }
    }
    
    // Create
    const record1 = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record1.financeType, 'Company')
    assert.strictEqual(record1.agentId, null)
    
    const user = await User.findOne({ financeEntityKey: 'test company finance co' })
    assert.strictEqual(user, null)
    
    // Update
    sale.grandTotal = 15000
    const record2 = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record2.financeType, 'Company')
    assert.strictEqual(record2.agentId, null)
    assert.strictEqual(record2.usedLimit, 15000)

    // Cleanup
    await FinanceRecord.findByIdAndDelete(record1._id)
  })

  it('3. Synchronizing the same Company Finance sale repeatedly does not create duplicates', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-COMP-2',
      paymentMode: 'finance',
      customerName: 'Test Cust',
      phone: '1234567890',
      financeDetails: { financeType: 'company', company: 'Test Dup Co' }
    }
    
    await syncFinanceRecordFromSale(sale)
    await syncFinanceRecordFromSale(sale)
    
    const count = await FinanceRecord.countDocuments({ saleId })
    assert.strictEqual(count, 1)

    // Cleanup
    await FinanceRecord.deleteMany({ saleId })
  })

  it('4. Creating eligible Private Finance records follows the existing agent-account workflow', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-PRIV-1',
      paymentMode: 'finance',
      customerName: 'Test Cust',
      phone: '1234567890',
      financeDetails: { financeType: 'private', company: 'Test Private Co' }
    }
    
    const record = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record.financeType, 'Private')
    assert.notStrictEqual(record.agentId, null)
    
    const user = await User.findById(record.agentId)
    assert.notStrictEqual(user, null)
    assert.strictEqual(user.role, 'finance_agent')

    // Cleanup
    await FinanceRecord.findByIdAndDelete(record._id)
    await User.findByIdAndDelete(user._id)
  })

  it('5. Updating Private Finance preserves its existing account and password hash', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-PRIV-2',
      paymentMode: 'finance',
      customerName: 'Test Cust',
      phone: '1234567890',
      financeDetails: { financeType: 'private', company: 'Test Update Priv Co' }
    }
    
    const record1 = await syncFinanceRecordFromSale(sale)
    const originalUser = await User.findById(record1.agentId)
    
    const record2 = await syncFinanceRecordFromSale(sale)
    const updatedUser = await User.findById(record2.agentId)
    
    assert.strictEqual(record1.agentId.toString(), record2.agentId.toString())
    assert.strictEqual(originalUser.password, updatedUser.password)

    // Cleanup
    await FinanceRecord.findByIdAndDelete(record1._id)
    await User.findByIdAndDelete(originalUser._id)
  })

  it('6. Self Finance follows the verified classification and account-creation rules (no agent created)', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-SELF-1',
      paymentMode: 'finance',
      customerName: 'Test Cust',
      phone: '1234567890',
      financeDetails: { financeType: 'private', company: 'Self Finance' }
    }
    
    const record = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record.financeType, 'Private')
    assert.strictEqual(record.agentId, null)
    
    const user = await User.findOne({ financeEntityKey: 'self finance' })
    assert.strictEqual(user, null)

    // Cleanup
    await FinanceRecord.findByIdAndDelete(record._id)
  })

  it('7. Editing a sale does not accidentally change Company Finance to Private Finance', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-COMP-EDIT-1',
      paymentMode: 'finance',
      customerName: 'Test Cust',
      phone: '1234567890',
      financeDetails: { financeType: 'company', company: 'Comp A' }
    }
    
    const record1 = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record1.financeType, 'Company')
    
    sale.financeDetails.company = 'Comp B'
    const record2 = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record2.financeType, 'Company')
    
    // Cleanup
    await FinanceRecord.findByIdAndDelete(record1._id)
  })

  it('8. Cancelled sales and failed synchronization do not produce incorrect finance records', async () => {
    const saleId = new mongoose.Types.ObjectId()
    const sale = {
      _id: saleId,
      invoiceNumber: 'TEST-CANC-1',
      status: 'cancelled',
      paymentMode: 'finance',
      customerName: 'Test Cust',
      phone: '1234567890',
      financeDetails: { financeType: 'company', company: 'Cancelled Co' }
    }
    
    const record = await syncFinanceRecordFromSale(sale)
    assert.strictEqual(record.status, 'Cancelled')
    
    // Cleanup
    await FinanceRecord.findByIdAndDelete(record._id)
  })
})
