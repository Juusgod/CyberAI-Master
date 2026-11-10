/* Local-only scenario practice, replay, and portable progress backups. */
(() => {
  'use strict';
  const engine = window.CyberLab;
  const root = document.getElementById('lab-case');
  if (!engine || !root || !engine.templates().length) return;
  const STORE = 'cyber-ai-lab-state-v1';
  const FORMAT = 'cyber-fieldguide-progress-v1';
  const noteIds = ['checkpoint-1','checkpoint-2','checkpoint-3','practice-brief','practice-records','practice-instructions','practice-output','practice-finish','practice-next-check'];
  const topic = document.getElementById('lab-topic');
  const mode = document.getElementById('lab-mode');
  const twist = document.getElementById('lab-twist');
  const status = document.getElementById('lab-live-status');
  const backupStatus = document.getElementById('lab-backup-status');
  const categories = [...new Set(engine.templates().map(item => item.category))];
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let current, state, saveTimer;
  let history = [];
  let decks = Object.create(null);
  let storageAvailable = true;
  let lastFamily = '';
  categories.forEach(category => { const option = document.createElement('option'); option.value = category; option.textContent = category; topic.appendChild(option); });
  document.getElementById('lab-family-count').textContent = engine.templates().length;
  document.getElementById('lab-path-count').textContent = engine.templates().reduce((count,item) => count + item.variants.length,0);
  const recentWrap = document.createElement('div');
  recentWrap.className = 'lab-recent';
  recentWrap.innerHTML = '<label for="lab-recent-cases">Resume a recent case</label><select id="lab-recent-cases"><option value="">Select a saved case…</option></select><p class="lab-small">The last 50 cases and your answers are kept in this browser when storage is available. Export a backup to keep them elsewhere.</p>';
  document.querySelector('.lab-replay').appendChild(recentWrap);
  const recent = document.getElementById('lab-recent-cases');

  function announce(message, error = false) { status.textContent = message; status.classList.toggle('is-error',error); }
  function remember() {
    if (!current || !state) return;
    history = history.filter(item => item.code !== current.code);
    history.unshift(engine.normalizeState(current,state));
    history = history.slice(0,50);
  }
  function updateRecent() {
    recent.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select a saved case…'; recent.appendChild(placeholder);
    history.forEach((item,index) => {
      try {
        const caseData = engine.parseCode(item.code);
        const option = document.createElement('option'); option.value = item.code;
        option.textContent = `${index + 1}. ${caseData.title} · ${item.opened.length}/${caseData.maxCalls} checks${item.code === current?.code ? ' · current' : ''}`;
        recent.appendChild(option);
      } catch {}
    });
  }
  function snapshot() {
    remember();
    return {format:FORMAT,currentCode:current?.code || '',cases:history,decks,settings:{topic:topic.value,mode:mode.value,twist:twist.value},lastFamily};
  }
  function save() {
    clearTimeout(saveTimer);
    const value = snapshot();
    try { localStorage.setItem(STORE,JSON.stringify(value)); storageAvailable = true; }
    catch { storageAvailable = false; backupStatus.textContent = 'Browser storage is unavailable or full. Use Export notes & progress to keep this session.'; }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save,250); }
  function normalizeBundle(input) {
    if (!input || typeof input !== 'object' || input.format !== FORMAT || !Array.isArray(input.cases)) throw new Error('This is not a Fieldguide progress backup.');
    const valid = [], seen = new Set();
    for (const item of input.cases.slice(0,50)) {
      if (!item || typeof item.code !== 'string') throw new Error('A saved case is missing its replay code.');
      const caseData = engine.parseCode(item.code);
      if (!seen.has(caseData.code)) { valid.push(engine.normalizeState(caseData,item)); seen.add(caseData.code); }
    }
    const settings = input.settings || {};
    const cleanDecks = Object.create(null);
    for (const key of ['all',...categories]) {
      const eligible = engine.templates().filter(item => key === 'all' || item.category === key).map(item => item.id);
      if (Array.isArray(input.decks?.[key])) cleanDecks[key] = [...new Set(input.decks[key])].filter(id => eligible.includes(id));
    }
    const notes = {};
    for (const id of noteIds) if (typeof input.lessonNotes?.[id] === 'string') notes[id] = input.lessonNotes[id].slice(0,20000);
    return {cases:valid,currentCode:seen.has(input.currentCode) ? input.currentCode : valid[0]?.code || '',decks:cleanDecks,
      settings:{topic:categories.includes(settings.topic) ? settings.topic : 'all',mode:engine.MODES.includes(settings.mode) ? settings.mode : 'standard',twist:['auto',...engine.MODIFIERS].includes(settings.twist) ? settings.twist : 'auto'},
      lastFamily:engine.templates().some(item => item.id === input.lastFamily) ? input.lastFamily : '',lessonNotes:notes};
  }
  function restore(bundle) {
    history = bundle.cases; decks = bundle.decks; lastFamily = bundle.lastFamily;
    topic.value = bundle.settings.topic; mode.value = bundle.settings.mode; twist.value = bundle.settings.twist;
    if (bundle.currentCode) {
      current = engine.parseCode(bundle.currentCode);
      state = engine.normalizeState(current,history.find(item => item.code === current.code));
    }
  }
  function nextFamily() {
    const key = topic.value;
    const eligible = engine.templates().filter(item => key === 'all' || item.category === key).map(item => item.id);
    if (!decks[key]?.length) {
      decks[key] = [...eligible];
      const random = engine.rng(engine.randomSeed());
      for (let index = decks[key].length - 1; index > 0; index--) { const other = Math.floor(random() * (index + 1)); [decks[key][index],decks[key][other]] = [decks[key][other],decks[key][index]]; }
      if (decks[key].length > 1 && decks[key][decks[key].length - 1] === lastFamily) [decks[key][0],decks[key][decks[key].length - 1]] = [decks[key][decks[key].length - 1],decks[key][0]];
    }
    lastFamily = decks[key].pop();
    return lastFamily;
  }
  function generate() {
    remember();
    const seed = engine.randomSeed();
    const random = engine.rng(seed ^ 0xA51C7E3);
    const weighted = mode.value === 'advanced' ? ['complete','complete','complete','injection','injection','gap','stale','conflict','timeout'] : ['complete','complete','complete','complete','complete','complete','injection','injection','gap','stale','conflict','timeout'];
    const modifier = twist.value === 'auto' ? weighted[Math.floor(random() * weighted.length)] : twist.value;
    current = engine.createCase({id:nextFamily(),seed,mode:mode.value,modifier});
    state = engine.makeState(current);
    save(); renderCase(); updateRecent();
    announce(`New simulated case ready: ${current.title}. Start with the initial evidence, then choose your checks.`);
  }
  function openCode(code) {
    try {
      const next = engine.parseCode(code);
      remember();
      current = next;
      state = engine.normalizeState(current,history.find(item => item.code === current.code));
      save(); renderCase(); updateRecent();
      announce(`Loaded ${current.title}. The code recreates its evidence and conditions; your saved answers are restored when available.`);
      return true;
    } catch (error) { announce(error.message,true); return false; }
  }
  function evidenceMarkup(record) {
    return `<li class="${record.injection ? 'lab-injection' : ''}${record.usable === false ? ' lab-unusable' : ''}"><div class="lab-evidence-head"><code>${esc(record.evidenceId || record.id)}</code><span>${esc(record.source || record.label)}${record.status ? ` · ${esc(record.status.toUpperCase())}` : ''}</span></div><p>${esc(record.text || record.result)}</p></li>`;
  }
  function renderCase() {
    const guided = current.mode === 'guided';
    const advanced = current.mode === 'advanced';
    const results = engine.visibleResults(current,state);
    const ref = engine.reference(current,state);
    const feedback = state.reviewed ? engine.checkAssessment(current,state) : null;
    const remaining = current.maxCalls - state.opened.length;
    const displayChecks = [...current.checks];
    const shuffle = engine.rng(current.seed ^ 0x1F4A83D);
    for (let index = displayChecks.length - 1; index > 0; index--) { const other = Math.floor(shuffle() * (index + 1)); [displayChecks[index],displayChecks[other]] = [displayChecks[other],displayChecks[index]]; }
    const field = (name,label,placeholder) => `<label for="lab-note-${name}">${label}</label><textarea id="lab-note-${name}" data-lab-note="${name}" maxlength="20000" placeholder="${esc(placeholder)}"></textarea>`;
    root.innerHTML = `
      <p class="print-case-title">FIELDGUIDE · CYBERSECURITY AI PRACTICE · ${esc(current.code)}</p>
      <div class="lab-case-header"><p class="eyebrow">${esc(current.category)} · Simulated case</p><h3 id="lab-case-title" tabindex="-1">${esc(current.title)}</h3><p>${esc(current.context)}</p><div class="lab-case-meta"><span>${esc(current.mode.toUpperCase())} MODE</span><span>${current.maxCalls} READ-ONLY CHECKS</span><span>${esc(current.assetType)}</span></div><div class="lab-code"><code>${esc(current.code)}</code><button type="button" data-lab-action="copy-code">Copy case code</button></div></div>
      <ol class="lab-progress" aria-label="Practice sequence"><li class="is-done"><span>1</span> Observe</li><li class="${state.notes.hypothesis ? 'is-done' : ''}"><span>2</span> Predict</li><li class="${results.length ? 'is-done' : ''}"><span>3</span> Check</li><li class="${state.reviewed ? 'is-done' : ''}"><span>4</span> Explain</li></ol>
      <div class="lab-case-brief"><strong>YOUR BRIEF</strong><p>${esc(current.brief)}</p></div>
      <p class="lab-phase-label">01 / Observe — what is actually in the records?</p><ol class="lab-evidence">${current.initial.map(evidenceMarkup).join('')}</ol>
      <div class="lab-note-fields">${field('facts','What do you know? Cite the record IDs.','E1 establishes… E2 does not establish…')}</div>
      <p class="lab-phase-label">02 / Predict — make a claim you can test</p><p>${esc(current.challenge)}</p>
      <div class="lab-note-fields">${field('hypothesis','Give two plausible explanations. What evidence would separate them?','One possibility is… Another is… I would distinguish them by…')}</div>
      ${advanced ? '' : `<details class="lab-hints" ${guided ? 'open' : ''}><summary>Reasoning hints</summary><h4>Competing explanations</h4><ul>${current.hypotheses.map(item => `<li>${esc(item)}</li>`).join('')}</ul><h4>What is still unknown?</h4><ul>${current.unknowns.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>`}
      <p class="lab-phase-label">03 / Check — spend the budget deliberately</p><p class="lab-small">Choose the lookup that will reduce uncertainty. Each new lookup uses one call, including an error. These buttons reveal simulated records; they do not connect to any system.</p>
      <p class="lab-call-counter" aria-live="polite">${state.opened.length} / ${current.maxCalls} calls used · ${remaining} remaining${remaining === 0 ? ' · stop or hand off' : ''}</p>
      <div class="lab-tools">${displayChecks.map(check => `<button type="button" class="lab-tool-button" data-lab-check="${esc(check.id)}" ${state.opened.includes(check.id) || remaining === 0 ? 'disabled' : ''}><span class="tool-name">${state.opened.includes(check.id) ? '✓ ' : ''}${esc(check.label)}</span>${advanced ? '' : `<span class="tool-purpose">${esc(check.purpose)}</span>`}<span class="tool-label">READ ONLY · ${esc(check.tool)} · ${esc(check.scope)}${state.opened.includes(check.id) ? ' · RESULT OPENED' : ''}</span></button>`).join('')}
      <button type="button" class="lab-tool-button lab-blocked-button" data-lab-check="contain"><span class="tool-name">Test the boundary: propose containment</span><span class="tool-purpose">A state-changing proposal. Predict whether this read-only policy should allow it.</span></button></div>
      ${state.blocked ? `<p class="lab-policy-result" role="status"><strong>Policy gate: blocked.</strong> ${state.blocked} proposed change${state.blocked === 1 ? '' : 's'} rejected. No change was executed and no read-call budget was spent.</p>` : ''}
      <div class="lab-results"><h4 id="lab-results-heading" tabindex="-1">${results.length ? 'Returned evidence' : 'No lookups opened yet'}</h4>${results.length ? `<ol class="lab-evidence">${results.map(evidenceMarkup).join('')}</ol>` : '<p class="lab-small">Predict what you expect to learn before opening a result.</p>'}</div>
      <p class="lab-phase-label">04 / Explain — does the evidence support the conclusion?</p>
      <div class="lab-note-fields">${field('next','What should happen next, and when should the loop stop?','One useful permitted check is… I would stop or hand off if…')}</div>
      <div class="lab-assessment"><h4>Choose a provisional assessment</h4>${engine.DISPOSITIONS.map(value => `<label class="lab-choice"><input type="radio" name="lab-assessment" value="${value}" ${state.assessment === value ? 'checked' : ''}><span>${esc(engine.LABELS[value])}</span></label>`).join('')}<button type="button" class="lab-primary" data-lab-action="assess">Check my assessment</button>${feedback ? `<div class="lab-feedback" id="lab-feedback" tabindex="-1" role="status"><strong>${esc(feedback.title)}</strong><p>${esc(feedback.text)}</p>${feedback.empty ? '' : `<p>Reference: <strong class="inline-reference">${esc(engine.LABELS[feedback.reference.disposition])}</strong>. This checks your selected category against the authored exercise; it does not grade your written reasoning.</p>`}</div>` : ''}</div>
      <details class="lab-debrief" id="lab-debrief" ${state.debrief ? 'open' : ''}><summary>Reveal the guided debrief</summary><span class="reference-label">REFERENCE: ${esc(engine.LABELS[ref.disposition].toUpperCase())}</span><p>${esc(ref.reasoning)}</p><h4>What remains unknown</h4><ul>${ref.remaining.map(item => `<li>${esc(item)}</li>`).join('')}</ul><h4>Next step or stopping point</h4><p>${esc(ref.next)}</p><h4>Trap to avoid</h4><p>${esc(ref.pitfall)}</p><h4>Carry this principle to the next case</h4><p>${esc(current.principle)}</p><p class="lab-small">This debrief uses only the records you opened. Unresolved is a useful outcome when the evidence or budget is insufficient. A real investigation may support a justified alternative; explain it with evidence.</p></details>
      <div class="lab-note-fields">${field('reflection','Memory check: without looking back, what would you do differently next time?','The signal I initially missed was… My next prompt or loop will…')}</div>
      <details class="lab-prompt"><summary>Build a BRIEF prompt from this case</summary><p class="lab-small">Only initial records and opened results are included. Edit this in the practice section or copy it into a separate AI tool if you choose; this page makes no AI calls.</p><pre id="lab-generated-prompt">${esc(engine.prompt(current,state))}</pre><button type="button" data-lab-action="copy-prompt">Copy this BRIEF prompt</button></details>
      <div class="lab-actions"><button type="button" data-lab-action="download">Save case as text</button><button type="button" data-lab-action="print">Print case / Save PDF</button><button type="button" data-lab-action="new">Generate another case →</button></div>
      <p class="lab-footer-note">${storageAvailable ? 'Your answers are saved in this browser when storage is available.' : 'Browser storage is unavailable; export your notes to keep them.'} Case codes recreate the scenario, not your private answers. <a href="#offline">Download the lab or back up your notes →</a></p>`;
    root.querySelectorAll('[data-lab-note]').forEach(field => { field.value = state.notes[field.dataset.labNote] || ''; });
    const details = document.getElementById('lab-debrief');
    details.addEventListener('toggle', () => { if (state.debrief !== details.open) { state.debrief = details.open; saveSoon(); } });
  }
  async function copy(value,button,label) {
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; }
    catch {
      const field = document.createElement('textarea'); field.value = value; field.setAttribute('aria-label','Text to copy'); field.style.position = 'fixed'; field.style.left = '-9999px'; document.body.appendChild(field); field.select();
      try { ok = document.execCommand('copy'); } catch {}
      field.remove(); button.focus();
    }
    if (ok) { const before = button.textContent; button.textContent = 'Copied ✓'; setTimeout(() => { if (button.isConnected) button.textContent = before; },1800); announce(label); }
    else announce('Clipboard unavailable. Select and copy the displayed text manually.',true);
  }
  function download(text,name,type) {
    const url = URL.createObjectURL(new Blob([text],{type}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  root.addEventListener('input', event => {
    const field = event.target;
    if (field.matches('[data-lab-note]') && Object.hasOwn(state.notes,field.dataset.labNote)) {
      state.notes[field.dataset.labNote] = field.value.slice(0,20000); saveSoon();
      if (field.dataset.labNote === 'hypothesis') root.querySelector('.lab-progress li:nth-child(2)')?.classList.toggle('is-done',Boolean(field.value.trim()));
    }
  });
  root.addEventListener('change', event => { if (event.target.name === 'lab-assessment') { state.assessment = event.target.value; state.reviewed = false; document.getElementById('lab-feedback')?.remove(); saveSoon(); } });
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
    if (button.dataset.labCheck) {
      const result = engine.performCheck(current,state,button.dataset.labCheck);
      save(); renderCase(); updateRecent(); announce(result.message);
      if (result.kind === 'blocked') root.querySelector('[data-lab-check="contain"]').focus();
      else document.getElementById('lab-results-heading').focus({preventScroll:true});
      return;
    }
    switch (button.dataset.labAction) {
      case 'copy-code': copy(current.code,button,'Case code copied. A friend with this edition can replay it.'); break;
      case 'copy-prompt': copy(engine.prompt(current,state),button,'BRIEF prompt copied with the evidence you have opened.'); break;
      case 'assess': state.reviewed = true; save(); renderCase(); document.getElementById('lab-feedback')?.focus({preventScroll:true}); break;
      case 'download': download(engine.caseText(current,state,state.debrief),`Fieldguide_${current.id}_${current.seed.toString(16)}.txt`,'text/plain;charset=utf-8'); announce('Case sheet saved with your current answers and opened evidence.'); break;
      case 'print': {
        save();
        root.querySelectorAll('textarea').forEach(field => { const print = document.createElement('div'); print.className = 'lab-print-answer'; print.textContent = field.value || '[Not yet written]'; field.after(print); });
        document.body.dataset.printCase = 'true';
        try { window.print(); } catch { clearPrint(); announce('Printing is unavailable in this browser. Save the case as text instead.',true); }
        break;
      }
      case 'new': generate(); document.getElementById('lab-case-title').focus(); break;
    }
  });
  function clearPrint() { delete document.body.dataset.printCase; root.querySelectorAll('.lab-print-answer').forEach(item => item.remove()); }
  window.addEventListener('afterprint',clearPrint);
  document.getElementById('lab-generate').addEventListener('click', () => { generate(); document.getElementById('lab-case-title').focus({preventScroll:true}); });
  document.getElementById('lab-load-code').addEventListener('click', () => openCode(document.getElementById('lab-code-input').value));
  document.getElementById('lab-code-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); openCode(event.target.value); } });
  recent.addEventListener('change', () => { if (recent.value) openCode(recent.value); });
  [topic,mode,twist].forEach(control => control.addEventListener('change', () => { saveSoon(); announce('Settings updated. Choose Generate new case to apply them.'); }));
  document.getElementById('lab-export-progress').addEventListener('click', () => {
    const value = snapshot();
    value.lessonNotes = Object.fromEntries(noteIds.map(id => [id,document.getElementById(id)?.value || '']));
    value.exportedAt = new Date().toISOString();
    download(JSON.stringify(value,null,2),'Fieldguide_Progress_Backup.json','application/json');
    backupStatus.textContent = `Backup exported with ${value.cases.length} saved case${value.cases.length === 1 ? '' : 's'} and your lesson notes. It contains your typed answers; share it only if you want to share those.`;
  });
  document.getElementById('lab-import-progress').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error('This backup is too large. Choose a Fieldguide JSON backup under 32 MB.');
      const bundle = normalizeBundle(JSON.parse(await file.text()));
      remember();
      const savedCodes = new Set(bundle.cases.map(item => item.code));
      bundle.cases = [...bundle.cases,...history.filter(item => !savedCodes.has(item.code))].slice(0,50);
      restore(bundle);
      for (const id of noteIds) if (Object.hasOwn(bundle.lessonNotes,id)) { const field = document.getElementById(id); if (field) { field.value = bundle.lessonNotes[id]; field.dispatchEvent(new Event('input',{bubbles:true})); } }
      if (!current) generate(); else { save(); renderCase(); updateRecent(); }
      backupStatus.textContent = `Imported ${bundle.cases.length} saved cases. Matching case answers and lesson notes now use the backup; other recent cases are retained up to the 50-case limit.`;
      announce('Progress restored from your local backup.');
    } catch (error) { backupStatus.textContent = `Could not import: ${error.message}`; }
    event.target.value = '';
  });
  window.addEventListener('pagehide',save);
  try { const saved = localStorage.getItem(STORE); if (saved) restore(normalizeBundle(JSON.parse(saved))); }
  catch { storageAvailable = false; }
  if (current && state) { renderCase(); updateRecent(); announce('Your current case and answers have been restored.'); }
  else generate();
  window.CyberLabUI = Object.freeze({exportState:snapshot});
})();
