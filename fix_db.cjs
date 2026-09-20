require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
    await User.updateOne({financeEntityName: 'vikas kk'}, {$set: {initialPassword: 'TempPass123'}});
    console.log('Done fixing vikas kk');
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
check();
