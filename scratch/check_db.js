const connectDB = require('./config/database');
const FinanceRecord = require('./models/FinanceRecord');
const Sale = require('./models/Sale');
const { migrateLegacyFinanceRecords } = require('./utils/financeSync');

(async () => {
  await connectDB();
  const res = await migrateLegacyFinanceRecords();
  console.log('MIGRATION_RESULT:', JSON.stringify(res));

  const recs = await FinanceRecord.find({});
  console.log('RECORDS:', recs.map(r => ({ id: r._id, billRef: r.billRef, entityName: r.entityName, financeType: r.financeType })));

  const sales = await Sale.find({ 'financeDetails.company': { $exists: true, $ne: '' } });
  console.log('SALES:', sales.map(s => ({ inv: s.invoiceNumber, company: s.financeDetails?.company, fType: s.financeDetails?.financeType, loanId: s.financeDetails?.loanId, fileNo: s.financeDetails?.fileNo })));
  process.exit(0);
})();
