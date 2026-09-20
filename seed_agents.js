const mongoose = require('mongoose')
require('dotenv').config()
const FinanceRecord = require('./models/FinanceRecord')
const User = require('./models/User')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const financeController = require('./controllers/financeController') // We can reuse the buildAgentUsername logic if needed, but it's easier to just mock the req/res.

const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/maaveshnomobile')
    console.log('MongoDB connected')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

const seed = async () => {
  await connectDatabase()

  const randomSuffix = Math.floor(Math.random() * 10000)
  const agentNames = [
    `New Private Financer Raju ${randomSuffix}`,
    `New Private Financer Shyam ${randomSuffix}`,
    `New Private Financer Baburao ${randomSuffix}`,
    `New Private Financer Anjali ${randomSuffix}`,
    `New Private Financer Rahul ${randomSuffix}`,
    `New Private Financer Sneha ${randomSuffix}`,
    `New Private Financer Vikram ${randomSuffix}`,
    `New Private Financer Pooja ${randomSuffix}`,
    `New Private Financer Karan ${randomSuffix}`,
    `New Private Financer Neha ${randomSuffix}`
  ]

  console.log(`Starting to seed ${agentNames.length} private agent finance records...`)

  // We will mock the req and res to reuse the createFinanceRecord controller function directly
  for (let i = 0; i < agentNames.length; i++) {
    const entityName = agentNames[i]
    
    const req = {
      body: {
        financeType: 'Private',
        entityName: entityName,
        customerName: `Customer ${i + 1}`,
        mobileNumber: `980000000${i}`,
        totalLimit: 15000 + (i * 1000),
        usedLimit: 5000,
        billRef: `MVM-SEED-${1000 + i}`,
        productDetails: `Test Mobile ${i + 1} (IMEI: 12345678901234${i})`,
        emiAmount: 1000,
        tenure: '10'
      }
    }

    const res = {
      status: (code) => ({
        json: (data) => console.log(`[${code}] Agent: ${entityName} -> Success: ${data.success}`)
      })
    }
    
    const next = (err) => console.error(err)

    await financeController.createFinanceRecord(req, res, next)
  }

  console.log('Seeding completed.')
  process.exit(0)
}

seed()
