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
    
    const token = jwt.sign({ userId: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const payload = JSON.stringify({
      financeType: 'Private',
      entityName: 'Test Agent',
      customerName: 'Test Customer',
      mobileNumber: '1234567890',
      totalLimit: 5000,
      usedLimit: 5000,
      billRef: 'INV-001',
      productDetails: 'Test Phone',
      emiAmount: 1000,
      tenure: '5 Months'
    });

    const res = await doRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/finance',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    }, payload);

    console.log('API Response:', res);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();
