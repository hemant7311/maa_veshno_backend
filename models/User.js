const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    username: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'staff', 'finance_agent', 'wholesaler'], default: 'staff' },
    permissions: [{ type: String }],
    financeEntityName: { type: String, trim: true },
    financeEntityKey: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    lastLogin: Date,
  },
  { timestamps: true },
)

module.exports = mongoose.model('User', userSchema)

