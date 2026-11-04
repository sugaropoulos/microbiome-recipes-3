// Matching engine: maps report foods to dictionary entries, checks recipe ingredient lines, proposes swaps.
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// ---------- compile ----------
const LEXI = {};
for (const [id, label, role, pdf, rx, o = {}] of LEX) {
  LEXI[id] = {
    id, label, role, pdf: R(pdf), rx: R(rx), not: R(o.not), strip: R(o.strip, true),
    px: R(o.px), pxNot: R(o.pxNot), parent: o.parent, sw: o.sw || [], pdfCat: o.pdfCat ? new RegExp(o.pdfCat) : null,
    note: o.note, pnote: o.pnote, noFill: o.noFill
  };
}

// map one report entry → lexicon id (first match wins; the list is ordered specific → generic)
function mapEntry(entry) {
  const n = N(entry.name).replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [id] of LEX) {
    const c = LEXI[id];
    if (c.pdfCat && !c.pdfCat.test(entry.category || '')) continue;
    if (c.pdf && c.pdf.test(n)) return id;
  }
  return null;
}
// fallback: build an automatic matcher from the entry's first meaningful word
function autoCanon(entry, idx) {
  const head = N(entry.name).split(/[,(]/)[0].trim();
  const words = head.split(' ').filter(w => w.length >= 4);
  if (!words.length) return null;
  const stems = words.slice(0, 2).map(w => w.length >= 6 ? w.slice(0, -2) : w.slice(0, -1));
  const id = 'auto_' + idx;
  LEXI[id] = { id, label: entry.name, role: 'auto', rx: null, px: R(stems.map(s => '\\<' + s).join('.*')), pnote: 'αυτόματη αντιστοίχιση — ελέγξτε', sw: [], auto: true };
  return id;
}

function buildLists(report) {
  const sets = { prefer: new Map(), reduce: new Map() }; // id -> [entry names]
  const mapping = [];
  let k = 0;
  for (const side of ['prefer', 'reduce']) {
    for (const e of report[side]) {
      let id = mapEntry(e);
      if (!id) id = autoCanon(e, k++);
      mapping.push({ side, name: e.name, category: e.category, id, auto: !id || id.startsWith('auto_') });
      if (!id) continue;
      if (!sets[side].has(id)) sets[side].set(id, []);
      sets[side].get(id).push(e.name);
    }
  }
  for (const s of report.superfoods || []) {
    const id = mapEntry({ name: s, category: '' });
    if (id) mapping.push({ side: 'super', name: s, id });
  }
  const superIds = new Set(mapping.filter(m => m.side === 'super').map(m => m.id));
  // conflicts: same id on both sides → keep on reduce only, remember conflict
  const conflicts = [...sets.prefer.keys()].filter(id => sets.reduce.has(id));
  return { sets, mapping, superIds, conflicts };
}

function statusOf(id, lists) {
  if (!id) return 'neutral';
  const c = LEXI[id];
  if (lists.sets.reduce.has(id) || (c && c.parent && lists.sets.reduce.has(c.parent))) return 'reduce';
  if (lists.sets.prefer.has(id)) return 'prefer';
  return 'neutral';
}

const MEASURE = R('(ποτηρ|ποτηρακ|φλιτζαν|φλιτζανακ|κουπ|\\<φλ\\>|\\<φλιτζ\\>)\\w*\\.? (του )?(κρασιου|καφε|ελληνικου( καφε)?|τσαγιου|νερου)', true);
function testLine(c, n) {
  n = n.replace(MEASURE, ' ');
  const t = c.strip ? n.replace(c.strip, ' ') : n;
  if (c.rx && c.rx.test(t) && !(c.not && c.not.test(t))) return 'def';
  if (c.px && c.px.test(n) && !(c.pxNot && c.pxNot.test(n))) return 'pos';
  return null;
}

function hitsFor(n, ids) {
  const hits = [];
  for (const id of ids) {
    const r = testLine(LEXI[id], n);
    if (r) hits.push({ id, conf: r });
  }
  // drop parent hits when a more specific child matched
  const hitIds = new Set(hits.map(h => h.id));
  let out = hits.filter(h => !hits.some(o => o.id !== h.id && LEXI[o.id].parent === h.id));
  // a possible hit is redundant when a definite hit of the same line already exists for a sibling with same entry
  return out;
}

function suggestions(id, lists) {
  const c = LEXI[id];
  const out = [];
  const seen = new Set();
  const push = (label, status, baseId) => {
    const k = N(label);
    if (seen.has(k) || status === 'reduce') return;
    seen.add(k); out.push({ label, status, baseId });
  };
  for (const s of c.sw) {
    if (typeof s === 'string') {
      const st = statusOf(s, lists);
      const lbl = st === 'prefer' ? lists.sets.prefer.get(s)[0] : LEXI[s].label;
      push(lbl, st, s);
    } else push(s.t, s.b ? statusOf(s.b, lists) : 'neutral', s.b);
  }
  // fill with same-role foods from the prefer list
  if (!c.noFill && out.filter(o => o.status === 'prefer').length < 2 && ['veg', 'leafy', 'fruit', 'grain', 'aromatic', 'legume', 'starch_veg', 'herb'].includes(c.role)) {
    for (const [pid, names] of lists.sets.prefer) {
      if (out.length >= 4) break;
      if (LEXI[pid] && LEXI[pid].role === c.role && pid !== id) push(names[0], 'prefer', pid);
    }
  }
  const rank = { prefer: 0, neutral: 1 };
  return out.sort((a, b) => rank[a.status] - rank[b.status]).slice(0, 4);
}

// split on top-level " ή " (outside parentheses); "(ή X)" counts as an alternative, "ή/και" does not
function topSplit(text) {
  const t = text.replace(/ή\s*\/\s*και/g, 'και').replace(/\(\s*ή\s+([^)]*)\)/g, ' ή $1');
  const segs = []; let depth = 0, cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch) && t.slice(i).match(/^\s+ή\s+/)) {
      const m = t.slice(i).match(/^\s+ή\s+/)[0];
      segs.push(cur); cur = ''; i += m.length - 1; continue;
    }
    cur += ch;
  }
  segs.push(cur);
  return segs.map(s => s.trim()).filter(Boolean);
}
function findAlternative(text, reduceIds) {
  const hasDef = s => hitsFor(N(s), reduceIds).some(h => h.conf === 'def');
  const segs = topSplit(text);
  if (segs.length > 1) {
    const QTY = /^([\d½¼¾⅓⅔.,/\-–]+|γρ\.?|ml|kg|κιλ[α-ω]*|λιτρ[α-ω]*|κ\.?σ\.?|κ\.?γ\.?|φλιτζ[α-ω]*\.?|κουπ[α-ω]*|ποτηρ[α-ω]*|κεσεδ[α-ω]*|μεριδ[α-ω]*|τεμ\.?)$/;
    const ADJ = /^(λευκ|ασπρ|ροζε|κοκκιν|μαυρ|κασταν|φρεσκ|ξερ|αγελαδιν|κατσικισι|προβει|κανονικ|ελαφρ|πληρ|light|ξανθ|ωριμ|νωπ|κατεψυγμ|βρασμ|ψητ|ωμ|αψητ|καβουρδ|τριμμ|αλεσμ|αναλατ|αλατισμ|μικρ|μεγαλ|μετρι|γλυκ|ξιν|αγλυκ|κρυσταλλ|μαλακ|σκληρ|απαχ|πρασιν|κιτριν)/;
    const words = s => N(s.replace(/\([^)]*\)/g, ' ')).split(' ').filter(w => w && !QTY.test(w));
    const elliptical = s => { const w = words(s); return w.length <= 1 && (!w.length || ADJ.test(w[0]) || /(ασ|ου|ησ|ων)$/.test(w[0])); };
    const hitIdx = segs.findIndex(hasDef);
    const out = [];
    segs.forEach((sg, i) => {
      if (hasDef(sg)) return;
      let full = sg;
      if (elliptical(sg)) {
        const head = segs[hitIdx];
        if (i < hitIdx) full = sg + ' ' + head.trim().split(/\s+/).pop();
        else full = (words(segs[0])[0] ? segs[0].trim().split(/\s+/).find(w => !QTY.test(N(w))) : '') + ' ' + sg;
        full = full.trim();
        if (hasDef(full)) return;
      }
      out.push(full);
    });
    return out.length && out.length < segs.length ? out.join(' ή ') : null;
  }
  const m = segs[0] && segs[0].match(/^(.*?)\(([^)]*)\)(.*)$/);
  if (m && !hasDef(m[1] + ' ' + m[3])) {
    const opts = m[2].split(/,|\s+ή\s+|·/).map(s => s.trim()).filter(Boolean);
    const good = opts.filter(o => !hasDef(o));
    if (good.length && good.length < opts.length) return (m[1].trim() + ' (' + good.join(', ') + ')' + m[3]).trim();
  }
  return null;
}

function analyzeRecipe(rec, lists) {
  const reduceIds = [...lists.sets.reduce.keys()];
  const preferIds = [...lists.sets.prefer.keys()].filter(id => !lists.sets.reduce.has(id));
  const lines = [];
  let def = 0, pos = 0, pref = 0, superHits = 0;
  const reduceFoods = new Set(), preferFoods = new Set();
  for (const ing of rec.ing) {
    const n = ing.n || N(ing.t);
    const hits = hitsFor(n, reduceIds);
    const alt = hits.some(h => h.conf === 'def') ? findAlternative(ing.t, reduceIds) : null;
    const ph = hits.length ? [] : hitsFor(n, preferIds).filter(h => h.conf === 'def');
    if (hits.some(h => h.conf === 'def')) def++; else if (hits.length) pos++;
    if (ph.length) pref++;
    ph.forEach(h => { preferFoods.add(h.id); if (lists.superIds.has(h.id)) superHits++; });
    hits.forEach(h => reduceFoods.add(h.id));
    lines.push({ t: ing.t, g: ing.g, hits, alt, prefer: ph.map(h => h.id) });
  }
  const tn = N(rec.title);
  const lineDef = new Set(); lines.forEach(l => l.hits.forEach(h => { if (h.conf === 'def') lineDef.add(h.id); }));
  const core = reduceIds.filter(id => lineDef.has(id) && testLine(LEXI[id], tn) === 'def');
  let status = 'ok';
  if (core.length) status = 'core';
  else if (def) status = 'modify';
  else if (pos) status = 'check';
  return { lines, def, pos, pref, superHits, core, status, reduceFoods: [...reduceFoods], preferFoods: [...preferFoods] };
}

if (typeof module !== 'undefined') module.exports = { topSplit, findAlternative, N, R, LEX, LEXI, mapEntry, buildLists, analyzeRecipe, suggestions, statusOf, testLine, hitsFor };
