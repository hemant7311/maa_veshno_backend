require('dotenv').config();
const mongoose = require('mongoose');
const FinanceRecord = require('./models/FinanceRecord');

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
    const records = await FinanceRecord.find();
    console.log(records.map(r => r.entityName));
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
check();
