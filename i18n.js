'use strict';

// ============================================================
//  Языки. Игра написана по-русски, перевод подставляется при выводе текста на экран:
//  fillText / strokeText / measureText холста пропускают строку через tr().
//  Словари lang/en.js, lang/uk.js: { 'русская строка': 'перевод' }, {} — подстановка (число, имя…).
//  Составные строки («Зелёный · Ур. 3/50») переводятся по частям.
// ============================================================

const LANGS = { ru: 'Русский', en: 'English', uk: 'Українська' };
const LANG_KEY = 'survivor.lang';
let LANG = 'ru';
try {
  const nav = (navigator.language || '').toLowerCase();
  LANG = localStorage.getItem(LANG_KEY) || (nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en');
} catch {}
if (!LANGS[LANG]) LANG = 'ru';
document.documentElement.lang = LANG;
const DICT = {}; // заполняют lang/*.js

// Сменить язык: запоминаем и перезапускаем игру (прогресс в сохранении не трогается)
function setLang(l) {
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  location.reload();
}

const CYR = /[А-Яа-яЁё]/;
let trExact = null, trPatterns = null;
const trCache = new Map();
function trInit() {
  const d = DICT[LANG] || {};
  trExact = new Map();
  trPatterns = [];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const k in d) {
    if (!k.includes('{}')) { trExact.set(k, d[k]); continue; }
    trPatterns.push({ re: new RegExp('^' + k.split('{}').map(esc).join('(.+?)') + '$'), parts: d[k].split('{}'), fixed: k.replace(/\{\}/g, '').length });
  }
  trPatterns.sort((a, b) => b.fixed - a.fixed); // сначала самые конкретные шаблоны
}

function tr(s) {
  if (LANG === 'ru' || typeof s !== 'string' || !CYR.test(s)) return s;
  let r = trCache.get(s);
  if (r !== undefined) return r;
  if (!trExact) trInit();
  r = trRaw(s);
  if (trCache.size > 5000) trCache.clear(); // таймеры и счётчики дают много разных строк
  trCache.set(s, r);
  return r;
}

const TR_SEPS = [' · ', '  ', ' — ', ': ', ', ', ' → ', ' + '];
function trRaw(s) {
  const e = trExact.get(s);
  if (e !== undefined) return e;
  // Края: пробелы, точки-разделители, двоеточия
  const edge = s.match(/^([\s·—:]*)(.*?)([\s·—:]*)$/s);
  if (edge[1] || edge[3]) return edge[1] + tr(edge[2]) + edge[3];
  for (const p of trPatterns) {
    const m = s.match(p.re);
    if (m) return p.parts.map((part, i) => part + (i + 1 < m.length ? tr(m[i + 1]) : '')).join('');
  }
  // Делим по первому разделителю: «Дальше: Активка: +5000%» → «Дальше» + «Активка: +5000%»
  for (const sep of TR_SEPS) { const i = s.indexOf(sep); if (i >= 0) return tr(s.slice(0, i)) + sep + tr(s.slice(i + sep.length)); }
  // Значок или число перед словом («🔒 Сложный», «10 сундуков») и после («Лёгкий ✓»)
  const pre = s.match(/^([^А-Яа-яЁё]+)(.+)$/s);
  if (pre) return pre[1] + tr(pre[2]);
  const post = s.match(/^(.+?)([^А-Яа-яЁё]+)$/s);
  if (post) return tr(post[1]) + post[2];
  return s;
}

// Весь текст на холсте идёт через перевод — правок в коде отрисовки не нужно
if (LANG !== 'ru') {
  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['fillText', 'strokeText', 'measureText']) {
    const orig = P[m];
    P[m] = function (s, ...rest) { return orig.call(this, tr(s), ...rest); };
  }
}
