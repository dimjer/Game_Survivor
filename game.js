'use strict';

// ============================================================
//  Survivor — забег: ввод, спавн, бой, отрисовка мира и HUD.
//  Данные и баланс — data.js, прогресс — meta.js, меню — ui.js.
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, DPR = 1, SCALE = 1, SAFE_B = 0;
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden';
document.body.appendChild(safeProbe);
function resize() {
  SAFE_B = safeProbe.offsetHeight || 0;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  // Сколько мира видно: короткая сторона экрана ≈ 420 игровых единиц
  SCALE = Math.max(0.8, Math.min(W, H) / 420);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------
//  Пространственная сетка — быстрый поиск врагов рядом с точкой
// ------------------------------------------------------------

const CELL = 48;
const MAX_ER = 28; // максимальный радиус врага (голем), запас для поиска
const grid = new Map();
const gkey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

function buildGrid() {
  grid.clear();
  for (const e of G.enemies) {
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    a.push(e);
  }
}

function query(x, y, r, out) {
  out.length = 0;
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const a = grid.get(gkey(cx, cy));
      if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
    }
  }
  return out;
}
const near = [];

// ------------------------------------------------------------
//  Состояние игры
// ------------------------------------------------------------

// mode: 'endless' | 'camp'; level — номер уровня кампании
let G;
function newGame(state = 'play', mode = 'endless', level = 0, diff = 0) {
  G = {
    state, mode, level, diff, t: 0, kills: 0, shake: 0, stateAt: performance.now(),
    arena: mode === 'camp' ? levelArena(level) : endlessArena(),
    traits: mode === 'camp' ? levelTraits(level) : [], // особенности уровня: a, s, r, h
    intro: 0, // > 0 — камера ещё отъезжает после выхода из убежища
    hero: {
      x: 0, y: 0, r: 9, hp: 100, maxHp: 100, speed: 115, face: 1, inv: 0, walk: 0,
      level: 1, xp: 0, xpNext: 5, magnet: 55, regen: 0, dmgMul: 1, cdMul: 1,
    },
    enemies: [], bullets: [], ebullets: [], gems: [], texts: [], particles: [], banners: [],
    weapons: { [heroWeapon()]: newUps(heroWeapon()) }, passives: {}, timers: {}, orbAng: 0,
    heroBonus: heroBonuses(), evo: curEvo(),
    active: { t: 0, cd: 5 },        // активка героя: t — сколько ещё действует, cd — до готовности
    pendingWeapons: 0,              // убит промежуточный моб — ждёт выбор оружия
    rerolls: { up: 0, weapon: 0 },  // сколько раз нажат «Новый набор» (первый раз бесплатно)
    nextEliteT: ECON.eliteEvery,
    stats: { total: {}, sec: {} },  // урон по источникам: всего и по секундам (последние 10 с)
    spawnAcc: 0, nextElite: 120, nextSwarm: 60, bossCount: 0, nextPack: ECON.packEvery,
    hazards: [], hazardAcc: 0,
    pendingLevels: 0, choices: null, cardRects: [],
    gold: 0, revived: false, hatch: null, result: null,
    pet: { x: -18, y: -14, cd: 1 },
    // Кампания: цель по убийствам, текущая волна, пройденные вехи (0/1/2), босс и награды забега
    camp: mode === 'camp'
      ? { dur: ECON.bossTime(level), wave: 0, got: 0, elites: 0, boss: null, won: null, earned: { gold: 0, shards: 0 } }
      : null,
  };
  applyMeta(G.hero);
  if (state === 'play') questAdd('runs');
}
newGame('menu');

function setState(s) { G.state = s; G.stateAt = performance.now(); }
const arena = () => ARENAS[G.arena];
const has = t => G.traits.includes(t);
// В бесконечном — случайная из открытых локаций
function endlessArena() {
  const open = LOCATIONS.filter(l => l.from <= SAVE.unlocked);
  return open[Math.floor(Math.random() * open.length)].id;
}

// ------------------------------------------------------------
//  Ввод: клавиатура + плавающий джойстик для пальца/мыши
// ------------------------------------------------------------

const keys = new Set();
let joy = null;   // { id, ox, oy, x, y }
let press = null; // нажатие вне забега: { id, x, y, scroll, moved }
const JOY_R = 55;

window.addEventListener('keydown', e => {
  keys.add(e.code);
  const back = e.code === 'Escape' || e.code === 'Backspace';
  const ok = e.code === 'Enter' || e.code === 'Space';
  if ((G.state === 'levelup' || G.state === 'weaponpick') && G.choices) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
    if (n !== undefined && G.choices[n]) pickChoice(G.choices[n]);
  } else if (G.state === 'play' && (e.code === 'KeyQ' || e.code === 'KeyE')) {
    useActive();
  } else if (G.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) {
    setState('pause');
  } else if (G.state === 'pause' && (ok || e.code === 'Escape')) {
    setState('play');
  } else if (G.state === 'menu' && back) {
    setScreen('campaign');
  } else if (G.state === 'menu' && ok) {
    menuFight();
  } else if (G.state === 'over' && ok && tapReady() && G.result.primary) {
    G.result.primary();
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); joy = null; if (G.state === 'play') setState('pause'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') setState('pause'); });

// Защита от случайного тапа: окно открылось, пока палец ещё на экране
const tapReady = () => performance.now() - G.stateAt > 350;

// В забеге палец — джойстик. Вне забега тап срабатывает на отпускании,
// чтобы списки в меню можно было прокручивать пальцем.
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const x = e.clientX, y = e.clientY;
  if (G.state === 'play') {
    if (hitUi(x, y)) return; // кнопки паузы и активки
    joy = { id: e.pointerId, ox: x, oy: y, x, y };
    return;
  }
  press = { id: e.pointerId, x, y, scroll: menuScroll, moved: false };
});
canvas.addEventListener('pointermove', e => {
  if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
  if (press && e.pointerId === press.id) {
    const dy = e.clientY - press.y;
    if (Math.abs(dy) > 8 || Math.abs(e.clientX - press.x) > 8) press.moved = true;
    if (press.moved && G.state === 'menu') menuScroll = clamp(press.scroll - dy, 0, maxScroll);
  }
});
canvas.addEventListener('pointerup', e => {
  if (joy && e.pointerId === joy.id) joy = null;
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  if (!p.moved && tapReady()) onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', e => {
  if (joy && e.pointerId === joy.id) joy = null;
  press = null;
});
canvas.addEventListener('wheel', e => {
  if (G.state === 'menu') menuScroll = clamp(menuScroll + e.deltaY, 0, maxScroll);
}, { passive: true });

function onTap(x, y) {
  if (G.state === 'levelup' || G.state === 'weaponpick') {
    const i = G.cardRects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (i >= 0) pickChoice(G.choices[i]);
    else hitUi(x, y); // «Новый набор», «Взять все», реклама
    return;
  }
  if (hitUi(x, y)) return;
  if (G.state === 'pause') setState('play');
}

function inputVector() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (joy) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > 6) { const k = Math.min(d, JOY_R) / JOY_R / d; x += dx * k; y += dy * k; }
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

// ------------------------------------------------------------
//  Спавн
// ------------------------------------------------------------

function spawnRadius() { return Math.hypot(W, H) / 2 / SCALE + 40; }

function pushEnemy(o, x, y) {
  const e = { x, y, kx: 0, ky: 0, flash: 0, orbCd: 0, dead: false, ...o, maxHp: o.hp };
  G.enemies.push(e);
  return e;
}

// Множители HP/урона/скорости мобов прямо сейчас
function enemyScale() {
  if (G.mode === 'camp') {
    const n = G.level;
    const D = DIFFS[G.diff];
    return { hp: ECON.levelHp(n) * ECON.waveHp[G.camp.wave] * (has('s') ? ECON.swarmHp : 1) * D.hp, dmg: ECON.levelDmg(n) * D.dmg, speed: ECON.levelSpeed(n) };
  }
  const over = Math.max(0, G.kills - ECON.rampKills);
  // После порога убийств орда звереет: HP растёт экспоненциально, урон — линейно
  return { hp: (1 + G.t / 90) * ECON.rampHp ** over, dmg: 1 + over / 1000, speed: 1 };
}

function makeMob(tier, x, y) {
  const M = MOBS[tier - 1], A = ARCH[M.arch], k = enemyScale();
  return pushEnemy({
    tier, arch: M.arch, r: A.r, hp: A.hp * k.hp, speed: A.speed * k.speed * rand(0.9, 1.1),
    dmg: Math.round(A.dmg * k.dmg), color: M.color, shape: M.shape, xp: A.xp,
    armor: has('a') ? ECON.armor : 0,
    shoot: has('r') && Math.random() < ECON.shooterChance ? rand(0.5, ECON.shooterCd) : 0, // > 0 — стрелок, до выстрела
  }, x, y);
}

function spawnMob(tier, ang = rand(0, TAU), R = spawnRadius()) {
  const h = G.hero;
  return makeMob(tier, h.x + Math.cos(ang) * R, h.y + Math.sin(ang) * R);
}

// Мобы текущей локации: tier от lo до lo + 2
const mobLo = () => locIndex(G.arena) * 3 + 1;

// Случайный моб локации; shift > 0 чаще выбирает сильных. На «Стаях» больше бегунов
function pickTier(shift = 0) {
  const lo = mobLo(), hi = lo + 2;
  const w = [];
  let sum = 0;
  for (let k = lo; k <= hi; k++) {
    const arch = MOBS[k - 1].arch;
    const v = ARCH[arch].weight * (1 + shift * (k - lo) / 2) * (arch === 'runner' && has('s') ? ECON.swarmRunner : 1);
    w.push(v); sum += v;
  }
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return lo + i; }
  return hi;
}
// В бесконечном со временем чаще идут сильные виды
const curShift = () => (G.mode === 'camp' ? G.camp.wave : Math.min(3, G.t / 120));

// Промежуточный моб: крупный и толстый, несёт оружие из набора на бой
const runWeaponsLeft = () => SAVE.loadout.filter(id => !G.weapons[id] && WEAPONS[id]);
const canGetWeapon = () => Object.keys(G.weapons).length + G.pendingWeapons < MAX_RUN_WEAPONS && runWeaponsLeft().length > G.pendingWeapons;
function spawnElite() {
  const e = spawnMob(mobLo() + 2);
  e.elite = true;
  e.hp = e.maxHp = e.hp * ECON.eliteHp;
  e.r *= ECON.eliteSize; e.xp *= 5; e.speed *= 0.85;
  addBanner('ПРОМЕЖУТОЧНЫЙ МОБ', 'Убей — получишь новое оружие', '#7df9ff');
}

// Стая бегунов с одной стороны (особенность «Стаи»)
function spawnPack() {
  const lo = mobLo();
  let tier = lo;
  for (let k = lo; k <= lo + 2; k++) if (MOBS[k - 1].arch === 'runner') tier = k;
  const a = rand(0, TAU);
  for (let i = 0; i < ECON.packSize; i++) spawnMob(tier, a + rand(-0.3, 0.3), spawnRadius() + rand(0, 40));
  addBanner('СТАЯ!', '', '#ffd166');
}

// Кольцо врагов — герой окружён со всех сторон
function spawnRing(tier, n) {
  for (let i = 0; i < n; i++) spawnMob(tier, (i / n) * TAU, spawnRadius() - 10);
  addBanner('ОКРУЖЕНИЕ!', '', '#ff5d73');
}

// e.boss — поведение босса (golem / lich / hybrid), имя и цвет — из BOSSES
function spawnBoss(kind, hpMul, dmgMul) {
  const B = BOSSES[kind], h = G.hero, a = rand(0, TAU), R = spawnRadius() - 20;
  addBanner('БОСС: ' + B.name.toUpperCase(), '', '#ffffff');
  return pushEnemy({
    boss: B.ai, name: B.name, r: B.r, hp: B.hp * hpMul, speed: B.speed, dmg: Math.round(B.dmg * dmgMul),
    color: B.color, shape: B.ai, xp: B.xp, armor: has('a') ? ECON.armor : 0,
    ai: { t: 2.5, phase: 'walk', dx: 0, dy: 0, summon: 6, ring: 3 },
  }, h.x + Math.cos(a) * R, h.y + Math.sin(a) * R);
}

function updateSpawns(dt) {
  if (G.mode === 'camp') updateCampSpawns(dt);
  else updateEndlessSpawns(dt);
}

function updateEndlessSpawns(dt) {
  const t = G.t, h = G.hero;
  G.spawnAcc += dt * (1.2 + t / 14);
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length < 700) spawnMob(pickTier(curShift()));
  }
  if (t >= G.nextSwarm) {
    G.nextSwarm += 60;
    spawnRing(pickTier(curShift()), Math.min(80, 24 + Math.floor(t / 6)));
  }
  if (t >= G.nextEliteT) {
    G.nextEliteT += ECON.eliteEvery;
    if (canGetWeapon()) spawnElite();
  }
  if (t >= G.nextElite) {
    G.nextElite += 120;
    const k = enemyScale();
    spawnBoss(arena().bosses[G.bossCount++ % 2 ? 0 : 1], k.hp, k.dmg);
  }
  if (!G.hatch && t >= ECON.hatchAt) {
    const a = rand(0, TAU);
    G.hatch = { x: h.x + Math.cos(a) * 260, y: h.y + Math.sin(a) * 260 };
    addBanner('ПОДВАЛ ОТКРЫТ', 'Добеги до люка, чтобы забрать всё золото', '#ffd166');
  }
}

function updateCampSpawns(dt) {
  const c = G.camp, n = G.level;
  if (c.boss) return; // на боссе обычные мобы не приходят — только свита лича
  G.spawnAcc += dt * ECON.spawnRate(n) * ECON.waveRate[c.wave] * (has('s') ? ECON.swarmRate : 1);
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length < 700) spawnMob(pickTier(c.wave));
  }
  if (has('s') && G.t >= G.nextPack) {
    G.nextPack += ECON.packEvery;
    spawnPack();
  }
}

// Особенность «Опасность»: рядом с героем время от времени появляются лужи яда / огня / разломы.
// Первые 0.8 с лужа только проступает и не жжёт — от неё можно отойти.
function updateHazards(dt) {
  const h = G.hero, c = G.camp;
  if (has('h') && !c.boss && c.won == null) {
    G.hazardAcc += dt;
    if (G.hazardAcc >= ECON.hazardEvery) {
      G.hazardAcc = 0;
      const a = rand(0, TAU), d = rand(30, 170);
      G.hazards.push({ x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d, r: rand(26, 42), t: 0 });
    }
  }
  for (const z of G.hazards) {
    z.t += dt;
    if (z.t > 0.8 && h.inv <= 0 && c.won == null && (z.x - h.x) ** 2 + (z.y - h.y) ** 2 < (z.r + h.r * 0.5) ** 2) {
      damageHero(Math.round(ECON.hazardDmg * ECON.levelDmg(G.level) * DIFFS[G.diff].dmg));
      if (G.state !== 'play') return;
    }
  }
  G.hazards = G.hazards.filter(z => z.t < ECON.hazardLife);
}

// ------------------------------------------------------------
//  Кампания: прогресс, вехи наград, босс
// ------------------------------------------------------------

function updateCampaign() {
  const c = G.camp, n = G.level;
  const p = Math.min(1, G.t / c.dur); // прогресс главы — по времени
  const wave = Math.min(3, Math.floor(p * 4));
  if (wave > c.wave) {
    c.wave = wave;
    if (wave >= 2) spawnRing(pickTier(wave), 20 + 4 * Math.min(n, 30));
  }
  if (p >= ECON.eliteAt * (c.elites + 1) && c.elites < 7) {
    c.elites++;
    if (canGetWeapon()) spawnElite();
  }
  const D = DIFFS[G.diff], more = r => ({ ...r, gold: Math.round(r.gold * D.gold) });
  if (c.got < 1 && p >= 0.25) { c.got = 1; campReward(more(ECON.reward25(n)), '25% · МИНИ-НАГРАДА'); }
  if (c.got < 2 && p >= 0.5) { c.got = 2; campReward(more(ECON.reward50(n)), '50% · СРЕДНЯЯ НАГРАДА'); }
  if (!c.boss && p >= 1) c.boss = spawnBoss(levelBoss(n), ECON.bossHp(n) * D.hp, ECON.levelDmg(n) * D.dmg);
}

// Вехи начисляются сразу: даже если герой погибнет, награда останется
function campReward(r, title) {
  grant(r);
  G.camp.earned.gold += r.gold;
  G.camp.earned.shards += r.shards;
  addBanner(title, costText(r), '#ffd166');
}

// Босс уровня убит: остальные враги рассыпаются, через секунду — экран победы
function winLevel() {
  const c = G.camp;
  c.won = G.t;
  for (const e of G.enemies) if (!e.dead) { e.dead = true; burst(e.x, e.y, e.color, 3); }
  G.ebullets.length = 0;
  addBanner('ГЛАВА ПРОЙДЕНА!', '', '#57e389');
}

// Конец забега: начисляем награды и показываем итог.
// outcome: 'win' | 'dead' | 'escape' | 'quit'
function finishRun(outcome) {
  const h = G.hero, c = G.camp;
  // При победе и побеге монеты, оставшиеся на поле, собираются сами
  if (outcome === 'win' || outcome === 'escape') {
    for (const g of G.gems) if (g.kind === 'gold') G.gold += g.xp * h.goldMul;
  }
  let gold = Math.floor(G.gold);
  const R = { outcome, mode: G.mode, level: G.level, time: G.t, kills: G.kills, coins: gold, dmg: dmgRows('total') };
  if (G.mode === 'endless') {
    questAdd('endless', G.t);
    if (outcome !== 'escape') { R.lost = gold - Math.floor(gold * ECON.deathKeep); gold -= R.lost; }
    grant({ gold });
    R.gold = gold;
    if (G.kills > SAVE.best.kills) { SAVE.best.kills = G.kills; R.record = true; }
    SAVE.best.time = Math.max(SAVE.best.time, G.t);
  } else {
    const n = G.level, key = clearKey(n, G.diff);
    R.diff = G.diff;
    grant({ gold });
    R.gold = gold + c.earned.gold;
    R.shards = c.earned.shards;
    R.progress = Math.min(1, G.t / c.dur);
    if (outcome === 'win') {
      questAdd('wins');
      const first = !SAVE.cleared[key];
      const r = bossReward(n, first, G.diff);
      grant(r);
      R.puzzles = grantReward({ puzzles: r.puzzles });
      const opensNext = G.diff < DIFFS.length - 1 && !SAVE.cleared[key];
      SAVE.cleared[key] = (SAVE.cleared[key] || 0) + 1;
      if (opensNext) R.nextDiff = G.diff + 1;
      const was = SAVE.unlocked;
      SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(CAMPAIGN_LEVELS, n + 1));
      R.opened = Object.keys(UNLOCKS).filter(id => was < UNLOCKS[id] && SAVE.unlocked >= UNLOCKS[id]);
      R.first = first; R.boss = r; R.medal = r.medal;
      R.gold += r.gold; R.shards += r.shards;
    }
  }
  save();
  G.result = R;
  setState('over');
  joy = null;
}

// ------------------------------------------------------------
//  Бой
// ------------------------------------------------------------

function addText(x, y, s, color = '#fff', life = 0.6, size = 9) {
  if (G.texts.length > 140) G.texts.shift();
  G.texts.push({ x: x + rand(-4, 4), y, s, color, life, max: life, size });
}

// Крупная надпись по центру экрана; показываются по очереди
function addBanner(text, sub, color) {
  if (G.banners.length < 4) G.banners.push({ text, sub, color, life: 2.4 });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n && G.particles.length < 500; i++) {
    const a = rand(0, TAU), v = rand(30, 110);
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.5), color });
  }
}

// src — кто бьёт (id оружия или 'pet'), для статистики урона
function hurt(e, base, kbx = 0, kby = 0, src) {
  if (e.dead) return;
  const h = G.hero, crit = Math.random() < h.critChance;
  const dmg = Math.max(1, Math.round(base * h.dmgMul * (crit ? h.critMul : 1) * (1 - (e.armor || 0)) * rand(0.85, 1.15)));
  trackDamage(src, Math.min(dmg, Math.max(0, e.hp))); // в зачёт идёт только реально снятое HP
  e.hp -= dmg;
  e.flash = 0.08;
  const kb = e.boss ? 0.1 : 1; // боссов почти не отбрасывает
  e.kx += kbx * kb; e.ky += kby * kb;
  if (S.dmgText) addText(e.x, e.y - e.r, String(dmg), crit ? '#ffd166' : '#fff', 0.6, crit ? 11 : 9);
  if (e.hp <= 0) killEnemy(e);
}

// Статистика урона: сумма за бой и корзины по секундам для «урон/с за 10 с»
function trackDamage(src, d) {
  if (!src || !d) return;
  const st = G.stats, sec = Math.floor(G.t), i = sec % 10;
  st.total[src] = (st.total[src] || 0) + d;
  const b = st.sec[src] || (st.sec[src] = { v: new Array(10).fill(0), at: new Array(10).fill(-1) });
  if (b.at[i] !== sec) { b.at[i] = sec; b.v[i] = 0; }
  b.v[i] += d;
}
function dpsOf(src) {
  const b = G.stats.sec[src], sec = Math.floor(G.t);
  if (!b) return 0;
  let sum = 0;
  for (let i = 0; i < 10; i++) if (b.at[i] > sec - 10) sum += b.v[i];
  return sum / Math.min(10, Math.max(1, G.t));
}
const srcName = src => (src === 'pet' ? PETS[SAVE.pet].name : WEAPONS[src].name);
const srcColor = src => (src === 'pet' ? '#fff3a0' : WEAPONS[src].color);
// Строки таблицы урона: оружие в бою (даже с нулём) и питомец, по убыванию
function dmgRows(mode) {
  const srcs = new Set([...Object.keys(G.weapons), ...Object.keys(G.stats.total)]);
  const rows = [...srcs].map(src => ({ src, v: mode === 'dps' ? dpsOf(src) : G.stats.total[src] || 0 }));
  return rows.sort((a, b) => b.v - a.v);
}
const fmtNum = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));

function killEnemy(e) {
  e.dead = true;
  G.kills++;
  questAdd('kills');
  if (e.elite) { questAdd('elites'); if (canGetWeapon()) G.pendingWeapons++; }
  if (e.boss) questAdd('bosses');
  burst(e.x, e.y, e.color, e.boss ? 30 : 5);
  G.gems.push({ x: e.x, y: e.y, xp: e.xp, kind: 'xp' });
  if (e.boss || Math.random() < (G.mode === 'camp' ? ECON.coinChance : ECON.endlessCoinChance)) {
    const v = G.mode === 'camp' ? ECON.campCoin(G.level) * DIFFS[G.diff].gold : ECON.endlessCoin(G.t, SAVE.unlocked);
    G.gems.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), xp: v * (e.boss ? 10 : 1), kind: 'gold' });
  }
  if (e.boss || Math.random() < 0.006) {
    G.gems.push({ x: e.x + 10, y: e.y, xp: 0, kind: 'heart' });
  }
  if (G.mode === 'camp') {
    if (e === G.camp.boss) winLevel();
  }
}

function shoot(x, y, ang, speed, dmg, pierce, color, r, src) {
  G.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, pierce, color, r, src, life: 1.6, hit: new Set(), dead: false });
}

function shootEnemy(x, y, ang, speed, dmg) {
  G.ebullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, r: 5, life: 4, dead: false });
}

function nearestEnemies(n, range, from = G.hero) {
  const list = [];
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
    if (d < range * range) list.push([d, e]);
  }
  list.sort((a, b) => a[0] - b[0]);
  return list.slice(0, n).map(p => p[1]);
}

// Характеристики оружия в бою: улучшения забега + медальоны + герой (стартовый бонус эволюции и активка)
const activeOn = id => G.active.t > 0 && id === heroWeapon();
function wStats(id) {
  const s = WEAPONS[id].stats(G.weapons[id]), ev = G.evo, on = activeOn(id);
  const start = id === heroWeapon() ? ev.start : 0;
  if (id === 'wand') { s.volley += 0.25 * medalLvl('wandDouble'); s.count += start; if (on) { s.cd *= 0.5; s.count += ev.extra; } }
  if (id === 'orbit') { s.count += medalLvl('bladeExtra') + start; if (on) s.count += ev.extra; }
  if (id === 'aura') { s.radius += 12 * start; if (on) s.radius = s.radius * 1.5 + 12 * ev.extra; }
  if (id === 'nova') { s.volley += 0.25 * medalLvl('novaDouble'); s.count += 3 * start; if (on) { s.cd *= 0.33; s.count += 3 * ev.extra; } }
  return s;
}
// Урон оружия: мета-уровень, пассивки героев и активка
const weaponDmg = (id, base) => metaDmg(id, base) * (G.heroBonus[id] || 1) * (activeOn(id) ? 1 + G.evo.act / 100 : 1);

// Активка героя: усиливает его оружие на несколько секунд
function useActive() {
  const a = G.active, ev = G.evo, h = G.hero;
  if (G.state !== 'play' || a.cd > 0) return;
  a.t = ev.dur;
  a.cd = ev.cd;
  questAdd('actives');
  if (SAVE.hero === 'eliana') h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.15);
  addBanner(HEROES[SAVE.hero].active.toUpperCase() + '!', '', WEAPONS[heroWeapon()].color);
}

function updateWeapons(dt) {
  const h = G.hero, w = G.weapons, T = G.timers;
  const a = G.active;
  if (a.t > 0) a.t = Math.max(0, a.t - dt);
  else if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);

  if (w.wand) {
    const s = wStats('wand'), dmg = weaponDmg('wand', s.dmg);
    T.wand = (T.wand || 0) - dt;
    if (T.wand <= 0) {
      const tg = nearestEnemies(s.count, 380);
      if (tg.length) {
        T.wand = s.cd * h.cdMul;
        const volleys = Math.random() < s.volley ? 2 : 1;
        for (let v = 0; v < volleys; v++) {
          for (let i = 0; i < s.count; i++) {
            const e = tg[i % tg.length];
            const a = Math.atan2(e.y - h.y, e.x - h.x) + (i >= tg.length ? rand(-0.25, 0.25) : 0) + v * 0.15;
            shoot(h.x, h.y, a, 330, dmg, s.pierce, WEAPONS.wand.color, 4, 'wand');
          }
        }
      }
    }
  }

  if (w.orbit) {
    const s = wStats('orbit'), n = s.count, dmg = weaponDmg('orbit', s.dmg);
    G.orbAng += s.spin * dt;
    for (let i = 0; i < n; i++) {
      const a = G.orbAng + (i / n) * TAU;
      const bx = h.x + Math.cos(a) * s.radius, by = h.y + Math.sin(a) * s.radius;
      for (const e of query(bx, by, 9 + MAX_ER, near)) {
        if (e.dead || e.orbCd > G.t) continue;
        const dx = e.x - bx, dy = e.y - by;
        if (dx * dx + dy * dy < (e.r + 9) ** 2) {
          const d = Math.hypot(e.x - h.x, e.y - h.y) || 1;
          e.orbCd = G.t + 0.35;
          hurt(e, dmg, (e.x - h.x) / d * s.push, (e.y - h.y) / d * s.push, 'orbit');
        }
      }
    }
  }

  if (w.aura) {
    const s = wStats('aura');
    T.aura = (T.aura || 0) - dt;
    if (T.aura <= 0) {
      T.aura = s.tick * h.cdMul;
      const dmg = weaponDmg('aura', s.dmg);
      for (const e of query(h.x, h.y, s.radius + MAX_ER, near)) {
        if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < (s.radius + e.r) ** 2) {
          if (s.slow) { e.slowK = s.slow; e.slowT = G.t + 0.6; }
          hurt(e, dmg, 0, 0, 'aura');
        }
      }
    }
  }

  if (w.nova) {
    const s = wStats('nova');
    T.nova = (T.nova || 0) - dt;
    if (T.nova <= 0) {
      T.nova = s.cd * h.cdMul;
      const off = rand(0, TAU), dmg = weaponDmg('nova', s.dmg);
      const rings = Math.random() < s.volley ? 2 : 1;
      for (let v = 0; v < rings; v++) {
        for (let i = 0; i < s.count; i++) shoot(h.x, h.y, off + (i + v * 0.5) / s.count * TAU, 220, dmg, 1, WEAPONS.nova.color, 5, 'nova');
      }
    }
  }
}

// Питомец летает за героем; светлячок ещё и стреляет
function updatePet(dt) {
  if (SAVE.pet === 'none') return;
  const p = G.pet, h = G.hero;
  const k = Math.min(1, 6 * dt);
  p.x += (h.x - 18 * h.face - p.x) * k;
  p.y += (h.y - 14 - p.y) * k;
  if (SAVE.pet === 'firefly') {
    p.cd -= dt;
    if (p.cd <= 0) {
      const tg = nearestEnemies(1, 260, p)[0];
      if (tg) {
        p.cd = 1.3;
        shoot(p.x, p.y, Math.atan2(tg.y - p.y, tg.x - p.x), 300, metaDmg(heroWeapon(), 6), 1, '#fff3a0', 3, 'pet');
      }
    }
  }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    for (const e of query(b.x, b.y, b.r + MAX_ER, near)) {
      if (e.dead || b.hit.has(e)) continue;
      if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + b.r) ** 2) {
        b.hit.add(e);
        const sp = Math.hypot(b.vx, b.vy);
        hurt(e, b.dmg, b.vx / sp * 90, b.vy / sp * 90, b.src);
        if (--b.pierce <= 0) { b.dead = true; break; }
      }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);
}

function updateEnemyBullets(dt) {
  const h = G.hero;
  for (const b of G.ebullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) b.dead = true;
    else if (h.inv <= 0 && (b.x - h.x) ** 2 + (b.y - h.y) ** 2 < (b.r + h.r) ** 2) {
      b.dead = true;
      damageHero(b.dmg);
      if (G.state !== 'play') return;
    }
  }
  G.ebullets = G.ebullets.filter(b => !b.dead);
}

// Поведение боссов. Голем: идёт, целится и делает рывок. Лич: держит дистанцию,
// стреляет кольцом снарядов и призывает мобов.
function updateBoss(e, dt, dx, dy, d) {
  const ai = e.ai;
  ai.t -= dt;
  if (e.boss !== 'lich') {
    // Босс локации (hybrid) ходит как голем, но ещё стреляет кольцами и зовёт свиту
    if (e.boss === 'hybrid') bossCast(e, dt, 3.6, 11);
    if (ai.phase === 'walk') {
      e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt;
      if (ai.t <= 0 && d < 320) { ai.phase = 'aim'; ai.t = 0.7; ai.dx = dx / d; ai.dy = dy / d; }
    } else if (ai.phase === 'aim') {
      if (ai.t <= 0) { ai.phase = 'dash'; ai.t = 0.7; }
    } else {
      e.x += ai.dx * e.speed * 5.5 * dt; e.y += ai.dy * e.speed * 5.5 * dt;
      if (ai.t <= 0) { ai.phase = 'walk'; ai.t = 3.5; }
    }
    return;
  }
  const dir = d > 170 ? 1 : d < 120 ? -1 : 0;
  e.x += (dx / d * dir - dy / d * 0.5) * e.speed * dt;
  e.y += (dy / d * dir + dx / d * 0.5) * e.speed * dt;
  bossCast(e, dt, 2.6, 9);
}

// Кольцо снарядов раз в ringCd секунд и четыре моба свиты раз в summonCd
function bossCast(e, dt, ringCd, summonCd) {
  const ai = e.ai;
  ai.ring -= dt;
  if (ai.ring <= 0) {
    ai.ring = ringCd;
    const off = rand(0, TAU);
    for (let i = 0; i < 12; i++) shootEnemy(e.x, e.y, off + i / 12 * TAU, 120, Math.round(e.dmg * 0.6));
  }
  ai.summon -= dt;
  if (ai.summon <= 0) {
    ai.summon = summonCd;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      makeMob(pickTier(curShift()), e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30);
    }
  }
}

function updateEnemies(dt) {
  const h = G.hero, far = spawnRadius() + 300;
  for (const e of G.enemies) {
    const dx = h.x - e.x, dy = h.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // Отставшие враги телепортируются обратно на кольцо спавна
    if (d > far) {
      const a = rand(0, TAU), R = spawnRadius();
      e.x = h.x + Math.cos(a) * R; e.y = h.y + Math.sin(a) * R;
      continue;
    }
    if (e.boss) updateBoss(e, dt, dx, dy, d);
    else if (e.shoot) {
      // Стрелок держит дистанцию, обходит героя по кругу и стреляет
      const dir = d > 190 ? 1 : d < 140 ? -1 : 0;
      e.x += (dx / d * dir - dy / d * 0.4) * e.speed * dt;
      e.y += (dy / d * dir + dx / d * 0.4) * e.speed * dt;
      e.shoot -= dt;
      if (e.shoot <= 0) {
        e.shoot = ECON.shooterCd;
        if (d < 320) shootEnemy(e.x, e.y, Math.atan2(dy, dx), 130, Math.max(1, Math.round(e.dmg * 0.7)));
      }
    } else {
      const sp = e.speed * (e.slowT > G.t ? 1 - e.slowK : 1);
      e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
    }
    e.x += e.kx * dt; e.y += e.ky * dt;
    const damp = Math.min(1, 10 * dt);
    e.kx -= e.kx * damp; e.ky -= e.ky * damp;
    if (e.flash > 0) e.flash -= dt;
  }
  // Расталкивание, чтобы толпа не схлопывалась в одну точку
  for (const e of G.enemies) {
    for (const o of query(e.x, e.y, e.r + MAX_ER, near)) {
      if (o === e) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      const min = e.r + o.r, d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2), push = (min - d) * (e.boss ? 0.02 : 0.25);
        e.x += dx / d * push; e.y += dy / d * push;
      }
    }
  }
}

function damageHero(dmg) {
  const h = G.hero;
  h.hp -= dmg;
  h.inv = 0.45;
  G.shake = 6;
  if (S.vibrate && navigator.vibrate) navigator.vibrate(30);
  addText(h.x, h.y - 16, '-' + dmg, '#ff5d73', 0.8, 11);
  if (h.hp > 0) return;
  if (h.revive && !G.revived) {
    // Перк «Второй шанс»: воскрешение и отброс всех врагов рядом
    G.revived = true;
    h.hp = h.maxHp * 0.5;
    h.inv = 2;
    G.ebullets.length = 0;
    for (const e of G.enemies) {
      const ex = e.x - h.x, ey = e.y - h.y, d = Math.hypot(ex, ey) || 1;
      if (d < 180) { e.kx += ex / d * 700; e.ky += ey / d * 700; }
    }
    addBanner('ВТОРОЙ ШАНС', '', '#80ffdb');
    return;
  }
  h.hp = 0;
  finishRun('dead');
}

function updateHero(dt) {
  const h = G.hero, v = inputVector();
  h.x += v.x * h.speed * dt;
  h.y += v.y * h.speed * dt;
  if (Math.abs(v.x) > 0.1) h.face = Math.sign(v.x);
  h.walk = v.x || v.y ? h.walk + dt : 0;
  h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);
  if (h.inv > 0) h.inv -= dt;
  if (G.camp && G.camp.won != null) return; // после победы урон не проходит

  for (const e of query(h.x, h.y, h.r + MAX_ER, near)) {
    if (e.dead || h.inv > 0) continue;
    if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < (e.r + h.r) ** 2) {
      damageHero(e.dmg);
      if (G.state !== 'play') return;
      if (e.boss) {
        // Босс отбрасывает героя и прерывает рывок, иначе он «залипает» и бьёт без остановки
        const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
        h.x = e.x + dx / d * (e.r + h.r + 30); h.y = e.y + dy / d * (e.r + h.r + 30);
        e.ai.phase = 'walk'; e.ai.t = 2.5;
        h.inv = 0.8;
      }
    }
  }
}

function updateGems(dt) {
  const h = G.hero;
  for (const g of G.gems) {
    const dx = h.x - g.x, dy = h.y - g.y, d = Math.hypot(dx, dy) || 1;
    if (d < h.magnet) g.pulled = true;
    if (g.pulled) {
      const sp = Math.max(260, h.speed * 2.5);
      g.x += dx / d * sp * dt; g.y += dy / d * sp * dt;
    }
    if (d < h.r + 6) {
      g.dead = true;
      if (g.kind === 'heart') {
        const heal = Math.round(h.maxHp * 0.3);
        h.hp = Math.min(h.maxHp, h.hp + heal);
        addText(h.x, h.y - 16, '+' + heal, '#57e389', 0.9, 11);
      } else if (g.kind === 'gold') {
        G.gold += g.xp * h.goldMul;
      } else {
        gainXp(g.xp);
      }
    }
  }
  G.gems = G.gems.filter(g => !g.dead);
}

function gainXp(n) {
  const h = G.hero;
  h.xp += n * h.xpMul * (G.mode === 'camp' ? ECON.campXp : 1);
  while (h.xp >= h.xpNext) {
    h.xp -= h.xpNext;
    h.level++;
    h.xpNext = Math.round(5 + (h.level - 1) * 6 + Math.pow(h.level - 1, 1.6));
    G.pendingLevels++;
  }
}

// ------------------------------------------------------------
//  Прокачка внутри забега
// ------------------------------------------------------------

const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Новый уровень: 3 улучшения взятого оружия (разные) и 1 характеристика героя
function rollChoices() {
  const ups = [], stats = [];
  for (const id in G.weapons) {
    for (const k in WEAPONS[id].ups) if (G.weapons[id][k] < WEAPONS[id].ups[k].max) ups.push({ kind: 'u', id, up: k });
  }
  for (const id in PASSIVES) {
    const l = G.passives[id] || 0;
    if (l < PASSIVES[id].max) stats.push({ kind: 'p', id, lvl: l + 1 });
  }
  const res = shuffle(ups).slice(0, 3).concat(shuffle(stats).slice(0, 1));
  if (!res.length) res.push({ kind: 'f', id: 'food' });
  return res;
}

// Промежуточный моб убит: 3 оружия из набора на бой
const rollWeapons = () => shuffle(runWeaponsLeft()).slice(0, 3).map(id => ({ kind: 'w', id }));

function choiceView(c) {
  if (c.kind === 'u') {
    const W = WEAPONS[c.id], U = W.ups[c.up];
    return { name: `${W.name}: ${U.name}`, color: W.color, tag: `${G.weapons[c.id][c.up] + 1}/${U.max}`, info: U.info, icon: c.id };
  }
  if (c.kind === 'w') {
    const W = WEAPONS[c.id];
    return { name: W.name, color: W.color, tag: 'НОВОЕ', info: W.info, icon: c.id };
  }
  if (c.kind === 'p') {
    const d = PASSIVES[c.id];
    return { name: d.name, color: d.color, tag: 'Ур. ' + c.lvl, info: d.info };
  }
  return { name: 'Еда', color: '#57e389', tag: '', info: 'Восстановить 50% HP' };
}

function applyChoice(c) {
  const h = G.hero;
  if (c.kind === 'u') G.weapons[c.id][c.up]++;
  else if (c.kind === 'w') G.weapons[c.id] = newUps(c.id);
  else if (c.kind === 'p') { G.passives[c.id] = c.lvl; PASSIVES[c.id].apply(h); }
  else h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.5);
}

function pickChoice(c) {
  applyChoice(c);
  closeChoices();
}
function closeChoices() {
  if (G.state === 'weaponpick') G.pendingWeapons--;
  else G.pendingLevels--;
  G.choices = null;
  setState('play');
}
// «Взять все» на новом уровне (за рекламу)
function pickAll() {
  for (const c of G.choices) applyChoice(c);
  closeChoices();
}
// «Новый набор»: первый раз за бой бесплатно, дальше за рекламу
function rerollChoices(free) {
  const k = G.state === 'weaponpick' ? 'weapon' : 'up';
  if (free) G.rerolls[k]++;
  G.choices = k === 'weapon' ? rollWeapons() : rollChoices();
  G.stateAt = performance.now();
}

// ------------------------------------------------------------
//  Главный цикл
// ------------------------------------------------------------

function update(dt) {
  for (const p of G.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  G.particles = G.particles.filter(p => p.life > 0);
  for (const t of G.texts) { t.y -= 22 * dt; t.life -= dt; }
  G.texts = G.texts.filter(t => t.life > 0);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 30 * dt);
  if (G.intro > 0) G.intro = Math.max(0, G.intro - dt);
  if (G.state === 'menu') { G.orbAng += 2.8 * dt; updateLaunch(dt); }

  if (G.state !== 'play') return;

  G.t += dt;
  if (G.banners.length && (G.banners[0].life -= dt) <= 0) G.banners.shift();
  const c = G.camp;
  if (c && c.won != null) {
    if (G.t - c.won > 1.2) { finishRun('win'); return; }
  } else {
    if (c) updateCampaign();
    updateSpawns(dt);
  }
  buildGrid();
  updateHero(dt);
  if (G.state !== 'play') return;
  updateEnemies(dt);
  buildGrid();
  updateWeapons(dt);
  updatePet(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  if (G.state !== 'play') return;
  if (G.camp) { updateHazards(dt); if (G.state !== 'play') return; }
  G.enemies = G.enemies.filter(e => !e.dead);
  updateGems(dt);

  const h = G.hero;
  if (G.hatch && Math.hypot(G.hatch.x - h.x, G.hatch.y - h.y) < 18) { finishRun('escape'); return; }

  if (G.pendingWeapons > 0) {
    G.choices = rollWeapons();
    if (!G.choices.length) { G.pendingWeapons = 0; return; }
    setState('weaponpick');
    joy = null;
  } else if (G.pendingLevels > 0) {
    G.choices = rollChoices();
    setState('levelup');
    joy = null;
  }
}

// ------------------------------------------------------------
//  Отрисовка: герой, питомец, враги
// ------------------------------------------------------------

const HERO_BODY = [
  '..0000..',
  '.011110.',
  '.012120.',
  '.011110.',
  '..0330..',
  '.033330.',
  '01333310',
  '..3333..',
];
const HERO_LEGS = [
  ['..4..4..', '..0..0..'],
  ['.4....4.', '.0....0.'],
];
// 1 и 3 подменяются скином; 5–8 — цвета головных уборов
const HERO_PAL = { 0: '#14141c', 1: '#f2c9a0', 2: '#14141c', 3: '#3e8ef7', 4: '#5a3d26', 5: '#7a5230', 6: '#2f5a3a', 7: '#e8e0d0', 8: '#ffd166' };
const PX = 2.4;

// Пиксельный герой с центром в (x, y); px — размер пикселя
function drawHeroSprite(x, y, px, face, legs, hero, outfit) {
  const pal = { ...HERO_PAL, ...HEROES[hero].pal };
  const hat = OUTFITS[outfit].rows;
  const rows = hat.concat(HERO_BODY, HERO_LEGS[legs]);
  const ox = x - 4 * px, oy = y - (HERO_BODY.length + 2) * px / 2 - 2 - hat.length * px;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = rows[r][face < 0 ? 7 - c : c];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(ox + c * px, oy + r * px, px + 0.05, px + 0.05);
    }
  }
}

function drawHero(h) {
  if (h.inv > 0 && Math.floor(h.inv * 20) % 2) return;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(h.x, h.y + 12, 8, 3, 0, 0, TAU); ctx.fill();
  drawHeroSprite(h.x, h.y, PX, h.face, h.walk > 0 ? Math.floor(h.walk * 8) % 2 : 0, SAVE.hero, SAVE.outfit);
}

function drawPetSprite(kind, x, y, s = 1) {
  if (kind === 'owl') {
    ctx.fillStyle = '#8a6a48';
    ctx.beginPath(); ctx.arc(x, y, 5.5 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 3 * s); ctx.lineTo(x - 4 * s, y - 8 * s); ctx.lineTo(x - 1.5 * s, y - 4.5 * s); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 5 * s, y - 3 * s); ctx.lineTo(x + 4 * s, y - 8 * s); ctx.lineTo(x + 1.5 * s, y - 4.5 * s); ctx.fill();
    ctx.fillStyle = '#f2e6c8';
    ctx.beginPath(); ctx.arc(x - 2.2 * s, y - 1 * s, 2 * s, 0, TAU); ctx.arc(x + 2.2 * s, y - 1 * s, 2 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#14141c';
    ctx.fillRect(x - 2.7 * s, y - 1.5 * s, 1.1 * s, 1.1 * s); ctx.fillRect(x + 1.7 * s, y - 1.5 * s, 1.1 * s, 1.1 * s);
  } else if (kind === 'firefly') {
    const p = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    ctx.fillStyle = `rgba(255,243,160,${0.18 * p})`;
    ctx.beginPath(); ctx.arc(x, y, 9 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3a0';
    ctx.beginPath(); ctx.arc(x, y, 3 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(200,220,255,0.6)';
    ctx.beginPath(); ctx.ellipse(x - 3 * s, y - 3 * s, 2.5 * s, 1.4 * s, -0.6, 0, TAU); ctx.ellipse(x + 3 * s, y - 3 * s, 2.5 * s, 1.4 * s, 0.6, 0, TAU); ctx.fill();
  }
}

function polygon(x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function drawEyes(e, color = 'rgba(0,0,0,0.4)') {
  const r = e.r;
  ctx.fillStyle = color;
  ctx.fillRect(e.x - r * 0.5, e.y - r * 0.3, r * 0.3, r * 0.3);
  ctx.fillRect(e.x + r * 0.2, e.y - r * 0.3, r * 0.3, r * 0.3);
}

function drawBoss(e) {
  const r = e.r, flash = e.flash > 0;
  if (e.boss !== 'lich') {
    // Линия-предупреждение перед рывком
    if (e.ai.phase === 'aim') {
      ctx.strokeStyle = 'rgba(255,93,115,0.5)';
      ctx.lineWidth = r * 1.2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.ai.dx * 150, e.y + e.ai.dy * 150); ctx.stroke();
    }
    ctx.fillStyle = flash ? '#fff' : e.color;
    roundRect(e.x - r, e.y - r, r * 2, r * 2, 6); ctx.fill();
    ctx.fillStyle = '#7d705f';
    ctx.fillRect(e.x - r * 0.7, e.y + r * 0.1, r * 0.5, r * 0.12);
    ctx.fillRect(e.x + r * 0.1, e.y + r * 0.45, r * 0.6, r * 0.12);
    ctx.fillStyle = e.ai.phase === 'walk' ? '#ff9f1c' : '#ff3b3b';
    ctx.fillRect(e.x - r * 0.5, e.y - r * 0.4, r * 0.3, r * 0.22);
    ctx.fillRect(e.x + r * 0.2, e.y - r * 0.4, r * 0.3, r * 0.22);
    if (e.boss === 'hybrid') {
      // Корона босса локации
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(e.x - r * 0.6, e.y - r - 4, r * 1.2, 5);
      for (let i = -1; i <= 1; i++) ctx.fillRect(e.x + i * r * 0.45 - 3, e.y - r - 12, 6, 9);
    }
    if (e.armor) armorRing(e);
    return;
  }
  const bob = Math.sin(G.t * 3) * 2;
  ctx.fillStyle = flash ? '#fff' : '#3c2a5a';
  ctx.beginPath(); ctx.moveTo(e.x, e.y - r + bob); ctx.lineTo(e.x + r, e.y + r + bob); ctx.lineTo(e.x - r, e.y + r + bob); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : e.color;
  ctx.beginPath(); ctx.arc(e.x, e.y - r * 0.35 + bob, r * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(e.x - r * 0.45, e.y - r * 1.05 + bob, r * 0.9, r * 0.18);
  for (let i = -1; i <= 1; i++) ctx.fillRect(e.x + i * r * 0.32 - r * 0.07, e.y - r * 1.3 + bob, r * 0.14, r * 0.3);
  ctx.fillStyle = '#80ffdb';
  ctx.fillRect(e.x - r * 0.3, e.y - r * 0.45 + bob, r * 0.18, r * 0.14);
  ctx.fillRect(e.x + r * 0.12, e.y - r * 0.45 + bob, r * 0.18, r * 0.14);
  if (e.armor) armorRing(e);
}

// Серое кольцо вокруг бронированного врага
function armorRing(e) {
  ctx.strokeStyle = 'rgba(184,192,204,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, TAU); ctx.stroke();
}

function drawEnemy(e) {
  if (e.boss) { drawBoss(e); return; }
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
  const r = e.r;
  if (e.shape === 'sq') {
    ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
    drawEyes(e);
  } else if (e.shape === 'tri') {
    const a = Math.atan2(G.hero.y - e.y, G.hero.x - e.x);
    polygon(e.x, e.y, r * 1.3, 3, a); ctx.fill();
  } else if (e.shape === 'dia') {
    polygon(e.x, e.y, r * 1.25, 4, 0); ctx.fill();
    drawEyes(e);
  } else if (e.shape === 'hex') {
    polygon(e.x, e.y, r * 1.1, 6, Math.PI / 6); ctx.fill();
    drawEyes(e);
  } else {
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
    drawEyes(e);
  }
  if (e.armor) armorRing(e);
  if (e.shoot) {
    // Стрелок: светлая метка-прицел в центре
    ctx.fillStyle = '#f0d8ff';
    ctx.beginPath(); ctx.arc(e.x, e.y + r * 0.35, Math.max(2, r * 0.25), 0, TAU); ctx.fill();
  }
  if (e.elite) {
    // Промежуточный моб: маленькая корона
    ctx.fillStyle = '#7df9ff';
    ctx.fillRect(e.x - r * 0.5, e.y - r - 12, r, 4);
    for (let i = -1; i <= 1; i++) ctx.fillRect(e.x + i * r * 0.4 - 2, e.y - r - 17, 4, 6);
  }
  if (e.arch === 'tank' || e.arch === 'brute' || e.elite) {
    const w = r * 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x - r, e.y - r - 7, w, 3);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(e.x - r, e.y - r - 7, w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
}

// ------------------------------------------------------------
//  Декор пола: детерминированный по клеткам, без картинок.
//  r(i) — псевдослучайное число 0..1, всегда одинаковое для клетки и i.
// ------------------------------------------------------------

const DECOR_STEP = 64;

function hash2(x, y, s) {
  let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

function blob(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

function stone(x, y, s, base, light) {
  blob(x + 1, y + s * 0.5, s * 1.1, s * 0.45, 'rgba(0,0,0,0.3)');
  blob(x, y, s, s * 0.7, base);
  blob(x - s * 0.3, y - s * 0.25, s * 0.45, s * 0.3, light);
}

// Ломаная трещина из точки (x, y)
function crackPath(x, y, r, seed) {
  let a = r(seed) * TAU;
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 0; i < 4; i++) {
    a += (r(seed + 1 + i) - 0.5) * 1.6;
    x += Math.cos(a) * (8 + r(seed + 5 + i) * 8);
    y += Math.sin(a) * (8 + r(seed + 5 + i) * 8);
    ctx.lineTo(x, y);
  }
}

const DECOR = {
  grass(px, py, r, now, P) {
    const S = DECOR_STEP;
    // Пятна травы чуть светлее/темнее фона
    if (r(1) < 0.3) blob(px + r(2) * S, py + r(3) * S, 18 + r(4) * 26, 10 + r(5) * 14, P.patch[r(6) < 0.5 ? 0 : 1]);
    // Пучки травы
    const n = Math.floor(r(7) * 4);
    ctx.strokeStyle = P.tuft; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const gx = px + r(10 + i) * S, gy = py + r(20 + i) * S;
      ctx.moveTo(gx, gy); ctx.lineTo(gx - 2.5, gy - 5);
      ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 6.5);
      ctx.moveTo(gx, gy); ctx.lineTo(gx + 2.5, gy - 5);
    }
    ctx.stroke();
    if (r(30) < 0.1) stone(px + r(31) * S, py + r(32) * S, 3 + r(33) * 4, P.stone[0], P.stone[1]);
    // Куст
    if (r(40) < 0.07) {
      const bx = px + r(41) * S, by = py + r(42) * S;
      blob(bx, by + 6, 14, 4, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = P.bush[0];
      ctx.beginPath(); ctx.arc(bx - 6, by, 7, 0, TAU); ctx.arc(bx + 6, by, 7, 0, TAU); ctx.arc(bx, by - 5, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = P.bush[1];
      ctx.beginPath(); ctx.arc(bx - 7, by - 2, 3.5, 0, TAU); ctx.arc(bx - 1, by - 8, 4, 0, TAU); ctx.fill();
    }
    // Цветы
    if (r(50) < 0.1) {
      ctx.fillStyle = P.flowers[Math.floor(r(51) * 3)];
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px + r(52 + i) * S, py + r(56 + i) * S, 1.4, 0, TAU); ctx.fill(); }
    }
  },

  crypt(px, py, r, now, P) {
    const S = DECOR_STEP, T = S / 2;
    // Плиты пола 2×2 на клетку, щели — цвет фона
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = P.tiles[Math.floor(r(1 + i) * 3)];
      ctx.fillRect(px + (i % 2) * T + 1, py + (i >> 1) * T + 1, T - 2, T - 2);
    }
    if (r(10) < 0.2) {
      ctx.strokeStyle = P.crack; ctx.lineWidth = 1.2;
      crackPath(px + r(11) * S, py + r(12) * S, r, 13); ctx.stroke();
    }
    // Обломки
    if (r(30) < 0.15) for (let i = 0; i < 3; i++) blob(px + r(31 + i) * S, py + r(35 + i) * S, 1.5 + r(39 + i) * 2, 1.2 + r(39 + i) * 1.5, P.debris);
    // Кость
    if (r(50) < 0.06) {
      const bx = px + r(51) * S, by = py + r(52) * S, a = r(53) * TAU, dx = Math.cos(a) * 6, dy = Math.sin(a) * 6;
      ctx.strokeStyle = P.bone; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(bx - dx, by - dy); ctx.lineTo(bx + dx, by + dy); ctx.stroke();
      ctx.fillStyle = P.bone;
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(bx + dx * k, by + dy * k, 2, 0, TAU); ctx.fill(); }
    }
    // Череп
    if (r(60) < 0.025) {
      const sx = px + r(61) * S, sy = py + r(62) * S;
      ctx.fillStyle = P.skull;
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, TAU); ctx.fill();
      ctx.fillRect(sx - 3, sy + 3, 6, 3.5);
      ctx.fillStyle = P.crack;
      ctx.fillRect(sx - 3, sy - 1, 2, 2); ctx.fillRect(sx + 1, sy - 1, 2, 2);
    }
  },

  lava(px, py, r, now) {
    const S = DECOR_STEP;
    if (r(1) < 0.3) blob(px + r(2) * S, py + r(3) * S, 16 + r(4) * 24, 9 + r(5) * 12, '#1c0f0b');
    if (r(6) < 0.25) {
      ctx.strokeStyle = '#0a0504'; ctx.lineWidth = 1.4;
      crackPath(px + r(7) * S, py + r(8) * S, r, 9); ctx.stroke();
    }
    // Лавовая трещина — пульсирует
    if (r(20) < 0.12) {
      const glow = 0.6 + 0.4 * Math.sin(now * 2 + r(21) * 6);
      crackPath(px + r(22) * S, py + r(23) * S, r, 24);
      ctx.globalAlpha = 0.18 * glow; ctx.strokeStyle = '#ff5a14'; ctx.lineWidth = 6; ctx.stroke();
      ctx.globalAlpha = 0.5 + 0.4 * glow; ctx.strokeStyle = '#b8400f'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Лавовое озерцо
    if (r(40) < 0.035) {
      const lx = px + r(41) * S, ly = py + r(42) * S, rx = 12 + r(43) * 12;
      const glow = 0.5 + 0.5 * Math.sin(now * 1.5 + r(44) * 6);
      blob(lx, ly, rx + 4, rx * 0.6 + 3, '#2a110a');
      blob(lx, ly, rx, rx * 0.6, '#6e1f09');
      ctx.globalAlpha = 0.6 + 0.4 * glow;
      blob(lx, ly, rx * 0.65, rx * 0.35, '#b8400f');
      ctx.globalAlpha = 1;
      blob(lx - rx * 0.3, ly - 1, rx * 0.2, rx * 0.12, '#2a110a');
    }
    if (r(50) < 0.1) stone(px + r(51) * S, py + r(52) * S, 3 + r(53) * 5, '#25140f', '#331c15');
    // Угольки мерцают
    if (r(60) < 0.2) {
      ctx.fillStyle = '#ff7a2f';
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = 0.15 + 0.45 * Math.abs(Math.sin(now * 3 + r(61 + i) * 10));
        ctx.fillRect(px + r(63 + i) * S, py + r(65 + i) * S, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
  },
};

function drawDecor(h, vw, vh) {
  const draw = DECOR[arena().decor], P = arena().pal, st = DECOR_STEP, now = performance.now() / 1000;
  // +1 клетка с каждой стороны: крупный декор вылезает за границы своей клетки
  const x0 = Math.floor((h.x - vw) / st) - 1, x1 = Math.floor((h.x + vw) / st) + 1;
  const y0 = Math.floor((h.y - vh) / st) - 1, y1 = Math.floor((h.y + vh) / st) + 1;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      draw(cx * st, cy * st, i => hash2(cx, cy, i), now, P);
    }
  }
}

// ------------------------------------------------------------
//  Убежище: лагерь в подвале вокруг героя (он стоит в точке 0, 0)
// ------------------------------------------------------------

function glow(x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function flame(x, y, s, now, seed) {
  const f = 1 + 0.18 * Math.sin(now * 13 + seed) + 0.1 * Math.sin(now * 23 + seed * 2);
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.lineTo(x, y - 14 * s * f); ctx.lineTo(x + 5 * s, y); ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.moveTo(x - 2.6 * s, y); ctx.lineTo(x + 0.5 * s, y - 8 * s * f); ctx.lineTo(x + 2.6 * s, y); ctx.fill();
}

function drawShelter(vw, vh) {
  const now = performance.now() / 1000, X0 = -vw, X1 = vw, Y0 = -vh, Y1 = vh, wallY = -62;
  // Каменная стена
  ctx.fillStyle = '#1d1712';
  ctx.fillRect(X0, Y0, X1 - X0, wallY - Y0);
  ctx.strokeStyle = '#120d0a'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0, y = wallY; y > Y0; k++, y -= 14) {
    ctx.moveTo(X0, y); ctx.lineTo(X1, y);
    for (let x = Math.floor(X0 / 28) * 28 + (k % 2) * 14; x < X1; x += 28) { ctx.moveTo(x, y); ctx.lineTo(x, y - 14); }
  }
  ctx.stroke();
  // Пол из досок
  ctx.fillStyle = '#2b2018';
  ctx.fillRect(X0, wallY, X1 - X0, Y1 - wallY);
  ctx.strokeStyle = '#1f1711';
  ctx.beginPath();
  for (let k = 0, y = wallY + 11; y < Y1; k++, y += 11) {
    ctx.moveTo(X0, y); ctx.lineTo(X1, y);
    for (let x = Math.floor(X0 / 60) * 60 + (k % 3) * 20; x < X1; x += 60) { ctx.moveTo(x, y); ctx.lineTo(x, y + 11); }
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(X0, wallY, X1 - X0, 7);

  // Знамя на стене
  ctx.fillStyle = '#7a2a32';
  ctx.beginPath(); ctx.moveTo(-14, -128); ctx.lineTo(14, -128); ctx.lineTo(14, -82); ctx.lineTo(0, -90); ctx.lineTo(-14, -82); ctx.fill();
  ctx.fillStyle = '#ffd166';
  polygon(0, -108, 6, 4, 0); ctx.fill();
  ctx.fillStyle = '#4a3018'; ctx.fillRect(-17, -131, 34, 3);

  // Тёплый свет от костра и факелов
  glow(-62, 8, 120, '255,150,60', 0.2 + 0.03 * Math.sin(now * 9));
  for (const tx of [-105, 105]) glow(tx, -88, 46, '255,170,80', 0.22);

  // Факелы
  for (const [tx, s] of [[-105, 1], [105, 2]]) {
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(tx - 1.5, -86, 3, 14);
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(tx - 3.5, -88, 7, 3);
    flame(tx, -88, 0.6, now, s);
  }

  // Ковёр под героем
  ctx.fillStyle = '#4a2028'; roundRect(-34, 2, 68, 22, 3); ctx.fill();
  ctx.strokeStyle = '#7a3a40'; ctx.lineWidth = 1.5; roundRect(-30, 5, 60, 16, 2); ctx.stroke();

  // Палатка
  ctx.fillStyle = '#3d4a32';
  ctx.beginPath(); ctx.moveTo(46, -6); ctx.lineTo(80, -60); ctx.lineTo(114, -6); ctx.fill();
  ctx.fillStyle = '#33402a';
  ctx.beginPath(); ctx.moveTo(80, -60); ctx.lineTo(114, -6); ctx.lineTo(80, -6); ctx.fill();
  ctx.fillStyle = '#15160f';
  ctx.beginPath(); ctx.moveTo(72, -6); ctx.lineTo(80, -30); ctx.lineTo(88, -6); ctx.fill();

  // Стойка с оружием
  ctx.fillStyle = '#4a3018'; ctx.fillRect(-138, -58, 3, 34); ctx.fillRect(-108, -58, 3, 34); ctx.fillRect(-140, -52, 38, 3);
  ctx.fillStyle = '#c8cbd6'; ctx.fillRect(-131, -70, 2.5, 30);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(-120, -66, 2, 26); ctx.beginPath(); ctx.arc(-119, -68, 3, 0, TAU); ctx.fill();

  // Бочка
  blob(-112, 40, 11, 4, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = '#5a3a22'; roundRect(-121, 18, 18, 22, 5); ctx.fill();
  ctx.fillStyle = '#2f2a26'; ctx.fillRect(-121, 23, 18, 2); ctx.fillRect(-121, 33, 18, 2);

  // Ящики
  for (const [bx, by, s] of [[112, 18, 18], [132, 28, 14]]) {
    blob(bx + s / 2, by + s + 1, s * 0.7, 3, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(bx, by, s, s);
    ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 1, by + 1, s - 2, s - 2);
    ctx.beginPath(); ctx.moveTo(bx + 1, by + 1); ctx.lineTo(bx + s - 1, by + s - 1); ctx.stroke();
  }

  // Костёр: камни, поленья, пламя
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    blob(-62 + Math.cos(a) * 10, 18 + Math.sin(a) * 5, 3, 2.2, '#4a4642');
  }
  ctx.fillStyle = '#4a3018';
  ctx.save(); ctx.translate(-62, 16); ctx.rotate(0.35); ctx.fillRect(-9, -1.5, 18, 3); ctx.rotate(-0.7); ctx.fillRect(-9, -1.5, 18, 3); ctx.restore();
  flame(-65, 17, 1, now, 0.5);
  flame(-59, 17, 0.9, now, 2.1);
  flame(-62, 17, 1.2, now, 4.2);
  // Искры
  ctx.fillStyle = '#ffb347';
  for (let i = 0; i < 4; i++) {
    const p = (now * 0.7 + i * 0.25) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.fillRect(-62 + Math.sin(now * 2 + i * 7) * 6, 10 - p * 34, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

// Люк подвала в бесконечном режиме
function drawHatch(x, y) {
  const p = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  ctx.fillStyle = `rgba(255,209,102,${0.12 + 0.12 * p})`;
  ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3d26';
  ctx.fillRect(x - 14, y - 14, 28, 28);
  ctx.fillStyle = '#050608';
  ctx.fillRect(x - 11, y - 11, 22, 22);
  ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 11); ctx.lineTo(x - 6, y + 11); ctx.moveTo(x + 6, y - 11); ctx.lineTo(x + 6, y + 11);
  for (let i = -1; i <= 1; i++) { ctx.moveTo(x - 6, y + i * 7); ctx.lineTo(x + 6, y + i * 7); }
  ctx.stroke();
}

function drawWorld() {
  const h = G.hero, menu = G.state === 'menu';
  const shake = S.shake ? G.shake : 0;
  const sx = shake ? rand(-shake, shake) : 0, sy = shake ? rand(-shake, shake) : 0;
  // В убежище камера стоит на месте (герой может из неё выбежать) и приближена.
  // После старта забега камера плавно отъезжает от приближения к обычному масштабу.
  const L = menu ? menuCamera() : null;
  const cam = menu ? { x: 0, y: 0 } : h;
  const z = SCALE * (menu ? L.zoom : 1 + 0.7 * G.intro * G.intro);
  const ax = menu ? L.x : W / 2, ay = menu ? L.y : H / 2;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (ax - cam.x * z + sx), DPR * (ay - cam.y * z + sy));

  const vw = Math.max(ax, W - ax) / z + 40, vh = Math.max(ay, H - ay) / z + 40;
  const inView = o => Math.abs(o.x - cam.x) < vw && Math.abs(o.y - cam.y) < vh;

  if (menu) drawShelter(vw, vh);
  else { drawDecor(cam, vw, vh); drawHazards(inView); }
  if (G.hatch) drawHatch(G.hatch.x, G.hatch.y);

  if (G.weapons.aura) {
    const s = wStats('aura');
    const pulse = 1 + Math.sin(G.t * 6) * 0.03;
    ctx.fillStyle = 'rgba(255,138,76,0.10)';
    ctx.strokeStyle = 'rgba(255,138,76,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(h.x, h.y, s.radius * pulse, 0, TAU); ctx.fill(); ctx.stroke();
  }

  for (const g of G.gems) {
    if (!inView(g)) continue;
    if (g.kind === 'heart') {
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath(); ctx.arc(g.x - 2.5, g.y - 1, 3.2, 0, TAU); ctx.arc(g.x + 2.5, g.y - 1, 3.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(g.x - 5.6, g.y); ctx.lineTo(g.x + 5.6, g.y); ctx.lineTo(g.x, g.y + 6); ctx.fill();
      continue;
    }
    if (g.kind === 'gold') {
      const s = g.xp >= 5 ? 5.5 : 3.6;
      ctx.fillStyle = '#c99a2e';
      ctx.beginPath(); ctx.arc(g.x, g.y, s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(g.x - 0.5, g.y - 0.5, s * 0.7, 0, TAU); ctx.fill();
      continue;
    }
    const s = g.xp >= 20 ? 6 : g.xp >= 5 ? 4.5 : 3.2;
    ctx.fillStyle = g.xp >= 20 ? '#ff6b6b' : g.xp >= 5 ? '#57e389' : '#4cc9f0';
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.7, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.7, g.y); ctx.fill();
  }

  for (const e of G.enemies) if (inView(e)) drawEnemy(e);

  drawHero(h);
  if (SAVE.pet !== 'none') drawPetSprite(SAVE.pet, G.state === 'menu' ? h.x - 18 : G.pet.x, G.state === 'menu' ? h.y - 14 : G.pet.y);

  if (G.weapons.orbit) {
    const s = wStats('orbit'), n = s.count;
    for (let i = 0; i < n; i++) {
      const a = G.orbAng + (i / n) * TAU;
      const bx = h.x + Math.cos(a) * s.radius, by = h.y + Math.sin(a) * s.radius;
      ctx.fillStyle = 'rgba(125,249,255,0.18)';
      ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#7df9ff'; ctx.fillRect(-8, -2, 16, 4);
      ctx.restore();
    }
  }

  for (const b of G.bullets) {
    if (!inView(b)) continue;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }
  for (const b of G.ebullets) {
    if (!inView(b)) continue;
    ctx.fillStyle = 'rgba(199,125,255,0.35)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0d8ff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1.5, 0, TAU); ctx.fill();
  }

  for (const p of G.particles) {
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // HP-бар под героем
  if (menu) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(h.x - 13, h.y + 16, 26, 4);
  ctx.fillStyle = '#57e389';
  ctx.fillRect(h.x - 12.5, h.y + 16.5, 25 * (h.hp / h.maxHp), 3);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    ctx.globalAlpha = clamp(t.life / t.max * 2, 0, 1);
    ctx.font = `bold ${t.size}px system-ui, sans-serif`;
    ctx.fillStyle = '#000';
    ctx.fillText(t.s, t.x + 0.7, t.y + 0.7);
    ctx.fillStyle = t.color;
    ctx.fillText(t.s, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

// Лужи опасности: сначала проступают (ещё не жгут), в конце гаснут
function drawHazards(inView) {
  if (!G.hazards.length) return;
  const rgb = HAZARDS[arena().hazard].rgb;
  for (const z of G.hazards) {
    if (!inView(z)) continue;
    const armed = z.t > 0.8, fade = clamp((ECON.hazardLife - z.t) / 0.6, 0, 1) * clamp(z.t / 0.8, 0.3, 1);
    const pulse = 1 + Math.sin(G.t * 5 + z.x) * 0.04;
    ctx.fillStyle = `rgba(${rgb},${(armed ? 0.28 : 0.1) * fade})`;
    ctx.strokeStyle = `rgba(${rgb},${0.7 * fade})`;
    ctx.lineWidth = armed ? 2 : 1;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * pulse, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

// ------------------------------------------------------------
//  HUD
// ------------------------------------------------------------

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function drawHud() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = G.hero, c = G.camp;
  const top = 10;

  // Полоса опыта
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, W, top + 8);
  ctx.fillStyle = '#4cc9f0';
  ctx.fillRect(0, top, W * (h.xp / h.xpNext), 8);

  ctx.textBaseline = 'top';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(c ? `Глава ${G.level}` + (G.diff ? ' · ' + DIFFS[G.diff].name : '') : fmtTime(G.t), W / 2, top + 16);
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('Герой ' + h.level, 12, top + 16);
  ctx.fillStyle = '#ffd166';
  ctx.fillText('● ' + Math.floor(G.gold), 12, top + 36);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText('☠ ' + G.kills, W - 12, top + 16);

  // Кнопка паузы — на телефоне иначе в меню не выйти
  const pb = { x: W - 12 - 36, y: top + 38, w: 36, h: 36, act: () => setState('pause') };
  ctx.fillStyle = 'rgba(27,29,38,0.8)';
  roundRect(pb.x, pb.y, pb.w, pb.h, 8); ctx.fill();
  ctx.fillStyle = '#c8cbd6';
  ctx.fillRect(pb.x + 12, pb.y + 10, 4, 16);
  ctx.fillRect(pb.x + 20, pb.y + 10, 4, 16);
  ui.push(pb);
  drawDmgPanel(top + 112);

  // Прогресс уровня кампании с отметками наград на 25% и 50%
  let y = top + 40;
  if (c) {
    const bw = Math.min(W * 0.46, 280), bx = (W - bw) / 2, p = Math.min(1, G.t / c.dur);
    ctx.fillStyle = '#05060a';
    roundRect(bx, y, bw, 10, 5); ctx.fill();
    ctx.fillStyle = c.boss ? '#ff5d73' : '#ffd166';
    roundRect(bx, y, Math.max(10, bw * p), 10, 5); ctx.fill();
    for (const [m, k] of [[0.25, 1], [0.5, 2], [1, 3]]) {
      const mx = bx + bw * m;
      ctx.fillStyle = c.got >= k || (k === 3 && c.won != null) ? '#57e389' : '#c8cbd6';
      ctx.beginPath(); ctx.moveTo(mx, y - 3); ctx.lineTo(mx + 4, y + 5); ctx.lineTo(mx, y + 13); ctx.lineTo(mx - 4, y + 5); ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#c8cbd6';
    ctx.fillText(c.boss ? 'Убей босса!' : `До босса ${fmtTime(Math.max(0, c.dur - G.t))}`, W / 2, y + 16);
    y += 36;
  }

  // Полоса HP босса
  const boss = G.enemies.find(e => e.boss && !e.dead);
  if (boss) {
    const bw = Math.min(W - 140, 380), bx = (W - bw) / 2;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(boss.name, W / 2, y);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(bx, y + 16, bw, 8);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(bx, y + 16, bw * clamp(boss.hp / boss.maxHp, 0, 1), 8);
  }

  // Стрелка к подвалу, если люк за экраном
  if (G.hatch) {
    const dx = (G.hatch.x - h.x) * SCALE, dy = (G.hatch.y - h.y) * SCALE;
    const m = 40, kx = (W / 2 - m) / Math.abs(dx || 1), ky = (H / 2 - m) / Math.abs(dy || 1), k = Math.min(kx, ky);
    if (k < 1) {
      const ax = W / 2 + dx * k, ay = H / 2 + dy * k, a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-4, 0); ctx.lineTo(-8, 10); ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('ВЫХОД', ax - Math.cos(a) * 24, ay - Math.sin(a) * 24);
    }
  }

  // Иконки оружия и пассивок
  const items = [
    ...Object.entries(G.weapons).map(([id, u]) => [WEAPONS[id], 1 + Object.values(u).reduce((a, b) => a + b, 0)]),
    ...Object.entries(G.passives).map(([id, l]) => [PASSIVES[id], l]),
  ];
  const sz = 26;
  items.forEach(([d, l], i) => {
    const x = 12 + i * (sz + 6), y = H - sz - 16 - SAFE_B;
    ctx.fillStyle = '#1b1d26';
    roundRect(x, y, sz, sz, 6); ctx.fill();
    ctx.fillStyle = d.color;
    roundRect(x + 5, y + 5, sz - 10, sz - 10, 3); ctx.fill();
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000'; ctx.fillText(l, x + sz + 1, y + sz + 3);
    ctx.fillStyle = '#fff'; ctx.fillText(l, x + sz, y + sz + 2);
  });

  drawActiveButton();

  // Баннер с объявлением (босс, награда, окружение)
  const b = G.banners[0];
  if (b) {
    ctx.globalAlpha = clamp(b.life * 2, 0, 1) * clamp((2.4 - b.life) * 4, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#000'; ctx.fillText(b.text, W / 2 + 1, H * 0.3 + 1);
    ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, H * 0.3);
    if (b.sub) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillStyle = '#fff'; ctx.fillText(b.sub, W / 2, H * 0.3 + 26);
    }
    ctx.globalAlpha = 1;
  }

  if (joy) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JOY_R, 0, TAU); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > JOY_R ? JOY_R / d : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 22, 0, TAU); ctx.fill();
  }
}

// Таблица урона: цветная метка, название, число и полоска относительно лучшего
function drawDmgTable(x, y, w, rows, fmt, rh = 22) {
  const max = Math.max(1, ...rows.map(r => r.v));
  rows.forEach((r, i) => {
    const ry = y + i * rh, c = srcColor(r.src);
    ctx.fillStyle = c; ctx.fillRect(x, ry + 4, 8, 8);
    text(srcName(r.src), x + 14, ry + 8, 12, '#fff', 'left', true, w * 0.55);
    text(fmt(r), x + w, ry + 8, 12, '#ffd166', 'right', true, w * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, ry + 16, w, 3);
    ctx.fillStyle = c; ctx.fillRect(x, ry + 16, w * r.v / max, 3);
  });
}

// Окно урона в бою (под паузой): не останавливает игру. Вкладки «Всего» и «Урон/с» (за последние 10 с).
// Свёрнуто — маленькая кнопка с графиком
function drawDmgPanel(py) {
  if (!S.dmgPanel) {
    const b = { x: W - 12 - 36, y: py - 30, w: 36, h: 36, act: () => { S.dmgPanel = true; saveSettings(); } };
    ctx.fillStyle = 'rgba(27,29,38,0.8)'; roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
    ctx.fillStyle = '#c8cbd6';
    [10, 16, 7].forEach((hh, i) => ctx.fillRect(b.x + 9 + i * 7, b.y + 27 - hh, 5, hh));
    ui.push(b);
    return;
  }
  const rows = dmgRows(S.dmgTab), pw = 170, px = W - 12 - pw, ph = 34 + rows.length * 22 + 6;
  ctx.fillStyle = 'rgba(12,13,18,0.72)';
  roundRect(px, py, pw, ph, 10); ctx.fill();
  [['total', 'Всего'], ['dps', 'Урон/с']].forEach(([id, name], i) => {
    const b = { x: px + 6 + i * 64, y: py + 6, w: 60, h: 22 }, on = S.dmgTab === id;
    ctx.fillStyle = on ? '#ffd166' : 'rgba(44,48,64,0.9)'; roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill();
    text(name, b.x + b.w / 2, b.y + 11, 11, on ? '#14141c' : '#c8cbd6', 'center');
    ui.push({ ...b, act: () => { S.dmgTab = id; saveSettings(); } });
  });
  const x = { x: px + pw - 28, y: py + 6, w: 22, h: 22, act: () => { S.dmgPanel = false; saveSettings(); } };
  text('✕', x.x + 11, x.y + 11, 13, '#9a9eae', 'center');
  ui.push(x);
  drawDmgTable(px + 10, py + 34, pw - 20, rows, r => fmtNum(r.v) + (S.dmgTab === 'dps' ? '/с' : ''));
}

// Кнопка активки героя (справа внизу): кольцо перезарядки, пока не готова
function drawActiveButton() {
  const a = G.active, ev = G.evo, R = 30, cx = W - 16 - R, cy = H - 16 - R - SAFE_B;
  const color = WEAPONS[heroWeapon()].color, ready = a.cd <= 0 && a.t <= 0;
  ctx.fillStyle = 'rgba(27,29,38,0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2c3040';
  ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, TAU); ctx.stroke();
  const k = a.t > 0 ? a.t / ev.dur : 1 - a.cd / ev.cd;
  ctx.strokeStyle = a.t > 0 ? '#fff' : color;
  ctx.beginPath(); ctx.arc(cx, cy, R - 2, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
  ctx.globalAlpha = ready || a.t > 0 ? 1 : 0.45;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = ready ? color : '#fff';
  ctx.fillText(a.t > 0 ? a.t.toFixed(1) : a.cd > 0 ? Math.ceil(a.cd) : HEROES[SAVE.hero].active, cx, cy, R * 1.7);
  ctx.globalAlpha = 1;
  ui.push({ x: cx - R, y: cy - R, w: R * 2, h: R * 2, act: useActive });
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = G.state === 'menu' ? '#0c0907' : arena().bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ui = [];

  drawWorld();

  if (G.state === 'menu') {
    drawMenu();
  } else {
    drawHud();
    if (G.state === 'levelup' || G.state === 'weaponpick') drawLevelUp();
    else if (G.state === 'pause') drawPause();
    else if (G.state === 'over') drawResult();
  }
  drawToast();
  // Переход: убежище гаснет, поле боя проявляется
  const fade = G.state === 'menu' ? launchFade() : clamp((G.intro - 0.5) * 2, 0, 1);
  if (fade > 0) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, W, H);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
