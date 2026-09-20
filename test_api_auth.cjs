const http = require('http');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');

const doRequest = (options, data) => new Promise((resolve, reject) => {
  const req = http.request(options, res => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => {
      try {
        resolve(JSON.parse(responseData));
      } catch (e) {
        reject(new Error(`Failed to parse: ${responseData}`));
      }
    });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) throw new Error('No admin found');

    const token = jwt.sign({ userId: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const summaryRes = await doRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/finance/summary',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('API returned summary data:', summaryRes);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();
