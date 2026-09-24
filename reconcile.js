const mongoose = require('mongoose')
const Product = require('./models/Product')
const Imei = require('./models/Imei')

mongoose.connect('mongodb://127.0.0.1:27017/maa_veshno')
  .then(async () => {
    console.log('Connected to MongoDB')
    let fixedCount = 0;
    const products = await Product.find();
    for (const p of products) {
      const imeiCount = await Imei.countDocuments({ productId: p._id, status: { $ne: 'archived' } })
      if (imeiCount > 0 || p.imeiNumber) {
        // It's an IMEI product
        const availableImeis = await Imei.countDocuments({ productId: p._id, status: 'available' })
        if (p.stock !== availableImeis) {
          console.log(`Mismatch Product ${p.productName} (${p._id}): DB Stock = ${p.stock}, IMEI Available = ${availableImeis}`)
          p.stock = availableImeis
          await p.save()
          fixedCount++
        }
      } else {
        // Non-IMEI product, manual stock. We ensure stock is not negative
        if (p.stock < 0) {
          console.log(`Mismatch Product ${p.productName} (${p._id}): DB Stock = ${p.stock} (Negative)`)
          p.stock = 0
          await p.save()
          fixedCount++
        }
      }
    }
    console.log(`Reconciliation complete. Fixed ${fixedCount} mismatches.`)
    process.exit(0)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
