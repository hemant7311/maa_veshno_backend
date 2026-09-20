require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');

const token = jwt.sign({ userId: 'fakeid', role: 'admin' }, process.env.JWT_SECRET || 'replace-this-with-a-long-random-secret-before-production', { expiresIn: '1h' });

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
  res.on('end', () => console.log('Response:', body));
});

req.on('error', e => console.error(e));
req.end();
