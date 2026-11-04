// Optional: Claude rewrites the method with the chosen swaps (claude.ai signed-in viewers only).
// Part of the microbiome recipes app. Loaded as a classic <script>; shares top-level names with the other files.
// ---------- Claude rewrite (optional) ----------
const AI = { ready: false, sample: null };
async function setupAI() {
  try { AI.sample = window.claude && await window.claude.use('sample'); } catch { AI.sample = null; }
  AI.ready = !!AI.sample;
  document.querySelectorAll('[data-ai]').forEach(el => { el.hidden = !AI.ready; });
}
async function runAI(key) {
  if (!AI.sample) return;
  const { r } = state.results.find(x => x.r.key === key);
  const { text, changes } = recipeText(key);
  const reduceNames = state.report.reduce.map(x => x.name).join(', ');
  const st = { busy: true, text: 'Το Claude γράφει…' };
  state.ai.set(key, st); rerenderRecipe(key);
  const prompt = `Είσαι βοηθός διατροφολόγου. Ξαναγράψε στα ελληνικά τα βήματα εκτέλεσης της παρακάτω συνταγής ώστε να ταιριάζουν με τα τροποποιημένα υλικά.
Κανόνες: μην προσθέσεις κανένα υλικό από τη λίστα «προς μείωση»· κράτα τα βήματα σύντομα και αριθμημένα (έως 8)· αν κάποια αλλαγή επηρεάζει χρόνο ή υφή, σημείωσέ το σε μία γραμμή στο τέλος. Μόνο απλό κείμενο, χωρίς markdown.

Τροφές προς μείωση (από την αναφορά): ${reduceNames}

${text}

Αλλαγές που επιλέχθηκαν: ${changes.length ? changes.join('; ') : 'καμία'}`;
  try {
    const res = await AI.sample(prompt, { onText: ({ text }) => { st.text = text; const el = document.querySelector(`.recipe[data-key="${CSS.escape(key)}"] [data-ai-out]`); if (el) el.textContent = text; } });
    st.text = res.text;
  } catch (err) {
    st.text = err && err.code === 'not_granted' ? 'Η πρόσβαση στο Claude δεν δόθηκε για αυτή τη σελίδα.' : err && err.code === 'rate_limited' ? 'Πολλά αιτήματα — δοκιμάστε ξανά σε λίγο.' : 'Δεν ήταν δυνατή η δημιουργία κειμένου.';
    if (err && err.code === 'not_granted') { AI.ready = false; }
  }
  st.busy = false; rerenderRecipe(key);
}
