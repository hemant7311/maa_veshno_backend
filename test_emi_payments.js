const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { updateEmiStatus } = require('./controllers/financeController');
const FinanceRecord = require('./models/FinanceRecord');
const Sale = require('./models/Sale');
const Transaction = require('./models/Transaction');

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; },
    _getJSONData: function() { return this.data; }
  };
  return res;
}

test('EMI Payment Sync Logic Suite', async (t) => {
  // Connect to a test db
  await mongoose.connect('mongodb://127.0.0.1:27017/maa_veshno_test_emi');
  
  mongoose.startSession = async () => null;

  await FinanceRecord.deleteMany({});
  await Sale.deleteMany({});
  await Transaction.deleteMany({});

  const agentUser = { _id: new mongoose.Types.ObjectId(), role: 'finance_agent', username: 'agent01' };

  let saleId;
  let recordId;
  let emiId = 1;

  await t.test('Setup: Create Sale and FinanceRecord', async () => {
    const sale = await Sale.create({
      invoiceNumber: 'INV-TEST-01',
      customerName: 'Test Customer',
      customerPhone: '9999999999',
      phone: '9999999999',
      subTotal: 10000,
      grandTotal: 10000,
      amountPaid: 2000,
      amountDue: 8000,
      paymentMethod: 'Finance',
      paymentMode: 'finance',
      saleType: 'retail',
      installmentSchedule: [
        { installmentNumber: 1, dueDate: new Date(), expectedAmount: 4000, dueAmount: 4000, paidAmount: 0, status: 'pending' },
        { installmentNumber: 2, dueDate: new Date(), expectedAmount: 4000, dueAmount: 4000, paidAmount: 0, status: 'pending' }
      ]
    });
    saleId = sale._id;

    const record = await FinanceRecord.create({
      customerName: 'Test Customer',
      mobileNumber: '9999999999',
      billRef: 'INV-TEST-01',
      saleId: sale._id,
      totalLimit: 10000,
      usedLimit: 8000,
      emiAmount: 4000,
      tenure: 2,
      financeType: 'Private',
      entityName: 'Test Finance',
      agentId: agentUser._id,
      installments: [
        { installmentNumber: 1, dueDate: new Date(), expectedAmount: 4000, paidAmount: 0, remainingAmount: 4000, status: 'Pending' },
        { installmentNumber: 2, dueDate: new Date(), expectedAmount: 4000, paidAmount: 0, remainingAmount: 4000, status: 'Pending' }
      ]
    });
    recordId = record._id;
  });

  await t.test('Partial Payment: Should reduce remaining amount and mark Partially Paid', async () => {
    const req = {
      method: 'PUT',
      params: { recordId: recordId.toString(), emiId: emiId.toString() },
      body: { status: 'Paid', amount: 1500 },
      user: agentUser
    };
    const res = createMockRes();

    await updateEmiStatus(req, res, (err) => { if(err) throw err; });
    const responseData = res._getJSONData();

    assert.strictEqual(responseData.success, true);
    
    // Check DB
    const rec = await FinanceRecord.findById(recordId);
    const inst = rec.installments.find(i => i.installmentNumber === emiId);
    assert.strictEqual(inst.paidAmount, 1500);
    assert.strictEqual(inst.remainingAmount, 2500);
    assert.strictEqual(inst.status, 'Partially Paid');
    
    // Check Sale Sync
    const sale = await Sale.findById(saleId);
    const saleInst = sale.installmentSchedule.find(s => s.installmentNumber === emiId);
    assert.strictEqual(saleInst.paidAmount, 1500);
    assert.strictEqual(saleInst.status, 'partial');
    assert.strictEqual(sale.amountPaid, 3500); // 2000 initial + 1500
    assert.strictEqual(sale.amountDue, 6500);

    // Check Transaction
    const tx = await Transaction.findOne({ transactionType: 'emi', referenceId: recordId });
    assert.strictEqual(tx.amount, 1500);
  });

  await t.test('Full Payment of Remaining: Should mark Paid completely', async () => {
    const req = {
      method: 'PUT',
      params: { recordId: recordId.toString(), emiId: emiId.toString() },
      body: { status: 'Paid', amount: 2500 },
      user: agentUser
    };
    const res = createMockRes();

    await updateEmiStatus(req, res, (err) => { if(err) throw err; });
    
    const rec = await FinanceRecord.findById(recordId);
    const inst = rec.installments.find(i => i.installmentNumber === emiId);
    assert.strictEqual(inst.paidAmount, 4000);
    assert.strictEqual(inst.remainingAmount, 0);
    assert.strictEqual(inst.status, 'Paid');
    assert.ok(rec.paidEmis.includes(emiId));

    const sale = await Sale.findById(saleId);
    assert.strictEqual(sale.amountPaid, 6000);
  });

  await t.test('Duplicate Payment Rejection: Should fail if remainingAmount is 0', async () => {
    const req = {
      method: 'PUT',
      params: { recordId: recordId.toString(), emiId: emiId.toString() },
      body: { status: 'Paid', amount: 500 },
      user: agentUser
    };
    const res = createMockRes();

    await updateEmiStatus(req, res, (err) => { if(err) throw err; });
    
    assert.strictEqual(res.statusCode, 422);
    const responseData = res._getJSONData();
    assert.strictEqual(responseData.success, false);
    assert.ok(responseData.message.includes('exceeds valid outstanding amount'));
  });

  await t.test('Payment Reversal (Pending): Should refund entire paid amount', async () => {
    const req = {
      method: 'PUT',
      params: { recordId: recordId.toString(), emiId: emiId.toString() },
      body: { status: 'Pending' },
      user: agentUser
    };
    const res = createMockRes();

    await updateEmiStatus(req, res, (err) => { if(err) throw err; });
    
    const rec = await FinanceRecord.findById(recordId);
    const inst = rec.installments.find(i => i.installmentNumber === emiId);
    
    assert.strictEqual(inst.paidAmount, 0);
    assert.strictEqual(inst.remainingAmount, 4000);
    assert.strictEqual(inst.status, 'Pending');
    assert.strictEqual(rec.paidEmis.includes(emiId), false);

    const sale = await Sale.findById(saleId);
    assert.strictEqual(sale.amountPaid, 2000); // Back to initial downpayment
    assert.strictEqual(sale.amountDue, 8000);
    
    const tx = await Transaction.findOne({ transactionType: 'refund', referenceId: recordId });
    assert.strictEqual(tx.amount, 4000);
  });

  await t.test('Teardown', async () => {
    await mongoose.connection.close();
  });
});
