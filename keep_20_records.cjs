require('dotenv').config();
const mongoose = require('mongoose');
const FinanceRecord = require('./models/FinanceRecord');

const deleteExtraRecords = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
    
    // Find the latest 20 records
    const latestRecords = await FinanceRecord.find().sort({ createdAt: -1 }).limit(20);
    
    if (latestRecords.length > 0) {
      const idsToKeep = latestRecords.map(record => record._id);
      
      // Delete everything else
      const result = await FinanceRecord.deleteMany({ _id: { $nin: idsToKeep } });
      console.log(`Successfully deleted ${result.deletedCount} old records. Kept ${idsToKeep.length} records.`);
    } else {
      console.log('No records found.');
    }
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
deleteExtraRecords();
