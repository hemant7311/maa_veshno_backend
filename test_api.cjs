const http = require('http');

const check = () => {
  http.get('http://localhost:5000/api/v1/finance/summary', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(json.data.filter(s => s.financeType === 'Private'));
      } catch(e) {
        console.error('Failed to parse:', data.substring(0, 100));
      }
    });
  }).on('error', err => console.error(err));
}

check();
