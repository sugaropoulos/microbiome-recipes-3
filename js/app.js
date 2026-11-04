// App state, recipe analysis and rendering (report lists, status tiles, recipe list and detail).
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = {
  ok: { label: 'Συμβατή', tile: 'Συμβατές' },
  check: { label: 'Προς έλεγχο', tile: 'Μόνο πιθανές' },
  modify: { label: 'Με τροποποιήσεις', tile: 'Με τροποποιήσεις' },
  core: { label: 'Βασικό υλικό προς μείωση', tile: 'Βασικό υλικό προς μείωση' }
};
const PAGE = 60;
const state = {
  report: null, sourceKind: 'none', sourceName: '', meta: {},
  recipes: BUILTIN_RECIPES, recipeSource: 'ενσωματωμένες συνταγές (diatrofi.gr, 3ada diatrofi και βιβλία)', src: '',
  lists: null, results: [], filter: 'all', cat: '', q: '', sort: 'fit', showPos: true, food: null,
  open: new Set(), choice: new Map(), limit: PAGE, ai: new Map()
};

function prepRecipes(list) {
  list.forEach((r, i) => { r.key = r.key || (r.code ? 'c:' + r.code : 'r' + (r.id ?? i)); r.ing.forEach(x => { x.n = N(x.t); }); r.searchN = N(r.title + ' ' + r.ing.map(x => x.t).join(' ')); });
  return list;
}
prepRecipes(BUILTIN_RECIPES);

function statusFor(a) {
  if (a.core.length) return 'core';
  if (a.def) return 'modify';
  if (a.pos && state.showPos) return 'check';
  return 'ok';
}
function labelOf(id) { return LEXI[id] ? LEXI[id].label : id; }
function reportNameOf(id) { const v = state.lists.sets.reduce.get(id) || state.lists.sets.prefer.get(id); return v ? v.join(' · ') : labelOf(id); }

function analyzeAll() {
  state.lists = buildLists(state.report || { prefer: [], reduce: [], superfoods: [] });
  state.results = state.recipes.map(r => ({ r, a: analyzeRecipe(r, state.lists) }));
  state.choice.clear(); state.ai.clear();
  state.limit = PAGE;
}

// ---------- line options (alternatives + swaps) ----------
function lineOptions(line) {
  const opts = [];
  const isDef = line.hits.some(h => h.conf === 'def');
  if (line.alt) opts.push({ key: 'alt', label: line.alt, kind: 'recipe', text: line.alt });
  const seen = new Set();
  for (const h of line.hits) {
    for (const s of suggestions(h.id, state.lists)) {
      const k = N(s.label); if (seen.has(k)) continue; seen.add(k);
      let kind = s.status === 'prefer' ? 'prefer' : 'neutral';
      if (/^παραλειψη/.test(k)) { opts.push({ key: 'omit', label: 'Παράλειψη', kind: 'omit' }); continue; }
      if (/^μικροτερη ποσοτητα/.test(k)) { opts.push({ key: 'less', label: 'Μικρότερη ποσότητα', kind: 'less' }); continue; }
      opts.push({ key: 's:' + k, label: s.label, kind });
    }
  }
  if (!opts.some(o => o.kind === 'omit')) opts.push({ key: 'omit', label: 'Παράλειψη', kind: 'omit' });
  opts.push({ key: 'keep', label: 'Χωρίς αλλαγή', kind: 'keep' });
  const def = isDef ? (opts[0].kind === 'omit' ? opts.find(o => o.kind === 'less') || opts[0] : opts[0]) : opts.find(o => o.kind === 'keep');
  return { opts, def };
}
function chosen(rkey, idx, line) {
  const { opts, def } = lineOptions(line);
  const k = state.choice.get(rkey + '|' + idx);
  return opts.find(o => o.key === k) || def;
}
function modifiedText(line, opt) {
  if (!opt || opt.kind === 'keep') return { text: line.t, changed: false };
  if (opt.kind === 'recipe') return { text: opt.text, changed: true, note: 'εναλλακτική που δίνει η συνταγή' };
  if (opt.kind === 'omit') return { text: line.t, omitted: true };
  if (opt.kind === 'less') return { text: line.t + ' — σε μικρότερη ποσότητα', changed: true };
  return { text: opt.label, changed: true, note: 'αντί για: ' + line.t };
}

// ---------- render: source + lists ----------
function renderSource() {
  const b = $('srcBadge');
  b.className = 'badge ' + (state.report ? 'file' : '');
  b.textContent = state.report ? (state.meta.reportNumber ? 'Αναφορά ' + state.meta.reportNumber + ' · ' : '') + state.sourceName : 'Δεν έχει φορτωθεί αναφορά';
  $('stPrefer').textContent = state.report ? state.report.prefer.length : '—';
  $('stReduce').textContent = state.report ? state.report.reduce.length : '—';
  $('stRecipes').textContent = state.recipes.length;
  $('recSrc').textContent = 'Πηγή συνταγών: ' + state.recipeSource + '.';
}
function groupByCat(items) {
  const m = new Map();
  for (const it of items) { if (!m.has(it.category)) m.set(it.category, []); m.get(it.category).push(it); }
  return m;
}
function renderLists() {
  const counts = new Map();
  for (const { a } of state.results) for (const id of new Set(a.lines.flatMap(l => l.hits.filter(h => h.conf === 'def' || state.showPos).map(h => h.id)))) counts.set(id, (counts.get(id) || 0) + 1);
  const map = new Map(state.lists.mapping.map(m => [m.side + '|' + m.name, m]));
  const block = (side) => {
    let html = '';
    for (const [cat, items] of groupByCat(state.report[side])) {
      html += `<div class="cat"><h4>${esc(cat)}</h4><div class="chips">`;
      for (const it of items) {
        const m = map.get(side + '|' + it.name) || {};
        const auto = m.id && m.id.startsWith('auto_');
        const autoMark = auto ? ' <span class="auto" title="Δεν υπάρχει στο λεξικό· αυτόματη αντιστοίχιση">?</span>' : '';
        if (side === 'reduce') {
          const n = counts.get(m.id) || 0;
          html += `<button type="button" class="food" data-food="${esc(m.id)}" aria-pressed="${state.food === m.id}" title="${esc(labelOf(m.id))}">${esc(it.name)}${autoMark}<span class="n">${n}</span></button>`;
        } else html += `<span class="food" title="${esc(labelOf(m.id))}">${esc(it.name)}${autoMark}</span>`;
      }
      html += '</div></div>';
    }
    return html || '<p class="muted">Δεν βρέθηκαν τροφές.</p>';
  };
  $('preferList').innerHTML = block('prefer');
  $('reduceList').innerHTML = block('reduce');
  const sf = state.report.superfoods || [];
  $('superfoods').hidden = !sf.length;
  $('superfoods').innerHTML = sf.length ? `<span class="eyebrow">Προσωποποιημένες υπερτροφές</span><div class="chips">${sf.map(s => `<span class="food">${esc(s)}</span>`).join('')}</div>` : '';
  const autoN = state.lists.mapping.filter(m => m.id && m.id.startsWith('auto_') && m.side !== 'super').length;
  $('listsSummary').textContent = `${state.report.prefer.length} προς προτίμηση · ${state.report.reduce.length} προς μείωση` + (sf.length ? ` · ${sf.length} υπερτροφές` : '') + (autoN ? ` · ${autoN} με αυτόματη αντιστοίχιση` : '');
}

// ---------- render: recipes ----------
function filtered() {
  const q = N(state.q);
  let rows = state.results.filter(({ r, a }) => {
    const st = statusFor(a);
    if (state.filter !== 'all' && st !== state.filter) return false;
    if (state.cat && !r.cats.includes(state.cat)) return false;
    if (!srcMatch(r)) return false;
    if (state.food && !a.lines.some(l => l.hits.some(h => h.id === state.food && (h.conf === 'def' || state.showPos)))) return false;
    if (q && !r.searchN.includes(q)) return false;
    return true;
  });
  const rank = { ok: 0, check: 1, modify: 2, core: 3 };
  const sortKey = t => t.replace(/^[«»"'“”‘’(\s]+/, '');
  const byTitle = (x, y) => sortKey(x.r.title).localeCompare(sortKey(y.r.title), 'el');
  if (state.sort === 'fit') rows.sort((x, y) => rank[statusFor(x.a)] - rank[statusFor(y.a)] || x.a.def - y.a.def || (y.a.preferFoods.length - x.a.preferFoods.length) || byTitle(x, y));
  else if (state.sort === 'prefer') rows.sort((x, y) => (y.a.preferFoods.length + y.a.superHits) - (x.a.preferFoods.length + x.a.superHits) || x.a.def - y.a.def || byTitle(x, y));
  else rows.sort(byTitle);
  return rows;
}
function renderTiles() {
  const c = { all: 0, ok: 0, check: 0, modify: 0, core: 0 };
  for (const { r, a } of state.results) {
    if (state.cat && !r.cats.includes(state.cat)) continue;
    if (!srcMatch(r)) continue;
    c.all++; c[statusFor(a)]++;
  }
  $('tiles').innerHTML = ['all', 'ok', 'check', 'modify', 'core'].map(k =>
    `<button type="button" class="tile ${k}" data-filter="${k}" aria-pressed="${state.filter === k}"><b>${c[k]}</b><span>${k === 'all' ? 'Όλες οι συνταγές' : STATUS[k].tile}</span></button>`).join('');
}
function recipeRow({ r, a }) {
  const st = statusFor(a);
  const isOpen = state.open.has(r.key);
  if (!state.report) {
    const meta0 = [srcShort(r), r.cats.join(', '), r.serv].filter(Boolean).join(' · ');
    return `<article class="recipe" data-key="${esc(r.key)}">
    <button type="button" class="rhead" aria-expanded="${isOpen}">
      <div><div class="rtitle">${esc(r.title)}</div><div class="rmeta">${esc(meta0)}</div></div>
      <div class="rside">${selChips(r.key)}<span class="cnt">${r.ing.length} υλικά</span></div>
    </button>
    ${addControl(r.key)}
    ${isOpen ? renderPlain(r) : ''}
  </article>`;
  }
  const defIds = new Set(), posIds = new Set();
  a.lines.forEach(l => l.hits.forEach(h => (h.conf === 'def' ? defIds : posIds).add(h.id)));
  posIds.forEach(id => { if (defIds.has(id)) posIds.delete(id); });
  const chips = [...defIds].map(id => `<span class="mini r">${esc(labelOf(id))}</span>`)
    .concat(state.showPos ? [...posIds].map(id => `<span class="mini r pos">${esc(labelOf(id))}?</span>`) : [])
    .concat(a.preferFoods.slice(0, 6).map(id => `<span class="mini ${state.lists.superIds.has(id) ? 's' : 'p'}">${esc(labelOf(id))}</span>`)).join('');
  const nDef = a.def, nPos = state.showPos ? a.pos : 0;
  const cnt = [nDef ? `${nDef} ${nDef === 1 ? 'υλικό' : 'υλικά'} προς αλλαγή` : '', nPos ? `${nPos} προς έλεγχο` : ''].filter(Boolean).join(' · ') || 'καμία αλλαγή';
  const meta = [srcShort(r), r.cats.join(', '), r.serv].filter(Boolean).join(' · ');
  return `<article class="recipe" data-key="${esc(r.key)}">
    <button type="button" class="rhead" aria-expanded="${isOpen}">
      <div><div class="rtitle">${esc(r.title)}</div><div class="rmeta">${esc(meta)}</div></div>
      <div class="rside"><span class="pill ${st}">${STATUS[st].label}</span>${selChips(r.key)}<span class="cnt">${cnt}</span></div>
      ${chips ? `<div class="rchips">${chips}</div>` : ''}
    </button>
    ${addControl(r.key)}
    ${isOpen ? renderDetail(r, a) : ''}
  </article>`;
}
function renderPlain(r) {
  let ing = '', lastG = null;
  r.ing.forEach(l => { if (l.g && l.g !== lastG) { ing += `<li class="grp">${esc(l.g)}</li>`; lastG = l.g; } ing += `<li class="ing"><div class="itext">${esc(l.t)}</div></li>`; });
  return `<div class="detail">
    ${mealButtons(r.key)}
    <div class="dgrid">
      <div><h4>Υλικά συνταγής</h4><ul class="ings">${ing}</ul></div>
      <div>${r.steps ? `<h4>${esc(stepsTitle(r))}</h4><p class="steps-text">${esc(r.steps)}</p>` : ''}<p class="muted" style="font-size:.88rem">Ανεβάστε την αναφορά μικροβιώματος για να δείτε τις προτεινόμενες αλλαγές.</p></div>
    </div>
    <div class="dfoot muted" style="font-size:.85rem">${r.nutr ? `<span>Διατροφική ανάλυση (πηγή): ${esc(r.nutr)}</span>` : ''}${srcHtml(r)}</div>
  </div>`;
}
function renderDetail(r, a) {
  const showLine = l => l.hits.length && (l.hits.some(h => h.conf === 'def') || state.showPos);
  let ingHtml = '', modHtml = '', lastG = null, lastGm = null;
  a.lines.forEach((l, i) => {
    if (l.g && l.g !== lastG) { ingHtml += `<li class="grp">${esc(l.g)}</li>`; lastG = l.g; }
    const flagged = showLine(l);
    const isDef = l.hits.some(h => h.conf === 'def');
    const cls = flagged ? (isDef ? 'def' : 'pos') : (l.prefer.length ? 'pref' : '');
    let inner = `<div class="itext">${esc(l.t)}</div>`;
    if (flagged) {
      const hitTxt = l.hits.filter(h => h.conf === 'def' || state.showPos).map(h => {
        const c = LEXI[h.id];
        const why = h.conf === 'pos' ? (c.pnote || 'πιθανή αντιστοίχιση') : (c.note || '');
        return `<span class="who">${h.conf === 'pos' ? 'Πιθανό: ' : 'Προς μείωση: '}${esc(reportNameOf(h.id))}</span>${why ? `<span class="why">${esc(why)}</span>` : ''}`;
      }).join(' ');
      const { opts } = lineOptions(l);
      const cur = chosen(r.key, i, l);
      const optHtml = opts.map(o => {
        const tag = o.kind === 'prefer' ? '<span class="k">λίστα</span>' : o.kind === 'recipe' ? '<span class="k">συνταγή</span>' : o.kind === 'neutral' ? '<span class="k">ουδέτερο</span>' : '';
        return `<button type="button" role="radio" class="opt ${o.kind}" data-opt="${esc(o.key)}" data-line="${i}" aria-checked="${cur && cur.key === o.key}">${tag}${esc(o.label)}</button>`;
      }).join('');
      inner += `<div class="hitline">${hitTxt}</div><div class="opts" role="radiogroup" aria-label="Επιλογή αλλαγής">${optHtml}</div>`;
    } else if (l.prefer.length) {
      inner = `<div class="itext" title="Προς προτίμηση: ${esc(l.prefer.map(reportNameOf).join(', '))}">${esc(l.t)}</div>`;
    }
    ingHtml += `<li class="ing ${cls}">${inner}</li>`;
    // modified list
    if (l.g && l.g !== lastGm) { modHtml += `<li class="grp">${esc(l.g)}</li>`; lastGm = l.g; }
    const m = flagged ? modifiedText(l, chosen(r.key, i, l)) : { text: l.t };
    if (m.omitted) modHtml += `<li class="omitted">${esc(m.text)}</li>`;
    else if (m.changed) modHtml += `<li class="changed">${esc(m.text)}${m.note ? `<small>${esc(m.note)}</small>` : ''}</li>`;
    else modHtml += `<li>${esc(m.text)}</li>`;
  });
  const coreNote = a.core.length ? `<p class="msg err">Ο τίτλος περιέχει τροφή προς μείωση (${a.core.map(labelOf).join(', ')}): η συνταγή αλλάζει χαρακτήρα με την αντικατάσταση.</p>` : '';
  const aiState = state.ai.get(r.key);
  return `<div class="detail">
    ${mealButtons(r.key)}
    ${coreNote ? `<div>${coreNote}</div>` : ''}
    <div class="dgrid">
      <div><h4>Υλικά συνταγής</h4><ul class="ings">${ingHtml}</ul></div>
      ${a.lines.some(showLine) ? `<div><h4>Τροποποιημένα υλικά</h4><ul class="mods">${modHtml}</ul>
        <div class="dfoot"><button type="button" class="btn" data-act="copy">Αντιγραφή τροποποιημένης συνταγής</button><span class="muted" data-copied style="font-size:.85rem"></span></div>
      </div>` : `<div><h4>Τροποποιημένα υλικά</h4><p class="msg ok">Κανένα υλικό δεν βρίσκεται στη λίστα «προς μείωση»· η συνταγή μένει ως έχει.</p>${a.preferFoods.length ? `<p class="muted" style="font-size:.88rem">Περιέχει τροφές προς προτίμηση: ${esc(a.preferFoods.map(labelOf).join(', '))}.</p>` : ''}</div>`}
    </div>
    ${r.steps ? `<div class="method"><h4 class="eyebrow" style="margin:0">${esc(stepsTitle(r))}</h4><p class="steps-text">${esc(r.steps)}</p></div>` : ''}
    <div class="ai" data-ai ${AI.ready ? '' : 'hidden'}>
      <div class="dfoot"><button type="button" class="btn" data-act="ai" ${aiState && aiState.busy ? 'disabled' : ''}>Γράψε την εκτέλεση με τις αλλαγές</button><span class="muted" style="font-size:.82rem">Το Claude ξαναγράφει τα βήματα με βάση τις επιλογές σας.</span></div>
      ${aiState ? `<div class="ai-out" data-ai-out>${esc(aiState.text || '…')}</div>` : ''}
    </div>
    <div class="dfoot muted" style="font-size:.85rem">${r.nutr ? `<span>Διατροφική ανάλυση (πηγή): ${esc(r.nutr)}</span>` : ''}${srcHtml(r)}</div>
  </div>`;
}
function renderRecipes() {
  const rows = filtered();
  $('countLine').textContent = `${rows.length} από ${state.results.length} συνταγές`;
  $('foodFilter').innerHTML = state.food ? `<span class="active-filter">Περιέχει: ${esc(reportNameOf(state.food))}<button type="button" id="clearFood" aria-label="Κατάργηση φίλτρου">×</button></span>` : '';
  if (!rows.length) { $('ledger').innerHTML = '<div class="empty">Καμία συνταγή δεν ταιριάζει με τα φίλτρα.</div>'; return; }
  const shown = rows.slice(0, state.limit);
  $('ledger').innerHTML = shown.map(recipeRow).join('') + (rows.length > shown.length ? `<div class="more"><button type="button" class="btn" id="moreBtn">Εμφάνιση ${Math.min(PAGE, rows.length - shown.length)} ακόμη (${rows.length - shown.length} απομένουν)</button></div>` : '');
}
// ---------- recipe sources ----------
// diatrofi.gr (site), 3ada_diatrofi (Instagram posts), anything else = a book (the «Σύνδεσμος πηγής» column holds e.g. «Βιβλίο PDF, σελ. 173»)
function srcGroup(r) { const s = r.src || ''; return s === 'diatrofi.gr' ? 'web' : s === '3ada_diatrofi' ? 'ig' : s ? 'book' : 'other'; }
const isLink = u => /^https?:\/\//i.test(String(u || ''));
function srcShort(r) { const g = srcGroup(r); return g === 'web' ? 'diatrofi.gr' : g === 'ig' ? '3ada diatrofi' : g === 'book' ? r.src : ''; }
function srcInfo(r) {
  const g = srcGroup(r), page = !isLink(r.url) && r.url ? String(r.url).match(/σελ\.?\s*\d+/i) : null;
  if (g === 'ig') return { text: 'Instagram 3ada diatrofi' + (r.acct ? ' · ' + r.acct : ''), href: isLink(r.url) ? r.url : null };
  if (g === 'book') return { text: r.src + (page ? ', ' + page[0] : (r.url && !isLink(r.url) ? ' · ' + r.url : '')), href: null };
  if (isLink(r.url)) return { text: String(r.url).replace(/^https?:\/\//, ''), href: r.url };
  return r.url ? { text: String(r.url), href: null } : null;
}
function srcHtml(r) {
  const i = srcInfo(r); if (!i) return '';
  return i.href ? `<span>Πηγή: <a href="${esc(i.href)}" target="_blank" rel="noopener">${esc(i.text)} ↗</a></span>` : `<span>Πηγή: ${esc(i.text)}</span>`;
}
function stepsTitle(r) {
  const k = N(r.kind || '');
  if (/συντομ/.test(k)) return 'Εκτέλεση (σύντομη περίληψη)';
  if (/δικη μασ|δεν δινει/.test(k)) return 'Εκτέλεση (δική μας οδηγία· η πηγή δεν δίνει εκτέλεση)';
  return 'Εκτέλεση';
}
function srcMatch(r) {
  const f = state.src; if (!f) return true;
  const g = srcGroup(r);
  if (f === 'web' || f === 'ig') return g === f;
  if (f === 'books') return g === 'book';
  if (f.startsWith('book:')) return g === 'book' && r.src === f.slice(5);
  return true;
}
function renderSources() {
  const c = { web: 0, ig: 0, book: 0 }, books = new Map();
  state.recipes.forEach(r => { const g = srcGroup(r); if (g in c) c[g]++; if (g === 'book') books.set(r.src, (books.get(r.src) || 0) + 1); });
  const opt = (v, label, n) => `<option value="${esc(v)}" ${state.src === v ? 'selected' : ''}>${esc(label)} (${n})</option>`;
  const sel = $('srcSel');
  if (!c.web && !c.ig && !c.book) { sel.hidden = true; state.src = ''; return; }
  sel.hidden = false;
  sel.innerHTML = `<option value="">Όλες οι πηγές</option>` + (c.web ? opt('web', 'diatrofi.gr', c.web) : '') + (c.ig ? opt('ig', '3ada diatrofi', c.ig) : '')
    + (c.book ? `<optgroup label="Βιβλία">${opt('books', 'Όλα τα βιβλία', c.book)}${[...books].sort((a, b) => a[0].localeCompare(b[0], 'el')).map(([b, n]) => opt('book:' + b, b, n)).join('')}</optgroup>` : '');
}
function renderCats() {
  const cats = new Map();
  state.recipes.forEach(r => r.cats.forEach(c => cats.set(c, (cats.get(c) || 0) + 1)));
  const sorted = [...cats].sort((a, b) => b[1] - a[1]);
  if (state.cat && !cats.has(state.cat)) state.cat = '';
  $('cat').innerHTML = `<option value="">Όλες οι κατηγορίες</option>` + sorted.map(([c, n]) => `<option value="${esc(c)}" ${c === state.cat ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('');
}
function renderAll() {
  renderSource();
  const has = !!state.report;
  $('emptyState').hidden = has; $('lists').hidden = !has;
  $('emptyCount').textContent = state.recipes.length;
  $('tiles').hidden = !has; $('showPosWrap').hidden = !has; $('sort').hidden = !has;
  $('recH').textContent = has ? 'Συνταγές και προτεινόμενες αλλαγές' : 'Συνταγές';
  if (!has) { state.sort = 'alpha'; state.filter = 'all'; state.food = null; }
  else if (state.sort === 'alpha' && $('sort').value !== 'alpha') state.sort = $('sort').value;
  updateExportUI();
  if (has) renderLists();
  renderSources(); renderCats(); if (has) renderTiles(); renderRecipes(); renderTray();
}
function rerenderRecipe(key) {
  const el = document.querySelector(`.recipe[data-key="${CSS.escape(key)}"]`);
  const row = state.results.find(x => x.r.key === key);
  if (el && row) el.outerHTML = recipeRow(row);
}
