const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const period1 = d.toISOString().split('T')[0];
    const result = await yahooFinance.chart('^NSEI', { period1, interval: '30m' });
    console.log(result.quotes[result.quotes.length - 2]);
    console.log(result.quotes[result.quotes.length - 1]);
    console.log(result.meta.regularMarketPrice, result.meta.regularMarketDayHigh, result.meta.regularMarketDayLow);
  } catch(e) {
    console.error(e);
  }
}

test();
