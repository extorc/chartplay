const math = require('mathjs');

const formula = '^NSEI * (CL=F / GC=F) + ^NSEBANK';
const uniqueSymbols = [...new Set(formula.match(/[a-zA-Z\^][a-zA-Z0-9\^=.-]*/g) || [])];

let evalFormula = formula;

uniqueSymbols.forEach((sym, idx) => {
  const identifier = `SYM_${idx}`;
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Since some JS engines don't support lookbehinds properly, or we can just use a simple approach:
  // If we split by the regex or just use a basic replace...
  // Actually, node supports lookbehinds.
  const symRegex = new RegExp(`(?<![a-zA-Z0-9\\^=.-])${escapedSym}(?![a-zA-Z0-9\\^=.-])`, 'g');
  evalFormula = evalFormula.replace(symRegex, identifier);
});

console.log('Symbols:', uniqueSymbols);
console.log('Eval Formula:', evalFormula);

// Test mathjs
const scope = {
  SYM_0: 20000, // NSEI
  SYM_1: 80, // CL=F
  SYM_2: 2000, // GC=F
  SYM_3: 40000 // NSEBANK
};

console.log('Result:', math.evaluate(evalFormula, scope));
