// good-bot web — client-side quiz + import + share.
// Everything below runs in the user's browser. No requests are made except
// when the user explicitly clicks a "Share to <platform>" button, which
// opens the platform's compose page in a new tab.

import {
  QUIZ_QUESTIONS,
  scoreQuizAnswers,
  personaFromQuizFrac,
  SCALES,
  SCALE_META,
  SCALE_NAMES,
  buildShareUrl,
  shareText,
} from './engine.js';
import { renderPoster } from './poster.js';
import { parseImport } from './import.js';
import { submitScore, fetchStats, computePercentile } from './barometer.js';

const state = {
  scale: 'people',
  step: 0,
  answers: [],
  result: null,
};

const $ = (s) => document.querySelector(s);
const view = {
  landing: $('#landing'),
  quiz: $('#quiz'),
  importPanel: $('#import'),
  result: $('#result'),
};

function show(name) {
  for (const k of Object.keys(view)) view[k].classList.add('hidden');
  view[name].classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function populateScales() {
  const sel = $('#scale');
  for (const name of SCALE_NAMES) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${name} — ${SCALES[name][0].name} → ${SCALES[name][SCALES[name].length - 1].name}`;
    sel.appendChild(opt);
  }
  sel.value = state.scale;
  sel.addEventListener('change', (e) => { state.scale = e.target.value; });
}

function renderQuiz() {
  const Q = QUIZ_QUESTIONS[state.step];
  const total = QUIZ_QUESTIONS.length;
  $('#progress-bar').style.width = `${(state.step / total) * 100}%`;
  $('#q-title').textContent = Q.q;
  $('#q-step').textContent = `Question ${state.step + 1} of ${total}`;
  const ol = $('#q-options');
  ol.innerHTML = '';
  Q.options.forEach(([label], i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="letter">${'ABCD'[i]}</span><span>${escapeHtml(label)}</span>`;
    li.addEventListener('click', () => answer(i));
    ol.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function answer(idx) {
  state.answers[state.step] = idx;
  if (state.step < QUIZ_QUESTIONS.length - 1) {
    state.step += 1;
    renderQuiz();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  $('#progress-bar').style.width = '100%';
  const result = scoreQuizAnswers(state.answers);
  if (result.error) { alert(result.error); return; }
  const { persona } = personaFromQuizFrac(state.scale, result.frac);
  state.result = {
    persona,
    niceness: result.niceness,
    detail: result.detail,
    answers: result.letters,
    scale: state.scale,
    source: 'quiz',
  };
  renderResult();
  show('result');
  // Persist answers in the URL so a share link lands friends right at the result
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('quiz', result.letters);
    u.searchParams.set('scale', state.scale);
    window.history.replaceState({}, '', u.toString());
  } catch (_) {}
}

function renderResult() {
  const r = state.result;
  const face = r.persona.face === 'happy' ? '😊' : r.persona.face === 'mean' ? '😠' : '😐';
  $('#result-face').textContent = `${r.persona.emoji || '🤖'} ${face}`;
  $('#result-name').textContent = r.persona.name;
  $('#result-tag').textContent = r.persona.tag || '';
  $('#result-niceness').textContent = `${r.niceness}/100 on the ${r.scale} scale`;
  $('#result-blurb').textContent = r.persona.blurb || '';
  $('#nice-bar-fill').style.width = `${r.niceness}%`;
}

function setupBarometer() {
  const btn = document.getElementById('barometer-submit');
  const out = document.getElementById('barometer-result');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!state.result) return;
    btn.disabled = true;
    btn.textContent = '🌡️ Submitting…';
    const r = state.result;
    const submit = await submitScore({ niceness: r.niceness, scale: r.scale, source: r.source || 'quiz' });
    if (!submit.ok) {
      out.classList.remove('hidden');
      out.classList.add('error');
      out.innerHTML = 'Barometer offline — your score wasn\'t recorded. (No retry; nothing was stored.)';
      btn.textContent = 'Try again later';
      return;
    }
    const stats = await fetchStats(r.scale);
    const pct = computePercentile(r.niceness, stats);
    out.classList.remove('hidden');
    out.classList.remove('error');
    if (pct) {
      out.innerHTML = `📊 You beat <strong>${pct.percentile}%</strong> of the <strong>${pct.total.toLocaleString()}</strong> people on the <code>${r.scale}</code> scale.`;
    } else {
      out.innerHTML = `✅ Recorded. Stats will populate as more people add their scores.`;
    }
    btn.textContent = '✅ Added';
  });
}

function setupShare() {
  document.querySelectorAll('[data-share]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.result) return;
      const r = state.result;
      const u = buildShareUrl(btn.dataset.share, r.persona, r.scale);
      if (!u) return;
      window.open(u.url, '_blank', 'noopener,noreferrer');
    });
  });
}

async function downloadPoster() {
  if (!state.result) return;
  try {
    const blob = await renderPoster(state.result);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `good-bot-${state.result.persona.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    alert(`Poster render failed: ${e.message}`);
  }
}

function setupDropzone() {
  const dz = $('#dropzone');
  const input = $('#file-input');
  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseImport(reader.result);
        if (!parsed.items.length) {
          $('#import-status').textContent = `No human messages found in that export (${parsed.shape}).`;
          return;
        }
        // For simplicity v1, treat the import as a quiz-like flow: derive
        // a niceness fraction from message counts (lots more on this in v2).
        const score = quickScoreItems(parsed.items);
        const { persona } = personaFromQuizFrac(state.scale, score.frac);
        state.result = {
          persona,
          niceness: score.niceness,
          detail: [],
          answers: null,
          scale: state.scale,
          source: parsed.shape,
          messageCount: parsed.items.length,
        };
        renderResult();
        show('result');
      } catch (e) {
        $('#import-status').textContent = `Could not read file: ${e.message}`;
      }
    };
    reader.readAsText(file);
  }
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag');
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) readFile(input.files[0]); });
}

// Very lightweight tone heuristic for the import path. We deliberately keep
// this simpler than the CLI's scoring because the web build can't reach
// node:fs etc. — the full engine ports to engine.js as a v2 follow-up.
function quickScoreItems(items) {
  const NICE = /\b(please|thank|thanks|appreciate|sorry|kudos|cheers)\b/gi;
  const MEAN = /\b(fuck|shit|bullshit|stupid|idiot|useless|garbage|moron)\b/gi;
  // Standalone ALL-CAPS words (≥3 letters), minus common tech acronyms.
  const CAPS_WORD = /\b[A-Z]{3,}\b/g;
  const ACRONYMS = new Set([
    'URL','API','JSON','SQL','CSS','HTML','XML','HTTP','HTTPS','REST','JWT',
    'AWS','GCP','GCE','IDE','CLI','SDK','NPM','USB','GPU','CPU','RAM','RAID',
    'UUID','ULID','TLS','SSH','DNS','PDF','PNG','JPG','SVG','CSV','YAML','TOML',
    'OK','LGTM','TLDR','IMO','IMHO','FYI','BTW','TBH','TIL','PR','CI','CD',
    'OS','IP','MAC','UI','UX','QA','AI','ML','GPT','LLM','RAG','MVP',
  ]);
  let nice = 0, mean = 0, capsWords = 0, shoutyMessages = 0;
  for (const it of items) {
    nice += (it.text.match(NICE) || []).length;
    mean += (it.text.match(MEAN) || []).length;
    // Per-word CAPS contribution (cap per-message at 5)
    const caps = (it.text.match(CAPS_WORD) || []).filter((w) => !ACRONYMS.has(w));
    capsWords += Math.min(caps.length, 5);
    // Whole-message yelling: >70% uppercase letters with ≥5 letters
    const letters = it.text.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 5 && it.text.replace(/[^A-Z]/g, '').length / letters.length > 0.7) {
      shoutyMessages += 1;
    }
  }
  const n = items.length || 1;
  // CAPS words count as 0.5× a mean keyword; whole-message shouts count as 1×.
  const meanWeighted = mean * 1.5 + capsWords * 0.5 + shoutyMessages;
  const frac = Math.max(0, Math.min(1, 0.5 - (nice - meanWeighted) / (n * 0.4)));
  return { frac, niceness: Math.round((1 - frac) * 100) };
}

function preloadFromUrl() {
  try {
    const u = new URL(window.location.href);
    const q = u.searchParams.get('quiz');
    const s = u.searchParams.get('scale');
    if (s && SCALE_NAMES.includes(s)) state.scale = s;
    if (q && /^[A-D]{7}$/i.test(q.trim())) {
      const r = scoreQuizAnswers(q);
      if (!r.error) {
        const { persona } = personaFromQuizFrac(state.scale, r.frac);
        state.result = { persona, niceness: r.niceness, detail: r.detail, answers: r.letters, scale: state.scale, source: 'shared-link' };
        renderResult();
        show('result');
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function setupActions() {
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'start-quiz') { state.step = 0; state.answers = []; renderQuiz(); show('quiz'); }
      else if (action === 'open-import') show('importPanel');
      else if (action === 'back-to-landing') show('landing');
      else if (action === 'pick-file') $('#file-input').click();
      else if (action === 'download-poster') downloadPoster();
      else if (action === 'restart') { state.step = 0; state.answers = []; state.result = null; show('landing'); }
    });
  });
}

// ---- boot ----
populateScales();
setupActions();
setupShare();
setupDropzone();
setupBarometer();
if (!preloadFromUrl()) show('landing');
