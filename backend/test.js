const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const result = await yahooFinance.chart('AAPL', { period1: '2023-01-01' });
    console.log(result.quotes.length);
  } catch(e) {
    console.error(e);
  }
}

test();
