'use strict';

// ============================================================
//  Survivor — минималистичный прототип в духе Vampire Survivors
//  Всё в одном файле: ввод, логика, отрисовка.
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, DPR = 1, SCALE = 1;
function resize() {
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

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

// ------------------------------------------------------------
//  Данные: враги, оружие, пассивки
// ------------------------------------------------------------

const ETYPES = {
  grunt:  { r: 9,  hp: 12,  speed: 46, dmg: 8,  color: '#e5484d', shape: 'sq',   xp: 1 },
  runner: { r: 7,  hp: 7,   speed: 82, dmg: 6,  color: '#f5a524', shape: 'tri',  xp: 1 },
  tank:   { r: 16, hp: 90,  speed: 30, dmg: 15, color: '#9d6bdf', shape: 'circ', xp: 5 },
  elite:  { r: 26, hp: 700, speed: 40, dmg: 25, color: '#f0f0f0', shape: 'sq',   xp: 40 },
};

const WEAPONS = {
  wand: {
    name: 'Жезл', color: '#ffd166', max: 6,
    stats: l => ({ dmg: 10 + 4 * (l - 1), cd: Math.max(0.3, 0.8 - 0.07 * (l - 1)), count: 1 + Math.floor(l / 2), pierce: l >= 5 ? 2 : 1 }),
    info: ['Стреляет в ближайшего врага', '+1 снаряд', '+урон, быстрее', '+1 снаряд', 'Пробивает 2 врагов', '+1 снаряд'],
  },
  orbit: {
    name: 'Клинки', color: '#7df9ff', max: 6,
    stats: l => ({ count: l + 1, dmg: 8 + 3 * l, radius: 48 + 5 * l, spin: 2.6 + 0.2 * l }),
    info: ['2 клинка кружат вокруг героя', '+1 клинок, +урон', '+1 клинок, +урон', '+1 клинок, +урон', '+1 клинок, +урон', '+1 клинок, +урон'],
  },
  aura: {
    name: 'Аура', color: '#ff8a4c', max: 6,
    stats: l => ({ radius: 42 + 10 * l, dmg: 3 + 2 * l, tick: 0.5 }),
    info: ['Жжёт всех врагов рядом', '+радиус, +урон', '+радиус, +урон', '+радиус, +урон', '+радиус, +урон', '+радиус, +урон'],
  },
  nova: {
    name: 'Нова', color: '#c77dff', max: 6,
    stats: l => ({ cd: 3.2 - 0.3 * l, count: 8 + 2 * l, dmg: 8 + 3 * l }),
    info: ['Залп снарядов во все стороны', '+снаряды, чаще', '+снаряды, чаще', '+снаряды, чаще', '+снаряды, чаще', '+снаряды, чаще'],
  },
};

const PASSIVES = {
  hp:     { name: 'Сердце',  color: '#ff5d73', max: 5, info: '+20 к макс. HP',          apply: h => { h.maxHp += 20; h.hp += 20; } },
  speed:  { name: 'Сапоги',  color: '#57e389', max: 5, info: '+10% скорость',           apply: h => { h.speed *= 1.1; } },
  magnet: { name: 'Магнит',  color: '#4cc9f0', max: 5, info: '+35% радиус сбора опыта', apply: h => { h.magnet *= 1.35; } },
  power:  { name: 'Сила',    color: '#ff9f1c', max: 5, info: '+15% урон',               apply: h => { h.dmgMul += 0.15; } },
  haste:  { name: 'Ускорение', color: '#e9ff70', max: 5, info: '-10% перезарядка',      apply: h => { h.cdMul *= 0.9; } },
  regen:  { name: 'Регенерация', color: '#80ffdb', max: 5, info: '+0.6 HP в секунду',   apply: h => { h.regen += 0.6; } },
};

// ------------------------------------------------------------
//  Пространственная сетка — быстрый поиск врагов рядом с точкой
// ------------------------------------------------------------

const CELL = 48;
const MAX_ER = 26; // максимальный радиус врага, запас для поиска
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

let G;
function newGame(state = 'play') {
  G = {
    state, t: 0, kills: 0, shake: 0, stateAt: performance.now(),
    hero: {
      x: 0, y: 0, r: 9, hp: 100, maxHp: 100, speed: 115, face: 1, inv: 0, walk: 0,
      level: 1, xp: 0, xpNext: 5, magnet: 55, regen: 0, dmgMul: 1, cdMul: 1,
    },
    enemies: [], bullets: [], gems: [], texts: [], particles: [],
    weapons: { wand: 1 }, passives: {}, timers: {}, orbAng: 0,
    spawnAcc: 0, nextElite: 120, nextSwarm: 60,
    pendingLevels: 0, choices: null, cardRects: [],
  };
}
newGame('menu');

function setState(s) { G.state = s; G.stateAt = performance.now(); }

// ------------------------------------------------------------
//  Ввод: клавиатура + плавающий джойстик для пальца/мыши
// ------------------------------------------------------------

const keys = new Set();
let joy = null; // { id, ox, oy, x, y }
const JOY_R = 55;

window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (G.state === 'levelup' && G.choices) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (n !== undefined && G.choices[n]) pickChoice(G.choices[n]);
  } else if (G.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) {
    setState('pause');
  } else if ((e.code === 'Enter' || e.code === 'Space') && tapReady()) {
    onTapScreen();
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); joy = null; if (G.state === 'play') setState('pause'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') setState('pause'); });

// Защита от случайного тапа: окно уровня открылось, пока палец ещё на экране
const tapReady = () => performance.now() - G.stateAt > 350;

function onTapScreen() {
  if (G.state === 'menu') newGame('play');
  else if (G.state === 'over') newGame('play');
  else if (G.state === 'pause') setState('play');
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const x = e.clientX, y = e.clientY;
  if (G.state === 'play') {
    joy = { id: e.pointerId, ox: x, oy: y, x, y };
    return;
  }
  if (!tapReady()) return;
  if (G.state === 'levelup') {
    const i = G.cardRects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (i >= 0) pickChoice(G.choices[i]);
    return;
  }
  onTapScreen();
});
canvas.addEventListener('pointermove', e => {
  if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
});
const endJoy = e => { if (joy && e.pointerId === joy.id) joy = null; };
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

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

function spawnEnemy(type, ang = rand(0, TAU), R = spawnRadius()) {
  const T = ETYPES[type], h = G.hero;
  const m = 1 + G.t / 90; // враги толстеют со временем
  G.enemies.push({
    type, x: h.x + Math.cos(ang) * R, y: h.y + Math.sin(ang) * R,
    r: T.r, hp: T.hp * m, maxHp: T.hp * m, speed: T.speed * rand(0.9, 1.1),
    dmg: T.dmg, color: T.color, shape: T.shape, xp: T.xp,
    kx: 0, ky: 0, flash: 0, orbCd: 0, dead: false,
  });
}

function updateSpawns(dt) {
  const t = G.t;
  G.spawnAcc += dt * (1.2 + t / 14);
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length >= 700) continue;
    const r = Math.random();
    if (t > 90 && r < 0.08) spawnEnemy('tank');
    else if (t > 40 && r < 0.3) spawnEnemy('runner');
    else spawnEnemy('grunt');
  }
  // Кольцо врагов — герой окружён со всех сторон
  if (t >= G.nextSwarm) {
    G.nextSwarm += 60;
    const n = Math.min(80, 24 + Math.floor(t / 6));
    const type = t > 120 ? 'runner' : 'grunt';
    for (let i = 0; i < n; i++) spawnEnemy(type, (i / n) * TAU, spawnRadius() - 10);
    addText(G.hero.x, G.hero.y - 40, 'ОКРУЖЕНИЕ!', '#ff5d73', 1.5, 16);
  }
  if (t >= G.nextElite) {
    G.nextElite += 120;
    spawnEnemy('elite');
    addText(G.hero.x, G.hero.y - 40, 'БОСС!', '#ffffff', 1.5, 16);
  }
}

// ------------------------------------------------------------
//  Бой
// ------------------------------------------------------------

function addText(x, y, s, color = '#fff', life = 0.6, size = 9) {
  if (G.texts.length > 140) G.texts.shift();
  G.texts.push({ x: x + rand(-4, 4), y, s, color, life, max: life, size });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n && G.particles.length < 500; i++) {
    const a = rand(0, TAU), v = rand(30, 110);
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.5), color });
  }
}

function hurt(e, base, kbx = 0, kby = 0) {
  if (e.dead) return;
  const dmg = Math.max(1, Math.round(base * G.hero.dmgMul * rand(0.85, 1.15)));
  e.hp -= dmg;
  e.flash = 0.08;
  e.kx += kbx; e.ky += kby;
  addText(e.x, e.y - e.r, String(dmg));
  if (e.hp <= 0) {
    e.dead = true;
    G.kills++;
    burst(e.x, e.y, e.color, e.type === 'elite' ? 24 : 5);
    G.gems.push({ x: e.x, y: e.y, xp: e.xp, kind: 'xp', pulled: false });
    if (e.type === 'elite' || Math.random() < 0.006) {
      G.gems.push({ x: e.x + 10, y: e.y, xp: 0, kind: 'heart', pulled: false });
    }
  }
}

function shoot(x, y, ang, speed, dmg, pierce, color, r) {
  G.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, pierce, color, r, life: 1.6, hit: new Set(), dead: false });
}

function nearestEnemies(n, range) {
  const h = G.hero, list = [];
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = (e.x - h.x) ** 2 + (e.y - h.y) ** 2;
    if (d < range * range) list.push([d, e]);
  }
  list.sort((a, b) => a[0] - b[0]);
  return list.slice(0, n).map(p => p[1]);
}

function updateWeapons(dt) {
  const h = G.hero, w = G.weapons, T = G.timers;

  if (w.wand) {
    const s = WEAPONS.wand.stats(w.wand);
    T.wand = (T.wand || 0) - dt;
    if (T.wand <= 0) {
      const tg = nearestEnemies(s.count, 380);
      if (tg.length) {
        T.wand = s.cd * h.cdMul;
        for (let i = 0; i < s.count; i++) {
          const e = tg[i % tg.length];
          const a = Math.atan2(e.y - h.y, e.x - h.x) + (i >= tg.length ? rand(-0.25, 0.25) : 0);
          shoot(h.x, h.y, a, 330, s.dmg, s.pierce, WEAPONS.wand.color, 4);
        }
      }
    }
  }

  if (w.orbit) {
    const s = WEAPONS.orbit.stats(w.orbit);
    G.orbAng += s.spin * dt;
    for (let i = 0; i < s.count; i++) {
      const a = G.orbAng + (i / s.count) * TAU;
      const bx = h.x + Math.cos(a) * s.radius, by = h.y + Math.sin(a) * s.radius;
      for (const e of query(bx, by, 9 + MAX_ER, near)) {
        if (e.dead || e.orbCd > G.t) continue;
        const dx = e.x - bx, dy = e.y - by;
        if (dx * dx + dy * dy < (e.r + 9) ** 2) {
          const d = Math.hypot(e.x - h.x, e.y - h.y) || 1;
          e.orbCd = G.t + 0.35;
          hurt(e, s.dmg, (e.x - h.x) / d * 140, (e.y - h.y) / d * 140);
        }
      }
    }
  }

  if (w.aura) {
    const s = WEAPONS.aura.stats(w.aura);
    T.aura = (T.aura || 0) - dt;
    if (T.aura <= 0) {
      T.aura = s.tick;
      for (const e of query(h.x, h.y, s.radius + MAX_ER, near)) {
        if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < (s.radius + e.r) ** 2) hurt(e, s.dmg);
      }
    }
  }

  if (w.nova) {
    const s = WEAPONS.nova.stats(w.nova);
    T.nova = (T.nova || 0) - dt;
    if (T.nova <= 0) {
      T.nova = s.cd * h.cdMul;
      const off = rand(0, TAU);
      for (let i = 0; i < s.count; i++) shoot(h.x, h.y, off + (i / s.count) * TAU, 220, s.dmg, 1, WEAPONS.nova.color, 5);
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
        hurt(e, b.dmg, b.vx / sp * 90, b.vy / sp * 90);
        if (--b.pierce <= 0) { b.dead = true; break; }
      }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);
}

function updateEnemies(dt) {
  const h = G.hero, far = spawnRadius() + 300;
  for (const e of G.enemies) {
    let dx = h.x - e.x, dy = h.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // Отставшие враги телепортируются обратно на кольцо спавна
    if (d > far) {
      const a = rand(0, TAU), R = spawnRadius();
      e.x = h.x + Math.cos(a) * R; e.y = h.y + Math.sin(a) * R;
      continue;
    }
    e.x += (dx / d * e.speed + e.kx) * dt;
    e.y += (dy / d * e.speed + e.ky) * dt;
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
        const d = Math.sqrt(d2), push = (min - d) * 0.25;
        e.x += dx / d * push; e.y += dy / d * push;
      }
    }
  }
}

function updateHero(dt) {
  const h = G.hero, v = inputVector();
  h.x += v.x * h.speed * dt;
  h.y += v.y * h.speed * dt;
  if (Math.abs(v.x) > 0.1) h.face = Math.sign(v.x);
  h.walk = v.x || v.y ? h.walk + dt : 0;
  h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);
  if (h.inv > 0) h.inv -= dt;

  for (const e of query(h.x, h.y, h.r + MAX_ER, near)) {
    if (e.dead || h.inv > 0) continue;
    if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < (e.r + h.r) ** 2) {
      h.hp -= e.dmg;
      h.inv = 0.45;
      G.shake = 6;
      addText(h.x, h.y - 16, '-' + e.dmg, '#ff5d73', 0.8, 11);
      if (h.hp <= 0) { h.hp = 0; setState('over'); joy = null; }
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
      } else {
        gainXp(g.xp);
      }
    }
  }
  G.gems = G.gems.filter(g => !g.dead);
}

function gainXp(n) {
  const h = G.hero;
  h.xp += n;
  while (h.xp >= h.xpNext) {
    h.xp -= h.xpNext;
    h.level++;
    h.xpNext = Math.round(5 + (h.level - 1) * 6 + Math.pow(h.level - 1, 1.6));
    G.pendingLevels++;
  }
}

// ------------------------------------------------------------
//  Прокачка
// ------------------------------------------------------------

function rollChoices() {
  const pool = [];
  for (const id in WEAPONS) {
    const l = G.weapons[id] || 0;
    if (l < WEAPONS[id].max) pool.push({ kind: 'w', id, lvl: l + 1 });
  }
  for (const id in PASSIVES) {
    const l = G.passives[id] || 0;
    if (l < PASSIVES[id].max) pool.push({ kind: 'p', id, lvl: l + 1 });
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const res = pool.slice(0, 3);
  if (!res.length) res.push({ kind: 'f', id: 'food', lvl: 0 });
  return res;
}

function choiceView(c) {
  if (c.kind === 'w') {
    const d = WEAPONS[c.id];
    return { name: d.name, color: d.color, tag: c.lvl === 1 ? 'НОВОЕ' : 'Ур. ' + c.lvl, info: d.info[c.lvl - 1] };
  }
  if (c.kind === 'p') {
    const d = PASSIVES[c.id];
    return { name: d.name, color: d.color, tag: c.lvl === 1 ? 'НОВОЕ' : 'Ур. ' + c.lvl, info: d.info };
  }
  return { name: 'Еда', color: '#57e389', tag: '', info: 'Восстановить 50% HP' };
}

function pickChoice(c) {
  const h = G.hero;
  if (c.kind === 'w') G.weapons[c.id] = c.lvl;
  else if (c.kind === 'p') { G.passives[c.id] = c.lvl; PASSIVES[c.id].apply(h); }
  else h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.5);
  G.pendingLevels--;
  G.choices = null;
  setState('play');
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

  if (G.state !== 'play') return;

  G.t += dt;
  updateSpawns(dt);
  buildGrid();
  updateHero(dt);
  if (G.state !== 'play') return;
  updateEnemies(dt);
  buildGrid();
  updateWeapons(dt);
  updateBullets(dt);
  G.enemies = G.enemies.filter(e => !e.dead);
  updateGems(dt);

  if (G.pendingLevels > 0) {
    G.choices = rollChoices();
    setState('levelup');
    joy = null;
  }
}

// ------------------------------------------------------------
//  Отрисовка
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
const HERO_PAL = { 0: '#14141c', 1: '#f2c9a0', 2: '#14141c', 3: '#3e8ef7', 4: '#5a3d26' };
const PX = 2.4;

function drawHero(h) {
  if (h.inv > 0 && Math.floor(h.inv * 20) % 2) return;
  const legs = HERO_LEGS[h.walk > 0 ? Math.floor(h.walk * 8) % 2 : 0];
  const rows = HERO_BODY.concat(legs);
  const ox = h.x - 4 * PX, oy = h.y - rows.length * PX / 2 - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(h.x, h.y + 12, 8, 3, 0, 0, TAU); ctx.fill();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = rows[r][h.face < 0 ? 7 - c : c];
      if (ch === '.') continue;
      ctx.fillStyle = HERO_PAL[ch];
      ctx.fillRect(ox + c * PX, oy + r * PX, PX + 0.05, PX + 0.05);
    }
  }
}

function drawEnemy(e) {
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
  const r = e.r;
  if (e.shape === 'sq') {
    ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(e.x - r * 0.5, e.y - r * 0.3, r * 0.3, r * 0.3);
    ctx.fillRect(e.x + r * 0.2, e.y - r * 0.3, r * 0.3, r * 0.3);
  } else if (e.shape === 'tri') {
    const a = Math.atan2(G.hero.y - e.y, G.hero.x - e.x);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const aa = a + (i / 3) * TAU;
      ctx.lineTo(e.x + Math.cos(aa) * r * 1.3, e.y + Math.sin(aa) * r * 1.3);
    }
    ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
  }
  if (e.type === 'elite' || e.type === 'tank') {
    const w = r * 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x - r, e.y - r - 7, w, 3);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(e.x - r, e.y - r - 7, w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
}

function drawWorld() {
  const h = G.hero;
  const sx = G.shake ? rand(-G.shake, G.shake) : 0, sy = G.shake ? rand(-G.shake, G.shake) : 0;
  ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, DPR * (W / 2 - h.x * SCALE + sx), DPR * (H / 2 - h.y * SCALE + sy));

  const vw = W / 2 / SCALE + 40, vh = H / 2 / SCALE + 40;
  const inView = o => Math.abs(o.x - h.x) < vw && Math.abs(o.y - h.y) < vh;

  // Сетка пола
  const step = 64;
  ctx.strokeStyle = '#1b1e27';
  ctx.lineWidth = 1 / SCALE;
  ctx.beginPath();
  for (let x = Math.floor((h.x - vw) / step) * step; x < h.x + vw; x += step) { ctx.moveTo(x, h.y - vh); ctx.lineTo(x, h.y + vh); }
  for (let y = Math.floor((h.y - vh) / step) * step; y < h.y + vh; y += step) { ctx.moveTo(h.x - vw, y); ctx.lineTo(h.x + vw, y); }
  ctx.stroke();

  if (G.weapons.aura) {
    const s = WEAPONS.aura.stats(G.weapons.aura);
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
    const s = g.xp >= 20 ? 6 : g.xp >= 5 ? 4.5 : 3.2;
    ctx.fillStyle = g.xp >= 20 ? '#ff6b6b' : g.xp >= 5 ? '#57e389' : '#4cc9f0';
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.7, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.7, g.y); ctx.fill();
  }

  for (const e of G.enemies) if (inView(e)) drawEnemy(e);

  drawHero(h);

  if (G.weapons.orbit) {
    const s = WEAPONS.orbit.stats(G.weapons.orbit);
    for (let i = 0; i < s.count; i++) {
      const a = G.orbAng + (i / s.count) * TAU;
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

  for (const p of G.particles) {
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // HP-бар под героем
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

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHud() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = G.hero;
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
  ctx.fillText(fmtTime(G.t), W / 2, top + 16);
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('Ур. ' + h.level, 12, top + 16);
  ctx.textAlign = 'right';
  ctx.fillText('☠ ' + G.kills, W - 12, top + 16);

  // Иконки оружия и пассивок
  const items = [
    ...Object.entries(G.weapons).map(([id, l]) => [WEAPONS[id], l]),
    ...Object.entries(G.passives).map(([id, l]) => [PASSIVES[id], l]),
  ];
  const sz = 26;
  items.forEach(([d, l], i) => {
    const x = 12 + i * (sz + 6), y = H - sz - 16;
    ctx.fillStyle = '#1b1d26';
    roundRect(x, y, sz, sz, 6); ctx.fill();
    ctx.fillStyle = d.color;
    roundRect(x + 5, y + 5, sz - 10, sz - 10, 3); ctx.fill();
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000'; ctx.fillText(l, x + sz + 1, y + sz + 3);
    ctx.fillStyle = '#fff'; ctx.fillText(l, x + sz, y + sz + 2);
  });

  if (joy) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JOY_R, 0, TAU); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > JOY_R ? JOY_R / d : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 22, 0, TAU); ctx.fill();
  }
}

function dim(a = 0.65) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = `rgba(5,6,10,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function centerText(lines) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = H / 2 - (lines.length - 1) * 18;
  for (const [s, size, color] of lines) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(s, W / 2, y);
    y += 36;
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
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(v.name, r.x + 56, r.y + 29);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = v.color;
    ctx.textAlign = 'right';
    ctx.fillText(v.tag, r.x + r.w - 14, r.y + 29);
    ctx.textAlign = 'left';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#c8cbd6';
    ctx.fillText(v.info, r.x + 14, r.y + (portrait ? 64 : 80), r.w - 28);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#6b7080';
    if (!portrait) ctx.fillText('клавиша ' + (i + 1), r.x + 14, r.y + r.h - 18);
    ctx.globalAlpha = 1;
    return r;
  });
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0e0f13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWorld();

  if (G.state === 'menu') {
    dim(0.5);
    centerText([
      ['SURVIVOR', 40, '#ffd166'],
      ['Выживи против орды', 16, '#c8cbd6'],
      ['', 10, '#fff'],
      ['Нажми, чтобы начать', 18, '#fff'],
      ['палец — джойстик · ПК — WASD / стрелки', 13, '#6b7080'],
    ]);
    return;
  }

  drawHud();

  if (G.state === 'levelup') drawLevelUp();
  else if (G.state === 'pause') {
    dim();
    centerText([['ПАУЗА', 32, '#fff'], ['Нажми, чтобы продолжить', 16, '#c8cbd6']]);
  } else if (G.state === 'over') {
    dim(0.75);
    centerText([
      ['ТЫ ПОГИБ', 36, '#ff5d73'],
      ['Время: ' + fmtTime(G.t) + '   ·   Уровень: ' + G.hero.level, 16, '#fff'],
      ['Убито врагов: ' + G.kills, 16, '#fff'],
      ['', 10, '#fff'],
      ['Нажми, чтобы сыграть снова', 18, '#ffd166'],
    ]);
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
