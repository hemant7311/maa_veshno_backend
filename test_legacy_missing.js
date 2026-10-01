const mongoose = require('mongoose');
require('dotenv').config();
const FinanceRecord = require('./models/FinanceRecord');
const Sale = require('./models/Sale');

async function testLegacyMissingFields() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const legacyRecordId = new mongoose.Types.ObjectId();
  
  await db.collection('financerecords').insertOne({
    _id: legacyRecordId,
    financeType: 'Company',
    entityName: 'Test Fin',
    customerName: 'Legacy Customer',
    mobileNumber: '123',
    totalLimit: 1000,
    installments: [
      {
        installmentNumber: 1,
        dueDate: new Date(),
        // MISSING expectedAmount and remainingAmount!
        paidAmount: 0,
        status: 'Pending'
      }
    ],
    paidEmis: []
  });
  
  try {
    const record = await FinanceRecord.findById(legacyRecordId);
    const installment = record.installments[0];
    
    let paymentAmount = 500;
    
    // Simulate what financeController does:
    installment.paidAmount += paymentAmount;
    installment.remainingAmount -= paymentAmount;
    
    console.log('remainingAmount is now:', installment.remainingAmount);
    
    await record.save({ validateModifiedOnly: true });
    console.log('Modified paths:', record.modifiedPaths()); console.log('Save SUCCESSFUL!');
  } catch (err) {
    console.error('Save FAILED:', err.name, err.message);
  }
  
  process.exit(0);
}

testLegacyMissingFields().catch(console.error);
