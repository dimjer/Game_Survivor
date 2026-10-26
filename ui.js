'use strict';

// ============================================================
//  Интерфейс вне забега: убежище, кампания, магазины,
//  настройки, окно уровня, пауза и итоги забега.
// ============================================================

// Вкладка убежища: campaign | endless | weapon | boost | perk | skin | outfit | pet | settings
let screen = 'campaign';
let ui = [];                      // кнопки, нарисованные в этом кадре: { x, y, w, h, act }
let menuScroll = 0, maxScroll = 0;
let toast = null;                 // { text, until }
let selLevel = SAVE.unlocked;     // выбранный уровень на вкладке кампании
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
}
function startCampaign(n) { newGame('play', 'camp', n); G.intro = 1; }
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
  if (screen === 'campaign') launchRun(() => startCampaign(selLevel));
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
function buttonColumn(y, list, bh = 48, gap = 10) {
  const bw = Math.min(W - 32, 340), x = (W - bw) / 2;
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

const heroIcon = (skin, outfit) => (x, y, s) => drawHeroSprite(x, y + s * 0.05, s / 16, 1, 0, skin, outfit);

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
  weapon: { name: 'Оружие',  icon: () => weaponIcon(SAVE.startWeapon), sub: () => `${WEAPONS[SAVE.startWeapon].name} · ур. ${wLvl(SAVE.startWeapon)}` },
  boost:  { name: 'Бусты',   icon: () => medalIcon('#ffd166', true),   sub: () => `Медальонов: ${Object.keys(MEDALS).filter(medalLvl).length} из ${Object.keys(MEDALS).length}` },
  perk:   { name: 'Перки',   icon: () => starIcon('#57e389'),          sub: () => `Уровней: ${Object.keys(PERKS).reduce((s, id) => s + perkLvl(id), 0)}` },
  skin:   { name: 'Скины',   icon: () => heroIcon(SAVE.skin, 'none'),  sub: () => SKINS[SAVE.skin].name },
  outfit: { name: 'Одежда',  icon: () => heroIcon(SAVE.skin, SAVE.outfit === 'none' ? 'hat' : SAVE.outfit), sub: () => OUTFITS[SAVE.outfit].name },
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
  if (W > H) { const w = Math.min(560, W * 0.56); return { x: W - w - 12, y: 58, w, h: H - tb - 66 }; }
  const y = Math.max(230, Math.round(H * 0.42));
  return { x: 0, y, w: W, h: H - tb - y };
}

// Где на экране стоит герой (точка 0, 0 убежища) и насколько приближена камера
function menuCamera() {
  const top = 56;
  let x = W / 2, y, area;
  if (screen === 'campaign' || screen === 'endless') {
    const f = fightBlock();
    area = f.selY - top; y = top + area * 0.56;
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
  roundRect(right - w, 12, w, 32, 16); ctx.fill();
  text(s, right - w / 2, 28, 15, color, 'center');
  return right - w - 8;
}

function drawMenuTop() {
  let rx = W - 12;
  const g = { x: rx - 40, y: 8, w: 40, h: 40, act: () => setScreen(screen === 'settings' ? 'campaign' : 'settings') };
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
function tabsList() {
  return [
    { id: 'campaign', name: 'Кампания', icon: flagIcon },
    { id: 'endless', name: 'Бесконечный', icon: infinityIcon },
    ...Object.keys(CATEGORIES).map(id => ({ id, name: CATEGORIES[id].name, icon: CATEGORIES[id].icon(), locked: !isOpen(id) })),
  ];
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
      ui.push({ ...r, act: () => showToast(`${t.name} откроется на ${UNLOCKS[t.id]} уровне кампании`) });
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
const playerPower = () => ECON.weaponMult(wLvl(SAVE.startWeapon)) * (1 + 0.15 * medalLvl('fury'));

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

function drawCampaignTab() {
  const f = fightBlock(), n = selLevel, land = W > H;
  bottomShade(f.selY - 40);
  const rw = Math.min(W - 24, 420), rx = (W - rw) / 2, ah = 44, ay = f.selY + (f.selH - ah) / 2;
  arrowButton({ x: rx, y: ay, w: ah, h: ah }, -1, n > 1, () => { if (selLevel > 1) selLevel--; });
  arrowButton({ x: rx + rw - ah, y: ay, w: ah, h: ah }, 1, n < SAVE.unlocked, () => {
    if (selLevel < SAVE.unlocked) selLevel++;
    else if (selLevel < CAMPAIGN_LEVELS) showToast(`Сначала пройди уровень ${selLevel}`);
  });
  const tw = rw - ah * 2 - 16;
  text(`Ур. ${n} — ${levelName(n)}`, W / 2 + 1, f.selY + f.selH * 0.36 + 1, land ? 18 : 21, '#000', 'center', true, tw);
  text(`Ур. ${n} — ${levelName(n)}`, W / 2, f.selY + f.selH * 0.36, land ? 18 : 21, '#fff', 'center', true, tw);
  const need = ECON.levelHp(n), have = playerPower();
  textRuns([
    [`Убить ${ECON.kills(n)} · босс: ${BOSSES[levelBoss(n)].name}${SAVE.cleared[n] ? ' · ✓' : ''} · `, '#c8cbd6'],
    [`сила ×${have.toFixed(1)}/${need.toFixed(1)}`, have >= need ? '#57e389' : '#ff5d73'],
  ], W / 2, f.selY + f.selH * 0.78, 12, tw);
  const bw = Math.min(W - 32, 340);
  drawButton({ x: (W - bw) / 2, y: f.btnY, w: bw, h: f.bh }, { label: 'В БОЙ', ...PRIMARY, act: menuFight });
}

function drawEndlessTab() {
  const f = fightBlock(), land = W > H;
  bottomShade(f.selY - 40);
  text('Бесконечный', W / 2, f.selY + f.selH * 0.36, land ? 18 : 21, '#fff', 'center', true, W - 32);
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
function drawSheet(title, items, note) {
  const r = sheetRect();
  ctx.fillStyle = 'rgba(12,13,18,0.95)';
  roundRect(r.x, r.y, r.w, r.h + 24, 18); ctx.fill();
  ctx.strokeStyle = '#2c3040'; ctx.lineWidth = 1.5; ctx.stroke();
  text(title, r.x + 18, r.y + 22, 16, '#ffd166', 'left', true, r.w - 36);
  drawList(items, { x: r.x, y: r.y + 40, w: r.w, h: r.h - 44 }, note);
}

const NO_GOLD = 'Не хватает золота';

function weaponItems() {
  return Object.entries(WEAPONS).map(([id, w]) => {
    const L = wLvl(id), c = weaponCost(id), on = SAVE.startWeapon === id;
    return {
      name: w.name, color: w.color, icon: weaponIcon(id), mark: on,
      info: `Урон ×${ECON.weaponMult(L).toFixed(2)}` + (c ? `  →  ×${ECON.weaponMult(L + 1).toFixed(2)}` : ''),
      tag: `Ур. ${L}/${ECON.weaponMax} · Ранг ${wRank(L)}` + (c && c.shards ? ' · новый ранг за осколки' : '') + (on ? ' · В БОЮ' : ''),
      tagColor: on ? w.color : '#9a9eae',
      act: () => { SAVE.startWeapon = id; save(); G.weapons = { [id]: 1 }; },
      btn: c
        ? { label: costText(c), ok: canAfford(c), act: () => upgradeWeapon(id), why: SAVE.shards < c.shards ? 'Нужны осколки — их дают только в кампании' : NO_GOLD }
        : { label: 'МАКС', ok: false },
    };
  });
}

function boostItems() {
  return Object.entries(MEDALS).map(([id, M]) => {
    const l = medalLvl(id), c = medalCost(id), locked = M.rare && !l;
    return {
      name: M.name, color: M.color, icon: medalIcon(locked ? '#2c3040' : M.color, M.rare), info: M.info,
      tag: M.rare ? (locked ? 'Редкий · выпадает из кейсов кампании' : `Редкий · ур. ${l}/${M.max}`) : `Ур. ${l}/${M.max}`,
      tagColor: M.rare ? '#c77dff' : '#9a9eae',
      btn: c ? { label: costText(c), ok: canAfford(c), act: () => upgradeMedal(id), why: SAVE.shards < (c.shards || 0) ? 'Нужны осколки — их дают только в кампании' : NO_GOLD }
        : { label: locked ? 'Закрыт' : 'МАКС', ok: false, why: locked ? 'Выбей его в кейсе за прохождение уровня' : '' },
    };
  });
}

function perkItems() {
  return Object.entries(PERKS).map(([id, P]) => {
    const l = perkLvl(id), c = perkCost(id);
    return {
      name: P.name, color: P.color, icon: starIcon(P.color), info: P.info, tag: `Ур. ${l}/${P.max}`,
      btn: c ? { label: costText(c), ok: canAfford(c), act: () => buyPerk(id), why: NO_GOLD } : { label: 'МАКС', ok: false },
    };
  });
}

function shopItems(kind) {
  const sh = SHOPS[kind];
  return Object.entries(sh.data).map(([id, d]) => {
    const own = owns(kind, id), on = SAVE[sh.on] === id;
    const icon = kind === 'skin' ? heroIcon(id, 'none') : kind === 'outfit' ? heroIcon(SAVE.skin, id)
      : (x, y, s) => drawPetSprite(id, x, y, s / 16);
    return {
      name: d.name, color: '#ffd166', icon, mark: on,
      info: d.info || (kind === 'skin' ? 'Внешний вид героя' : 'Головной убор'),
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
    opt('vibrate', 'Вибрация', 'При получении урона (Android)', '#c77dff'),
    {
      name: 'Сбросить прогресс', info: 'Золото, уровни и покупки', color: '#ff5d73',
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
  weapon: ['ОРУЖИЕ', () => weaponItems(), 'Тапни оружие, чтобы взять его в бой'],
  boost: ['БУСТЫ', () => boostItems()],
  perk: ['ПЕРКИ', () => perkItems()],
  skin: ['СКИНЫ', () => shopItems('skin')],
  outfit: ['ОДЕЖДА', () => shopItems('outfit')],
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
  else { const [title, items, note] = SHEETS[screen]; drawSheet(title, items(), note); }
  drawTabBar();
  drawMenuTop();
  ctx.globalAlpha = 1;
  if (launch) ui = [];
}

// ------------------------------------------------------------
//  Окна поверх забега
// ------------------------------------------------------------

function centerText(lines, cy = H / 2, step = 32) {
  let y = cy - (lines.length - 1) * step / 2;
  for (const [s, size, color] of lines) {
    if (s) text(s, W / 2, y, size, color, 'center', true, W - 32);
    y += step;
  }
}

function drawLevelUp() {
  dim();
  const portrait = W < H * 1.1;
  const n = G.choices.length, gap = 12;
  let cw, ch;
  if (portrait) { cw = Math.min(W - 32, 420); ch = 86; }
  else { cw = Math.min(250, (W - 64 - gap * (n - 1)) / n); ch = 150; }
  const totalW = portrait ? cw : n * cw + (n - 1) * gap;
  const totalH = portrait ? n * ch + (n - 1) * gap : ch;
  const x0 = (W - totalW) / 2, y0 = (H - totalH) / 2 + 20;

  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('НОВЫЙ УРОВЕНЬ', W / 2, y0 - 18);

  const ready = tapReady();
  G.cardRects = G.choices.map((c, i) => {
    const r = portrait ? { x: x0, y: y0 + i * (ch + gap), w: cw, h: ch } : { x: x0 + i * (cw + gap), y: y0, w: cw, h: ch };
    const v = choiceView(c);
    ctx.globalAlpha = ready ? 1 : 0.5;
    ctx.fillStyle = '#1b1d26';
    roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
    ctx.strokeStyle = v.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = v.color;
    roundRect(r.x + 14, r.y + 14, 30, 30, 6); ctx.fill();
    text(v.name, r.x + 56, r.y + 29, 17, '#fff');
    text(v.tag, r.x + r.w - 14, r.y + 29, 12, v.color, 'right');
    text(v.info, r.x + 14, r.y + (portrait ? 64 : 80), 14, '#c8cbd6', 'left', false, r.w - 28);
    if (!portrait) text('клавиша ' + (i + 1), r.x + 14, r.y + r.h - 18, 11, '#6b7080', 'left', false);
    ctx.globalAlpha = 1;
    return r;
  });
}

function drawPause() {
  ui = []; // кнопка паузы под затемнением неактивна
  dim();
  centerText([['ПАУЗА', 32, '#fff']], H / 2 - 60);
  const quit = G.mode === 'camp'
    ? { label: 'Сдаться (награды за вехи останутся)', act: () => finishRun('quit') }
    : { label: 'Уйти (−50% золота)', act: () => finishRun('quit') };
  buttonColumn(H / 2 - 20, [{ label: 'Продолжить', ...PRIMARY, act: () => setState('play') }, quit]);
}

function drawResult() {
  ui = [];
  dim(0.9);
  const R = G.result, n = R.level;
  const lines = [];
  let buttons;
  if (R.mode === 'camp') {
    if (R.outcome === 'win') {
      lines.push([`УРОВЕНЬ ${n} ПРОЙДЕН!`, 28, '#57e389']);
      lines.push([R.first ? 'Первое прохождение' : 'Повторное прохождение', 14, '#c8cbd6']);
      lines.push(['Кейс за босса: ' + costText(R.boss), 16, '#fff']);
      if (R.medal) lines.push(['Медальон: ' + MEDALS[R.medal].name, 16, '#c77dff']);
      if (R.opened && R.opened.length) lines.push(['Открыто в убежище: ' + R.opened.map(id => CATEGORIES[id].name).join(', '), 16, '#57e389']);
    } else {
      lines.push([R.outcome === 'dead' ? 'ТЫ ПОГИБ' : 'ЗАБЕГ ПРЕРВАН', 30, '#ff5d73']);
      lines.push([`Прогресс: ${Math.floor(R.progress * 100)}%  ·  убито ${R.kills}`, 15, '#fff']);
    }
    lines.push(['Всего за забег: ' + costText({ gold: R.gold, shards: R.shards }), 17, '#ffd166']);
    buttons = R.outcome === 'win' && n < CAMPAIGN_LEVELS
      ? [{ label: `Уровень ${n + 1}`, ...PRIMARY, act: () => startCampaign(n + 1) }, { label: 'Ещё раз', act: () => startCampaign(n) }]
      : [{ label: R.outcome === 'win' ? 'Ещё раз' : 'Попробовать снова', ...PRIMARY, act: () => startCampaign(n) }];
  } else {
    lines.push(R.outcome === 'escape' ? ['ТЫ ВЫБРАЛСЯ!', 30, '#ffd166'] : [R.outcome === 'dead' ? 'ТЫ ПОГИБ' : 'ЗАБЕГ ПРЕРВАН', 30, '#ff5d73']);
    lines.push([`Время ${fmtTime(R.time)}  ·  убито ${R.kills}` + (R.record ? '  ·  РЕКОРД!' : ''), 15, '#fff']);
    if (R.lost) lines.push([`Собрано ${R.coins} ●, половина потеряна`, 14, '#ff5d73']);
    lines.push(['Золото: +' + R.gold + ' ●', 18, '#ffd166']);
    buttons = [{ label: 'Ещё забег', ...PRIMARY, act: startEndless }];
  }
  buttons.push({ label: 'В убежище', act: goHub });
  R.primary = buttons[0].act;
  const bh = 48, gap = 10, blockH = lines.length * 32 + 16 + buttons.length * (bh + gap);
  const y0 = Math.max(24, (H - blockH) / 2);
  centerText(lines, y0 + (lines.length - 1) * 16);
  buttonColumn(y0 + lines.length * 32 + 8, buttons, bh, gap);
}
