'use strict';

// ============================================================
//  Мета-прогресс: сохранение, валюта, покупки и прокачка,
//  бонусы убежища, которые применяются к герою в забеге.
// ============================================================

// Настройки (отдельно от прогресса, чтобы сброс прогресса их не трогал)
const SETTINGS_KEY = 'survivor.settings';
// music и sfx — заготовка: звука в игре пока нет. dmgPanel — окно урона в бою, dmgTab — его вкладка
const S = { shake: true, dmgText: true, vibrate: true, music: true, sfx: true, dmgPanel: true, dmgTab: 'total' };
try { Object.assign(S, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch {} }

const SAVE_KEY = 'survivor.save';
function defaultSave() {
  return {
    gold: 0, shards: 0, stars: 0,
    puzzles: {},        // пазлы оружия: id → шт (каждые 10 сразу дают +1 уровень)
    tierPuzzles: {},    // пазлы тиров, на которые ещё нет оружия: тир → шт
    week: null,         // недельные задания: { id, stats, quests: [забрано], chests: [забрано] }
    tickets: 0,         // билеты: пропуск рекламы (дают подписки)
    keys: { blue: 0, red: 0 },
    sub: null,          // подписка: { tier, until }
    day: null,          // дневные лимиты магазина: { id, n: { покупка: сколько раз } }
    chapterBought: [],  // купленные сундуки глав (номер k: за уровни 5k)
    unlocked: 1,        // максимальный открытый уровень кампании
    cleared: {},        // уровень → сколько раз пройден
    weapons: {},        // id → мета-уровень (по умолчанию 1)
    loadout: ['orbit', 'aura', 'nova'], // оружие, которое может выпасть в бою (кроме оружия героя)
    acct: 1,            // уровень аккаунта
    pips: { dmg: 0, crit: 0, hp: 0, cd: 0 }, // шаги прокачки характеристик на текущем уровне аккаунта
    hero: 'orin',
    heroes: { orin: 1 }, // открытые герои → ступень эволюции
    heroGems: {},        // гемы героев (дают ивенты)
    medals: {},
    outfits: ['none'], outfit: 'none',
    pets: ['none'], pet: 'none',
    best: { kills: 0, time: 0 },
  };
}
let SAVE = defaultSave();
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (s) SAVE = Object.assign(defaultSave(), s);
} catch {}
if (!HEROES[SAVE.hero]) SAVE.hero = 'orin';
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch {} }

// ------------------------------------------------------------
//  Валюта
// ------------------------------------------------------------

const canAfford = c => SAVE.gold >= (c.gold || 0) && SAVE.shards >= (c.shards || 0);
function pay(c) { SAVE.gold -= c.gold || 0; SAVE.shards -= c.shards || 0; }

// Начислить награду { gold, shards, medal } и сохранить
function grant(r) {
  SAVE.gold += Math.floor(r.gold || 0);
  SAVE.shards += r.shards || 0;
  if (r.medal) SAVE.medals[r.medal] = Math.max(1, SAVE.medals[r.medal] || 0);
  save();
}

// Текст цены: «120 ●», «4 ◆», «400 ● 6 ◆»
function costText(c) {
  const p = [];
  if (c.gold) p.push(c.gold + ' ●');
  if (c.shards) p.push(c.shards + ' ◆');
  return p.join('  ') || 'Бесплатно';
}

// ------------------------------------------------------------
//  Оружие
// ------------------------------------------------------------

const wLvl = id => SAVE.weapons[id] || 1;
const wRank = L => Math.floor((L - 1) / 5) + 1;

// Оружие качается только пазлами (запчастями) из сундуков и магазина: 10 пазлов = +1 уровень
const wPuzzles = id => SAVE.puzzles[id] || 0;
const canUpgradeWeapon = id => wLvl(id) < ECON.weaponMax && wPuzzles(id) >= PUZZLES_PER_LEVEL;
function upgradeWeapon(id) {
  if (!canUpgradeWeapon(id)) return false;
  SAVE.puzzles[id] -= PUZZLES_PER_LEVEL;
  SAVE.weapons[id] = wLvl(id) + 1;
  save();
  return true;
}

// ------------------------------------------------------------
//  Перки, медальоны, косметика, питомцы
// ------------------------------------------------------------

const isOpen = id => SAVE.unlocked >= (UNLOCKS[id] || 1);

const medalLvl = id => SAVE.medals[id] || 0;

// Редкий медальон, которого ещё нет, можно только выбить из кейса
function medalCost(id) {
  const l = medalLvl(id), M = MEDALS[id];
  if (l >= M.max || (M.rare && l === 0)) return null;
  return M.cost(l);
}
function upgradeMedal(id) {
  const c = medalCost(id);
  if (!c || !canAfford(c)) return false;
  pay(c); SAVE.medals[id] = medalLvl(id) + 1; save();
  return true;
}

// Одежда и питомцы: купить или надеть. kind: 'outfit' | 'pet'
const SHOPS = {
  outfit: { data: OUTFITS, owned: 'outfits', on: 'outfit' },
  pet:    { data: PETS,    owned: 'pets',    on: 'pet' },
};
const owns = (kind, id) => SAVE[SHOPS[kind].owned].includes(id);
function buyOrEquip(kind, id) {
  const sh = SHOPS[kind], price = sh.data[id].price;
  if (!owns(kind, id)) {
    if (SAVE.gold < price) return false;
    SAVE.gold -= price;
    SAVE[sh.owned].push(id);
  }
  SAVE[sh.on] = id;
  save();
  return true;
}

// ------------------------------------------------------------
//  Гардероб: уровень аккаунта и герои
// ------------------------------------------------------------

const heroWeapon = () => HEROES[SAVE.hero].weapon;
const heroLvl = id => SAVE.heroes[id] || 0;
const curEvo = () => heroEvo(heroLvl(SAVE.hero));

// Сколько всего шагов вложено в характеристику и сколько % это даёт с текущим героем
const statPips = id => (SAVE.acct - 1) * ECON.statSteps + SAVE.pips[id];
const statPct = id => statPips(id) * curEvo().pip;

function statCost(id) {
  if (SAVE.pips[id] >= ECON.statSteps || SAVE.acct >= ACCOUNT_MAX) return null;
  return { gold: ECON.statCost(statPips(id)) };
}
// Шаг прокачки. Когда все четыре характеристики прокачаны по 5 — новый уровень аккаунта
function upgradeStat(id) {
  const c = statCost(id);
  if (!c || !canAfford(c)) return false;
  pay(c);
  SAVE.pips[id]++;
  questAdd('upgrades');
  if (Object.keys(STATS).every(k => SAVE.pips[k] >= ECON.statSteps)) {
    SAVE.acct++;
    for (const k in STATS) SAVE.pips[k] = 0;
  }
  save();
  return true;
}

// Купить героя (открывает 1-ю ступень) или взять его в бой
function buyOrPickHero(id) {
  if (!heroLvl(id)) {
    if (SAVE.stars < HEROES[id].stars) return false;
    SAVE.stars -= HEROES[id].stars;
    SAVE.heroes[id] = 1;
  }
  // Оружие прошлого героя возвращается в набор, оружие нового из набора уходит (оно и так с ним)
  const prev = heroWeapon();
  SAVE.hero = id;
  SAVE.loadout = SAVE.loadout.filter(w => w !== heroWeapon());
  if (prev !== heroWeapon() && SAVE.loadout.length < MAX_RUN_WEAPONS - 1) SAVE.loadout.push(prev);
  save();
  return true;
}

// Эволюция героя за гем
function evolveHero(id) {
  if (!heroLvl(id) || heroLvl(id) >= HERO_EVO.length || !(SAVE.heroGems[id] > 0)) return false;
  SAVE.heroGems[id]--;
  SAVE.heroes[id]++;
  save();
  return true;
}

// Набор оружия на бой: оружие героя всегда с собой, остальное отмечается (до 7)
function toggleLoadout(id) {
  if (id === heroWeapon()) return false;
  const i = SAVE.loadout.indexOf(id);
  if (i >= 0) SAVE.loadout.splice(i, 1);
  else if (SAVE.loadout.length < MAX_RUN_WEAPONS - 1) SAVE.loadout.push(id);
  else return false;
  save();
  return true;
}

// ------------------------------------------------------------
//  Пазлы оружия
// ------------------------------------------------------------

const weaponsOfTier = t => Object.keys(WEAPONS).filter(id => WEAPONS[id].tier === t);

// Пазлы копятся на оружии; уровень поднимается кнопкой во вкладке «Оружие»
function addPuzzles(id, n) { SAVE.puzzles[id] = wPuzzles(id) + n; }

// Пазлы тира достаются случайному оружию этого тира. Если такого оружия ещё нет,
// они копятся на аккаунте и перейдут в оружие, когда оно появится. Возвращает, кому достались
function grantPuzzles(tier, n) {
  const ids = weaponsOfTier(tier);
  if (!ids.length) { SAVE.tierPuzzles[tier] = (SAVE.tierPuzzles[tier] || 0) + n; return `${TIERS[tier].many} пазлы (ждут оружие)`; }
  const id = ids[Math.floor(Math.random() * ids.length)];
  addPuzzles(id, n);
  return WEAPONS[id].name;
}
// Накопленные пазлы тира переходят в оружие этого тира, как только оно есть в игре
for (const t in SAVE.tierPuzzles) {
  if (SAVE.tierPuzzles[t] && weaponsOfTier(t).length) { const n = SAVE.tierPuzzles[t]; SAVE.tierPuzzles[t] = 0; grantPuzzles(t, n); }
}

// Награда заданий и кейсов: { gold, stars, puzzles: { тир: шт } }. Золото растёт с кампанией
const rewardGold = r => Math.round((r.gold || 0) * rewardScale(SAVE.unlocked) / 10) * 10;
function rewardText(r) {
  const p = [];
  if (r.gold) p.push(rewardGold(r) + ' ●');
  if (r.stars) p.push(r.stars + ' ⭐');
  for (const t in r.puzzles || {}) p.push(`🧩${r.puzzles[t]} ${TIERS[t].many}`);
  return p.join('  ');
}
function grantReward(r) {
  const got = [];
  if (r.gold) { const g = rewardGold(r); SAVE.gold += g; got.push(g + ' ●'); }
  if (r.stars) { SAVE.stars += r.stars; got.push(r.stars + ' ⭐'); }
  for (const t in r.puzzles || {}) got.push(`🧩${r.puzzles[t]} → ${grantPuzzles(t, r.puzzles[t])}`);
  save();
  return got.join('  ');
}

// ------------------------------------------------------------
//  Недельные задания (сброс в понедельник, по местному времени)
// ------------------------------------------------------------

const weekId = () => Math.floor((Date.now() / 60000 - new Date().getTimezoneOffset()) / 1440 / 7 + 3 / 7);
function week() {
  const id = weekId();
  if (!SAVE.week || SAVE.week.id !== id) SAVE.week = { id, stats: {}, quests: [], chests: [] };
  return SAVE.week;
}
// Счётчик недели растёт по ходу игры; сохраняется вместе с прогрессом
function questAdd(stat, n = 1) { const w = week(); w.stats[stat] = (w.stats[stat] || 0) + n; }
const questProgress = i => Math.min(QUESTS[i].goal, Math.floor(week().stats[QUESTS[i].stat] || 0));
const questDone = i => questProgress(i) >= QUESTS[i].goal;
const weekPoints = () => week().quests.reduce((s, i) => s + QUESTS[i].pts, 0);
// Сколько наград можно забрать прямо сейчас (точка на кнопке календаря)
const weekClaimable = () => QUESTS.filter((q, i) => questDone(i) && !week().quests.includes(i)).length
  + WEEK_CHESTS.filter((c, i) => weekPoints() >= c.at && !week().chests.includes(i)).length;

function claimQuest(i) {
  const w = week();
  if (!questDone(i) || w.quests.includes(i)) return null;
  w.quests.push(i);
  return grantReward(QUESTS[i].reward);
}
function claimChest(i) {
  const w = week();
  if (weekPoints() < WEEK_CHESTS[i].at || w.chests.includes(i)) return null;
  w.chests.push(i);
  return grantReward(WEEK_CHESTS[i].reward);
}

// ------------------------------------------------------------
//  Магазин
// ------------------------------------------------------------

const localDay = () => Math.floor((Date.now() / 60000 - new Date().getTimezoneOffset()) / 1440);
const subActive = () => SAVE.sub && SAVE.sub.until > Date.now();
// Новый день: дневные лимиты обнуляются, подписка выдаёт билеты
function today() {
  const id = localDay();
  if (!SAVE.day || SAVE.day.id !== id) {
    SAVE.day = { id, n: {} };
    if (subActive()) SAVE.tickets += SHOP.subs[SAVE.sub.tier].tickets;
    save();
  }
  return SAVE.day;
}
const dayUsed = key => today().n[key] || 0;
function dayUse(key) { today().n[key] = dayUsed(key) + 1; }

// Реклама только по кнопке. Есть билет — он тратится вместо ролика
function watchAd(then) {
  if (SAVE.tickets > 0) { SAVE.tickets--; save(); showToast('Билет: реклама пропущена'); }
  else showToast('Реклама (заглушка)');
  then();
}

// Сундуки
function openChest(id) {
  const C = CHESTS[id];
  if (id === 'weapon') {
    let r = Math.random(), tier = 'green';
    for (const [t, w] of WEAPON_CHEST_TIERS) { if ((r -= w) <= 0) { tier = t; break; } }
    return grantReward({ gold: 200, puzzles: { [tier]: 10 } });
  }
  if (id === 'boost') {
    // Сначала новый редкий медальон, потом +1 уровень любого незакрытого медальона/тотема, иначе золото
    const fresh = Object.keys(MEDALS).filter(m => MEDALS[m].rare && !medalLvl(m));
    const up = Object.keys(MEDALS).filter(m => medalLvl(m) && medalLvl(m) < MEDALS[m].max || (!MEDALS[m].rare && !medalLvl(m)));
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (fresh.length) { const m = pick(fresh); SAVE.medals[m] = 1; save(); return 'Новый медальон: ' + MEDALS[m].name; }
    if (up.length) { const m = pick(up); SAVE.medals[m] = medalLvl(m) + 1; save(); return `${MEDALS[m].name}: ур. ${medalLvl(m)}`; }
    return grantReward({ gold: 1000 });
  }
  return grantReward(C.reward);
}
// Предложения дня: одинаковые весь день (генератор от номера дня), на следующий — другие.
// Пазлы на конкретное оружие тех тиров, что продаются, и с шансом — один сундук
function dailyOffers() {
  let seed = today().id * 2654435761 >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const D = SHOP.daily, pool = Object.keys(WEAPONS).filter(id => D.puzzle[WEAPONS[id].tier]), list = [];
  for (let i = 0; i < D.slots && pool.length; i++) {
    const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0], P = D.puzzle[WEAPONS[id].tier];
    const cost = P.gold && rnd() < 0.5 ? { gold: P.gold } : { stars: P.stars };
    list.push({ key: 'pz_' + id, weapon: id, n: P.n, cost });
  }
  if (rnd() < D.chestChance) {
    let r = rnd(), tier = 'green';
    for (const [t, w] of D.chestTiers) { if ((r -= w) <= 0) { tier = t; break; } }
    list.push({ key: 'chest_' + tier, chest: tier, cost: { stars: D.chest[tier] } });
  }
  return list;
}

// Открыть сундук за ключ
function openWithKey(id) {
  const k = CHESTS[id].key;
  if (!(SAVE.keys[k] > 0)) return null;
  SAVE.keys[k]--;
  return openChest(id);
}

// Покупка за звёзды/золото с дневным лимитом. Возвращает текст награды или null
function shopBuy(cost, key, limit, give) {
  if (limit && dayUsed(key) >= limit) return null;
  if (!canAfford(cost) || SAVE.stars < (cost.stars || 0)) return null;
  pay(cost);
  SAVE.stars -= cost.stars || 0;
  if (limit) dayUse(key);
  const res = give();
  save();
  return res;
}

// Сундуки глав: открываются за каждые 5 пройденных уровней
const chapterOffers = () => {
  const n = Math.floor((SAVE.unlocked - 1) / SHOP.chapterEvery), list = [];
  for (let k = 1; k <= n; k++) if (!SAVE.chapterBought.includes(k)) list.push(k);
  return list;
};
function buyChapter(k) {
  const o = SHOP.chapterOffer(k);
  SAVE.chapterBought.push(k);
  SAVE.keys.blue += o.keys.blue; SAVE.keys.red += o.keys.red;
  return grantReward({ gold: o.gold, stars: o.stars }) + `  🔑${o.keys.blue} синих  🔑${o.keys.red} красный`;
}

// Подписка (в браузере — тестовая активация): билеты каждый день, первый день — сразу
function activateSub(tier) {
  today();
  SAVE.sub = { tier, until: Date.now() + SHOP.subDays * 86400000 };
  SAVE.tickets += SHOP.subs[tier].tickets;
  save();
}

// ------------------------------------------------------------
//  Бонусы убежища в забеге
// ------------------------------------------------------------

// Урон оружия с учётом мета-уровня, тотема силы и медальона ярости
function metaDmg(id, base) {
  return (base + medalLvl('dmgTotem')) * ECON.weaponMult(wLvl(id)) * (1 + 0.15 * medalLvl('fury'));
}

function applyMeta(h) {
  h.maxHp = Math.round((100 + 5 * medalLvl('hpTotem')) * (1 + statPct('hp') / 100));
  h.hp = h.maxHp;
  h.dmgMul = 1 + statPct('dmg') / 100;
  h.cdMul = 1 / (1 + statPct('cd') / 100);
  h.critChance = ECON.critChance;
  h.critMul = 1.5 + statPct('crit') / 100;
  h.magnet *= SAVE.pet === 'owl' ? 1.6 : 1;
  h.goldMul = 1;
  h.xpMul = 1;
  h.revive = false;
}

// Пассивки открытых героев: множитель урона для каждого оружия
function heroBonuses() {
  const b = {};
  for (const id in SAVE.heroes) {
    const w = HEROES[id].weapon;
    b[w] = (b[w] || 1) + heroEvo(SAVE.heroes[id]).passive / 100;
  }
  return b;
}

// Награда за прохождение уровня (кейс): золото, осколки и, возможно, медальон
// Сложность d открыта на главе n: лёгкая — если глава открыта, остальные — после прохождения предыдущей
const diffOpen = (n, d) => n <= SAVE.unlocked && (d === 0 || !!SAVE.cleared[clearKey(n, d - 1)]);

function bossReward(n, first, d = 0) {
  const r = { ...ECON.reward100(n, first) };
  r.gold = Math.round(r.gold * DIFFS[d].gold);
  // Пазлы по сложности: при повторе вдвое меньше
  r.puzzles = {};
  for (const t in DIFFS[d].puzzles) r.puzzles[t] = first ? DIFFS[d].puzzles[t] : Math.max(1, Math.ceil(DIFFS[d].puzzles[t] / 2));
  if (first && ECON.firstClearMedal[n]) {
    r.medal = ECON.firstClearMedal[n];
  } else if (!first && Math.random() < ECON.replayMedalChance) {
    const pool = Object.keys(MEDALS).filter(id => MEDALS[id].rare && !medalLvl(id) && !Object.values(ECON.firstClearMedal).includes(id));
    if (pool.length) r.medal = pool[Math.floor(Math.random() * pool.length)];
    else r.shards += 2;
  }
  return r;
}
