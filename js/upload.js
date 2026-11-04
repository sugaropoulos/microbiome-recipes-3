// Report PDF upload and temporary recipe workbook replacement.
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// ---------- PDF upload ----------
async function handlePdf(file) {
  const msg = $('pdfMsg');
  msg.hidden = false; msg.className = 'msg'; msg.textContent = 'Ανάγνωση PDF…';
  try {
    if (!window.pdfjsLib) throw new Error('Η βιβλιοθήκη ανάγνωσης PDF δεν φορτώθηκε. Ανανεώστε τη σελίδα.');
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
    const rep = await parseReport(doc);
    const who = await readPatientName(doc, file.name);
    const fld = $('docFor');
    if (who && (!fld.value.trim() || fld.dataset.auto === '1')) { fld.value = who; fld.dataset.auto = '1'; }
    if (!rep.prefer.length && !rep.reduce.length) throw new Error('Ο πίνακας βρέθηκε αλλά χωρίς τροφές.');
    state.report = rep; state.meta = rep.meta || {}; state.sourceKind = 'file'; state.sourceName = file.name;
    state.food = null; state.open.clear();
    analyzeAll(); renderAll();
    msg.className = 'msg ok';
    msg.textContent = `Βρέθηκαν ${rep.prefer.length} τροφές προς προτίμηση και ${rep.reduce.length} προς μείωση.`;
  } catch (err) {
    msg.className = 'msg err';
    const m = String(err && err.message || err);
    msg.textContent = /Invalid PDF|InvalidPDF/i.test(m) ? 'Το αρχείο δεν είναι έγκυρο PDF.' :
      (/πίνακας/.test(m) ? 'Αυτή η αναφορά δεν έχει πίνακα «Τροφές προς προτίμηση / προς μείωση» (π.χ. νεότερη μορφή αναφοράς χωρίς διατροφικές συμβουλές) ή είναι σαρωμένη εικόνα χωρίς κείμενο.' : m) + (state.report ? ' Παραμένει φορτωμένη η προηγούμενη αναφορά.' : '');
  }
}
$('pdfInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) handlePdf(f); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])].find(f => /pdf$/i.test(f.name) || f.type === 'application/pdf'); if (f) handlePdf(f); });


// ---------- recipe workbook replacement ----------
function parseRecipesWorkbook(wb) {
  const find = rx => wb.SheetNames.find(n => rx.test(N(n)));
  const rows = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  const rs = find(/συνταγ/) || wb.SheetNames[0];
  const recs = rows(rs);
  const col = (row, rx) => { const k = Object.keys(row).find(k => rx.test(N(k))); return k ? row[k] : null; };
  const out = new Map();
  recs.forEach((row, i) => {
    const title = col(row, /^τιτλ|title/); if (!title) return;
    const id = col(row, /^α\/α|^id$|^#/) ?? (i + 1);
    const ingText = col(row, /^υλικ|ingredient/);
    const r = { id, title: String(title).trim(), cats: String(col(row, /κατηγορ|categor/) || '').split(',').map(s => s.trim()).filter(Boolean),
      serv: col(row, /μεριδ|serving/), steps: col(row, /εκτελεσ|οδηγι|method/), nutr: col(row, /διατροφικ\w* αναλυσ|nutrition/), url: col(row, /συνδεσμ|^url|^link/) ?? col(row, /^πηγη \(|^source \(/), src: col(row, /^πηγη$|^source$/) || '', acct: col(row, /λογαριασμ/), kind: col(row, /ειδοσ εκτελεσ/), code: col(row, /^κωδικ/), ing: [] };
    if (ingText) { let g = null; String(ingText).split(/\n/).forEach(t => { t = t.trim(); if (!t) return; const b = t.match(/^[•\-*]\s*(.+)$/); if (b) r.ing.push({ t: b[1], g }); else if (/:$/.test(t)) g = t.replace(/:$/, ''); else r.ing.push({ t, g }); }); }
    out.set(String(id), r);
  });
  const ingSheet = find(/^υλικα$|ingredients/);
  if (ingSheet) {
    const used = new Set();
    rows(ingSheet).forEach(row => {
      const rid = String(col(row, /^α\/α|^id$|recipe/)); const t = col(row, /^υλικο$|ingredient$/);
      const r = out.get(rid); if (!r || !t) return;
      if (!used.has(rid)) { r.ing = []; used.add(rid); }
      r.ing.push({ t: String(t).trim(), g: col(row, /ομαδα|group/) || null });
    });
  }
  return [...out.values()].filter(r => r.ing.length);
}
$('xlsxInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const msg = $('xlsxMsg'); msg.hidden = false; msg.className = 'msg';
  try {
    if (!window.XLSX) throw new Error('Η βιβλιοθήκη Excel δεν φορτώθηκε.');
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const recs = parseRecipesWorkbook(wb);
    if (!recs.length) throw new Error('Δεν βρέθηκαν συνταγές. Χρειάζεται φύλλο με στήλες «Τίτλος» και «Υλικά».');
    state.recipes = prepRecipes(recs); state.recipeSource = f.name; state.open.clear();
    analyzeAll(); renderAll();
    msg.className = 'msg ok'; msg.textContent = `Φορτώθηκαν ${recs.length} συνταγές.`;
  } catch (err) { msg.className = 'msg err'; msg.textContent = String(err.message || err); }
});
