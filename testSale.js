const axios = require('axios');

async function testSale() {
  try {
    const res = await axios.post('http://localhost:5000/api/v1/sales', {
      invoiceNumber: "INV-12345",
      customerName: "Test Customer",
      phone: "9999999999",
      saleType: "retail",
      paymentMode: "cash",
      items: [
        {
          productName: "Test Phone",
          imei: "1234567890",
          qty: 1,
          price: 10000,
          total: 10000
        }
      ],
      subTotal: 10000,
      totalDiscount: 0,
      totalTax: 0,
      grandTotal: 10000
    });
    console.log(res.data);
  } catch (error) {
    console.error("Error Response:", error.response?.data);
  }
}

testSale();
