const mongoose = require('mongoose');
require('dotenv').config();
const Sale = require('./models/Sale');

async function testNestedArrayValidation() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const legacySaleId = new mongoose.Types.ObjectId();
  
  await db.collection('sales').insertOne({
    _id: legacySaleId,
    invoiceNumber: `LEGACY-ARR-${Date.now()}`,
    customerName: 'Legacy Customer Array',
    paymentMode: 'finance',
    subTotal: 1000,
    grandTotal: 1000,
    amountPaid: 0,
    amountDue: 1000,
    billStatus: 'due',
    installmentSchedule: [
      {
        // OLD INSTALLMENT: Missing dueAmount!
        installmentNumber: 1,
        dueDate: new Date(),
        paidAmount: 0,
        status: 'pending'
      },
      {
        // NEW INSTALLMENT: Valid
        installmentNumber: 2,
        dueDate: new Date(),
        dueAmount: 500,
        paidAmount: 0,
        status: 'pending'
      }
    ]
  });
  
  console.log('Inserted legacy array record.');
  
  try {
    const sale = await Sale.findById(legacySaleId);
    // Modify the second installment
    const inst = sale.installmentSchedule.find(i => i.installmentNumber === 2);
    inst.paidAmount = 500;
    inst.status = 'paid';
    
    // Will it fail because installment 1 is missing dueAmount?
    await sale.save({ validateModifiedOnly: true });
    console.log('Save SUCCESSFUL!');
  } catch (err) {
    console.error('Save FAILED:', err.name, err.message);
  }
  
  process.exit(0);
}

testNestedArrayValidation().catch(console.error);
