const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  username: user.username,
  phone: user.phone,
  role: user.role,
  permissions: user.permissions || [],
})

const normalizeUsername = (value) => String(value || '').trim().toLowerCase()
const validUsername = (value) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value)

const register = async (req, res) => {
  const { name, username: usernameInput, password, role = 'staff', permissions = [] } = req.body
  const username = normalizeUsername(usernameInput)

  if (!name?.trim() || !validUsername(username) || typeof password !== 'string' || password.length < 6) {
    return res.status(422).json({
      success: false,
      message: 'Name, a valid username (3-32 characters), and a password of at least 6 characters are required',
      errors: {},
    })
  }
  if (!['admin', 'staff', 'finance_agent', 'wholesaler'].includes(role)) {
    return res.status(422).json({ success: false, message: 'Invalid user role', errors: {} })
  }
  if (await User.exists({ username })) {
    return res.status(409).json({ success: false, message: 'Username is already in use', errors: {} })
  }

  const user = await User.create({
    name: name.trim(),
    username,
    email: `${username}@local.user`,
    password: await bcrypt.hash(password, 12),
    role,
    permissions,
    status: 'active',
    ...(role === 'finance_agent'
      ? { financeEntityName: name.trim(), financeEntityKey: name.trim().replace(/\s+/g, ' ').toLowerCase() }
      : {}),
  })

  return res.status(201).json({ success: true, message: 'User created successfully', data: publicUser(user) })
}

const login = async (req, res) => {
  const { email, username, password } = req.body
  const loginId = String(username || email || '').trim().toLowerCase()
  if (!loginId || !password) {
    return res.status(422).json({ success: false, message: 'Username/email and password are required', errors: {} })
  }

  const user = await User.findOne({ $or: [{ email: loginId }, { username: loginId }] }).select('+password')
  if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password', errors: {} })
  }

  user.lastLogin = new Date()
  await user.save()
  const secret = process.env.JWT_SECRET || 'MaaVeshno_Fallback_Secret_Key_2026'
  const token = jwt.sign({ userId: user._id, role: user.role, permissions: user.permissions }, secret, { expiresIn: '7d' })
  return res.json({ success: true, message: 'Login successful', data: { user: publicUser(user), token } })
}

const profile = async (req, res) => res.json({ success: true, message: 'Profile loaded', data: publicUser(req.user) })

const getAgents = async (req, res) => {
  const agents = await User.find({ role: 'finance_agent', status: 'active' }).select('name username _id permissions')
  res.json({ success: true, data: agents })
}

const getUsers = async (req, res) => {
  const users = await User.find().select('name username email role permissions status createdAt').sort({ createdAt: -1 })
  res.json({ success: true, data: users })
}

const updateUser = async (req, res) => {
  const { id } = req.params
  const { name, username, role, password, permissions } = req.body
  const updateData = { name, username, role, permissions }
  
  if (password && password.trim() !== '') {
    const salt = await bcrypt.genSalt(10)
    updateData.password = await bcrypt.hash(password, salt)
  }

  const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true })
  if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' })
  
  res.json({ success: true, message: 'User updated successfully', data: publicUser(updatedUser) })
}

const deleteUser = async (req, res) => {
  const { id } = req.params
  // Optional: Prevent deleting the last admin or self
  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' })
  }
  
  const deletedUser = await User.findByIdAndDelete(id)
  if (!deletedUser) return res.status(404).json({ success: false, message: 'User not found' })
  
  res.json({ success: true, message: 'User deleted successfully' })
}

module.exports = { login, profile, register, getAgents, getUsers, updateUser, deleteUser }
