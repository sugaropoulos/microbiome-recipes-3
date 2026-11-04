// Reads the BioArte report PDF (pdf.js): prefer / reduce tables, superfoods, report number, patient name.
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// Shared parser: extracts the prefer / reduce food tables (and superfoods) from a
// BioArte-style microbiome report. Works with any pdf.js document object.
async function parseReport(doc) {
  const BOILER = /HCS\s*\/\s*L|αποτελέσματα αφορούν|διεξάγει όλες|αδειοδοτημένο|αναπαραχθεί|Αρχής της Μάλτας|Test Report|Registered office|ground floor|Made with|Analysed by|Issued by|Interpreted by|ORGANIZATION WITH|CERTIFIED to|EuCI|Bio Arte|BioArte|Mailing address|Laboratories at|Triq San|SGN \d|info@|www\.|^\d{1,2}\/\d{2}\/\d{4}$/i;
  const stripAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const up = s => stripAcc(s).toUpperCase();

  // 1. Build visual lines per page (merge fragmented text items).
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(it => typeof it.str === 'string' && it.str.length)
      .map(it => ({
        s: it.str, x: it.transform[4], y: vp.height - it.transform[5],
        w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10
      }));
    // group by y (tolerance 3pt)
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const it of items) {
      let r = rows.find(r => Math.abs(r.y - it.y) < 3);
      if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
      r.items.push(it);
    }
    rows.sort((a, b) => a.y - b.y);
    pages.push({ p, width: vp.width, rows });
  }

  // Merge the items of one row segment into text runs; a gap > 40pt starts a new run.
  function runs(list) {
    list = list.slice().sort((a, b) => a.x - b.x);
    const out = [];
    let cur = null;
    for (const it of list) {
      if (!it.s.trim()) { if (cur) cur.trailingSpace = true; continue; }
      const gap = cur ? it.x - cur.end : 0;
      if (!cur || gap > 40) {
        cur = { x: it.x, text: it.s, end: it.x + it.w, h: it.h };
        out.push(cur);
      } else {
        const needSpace = cur.trailingSpace || gap > it.h * 0.22;
        const join = needSpace && !/\s$/.test(cur.text) && !/^\s/.test(it.s);
        cur.text += (join ? ' ' : '') + it.s;
        cur.end = Math.max(cur.end, it.x + it.w);
        cur.trailingSpace = false;
      }
    }
    return out.map(r => ({ x: r.x, text: r.text.replace(/\s+/g, ' ').trim() }));
  }

  // 2. Find the table header row ("ΤΡΟΦΕΣ ΠΡΟΣ ΠΡΟΤΙΜΗΣΗ" ... "ΤΡΟΦΕΣ ΠΡΟΣ ΜΕΙΩΣΗ").
  let start = null;
  for (const pg of pages) {
    for (let i = 0; i < pg.rows.length; i++) {
      const rr = runs(pg.rows[i].items);
      const pref = rr.find(r => /ΠΡΟΣ ΠΡΟΤΙΜΗΣΗ/.test(up(r.text)));
      const red = rr.find(r => /ΠΡΟΣ (ΜΕΙΩΣΗ|ΑΠΟΦΥΓΗ)/.test(up(r.text)));
      if (pref && red) { start = { page: pg.p, row: i, headerRightX: red.x }; break; }
    }
    if (start) break;
  }
  if (!start) throw new Error('Δεν βρέθηκε ο πίνακας «ΤΡΟΦΕΣ ΠΡΟΣ ΠΡΟΤΙΜΗΣΗ / ΠΡΟΣ ΜΕΙΩΣΗ» στο PDF.');

  // 3. Superfoods: bullets between "Υπερτροφές" and the header row.
  const superfoods = [];
  {
    let on = false;
    for (const pg of pages) {
      if (pg.p > start.page) break;
      pg.rows.forEach((row, i) => {
        if (pg.p === start.page && i >= start.row) return;
        const t = runs(row.items).map(r => r.text).join(' ');
        if (/ΥΠΕΡΤΡΟΦΕΣ|SUPER ?FOODS/.test(up(t))) { on = true; return; }
        if (!on) return;
        if (/^\*/.test(t)) { on = false; return; }
        const m = t.match(/^[•▪●◦\-–]\s*(.+)$/);
        if (m) superfoods.push(m[1].trim());
      });
    }
  }

  // 4. Walk table rows; split each row into left/right column by x.
  const lines = [];
  let splitX = null, leftX = null;
  outer:
  for (const pg of pages) {
    if (pg.p < start.page) continue;
    for (let i = 0; i < pg.rows.length; i++) {
      if (pg.p === start.page && i <= start.row) continue;
      const row = pg.rows[i];
      const full = runs(row.items).map(r => r.text).join(' ').trim();
      if (!full || BOILER.test(full)) continue;
      if (/^ΕΑΝ ΜΙΑ ΚΑΤΗΓΟΡΙΑ|ΓΕΝΙΚΕΣ ΔΙΑΤΡΟΦΙΚΕΣ ΣΥΣΤΑΣΕΙΣ/.test(up(full))) break outer;
      if (splitX === null) {
        // the first category row appears in both columns: right copy marks the split
        const rr = runs(row.items);
        if (rr.length >= 2) splitX = rr[rr.length - 1].x - 4;
        else splitX = Math.min(start.headerRightX - 30, pg.width / 2 + 10);
        leftX = rr.length ? rr[0].x : null;
      }
      // text starting left of the table (page footers, disclaimers) is not table content
      if (leftX !== null && row.items.filter(it => it.s.trim()).every(it => it.x < leftX - 15)) continue;
      const L = row.items.filter(it => it.x < splitX && (leftX === null || it.x >= leftX - 15));
      const R = row.items.filter(it => it.x >= splitX);
      for (const [side, list] of [['prefer', L], ['reduce', R]]) {
        const t = runs(list).map(r => r.text).join(' ').trim();
        if (t) lines.push({ side, text: t });
      }
    }
  }

  // 5. Interpret lines: category headers, bullets, continuations.
  const res = { prefer: [], reduce: [] };
  const state = { prefer: { cat: 'Λοιπά', last: null }, reduce: { cat: 'Λοιπά', last: null } };
  const isHeader = t => {
    if (/^[•▪●◦]/.test(t)) return false;
    const core = t.replace(/\(.*?\)/g, ' ').replace(/[:\s]+$/, '').trim();
    const words = stripAcc(core).split(/\s+/).filter(w => /[A-Za-zΑ-Ωα-ω]/.test(w));
    if (!words.length) return false;
    const caps = words.filter(w => w.length >= 3 && w === w.toUpperCase());
    // first word all-caps (≥4 letters) and caps words dominate the line
    return words[0].length >= 4 && words[0] === words[0].toUpperCase() &&
      caps.length >= Math.ceil(words.filter(w => w.length >= 4).length / 2);
  };
  const CATS = [
    [/^ΛΑΧΑΝΙΚ/, 'Λαχανικά & όσπρια'], [/^ΟΣΠΡΙ/, 'Όσπρια'], [/^ΦΡΟΥΤ/, 'Φρούτα'],
    [/^ΣΙΤΗΡ|^ΔΗΜΗΤΡΙΑΚ/, 'Σιτηρά & δημητριακά'], [/^ΚΡΕΑΣ|^ΚΡΕΑΤ/, 'Κρέας'],
    [/^ΘΑΛΑΣΣΙΝ|^ΨΑΡΙ/, 'Θαλασσινά'], [/^ΓΑΛΑΚΤΟΚΟΜ/, 'Γαλακτοκομικά & αυγά'],
    [/^ΞΗΡΟΙ|^ΞΗΡΟΣ/, 'Ξηροί καρποί & σπόροι'], [/^ΜΠΑΧΑΡΙΚ|^ΒΟΤΑΝ/, 'Μπαχαρικά & βότανα'],
    [/^ΚΑΡΥΚΕΥΜ/, 'Καρυκεύματα & άλλα'], [/^ΛΙΠΗ|^ΕΛΑΙΑ/, 'Λίπη & έλαια'], [/^ΠΟΤΑ/, 'Ποτά']
  ];
  const tidyCat = t => {
    const s = t.replace(/:\s*$/, '').trim();
    const U = up(s);
    for (const [rx, label] of CATS) if (rx.test(U)) return label;
    return s.charAt(0) + s.slice(1).toLowerCase();
  };
  for (const { side, text } of lines) {
    const st = state[side];
    const b = text.match(/^[•▪●◦]\s*(.*)$/);
    if (b) {
      const name = b[1].trim();
      if (!name) { st.last = null; continue; }
      if (/^(Ν|N)\s*\/\s*(Α|A)$/i.test(name)) { st.last = null; continue; }
      const item = { name, category: st.cat };
      res[side].push(item); st.last = item;
    } else if (isHeader(text)) {
      st.cat = tidyCat(text.replace(/\s*:\s*$/, '')); st.last = null;
    } else if (st.last) {
      // a continuation line; if it closes an open parenthesis and more text follows, that text is a new item (missing bullet in source)
      const open = (st.last.name.match(/\(/g) || []).length > (st.last.name.match(/\)/g) || []).length;
      const m = open && text.match(/^([^)]*\))\s+(\S.*)$/);
      if (m) {
        st.last.name = (st.last.name + ' ' + m[1]).replace(/\s+/g, ' ').trim();
        const item = { name: m[2].trim(), category: st.cat };
        res[side].push(item); st.last = item;
      } else st.last.name = (st.last.name + ' ' + text).replace(/\s+/g, ' ').replace(/\( /g, '(').trim();
    }
  }
  // de-duplicate within a side (some reports repeat an item)
  for (const side of ['prefer', 'reduce']) {
    const seen = new Set();
    res[side] = res[side].filter(it => {
      const k = stripAcc(it.name).toLowerCase() + '|' + it.category;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
  }

  // 6. Report meta (report number, sample id) — shown only for confirmation.
  let meta = {};
  const first = pages[0];
  if (first) {
    const all = first.rows.map(r => runs(r.items).map(x => x.text).join(' ')).join('\n');
    const rn = all.match(/Report\s*Number\s*:\s*([A-Z]{1,4}\s*\d[\d\s]*)/i);
    if (rn) meta.reportNumber = rn[1].replace(/\s/g, '');
  }
  return { superfoods, prefer: res.prefer, reduce: res.reduce, meta };
}
if (typeof module !== 'undefined') module.exports = { parseReport };

// Patient name: prefer the filename (keeps proper case and accents), else the «Όνομα» / «Επώνυμο» fields on page 1.
async function readPatientName(doc, filename) {
  const stripAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let fromPdf = '';
  try {
    const page = await doc.getPage(1); const vp = page.getViewport({ scale: 1 }); const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width || 0 }));
    const field = label => {
      const l = items.find(i => i.s.trim() === label); if (!l) return '';
      const row = items.filter(i => Math.abs(i.y - l.y) < 4 && i.x > l.x + l.w).sort((a, b) => a.x - b.x);
      if (!row.length) return '';
      let txt = row[0].s, end = row[0].x + row[0].w;
      for (const it of row.slice(1)) { if (it.x - end > 6) break; txt += (it.x - end > 1.5 ? ' ' : '') + it.s; end = it.x + it.w; }
      return txt.replace(/\s+/g, ' ').trim();
    };
    const first = field('Όνομα'), last = field('Επώνυμο'), full = field('Ονοματεπώνυμο');
    fromPdf = (full || [first, last].filter(Boolean).join(' ')).trim();
    if (fromPdf && fromPdf === fromPdf.toUpperCase()) fromPdf = fromPdf.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  } catch {}
  let fromFile = '';
  if (filename) {
    const base = filename.replace(/\.pdf$/i, '').split(/[_\-\s]+/).filter(t => t && !/^(FM|C|P)?\d+$/i.test(t) && /[A-Za-zΑ-Ωα-ωΆ-ώ]/.test(t) && !/^(report|αναφορα|αναφορά|bioarte)$/i.test(t));
    fromFile = base.join(' ').trim();
  }
  if (fromFile && fromPdf) {
    const a = stripAcc(fromFile).split(' ').sort().join(' '), b = stripAcc(fromPdf).split(' ').sort().join(' ');
    return a === b ? fromFile : fromPdf;
  }
  return fromFile || fromPdf;
}
if (typeof module !== 'undefined') module.exports.readPatientName = readPatientName;
