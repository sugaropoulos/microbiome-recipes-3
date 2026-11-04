// UI event handlers for filters, recipe list and copy.
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// ---------- events ----------
$('tiles').addEventListener('click', e => { const t = e.target.closest('.tile'); if (!t) return; state.filter = t.dataset.filter; state.limit = PAGE; renderTiles(); renderRecipes(); });
$('q').addEventListener('input', e => { state.q = e.target.value; state.limit = PAGE; renderRecipes(); });
$('cat').addEventListener('change', e => { state.cat = e.target.value; state.limit = PAGE; if (state.report) renderTiles(); renderRecipes(); });
$('srcSel').addEventListener('change', e => { state.src = e.target.value; state.limit = PAGE; if (state.report) renderTiles(); renderRecipes(); });
$('sort').addEventListener('change', e => { state.sort = e.target.value; renderRecipes(); });
$('showPos').addEventListener('change', e => { state.showPos = e.target.checked; renderLists(); renderTiles(); renderRecipes(); });
$('reduceList').addEventListener('click', e => {
  const b = e.target.closest('[data-food]'); if (!b) return;
  state.food = state.food === b.dataset.food ? null : b.dataset.food; state.limit = PAGE;
  renderLists(); renderRecipes();
  if (state.food) $('recH').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('foodFilter').addEventListener('click', e => { if (e.target.id === 'clearFood') { state.food = null; renderLists(); renderRecipes(); } });
$('ledger').addEventListener('click', e => {
  if (e.target.id === 'moreBtn') { state.limit += PAGE; renderRecipes(); return; }
  const art = e.target.closest('.recipe'); if (!art) return;
  const key = art.dataset.key;
  const addb = e.target.closest('.addbtn');
  if (addb) { state.menu = state.menu === key ? null : key; renderRecipesKeep(); return; }
  const mb = e.target.closest('[data-meal]');
  if (mb) { toggleMeal(key, mb.dataset.meal); if (mb.closest('.addmenu')) state.menu = null; rerenderRecipe(key); renderTray(); return; }
  if (e.target.closest('.rhead')) {
    state.open.has(key) ? state.open.delete(key) : state.open.add(key);
    rerenderRecipe(key); return;
  }
  const opt = e.target.closest('.opt');
  if (opt) { state.choice.set(key + '|' + opt.dataset.line, opt.dataset.opt); rerenderRecipe(key); return; }
  const act = e.target.closest('[data-act]');
  if (act && act.dataset.act === 'copy') copyRecipe(key, art);
  if (act && act.dataset.act === 'ai') runAI(key);
});

function recipeText(key) {
  const { r, a } = state.results.find(x => x.r.key === key);
  const out = [r.title, ''];
  const changes = [];
  let lastG = null;
  out.push('Υλικά (τροποποιημένα):');
  a.lines.forEach((l, i) => {
    if (l.g && l.g !== lastG) { out.push(l.g + ':'); lastG = l.g; }
    const flagged = l.hits.length && (l.hits.some(h => h.conf === 'def') || state.showPos);
    const m = flagged ? modifiedText(l, chosen(r.key, i, l)) : { text: l.t };
    if (m.omitted) { changes.push('Παραλείπεται: ' + l.t); return; }
    out.push('• ' + m.text);
    if (m.changed) changes.push(l.t + ' → ' + m.text);
  });
  if (changes.length) out.push('', 'Αλλαγές:', ...changes.map(c => '– ' + c));
  if (r.steps) out.push('', stepsTitle(r) + ':', r.steps);
  const si = srcInfo(r); if (si) out.push('', 'Πηγή: ' + si.text + (si.href ? ' (' + si.href + ')' : ''));
  return { text: out.join('\n'), changes };
}
async function copyRecipe(key, art) {
  const { text } = recipeText(key);
  const note = art.querySelector('[data-copied]');
  try { await navigator.clipboard.writeText(text); note.textContent = 'Αντιγράφηκε.'; }
  catch { note.textContent = 'Η αντιγραφή δεν επιτρέπεται εδώ — επιλέξτε το κείμενο της στήλης χειροκίνητα.'; }
}
