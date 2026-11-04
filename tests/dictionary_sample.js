// Prints, for every dictionary entry, how many recipe lines it matches and a few examples.
// Usage: node tests/dictionary_sample.js [entry ids...]
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { module: undefined, console };
vm.createContext(ctx);
for (const f of ['js/food-dictionary.js', 'js/matching.js', 'data/recipes.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/^const (LEX|BUILTIN_RECIPES|N|LEXI) =/m, 'var $1 ='), ctx);
const { LEX, LEXI, N, testLine } = vm.runInContext('({ LEX, LEXI, N, testLine })', ctx);
const recipes = vm.runInContext('BUILTIN_RECIPES', ctx);
const only = new Set(process.argv.slice(2)); const skip = new Set(process.env.SKIP_SRC ? process.env.SKIP_SRC.split(',') : []);
for (const [id] of LEX) {
  if (only.size && !only.has(id)) continue;
  const c = LEXI[id]; const d = new Set();
  for (const r of recipes) { if (skip.has(r.src)) continue; for (const i of r.ing) if (testLine(c, N(i.t)) === 'def') d.add(i.t); }
  if (!d.size) continue;
  const ex = [...d]; const pick = [ex[0], ex[Math.floor(ex.length / 3)], ex[Math.floor(2 * ex.length / 3)], ex[ex.length - 1]];
  console.log(`${id}\t${d.size}\t${[...new Set(pick)].join(' || ')}`);
}
