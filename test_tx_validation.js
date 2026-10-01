const mongoose = require('mongoose');
require('dotenv').config();
const Transaction = require('./models/Transaction');

async function testTransactionValidation() {
  await mongoose.connect(process.env.MONGO_URI);
  
  try {
    await Transaction.create([{
      transactionType: 'emi',
      description: 'Test EMI',
      amount: undefined, // Missing!
      paymentMethod: 'cash'
    }]);
    console.log('Transaction SUCCESSFUL!');
  } catch (err) {
    console.error('Transaction FAILED:', err.name, err.message);
  }
  
  process.exit(0);
}

testTransactionValidation().catch(console.error);
