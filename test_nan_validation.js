const mongoose = require('mongoose');
require('dotenv').config();
const FinanceRecord = require('./models/FinanceRecord');

async function testNaNValidation() {
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
        // MISSING expectedAmount!
        paidAmount: 0,
        status: 'Pending',
        remainingAmount: 1000
      }
    ],
    paidEmis: []
  });
  
  console.log('Inserted legacy record missing expectedAmount.');
  
  try {
    const record = await FinanceRecord.findById(legacyRecordId);
    const installment = record.installments[0];
    
    // Simulate what updateEmiStatus does:
    installment.paidAmount += 500;
    installment.remainingAmount = Math.max(0, installment.expectedAmount - installment.paidAmount);
    // ^ This will result in Math.max(0, undefined - 500) -> Math.max(0, NaN) -> NaN
    
    console.log('remainingAmount is now:', installment.remainingAmount);
    
    await record.save({ validateModifiedOnly: true });
    console.log('Save SUCCESSFUL!');
  } catch (err) {
    console.error('Save FAILED:', err.name, err.message);
  }
  
  process.exit(0);
}

testNaNValidation().catch(console.error);
