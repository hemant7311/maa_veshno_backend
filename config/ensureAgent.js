const bcrypt = require('bcryptjs')
const User = require('../models/User')

const ensureHiteshAgentAccount = async () => {
  try {
    const username = 'hitesh-b7657b'
    const targetPassword = 'MvM#H7q9!R2x@K6p'
    const hashedPassword = await bcrypt.hash(targetPassword, 12)

    let user = await User.findOne({ 
      $or: [{ username }, { email: 'hitesh-b7657b@finance-agent.local' }] 
    })

    if (user) {
      user.username = username
      user.password = hashedPassword
      user.role = 'finance_agent'
      user.status = 'active'
      if (!user.financeEntityName) {
        user.financeEntityName = user.name || 'Hitesh'
        user.financeEntityKey = (user.name || 'Hitesh').trim().replace(/\s+/g, ' ').toLowerCase()
      }
      await user.save()
      console.log('✅ Finance agent account "hitesh-b7657b" verified & password updated.')
    } else {
      user = await User.create({
        name: 'Hitesh',
        username,
        email: `${username}@finance-agent.local`,
        password: hashedPassword,
        role: 'finance_agent',
        status: 'active',
        financeEntityName: 'Hitesh',
        financeEntityKey: 'hitesh',
      })
      console.log('✅ Finance agent account "hitesh-b7657b" created.')
    }
    return user
  } catch (err) {
    console.warn('⚠️ Error ensuring hitesh-b7657b agent account:', err.message)
  }
}

module.exports = { ensureHiteshAgentAccount }
