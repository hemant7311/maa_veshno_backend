require('dotenv').config();
const mongoose = require('mongoose');
const FinanceRecord = require('./models/FinanceRecord');
const User = require('./models/User');

const check = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/maa_veshno');
  
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
  ])

  const privateEntities = summary.filter(s => s.financeType === 'Private').map(s => s.entityName)
  console.log('Private Entities:', privateEntities);

  if (privateEntities.length > 0) {
    const agents = await User.find({ role: 'finance_agent', financeEntityName: { $in: privateEntities } }).select('financeEntityName username initialPassword')
    console.log('Found Agents:', agents.map(a => a.financeEntityName));
    
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

  console.log('Summary output for Neha Financer:', summary.find(s => s.entityName === 'Neha Financer'));

  process.exit(0);
};

check();
