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
function showToast(text) { toast = { text, until: performance.now() + 1800 }; }

// Ищем с конца: что нарисовано позже, то и сверху
function hitUi(x, y) {
  for (let i = ui.length - 1; i >= 0; i--) {
    const r = ui[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
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
  setScreen('campaign');
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
  if (screen === 'campaign') launchRun(() => startCampaign(selLevel, selDiff));
  else if (screen === 'endless') launchRun(startEndless);
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
  ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxW) ctx.fillText(s, x, y, maxW); else ctx.fillText(s, x, y);
}

// o: { label, fill, textColor, border, act }
function drawButton(r, o) {
  ctx.fillStyle = o.fill || '#1b1d26';
  roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
  ctx.strokeStyle = o.border || '#2c3040'; ctx.lineWidth = 2; ctx.stroke();
  text(o.label, r.x + r.w / 2, r.y + r.h / 2, 17, o.textColor || '#fff', 'center', true, r.w - 16);
  ui.push({ ...r, act: o.act });
}

// Столбик кнопок по центру экрана, начиная с y
function buttonColumn(y, list, bh = 48, gap = 10, cx = W / 2, maxW = W - 32) {
  const bw = Math.min(maxW, 340), x = cx - bw / 2;
  list.forEach((o, i) => drawButton({ x, y: y + i * (bh + gap), w: bw, h: bh }, o));
}
const PRIMARY = { fill: '#ffd166', border: '#ffd166', textColor: '#14141c' };

function drawToast() {
  if (!toast || performance.now() > toast.until) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.font = 'bold 14px system-ui, sans-serif';
  const w = Math.min(W - 32, ctx.measureText(toast.text).width + 32), x = (W - w) / 2;
  const y = G.state === 'menu' ? H - tabBarH() - 56 : H - 76;
  ctx.fillStyle = 'rgba(27,29,38,0.96)';
  roundRect(x, y, w, 40, 20); ctx.fill();
  ctx.strokeStyle = '#ff5d73'; ctx.lineWidth = 1.5; ctx.stroke();
  text(toast.text, W / 2, y + 20, 14, '#fff', 'center', true, w - 24);
}

// ------------------------------------------------------------
//  Иконки
// ------------------------------------------------------------

function medalIcon(color, rare) {
  return (x, y, s) => {
    // лента сверху и медаль на ней
    ctx.fillStyle = '#5a6ab0';
    ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.42); ctx.lineTo(x - s * 0.1, y - s * 0.42); ctx.lineTo(x + s * 0.06, y - s * 0.05); ctx.lineTo(x - s * 0.12, y - s * 0.05); ctx.fill();
    ctx.fillStyle = '#4a5a9a';
    ctx.beginPath(); ctx.moveTo(x + s * 0.3, y - s * 0.42); ctx.lineTo(x + s * 0.1, y - s * 0.42); ctx.lineTo(x - s * 0.06, y - s * 0.05); ctx.lineTo(x + s * 0.12, y - s * 0.05); ctx.fill();
    ctx.fillStyle = rare ? '#c77dff' : '#8a8f99';
    ctx.beginPath(); ctx.arc(x, y + s * 0.12, s * 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y + s * 0.12, s * 0.2, 0, TAU); ctx.fill();
  };
}

function weaponIcon(id) {
  const c = WEAPONS[id].color;
  return (x, y, s) => {
    ctx.fillStyle = c; ctx.strokeStyle = c;
    if (id === 'wand') {
      ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.moveTo(x - s * 0.3, y + s * 0.3); ctx.lineTo(x + s * 0.15, y - s * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + s * 0.2, y - s * 0.2, s * 0.13, 0, TAU); ctx.fill();
    } else if (id === 'orbit') {
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(x + Math.cos(i * 2.1) * s * 0.25, y + Math.sin(i * 2.1) * s * 0.25); ctx.rotate(i * 2.1 + 1.57);
        ctx.fillRect(-s * 0.15, -s * 0.04, s * 0.3, s * 0.08); ctx.restore();
      }
    } else if (id === 'aura') {
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(x, y, s * 0.38, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.stroke();
    } else {
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 0.785) * s * 0.3, y + Math.sin(i * 0.785) * s * 0.3, s * 0.06, 0, TAU); ctx.fill(); }
    }
  };
}

const heroIcon = (hero, outfit) => (x, y, s) => drawHeroSprite(x, y + s * 0.05, s / 16, 1, 0, hero, outfit);

function starIcon(color) {
  return (x, y, s) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.16 : s * 0.38, a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
  };
}

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
  shop:     { name: 'Магазин',  icon: () => (x, y, s) => chestIcon(x, y, s * 0.62, '#ffd166', 1) },
  boost:  { name: 'Бусты',   icon: () => medalIcon('#ffd166', true),   sub: () => `Медальонов: ${Object.keys(MEDALS).filter(medalLvl).length} из ${Object.keys(MEDALS).length}` },
  pet:    { name: 'Питомец', icon: () => pawIcon, sub: () => PETS[SAVE.pet].name },
};

// ------------------------------------------------------------
//  Раскладка меню: нижняя панель вкладок, герой в убежище по центру
// ------------------------------------------------------------

const tabBarH = () => 60 + SAFE_B;

// Блок под героем на вкладках кампании и бесконечного: строка уровня + кнопка «В бой»
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
  if (screen === 'campaign' || screen === 'endless') {
    const f = fightBlock();
    area = f.selY - top - (screen === 'campaign' && W <= H ? levelCard(selLevel).h + 8 + 38 : 0); y = top + area * 0.56;
  } else if (W > H) {
    const r = sheetRect();
    x = r.x / 2; area = H - tabBarH() - top; y = top + area * 0.52;
  } else {
    area = sheetRect().y - top; y = top + area * 0.56;
  }
  let zoom = clamp(area / 150, 1.4, 2.6);
  if (launch) zoom *= 1 - 0.3 * clamp(launch.t / LAUNCH_T, 0, 1);
  return { x, y, zoom };
}

// ------------------------------------------------------------
//  Верх: валюта и настройки
// ------------------------------------------------------------

function drawChip(right, value, sym, color) {
  ctx.font = 'bold 15px system-ui, sans-serif';
  const s = value + ' ' + sym, w = ctx.measureText(s).width + 20;
  ctx.fillStyle = 'rgba(27,29,38,0.9)';
  roundRect(right - w, 12 + SAFE_T, w, 32, 16); ctx.fill();
  text(s, right - w / 2, 28 + SAFE_T, 15, color, 'center');
  return right - w - 8;
}

function drawMenuTop() {
  let rx = W - 12;
  const g = { x: rx - 40, y: 8 + SAFE_T, w: 40, h: 40, act: () => setScreen(screen === 'settings' ? 'campaign' : 'settings') };
  ctx.fillStyle = screen === 'settings' ? '#2a2e3d' : 'rgba(27,29,38,0.9)';
  roundRect(g.x, g.y, g.w, g.h, 10); ctx.fill();
  ctx.strokeStyle = screen === 'settings' ? '#ffd166' : '#c8cbd6'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(g.x + 20, g.y + 20, 7, 0, TAU); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    ctx.beginPath(); ctx.moveTo(g.x + 20 + Math.cos(a) * 8, g.y + 20 + Math.sin(a) * 8); ctx.lineTo(g.x + 20 + Math.cos(a) * 12, g.y + 20 + Math.sin(a) * 12); ctx.stroke();
  }
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

// Все вкладки видны сразу; закрытые — с замком и уровнем, на котором откроются
// Порядок вкладок слева направо; «Бой» — кампания, «Фармилка» — бесконечный режим
const TAB_ORDER = ['shop', 'wardrobe', 'pet', 'campaign', 'weapon', 'boost', 'endless'];
function tabsList() {
  const fixed = { campaign: { name: 'Бой', icon: flagIcon }, endless: { name: 'Фармилка', icon: infinityIcon } };
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
  ctx.fillStyle = 'rgba(10,11,16,0.96)';
  ctx.fillRect(0, y, W, tb);
  ctx.fillStyle = '#2c3040';
  ctx.fillRect(0, y, W, 1);
  tabs.forEach((t, i) => {
    const r = { x: x0 + i * w, y, w, h: 60 }, on = screen === t.id;
    if (on) { ctx.fillStyle = '#ffd166'; ctx.fillRect(r.x + w * 0.2, y, w * 0.6, 3); }
    if (t.locked) {
      // Обычная иконка и подпись, только приглушённые; в углу — маленький замок с уровнем открытия
      ctx.save();
      ctx.globalAlpha *= 0.4;
      t.icon(r.x + w / 2, y + 24, 26);
      ctx.restore();
      text(t.name, r.x + w / 2, y + 47, 11, '#6b7080', 'center', true, w - 6);
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
    ctx.globalAlpha *= on ? 1 : 0.55;
    t.icon(r.x + w / 2, y + 24, 26);
    ctx.restore();
    text(t.name, r.x + w / 2, y + 47, 11, on ? '#ffd166' : '#9a9eae', 'center', true, w - 6);
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
  ctx.fillStyle = 'rgba(27,29,38,0.9)';
  roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
  ctx.strokeStyle = '#2c3040'; ctx.lineWidth = 2; ctx.stroke();
  text(dir < 0 ? '‹' : '›', r.x + r.w / 2, r.y + r.h / 2 - 2, 30, '#fff', 'center');
  ctx.restore();
  ui.push({ ...r, act });
}

// Разбить текст на строки не шире maxW
function wrapText(s, maxW, size) {
  ctx.font = `${size}px system-ui, sans-serif`;
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
    const b = { x: r.x + d * (bw + gap), y: r.y, w: bw, h: r.h }, open = diffOpen(n, d), on = selDiff === d, done = SAVE.cleared[clearKey(n, d)];
    ctx.fillStyle = on ? D.color : 'rgba(27,29,38,0.9)';
    roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.strokeStyle = open ? D.color : '#2c3040'; ctx.lineWidth = 1.5; ctx.stroke();
    text((open ? '' : '🔒 ') + D.name + (done ? ' ✓' : ''), b.x + b.w / 2, b.y + b.h / 2, 13, on ? '#14141c' : open ? D.color : '#6b7080', 'center', true, b.w - 8);
    ui.push({ ...b, act: () => { if (open) selDiff = d; else showToast(`Сначала пройди главу ${n} на сложности «${DIFFS[d - 1].name}»`); } });
  });
}

function drawLevelCard(n) {
  const c = levelCard(n), L = locOf(n);
  ctx.fillStyle = 'rgba(12,13,18,0.85)';
  roundRect(c.x, c.y, c.w, c.h, 12); ctx.fill();
  ctx.strokeStyle = '#2c3040'; ctx.lineWidth = 1.5; ctx.stroke();
  text(L.name + (n === L.to ? ' · финал локации' : ''), c.x + 12, c.y + 20, 12, L.color, 'left', true, c.w - 24);
  c.lines.forEach((l, i) => text(l, c.x + 12, c.y + 38 + i * 17, 13, '#c8cbd6', 'left', false));
  let x = c.x + 12;
  const y = c.y + 30 + c.lines.length * 17 + 6;
  for (const t of c.traits) {
    const v = traitView(t, n), label = v.icon + ' ' + v.name;
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = '#1b1d26';
    roundRect(x, y, w, 22, 11); ctx.fill();
    ctx.strokeStyle = v.color; ctx.lineWidth = 1.5; ctx.stroke();
    text(label, x + w / 2, y + 11, 12, v.color, 'center');
    x += w + 6;
  }
}

// Кнопка календаря (недельные задания) сбоку на вкладке кампании; красная точка — есть что забрать
function drawCalendarButton() {
  const b = { x: W - 12 - 48, y: 56 + SAFE_T, w: 48, h: 48, act: () => setScreen('quests') };
  ctx.fillStyle = 'rgba(27,29,38,0.9)';
  roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
  ctx.strokeStyle = '#2c3040'; ctx.lineWidth = 2; ctx.stroke();
  const x = b.x + 12, y = b.y + 13;
  ctx.fillStyle = '#e8e0d0'; roundRect(x, y, 24, 22, 3); ctx.fill();
  ctx.fillStyle = '#ff5d73'; ctx.fillRect(x, y, 24, 7);
  ctx.fillStyle = '#c8cbd6'; ctx.fillRect(x + 5, y - 3, 3, 6); ctx.fillRect(x + 16, y - 3, 3, 6);
  ctx.fillStyle = '#6b7080';
  for (let i = 0; i < 6; i++) ctx.fillRect(x + 3 + (i % 3) * 7, y + 10 + Math.floor(i / 3) * 6, 4, 3);
  const n = weekClaimable();
  if (n) {
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.arc(b.x + b.w - 4, b.y + 4, 9, 0, TAU); ctx.fill();
    text(String(n), b.x + b.w - 4, b.y + 4, 11, '#fff', 'center');
  }
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
  arrowButton({ x: rx + rw - ah, y: ay, w: ah, h: ah }, 1, n < SAVE.unlocked, () => {
    if (selLevel < SAVE.unlocked) selLevel++;
    else if (selLevel < CAMPAIGN_LEVELS) showToast(`Сначала пройди главу ${selLevel}`);
  });
  const tw = rw - ah * 2 - 16;
  text(`Глава ${n} — ${levelName(n)}`, W / 2 + 1, f.selY + f.selH * 0.36 + 1, land ? 18 : 21, '#000', 'center', true, tw);
  text(`Глава ${n} — ${levelName(n)}`, W / 2, f.selY + f.selH * 0.36, land ? 18 : 21, '#fff', 'center', true, tw);
  const need = ECON.levelHp(n) * DIFFS[selDiff].hp, have = playerPower();
  textRuns([
    [`Босс через ${fmtTime(ECON.bossTime(n))}: ${BOSSES[levelBoss(n)].name} · `, '#c8cbd6'],
    [`сила ×${have.toFixed(1)}/${need.toFixed(1)}`, have >= need ? '#57e389' : '#ff5d73'],
  ], W / 2, f.selY + f.selH * 0.78, 12, tw);
  const bw = Math.min(W - 32, 340);
  drawButton({ x: (W - bw) / 2, y: f.btnY, w: bw, h: f.bh }, { label: 'В БОЙ', ...PRIMARY, act: menuFight });
}

function drawEndlessTab() {
  const f = fightBlock(), land = W > H;
  bottomShade(f.selY - 40);
  text('Фармилка', W / 2, f.selY + f.selH * 0.36, land ? 18 : 21, '#fff', 'center', true, W - 32);
  text((SAVE.best.kills ? `Рекорд: ${SAVE.best.kills} · ` : '') + 'подвал через 2:00 · смерть −50% золота',
    W / 2, f.selY + f.selH * 0.78, 12, '#c8cbd6', 'center', false, W - 32);
  const bw = Math.min(W - 32, 340);
  drawButton({ x: (W - bw) / 2, y: f.btnY, w: bw, h: f.bh }, { label: 'В БОЙ', ...PRIMARY, act: menuFight });
}

// ------------------------------------------------------------
//  Списки карточек с прокруткой (в панели раздела)
// ------------------------------------------------------------

// it: { name, info, tag, tagColor, color, icon, mark, toggle, btn: { label, ok, act, why }, act }
function drawCard(r, it) {
  // Заголовок раздела внутри списка
  if (it.header) { text(it.header, r.x + 6, r.y + r.h - 20, 16, '#ffd166', 'left', true, r.w - 12); return; }
  ctx.fillStyle = '#1b1d26';
  roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
  ctx.strokeStyle = it.mark ? it.color : '#2c3040'; ctx.lineWidth = it.mark ? 3 : 2; ctx.stroke();
  const s = 44, ix = r.x + 12, iy = r.y + (r.h - s) / 2;
  ctx.fillStyle = '#12131a';
  roundRect(ix, iy, s, s, 8); ctx.fill();
  if (it.icon) it.icon(ix + s / 2, iy + s / 2, s);
  else { ctx.fillStyle = it.color; roundRect(ix + 8, iy + 8, s - 16, s - 16, 4); ctx.fill(); }
  if (it.act) ui.push({ ...r, act: it.act });

  const tx = r.x + 68, right = it.btn || it.toggle !== undefined ? 112 : 16, tw = r.w - 68 - right;
  text(it.name, tx, r.y + 22, 16, '#fff', 'left', true, tw);
  text(it.info, tx, r.y + 43, 13, '#9a9eae', 'left', false, tw);
  if (it.tag) text(it.tag, tx, r.y + 62, 12, it.tagColor || '#9a9eae', 'left', true, tw);

  if (it.toggle !== undefined) {
    const sx = r.x + r.w - 14 - 46, sy = r.y + r.h / 2 - 13;
    ctx.fillStyle = it.toggle ? '#57e389' : '#2c3040';
    roundRect(sx, sy, 46, 26, 13); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(it.toggle ? sx + 33 : sx + 13, sy + 13, 10, 0, TAU); ctx.fill();
  } else if (it.btn) {
    const b = it.btn, br = { x: r.x + r.w - 12 - 96, y: r.y + (r.h - 40) / 2, w: 96, h: 40 };
    ctx.fillStyle = b.ok ? (b.color || '#ffd166') : '#262935';
    roundRect(br.x, br.y, br.w, br.h, 10); ctx.fill();
    text(b.label, br.x + br.w / 2, br.y + 20, 13, b.ok ? '#14141c' : '#6b7080', 'center', true, br.w - 10);
    ui.push({ ...br, act: b.ok ? b.act : () => { if (b.why) showToast(b.why); } });
  }
}

// Список в области area = { x, y, w, h }
function drawList(items, area, note) {
  const gap = 10, ch = 80;
  let top = area.y;
  const bottom = area.y + area.h;
  if (note) { text(note, area.x + area.w / 2, top + 10, 12, '#9a9eae', 'center', false, area.w - 24); top += 24; }
  const cols = area.w >= 820 ? 2 : 1;
  const cw = cols === 1 ? Math.min(area.w - 24, 560) : Math.min((area.w - 24 - gap) / 2, 520);
  const x0 = area.x + (area.w - (cols * cw + (cols - 1) * gap)) / 2;
  const rows = Math.ceil(items.length / cols);
  maxScroll = Math.max(0, rows * (ch + gap) - gap + 8 - (bottom - top));
  menuScroll = clamp(menuScroll, 0, maxScroll);
  ctx.save();
  ctx.beginPath(); ctx.rect(area.x, top, area.w, bottom - top); ctx.clip();
  items.forEach((it, i) => {
    const r = { x: x0 + (i % cols) * (cw + gap), y: top + 4 + Math.floor(i / cols) * (ch + gap) - menuScroll, w: cw, h: ch };
    if (r.y + r.h >= top && r.y <= bottom) drawCard(r, it);
  });
  ctx.restore();
  // Подсказка, что список прокручивается
  if (menuScroll < maxScroll) {
    const g = ctx.createLinearGradient(0, bottom - 30, 0, bottom);
    g.addColorStop(0, 'rgba(12,13,18,0)'); g.addColorStop(1, 'rgba(12,13,18,0.95)');
    ctx.fillStyle = g; ctx.fillRect(area.x, bottom - 30, area.w, 30);
  }
}

// Панель раздела с заголовком и списком
// segs — переключатель разделов под заголовком: { tabs: [[id, имя]], on, set }
function drawSheet(title, items, note, segs) {
  const r = sheetRect();
  ctx.fillStyle = 'rgba(12,13,18,0.95)';
  roundRect(r.x, r.y, r.w, r.h + 24, 18); ctx.fill();
  ctx.strokeStyle = '#2c3040'; ctx.lineWidth = 1.5; ctx.stroke();
  text(title, r.x + 18, r.y + 22, 16, '#ffd166', 'left', true, r.w - 36);
  let top = r.y + 40;
  if (segs) {
    const n = segs.tabs.length, sw = Math.min(150, (r.w - 36 - 6 * (n - 1)) / n);
    segs.tabs.forEach(([id, name], i) => {
      const b = { x: r.x + 18 + i * (sw + 6), y: top, w: sw, h: 32 }, on = segs.on === id;
      ctx.fillStyle = on ? '#ffd166' : '#1b1d26';
      roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
      text(name, b.x + b.w / 2, b.y + 16, 13, on ? '#14141c' : '#c8cbd6', 'center', true, b.w - 8);
      ui.push({ ...b, act: () => { if (segs.on !== id) { segs.set(id); menuScroll = 0; } } });
    });
    top += 40;
  }
  drawList(items, { x: r.x, y: top, w: r.w, h: r.y + r.h - 4 - top }, note);
}

const NO_GOLD = 'Не хватает золота';

function weaponItems() {
  const list = Object.entries(WEAPONS).map(([id, w]) => {
    const L = wLvl(id), max = L >= ECON.weaponMax, own = heroWeapon() === id, on = own || SAVE.loadout.includes(id);
    return {
      name: w.name, color: w.color, icon: weaponIcon(id), mark: on,
      info: `Урон ×${ECON.weaponMult(L).toFixed(2)}` + (max ? '' : `  →  ×${ECON.weaponMult(L + 1).toFixed(2)}`),
      tag: `${TIERS[w.tier].name} · Ур. ${L}/${ECON.weaponMax}` + (own ? ' · ОРУЖИЕ ГЕРОЯ' : on ? ' · В НАБОРЕ' : ''),
      tagColor: on ? w.color : '#9a9eae',
      act: () => {
        if (own) showToast(`С этим оружием ${HEROES[SAVE.hero].name} начинает бой`);
        else if (!toggleLoadout(id)) showToast(`В наборе максимум ${MAX_RUN_WEAPONS - 1} оружий`);
      },
      btn: max ? { label: 'МАКС', ok: false }
        : { label: `🧩 ${wPuzzles(id)}/${PUZZLES_PER_LEVEL}`, ok: canUpgradeWeapon(id), color: '#57e389', act: () => upgradeWeapon(id),
            why: 'Нужно 10 пазлов — они в сундуках и в магазине' },
    };
  });
  // Пазлы тиров, на которые оружия ещё нет: копятся и перейдут в оружие, когда оно появится
  const saved = Object.keys(TIERS).filter(t => SAVE.tierPuzzles[t]);
  if (saved.length) list.push({
    name: 'Пазлы на будущее', color: '#c77dff', icon: (x, y, sz) => text('🧩', x, y, sz * 0.5, '#fff', 'center'),
    info: saved.map(t => `${TIERS[t].many}: ${SAVE.tierPuzzles[t]}`).join(' · '),
    tag: 'Перейдут в оружие этого тира, когда оно появится', tagColor: '#9a9eae',
  });
  return list;
}

function boostItems() {
  return Object.entries(MEDALS).map(([id, M]) => {
    const l = medalLvl(id), c = medalCost(id), locked = M.rare && !l;
    return {
      name: M.name, color: M.color, icon: medalIcon(locked ? '#2c3040' : M.color, M.rare), info: M.info,
      tag: M.rare ? (locked ? 'Редкий · выпадает из кейсов кампании' : `Редкий · ур. ${l}/${M.max}`) : `Ур. ${l}/${M.max}`,
      tagColor: M.rare ? '#c77dff' : '#9a9eae',
      btn: c ? { label: costText(c), ok: canAfford(c), act: () => upgradeMedal(id), why: SAVE.shards < (c.shards || 0) ? 'Нужны осколки — их дают только в кампании' : NO_GOLD }
        : { label: locked ? 'Закрыт' : 'МАКС', ok: false, why: locked ? 'Выбей его в кейсе за прохождение главы' : '' },
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
      icon: (x, y, sz) => text(got ? '✓' : String(i + 1), x, y, sz * 0.45, got ? '#57e389' : '#c8cbd6', 'center'),
      info: `${q.info} · ${prog}`,
      tag: `${rewardText(q.reward)} · +${q.pts} очков`, tagColor: '#ffd166',
      btn: got ? { label: 'Получено', ok: false }
        : done ? { label: 'Забрать', ok: true, color: '#57e389', act: () => showToast('Получено: ' + claimQuest(i)) }
        : { label: Math.floor(p / q.goal * 100) + '%', ok: false, why: q.info },
    };
  });
}

function drawQuests() {
  const r = sheetRect(), w = week(), pts = weekPoints(), max = WEEK_CHESTS[WEEK_CHESTS.length - 1].at;
  ctx.fillStyle = 'rgba(12,13,18,0.95)';
  roundRect(r.x, r.y, r.w, r.h + 24, 18); ctx.fill();
  ctx.strokeStyle = '#2c3040'; ctx.lineWidth = 1.5; ctx.stroke();
  const days = Math.ceil((w.id + 1) * 7 - 3 - (Date.now() / 60000 - new Date().getTimezoneOffset()) / 1440);
  text('НЕДЕЛЬНЫЕ ЗАДАНИЯ', r.x + 18, r.y + 22, 16, '#ffd166', 'left', true, r.w * 0.6);
  text(`Сброс через ${days} дн. · очки ${pts}/${max}`, r.x + r.w - 18, r.y + 22, 12, '#9a9eae', 'right', false, r.w * 0.4);

  // Шкала очков с кейсами: открытый кейс подпрыгивает, тап — забрать
  const bx = r.x + 30, bw = r.w - 60, by = r.y + 70;
  ctx.fillStyle = '#05060a'; roundRect(bx, by - 5, bw, 10, 5); ctx.fill();
  ctx.fillStyle = '#ffd166'; roundRect(bx, by - 5, Math.max(10, bw * Math.min(1, pts / max)), 10, 5); ctx.fill();
  WEEK_CHESTS.forEach((c, i) => {
    const x = bx + bw * c.at / max - (i === WEEK_CHESTS.length - 1 ? 14 : 0), got = w.chests.includes(i), ready = pts >= c.at && !got;
    const y = by - (ready ? 4 + Math.abs(Math.sin(performance.now() / 250)) * 4 : 0);
    chestIcon(x, y, 30, TIERS[c.tier].color, got ? 0.35 : ready ? 1 : 0.6);
    if (got) text('✓', x, y, 16, '#57e389', 'center');
    text(String(c.at), x, by + 26, 11, ready ? '#ffd166' : '#6b7080', 'center');
    ui.push({ x: x - 20, y: by - 26, w: 40, h: 56, act: () => {
      const res = claimChest(i);
      showToast(res ? `${TIERS[c.tier].name} кейс: ${res}` : got ? 'Уже получено' : `${TIERS[c.tier].name} кейс: ${rewardText(c.reward)} — нужно ${c.at} очков`);
    } });
  });
  drawList(questItems(), { x: r.x, y: by + 42, w: r.w, h: r.y + r.h - 4 - by - 42 });
}

// ------------------------------------------------------------
//  Магазин: полки (звёзды, сундуки, пазлы, золото), сундуки глав и ключи,
//  звёзды за деньги, подписки. Покупки за деньги — тестовые
// ------------------------------------------------------------

const NO_STARS = 'Не хватает звёзд — их дают недельные задания';
const left = (key, limit) => Math.max(0, limit - dayUsed(key));
const done = res => { if (res) showToast('Получено: ' + res); };
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
  const chest = id => (x, y, sz) => chestIcon(x, y, sz * 0.7, CHESTS[id].color, 1);
  const coin = (x, y, sz) => { ctx.fillStyle = '#c99a2e'; ctx.beginPath(); ctx.arc(x, y, sz * 0.28, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x - 1, y - 1, sz * 0.2, 0, TAU); ctx.fill(); };
  if (shopTab === 'shelves') {
    const F = SHOP.freeStars, W = SHOP.weaponChest;
    return [
      { header: 'Особая полка' },
      { name: `${F.stars} ⭐`, color: '#ffd166', icon: gem, info: 'Раз в день бесплатно, потом за рекламу или билет',
        tag: `Осталось сегодня: ${left('starsFree', 1) + left('starsAd', F.ads)}`, btn: freeThenAdBtn('stars', F.ads, () => grantReward({ stars: F.stars })) },
      { header: 'Предложения дня' },
      ...dailyOffers().map(o => o.chest ? {
        name: CHESTS[o.chest].name, color: CHESTS[o.chest].color, icon: chest(o.chest),
        info: `Золото и ${CHESTS[o.chest].reward.puzzles[o.chest]} пазлов: ${TIERS[o.chest].many}`,
        tag: `Осталось сегодня: ${left(o.key, SHOP.daily.buys)}`, btn: buyBtn(o.cost, o.key, SHOP.daily.buys, () => openChest(o.chest)),
      } : {
        name: `Пазлы: ${WEAPONS[o.weapon].name} ×${o.n}`, color: WEAPONS[o.weapon].color, icon: weaponIcon(o.weapon),
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
        info: P.stars ? 'За звёзды' : 'Раз в день бесплатно, потом за рекламу или билет',
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
          info: `${o.stars} ⭐  ${rewardGold(o)} ●  🔑${o.keys.blue} синих  🔑${o.keys.red} красный`, tag: 'Разовое предложение', tagColor: '#ffd166',
          btn: testBtn(o.usd + ' $', () => done(buyChapter(k))),
        };
      }) : [{ name: 'Пока нет предложений', color: '#9a9eae', info: `Каждые ${SHOP.chapterEvery} пройденных глав — новый сундук главы` }]),
      { header: 'Сундуки за ключи' },
      ...['boost', 'red'].map(id => {
        const C = CHESTS[id], k = C.key, n = SAVE.keys[k];
        return {
          name: C.name, color: C.color, icon: chest(id), info: C.info, tag: `🔑 ${k === 'blue' ? 'синих' : 'красных'} ключей: ${n}`,
          btn: { label: '🔑 Открыть', ok: n > 0, color: C.color, act: () => done(openWithKey(id)), why: 'Ключи — в сундуках глав' },
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
  const cur = subActive() ? SAVE.sub.tier : -1;
  return [{ header: 'Подписка на месяц' }, ...SHOP.subs.map((P, i) => ({
    name: `${P.name}: ${P.tickets} 🎫 каждый день`, color: ['#c99a6a', '#c8cbd6', '#ffd166'][i], mark: cur === i,
    icon: (x, y, sz) => text('🎫', x, y, sz * 0.5, '#fff', 'center'),
    info: 'Билет пропускает рекламу. Другие бонусы подписки — скоро',
    tag: cur === i ? 'Активна до ' + new Date(SAVE.sub.until).toLocaleDateString('ru-RU') : '',
    btn: cur === i ? { label: 'Активна', ok: false } : testBtn(P.eur + ' €', () => { activateSub(i); showToast(`Подписка «${P.name}» включена (тест)`); }),
  }))];
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
      name: st.name, color: st.color, icon: starIcon(st.color), info: st.info(statPct(id)),
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
  return [evo, ...Object.entries(HEROES).map(([id, H]) => {
    const l = heroLvl(id), on = SAVE.hero === id, ev = heroEvo(Math.max(1, l)), R = RARITY[H.rarity];
    return {
      name: `${H.name} — ${H.title}`, color: R.color, icon: heroIcon(id, SAVE.outfit), mark: on,
      info: `Активка «${H.active}»: ${H.activeInfo}`,
      tag: `${R.name} · ${H.race} · пассивка: ${WEAPONS[H.weapon].name} +${ev.passive}%` + (l ? ` · эвол. ${l}/${HERO_EVO.length}` : ''),
      tagColor: R.color,
      act: l ? () => buyOrPickHero(id) : null,
      btn: on ? { label: 'В бою', ok: false }
        : l ? { label: 'Взять', ok: true, color: '#57e389', act: () => buyOrPickHero(id) }
        : { label: H.stars + ' ⭐', ok: SAVE.stars >= H.stars, act: () => buyOrPickHero(id), why: 'Не хватает звёзд — магазин (каждый день бесплатно) и недельные задания' },
    };
  })];
}

function shopItems(kind) {
  const sh = SHOPS[kind];
  return Object.entries(sh.data).map(([id, d]) => {
    const own = owns(kind, id), on = SAVE[sh.on] === id;
    const icon = kind === 'outfit' ? heroIcon(SAVE.hero, id) : (x, y, s) => drawPetSprite(id, x, y, s / 16);
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
  weapon: ['ОРУЖИЕ', () => weaponItems(), 'Тап — добавить в набор на бой. Улучшение — только пазлами 🧩 (10 = +1 уровень) из сундуков и магазина'],
  wardrobe: ['ГАРДЕРОБ', () => (wardTab === 'stats' ? statItems() : wardTab === 'heroes' ? heroItems() : shopItems('outfit')), null,
    { tabs: [['stats', 'Прокачка'], ['heroes', 'Герои'], ['outfit', 'Одежда']], get on() { return wardTab; }, set: id => { wardTab = id; } }],
  shop: ['МАГАЗИН', () => shopItemsTab(), () => `🎫 Билеты: ${SAVE.tickets} · 🔑 синие: ${SAVE.keys.blue} · 🔑 красные: ${SAVE.keys.red}`,
    { tabs: [['shelves', 'Полки'], ['chests', 'Сундуки'], ['stars', 'Звёзды'], ['sub', 'Подписка']], get on() { return shopTab; }, set: id => { shopTab = id; } }],
  boost: ['БУСТЫ', () => boostItems()],
  pet: ['ПИТОМЕЦ', () => shopItems('pet')],
  settings: ['НАСТРОЙКИ', () => settingsItems()],
};

function drawMenu() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Пока герой выбегает из убежища, интерфейс тает и не нажимается
  const alpha = launch ? clamp(1 - launch.t / 0.25, 0, 1) : 1;
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  if (screen === 'campaign') drawCampaignTab();
  else if (screen === 'endless') drawEndlessTab();
  else if (screen === 'quests') drawQuests();
  else { const [title, items, note, segs] = SHEETS[screen]; drawSheet(title, items(), typeof note === 'function' ? note() : note, segs); }
  drawTabBar();
  drawMenuTop();
  ctx.globalAlpha = 1;
  if (launch) ui = [];
}

// ------------------------------------------------------------
//  Окна поверх забега
// ------------------------------------------------------------

function centerText(lines, cy = H / 2, step = 32, cx = W / 2, maxW = W - 32) {
  let y = cy - (lines.length - 1) * step / 2;
  for (const [s, size, color] of lines) {
    if (s) text(s, cx, y, size, color, 'center', true, maxW);
    y += step;
  }
}


function drawLevelUp() {
  ui = []; // кнопки HUD под затемнением неактивны
  dim();
  const weapon = G.state === 'weaponpick', portrait = W < H * 1.1;
  const n = G.choices.length, gap = 12, bh = 46;
  let cw, ch;
  if (portrait) { cw = Math.min(W - 32, 420); ch = 76; }
  else { cw = Math.min(220, (W - 64 - gap * (n - 1)) / n); ch = 140; }
  const totalW = portrait ? cw : n * cw + (n - 1) * gap;
  const totalH = (portrait ? n * ch + (n - 1) * gap : ch) + 16 + bh;
  const x0 = (W - totalW) / 2, y0 = Math.max(70 + SAFE_T, (H - totalH) / 2 + 10);

  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = weapon ? '#7df9ff' : '#ffd166';
  ctx.fillText(weapon ? 'НОВОЕ ОРУЖИЕ' : 'НОВЫЙ УРОВЕНЬ', W / 2, y0 - 18);

  const ready = tapReady();
  G.cardRects = G.choices.map((c, i) => {
    const r = portrait ? { x: x0, y: y0 + i * (ch + gap), w: cw, h: ch } : { x: x0 + i * (cw + gap), y: y0, w: cw, h: ch };
    const v = choiceView(c);
    ctx.globalAlpha = ready ? 1 : 0.5;
    ctx.fillStyle = '#1b1d26';
    roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
    ctx.strokeStyle = v.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#12131a';
    roundRect(r.x + 12, r.y + 12, 34, 34, 6); ctx.fill();
    if (v.icon) { ctx.save(); weaponIcon(v.icon)(r.x + 29, r.y + 29, 34); ctx.restore(); }
    else { ctx.fillStyle = v.color; roundRect(r.x + 19, r.y + 19, 20, 20, 4); ctx.fill(); }
    text(v.name, r.x + 56, r.y + 29, 16, '#fff', 'left', true, r.w - 56 - 50);
    text(v.tag, r.x + r.w - 12, r.y + 29, 12, v.color, 'right');
    text(v.info, r.x + 14, r.y + (portrait ? 60 : 76), 13, '#c8cbd6', 'left', false, r.w - 28);
    if (!portrait) text('клавиша ' + (i + 1), r.x + 14, r.y + r.h - 16, 11, '#6b7080', 'left', false);
    ctx.globalAlpha = 1;
    return r;
  });

  // Кнопки под карточками. «Новый набор» первый раз за бой бесплатно
  const k = weapon ? 'weapon' : 'up', free = G.rerolls[k] === 0;
  const by = y0 + (portrait ? n * ch + (n - 1) * gap : ch) + 16;
  const bw = Math.min(200, (Math.min(W - 32, 420) - 10) / 2), bx = (W - bw * 2 - 10) / 2;
  const AD = { fill: '#262935', border: '#c77dff', textColor: '#c77dff' };
  const reroll = weapon
    ? { label: 'Новый набор', act: () => (free ? rerollChoices(true) : showToast('Бесплатный набор уже был — смотри рекламу')),
        ...(free ? {} : { textColor: '#6b7080' }) }
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
  ctx.fillStyle = on ? '#57e389' : '#2c3040';
  roundRect(x, y, 46, 26, 13); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(on ? x + 33 : x + 13, y + 13, 10, 0, TAU); ctx.fill();
}

// Пауза = настройки боя: звук, цифры урона, окно урона; закрыть или выйти из боя
const PAUSE_OPTS = [['music', 'Музыка'], ['sfx', 'Звуковые эффекты'], ['dmgText', 'Цифры урона'], ['dmgPanel', 'Окно урона в бою']];
function drawPause() {
  ui = []; // кнопки HUD под затемнением неактивны
  dim();
  const w = Math.min(W - 32, 360), x = (W - w) / 2, rh = 44, bh = 46, gap = 8;
  const total = 44 + PAUSE_OPTS.length * (rh + gap) + 8 + 2 * (bh + gap);
  let y = Math.max(12 + SAFE_T, (H - total) / 2);
  text('ПАУЗА', W / 2, y + 16, 26, '#fff', 'center');
  y += 44;
  for (const [key, name] of PAUSE_OPTS) {
    const r = { x, y, w, h: rh };
    ctx.fillStyle = '#1b1d26'; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
    text(name, x + 14, y + rh / 2, 15, '#fff', 'left', true, w - 90);
    drawSwitch(x + w - 14 - 46, y + (rh - 26) / 2, S[key]);
    ui.push({ ...r, act: () => { S[key] = !S[key]; saveSettings(); } });
    y += rh + gap;
  }
  const quit = G.mode === 'camp' ? 'Выйти из боя (вехи останутся)' : 'Выйти из боя (−50% золота)';
  buttonColumn(y + 8, [{ label: 'Закрыть', ...PRIMARY, act: () => setState('play') }, { label: quit, act: () => finishRun('quit') }], bh, gap);
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
      if (R.medal) lines.push(['Медальон: ' + MEDALS[R.medal].name, 16, '#c77dff']);
      if (R.opened && R.opened.length) lines.push(['Открыто в убежище: ' + R.opened.map(id => CATEGORIES[id].name).join(', '), 16, '#57e389']);
    } else {
      lines.push([R.outcome === 'dead' ? 'ТЫ ПОГИБ' : 'ЗАБЕГ ПРЕРВАН', 30, '#ff5d73']);
      lines.push([`Прогресс: ${Math.floor(R.progress * 100)}%  ·  убито ${R.kills}`, 15, '#fff']);
    }
    lines.push(['Всего за забег: ' + costText({ gold: R.gold, shards: R.shards }), 17, '#ffd166']);
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
  ctx.fillStyle = 'rgba(27,29,38,0.9)'; roundRect(tx - 10, ty - 6, tw + 20, th + 8, 10); ctx.fill();
  text('Урон по оружию', tx, ty + 9, 13, '#c8cbd6');
  drawDmgTable(tx, ty + 24, tw, rows, r => `${fmtNum(r.v)} · ${Math.round(r.v / sum * 100)}% · ${fmtNum(r.v / Math.max(1, R.time))}/с`, 24);
}
