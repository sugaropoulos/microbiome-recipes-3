// Patient PDF with real text (pdfmake): same design as the preview.
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
let PDFLIB = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); }); }
function loadPdfLibs() {
  if (window.pdfMake && window.pdfMake.createPdf) return Promise.resolve();
  if (!PDFLIB) PDFLIB = loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js').catch(e => { PDFLIB = null; throw e; });
  return PDFLIB;
}

// ---------- real-text PDF (pdfmake): same design as the preview, selectable text, clickable links ----------
const MM = 2.8346;
const UP = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const C = { ink: '#15232A', muted: '#56686E', line: '#D5DFDC', accent: '#0E5D6A', prefer: '#23714A', paper: '#F4F7F6', chg: '#ECEFEE', chgLine: '#9AA6A8', struck: '#7D8A8D' };
function docLines(x) {
  const { r, a } = x; const has = !!state.report;
  const lines = [], notes = [];
  let lastG = null;
  a.lines.forEach((l, i) => {
    if (l.g && l.g !== lastG) { lines.push({ kind: 'grp', t: l.g }); lastG = l.g; }
    const flagged = has && l.hits.length && (l.hits.some(h => h.conf === 'def') || state.showPos);
    const opt = flagged ? chosen(r.key, i, l) : null;
    if (opt && opt.kind !== 'keep') {
      let nw;
      if (opt.kind === 'omit') nw = 'παραλείπεται';
      else if (opt.kind === 'less') nw = 'σε μικρότερη ποσότητα';
      else if (opt.kind === 'recipe') nw = opt.text;
      else nw = lowerFirst(opt.label);
      lines.push({ kind: 'chg', t: l.t, nw });
      if (opt.kind === 'prefer' || opt.kind === 'neutral') notes.push({ from: bareIng(l.t), to: nw });
      else if (opt.kind === 'omit') notes.push({ from: bareIng(l.t), omit: true });
    } else lines.push({ kind: has && l.prefer.length ? 'pref' : 'plain', t: l.t });
  });
  return { lines, notes };
}
const ARROW = { text: '→ ', font: 'Arrow' };
function pdfRecipe(x, n, mealTitle, last) {
  const { r } = x; const { lines, notes } = docLines(x);
  const meta = [r.serv, r.cats.join(', ')].filter(Boolean).join(' · ');
  const label = t => ({ text: UP(t), font: 'CommSemi', fontSize: 7, characterSpacing: 0.9, color: C.muted, margin: [0, 0, 0, 4] });
  const body = lines.map(l => {
    if (l.kind === 'grp') return [{ text: l.t, font: 'CommSemi', margin: [0, 4, 0, 0], _kind: 'grp' }];
    if (l.kind === 'chg') return [{ stack: [
      { text: l.t, color: C.struck, decoration: 'lineThrough', decorationColor: C.struck },
      { text: [ARROW, { text: l.nw, bold: true, color: '#000000' }] }
    ], fillColor: C.chg, _kind: 'chg' }];
    if (l.kind === 'pref') return [{ text: l.t, color: C.prefer, bold: true, _kind: 'pref' }];
    return [{ text: l.t, _kind: 'plain' }];
  });
  const kindAt = i => body[i] && body[i][0]._kind;
  const ingTable = { table: { widths: ['*'], body }, layout: {
    hLineWidth: (i, node) => (i === 0 || i === node.table.body.length || kindAt(i - 1) === 'chg' || kindAt(i) === 'chg' || kindAt(i) === 'grp') ? 0 : 0.4,
    vLineWidth: () => 0, hLineColor: () => C.line, hLineStyle: () => ({ dash: { length: 1, space: 1.5 } }),
    paddingLeft: i => 0, paddingRight: () => 0,
    paddingTop: (i) => kindAt(i) === 'chg' ? 3.5 : 2, paddingBottom: (i) => kindAt(i) === 'chg' ? 3.5 : 2,
  } };
  // give changed rows inner padding by wrapping their stack
  body.forEach(row => { if (row[0]._kind === 'chg') row[0].stack.forEach(s => s.margin = [5.5, 0, 5.5, 0]); });
  const method = [label('Εκτέλεση'), { text: r.steps || 'Η πηγή δεν δίνει οδηγίες εκτέλεσης.' }];
  if (notes.length) {
    const parts = [{ text: 'Στην εκτέλεση χρησιμοποιήστε τα νέα υλικά: ' }];
    notes.forEach((nt, k) => {
      if (k) parts.push({ text: '; ' });
      parts.push({ text: nt.from, font: 'CommSemi' });
      if (nt.omit) parts.push({ text: ': παραλείπεται' }); else parts.push({ text: ' ' }, ARROW, { text: nt.to });
    });
    parts.push({ text: '.' });
    method.push({ margin: [0, 8, 0, 0], table: { widths: ['*'], body: [[{ text: parts, fontSize: 8.6, fillColor: C.chg }]] },
      layout: { hLineWidth: () => 0, vLineWidth: i => i === 0 ? 1.2 : 0, vLineColor: () => C.chgLine, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5 } });
  }
  const si = srcInfo(r);
  if (si) method.push({ margin: [0, 8, 0, 0], fontSize: 7.4, color: C.muted, text: [{ text: 'Πηγή: ' }, si.href ? { text: si.text, link: si.href, color: C.accent, decoration: 'underline' } : { text: si.text }] });
  const stack = [];
  if (mealTitle) stack.push({ text: mealTitle, font: 'Didot', fontSize: 20, color: C.accent }, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180 * MM, y2: 0, lineWidth: 0.8, lineColor: C.line }], margin: [0, 4, 0, 14] });
  stack.push(
    { columns: [
      { width: 6 * MM + 6, text: String(n), font: 'Didot', fontSize: 15, color: C.accent },
      { width: '*', stack: [{ text: r.title, font: 'Didot', fontSize: 15, lineHeight: 1.1, link: isLink(r.url) ? r.url : undefined }, meta ? { text: meta, fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] } : ''] }
    ], margin: [0, 0, 0, 10] },
    { columns: [
      { width: 62 * MM, stack: [label('Υλικά'), ingTable] },
      { width: '*', stack: method }
    ], columnGap: 8 * MM, margin: [10 * MM, 0, 0, 0] }
  );
  if (!last) stack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180 * MM, y2: 0, lineWidth: 0.6, lineColor: C.line }], margin: [0, 12, 0, 12] });
  return { stack, unbreakable: true };
}
function pdfDefinition() {
  const groups = selectedRows().filter(g => g.rows.length);
  const has = !!state.report;
  const today = new Date().toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });
  const who = $('docFor').value.trim();
  const W = 180 * MM;
  const nF = has ? 3 : 2, gap = 6 * MM, fw = (W - gap * (nF - 1)) / nF;
  const field = (lab, val) => ({ width: fw, stack: [
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: fw, y2: 0, lineWidth: 0.6, lineColor: C.line }], margin: [0, 0, 0, 4] },
    { text: UP(lab), fontSize: 7, characterSpacing: 0.8, color: C.muted },
    { text: val || ' ', font: 'CommSemi', fontSize: 10, margin: [0, 2, 0, 0] }] });
  const fields = [field('Για', who), field('Ημερομηνία', today)];
  if (has) fields.push(field('Βάσει αναφοράς', state.meta.reportNumber || state.sourceName || '—'));
  let k = 0;
  const overview = groups.map(g => ({ table: { widths: ['*'], body: [[{ fillColor: C.paper, stack: [
    { text: g.meal.many, font: 'Didot', fontSize: 13, color: C.accent, margin: [0, 0, 0, 5] },
    { ol: g.rows.map(x => ({ text: x.r.title, margin: [0, 0, 0, 3] })), start: k + 1, markerColor: C.ink, _n: (k += g.rows.length) }
  ] }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 13, paddingRight: () => 13, paddingTop: () => 11, paddingBottom: () => 9 } }));
  const square = (fill, stroke) => ({ width: 13, canvas: [{ type: 'rect', x: 0, y: 2, w: 8.5, h: 8.5, r: 2, color: fill, lineColor: stroke || fill, lineWidth: 0.5 }] });
  const content = [
    { text: 'ΠΡΟΓΡΑΜΜΑ ΣΥΝΤΑΓΩΝ', font: 'CommSemi', fontSize: 7.5, characterSpacing: 1.2, color: C.accent },
    { text: 'Οι συνταγές σας', font: 'Didot', fontSize: 26, margin: [0, 8, 0, 6] },
    { text: 'Συνταγές επιλεγμένες για ' + groups.map(g => g.meal.acc).join(', ').replace(/, ([^,]*)$/, ' και $1') + '.' + (has ? ' Όπου η ανάλυση μικροβιώματος προτείνει να μειώσετε κάποια τροφή, η συνταγή έχει προσαρμοστεί με εναλλακτική.' : ''), color: C.muted, margin: [0, 0, 60, 0] },
    { columns: fields, columnGap: gap, margin: [0, 20, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 26, 0, 20] },
    { columns: overview, columnGap: 5 * MM }
  ];
  if (has) content.push(
    { columns: [square(C.prefer), { text: [{ text: 'Πράσινο', bold: true, color: C.prefer }, ': τροφή προς προτίμηση, σύμφωνα με την ανάλυσή σας.'] }], fontSize: 8.6, color: C.muted, margin: [0, 20, 0, 6] },
    { columns: [square(C.chg, C.chgLine), { text: [{ text: 'Γκρι', bold: true, color: '#5F6D70' }, ': υλικό της συνταγής που άλλαξε. Το αρχικό φαίνεται διαγραμμένο και από κάτω, με μαύρα έντονα γράμματα (', ARROW, '), αυτό που το αντικαθιστά.'] }], fontSize: 8.6, color: C.muted, margin: [0, 0, 0, 6] },
    { text: 'Οι ποσότητες των νέων υλικών προσαρμόζονται κατά την κρίση σας ή του διατροφολόγου σας.', fontSize: 8.6, color: C.muted },
    { margin: [0, 20, 0, 0], table: { widths: ['*'], body: [[{ fillColor: C.paper, fontSize: 8.4, color: C.muted, text: 'Οι προσαρμογές βασίζονται στους πίνακες «Τροφές προς προτίμηση» και «Τροφές προς μείωση» της ανάλυσης μικροβιώματος. Δεν αντικαθιστούν τη συμβουλή του διατροφολόγου ή του γιατρού σας, ιδιαίτερα αν υπάρχουν αλλεργίες ή άλλα θέματα υγείας.' }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 13, paddingRight: () => 13, paddingTop: () => 10, paddingBottom: () => 10 } });
  let n = 0;
  groups.forEach(g => {
    g.rows.forEach((x, idx) => {
      const block = pdfRecipe(x, ++n, idx === 0 ? g.meal.many : null, idx === g.rows.length - 1);
      if (idx === 0) block.pageBreak = 'before';
      content.push(block);
    });
  });
  return {
    pageSize: 'A4', pageMargins: [15 * MM, 15 * MM, 15 * MM, 18 * MM],
    info: { title: 'Οι συνταγές σας', subject: 'Πρόγραμμα συνταγών' },
    defaultStyle: { font: 'Comm', fontSize: 9.3, lineHeight: 1.3, color: C.ink },
    footer: (cur, total) => ({ columns: [
      { text: 'Πρόγραμμα συνταγών · βάσει ανάλυσης μικροβιώματος', fontSize: 7, color: C.muted },
      { text: `${cur} / ${total}`, fontSize: 7, color: C.muted, alignment: 'right' }
    ], margin: [15 * MM, 6 * MM, 15 * MM, 0] }),
    content
  };
}
function buildPdfBlob() {
  const pm = window.pdfMake;
  pm.vfs = { 'c400.ttf': PDF_FONTS.c400, 'c600.ttf': PDF_FONTS.c600, 'c700.ttf': PDF_FONTS.c700, 'd400.ttf': PDF_FONTS.d400, 'arrow.ttf': PDF_FONTS.arrow };
  const f = (n, b) => ({ normal: n, bold: b || n, italics: n, bolditalics: b || n });
  pm.fonts = { Comm: f('c400.ttf', 'c700.ttf'), CommSemi: f('c600.ttf', 'c700.ttf'), Didot: f('d400.ttf'), Arrow: f('arrow.ttf') };
  return new Promise((res, rej) => { try { pm.createPdf(pdfDefinition()).getBlob(res); } catch (e) { rej(e); } });
}
function trayMessage(text, kind) { const m = $('trayMsg'); m.hidden = !text; m.className = 'tray-msg msg ' + (kind || ''); m.textContent = text || ''; }
async function exportPdf(btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Δημιουργία PDF…'; trayMessage('');
  try {
    await ensureDL(); updateExportUI();
    if (!canSave()) {
      trayMessage('Αυτή η προβολή δεν επιτρέπει αποθήκευση αρχείων. Ανοίξτε τον σύνδεσμο της σελίδας σε browser, συνδεδεμένοι στο claude.ai, και πατήστε ξανά «Εξαγωγή PDF». Η «Προεπισκόπηση» λειτουργεί κανονικά.', 'err');
      return;
    }
    await loadPdfLibs();
    const blob = await buildPdfBlob();
    const name = 'syntages' + (state.meta.reportNumber ? '_' + state.meta.reportNumber : '') + '.pdf';
    await saveFile(name, blob);
    trayMessage('Το PDF αποθηκεύτηκε.', 'ok'); setTimeout(() => trayMessage(''), 3000);
  } catch (err) {
    if (err && err.code === 'declined') trayMessage('');
    else trayMessage(err && err.message === 'load' ? 'Η βιβλιοθήκη δημιουργίας PDF δεν φορτώθηκε. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.' : 'Δεν ήταν δυνατή η δημιουργία του PDF.', 'err');
  } finally { btn.disabled = false; btn.textContent = label; }
}
$('trayExport').addEventListener('click', () => exportPdf($('trayExport')));
$('previewExport').addEventListener('click', () => exportPdf($('previewExport')));
