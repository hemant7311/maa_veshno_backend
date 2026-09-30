require('dotenv').config()
const mongoose = require('mongoose')
const connectDatabase = require('./config/database')
const FinanceRecord = require('./models/FinanceRecord')
const User = require('./models/User')

const args = process.argv.slice(2)
const isApply = args.includes('--apply')

async function runMigration() {
  console.log(`[COMPANY AGENT FIX] Starting database audit... Mode: ${isApply ? 'APPLY' : 'DRY RUN'}`)
  
  try {
    await connectDatabase()
    
    // Find Company Finance records, OR Self Finance records, that incorrectly have an agentId
    const incorrectRecords = await FinanceRecord.find({
      $or: [
        { financeType: 'Company', agentId: { $ne: null } },
        { financeType: 'Private', entityName: { $regex: /^self finance$/i }, agentId: { $ne: null } }
      ]
    })
    
    console.log(`[COMPANY AGENT FIX] Found ${incorrectRecords.length} Company Finance records with incorrect agentIds.`)
    
    const usersToRemove = new Set()
    const usersToKeep = new Set()
    let recordsUpdated = 0
    let usersDeleted = 0
    
    for (const record of incorrectRecords) {
      const agentId = record.agentId
      
      console.log(`- Invoice: ${record.billRef || 'N/A'}, Entity: ${record.entityName}, Incorrect Agent: ${agentId}`)
      
      // Check if this agentId is used by ANY VALID Private finance records (not Self Finance)
      const privateUsage = await FinanceRecord.countDocuments({
        financeType: 'Private',
        entityName: { $not: { $regex: /^self finance$/i } },
        agentId: agentId
      })
      
      if (privateUsage > 0) {
        usersToKeep.add(agentId.toString())
        console.log(`  -> Agent ${agentId} is shared with ${privateUsage} Private records. WILL RETAIN USER.`)
      } else {
        usersToRemove.add(agentId.toString())
        console.log(`  -> Agent ${agentId} is NOT used by any Private records. WILL DELETE USER.`)
      }
      
      if (isApply) {
        record.agentId = undefined
        await record.save()
        recordsUpdated++
      }
    }
    
    if (isApply) {
      for (const userId of usersToRemove) {
        // Double check just to be safe
        const stillUsed = await FinanceRecord.countDocuments({ 
          agentId: userId, 
          financeType: 'Private',
          entityName: { $not: { $regex: /^self finance$/i } }
        })
        if (stillUsed === 0) {
          const user = await User.findById(userId)
          if (user) {
            console.log(`  -> Deleting orphaned user: ${user.username} (${user.name})`)
            await User.findByIdAndDelete(userId)
            usersDeleted++
          }
        }
      }
      console.log(`[COMPANY AGENT FIX] APPLIED. Removed agentId from ${recordsUpdated} records. Deleted ${usersDeleted} orphaned agent accounts.`)
    } else {
      console.log(`[COMPANY AGENT FIX] DRY RUN COMPLETE. Run with --apply to execute changes.`)
      console.log(`  Would update ${incorrectRecords.length} records.`)
      console.log(`  Would delete ${usersToRemove.size} orphaned users.`)
    }
    
  } catch (err) {
    console.error('[COMPANY AGENT FIX] Error:', err.message)
  } finally {
    mongoose.connection.close()
    process.exit(0)
  }
}

runMigration()
