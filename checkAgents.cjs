require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const check = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
  const count = await User.countDocuments({ role: 'finance_agent' });
  console.log('Finance Agents Count:', count);
  
  const agents = await User.find({ role: 'finance_agent' }).select('username initialPassword financeEntityName');
  console.log(agents);
  process.exit(0);
};

check();
