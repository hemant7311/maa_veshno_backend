const mongoose = require('mongoose');
require('dotenv').config();
const FinanceRecord = require('./models/FinanceRecord');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const financeController = require('./controllers/financeController');

const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const seed = async () => {
  await connectDatabase();

  const agentConfig = [
    { name: 'Ravi Kumar', count: 100 },
    { name: 'Suresh Singh', count: 150 },
    { name: 'Amit Sharma', count: 50 },
    { name: 'Vikas Verma', count: 200 },
    { name: 'Rahul Gupta', count: 120 },
    { name: 'Neha Financer', count: 80 },
    { name: 'Pooja Finance', count: 100 },
    { name: 'Deepak Traders', count: 90 },
    { name: 'Manoj Singh', count: 60 },
    { name: 'Karan Patel', count: 50 },
  ]; // Total = 1000 records

  console.log('Starting massive seed of 1000 records across 10 agents...');

  // Helper to mock req/res
  const createMockRecord = async (agentName, i) => {
    return new Promise((resolve) => {
      const req = {
        body: {
          financeType: 'Private',
          entityName: agentName,
          customerName: `Customer ${agentName.split(' ')[0]} ${i + 1}`,
          mobileNumber: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
          totalLimit: 15000 + (i * 100),
          usedLimit: 5000 + (i * 10),
          billRef: `MVM-${agentName.substring(0,3).toUpperCase()}-${1000 + i}`,
          productDetails: `Mobile Model ${i % 5} (IMEI: ${Math.floor(100000000000000 + Math.random() * 900000000000000)})`,
          emiAmount: 1000,
          tenure: '12'
        }
      };

      const res = {
        status: (code) => ({
          json: (data) => resolve(data.success)
        }),
        json: (data) => resolve(data.success)
      };

      const next = (err) => {
        console.error(err);
        resolve(false);
      };

      financeController.createFinanceRecord(req, res, next);
    });
  };

  let totalInserted = 0;
  for (const config of agentConfig) {
    console.log(`Seeding ${config.count} records for agent: ${config.name}...`);
    for (let i = 0; i < config.count; i++) {
      await createMockRecord(config.name, i);
      totalInserted++;
      if (totalInserted % 100 === 0) {
        console.log(`Inserted ${totalInserted} records so far...`);
      }
    }
  }

  console.log(`Successfully seeded ${totalInserted} records!`);
  process.exit(0);
};

seed();
