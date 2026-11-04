// Excel export and file saving (claude.ai save capability or normal browser download).
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// ---------- export ----------
function exportRows() {
  const summary = [['Συνταγή', 'Κατηγορίες', 'Κατάσταση', 'Υλικά προς αλλαγή', 'Υλικά προς έλεγχο', 'Τροφές προς μείωση', 'Τροφές προς προτίμηση', 'Πηγή']];
  const changes = [['Συνταγή', 'Υλικό συνταγής', 'Τροφή αναφοράς', 'Βεβαιότητα', 'Εναλλακτική της συνταγής', 'Επιλεγμένη αλλαγή', 'Άλλες προτάσεις']];
  for (const { r, a } of filtered()) {
    const red = [...new Set(a.lines.flatMap(l => l.hits.map(h => labelOf(h.id))))].join(', ');
    const si = srcInfo(r);
    summary.push([r.title, r.cats.join(', '), STATUS[statusFor(a)].label, a.def, a.pos, red, a.preferFoods.map(labelOf).join(', '), si ? si.text + (si.href ? ' — ' + si.href : '') : '']);
    a.lines.forEach((l, i) => {
      if (!l.hits.length || (!l.hits.some(h => h.conf === 'def') && !state.showPos)) return;
      const { opts } = lineOptions(l); const cur = chosen(r.key, i, l);
      const m = modifiedText(l, cur);
      changes.push([r.title, l.t, l.hits.map(h => reportNameOf(h.id)).join(' · '), l.hits.some(h => h.conf === 'def') ? 'Βέβαιο' : 'Πιθανό', l.alt || '',
        m.omitted ? 'Παράλειψη' : (m.changed ? m.text : 'Χωρίς αλλαγή'),
        opts.filter(o => !['keep', 'omit'].includes(o.kind) && o.key !== (cur && cur.key)).map(o => o.label + (o.kind === 'prefer' ? ' (λίστα)' : o.kind === 'neutral' ? ' (ουδέτερο)' : '')).join('; ')]);
    });
  }
  const counts = new Map();
  for (const { a } of state.results) for (const id of new Set(a.lines.flatMap(l => l.hits.filter(h => h.conf === 'def').map(h => h.id)))) counts.set(id, (counts.get(id) || 0) + 1);
  const lists = [['Πίνακας', 'Κατηγορία', 'Τροφή (όπως στην αναφορά)', 'Αντιστοίχιση λεξικού', 'Συνταγές που την περιέχουν']];
  const map = new Map(state.lists.mapping.map(m => [m.side + '|' + m.name, m]));
  for (const side of ['prefer', 'reduce']) for (const it of state.report[side]) {
    const m = map.get(side + '|' + it.name) || {};
    lists.push([side === 'prefer' ? 'Προς προτίμηση' : 'Προς μείωση', it.category, it.name, m.id && m.id.startsWith('auto_') ? 'αυτόματη' : labelOf(m.id), side === 'reduce' ? (counts.get(m.id) || 0) : '']);
  }
  return { summary, changes, lists };
}
let DL = null;
// Outside claude.ai (own website, opened as a file) the page is not framed, so a normal browser download works.
let FRAMED = true; try { FRAMED = window.self !== window.top; } catch { FRAMED = true; }
const canSave = () => !!DL || !FRAMED;
async function ensureDL() { if (!DL) { try { DL = window.claude && await window.claude.use('downloads'); } catch { DL = null; } } return DL; }
async function saveFile(name, blob) {
  await ensureDL();
  if (DL) { await DL.save({ filename: name, data: blob }); return; }
  if (FRAMED) { const e = new Error('nosave'); e.code = 'nosave'; throw e; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function setupDownloads() {
  try { DL = window.claude && await window.claude.use('downloads'); } catch { DL = null; }
  updateExportUI();
}
function updateExportUI() {
  const has = !!state.report;
  $('exportBtn').hidden = !(has && canSave() && window.XLSX);
  $('copyTsvBtn').hidden = !has || !!(canSave() && window.XLSX);
}
$('exportBtn').addEventListener('click', async () => {
  const btn = $('exportBtn');
  const { summary, changes, lists } = exportRows();
  const wb = XLSX.utils.book_new();
  const add = (rows, name, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add(summary, 'Σύνοψη', [42, 22, 24, 10, 10, 50, 50, 50]);
  add(changes, 'Αλλαγές', [42, 50, 32, 11, 36, 44, 60]);
  add(lists, 'Λίστες αναφοράς', [16, 24, 44, 30, 14]);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const name = 'prosarmogi_syntagon' + (state.meta.reportNumber ? '_' + state.meta.reportNumber : '') + '.xlsx';
  btn.disabled = true;
  try { await saveFile(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); btn.textContent = 'Αποθηκεύτηκε'; }
  catch (err) { btn.textContent = err && err.code === 'declined' ? 'Εξαγωγή σε Excel' : 'Η εξαγωγή δεν είναι διαθέσιμη εδώ'; }
  finally { btn.disabled = false; setTimeout(() => { btn.textContent = 'Εξαγωγή σε Excel'; }, 2500); }
});
$('copyTsvBtn').addEventListener('click', async () => {
  const { changes } = exportRows();
  const tsv = changes.map(r => r.map(c => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
  const btn = $('copyTsvBtn');
  try { await navigator.clipboard.writeText(tsv); btn.textContent = 'Αντιγράφηκε'; } catch { btn.textContent = 'Η αντιγραφή δεν επιτρέπεται εδώ'; }
  setTimeout(() => { btn.textContent = 'Αντιγραφή πίνακα αλλαγών'; }, 2500);
});
