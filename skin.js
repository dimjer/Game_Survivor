// ============================================================
//  Пиксельный интерфейс — в одном стиле с героем.
//  Всё строится из «плашек»: ступенчатые углы, тёмная обводка, плоский цвет в два тона
//  (светлая полоса сверху, тёмная «губа» снизу). Иконки пикселизуются и обводятся контуром
// ============================================================

const U = 3;                 // размер «пикселя» интерфейса в CSS-пикселях
const OUTLINE = '#1a1222';   // обводка всего интерфейса
const UI = {
  panel: '#2a2238',  // фон панелей
  base:  '#4a3d63',  // карточки и обычные кнопки
  off:   '#55525e',  // неактивное
  dark:  '#1c1628',  // углубления (под иконкой, полоски прогресса)
  gold:  '#f2b632',  // главное действие
  green: '#4cc35a',  // «забрать», «бесплатно»
  purple: '#9b5de5', // реклама
  cyan:  '#3fb7d9',
  text:  '#fff4dc',
  soft:  '#cbbfe0',
};
const snap = v => Math.round(v / U) * U;

// Цвет светлее (k > 0) или темнее (k < 0)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), t = k < 0 ? 0 : 255, p = Math.abs(k);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * p));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
const isLight = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 150; };

// Плашка: обводка со срезанными углами, заливка, светлая полоса сверху, «губа» снизу (lip — в пикселях интерфейса)
function pxBox(x, y, w, h, color, lip = h > 36 ? 2 : 1) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + U, y, w - 2 * U, h);
  ctx.fillRect(x, y + U, w, h - 2 * U);
  ctx.fillStyle = color;
  ctx.fillRect(x + U, y + U, w - 2 * U, h - 2 * U);
  if (lip) { ctx.fillStyle = shade(color, -0.32); ctx.fillRect(x + U, y + h - U - lip * U, w - 2 * U, lip * U); }
  ctx.fillStyle = shade(color, 0.28);
  ctx.fillRect(x + 2 * U, y + U, w - 4 * U, U);
  ctx.fillRect(x + U, y + 2 * U, U, U);
}
// Углубление (под иконку, полоска прогресса): тёмное, с тенью сверху
function pxInset(x, y, w, h) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + U, y, w - 2 * U, h); ctx.fillRect(x, y + U, w, h - 2 * U);
  ctx.fillStyle = UI.dark; ctx.fillRect(x + U, y + U, w - 2 * U, h - 2 * U);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + U, y + U, w - 2 * U, U);
}
// Лента-заголовок: плашка с хвостиками-ромбами по бокам
function pxRibbon(s, cx, cy, color, size = 18, maxW = W - 40) {
  s = tr(s).toUpperCase(); // пиксельный шрифт лучше читается заглавными
  ctx.font = fontFor(size, true);
  const w = Math.min(maxW, ctx.measureText(s).width + 44), h = size + 18, x = cx - w / 2, y = cy - h / 2;
  for (const side of [-1, 1]) {
    const dx = side < 0 ? x - 4 * U : x + w + U;
    ctx.fillStyle = OUTLINE; ctx.fillRect(snap(dx), snap(cy - 2 * U), 3 * U, 4 * U); ctx.fillRect(snap(dx) + U, snap(cy - 3 * U), U, 6 * U);
    ctx.fillStyle = shade(color, -0.25); ctx.fillRect(snap(dx) + U, snap(cy - U), U, 2 * U);
  }
  pxBox(x, y, w, h, color, 1);
  outlined(s, cx, cy, size, '#fff', 'center', w - 24, true);
}

// Шрифты: заголовки и ленты — пиксельный Pixelify Sans, остальное (цифры, цены, описания) — системный, очень жирный
const PIXEL_FONT = '"Pixelify Sans", system-ui, sans-serif';
const fontFor = (size, pixel) => pixel ? `700 ${size}px ${PIXEL_FONT}` : `800 ${size}px system-ui, sans-serif`;
document.fonts && document.fonts.load(`700 16px "Pixelify Sans"`);

// Текст с тёмной обводкой — читается на любом фоне
function outlined(s, x, y, size, color, align = 'center', maxW, pixel = false) {
  ctx.font = fontFor(size, pixel);
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (maxW) { const w = ctx.measureText(s).width; if (w > maxW) { size = Math.max(size * 0.65, size * maxW / w); ctx.font = fontFor(size, pixel); } }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(3, size / 4.5);
  ctx.strokeText(s, x, y, maxW);
  ctx.fillStyle = color; ctx.fillText(s, x, y, maxW);
}
// Крупный заголовок экрана — пиксельным шрифтом
const headline = (s, x, y, size, color = '#ffd166', align = 'center', maxW) => outlined(s, x, y, size, color, align, maxW, true);

// ------------------------------------------------------------
//  Пиксельные иконки: векторная иконка рисуется на сетке ICON_GRID×ICON_GRID,
//  полупрозрачные края отсекаются, вокруг — обводка. Результат кэшируется по ключу
// ------------------------------------------------------------

const ICON_GRID = 20;
const iconCache = new Map();
function pixelize(fn) {
  const n = ICON_GRID, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), main = ctx;
  ctx = g;              // иконки рисуют в глобальный ctx — подменяем на время
  try { fn(n / 2, n / 2, n - 3); } finally { ctx = main; }
  const img = g.getImageData(0, 0, n, n), d = img.data, solid = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const a = d[i * 4 + 3];
    if (a >= 100) { solid[i] = 1; const k = 255 / a; d[i * 4] = Math.min(255, d[i * 4] * k); d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * k); d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * k); d[i * 4 + 3] = 255; }
    else d[i * 4 + 3] = 0;
  }
  // Объём, как в пиксель-арте: свет сверху слева. Кромка сверху/слева светлее, снизу/справа темнее,
  // у верхнего левого края — пиксель-блик
  const src = new Uint8ClampedArray(d);
  const mix = (i, t, k) => { for (let c = 0; c < 3; c++) d[i * 4 + c] = src[i * 4 + c] + (t - src[i * 4 + c]) * k; };
  let spark = -1, best = 1e9;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (!solid[i]) continue;
    const up = y > 0 && solid[i - n], left = x > 0 && solid[i - 1];
    const down = y < n - 1 && solid[i + n], right = x < n - 1 && solid[i + 1];
    if (!up || !left) mix(i, 255, 0.32);
    else if (!down || !right) mix(i, 0, 0.3);
    else if (x + y < best && y > 0 && x > 0 && solid[i - n - 1]) { best = x + y; spark = i; }
  }
  if (spark >= 0) mix(spark, 255, 0.75);
  // Контур: прозрачная клетка рядом с закрашенной становится обводкой
  const o = [0x14, 0x10, 0x26];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < n - 1 && solid[i + 1]) || (y > 0 && solid[i - n]) || (y < n - 1 && solid[i + n])) {
      d[i * 4] = o[0]; d[i * 4 + 1] = o[1]; d[i * 4 + 2] = o[2]; d[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// Иконка с ключом кэша: фабрики иконок помечают свои функции (keyed), остальные — по тексту функции
const keyed = (key, fn) => { fn.key = key; return fn; };
function drawIcon(fn, x, y, s) {
  if (fn.raw) { fn(x, y, s); return; } // уже пиксельное (герой, питомец)
  const key = fn.key || fn.toString();
  let c = iconCache.get(key);
  if (!c) { c = pixelize(fn); iconCache.set(key, c); }
  const k = Math.max(1, Math.round(s / ICON_GRID)), size = ICON_GRID * k;
  const sm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  ctx.imageSmoothingEnabled = sm;
}

// ------------------------------------------------------------
//  Пазл-деталь: толстая плашка с выступами сверху и справа, внутри — иконка того, на что пазл
//  (оружие, тотем, скин). Без иконки — джокер: звезда, вкладывается в любой предмет своего цвета
// ------------------------------------------------------------

function puzzlePiece(x, y, s, color, icon) {
  const k = snap(s * 0.24), b = snap(s - k), kw = snap(s * 0.34);
  const bx = snap(x - s / 2), by = snap(y - s / 2 + k);
  const tx = snap(bx + (b - kw) / 2), ry = snap(by + (b - kw) / 2);
  pxBox(bx, by, b, b, color, 1);
  // Выступы: рисуем поверх тела и закрашиваем шов, чтобы деталь была цельной
  pxBox(tx, by - k + U, kw, k + U, color, 0);
  pxBox(bx + b - 2 * U, ry, k + U, kw, color, 0);
  ctx.fillStyle = color;
  ctx.fillRect(tx + U, by - U, kw - 2 * U, 3 * U);
  ctx.fillRect(bx + b - 3 * U, ry + U, 3 * U, kw - 2 * U);
  if (s < 34) return; // маленькая деталь — только цвет
  if (icon) drawIcon(icon, bx + b / 2, by + b / 2 - 1, b * 0.75);
  else outlined('★', bx + b / 2, by + b / 2, b * 0.5, '#fff');
}
const puzzleIcon = (color, icon) => Object.assign((x, y, s) => puzzlePiece(x, y, s, color, icon), { raw: true });

// Гем-джокер цвета: ромб со звездой
const jokerGemIcon = color => keyed('jgem' + color, (x, y, s) => {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y - s * 0.4); ctx.lineTo(x + s * 0.32, y); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x - s * 0.32, y); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.06 : s * 0.15, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.fill();
});

// ------------------------------------------------------------
//  Значки прямо в тексте: синий и красный ключ. В строке — символы KB / KR,
//  при выводе на холст вместо них рисуется пиксельная иконка размером с шрифт
// ------------------------------------------------------------

const KB = '', KR = '';
const keyChar = color => (color === 'red' ? KR : KB);
const INLINE = { [KB]: () => keyIcon('#4cc9f0'), [KR]: () => keyIcon('#ff5d73') };
const INLINE_RE = /[]/;
{
  const P = CanvasRenderingContext2D.prototype, fill = P.fillText, stroke = P.strokeText, measure = P.measureText;
  const sizeOf = g => parseFloat(g.font.match(/(\d+(\.\d+)?)px/)[1]);
  const parts = s => tr(s).split(/([\uE001\uE002])/).filter(Boolean);
  const widthOf = (g, s) => parts(s).reduce((w, p) => w + (INLINE[p] ? sizeOf(g) * 1.15 : measure.call(g, p).width), 0);
  P.measureText = function (s) {
    if (typeof s !== 'string' || !INLINE_RE.test(s)) return measure.call(this, s);
    return { width: widthOf(this, s) };
  };
  // Строка со значками выводится по частям; при сжатии по maxW — масштабом
  const draw = (orig, icons) => function (s, x, y, maxW) {
    if (typeof s !== 'string' || !INLINE_RE.test(s)) return maxW === undefined ? orig.call(this, s, x, y) : orig.call(this, s, x, y, maxW);
    const total = widthOf(this, s), k = maxW && total > maxW ? maxW / total : 1, align = this.textAlign;
    let cx = align === 'center' ? x - total * k / 2 : align === 'right' || align === 'end' ? x - total * k : x;
    const size = sizeOf(this);
    this.save(); this.textAlign = 'left';
    for (const p of parts(s)) {
      if (INLINE[p]) {
        if (icons) { const main = ctx; ctx = this; try { drawIcon(INLINE[p](), cx + size * 0.57 * k, y + (this.textBaseline === 'middle' ? 0 : -size * 0.35), size * 1.25 * k); } finally { ctx = main; } }
        cx += size * 1.15 * k;
      } else {
        const w = measure.call(this, p).width * k;
        orig.call(this, p, cx, y, w); cx += w;
      }
    }
    this.restore();
  };
  P.fillText = draw(fill, true);
  P.strokeText = draw(stroke, false);
}
