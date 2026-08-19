const express = require('express');
const cors = require('cors');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const math = require('mathjs');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/ratio', async (req, res) => {
  try {
    const { formula, range = '1y' } = req.query;

    if (!formula) {
      return res.status(400).json({ error: 'Please provide a formula string' });
    }

    const queryOptions = { period1: getPeriod1(range) };
    
    const uniqueSymbols = [...new Set(formula.match(/[a-zA-Z\^][a-zA-Z0-9\^=.-]*/g) || [])];
    
    if (uniqueSymbols.length === 0) {
      return res.status(400).json({ error: 'No valid symbols found in formula' });
    }

    let evalFormula = formula;
    uniqueSymbols.forEach((sym, idx) => {
      const identifier = `SYM_${idx}`;
      const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const symRegex = new RegExp(`(?<![a-zA-Z0-9\\^=.-])${escapedSym}(?![a-zA-Z0-9\\^=.-])`, 'g');
      evalFormula = evalFormula.replace(symRegex, identifier);
    });

    // Fetch data for all symbols
    const results = await Promise.all(
      uniqueSymbols.map(sym => yahooFinance.chart(sym, queryOptions).catch(e => {
        console.error(`Error fetching ${sym}:`, e.message);
        return null;
      }))
    );

    // If any symbol failed completely, throw error
    if (results.some(r => !r || !r.quotes || r.quotes.length === 0)) {
      return res.status(400).json({ error: 'Failed to fetch data for one or more symbols' });
    }

    // Build a unified timeline (union of all dates)
    const allDates = new Set();
    const dataBySymbolAndDate = {}; // symbol -> { dateStr -> closePrice }

    results.forEach((resObj, idx) => {
      const sym = uniqueSymbols[idx];
      dataBySymbolAndDate[sym] = {};
      resObj.quotes.forEach(q => {
        const d = new Date(q.date).toISOString().split('T')[0];
        allDates.add(d);
        if (q.close != null && q.close !== 0) {
          dataBySymbolAndDate[sym][d] = q.close;
        }
      });
    });

    const sortedDates = Array.from(allDates).sort();
    
    const finalData = [];
    // Keep track of the last seen price for forward fill
    const lastPrices = {};

    for (const d of sortedDates) {
      let missingData = false;
      const scope = {};
      
      uniqueSymbols.forEach((sym, idx) => {
        if (dataBySymbolAndDate[sym][d] != null) {
          lastPrices[sym] = dataBySymbolAndDate[sym][d];
        }
        
        if (lastPrices[sym] == null) {
          missingData = true; // Wait until we have at least one valid point for all symbols
        }
        scope[`SYM_${idx}`] = lastPrices[sym];
      });

      if (missingData) continue;

      try {
        const computedValue = math.evaluate(evalFormula, scope);
        if (computedValue != null && isFinite(computedValue) && computedValue !== 0) {
          finalData.push({
            date: d,
            value: computedValue,
            ...lastPrices // Includes the individual prices for the tooltip
          });
        }
      } catch (err) {
        // Ignore math errors for specific days (e.g. div by zero)
      }
    }

    res.json({
      formula,
      symbols: uniqueSymbols,
      data: finalData
    });

  } catch (error) {
    console.error('Error processing formula:', error);
    res.status(500).json({ error: 'Failed to fetch or process data', details: error.message });
  }
});

function getPeriod1(range) {
  const now = new Date();
  switch (range) {
    case '1mo': now.setMonth(now.getMonth() - 1); break;
    case '3mo': now.setMonth(now.getMonth() - 3); break;
    case '6mo': now.setMonth(now.getMonth() - 6); break;
    case '1y': now.setFullYear(now.getFullYear() - 1); break;
    case '2y': now.setFullYear(now.getFullYear() - 2); break;
    case '5y': now.setFullYear(now.getFullYear() - 5); break;
    case '10y': now.setFullYear(now.getFullYear() - 10); break;
    case 'max': return '1970-01-01';
    default: now.setFullYear(now.getFullYear() - 1); // Default to 1y
  }
  return now.toISOString().split('T')[0];
}

app.get('/api/tpo', async (req, res) => {
  try {
    const { symbol, interval = '30m' } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Provide a symbol' });

    // Get data for the last ~3 days to ensure we catch the most recent full trading day
    const d = new Date();
    d.setDate(d.getDate() - 4);
    const period1 = d.toISOString().split('T')[0];

    const result = await yahooFinance.chart(symbol, { period1, interval });
    if (!result.quotes || result.quotes.length === 0) {
      return res.status(400).json({ error: 'No intraday data found' });
    }

    // Merge live spot quote into the last candle if it's incomplete
    const quotes = result.quotes;
    if (quotes.length >= 2) {
      const lastQuote = quotes[quotes.length - 1];
      const prevQuote = quotes[quotes.length - 2];
      
      const intervalMinutes = parseInt(interval.replace(/\D/g, '')) || 30;
      const intervalMs = intervalMinutes * 60 * 1000;
      
      const diffMs = new Date(lastQuote.date).getTime() - new Date(prevQuote.date).getTime();
      
      // If the last quote is just a live spot update that hasn't formed a new full candle
      if (diffMs > 0 && diffMs < intervalMs) {
        prevQuote.high = Math.max(prevQuote.high, lastQuote.high);
        prevQuote.low = Math.min(prevQuote.low, lastQuote.low);
        prevQuote.close = lastQuote.close;
        quotes.pop(); // Remove the spot quote as it is now merged
      }
    }

    // Group by Date (YYYY-MM-DD)
    const quotesByDate = {};
    quotes.forEach(q => {
      if (q.high == null || q.low == null) return;
      const dateStr = new Date(q.date).toISOString().split('T')[0];
      if (!quotesByDate[dateStr]) quotesByDate[dateStr] = [];
      quotesByDate[dateStr].push(q);
    });

    // Get the most recent date
    const sortedDates = Object.keys(quotesByDate).sort();
    const latestDate = sortedDates[sortedDates.length - 1];
    const dayQuotes = quotesByDate[latestDate];

    if (dayQuotes.length === 0) {
      return res.status(400).json({ error: 'No valid high/low data for the latest day' });
    }

    // Max High and Min Low
    let maxHigh = -Infinity;
    let minLow = Infinity;
    dayQuotes.forEach(q => {
      if (q.high > maxHigh) maxHigh = q.high;
      if (q.low < minLow) minLow = q.low;
    });

    // Create 50 bins
    const BIN_COUNT = 50;
    const binSize = (maxHigh - minLow) / BIN_COUNT;
    const bins = [];
    
    // We want the highest price at index 0, lowest at index 49 (like a standard TPO chart)
    for (let i = 0; i < BIN_COUNT; i++) {
      const priceTop = maxHigh - (i * binSize);
      const priceBottom = priceTop - binSize;
      bins.push({
        index: i,
        priceTop,
        priceBottom,
        displayPrice: (priceTop + priceBottom) / 2,
        letters: []
      });
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    
    const ratioHistory = [];

    dayQuotes.forEach((q, idx) => {
      const letter = alphabet[idx % alphabet.length];
      
      bins.forEach(bin => {
        // Check overlap: bin Bottom <= q.high && bin Top >= q.low
        if (bin.priceBottom <= q.high && bin.priceTop >= q.low) {
          bin.letters.push(letter);
        }
      });

      // Calculate cumulative POC and ratio at this step
      let currentMaxLetters = -1;
      let currentPocCandidates = [];
      bins.forEach((bin, bIdx) => {
        if (bin.letters.length > currentMaxLetters) {
          currentMaxLetters = bin.letters.length;
          currentPocCandidates = [bIdx];
        } else if (bin.letters.length === currentMaxLetters && currentMaxLetters > 0) {
          currentPocCandidates.push(bIdx);
        }
      });
      
      let currentPocIndex = currentPocCandidates[0];
      if (currentPocCandidates.length > 1) {
        let minActiveIdx = Infinity;
        let maxActiveIdx = -Infinity;
        bins.forEach((bin, bIdx) => {
          if (bin.letters.length > 0) {
            if (bIdx < minActiveIdx) minActiveIdx = bIdx;
            if (bIdx > maxActiveIdx) maxActiveIdx = bIdx;
          }
        });
        const centerIdx = minActiveIdx <= maxActiveIdx ? (minActiveIdx + maxActiveIdx) / 2 : (bins.length - 1) / 2;
        
        let minDiff = Infinity;
        let bestCandidates = [];
        currentPocCandidates.forEach(idx => {
          const diff = Math.abs(idx - centerIdx);
          // Small epsilon to handle floating point ties reliably
          if (diff < minDiff - 0.0001) {
            minDiff = diff;
            bestCandidates = [idx];
          } else if (Math.abs(diff - minDiff) <= 0.0001) {
            bestCandidates.push(idx);
          }
        });
        
        // Pick the one closest to the center, if still tied, pick the mathematical middle of the tied ones
        currentPocIndex = bestCandidates[Math.floor(bestCandidates.length / 2)];
      }

      let currentTposAbove = 0;
      let currentTposBelow = 0;
      bins.forEach((bin, bIdx) => {
        if (bIdx < currentPocIndex) currentTposAbove += bin.letters.length;
        else if (bIdx > currentPocIndex) currentTposBelow += bin.letters.length;
      });

      const currentRatio = currentTposBelow > 0 ? (currentTposAbove / currentTposBelow) : (currentTposAbove > 0 ? 5 : 0); // Cap at 5 for charting purposes
      
      const timeLabel = new Date(q.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      ratioHistory.push({
        time: timeLabel,
        ratio: currentRatio,
        poc: bins[currentPocIndex]?.displayPrice
      });
    });

    // Find final POC (Point of Control)
    let maxLetters = -1;
    let finalPocCandidates = [];
    bins.forEach((bin, idx) => {
      if (bin.letters.length > maxLetters) {
        maxLetters = bin.letters.length;
        finalPocCandidates = [idx];
      } else if (bin.letters.length === maxLetters && maxLetters > 0) {
        finalPocCandidates.push(idx);
      }
    });

    let pocIndex = finalPocCandidates[0];
    if (finalPocCandidates.length > 1) {
      let minActiveIdx = Infinity;
      let maxActiveIdx = -Infinity;
      bins.forEach((bin, bIdx) => {
        if (bin.letters.length > 0) {
          if (bIdx < minActiveIdx) minActiveIdx = bIdx;
          if (bIdx > maxActiveIdx) maxActiveIdx = bIdx;
        }
      });
      const centerIdx = minActiveIdx <= maxActiveIdx ? (minActiveIdx + maxActiveIdx) / 2 : (bins.length - 1) / 2;
      
      let minDiff = Infinity;
      let bestCandidates = [];
      finalPocCandidates.forEach(idx => {
        const diff = Math.abs(idx - centerIdx);
        if (diff < minDiff - 0.0001) {
          minDiff = diff;
          bestCandidates = [idx];
        } else if (Math.abs(diff - minDiff) <= 0.0001) {
          bestCandidates.push(idx);
        }
      });
      
      pocIndex = bestCandidates[Math.floor(bestCandidates.length / 2)];
    }

    // Calculate TPOs above and below POC
    let tposAbove = 0;
    let tposBelow = 0;
    
    bins.forEach((bin, idx) => {
      if (idx < pocIndex) {
        // idx < pocIndex means higher price (above POC)
        tposAbove += bin.letters.length;
      } else if (idx > pocIndex) {
        // idx > pocIndex means lower price (below POC)
        tposBelow += bin.letters.length;
      }
    });

    const ratio = tposBelow > 0 ? (tposAbove / tposBelow) : (tposAbove > 0 ? Infinity : 0);

    res.json({
      symbol,
      date: latestDate,
      pocPrice: bins[pocIndex]?.displayPrice,
      tposAbove,
      tposBelow,
      ratioAboveVsBelow: ratio,
      bins,
      ratioHistory
    });

  } catch (error) {
    console.error('Error in TPO:', error);
    res.status(500).json({ error: 'Failed to calculate TPO', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
