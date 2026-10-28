'use strict';

// ============================================================
//  Интерфейс вне забега: убежище, кампания, магазины,
//  настройки, окно уровня, пауза и итоги забега.
// ============================================================

// Вкладка убежища: campaign | endless | weapon | wardrobe | shop | boost | pet | settings | quests
let screen = 'campaign';
let wardTab = 'stats';            // раздел гардероба: stats | heroes | outfit
let shopTab = 'shelves';          // раздел магазина: shelves | chests | stars | sub
let ui = [];                      // кнопки, нарисованные в этом кадре: { x, y, w, h, act }
let menuScroll = 0, maxScroll = 0;
let toast = null;                 // { text, until }
let selLevel = SAVE.unlocked;     // выбранный уровень на вкладке кампании
let selDiff = 0;                  // выбранная сложность главы (DIFFS)
let resetAsk = 0;                 // время первого нажатия «Сбросить прогресс»

function setScreen(s) { screen = s; menuScroll = 0; }
function showToast(text) { toast = { text, until: performance.now() + 3500 }; }

// Ищем с конца: что нарисовано позже, то и сверху
function hitUi(x, y) {
  for (let i = ui.length - 1; i >= 0; i--) {
    const r = ui[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      gotLog = [];
      if (r.act) r.act();
      return true;
    }
  }
  return false;
}

// Возврат в убежище: на вкладке кампании выбран следующий уровень после победы или тот же после поражения
function goHub() {
  const R = G.result;
  newGame('menu');
  setScreen(R && R.mode === 'endless' ? 'catacombs' : 'campaign');
  joy = null;
  launch = null;
  if (R && R.mode === 'camp') selLevel = Math.min(SAVE.unlocked, R.outcome === 'win' ? R.level + 1 : R.level);
  else selLevel = Math.min(selLevel, SAVE.unlocked);
  if (R && R.mode === 'camp') selDiff = selLevel === R.level ? R.diff : 0;
  if (!diffOpen(selLevel, selDiff)) selDiff = 0;
}
function startCampaign(n, d = 0) {
  if (!diffOpen(n, d)) d = 0;
  newGame('play', 'camp', n, d);
  G.intro = 1;
}
function startEndless() { newGame('play', 'endless'); G.intro = 1; }

// Выход из убежища в бой: герой убегает вбок, камера отдаляется, экран гаснет — и начинается забег
const LAUNCH_T = 0.85;
let launch = null; // { t, run }
function launchRun(run) { if (!launch) launch = { t: 0, run }; }
function updateLaunch(dt) {
  if (!launch) return;
  launch.t += dt;
  const h = G.hero;
  h.face = 1;
  h.walk += dt;
  h.x += 240 * dt * Math.min(1, launch.t * 5);
  if (launch.t >= LAUNCH_T) { const run = launch.run; launch = null; run(); }
}
const launchFade = () => (launch ? clamp((launch.t - 0.5) / 0.3, 0, 1) : 0);
function menuFight() {
  if (screen === 'campaign') { if (selLevel <= SAVE.unlocked) launchRun(() => startCampaign(selLevel, selDiff)); }
}

// ------------------------------------------------------------
//  Примитивы
// ------------------------------------------------------------

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dim(a = 0.65) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = `rgba(5,6,10,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function text(s, x, y, size, color, align = 'left', bold = true, maxW) {
  ctx.font = `${bold ? 800 : 600} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (!maxW) { ctx.fillText(s, x, y); return; }
  // Не влезает — сначала уменьшаем шрифт (до 65%), и только потом сжимаем по ширине
  const w = ctx.measureText(s).width;
  if (w > maxW) ctx.font = `${bold ? 800 : 600} ${Math.max(size * 0.65, size * maxW / w)}px system-ui, sans-serif`;
  ctx.fillText(s, x, y, maxW);
}

// o: { label, act, color: цвет кнопки | dim: неактивная }; без них — обычная
function drawButton(r, o) {
  pxBox(r.x, r.y, r.w, r.h, o.color || (o.dim ? UI.off : UI.base));
  outlined(o.label, r.x + r.w / 2, r.y + r.h / 2 - 2, 17, o.dim ? '#d6d0e0' : '#fff', 'center', r.w - 24);
  ui.push({ ...r, act: o.act });
}

// Столбик кнопок по центру экрана, начиная с y
function buttonColumn(y, list, bh = 48, gap = 10, cx = W / 2, maxW = W - 32) {
  const bw = Math.min(maxW, 340), x = cx - bw / 2;
  list.forEach((o, i) => drawButton({ x, y: y + i * (bh + gap), w: bw, h: bh }, o));
}
const PRIMARY = { color: UI.gold };

function drawToast() {
  if (!toast || performance.now() > toast.until) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.font = 'bold 14px system-ui, sans-serif';
  const w = Math.min(W - 32, ctx.measureText(toast.text).width + 32), x = (W - w) / 2;
  const y = G.state === 'menu' ? H - tabBarH() - 56 : H - 76;
  pxBox(x, y, w, 42, UI.panel, 1);
  outlined(toast.text, W / 2, y + 19, 14, '#fff', 'center', w - 24);
}

// ------------------------------------------------------------
//  Иконки
// ------------------------------------------------------------

function medalIcon(color, rare) {
  return keyed('medal' + color + rare, (x, y, s) => {
    // лента сверху и медаль на ней
    ctx.fillStyle = '#5a6ab0';
    ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.42); ctx.lineTo(x - s * 0.1, y - s * 0.42); ctx.lineTo(x + s * 0.06, y - s * 0.05); ctx.lineTo(x - s * 0.12, y - s * 0.05); ctx.fill();
    ctx.fillStyle = '#4a5a9a';
    ctx.beginPath(); ctx.moveTo(x + s * 0.3, y - s * 0.42); ctx.lineTo(x + s * 0.1, y - s * 0.42); ctx.lineTo(x - s * 0.06, y - s * 0.05); ctx.lineTo(x + s * 0.12, y - s * 0.05); ctx.fill();
    ctx.fillStyle = rare ? '#c77dff' : '#8a8f99';
    ctx.beginPath(); ctx.arc(x, y + s * 0.12, s * 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y + s * 0.12, s * 0.2, 0, TAU); ctx.fill();
  });
}

function weaponIcon(id) {
  const c = WEAPONS[id].color;
  return keyed('weapon' + id, (x, y, s) => {
    ctx.fillStyle = c; ctx.strokeStyle = c;
    if (id === 'wand') {
      // лук: дуга, тетива и стрела; повёрнут на 45° против часовой, как меч, и отцентрован
      ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4); ctx.translate(-s * 0.17, 0);
      ctx.strokeStyle = '#a8743a'; ctx.lineWidth = s * 0.08;
      ctx.beginPath(); ctx.arc(-s * 0.12, 0, s * 0.34, -1.2, 1.2); ctx.stroke();
      const ex = -s * 0.12 + Math.cos(1.2) * s * 0.34, ey = s * 0.34 * Math.sin(1.2);
      ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = s * 0.025;
      ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.04;
      ctx.beginPath(); ctx.moveTo(ex - s * 0.08, 0); ctx.lineTo(s * 0.34, 0); ctx.stroke();
      ctx.fillStyle = '#e6edf5';
      ctx.beginPath(); ctx.moveTo(s * 0.42, 0); ctx.lineTo(s * 0.3, -s * 0.07); ctx.lineTo(s * 0.3, s * 0.07); ctx.fill();
      ctx.restore();
    } else if (id === 'orbit') {
      // сюрикен: четыре луча, светлые грани, дырка в центре
      ctx.fillStyle = '#8a96a8';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 2, r = k % 2 ? s * 0.13 : s * 0.44; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      ctx.fill();
      ctx.fillStyle = '#e6edf5';
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s * 0.44, y + Math.sin(a) * s * 0.44); ctx.lineTo(x + Math.cos(a - 0.6) * s * 0.13, y + Math.sin(a - 0.6) * s * 0.13); ctx.fill(); }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x, y, s * 0.07, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (id === 'aura') {
      // меч: клинок по диагонали, гарда, рукоять
      ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
      const g = ctx.createLinearGradient(-s * 0.06, 0, s * 0.06, 0);
      g.addColorStop(0, '#f4f7fb'); g.addColorStop(1, '#8a96a8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.lineTo(s * 0.065, -s * 0.32); ctx.lineTo(s * 0.065, s * 0.12); ctx.lineTo(-s * 0.065, s * 0.12); ctx.lineTo(-s * 0.065, -s * 0.32); ctx.fill();
      ctx.fillStyle = '#c99a2e'; ctx.fillRect(-s * 0.2, s * 0.12, s * 0.4, s * 0.07);
      ctx.fillStyle = '#5a3a1c'; ctx.fillRect(-s * 0.04, s * 0.19, s * 0.08, s * 0.16);
      ctx.fillStyle = '#c99a2e'; ctx.beginPath(); ctx.arc(0, s * 0.38, s * 0.05, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (id === 'stench') {
      // аура: вонючее облако с завитками
      ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(x, y, s * 0.38, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      for (const [dx, dy, r] of [[-0.14, 0.04, 0.16], [0.1, -0.06, 0.18], [0.05, 0.14, 0.13]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = '#6b8a2a'; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(x - s * 0.08, y - s * 0.26, s * 0.08, Math.PI, 0); ctx.arc(x + s * 0.08, y - s * 0.26, s * 0.08, Math.PI, 0, true); ctx.stroke();
    } else {
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 0.785) * s * 0.3, y + Math.sin(i * 0.785) * s * 0.3, s * 0.06, 0, TAU); ctx.fill(); }
    }
  });
}

// Герой и питомец уже пиксельные — рисуются как есть (raw), без пикселизации
const heroIcon = (hero, outfit) => Object.assign((x, y, s) => drawHeroSprite(x, y + s * 0.05, Math.max(1, Math.round(s / 16)), 1, 0, hero, outfit), { raw: true });

function starIcon(color) {
  return keyed('star' + color, (x, y, s) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.16 : s * 0.38, a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
  });
}

// Иконки характеристик: у каждой своя форма, чтобы различались не только цветом
const STAT_ICONS = {
  dmg: color => keyed('statdmg' + color, (x, y, s) => { // меч
    ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.38); ctx.lineTo(s * 0.07, -s * 0.28); ctx.lineTo(s * 0.07, s * 0.12); ctx.lineTo(-s * 0.07, s * 0.12); ctx.lineTo(-s * 0.07, -s * 0.28); ctx.fill();
    ctx.fillRect(-s * 0.2, s * 0.12, s * 0.4, s * 0.07);
    ctx.fillRect(-s * 0.04, s * 0.19, s * 0.08, s * 0.17);
    ctx.restore();
  }),
  crit: color => keyed('statcrit' + color, (x, y, s) => { // молния
    ctx.fillStyle = color;
    ctx.beginPath();
    [[0.1, -0.38], [-0.2, 0.04], [0, 0.04], [-0.1, 0.38], [0.2, -0.06], [0, -0.06]].forEach(([px, py]) => ctx.lineTo(x + px * s, y + py * s));
    ctx.fill();
  }),
  hp: color => keyed('stathp' + color, (x, y, s) => { // сердце
    const r = s * 0.15;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - r, y - s * 0.08, r, Math.PI, 0); ctx.arc(x + r, y - s * 0.08, r, Math.PI, 0);
    ctx.lineTo(x, y + s * 0.3); ctx.closePath(); ctx.fill();
  }),
  cd: color => keyed('statcd' + color, (x, y, s) => { // часы
    ctx.strokeStyle = color; ctx.lineWidth = s * 0.07;
    ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.16); ctx.lineTo(x, y); ctx.lineTo(x + s * 0.12, y + s * 0.08); ctx.stroke();
  }),
};

function pawIcon(x, y, s) {
  ctx.fillStyle = '#e9c46a';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.14, s * 0.2, s * 0.16, 0, 0, TAU); ctx.fill();
  for (const [dx, dy] of [[-0.27, -0.06], [-0.1, -0.24], [0.1, -0.24], [0.27, -0.06]]) {
    ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, s * 0.08, s * 0.1, 0, 0, TAU); ctx.fill();
  }
}

const CATEGORIES = {
  weapon: { name: 'Оружие',  icon: () => weaponIcon(heroWeapon()) },
  wardrobe: { name: 'Гардероб', icon: () => heroIcon(SAVE.hero, SAVE.outfit) },
  shop:     { name: 'Магазин',  icon: () => keyed('tabshop', (x, y, s) => chestIcon(x, y, s * 0.8, '#ffd166', 1)) },
  boost:  { name: 'Бусты',   icon: () => medalIcon('#ffd166', true),   sub: () => `Медальонов: ${Object.keys(MEDALS).filter(medalLvl).length} из ${Object.keys(MEDALS).length}` },
  pet:    { name: 'Питомец', icon: () => pawIcon, sub: () => PETS[SAVE.pet].name },
};

// ------------------------------------------------------------
//  Раскладка меню: нижняя панель вкладок, герой в убежище по центру
// ------------------------------------------------------------

const tabBarH = () => 68 + SAFE_B;

// Блок под героем на вкладке кампании: строка уровня + кнопка «В бой»
function fightBlock() {
  const land = W > H;
  const bh = land ? 44 : 52, selH = land ? 50 : 62, gap = land ? 6 : 10;
  const btnY = H - tabBarH() - 12 - bh;
  return { bh, selH, btnY, selY: btnY - gap - selH };
}

// Панель раздела (оружие, бусты…): справа в альбомной ориентации, снизу в портретной
function sheetRect() {
  const tb = tabBarH();
  if (W > H) { const w = Math.min(560, W * 0.56); return { x: W - w - 12, y: 58 + SAFE_T, w, h: H - tb - 66 - SAFE_T }; }
  const y = Math.max(230, Math.round(H * 0.42));
  return { x: 0, y, w: W, h: H - tb - y };
}

// Где на экране стоит герой (точка 0, 0 убежища) и насколько приближена камера
function menuCamera() {
  const top = 56 + SAFE_T;
  let x = W / 2, y, area;
  if (screen === 'campaign') {
    const f = fightBlock();
    area = f.selY - top - (screen === 'campaign' && W <= H ? levelCard(selLevel).h + 8 + 38 : 0); y = top + area * (W <= H ? 0.66 : 0.56);
  } else if (W > H) {
    const r = sheetRect();
    x = r.x / 2; area = H - tabBarH() - top; y = top + area * 0.52;
  } else {
    area = sheetRect().y - top; y = top + area * 0.7;
  }
  let zoom = clamp(area / 150, 1.4, 2.6);
  // Знамя на стене (верх на −131) не должно уходить под валюту
  if (W <= H) zoom = Math.max(1.1, Math.min(zoom, (y - top - 6) / (131 * SCALE)));
  if (launch) zoom *= 1 - 0.3 * clamp(launch.t / LAUNCH_T, 0, 1);
  return { x, y, zoom };
}

// ------------------------------------------------------------
//  Верх: валюта и настройки
// ------------------------------------------------------------

function drawChip(right, value, sym, color) {
  ctx.font = 'bold 15px system-ui, sans-serif';
  const s = value + ' ' + sym, w = ctx.measureText(s).width + 20;
  pxBox(right - w, 12 + SAFE_T, w, 33, UI.panel, 1);
  outlined(s, right - w / 2, 27 + SAFE_T, 15, color, 'center');
  return right - w - 8;
}

function drawMenuTop() {
  let rx = W - 12;
  const g = { x: rx - 40, y: 8 + SAFE_T, w: 40, h: 40, act: () => setScreen(screen === 'settings' ? 'campaign' : 'settings') };
  pxBox(g.x, g.y, g.w, g.h + 3, screen === 'settings' ? UI.gold : UI.base);
  drawIcon(gearIcon, g.x + 20, g.y + 20, 40);
  ui.push(g);
  rx = drawChip(rx - 48, SAVE.shards, '◆', '#7df9ff');
  rx = drawChip(rx, SAVE.stars, '⭐', '#ffd166');
  drawChip(rx, SAVE.gold, '●', '#ffd166');
}

// ------------------------------------------------------------
//  Нижняя панель вкладок (как в мобильных приложениях)
// ------------------------------------------------------------

const flagIcon = (x, y, s) => {
  ctx.fillStyle = '#c8cbd6'; ctx.fillRect(x - s * 0.28, y - s * 0.4, s * 0.07, s * 0.8);
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath(); ctx.moveTo(x - s * 0.21, y - s * 0.4); ctx.lineTo(x + s * 0.32, y - s * 0.24); ctx.lineTo(x - s * 0.21, y - s * 0.06); ctx.fill();
};
const infinityIcon = (x, y, s) => {
  ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = s * 0.1;
  ctx.beginPath(); ctx.ellipse(x - s * 0.17, y, s * 0.17, s * 0.13, 0, 0, TAU); ctx.ellipse(x + s * 0.17, y, s * 0.17, s * 0.13, 0, 0, TAU); ctx.stroke();
};

// Череп — вкладка «Катакомбы»
const skullIcon = (x, y, s) => {
  ctx.fillStyle = '#e8e0cc';
  ctx.beginPath(); ctx.arc(x, y - s * 0.06, s * 0.3, Math.PI * 0.85, Math.PI * 0.15); ctx.lineTo(x + s * 0.18, y + s * 0.3); ctx.lineTo(x - s * 0.18, y + s * 0.3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a1e14';
  ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.04, s * 0.08, 0, TAU); ctx.arc(x + s * 0.12, y - s * 0.04, s * 0.08, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.06); ctx.lineTo(x - s * 0.04, y + s * 0.14); ctx.lineTo(x + s * 0.04, y + s * 0.14); ctx.fill();
  for (const dx of [-0.08, 0, 0.08]) ctx.fillRect(x + dx * s - s * 0.015, y + s * 0.2, s * 0.03, s * 0.1);
};

// Все вкладки видны сразу; закрытые — с замком и уровнем, на котором откроются
// Порядок вкладок слева направо; «Бой» — кампания, «Катакомбы» — испытания (первое — Фармилка)
const TAB_ORDER = ['shop', 'wardrobe', 'pet', 'campaign', 'weapon', 'boost', 'catacombs'];
function tabsList() {
  const fixed = { campaign: { name: 'Бой', icon: flagIcon }, catacombs: { name: 'Катакомбы', icon: skullIcon } };
  return TAB_ORDER.map(id => fixed[id]
    ? { id, ...fixed[id] }
    : { id, name: CATEGORIES[id].name, icon: CATEGORIES[id].icon(), locked: !isOpen(id) });
}

function lockIcon(x, y, s, color) {
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.13;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12, s * 0.2, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = color;
  roundRect(x - s * 0.3, y - s * 0.12, s * 0.6, s * 0.46, s * 0.08); ctx.fill();
}

function drawTabBar() {
  const tb = tabBarH(), y = H - tb, tabs = tabsList();
  const w = Math.min(110, W / tabs.length), x0 = (W - w * tabs.length) / 2;
  ctx.fillStyle = UI.panel; ctx.fillRect(0, y, W, tb);
  ctx.fillStyle = OUTLINE; ctx.fillRect(0, y, W, U);
  ctx.fillStyle = shade(UI.panel, 0.15); ctx.fillRect(0, y + U, W, U);
  tabs.forEach((t, i) => {
    const r = { x: x0 + i * w, y, w, h: 68 }, on = screen === t.id;
    if (on) pxBox(r.x + 2, y - 6, w - 4, 72, UI.gold); // выбранная вкладка — золотая плитка, чуть выше панели
    if (t.locked) {
      // Обычная иконка и подпись, только приглушённые; в углу — маленький замок с уровнем открытия
      ctx.save();
      ctx.globalAlpha *= 0.4;
      drawIcon(t.icon, r.x + w / 2, y + 28, 40);
      ctx.restore();
      outlined(t.name, r.x + w / 2, y + 55, 11, '#8f87a0', 'center', w - 4);
      ctx.font = 'bold 9px system-ui, sans-serif';
      const bw = 15 + ctx.measureText(UNLOCKS[t.id]).width, by = y + 9;
      const bx = Math.min(r.x + w / 2 + 10, r.x + w - bw); // значок не вылезает за край вкладки
      ctx.fillStyle = '#2c3040';
      roundRect(bx - 2, by - 7, bw, 14, 7); ctx.fill();
      lockIcon(bx + 5, by + 0.5, 10, '#c8cbd6');
      text(String(UNLOCKS[t.id]), bx + 11, by + 0.5, 9, '#c8cbd6', 'left');
      ui.push({ ...r, act: () => showToast(`${t.name} откроется с ${UNLOCKS[t.id]}-й главы кампании`) });
      return;
    }
    ctx.save();
    drawIcon(t.icon, r.x + w / 2, y + (on ? 22 : 27), 40);
    ctx.restore();
    outlined(t.name, r.x + w / 2, y + 55, on ? 12 : 11, on ? '#fff' : UI.soft, 'center', w - 4);
    ui.push({ ...r, act: () => setScreen(t.id) });
  });
}

// ------------------------------------------------------------
//  Кампания и бесконечный: подпись под героем и кнопка «В бой»
// ------------------------------------------------------------

// Несколько кусков текста разного цвета в одну строку по центру
function textRuns(runs, cx, y, size, maxW) {
  ctx.font = `${size}px system-ui, sans-serif`;
  const total = runs.reduce((sum, [s]) => sum + ctx.measureText(s).width, 0);
  const k = Math.min(1, maxW / total);
  let x = cx - total * k / 2;
  for (const [s, color] of runs) {
    const w = ctx.measureText(s).width * k;
    text(s, x, y, size, color, 'left', false, w);
    x += w;
  }
}

// Подложка, чтобы текст читался поверх сцены, не затемняя героя
function bottomShade(fromY) {
  const g = ctx.createLinearGradient(0, fromY, 0, H);
  g.addColorStop(0, 'rgba(5,6,10,0)'); g.addColorStop(0.45, 'rgba(5,6,10,0.7)'); g.addColorStop(1, 'rgba(5,6,10,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, fromY, W, H - fromY);
}

// Сила игрока против рекомендуемой для уровня (по модели экономики)
const playerPower = () => ECON.weaponMult(wLvl(heroWeapon())) * (1 + 0.15 * medalLvl('fury')) * (1 + statPct('dmg') / 100) * (heroBonuses()[heroWeapon()] || 1);

function arrowButton(r, dir, enabled, act) {
  ctx.save();
  ctx.globalAlpha *= enabled ? 1 : 0.3;
  pxBox(r.x, r.y, r.w, r.h, UI.base);
  outlined(dir < 0 ? '‹' : '›', r.x + r.w / 2, r.y + r.h / 2 - 4, 30, '#fff', 'center');
  ctx.restore();
  ui.push({ ...r, act });
}

// Разбить текст на строки не шире maxW
function wrapText(s, maxW, size) {
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  s = tr(s); // переносим уже переведённый текст: у перевода другая длина слов
  const lines = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Карточка уровня: локация, лор и особенности. В портретной — над строкой уровня,
// в альбомной — слева от героя.
function levelCard(n) {
  const f = fightBlock(), land = W > H;
  const w = land ? Math.min(320, W * 0.3) : Math.min(W - 24, 420);
  const lines = wrapText(levelLore(n), w - 24, 13), traits = levelTraits(n);
  const h = 14 + 16 + lines.length * 17 + (traits.length ? 30 : 0) + 8;
  // Под карточкой (в альбомной) или над строкой главы (в портретной) — переключатель сложности
  const y0 = 60 + SAFE_T;
  if (land) return { x: 12, y: y0, w, h, lines, traits, diff: { x: 12, y: y0 + h + 6, w, h: 32 } };
  const dy = f.selY - 6 - 32;
  return { x: (W - w) / 2, y: dy - 8 - h, w, h, lines, traits, diff: { x: (W - w) / 2, y: dy, w, h: 32 } };
}

// Три сложности главы: закрытые — с замком, тап по закрытой объясняет, как открыть
function drawDiffPicker(n, r) {
  const gap = 6, bw = (r.w - gap * 2) / 3;
  DIFFS.forEach((D, d) => {
    const b = { x: r.x + d * (bw + gap), y: r.y, w: bw, h: r.h }, open = diffOpen(n, d), on = open && selDiff === d, done = SAVE.cleared[clearKey(n, d)];
    pxBox(b.x, b.y, b.w, b.h, on ? D.color : open ? UI.base : UI.off, 1);
    const label = (open ? '' : '🔒 ') + D.name + (done ? ' ✓' : '');
    outlined(label, b.x + b.w / 2, b.y + b.h / 2 - 1, 13, on ? '#fff' : open ? D.color : '#d6d0e0', 'center', b.w - 12);
    ui.push({ ...b, act: () => { if (open) selDiff = d; else if (n <= SAVE.unlocked) showToast(`Сначала пройди главу ${n} на сложности «${DIFFS[d - 1].name}»`); } });
  });
}

function drawLevelCard(n) {
  const c = levelCard(n), L = locOf(n);
  pxBox(c.x, c.y, c.w, c.h, UI.panel, 1);
  outlined(L.name + (n === L.to ? ' · финал локации' : ''), c.x + 12, c.y + 19, 13, L.color, 'left', c.w - 24);
  c.lines.forEach((l, i) => text(l, c.x + 12, c.y + 38 + i * 17, 13, UI.soft, 'left', false));
  let x = c.x + 12;
  const y = c.y + 30 + c.lines.length * 17 + 6;
  for (const t of c.traits) {
    const v = traitView(t, n), label = v.icon + ' ' + v.name;
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 16;
    pxInset(x, y, w, 24);
    outlined(label, x + w / 2, y + 12, 12, v.color, 'center');
    x += w + 6;
  }
}

// Кнопка календаря (недельные задания) сбоку на вкладке кампании; красная точка — есть что забрать
// Шестерёнка настроек и календарь заданий — пиксельные иконки
const gearIcon = keyed('gear', (x, y, s) => {
  ctx.fillStyle = '#c9d3e0';
  for (let i = 0; i < 8; i++) { ctx.save(); ctx.translate(x, y); ctx.rotate(i * TAU / 8); ctx.fillRect(-s * 0.07, -s * 0.42, s * 0.14, s * 0.2); ctx.restore(); }
  ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(x, y, s * 0.12, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
});
const calendarIcon = keyed('calendar', (x, y, s) => {
  const w = s * 0.8, h = s * 0.7, l = x - w / 2, t = y - h / 2 + s * 0.04;
  ctx.fillStyle = '#f4f0e6'; ctx.fillRect(l, t, w, h);
  ctx.fillStyle = '#e5484d'; ctx.fillRect(l, t, w, h * 0.3);
  ctx.fillStyle = '#c9d3e0'; ctx.fillRect(l + w * 0.2, t - s * 0.1, s * 0.09, s * 0.18); ctx.fillRect(l + w * 0.7, t - s * 0.1, s * 0.09, s * 0.18);
  ctx.fillStyle = '#8a8f99';
  for (let i = 0; i < 6; i++) ctx.fillRect(l + w * (0.14 + (i % 3) * 0.27), t + h * (0.44 + Math.floor(i / 3) * 0.28), w * 0.18, h * 0.16);
});

function drawCalendarButton() {
  const b = { x: W - 12 - 48, y: 56 + SAFE_T, w: 48, h: 48, act: () => setScreen('quests') };
  pxBox(b.x, b.y, b.w, b.h, UI.base);
  drawIcon(calendarIcon, b.x + b.w / 2, b.y + b.h / 2 - 1, 40);
  const n = weekClaimable();
  if (n) { pxBox(b.x + b.w - 15, b.y - 9, 24, 24, '#e5484d', 1); outlined(String(n), b.x + b.w - 3, b.y + 2, 12, '#fff'); }
  ui.push(b);
}

function drawCampaignTab() {
  const f = fightBlock(), n = selLevel, land = W > H;
  bottomShade(f.selY - 40);
  if (!diffOpen(n, selDiff)) selDiff = 0;
  drawLevelCard(n);
  drawDiffPicker(n, levelCard(n).diff);
  drawCalendarButton();
  const rw = Math.min(W - 24, 420), rx = (W - rw) / 2, ah = 44, ay = f.selY + (f.selH - ah) / 2;
  arrowButton({ x: rx, y: ay, w: ah, h: ah }, -1, n > 1, () => { if (selLevel > 1) selLevel--; });
  // Можно заглянуть на одну закрытую главу вперёд: вместо «В бой» там написано, что пройти сначала
  const last = Math.min(SAVE.unlocked + 1, CAMPAIGN_LEVELS);
  arrowButton({ x: rx + rw - ah, y: ay, w: ah, h: ah }, 1, n < last, () => { if (selLevel < last) selLevel++; });
  const tw = rw - ah * 2 - 16;
  text(`Глава ${n} — ${levelName(n)}`, W / 2 + 1, f.selY + f.selH * 0.36 + 1, land ? 18 : 21, '#000', 'center', true, tw);
  text(`Глава ${n} — ${levelName(n)}`, W / 2, f.selY + f.selH * 0.36, land ? 18 : 21, '#fff', 'center', true, tw);
  const odds = playerPower() / (ECON.levelHp(n) * DIFFS[selDiff].hp);
  const [word, color] = odds >= 1.5 ? ['легко', '#57e389'] : odds >= 1 ? ['по силам', '#ffd166'] : odds >= 0.6 ? ['тяжело', '#ff9f43'] : ['очень тяжело', '#ff5d73'];
  textRuns([
    [`Босс через ${fmtTime(ECON.bossTime(n))}: ${BOSSES[levelBoss(n)].name} · `, '#c8cbd6'],
    [word, color],
  ], W / 2, f.selY + f.selH * 0.78, 12, tw);
  const bw = Math.min(W - 32, 340), bx = (W - bw) / 2;
  if (n > SAVE.unlocked) { drawButton({ x: bx, y: f.btnY, w: bw, h: f.bh }, { label: `🔒 Сначала пройди главу ${n - 1}`, dim: true }); return; }
  // Рейд (подписка): пройденная глава на этой сложности — награда без боя
  if (SAVE.cleared[clearKey(n, selDiff)]) {
    const rw = 104, left = raidsLeft(), sub = subsOn().length;
    drawButton({ x: bx, y: f.btnY, w: rw, h: f.bh }, sub
      ? { label: `⚡ Рейд ${left}`, ...(left ? { color: UI.cyan } : { dim: true }),
          act: () => (left ? done(raid(n, selDiff)) : showToast('Рейды на сегодня закончились')) }
      : { label: '⚡ Рейд', dim: true, act: () => { showToast('Рейды — награда главы без боя, в подписке'); shopTab = 'sub'; setScreen('shop'); } });
    drawButton({ x: bx + rw + 8, y: f.btnY, w: bw - rw - 8, h: f.bh }, { label: 'В БОЙ', ...PRIMARY, act: menuFight });
    return;
  }
  drawButton({ x: bx, y: f.btnY, w: bw, h: f.bh }, { label: 'В БОЙ', ...PRIMARY, act: menuFight });
}

// Катакомбы: испытания. Первое — Фармилка (бесконечная орда), остальные — скоро
function catacombItems() {
  const best = SAVE.best.kills ? `Рекорд: ${fmtTime(SAVE.best.time)} · ${SAVE.best.kills} убийств` : 'Рекорда пока нет';
  return [
    { name: 'Фармилка', color: '#4cc9f0', icon: infinityIcon, info: 'Бесконечная орда · люк через 2:00 · смерть −50% золота',
      tag: best, tagColor: '#4cc9f0', btn: { label: 'Спуститься', ok: true, act: () => launchRun(startEndless) } },
    ...['Сокровищница', 'Испытание', 'Логово'].map(name => ({
      name: name + ' — скоро', color: '#6b7080', icon: (x, y, s) => lockIcon(x, y, s * 0.5, '#6b7080'), info: 'Новое испытание в катакомбах',
      btn: { label: 'Скоро', ok: false, why: 'Это испытание ещё строится' },
    })),
  ];
}

// ------------------------------------------------------------
//  Списки карточек с прокруткой (в панели раздела)
// ------------------------------------------------------------

// it: { name, info, tag, tagColor, color, icon, mark, toggle, btn: { label, ok, act, why }, act }
function drawCard(r, it) {
  // Заголовок раздела — лента по центру
  if (it.header) { pxRibbon(it.header, r.x + r.w / 2, r.y + r.h / 2 + 3, '#e8a33a', 15, r.w - 40); return; }
  if (it.tile) { drawTile(r, it); return; }
  pxBox(r.x, r.y, r.w, r.h, UI.base);
  if (it.mark) pxFrame(r.x, r.y, r.w, r.h, it.color);
  const s = 60, ix = r.x + 12, iy = r.y + (r.h - s) / 2 - 2;
  pxInset(ix, iy, s, s);
  if (it.icon) drawIcon(it.icon, ix + s / 2, iy + s / 2, s);
  else { ctx.fillStyle = it.color; ctx.fillRect(snap(ix + 18), snap(iy + 18), 24, 24); }
  if (it.act) ui.push({ ...r, act: it.act });

  const tx = r.x + 84, right = it.btn || it.toggle !== undefined ? 118 : 16, tw = r.w - 84 - right;
  outlined(it.name, tx, r.y + 22, 16, '#fff', 'left', tw);
  text(it.info, tx, r.y + 44, 13, UI.soft, 'left', false, tw);
  if (it.tag) outlined(it.tag, tx, r.y + 64, 12, it.tagColor || UI.soft, 'left', tw);

  if (it.toggle !== undefined) {
    const sx = r.x + r.w - 16 - 48, sy = r.y + r.h / 2 - 15;
    pxBox(sx, sy, 48, 27, it.toggle ? UI.green : UI.off, 1);
    pxBox(it.toggle ? sx + 24 : sx + 3, sy + 3, 21, 18, '#fff', 1);
  } else if (it.btn) {
    const b = it.btn, br = { x: r.x + r.w - 12 - 102, y: r.y + (r.h - 45) / 2 - 2, w: 102, h: 45 };
    pxBox(br.x, br.y, br.w, br.h, b.ok ? b.color || UI.gold : UI.off);
    if (b.flag) {
      drawIcon(langFlag(b.flag), br.x + 20, br.y + br.h / 2 - 2, 20);
      outlined(b.label, br.x + 34, br.y + br.h / 2 - 2, 13, '#fff', 'left', br.w - 40);
    } else outlined(b.label, br.x + br.w / 2, br.y + br.h / 2 - 2, 14, b.ok ? '#fff' : '#d6d0e0', 'center', br.w - 14);
    ui.push({ ...br, act: b.ok ? b.act : () => { if (b.why) showToast(b.why); } });
    if (b.anchor) b.anchor(br);
  }
}

// Цветная рамка внутри плашки (выбранное)
function pxFrame(x, y, w, h, color) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  ctx.fillStyle = color;
  ctx.fillRect(x + U, y + U, w - 2 * U, U); ctx.fillRect(x + U, y + h - 2 * U, w - 2 * U, U);
  ctx.fillRect(x + U, y + U, U, h - 2 * U); ctx.fillRect(x + w - 2 * U, y + U, U, h - 2 * U);
}

// Плитка (оружие, бусты, герои): цвет предмета, имя сверху, крупная иконка, уровень, полоска пазлов.
// Тап — окно с подробностями. it: { id, tile, name, color, icon, badge, bar: { v, max }, ready, mark, dim }
function drawTile(r, it) {
  pxBox(r.x, r.y, r.w, r.h, it.dim ? UI.off : shade(it.color, -0.2));
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(snap(r.x + U), snap(r.y + U), snap(r.w - 2 * U), 27);
  outlined(it.name, r.x + r.w / 2, r.y + 16, 13, '#fff', 'center', r.w - 10);
  ctx.save();
  if (it.dim) ctx.globalAlpha *= 0.55;
  drawIcon(it.icon, r.x + r.w / 2, r.y + 62, 60);
  ctx.restore();
  if (it.badge) outlined(it.badge, r.x + r.w / 2, r.y + 94, 14, '#ffe27a', 'center', r.w - 8);
  if (it.bar) {
    const bx = r.x + 8, by = r.y + r.h - 31, bw = r.w - 16, k = Math.min(1, it.bar.v / it.bar.max);
    pxInset(bx, by, bw, 21);
    if (k > 0) { ctx.fillStyle = k >= 1 ? UI.green : it.color; ctx.fillRect(snap(bx + U), snap(by + U), snap((bw - 2 * U) * k), 15); }
    outlined(`${it.bar.v}/${it.bar.max}`, r.x + r.w / 2 + 9, by + 10, 12, '#fff', 'center', bw - 32);
    puzzlePiece(bx + 12, by + 8, 24, it.color);
  }
  if (it.mark) { pxBox(r.x + r.w - 27, r.y - 6, 30, 27, UI.green, 1); outlined('✓', r.x + r.w - 12, r.y + 6, 15, '#fff'); }
  if (it.ready) { pxBox(r.x - 3, r.y - 6, 24, 27, '#e5484d', 1); outlined('!', r.x + 9, r.y + 6, 16, '#fff'); }
  ui.push({ ...r, act: () => { detail = it.id; } });
}

// Флаги языков. Русскому — белый флаг
function langFlag(lang) {
  return keyed('flag' + lang, (x, y, s) => {
    const w = s * 0.86, h = s * 0.58, l = x - w / 2, t = y - h / 2;
    if (lang === 'uk') {
      ctx.fillStyle = '#2f6fdb'; ctx.fillRect(l, t, w, h / 2);
      ctx.fillStyle = '#ffd43b'; ctx.fillRect(l, t + h / 2, w, h / 2);
    } else if (lang === 'en') {
      ctx.fillStyle = '#1f3a8a'; ctx.fillRect(l, t, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(l, t, w, h); ctx.clip();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = h * 0.22;
      ctx.beginPath(); ctx.moveTo(l, t); ctx.lineTo(l + w, t + h); ctx.moveTo(l + w, t); ctx.lineTo(l, t + h); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - w * 0.12, t, w * 0.24, h); ctx.fillRect(l, y - h * 0.18, w, h * 0.36);
      ctx.fillStyle = '#d4202f'; ctx.fillRect(x - w * 0.06, t, w * 0.12, h); ctx.fillRect(l, y - h * 0.09, w, h * 0.18);
    } else {
      ctx.fillStyle = '#f4f4f0'; ctx.fillRect(l, t, w, h);
      ctx.fillStyle = '#d6d6d0'; ctx.fillRect(l, t + h * 0.8, w, h * 0.2);
    }
  });
}

// Значок языка «文A»: иероглиф сзади, латинская A спереди
const translateIcon = Object.assign((x, y, s) => {
  pxBox(x - s * 0.42, y - s * 0.4, s * 0.52, s * 0.52, '#3f6fd8', 1);
  outlined('文', x - s * 0.16, y - s * 0.15, s * 0.3, '#fff');
  pxBox(x - s * 0.06, y - s * 0.06, s * 0.5, s * 0.5, '#f2b632', 1);
  outlined('A', x + s * 0.19, y + s * 0.17, s * 0.32, '#fff', 'center', undefined, true);
}, { raw: true });

// Выпадающий список языков под кнопкой в настройках
let langMenu = false, langAnchor = null;
function drawLangMenu() {
  if (!langMenu || screen !== 'settings' || !langAnchor) { langMenu = false; return; }
  const ids = Object.keys(LANGS), rh = 46, w = 190, x = Math.min(W - 12 - w, langAnchor.x + langAnchor.w - w), y = langAnchor.y + langAnchor.h + 6;
  ui.push({ x: 0, y: 0, w: W, h: H, act: () => { langMenu = false; } }); // тап мимо — закрыть
  pxBox(x, y, w, ids.length * rh + 12, UI.panel, 1);
  ids.forEach((id, i) => {
    const r = { x: x + 6, y: y + 6 + i * rh, w: w - 12, h: rh - 4 };
    if (id === LANG) pxBox(r.x, r.y, r.w, r.h, UI.base, 1);
    drawIcon(langFlag(id), r.x + 24, r.y + r.h / 2 - 1, 40);
    outlined(LANGS[id], r.x + 50, r.y + r.h / 2 - 1, 15, id === LANG ? '#ffe27a' : '#fff', 'left', r.w - 56);
    ui.push({ ...r, act: () => { langMenu = false; if (id !== LANG) setLang(id); } });
  });
}

// Окно подробностей плитки. Хранится только id — данные пересобираются каждый кадр
let detail = null;
function drawDetail() {
  if (!detail) return;
  const S = SHEETS[screen], it = S && S[1]().find(i => i.id === detail);
  if (!it) { detail = null; return; }
  ui = [];
  dim(0.72);
  const w = Math.min(W - 40, 360), x = (W - w) / 2;
  const lines = wrapText(it.info || '', w - 36, 14);
  const btns = [it.btn, ...(it.extra || []), it.actLabel && { label: it.actLabel, ok: true, color: UI.base, act: it.act }].filter(Boolean);
  const h = 196 + lines.length * 19 + (it.tag ? 24 : 0) + btns.length * 56, y = Math.max(20 + SAFE_T, (H - h) / 2);
  ui.push({ x: 0, y: 0, w: W, h: H, act: () => { detail = null; } }); // тап мимо окна — закрыть
  pxBox(x, y, w, h, UI.panel);
  ui.push({ x, y, w, h, act: () => {} });
  pxRibbon(it.name, W / 2, y, shade(it.dim ? '#55525e' : it.color, -0.15), 18, w - 20);
  pxInset(W / 2 - 51, y + 30, 102, 102);
  drawIcon(it.icon, W / 2, y + 81, 80);
  let ty = y + 152;
  if (it.badge) { outlined(it.badge, W / 2, ty, 16, '#ffe27a'); ty += 26; }
  for (const l of lines) { text(l, W / 2, ty, 14, UI.soft, 'center', false); ty += 19; }
  if (it.tag) { outlined(it.tag, W / 2, ty + 2, 12, it.tagColor || UI.soft, 'center', w - 24); ty += 24; }
  ty += 8;
  for (const b of btns) {
    drawButton({ x: x + 18, y: ty, w: w - 36, h: 48 }, { label: b.label, color: b.ok ? b.color || UI.gold : null, dim: !b.ok,
      act: b.ok ? b.act : () => { if (b.why) showToast(b.why); } });
    ty += 56;
  }
  const cx = { x: x + w - 42, y: y + 12, w: 32, h: 32, act: () => { detail = null; } };
  outlined('✕', cx.x + 16, cx.y + 16, 18, '#fff');
  ui.push(cx);
}

// Список в области area = { x, y, w, h }
function drawList(items, area, note) {
  const gap = 10, ch = 88, hh = 42;
  let top = area.y;
  const bottom = area.y + area.h;
  if (note) { outlined(note, area.x + area.w / 2, top + 10, 12, UI.soft, 'center', area.w - 24); top += 24; }
  const cols = area.w >= 820 ? 2 : 1;
  const cw = cols === 1 ? Math.min(area.w - 24, 560) : Math.min((area.w - 24 - gap) / 2, 520);
  const x0 = area.x + (area.w - (cols * cw + (cols - 1) * gap)) / 2;
  // Заголовок раздела — строка во всю ширину, карточки — по колонкам, плитки — сеткой по 4+
  const full = cols * cw + (cols - 1) * gap, tg = 9, tc = Math.max(3, Math.floor((full + tg) / (92 + tg)));
  const tw = (full - (tc - 1) * tg) / tc, th = 132;
  const pos = [];
  let y = 0, col = 0, tcol = 0;
  const endRow = () => { if (col) { y += ch + gap; col = 0; } if (tcol) { y += th + gap; tcol = 0; } };
  for (const it of items) {
    if (it.header) {
      endRow();
      pos.push({ x: x0, y, w: full, h: hh });
      y += hh;
    } else if (it.tile) {
      if (col) { y += ch + gap; col = 0; }
      pos.push({ x: x0 + tcol * (tw + tg), y: y + 6, w: tw, h: th });
      if (++tcol === tc) { y += th + gap; tcol = 0; }
    } else {
      if (tcol) { y += th + gap; tcol = 0; }
      pos.push({ x: x0 + col * (cw + gap), y, w: cw, h: ch });
      if (++col === cols) { y += ch + gap; col = 0; }
    }
  }
  endRow();
  maxScroll = Math.max(0, y - gap + 8 - (bottom - top));
  menuScroll = clamp(menuScroll, 0, maxScroll);
  ctx.save();
  ctx.beginPath(); ctx.rect(area.x, top, area.w, bottom - top); ctx.clip();
  items.forEach((it, i) => {
    const r = { ...pos[i], y: top + 4 + pos[i].y - menuScroll };
    if (r.y + r.h >= top && r.y <= bottom) drawCard(r, it);
  });
  ctx.restore();
  // Подсказка, что список прокручивается
  if (menuScroll < maxScroll) {
    const g = ctx.createLinearGradient(0, bottom - 30, 0, bottom);
    g.addColorStop(0, 'rgba(42,34,56,0)'); g.addColorStop(1, 'rgba(42,34,56,0.95)');
    ctx.fillStyle = g; ctx.fillRect(area.x, bottom - 30, area.w, 30);
  }
}

// Панель раздела с заголовком и списком
// segs — переключатель разделов под заголовком: { tabs: [[id, имя]], on, set }
function drawSheet(name, items, note, segs) {
  const r = sheetRect();
  // Панель раздела, название — лентой на верхнем краю
  pxBox(r.x, r.y, r.w, r.h + 24, UI.panel, 0);
  pxRibbon(name, r.x + r.w / 2, r.y + 2, '#e8a33a', 18, r.w - 60);
  let top = r.y + 30;
  if (segs) {
    const n = segs.tabs.length, sw = Math.min(150, (r.w - 36 - 6 * (n - 1)) / n);
    segs.tabs.forEach(([id, label], i) => {
      const b = { x: r.x + 18 + i * (sw + 6), y: top, w: sw, h: 36 }, on = segs.on === id;
      pxBox(b.x, b.y, b.w, b.h, on ? UI.gold : UI.base, 1);
      outlined(label, b.x + b.w / 2, b.y + 17, 14, on ? '#fff' : UI.soft, 'center', b.w - 10);
      ui.push({ ...b, act: () => { if (segs.on !== id) { segs.set(id); menuScroll = 0; } } });
    });
    top += 44;
  }
  drawList(items, { x: r.x, y: top, w: r.w, h: r.y + r.h - 4 - top }, note);
}

const NO_GOLD = 'Не хватает золота';

function weaponItems() {
  // Плитки в цвет редкости, по порядку: зелёные → синие → фиолетовые → …
  const order = Object.keys(TIERS);
  const list = Object.entries(WEAPONS).sort((a, b) => order.indexOf(a[1].tier) - order.indexOf(b[1].tier)).map(([id, w]) => {
    const L = wLvl(id), max = L >= ECON.weaponMax, own = heroWeapon() === id, on = own || SAVE.loadout.includes(id);
    return {
      id: 'w' + id, tile: true, name: w.name, color: TIERS[w.tier].color, icon: weaponIcon(id), mark: on,
      badge: `Ур. ${L}`, bar: max ? null : { v: wPuzzles(id), max: PUZZLES_PER_LEVEL }, ready: canUpgradeWeapon(id),
      info: w.info + '. ' + `Урон ×${ECON.weaponMult(L).toFixed(2)}` + (max ? '' : ` → ×${ECON.weaponMult(L + 1).toFixed(2)}`),
      tag: `${TIERS[w.tier].name} · Ур. ${L}/${ECON.weaponMax}` + (own ? ' · оружие героя' : on ? ' · в наборе на бой' : ''),
      tagColor: on ? TIERS[w.tier].color : UI.soft,
      actLabel: own ? null : on ? 'Убрать из набора' : 'Взять в бой',
      extra: max ? [] : [
        SAVE.tierPuzzles[w.tier] > 0 && { label: `★ Вложить пазлы-джокеры: ${SAVE.tierPuzzles[w.tier]}`, ok: true, color: TIERS[w.tier].color, act: () => useJokerPuzzles(id) },
        SAVE.jokerGems[w.tier] > 0 && { label: `★ Гем-джокер: +1 уровень`, ok: true, color: TIERS[w.tier].color, act: () => useJokerGem(id) },
      ].filter(Boolean),
      act: () => {
        if (own) showToast(`С этим оружием ${HEROES[SAVE.hero].name} начинает бой`);
        else if (!toggleLoadout(id)) showToast(`В наборе максимум ${MAX_RUN_WEAPONS - 1} оружий`);
      },
      btn: max ? { label: 'МАКС', ok: false }
        : { label: `Улучшить · 🧩 ${wPuzzles(id)}/${PUZZLES_PER_LEVEL}`, ok: canUpgradeWeapon(id), color: UI.green, act: () => upgradeWeapon(id),
            why: 'Нужно 10 пазлов — они в сундуках и в магазине' },
    };
  });
  // Джокеры: пазлы и гемы цвета, вкладываются в любое оружие своего цвета (кнопка в окне оружия)
  const jp = Object.keys(TIERS).filter(t => SAVE.tierPuzzles[t]), jg = Object.keys(TIERS).filter(t => SAVE.jokerGems[t]);
  if (jp.length) list.push({
    name: 'Пазлы-джокеры', color: TIERS[jp[0]].color, icon: puzzleIcon(TIERS[jp[0]].color),
    info: jp.map(t => `${TIERS[t].many}: ${SAVE.tierPuzzles[t]}`).join(' · '),
    tag: 'Вложи в любое оружие своего цвета — в окне оружия', tagColor: UI.soft,
  });
  if (jg.length) list.push({
    name: 'Гемы-джокеры', color: TIERS[jg[0]].color, icon: jokerGemIcon(TIERS[jg[0]].color),
    info: jg.map(t => `${TIERS[t].many}: ${SAVE.jokerGems[t]}`).join(' · '),
    tag: '+1 уровень любому оружию своего цвета — в окне оружия', tagColor: UI.soft,
  });
  return list;
}

// Бусты: пазлы из синего кейса. Гем за 100 кейсов — +1 уровень любому на выбор
function boostItems() {
  const gem = SAVE.gems.boost > 0;
  return Object.entries(MEDALS).map(([id, M]) => {
    const l = medalLvl(id), need = boostNeed(id), have = boostHave(id), locked = !l;
    const btn = !need ? { label: 'Максимум', ok: false }
      : have >= need ? { label: locked ? 'Открыть' : 'Улучшить', ok: true, color: UI.green, act: () => upgradeBoost(id) }
      : { label: `🧩 ${have}/${need}`, ok: false, why: 'Пазлы бустов — в кейсе бустов за синий ключ (Магазин → Сундуки)' };
    return {
      id: 'b' + id, tile: true, name: M.name, color: M.color, icon: medalIcon(M.color, M.rare), info: M.info, dim: locked,
      badge: locked ? 'Закрыт' : `Ур. ${l}`, bar: need ? { v: have, max: need } : null, ready: !!need && have >= need,
      tag: (locked ? 'Закрыт' : `Ур. ${l}/${M.max}`) + (need ? ` · на следующий: 🧩 ${need}` : ''), tagColor: M.color, btn,
      ...(gem && need ? { actLabel: '💎 Гем: +1 уровень', act: () => useGem('boost', id) } : {}),
    };
  });
}

// ------------------------------------------------------------
//  Недельные задания: шкала из 5 кейсов сверху, 10 заданий списком
// ------------------------------------------------------------

function chestIcon(x, y, w, color, alpha) {
  const h = w * 0.8;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#5a3d26'; roundRect(x - w / 2, y - h / 2, w, h, 3); ctx.fill();
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.38);
  ctx.fillRect(x - w / 2, y - h * 0.05, w, h * 0.14);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(x - w * 0.1, y - h * 0.15, w * 0.2, h * 0.3);
  ctx.globalAlpha = 1;
}

function questItems() {
  const w = week();
  return QUESTS.map((q, i) => {
    const p = questProgress(i), done = p >= q.goal, got = w.quests.includes(i);
    const prog = q.stat === 'endless' ? `${fmtTime(p)} / ${fmtTime(q.goal)}` : `${p} / ${q.goal}`;
    return {
      name: `${i + 1}. ${q.name}`, color: done && !got ? '#57e389' : '#4cc9f0', mark: done && !got,
      icon: Object.assign((x, y, sz) => got ? (pxBox(x - 18, y - 18, 36, 36, UI.green, 1), outlined('✓', x, y - 2, 22, '#fff')) : outlined(String(i + 1), x, y, 26, UI.soft), { raw: true }),
      info: `${q.info} · ${prog}`,
      tag: `${rewardText(q.reward)} · +${q.pts} очков`, tagColor: '#ffd166',
      btn: got ? { label: 'Получено', ok: false }
        : done ? { label: 'Забрать', ok: true, color: '#57e389', act: () => done(claimQuest(i)) }
        : { label: Math.floor(p / q.goal * 100) + '%', ok: false, why: q.info },
    };
  });
}

function drawQuests() {
  const r = sheetRect(), w = week(), pts = weekPoints(), max = WEEK_CHESTS[WEEK_CHESTS.length - 1].at;
  pxBox(r.x, r.y, r.w, r.h + 24, UI.panel, 0);
  const days = Math.ceil((w.id + 1) * 7 - 3 - (Date.now() / 60000 - new Date().getTimezoneOffset()) / 1440);
  pxRibbon('НЕДЕЛЬНЫЕ ЗАДАНИЯ', r.x + r.w / 2, r.y + 2, '#e8a33a', 16, r.w - 60);
  outlined(`Сброс через ${days} дн. · очки ${pts}/${max}`, r.x + r.w / 2, r.y + 34, 12, UI.soft, 'center', r.w - 24);

  // Шкала очков с кейсами: готовый кейс подпрыгивает, тап — забрать; забранный — темнее, с галочкой
  const bx = r.x + 30, bw = r.w - 60, by = r.y + 78;
  pxInset(bx, by - 7, bw, 15);
  ctx.fillStyle = UI.gold; ctx.fillRect(snap(bx + U), snap(by - 4), snap(Math.max(U, (bw - 2 * U) * Math.min(1, pts / max))), 9);
  WEEK_CHESTS.forEach((c, i) => {
    const x = bx + bw * c.at / max - (i === WEEK_CHESTS.length - 1 ? 14 : 0), got = w.chests.includes(i), ready = pts >= c.at && !got;
    const y = by - 4 - (ready ? 4 + Math.abs(Math.sin(performance.now() / 250)) * 4 : 0);
    const col = got ? shade(TIERS[c.tier].color, -0.45) : TIERS[c.tier].color;
    drawIcon(keyed('wchest' + col, (cx, cy, sz) => chestIcon(cx, cy, sz * 0.8, col, 1)), x, y, 40);
    if (got) { pxBox(x + 4, y - 22, 21, 21, UI.green, 1); outlined('✓', x + 14, y - 13, 13, '#fff'); }
    outlined(String(c.at), x, by + 28, 12, ready ? '#ffd166' : got ? '#8f87a0' : UI.soft, 'center');
    ui.push({ x: x - 20, y: by - 26, w: 40, h: 56, act: () => {
      const res = claimChest(i);
      if (res) done(res); else showToast(got ? 'Уже получено' : `${TIERS[c.tier].name} кейс: ${rewardText(c.reward)} — нужно ${c.at} очков`);
    } });
  });
  drawList(questItems(), { x: r.x, y: by + 46, w: r.w, h: r.y + r.h - 4 - by - 46 });
}

// ------------------------------------------------------------
//  Магазин: полки (звёзды, сундуки, пазлы, золото), сундуки глав и ключи,
//  звёзды за деньги, подписки. Покупки за деньги — тестовые
// ------------------------------------------------------------

const NO_STARS = 'Не хватает звёзд — их дают недельные задания';
const left = (key, limit) => Math.max(0, limit - dayUsed(key));
const done = res => { if (!res) return; if (gotLog.length) showReward(gotLog); else showToast('Получено: ' + res); };
// Кнопка покупки за звёзды/золото с дневным лимитом
function buyBtn(cost, key, limit, give) {
  const out = limit && !left(key, limit), ok = !out && canAfford(cost) && SAVE.stars >= (cost.stars || 0);
  return {
    label: out ? 'Завтра' : cost.stars ? cost.stars + ' ⭐' : costText(cost), ok,
    act: () => done(shopBuy(cost, key, limit, give)),
    why: out ? 'Лимит на сегодня исчерпан' : cost.stars ? NO_STARS : NO_GOLD,
  };
}
// «Бесплатно раз в день, потом N раз за рекламу или билет»
function freeThenAdBtn(key, ads, give) {
  if (!dayUsed(key + 'Free')) return { label: 'Бесплатно', ok: true, color: '#57e389', act: () => { dayUse(key + 'Free'); done(give()); } };
  if (left(key + 'Ad', ads)) return { label: SAVE.tickets ? '🎫 Билет' : '📺 Реклама', ok: true, color: '#c77dff', act: () => watchAd(() => { dayUse(key + 'Ad'); done(give()); }) };
  return { label: 'Завтра', ok: false, why: 'Лимит на сегодня исчерпан' };
}
const testBtn = (label, act) => ({ label: label + ' (тест)', ok: true, color: '#57e389', act });

function shopItemsTab() {
  const gem = (x, y, sz) => text('⭐', x, y, sz * 0.5, '#ffd166', 'center');
  const chest = id => keyed('chest' + id, (x, y, sz) => chestIcon(x, y, sz * 0.7, CHESTS[id].color, 1));
  const coin = (x, y, sz) => { ctx.fillStyle = '#c99a2e'; ctx.beginPath(); ctx.arc(x, y, sz * 0.28, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x - 1, y - 1, sz * 0.2, 0, TAU); ctx.fill(); };
  if (shopTab === 'shelves') {
    const F = SHOP.freeStars, W = SHOP.weaponChest;
    return [
      { header: 'Особая полка' },
      { name: `${F.stars} ⭐`, color: '#ffd166', icon: gem, info: 'Раз в день бесплатно, дальше за рекламу',
        tag: `Осталось сегодня: ${left('starsFree', 1) + left('starsAd', F.ads)}`, btn: freeThenAdBtn('stars', F.ads, () => grantReward({ stars: F.stars })) },
      { header: 'Предложения дня' },
      ...dailyOffers().map(o => o.chest ? {
        name: CHESTS[o.chest].name, color: CHESTS[o.chest].color, icon: chest(o.chest),
        info: `Золото и ${CHESTS[o.chest].reward.puzzles[o.chest]} пазлов: ${TIERS[o.chest].many}`,
        tag: `Осталось сегодня: ${left(o.key, SHOP.daily.buys)}`, btn: buyBtn(o.cost, o.key, SHOP.daily.buys, () => openChest(o.chest)),
      } : {
        name: `Пазлы: ${WEAPONS[o.weapon].name} ×${o.n}`, color: TIERS[WEAPONS[o.weapon].tier].color, icon: puzzleIcon(TIERS[WEAPONS[o.weapon].tier].color, weaponIcon(o.weapon)),
        info: `${TIERS[WEAPONS[o.weapon].tier].name} · 🧩 ${SAVE.puzzles[o.weapon] || 0}/${PUZZLES_PER_LEVEL} · ур. ${wLvl(o.weapon)}`,
        tag: `Осталось сегодня: ${left(o.key, SHOP.daily.buys)} · завтра другое оружие`,
        btn: buyBtn(o.cost, o.key, SHOP.daily.buys, () => { addPuzzles(o.weapon, o.n); return `🧩${o.n} → ${WEAPONS[o.weapon].name}`; }),
      }),
      { header: 'Сундук оружия' },
      { name: CHESTS.weapon.name, color: '#c77dff', icon: chest('weapon'), info: CHESTS.weapon.info, btn: buyBtn({ stars: W.stars }, 'weaponChest', 0, () => openChest('weapon')) },
      { name: CHESTS.weapon.name + ' за билет', color: '#c77dff', icon: chest('weapon'), info: 'Раз в день', tag: `Билетов: ${SAVE.tickets}`,
        btn: { label: left('weaponTicket', W.ticketDaily) ? '🎫 Билет' : 'Завтра', ok: SAVE.tickets > 0 && left('weaponTicket', W.ticketDaily) > 0,
          act: () => { if (SAVE.tickets < 1 || !left('weaponTicket', W.ticketDaily)) return; SAVE.tickets--; dayUse('weaponTicket'); done(openChest('weapon')); },
          why: left('weaponTicket', W.ticketDaily) ? 'Билеты дают подписки' : 'Лимит на сегодня исчерпан' } },
      { name: CHESTS.weapon.name + ' ×10', color: '#c77dff', icon: chest('weapon'), info: '10 сундуков разом',
        btn: buyBtn({ stars: W.stars10 }, 'weaponChest10', 0, () => { for (let i = 0; i < 10; i++) openChest('weapon'); return '10 сундуков оружия — пазлы разложены по оружию'; }) },
      { header: 'Золото' },
      ...SHOP.gold.map((P, i) => ({
        name: `${P.name}: ${rewardGold(P)} ●`, color: '#ffd166', icon: coin,
        info: P.stars ? 'За звёзды' : 'Раз в день бесплатно, дальше за рекламу',
        tag: P.stars ? '' : `Осталось сегодня: ${left('goldFree', 1) + left('goldAd', P.ads)}`,
        btn: P.stars ? buyBtn({ stars: P.stars }, 'gold' + i, 0, () => grantReward({ gold: P.gold })) : freeThenAdBtn('gold', P.ads, () => grantReward({ gold: P.gold })),
      })),
    ];
  }
  if (shopTab === 'chests') {
    const offers = chapterOffers();
    return [
      { header: 'Сундук главы' },
      ...(offers.length ? offers.slice(0, 3).map(k => {
        const o = SHOP.chapterOffer(k);
        return {
          name: `Сундук главы ${k * SHOP.chapterEvery}`, color: '#ffd166', icon: chest('red'),
          info: `${o.stars} ⭐  ${rewardGold(o)} ●  ${KB}${o.keys.blue} синих  ${KR}${o.keys.red} красный`, tag: 'Разовое предложение', tagColor: '#ffd166',
          btn: testBtn(o.usd + ' $', () => done(buyChapter(k))),
        };
      }) : [{ name: 'Пока нет предложений', color: '#9a9eae', info: `Каждые ${SHOP.chapterEvery} пройденных глав — новый сундук главы` }]),
      { header: 'Ключи дня' },
      ...[['blue', 'Синий ключ', '#4cc9f0'], ['red', 'Красный ключ', '#ff5d73']].map(([k, name, color]) => ({
        name, color, icon: keyIcon(color),
        info: `Открывает ${k === 'blue' ? 'кейс бустов' : 'особый красный сундук'}`,
        tag: `Сегодня осталось: ${left(k + 'KeyFree', 1) + left(k + 'KeyAd', KEY_ADS)} · 1 бесплатно + ${KEY_ADS} за рекламу`,
        btn: freeThenAdBtn(k + 'Key', KEY_ADS, () => giveKey(k)),
      })),
      { header: 'Сундуки за ключи' },
      ...['boost', 'red'].map(id => {
        const C = CHESTS[id], k = C.key, n = SAVE.keys[k], opens = SAVE.chestOpens[id] || 0;
        const gem = id === 'red' && SAVE.gems.red ? ` · 💎 ${SAVE.gems.red} ждут красное оружие` : '';
        return {
          name: C.name, color: C.color, icon: chest(id), info: C.info,
          tag: `${keyChar(k)} ${n} · до гема ${opens % GEM_EVERY}/${GEM_EVERY}` + gem, tagColor: C.color,
          btn: { label: keyChar(k) + ' Открыть', ok: n > 0, color: C.color, act: () => done(openWithKey(id)), why: 'Ключи дня — выше: 1 бесплатно и 1 за рекламу' },
        };
      }),
    ];
  }
  if (shopTab === 'stars') {
    return [{ header: 'Звёзды' }, ...SHOP.starPacks.map(P => ({
      name: `${P.stars} ⭐`, color: '#ffd166', icon: gem, info: 'Пакет звёзд',
      btn: testBtn(P.usd + ' $', () => done(grantReward({ stars: P.stars }))),
    }))];
  }
  return subItems();
}

// Подписки: у каждой — карточка бонусов (купить / активна) и карточка награды дня; внизу «Неделя подписчика»
function subItems() {
  const crown = color => keyed('crown' + color, (x, y, s) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    [[-0.3, 0.18], [-0.3, -0.12], [-0.15, 0.02], [0, -0.22], [0.15, 0.02], [0.3, -0.12], [0.3, 0.18]].forEach(([a, b]) => ctx.lineTo(x + a * s, y + b * s));
    ctx.fill();
  });;
  const what = r => [r.stars && r.stars + ' ⭐', r.keys?.blue && KB + r.keys.blue, r.keys?.red && KR + r.keys.red, r.gold && 'золото', r.gems && '💎 гем бустов'].filter(Boolean).join(' + ');
  const items = [];
  SHOP.subs.forEach((P, i) => {
    const on = subOn(i), until = SAVE.subs[i];
    const perks = [`⏩ ×${P.speed}`, `🔄 +${P.rerolls}`, `⚡ ${P.raids} рейд${P.raids > 1 ? 'а' : ''}`, `🎫 ${P.tickets}`, ...(P.goldMul ? [`+${Math.round(P.goldMul * 100 - 100)}% ●`] : []), ...(P.revive ? ['❤ воскрешение'] : [])];
    items.push({ header: `${P.name} · ${P.days ? P.eur + ' € на месяц' : P.eur + ' € навсегда'}` });
    items.push({
      name: perks.join('  '), color: P.color, mark: on, icon: crown(P.color),
      info: 'Скорость боя · «Новый набор» · рейдов в день · билетов в день',
      tag: on ? (until === 'forever' ? 'Активна навсегда' : 'Активна до ' + new Date(until).toLocaleDateString('ru-RU')) : 'Сразу: ' + what(P.now),
      tagColor: on ? '#57e389' : P.color,
      btn: on && !P.days ? { label: 'Активна', ok: false } : testBtn(on ? 'Продлить' : P.eur + ' €', () => done(activateSub(i))),
    });
    const got = dayUsed('sub' + i);
    items.push({
      name: 'Каждый день: ' + what(P.daily), color: P.color, icon: keyed('subchest' + i + on, (x, y, s) => chestIcon(x, y, s * 0.7, P.color, on ? 1 : 0.4)),
      info: on ? (got ? 'Получено сегодня — завтра снова' : 'Забери награду дня') : 'Откроется с подпиской',
      btn: !on ? { label: 'Закрыто', ok: false, why: 'Награда дня — для подписчиков' }
        : got ? { label: 'Завтра', ok: false, why: 'Уже получено сегодня' }
        : { label: 'Забрать', ok: true, color: '#57e389', act: () => done(claimSubDaily(i)) },
    });
  });
  const n = subsOn().length, day = SAVE.subWeek % 7, R = SHOP.subWeek[day], got = dayUsed('subWeek');
  items.push({ header: 'Неделя подписчика' });
  items.push({
    name: `День ${day + 1}/7: ${what(R)}${n >= 2 ? ' ×2' : ''}`, color: '#c77dff', icon: keyed('day' + day, (x, y, s) => text(String(day + 1), x, y, s * 0.4, '#c77dff', 'center')),
    info: 'Каждый день с подпиской — награда. 7-й день — гем бустов',
    tag: 'С двумя подписками и больше — награды вдвое', tagColor: '#c77dff',
    btn: !n ? { label: 'Закрыто', ok: false, why: 'Нужна любая подписка' }
      : got ? { label: 'Завтра', ok: false, why: 'Уже получено сегодня' }
      : { label: 'Забрать', ok: true, color: '#57e389', act: () => done(claimSubWeek()) },
  });
  return items;
}

// Гардероб: прокачка аккаунта, герои, одежда
function statItems() {
  const next = Object.keys(ACCOUNT_REWARDS).map(Number).find(k => k > SAVE.acct);
  const pip = curEvo().pip;
  return [{
    name: `Уровень аккаунта ${SAVE.acct}`, color: '#ffd166', icon: starIcon('#ffd166'),
    info: 'Прокачай все 4 характеристики по 5 раз — новый уровень',
    tag: next ? `Ур. ${next}: ${ACCOUNT_REWARDS[next]}` : 'Все награды получены', tagColor: '#ffd166',
  }, ...Object.entries(STATS).map(([id, st]) => {
    const p = SAVE.pips[id], c = statCost(id);
    return {
      name: st.name, color: st.color, icon: STAT_ICONS[id](st.color), info: st.info(statPct(id)),
      tag: '■'.repeat(p) + '□'.repeat(ECON.statSteps - p) + ` · +${pip}% за шаг`, tagColor: st.color,
      btn: c ? { label: costText(c), ok: canAfford(c), act: () => upgradeStat(id), why: NO_GOLD }
        : { label: 'ГОТОВО', ok: false, why: 'Прокачай остальные характеристики, чтобы получить уровень' },
    };
  })];
}

function heroItems() {
  const id0 = SAVE.hero, l0 = heroLvl(id0), gems = SAVE.heroGems[id0] || 0;
  const evo = {
    name: `Эволюция: ${HEROES[id0].name} ${l0}/${HERO_EVO.length}`, color: '#c77dff', icon: medalIcon('#c77dff', true),
    info: l0 < HERO_EVO.length ? 'Дальше: ' + HERO_EVO[l0] : 'Максимальная эволюция',
    tag: `Гемов: ${gems} · гемы героев дают только ивенты`, tagColor: '#c77dff',
    btn: { label: 'Гем', ok: gems > 0 && l0 < HERO_EVO.length, act: () => evolveHero(id0), why: 'Гемы героев выпадают только на ивентах' },
  };
  return [evo, ...Object.entries(HEROES).sort((a, b) => a[1].rarity - b[1].rarity).map(([id, H]) => {
    const l = heroLvl(id), on = SAVE.hero === id, ev = heroEvo(Math.max(1, l)), R = RARITY[H.rarity];
    return {
      id: 'h' + id, tile: true, name: H.name, color: R.color, icon: heroIcon(id, SAVE.outfit), mark: on, dim: !l,
      badge: on ? 'В бою' : l ? H.title : H.stars + ' ⭐',
      info: `${H.title[0].toUpperCase() + H.title.slice(1)}. Активка «${H.active}»: ${H.activeInfo}`,
      tag: `${R.name} · ${H.race} · ${WEAPONS[H.weapon].name} +${ev.passive}%` + (l ? ` · эвол. ${l}/${HERO_EVO.length}` : ''),
      tagColor: R.color,
      btn: on ? { label: 'В бою', ok: false }
        : l ? { label: 'Взять в бой', ok: true, color: UI.green, act: () => buyOrPickHero(id) }
        : { label: H.stars + ' ⭐', ok: SAVE.stars >= H.stars, act: () => buyOrPickHero(id), why: 'Не хватает звёзд — магазин (каждый день бесплатно) и недельные задания' },
    };
  })];
}

function shopItems(kind) {
  const sh = SHOPS[kind];
  return Object.entries(sh.data).map(([id, d]) => {
    const own = owns(kind, id), on = SAVE[sh.on] === id;
    const icon = kind === 'outfit' ? (d.cat ? Object.assign((x, y, s) => { heroIcon(SAVE.hero, id)(x - s * 0.1, y, s); drawCat(x + s * 0.27, y + s * 0.42, -1, 0, Math.max(1, Math.round(s / 30))); }, { raw: true }) : heroIcon(SAVE.hero, id))
      : Object.assign((x, y, s) => drawPetSprite(id, x, y, s / 16), { raw: true });
    return {
      name: d.name, color: '#ffd166', icon, mark: on,
      info: d.info || 'Головной убор',
      tag: on ? (kind === 'pet' ? 'С тобой' : 'Надето') : own ? 'Куплено' : '',
      tagColor: on ? '#ffd166' : '#57e389',
      btn: on ? { label: kind === 'pet' ? 'С тобой' : 'Надето', ok: false }
        : own ? { label: kind === 'pet' ? 'Взять' : 'Надеть', ok: true, color: '#57e389', act: () => buyOrEquip(kind, id) }
        : { label: d.price + ' ●', ok: SAVE.gold >= d.price, act: () => buyOrEquip(kind, id), why: NO_GOLD },
    };
  });
}

function settingsItems() {
  const opt = (key, name, info, color) => ({
    name, info, color, toggle: S[key],
    act: () => { S[key] = !S[key]; saveSettings(); },
  });
  const asking = performance.now() - resetAsk < 3000;
  return [
    // Значок «文A» понятен на любом языке; флаг текущего языка — на кнопке выпадашки
    { name: 'Язык игры', info: 'После смены игра перезапустится', color: '#7df9ff', icon: translateIcon,
      btn: { label: LANGS[LANG] + ' ▾', flag: LANG, ok: true, color: UI.base, act: () => { langMenu = !langMenu; }, anchor: r => { langAnchor = r; } } },
    opt('shake', 'Тряска экрана', 'Камера дрожит при ударе', '#4cc9f0'),
    opt('dmgText', 'Цифры урона', 'Урон над врагами', '#ffd166'),
    opt('dmgPanel', 'Окно урона в бою', 'Сколько урона наносит каждое оружие', '#ff9f1c'),
    opt('music', 'Музыка', 'Звука в игре пока нет — настройка на будущее', '#57e389'),
    opt('sfx', 'Звуковые эффекты', 'Звука в игре пока нет — настройка на будущее', '#57e389'),
    opt('vibrate', 'Вибрация', 'При получении урона (Android)', '#c77dff'),
    {
      name: 'Сбросить прогресс', info: 'Золото, главы и покупки', color: '#ff5d73',
      btn: {
        label: asking ? 'Точно?' : 'Сбросить', ok: true, color: '#ff5d73',
        act: () => {
          if (!asking) { resetAsk = performance.now(); return; }
          resetAsk = 0; SAVE = defaultSave(); save(); goHub(); showToast('Прогресс сброшен');
        },
      },
    },
  ];
}

// ------------------------------------------------------------
//  Меню целиком
// ------------------------------------------------------------

const SHEETS = {
  weapon: ['ОРУЖИЕ', () => weaponItems(), 'Тап — взять в бой · 10 🧩 = +1 уровень'],
  wardrobe: ['ГАРДЕРОБ', () => (wardTab === 'stats' ? statItems() : wardTab === 'heroes' ? heroItems() : shopItems('outfit')), null,
    { tabs: [['stats', 'Прокачка'], ['heroes', 'Герои'], ['outfit', 'Одежда']], get on() { return wardTab; }, set: id => { wardTab = id; } }],
  shop: ['МАГАЗИН', () => shopItemsTab(), () => `🎫 Билеты: ${SAVE.tickets} · ${KB} ${SAVE.keys.blue} · ${KR} ${SAVE.keys.red}`,
    { tabs: [['shelves', 'Полки'], ['chests', 'Сундуки'], ['stars', 'Звёзды'], ['sub', 'Подписка']], get on() { return shopTab; }, set: id => { shopTab = id; } }],
  boost: ['БУСТЫ', () => boostItems(), () => SAVE.gems.boost > 0 ? `💎 Гемов: ${SAVE.gems.boost} — выбери буст, получит +1 уровень` : 'Пазлы бустов — в кейсе бустов за синий ключ'],
  pet: ['ПИТОМЕЦ', () => shopItems('pet')],
  catacombs: ['КАТАКОМБЫ', () => catacombItems(), 'Спустись в подземелье — испытания с наградами'],
  settings: ['НАСТРОЙКИ', () => settingsItems()],
};

function drawMenu() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Пока герой выбегает из убежища, интерфейс тает и не нажимается
  const alpha = launch ? clamp(1 - launch.t / 0.25, 0, 1) : 1;
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  if (screen === 'campaign') drawCampaignTab();
  else if (screen === 'quests') drawQuests();
  else { const [title, items, note, segs] = SHEETS[screen]; drawSheet(title, items(), typeof note === 'function' ? note() : note, segs); }
  drawTabBar();
  drawMenuTop();
  ctx.globalAlpha = 1;
  if (launch) ui = [];
  drawDetail();
  drawLangMenu();
  drawReward();
}

// ------------------------------------------------------------
//  Окно «Получено!»: праздник за покупку, сундук, задание.
//  Лента вылетает, карточки по очереди выпрыгивают с искрами, числа набегают
// ------------------------------------------------------------

let reward = null; // { items, t0, out, last, sparks }
function showReward(items) {
  reward = { items: items.map(it => ({ ...it })), t0: performance.now(), out: 0, last: performance.now(), sparks: [] };
}
const backOut = k => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
const easeOut = k => 1 - (1 - k) ** 3;

function coinIcon(x, y, s) {
  ctx.fillStyle = '#c99a2e'; ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x - s * 0.02, y - s * 0.02, s * 0.22, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x - s * 0.09, y - s * 0.09, s * 0.06, 0, TAU); ctx.fill();
}
function keyIcon(color) {
  return keyed('key' + color, (x, y, s) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.09;
    ctx.beginPath(); ctx.arc(x - s * 0.16, y, s * 0.13, 0, TAU); ctx.stroke();
    ctx.fillRect(x - s * 0.03, y - s * 0.045, s * 0.36, s * 0.09);
    ctx.fillRect(x + s * 0.2, y, s * 0.07, s * 0.14);
  });
}
// Как выглядит карточка награды: цвет, иконка, подпись и число
function rewardView(it) {
  const K = { blue: ['#4cc9f0', 'Синий ключ'], red: ['#ff5d73', 'Красный ключ'] };
  switch (it.kind) {
    case 'gold': return { color: '#ffd166', icon: coinIcon, name: 'Золото', count: true };
    case 'stars': return { color: '#ffd166', icon: starIcon('#ffd166'), name: 'Звёзды', count: true };
    case 'puzzle': { const c = TIERS[WEAPONS[it.id].tier].color; return { color: c, icon: puzzleIcon(c, weaponIcon(it.id)), name: 'Пазлы: ' + WEAPONS[it.id].name, count: true }; }
    case 'tierPuzzle': return { color: TIERS[it.id].color, icon: puzzleIcon(TIERS[it.id].color), name: 'Джокер: ' + TIERS[it.id].many, count: true };
    case 'jokerGem': return { color: TIERS[it.id].color, icon: jokerGemIcon(TIERS[it.id].color), name: 'Гем-джокер: ' + TIERS[it.id].many, count: true };
    case 'boostPuzzle': return { color: MEDALS[it.id].color, icon: puzzleIcon(MEDALS[it.id].color, medalIcon(MEDALS[it.id].color, MEDALS[it.id].rare)), name: 'Пазл: ' + MEDALS[it.id].name, count: true };
    case 'gem': return { color: '#7df9ff', icon: keyed('gemicon', (x, y, s) => { ctx.fillStyle = '#7df9ff'; polygon(x, y, s * 0.3, 4, 0); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; polygon(x - s * 0.06, y - s * 0.06, s * 0.1, 4, 0); ctx.fill(); }), name: it.id === 'boost' ? 'Гем: +1 ур. бусту' : 'Гем: красное оружие', count: true };
    case 'key': return { color: K[it.id][0], icon: keyIcon(K[it.id][0]), name: K[it.id][1], count: true };
  }
}

function drawReward() {
  if (!reward) return;
  const now = performance.now(), t = (now - reward.t0) / 1000, dt = Math.min(0.05, (now - reward.last) / 1000);
  reward.last = now;
  const out = reward.out ? clamp((now - reward.out) / 180, 0, 1) : 0;
  if (out >= 1) { reward = null; return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ui = []; // под окном ничего не нажимается
  const items = reward.items, n = items.length;
  const cols = Math.min(n, W < 360 ? 3 : 4), rows = Math.ceil(n / cols);
  const tile = 76, gapX = 14, cellH = tile + 34, bandH = rows * cellH + 44, cy = H * 0.46;
  const bandY = cy - bandH / 2, fade = clamp(t / 0.2, 0, 1) * (1 - out);

  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(5,6,10,${0.82 * fade})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1 - out;

  // Лучи за полосой — медленно крутятся
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.rotate(t * 0.3);
  const R = Math.max(W, H) * 0.7, g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, `rgba(255,209,102,${0.22 * fade})`); g.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = g;
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a, a + TAU / 36); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Полоса раскрывается из центра
  const open = backOut(clamp((t - 0.05) / 0.3, 0, 1)), bh = bandH * open;
  ctx.fillStyle = UI.panel;
  ctx.fillRect(0, cy - bh / 2, W, bh);
  for (const ey of [cy - bh / 2 - 2 * U, cy + bh / 2]) { ctx.fillStyle = OUTLINE; ctx.fillRect(0, ey, W, 2 * U); ctx.fillStyle = UI.gold; ctx.fillRect(0, ey + (ey < cy ? U : 0), W, U); }

  // Лента с заголовком вылетает поверх полосы
  const rk = backOut(clamp((t - 0.15) / 0.35, 0, 1));
  if (rk > 0) {
    ctx.save(); ctx.translate(W / 2, bandY); ctx.scale(rk, rk);
    pxRibbon('ПОЛУЧЕНО!', 0, 0, UI.gold, 24);
    ctx.restore();
  }

  // Карточки выпрыгивают по очереди
  const gridW = cols * tile + (cols - 1) * gapX, gx = (W - gridW) / 2, gy = bandY + 34;
  items.forEach((it, i) => {
    const ti = t - 0.35 - i * 0.09;
    if (ti <= 0) return;
    const v = rewardView(it), row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
    const x = (W - (inRow * tile + (inRow - 1) * gapX)) / 2 + (i % cols) * (tile + gapX) + tile / 2, y = gy + row * cellH + tile / 2;
    if (!it.burst) {
      it.burst = true;
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * TAU, sp = 90 + Math.random() * 160;
        reward.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.6 + Math.random() * 0.4, t: 0, color: Math.random() < 0.5 ? v.color : '#fff', s: 2 + Math.random() * 2.5 });
      }
    }
    const s = backOut(clamp(ti / 0.35, 0, 1));
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    // свечение за карточкой
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, tile);
    glow.addColorStop(0, v.color + '55'); glow.addColorStop(1, v.color + '00');
    ctx.fillStyle = glow; ctx.fillRect(-tile, -tile, tile * 2, tile * 2);
    pxBox(-tile / 2, -tile / 2, tile, tile, shade(v.color, -0.35));
    drawIcon(v.icon, 0, -6, 44);
    const label = v.count ? '×' + Math.round(it.n * easeOut(clamp(ti / 0.6, 0, 1))) : v.badge;
    outlined(label, 0, tile / 2 - 16, 15, '#fff', 'center', tile - 8);
    ctx.restore();
    if (s > 0.8) outlined(v.name, x, y + tile / 2 + 14, 12, UI.soft, 'center', tile + gapX);
  });

  // Искры
  for (const p of reward.sparks) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.98;
    const a = 1 - p.t / p.life;
    if (a <= 0) continue;
    ctx.globalAlpha = a * (1 - out);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  reward.sparks = reward.sparks.filter(p => p.t < p.life);
  ctx.globalAlpha = 1 - out;

  const ready = 0.35 + n * 0.09 + 0.4;
  if (t > ready) {
    ctx.globalAlpha = (1 - out) * clamp((t - ready) / 0.3, 0, 1) * (0.6 + 0.4 * Math.sin(t * 4));
    text('Нажми, чтобы продолжить', W / 2, bandY + bandH + 34, 14, '#fff', 'center', false);
  }
  ctx.globalAlpha = 1;
  ui.push({ x: 0, y: 0, w: W, h: H, act: () => { if (t > 0.5 && !reward.out) reward.out = performance.now(); } });
}

// ------------------------------------------------------------
//  Окна поверх забега
// ------------------------------------------------------------

function centerText(lines, cy = H / 2, step = 32, cx = W / 2, maxW = W - 32) {
  let y = cy - (lines.length - 1) * step / 2;
  for (const [s, size, color] of lines) {
    if (s) outlined(s, cx, y, size >= 24 ? size + 4 : size, color, 'center', maxW, size >= 24); // заголовок итогов — пиксельный
    y += step;
  }
}


function drawLevelUp() {
  ui = []; // кнопки HUD под затемнением неактивны
  dim();
  const weapon = G.state === 'weaponpick', portrait = W < H * 1.1;
  const n = G.choices.length, gap = 12, bh = 46;
  let cw, ch;
  if (portrait) { cw = Math.min(W - 32, 420); ch = 84; }
  else { cw = Math.min(220, (W - 64 - gap * (n - 1)) / n); ch = 140; }
  const totalW = portrait ? cw : n * cw + (n - 1) * gap;
  const totalH = (portrait ? n * ch + (n - 1) * gap : ch) + 16 + bh;
  const x0 = (W - totalW) / 2, y0 = Math.max(70 + SAFE_T, (H - totalH) / 2 + 10);

  headline(weapon ? 'НОВОЕ ОРУЖИЕ' : 'НОВЫЙ УРОВЕНЬ', W / 2, y0 - 30, 28, weapon ? '#7df9ff' : '#ffd166');

  const ready = tapReady();
  G.cardRects = G.choices.map((c, i) => {
    const r = portrait ? { x: x0, y: y0 + i * (ch + gap), w: cw, h: ch } : { x: x0 + i * (cw + gap), y: y0, w: cw, h: ch };
    const v = choiceView(c);
    ctx.globalAlpha = ready ? 1 : 0.5;
    // Карточка выбора — плашка в цвет оружия
    pxBox(r.x, r.y, r.w, r.h, shade(v.color, -0.45));
    pxInset(r.x + 10, r.y + 9, 45, 45);
    if (v.icon) drawIcon(weaponIcon(v.icon), r.x + 32, r.y + 31, 40);
    else { ctx.fillStyle = v.color; ctx.fillRect(snap(r.x + 21), snap(r.y + 21), 21, 21); }
    outlined(v.name, r.x + 64, r.y + 30, 17, '#fff', 'left', r.w - 64 - 50);
    outlined(v.tag, r.x + r.w - 14, r.y + 30, 13, v.color, 'right');
    text(v.info, r.x + 14, r.y + (portrait ? 66 : 80), 13, '#fff', 'left', false, r.w - 28);
    if (!portrait) text('клавиша ' + (i + 1), r.x + 14, r.y + r.h - 16, 11, UI.soft, 'left', false);
    ctx.globalAlpha = 1;
    return r;
  });

  // Кнопки под карточками. «Новый набор» первый раз за бой бесплатно
  const k = weapon ? 'weapon' : 'up', free = G.rerolls[k] < freeRerolls();
  const by = y0 + (portrait ? n * ch + (n - 1) * gap : ch) + 16;
  const bw = Math.min(200, (Math.min(W - 32, 420) - 10) / 2), bx = (W - bw * 2 - 10) / 2;
  const AD = { color: UI.purple };
  const reroll = weapon
    ? { label: 'Новый набор', act: () => (free ? rerollChoices(true) : showToast('Бесплатный набор уже был — смотри рекламу')),
        ...(free ? {} : { dim: true }) }
    : free ? { label: 'Новый набор', act: () => rerollChoices(true) }
    : { label: '📺 Новый набор', ...AD, act: () => watchAd(() => rerollChoices(false)) };
  const second = weapon
    ? { label: '📺 Новый набор', ...AD, act: () => watchAd(() => rerollChoices(false)) }
    : { label: '📺 Взять все', ...AD, act: () => watchAd(pickAll) };
  drawButton({ x: bx, y: by, w: bw, h: bh }, reroll);
  drawButton({ x: bx + bw + 10, y: by, w: bw, h: bh }, second);
  if (!ready) ui = [];
}

// Переключатель-тумблер (как в настройках убежища)
function drawSwitch(x, y, on) {
  pxBox(x, y - 1, 48, 27, on ? UI.green : UI.off, 1);
  pxBox(on ? x + 24 : x + 3, y + 2, 21, 18, '#fff', 1);
}

// Пауза = настройки боя: звук, цифры урона, окно урона; закрыть или выйти из боя
const PAUSE_OPTS = [['music', 'Музыка'], ['sfx', 'Звуковые эффекты'], ['dmgText', 'Цифры урона'], ['dmgPanel', 'Окно урона в бою']];
function drawPause() {
  ui = []; // кнопки HUD под затемнением неактивны
  dim();
  const w = Math.min(W - 32, 360), x = (W - w) / 2, rh = 44, bh = 46, gap = 8;
  const total = 44 + PAUSE_OPTS.length * (rh + gap) + 8 + 2 * (bh + gap) + 16;
  let y = Math.max(12 + SAFE_T, (H - total) / 2);
  headline('ПАУЗА', W / 2, y + 16, 30, '#ffd166');
  y += 44;
  for (const [key, name] of PAUSE_OPTS) {
    const r = { x, y, w, h: rh };
    pxBox(r.x, r.y, r.w, r.h, UI.base, 1);
    outlined(name, x + 14, y + rh / 2 - 1, 15, '#fff', 'left', w - 90);
    drawSwitch(x + w - 14 - 46, y + (rh - 26) / 2, S[key]);
    ui.push({ ...r, act: () => { S[key] = !S[key]; saveSettings(); } });
    y += rh + gap;
  }
  buttonColumn(y + 8, [{ label: 'Закрыть', ...PRIMARY, act: () => setState('play') }, { label: 'Выйти из боя', act: () => finishRun('quit') }], bh, gap);
  const note = G.mode === 'camp' ? 'Награды за пройденные вехи останутся' : 'Половина собранного золота потеряется';
  outlined(note, W / 2, y + 8 + 2 * (bh + gap) + 6, 12, UI.soft, 'center', w);
}

function drawResult() {
  ui = [];
  dim(0.9);
  const R = G.result, n = R.level;
  const lines = [];
  let buttons;
  if (R.mode === 'camp') {
    if (R.outcome === 'win') {
      lines.push([`ГЛАВА ${n} ПРОЙДЕНА!`, 28, '#57e389']);
      lines.push([(R.diff ? DIFFS[R.diff].name + ' · ' : '') + (R.first ? 'Первое прохождение' : 'Повторное прохождение'), 14, R.diff ? DIFFS[R.diff].color : '#c8cbd6']);
      lines.push(['Кейс за босса: ' + costText(R.boss), 16, '#fff']);
      if (R.puzzles) lines.push([R.puzzles, 13, '#c77dff']);
      if (R.nextDiff) lines.push([`Открыта сложность «${DIFFS[R.nextDiff].name}»`, 15, DIFFS[R.nextDiff].color]);
      if (R.keys) lines.push([`${KB} Синий ключ ×${R.keys} — открой кейс бустов в магазине`, 15, '#4cc9f0']);
      if (R.opened && R.opened.length) lines.push(['Открыто в убежище: ' + R.opened.map(id => CATEGORIES[id].name).join(', '), 16, '#57e389']);
    } else {
      lines.push([R.outcome === 'dead' ? 'ТЫ ПОГИБ' : 'ЗАБЕГ ПРЕРВАН', 30, '#ff5d73']);
      lines.push([`Прогресс: ${Math.floor(R.progress * 100)}%  ·  убито ${R.kills}`, 15, '#fff']);
    }
    lines.push(['Всего за забег: ' + (R.gold || R.shards ? costText({ gold: R.gold, shards: R.shards }) : '0 ●'), 17, '#ffd166']);
    buttons = R.outcome === 'win' && n < CAMPAIGN_LEVELS
      ? [{ label: `Глава ${n + 1}`, ...PRIMARY, act: () => startCampaign(n + 1) }, { label: 'Ещё раз', act: () => startCampaign(n, R.diff) },
        ...(R.nextDiff ? [{ label: `Глава ${n}: ${DIFFS[R.nextDiff].name}`, act: () => startCampaign(n, R.nextDiff) }] : [])]
      : [{ label: R.outcome === 'win' ? 'Ещё раз' : 'Попробовать снова', ...PRIMARY, act: () => startCampaign(n, R.diff) }];
  } else {
    lines.push(R.outcome === 'escape' ? ['ТЫ ВЫБРАЛСЯ!', 30, '#ffd166'] : [R.outcome === 'dead' ? 'ТЫ ПОГИБ' : 'ЗАБЕГ ПРЕРВАН', 30, '#ff5d73']);
    lines.push([`Время ${fmtTime(R.time)}  ·  убито ${R.kills}` + (R.record ? '  ·  РЕКОРД!' : ''), 15, '#fff']);
    if (R.lost) lines.push([`Собрано ${R.coins} ●, половина потеряна`, 14, '#ff5d73']);
    lines.push(['Золото: +' + R.gold + ' ●', 18, '#ffd166']);
    buttons = [{ label: 'Ещё забег', ...PRIMARY, act: startEndless }];
  }
  buttons.push({ label: 'В убежище', act: goHub });
  R.primary = buttons[0].act;
  // Урон по оружию за бой: в альбомной — колонкой справа, в портретной — под кнопками
  const land = W > H, rows = R.dmg.filter(r => r.v > 0), sum = rows.reduce((a, r) => a + r.v, 0) || 1;
  const tw = Math.min(260, land ? W * 0.32 : W - 48), th = rows.length ? 26 + rows.length * 24 : 0;
  const bh = land ? 42 : 46, gap = 8, step = land ? 28 : 30;
  const blockH = lines.length * step + 16 + buttons.length * (bh + gap);
  const cx = land && rows.length ? W * 0.36 : W / 2, mw = land && rows.length ? W * 0.6 : W - 32;
  const y0 = Math.max(16 + SAFE_T, (H - blockH - (land ? 0 : th + 12)) / 2);
  centerText(lines, y0 + (lines.length - 1) * step / 2, step, cx, mw);
  buttonColumn(y0 + lines.length * step + 8, buttons, bh, gap, cx, mw);
  if (!rows.length) return;
  const tx = land ? W * 0.68 : (W - tw) / 2, ty = land ? Math.max(16, (H - th) / 2) : y0 + blockH + 12;
  pxBox(tx - 10, ty - 6, tw + 20, th + 8, UI.panel, 0);
  outlined('Урон по оружию', tx, ty + 9, 13, UI.soft, 'left');
  drawDmgTable(tx, ty + 24, tw, rows, r => `${fmtNum(r.v)} · ${Math.round(r.v / sum * 100)}% · ${fmtNum(r.v / Math.max(1, R.time))}/с`, 24);
}
