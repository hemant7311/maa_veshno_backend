const mongoose = require('mongoose')

const connectDatabase = () => mongoose.connect(process.env.MONGO_URI)

module.exports = connectDatabase
