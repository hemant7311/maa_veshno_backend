const mongoose = require('mongoose');
const FinanceRecord = require('./models/FinanceRecord');
const User = require('./models/User');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/maaveshnomobile');
  
  const summary = await FinanceRecord.aggregate([
    {
      $group: {
        _id: { entityName: '$entityName', financeType: '$financeType' },
        totalCount: { $sum: 1 },
        totalFinancedAmount: { $sum: '$usedLimit' }
      }
    },
    {
      $project: {
        _id: 0,
        entityName: '$_id.entityName',
        financeType: '$_id.financeType',
        totalCount: 1,
        totalFinancedAmount: 1
      }
    }
  ]);
  
  const privateEntities = summary.filter(s => s.financeType === 'Private').map(s => s.entityName)
  if (privateEntities.length > 0) {
    const agents = await User.find({ role: 'finance_agent', financeEntityName: { $in: privateEntities } }).select('financeEntityName username initialPassword')
    summary.forEach(s => {
      if (s.financeType === 'Private') {
        const agent = agents.find(a => a.financeEntityName === s.entityName)
        if (agent) {
          s.agentUsername = agent.username
          s.agentPassword = agent.initialPassword
        }
      }
    })
  }

  console.log('Summary:', JSON.stringify(summary, null, 2));
  process.exit(0);
}
test();
