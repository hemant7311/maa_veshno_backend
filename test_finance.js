const http = require('http');
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27017/maa_veshno';
mongoose.connect(MONGO_URI);
const FinanceRecord = mongoose.model('FinanceRecord', new mongoose.Schema({}, { strict: false }));

const makeRequest = (payload) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/v1/finance',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

const runTests = async () => {
  console.log("--- STARTING TESTS ---");

  // Test 1: Empty string / whitespace totalLimit
  let res = await makeRequest({
    financeType: 'Company', entityName: 'Test', customerName: 'Test', mobileNumber: '123',
    totalLimit: '   '
  });
  console.log('Test 1 (Whitespace totalLimit):', res.status === 400 ? 'PASS' : 'FAIL', res.body.message);

  // Test 2: Negative usedLimit
  res = await makeRequest({
    financeType: 'Company', entityName: 'Test', customerName: 'Test', mobileNumber: '123',
    totalLimit: 1000, usedLimit: -500
  });
  console.log('Test 2 (Negative usedLimit):', res.status === 400 ? 'PASS' : 'FAIL', res.body.message);

  // Test 3: Exceeds limit
  res = await makeRequest({
    financeType: 'Company', entityName: 'Test', customerName: 'Test', mobileNumber: '123',
    totalLimit: 1000, usedLimit: 1500
  });
  console.log('Test 3 (Exceeds limit):', res.status === 400 ? 'PASS' : 'FAIL', res.body.message);

  // Test 4: E2E Success
  const billRef = `TEST_DELETE_ME_E2E_${Date.now()}`;
  res = await makeRequest({
    financeType: 'Company', entityName: 'Test', customerName: 'Test', mobileNumber: '123',
    totalLimit: 100000, usedLimit: 80000, billRef
  });
  console.log('Test 4 (Success Response Status):', res.status === 201 ? 'PASS' : 'FAIL', res.status !== 201 ? res.body : '');
  
  if (res.status === 201 && res.body.data) {
    const record = res.body.data;
    console.log(`Created Record ID: ${record._id}`);
    console.log(`Calculated availableLimit (Expected 20000): ${record.availableLimit}`);
    
    // Clean up
    console.log(`Deleting record with _id: ${record._id} ...`);
    await FinanceRecord.deleteOne({ _id: new mongoose.Types.ObjectId(record._id) });
    console.log('Cleanup successful.');
  }

  mongoose.disconnect();
};

runTests().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
