require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');
const http = require('http');

const test = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
  const admin = await User.findOne({role: 'admin'});
  const token = jwt.sign({ userId: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
  const req = http.request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/v1/finance/Karan%20Patel',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      console.log('Status Code:', res.statusCode);
      console.log('Response:', body);
      process.exit(0);
    });
  });

  req.on('error', e => console.error(e));
  req.end();
}
test();
