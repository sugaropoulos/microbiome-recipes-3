// Meal selection (tray), patient document HTML, A4 preview.
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// ---------- selection & patient document ----------
const MEALS = [
  { id: 'breakfast', one: 'Πρωινό', many: 'Πρωινά', add: 'Προσθήκη ως πρωινό', acc: 'πρωινά' },
  { id: 'lunch', one: 'Μεσημεριανό', many: 'Μεσημεριανά', add: 'Προσθήκη ως μεσημεριανό', acc: 'μεσημεριανά' },
  { id: 'dinner', one: 'Βραδινό', many: 'Βραδινά', add: 'Προσθήκη ως βραδινό', acc: 'βραδινά' },
  { id: 'snack', one: 'Σνακ', many: 'Σνακ', add: 'Προσθήκη ως σνακ', acc: 'σνακ' }
];
const SEL_KEY = 'recipe-selection-v2';
state.sel = { breakfast: [], lunch: [], dinner: [], snack: [] };
state.menu = null;
try { const saved = JSON.parse(localStorage.getItem(SEL_KEY) || 'null'); if (saved) for (const m of MEALS) if (Array.isArray(saved[m.id])) state.sel[m.id] = saved[m.id]; } catch {}
function saveSel() { try { localStorage.setItem(SEL_KEY, JSON.stringify(state.sel)); } catch {} }
function mealsOf(key) { return MEALS.filter(m => state.sel[m.id].includes(key)); }
function toggleMeal(key, meal) {
  const list = state.sel[meal]; const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1); else list.push(key);
  saveSel();
}
function selChips(key) {
  const ms = mealsOf(key);
  return ms.length ? `<span class="selchips">${ms.map(m => `<span class="selchip">✓ ${m.one}</span>`).join('')}</span>` : '';
}
function addControl(key) {
  const n = mealsOf(key).length, open = state.menu === key;
  return `<button type="button" class="addbtn${n ? ' has' : ''}" aria-expanded="${open}" aria-label="Προσθήκη στις επιλογές" title="Προσθήκη στις επιλογές">${n ? '✓' : '+'}</button>
    ${open ? `<div class="addmenu" role="menu">${MEALS.map(m => { const on = state.sel[m.id].includes(key);
      return `<button type="button" role="menuitemcheckbox" aria-checked="${on}" data-meal="${m.id}"><span class="tick">${on ? '✓' : ''}</span>${on ? 'Αφαίρεση από ' + m.acc : m.add}</button>`; }).join('')}</div>` : ''}`;
}
function mealButtons(key) {
  return `<div class="mealbtns" role="group" aria-label="Προσθήκη στις επιλογές">${MEALS.map(m => { const on = state.sel[m.id].includes(key);
    return `<button type="button" data-meal="${m.id}" aria-pressed="${on}"><span class="tick">${on ? '✓' : '+'}</span>${on ? m.one : m.add}</button>`; }).join('')}</div>`;
}
function renderRecipesKeep() { const y = window.scrollY; renderRecipes(); window.scrollTo(0, y); }
document.addEventListener('click', e => {
  if (state.menu && !e.target.closest('.addmenu') && !e.target.closest('.addbtn')) { const k = state.menu; state.menu = null; rerenderRecipe(k); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('preview').hidden) { closePreview(); return; }
  if (state.menu) { const k = state.menu; state.menu = null; rerenderRecipe(k); }
});
function selectedRows() {
  const byKey = new Map(state.results.map(x => [x.r.key, x]));
  return MEALS.map(m => ({ meal: m, rows: state.sel[m.id].map(k => byKey.get(k)).filter(Boolean) }));
}
function renderTray() {
  const groups = selectedRows();
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  $('tray').hidden = !total; document.body.classList.toggle('has-tray', !!total);
  if (!total) { $('trayPanel').hidden = true; $('trayToggle').setAttribute('aria-expanded', 'false'); return; }
  $('trayTotal').textContent = `${total} ${total === 1 ? 'συνταγή επιλεγμένη' : 'συνταγές επιλεγμένες'}`;
  $('trayCounts').textContent = groups.filter(g => g.rows.length).map(g => `${g.meal.many} ${g.rows.length}`).join(' · ');
  $('trayGroups').innerHTML = groups.map(g => `<div class="tray-group"><h4>${g.meal.many} · ${g.rows.length}</h4>${g.rows.length
    ? `<ul>${g.rows.map(x => `<li><span>${esc(x.r.title)}</span><button type="button" data-rm="${esc(g.meal.id)}|${esc(x.r.key)}" aria-label="Αφαίρεση ${esc(x.r.title)}">×</button></li>`).join('')}</ul>`
    : '<span class="none">Καμία επιλογή</span>'}</div>`).join('');
}
$('docFor').addEventListener('input', e => { e.target.dataset.auto = ''; });
$('trayToggle').addEventListener('click', () => {
  const open = $('trayPanel').hidden; $('trayPanel').hidden = !open;
  $('trayToggle').setAttribute('aria-expanded', String(open)); $('trayToggle').textContent = open ? 'Επιλογές ▾' : 'Επιλογές ▴';
});
$('trayGroups').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  const [meal, key] = b.dataset.rm.split('|'); toggleMeal(key, meal); renderTray(); rerenderRecipe(key);
});
$('trayClear').addEventListener('click', () => {
  const b = $('trayClear');
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Πατήστε ξανά για επιβεβαίωση'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Καθαρισμός επιλογών'; }, 3000); return; }
  for (const m of MEALS) state.sel[m.id] = [];
  saveSel(); b.dataset.confirm = ''; b.textContent = 'Καθαρισμός επιλογών'; renderTray(); renderRecipesKeep();
});

const QTY = /^(?:[\d½¼¾⅓⅔.,/\-–\s]+|περίπου\s+|λίγ\S*\s+)*(?:(?:κ\.[γσ]\.|γρ\.|ml|κιλ\S*|φλιτζ\S*|κούπ\S*|ποτήρ\S*|σκελίδ\S*|φέτ\S*|ματσάκ\S*|πρέζ\S*|κοφτ\S*|γεμάτ\S*)\s+)*/i;
const bareIng = t => t.replace(/\s*\([^)]*\)/g, '').replace(QTY, '').trim();
const lowerFirst = t => (t && /^[Α-ΩΆ-Ώ][α-ωά-ώ]/.test(t)) ? t[0].toLowerCase() + t.slice(1) : t;
function docRecipe(x, n) {
  const { r, a } = x; const has = !!state.report;
  let ing = '', lastG = null; const notes = [];
  a.lines.forEach((l, i) => {
    if (l.g && l.g !== lastG) { ing += `<li class="grp">${esc(l.g)}</li>`; lastG = l.g; }
    const flagged = has && l.hits.length && (l.hits.some(h => h.conf === 'def') || state.showPos);
    const opt = flagged ? chosen(r.key, i, l) : null;
    if (opt && opt.kind !== 'keep') {
      let nw;
      if (opt.kind === 'omit') nw = 'παραλείπεται';
      else if (opt.kind === 'less') nw = 'σε μικρότερη ποσότητα';
      else if (opt.kind === 'recipe') nw = opt.text;
      else nw = lowerFirst(opt.label);
      ing += `<li class="chg"><s>${esc(l.t)}</s><span class="new">→ ${esc(nw)}</span></li>`;
      if (opt.kind === 'prefer' || opt.kind === 'neutral') notes.push(`<b>${esc(bareIng(l.t))}</b> → ${esc(nw)}`);
      else if (opt.kind === 'omit') notes.push(`<b>${esc(bareIng(l.t))}</b>: παραλείπεται`);
    } else if (has && l.prefer.length) ing += `<li class="pref">${esc(l.t)}</li>`;
    else ing += `<li>${esc(l.t)}</li>`;
  });
  const meta = [r.serv, r.cats.join(', ')].filter(Boolean).join(' · ');
  return `<article class="d-rec">
    <header><span class="d-no">${n}</span><div><h3>${esc(r.title)}</h3>${meta ? `<p class="d-meta">${esc(meta)}</p>` : ''}</div></header>
    <div class="d-cols">
      <div><h5>Υλικά</h5><ul>${ing}</ul></div>
      <div><h5>Εκτέλεση</h5><p class="d-steps">${esc(r.steps || 'Η πηγή δεν δίνει οδηγίες εκτέλεσης.')}</p>
        ${notes.length ? `<p class="d-note">Στην εκτέλεση χρησιμοποιήστε τα νέα υλικά: ${notes.join('; ')}.</p>` : ''}
        ${(() => { const i = srcInfo(r); return i ? `<p class="d-src">Πηγή: ${i.href ? `<a href="${esc(i.href)}" target="_blank" rel="noopener">${esc(i.text)}</a>` : esc(i.text)}</p>` : ''; })()}</div>
    </div>
  </article>`;
}
function buildDoc() {
  const groups = selectedRows().filter(g => g.rows.length);
  const has = !!state.report;
  const today = new Date().toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });
  const who = $('docFor').value.trim();
  let n = 0;
  const meals = groups.map(g => ({ title: g.meal.many, recs: g.rows.map(x => docRecipe(x, ++n)) }));
  const cover = `<section class="d-cover">
      <span class="d-eyebrow">Πρόγραμμα συνταγών</span>
      <h1>Οι συνταγές σας</h1>
      <p class="d-lede">Συνταγές επιλεγμένες για ${groups.map(g => g.meal.acc).join(', ').replace(/, ([^,]*)$/, ' και $1')}.${has ? ' Όπου η ανάλυση μικροβιώματος προτείνει να μειώσετε κάποια τροφή, η συνταγή έχει προσαρμοστεί με εναλλακτική.' : ''}</p>
      <div class="d-fields" style="grid-template-columns:${has ? '1.4fr 1fr 1fr' : '1.4fr 1fr'}">
        <div><span>Για</span><b>${who ? esc(who) : '&nbsp;'}</b></div>
        <div><span>Ημερομηνία</span><b>${esc(today)}</b></div>
        ${has ? `<div><span>Βάσει αναφοράς</span><b>${esc(state.meta.reportNumber || state.sourceName || '—')}</b></div>` : ''}
      </div>
    </section>
    <div class="d-overview" style="grid-template-columns:repeat(${Math.min(groups.length, 4)}, minmax(0, 1fr))">${(() => { let k = 0; return groups.map(g => `<div class="d-ov"><h4>${g.meal.many}</h4><ol start="${k + 1}">${g.rows.map(x => { k++; return `<li>${esc(x.r.title)}</li>`; }).join('')}</ol></div>`).join(''); })()}</div>
    ${has ? `<div class="d-legend">
      <p><span class="d-sq" style="background:#23714A"></span><b style="color:#23714A">Πράσινο</b>: τροφή προς προτίμηση, σύμφωνα με την ανάλυσή σας.</p>
      <p><span class="d-sq" style="background:#ECEFEE;border:.5pt solid #9AA6A8"></span><b style="color:#5F6D70">Γκρι</b>: υλικό της συνταγής που άλλαξε. Το αρχικό φαίνεται διαγραμμένο και από κάτω, με μαύρα έντονα γράμματα (→), αυτό που το αντικαθιστά.</p>
      <p>Οι ποσότητες των νέων υλικών προσαρμόζονται κατά την κρίση σας ή του διατροφολόγου σας.</p>
    </div>
    <div class="d-closing">Οι προσαρμογές βασίζονται στους πίνακες «Τροφές προς προτίμηση» και «Τροφές προς μείωση» της ανάλυσης μικροβιώματος. Δεν αντικαθιστούν τη συμβουλή του διατροφολόγου ή του γιατρού σας, ιδιαίτερα αν υπάρχουν αλλεργίες ή άλλα θέματα υγείας.</div>` : ''}`;
  return { cover, meals };
}
// Lay the document out on A4 pages (180 × 265 mm content area): cover on page 1, each meal starts a new page,
// a recipe is never split, and a meal heading always stays with its first recipe.
function paginate() {
  const { cover, meals } = buildDoc();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;';
  document.body.appendChild(host);
  const probe = document.createElement('div'); probe.style.height = '265mm'; host.appendChild(probe);
  const maxH = probe.getBoundingClientRect().height; probe.remove();
  const pages = [];
  const newPage = () => { const pg = document.createElement('div'); pg.className = 'pdoc d-page'; pg.lang = 'el'; host.appendChild(pg); pages.push(pg); return pg; };
  newPage().innerHTML = cover;
  for (const m of meals) {
    let pg = newPage(); let first = true;
    for (const rec of m.recs) {
      const wrap = document.createElement('div');
      wrap.innerHTML = (first ? `<h2 class="d-mealh">${esc(m.title)}</h2>` : '') + rec;
      pg.appendChild(wrap);
      if (pg.getBoundingClientRect().height > maxH && pg.children.length > 1) {
        pg.removeChild(wrap);
        if (first) wrap.innerHTML = `<h2 class="d-mealh">${esc(m.title)}</h2>` + rec;
        else wrap.innerHTML = `<p class="d-cont">${esc(m.title)} (συνέχεια)</p>` + rec;
        pg = newPage(); pg.appendChild(wrap);
      }
      first = false;
    }
  }
  pages.forEach(pg => pg.querySelectorAll('.d-rec').forEach((r, i, all) => { if (i === all.length - 1) r.classList.add('d-last'); }));
  return { host, pages };
}
function openPreview() {
  const sheet = $('previewSheet'); sheet.innerHTML = '';
  const { host, pages } = paginate();
  pages.forEach((pg, i) => { const s = document.createElement('div'); s.className = 'preview-sheet'; s.appendChild(pg); s.insertAdjacentHTML('beforeend', `<span class="pgno">${i + 1} / ${pages.length}</span>`); sheet.appendChild(s); });
  host.remove();
  $('preview').hidden = false; $('previewClose').focus();
}
function closePreview() { $('preview').hidden = true; $('trayPreview').focus(); }
$('trayPreview').addEventListener('click', openPreview);
$('previewClose').addEventListener('click', closePreview);
$('preview').addEventListener('click', e => { if (e.target.id === 'preview') closePreview(); });
