const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const period1 = d.toISOString().split('T')[0];
    
    const result = await yahooFinance.chart('AAPL', { period1, interval: '30m' });
    console.log(result.quotes.slice(0, 3));
    console.log('Count:', result.quotes.length);
  } catch(e) {
    console.error(e);
  }
}

test();
