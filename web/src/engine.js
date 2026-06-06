// Surgical re-exports from the root project, hand-picked so the browser
// bundle pulls only the pure pieces (scales + persona math + quiz scoring)
// and NEVER the file/network/clipboard bits of niceness.js.

import { SCALES, SCALE_META } from '../../scales.js';

const SCALE_NAMES = Object.keys(SCALES);

// ---- quiz (mirrors niceness.js — kept in sync via test) -------------------
export const QUIZ_QUESTIONS = [
  {
    q: "Your AI just gave you broken code. You…",
    options: [
      ['Thank it and gently explain what went wrong.', 0.05],
      ['Just say "try again".', 0.45],
      ['Get visibly annoyed and short.', 0.75],
      ['UNLEASH THE PROFANITY.', 1.00],
    ],
  },
  {
    q: "Your typical opening line is…",
    options: [
      ['"Hi! Hope you\'re doing well. Could you…"', 0.05],
      ['"Hey"', 0.35],
      ['(no greeting — straight to the task)', 0.65],
      ['"fix this"', 0.95],
    ],
  },
  {
    q: "When you ask for help, you usually…",
    options: [
      ['Say please, give context, offer no rush.', 0.05],
      ['Say please.', 0.30],
      ['Just describe the task.', 0.60],
      ['Command in caps.', 0.95],
    ],
  },
  {
    q: "When the bot does great work, you…",
    options: [
      ['Praise warmly and thank it.', 0.05],
      ['Say "good" or "thanks".', 0.30],
      ['Move on silently.', 0.65],
      ['Complain it should have been faster.', 0.95],
    ],
  },
  {
    q: "When you're frustrated, you…",
    options: [
      ['Apologize for the back-and-forth and try again.', 0.10],
      ['Take a breath, then re-ask.', 0.35],
      ['Get terse and clipped.', 0.70],
      ['UNLEASH THE CAPS.', 1.00],
    ],
  },
  {
    q: "Your average message length is…",
    options: [
      ['Several sentences with full context.', 0.15],
      ['A short paragraph.', 0.40],
      ['One sentence.', 0.65],
      ['Three words.', 0.90],
    ],
  },
  {
    q: "Pick the emoji you use most with your AI…",
    options: [
      ['🙏 ❤️ 🎉', 0.05],
      ['👍 ✅', 0.40],
      ['(none — emoji are silly)', 0.65],
      ['🔥 😡 💀', 0.95],
    ],
  },
];

export function scoreQuizAnswers(answers) {
  const letters = Array.isArray(answers)
    ? answers.map((a) => (typeof a === 'number' ? 'ABCD'[a] : String(a).trim().toUpperCase()[0]))
    : String(answers).trim().toUpperCase().replace(/[^A-D]/g, '').split('');
  if (letters.length !== QUIZ_QUESTIONS.length) {
    return { error: `Need ${QUIZ_QUESTIONS.length} answers (got ${letters.length}). Each must be A, B, C, or D.` };
  }
  let sum = 0;
  const detail = [];
  for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
    const idx = 'ABCD'.indexOf(letters[i]);
    if (idx < 0) return { error: `Question ${i + 1} answer "${letters[i]}" is not A/B/C/D.` };
    const [label, weight] = QUIZ_QUESTIONS[i].options[idx];
    sum += weight;
    detail.push({ q: QUIZ_QUESTIONS[i].q, answer: label, weight });
  }
  const frac = sum / QUIZ_QUESTIONS.length;
  return { frac, niceness: Math.round((1 - frac) * 100), letters: letters.join(''), detail };
}

export function personaFromQuizFrac(scaleName, frac) {
  const scale = SCALES[scaleName] || SCALES.people;
  const idx = Math.max(0, Math.min(scale.length - 1, Math.floor(frac * scale.length)));
  return { persona: scale[idx], idx, scaleLength: scale.length };
}

export { SCALES, SCALE_META, SCALE_NAMES };

// ---- social share URL builders (mirrors niceness.js) ----------------------
const REPO_URL = 'https://github.com/jgrichardson/good-bot';
const NPM_URL = 'https://www.npmjs.com/package/@jgrciv/good-bot';
const WEB_URL = typeof window !== 'undefined' ? window.location.origin : 'https://goodbot.dev';

export const SHARE_PLATFORMS = {
  twitter: {
    name: 'Twitter / X',
    build: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  bluesky: {
    name: 'Bluesky',
    build: (text, url) => `https://bsky.app/intent/compose?text=${encodeURIComponent(text + ' ' + url)}`,
  },
  threads: {
    name: 'Threads',
    build: (text, url) => `https://threads.net/intent/post?text=${encodeURIComponent(text + ' ' + url)}`,
  },
  linkedin: {
    name: 'LinkedIn',
    build: (text, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(text)}`,
  },
  reddit: {
    name: 'Reddit',
    build: (text, url) => `https://www.reddit.com/submit?title=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
};

export function shareText(persona, scaleName) {
  const e = persona.emoji ? persona.emoji + ' ' : '';
  const tag = persona.tag ? ` — ${persona.tag}` : '';
  return `I'm ${e}${persona.name} on the AI niceness scale (${scaleName}).${tag} How nice are YOU to your AI? #BeNiceToYourAI`;
}

export function buildShareUrl(platform, persona, scaleName) {
  const p = SHARE_PLATFORMS[platform];
  if (!p) return null;
  // Web share points back at the web URL (with the answer letters as a query
  // param so the friend lands directly on the result — opens the viral loop).
  return { name: p.name, url: p.build(shareText(persona, scaleName), WEB_URL) };
}

export const REPO = REPO_URL;
export const NPM = NPM_URL;
export const WEB = WEB_URL;
