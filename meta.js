'use strict';

// ============================================================
//  Мета-прогресс: сохранение, валюта, покупки и прокачка,
//  бонусы убежища, которые применяются к герою в забеге.
// ============================================================

// Настройки (отдельно от прогресса, чтобы сброс прогресса их не трогал)
const SETTINGS_KEY = 'survivor.settings';
// music и sfx — заготовка: звука в игре пока нет. dmgPanel — окно урона в бою, dmgTab — его вкладка
const S = { shake: true, dmgText: true, vibrate: true, music: true, sfx: true, dmgPanel: false, dmgTab: 'total', speed: 1 };
try { Object.assign(S, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch {} }

const SAVE_KEY = 'survivor.save';
function defaultSave() {
  return {
    gold: 0, shards: 0, stars: 0,
    puzzles: {},        // пазлы оружия: id → шт (каждые 10 сразу дают +1 уровень)
    tierPuzzles: {},    // пазлы-джокеры цвета (тира): вкладываются в любое оружие этого цвета; тир → шт
    jokerGems: {},      // гемы-джокеры цвета: +1 уровень любому оружию этого цвета; тир → шт
    week: null,         // недельные задания: { id, stats, quests: [забрано], chests: [забрано] }
    tickets: 0,         // билеты: пропуск рекламы (дают подписки)
    keys: { blue: 0, red: 0 },
    boostPuzzles: {},   // пазлы бустов: id → шт
    chestOpens: { boost: 0, red: 0 }, // открыто кейсов за ключи (каждые GEM_EVERY — гем)
    gems: { boost: 0, red: 0 },       // гемы за открытия: ждут выбора
    subs: {},           // подписки: номер → до какого времени (мс) или 'forever'
    subWeek: 0,         // сколько дней «Недели подписчика» забрано в текущем круге
    day: null,          // дневные лимиты магазина: { id, n: { покупка: сколько раз } }
    chapterBought: [],  // купленные сундуки глав (номер k: за уровни 5k)
    unlocked: 1,        // максимальный открытый уровень кампании
    cleared: {},        // уровень → сколько раз пройден
    weapons: {},        // id → мета-уровень (по умолчанию 1)
    loadout: ['orbit', 'aura', 'nova', 'stench', 'axes'], // оружие, которое может выпасть в бою (кроме оружия героя)
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
// Оружие, добавленное обновлением, сразу попадает в набор на бой (если есть место)
if (!SAVE.seenWeapons) SAVE.seenWeapons = ['wand', 'orbit', 'aura', 'nova', 'stench'];
for (const id in WEAPONS) {
  if (SAVE.seenWeapons.includes(id)) continue;
  SAVE.seenWeapons.push(id);
  if (id !== HEROES[SAVE.hero].weapon && !SAVE.loadout.includes(id) && SAVE.loadout.length < MAX_RUN_WEAPONS - 1) SAVE.loadout.push(id);
}
if (SAVE.sub) { SAVE.subs[SAVE.sub.tier] = SAVE.sub.until; delete SAVE.sub; } // старое сохранение: одна подписка
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch {} }

// ------------------------------------------------------------
//  Валюта
// ------------------------------------------------------------

const canAfford = c => SAVE.gold >= (c.gold || 0) && SAVE.shards >= (c.shards || 0);
function pay(c) { SAVE.gold -= c.gold || 0; SAVE.shards -= c.shards || 0; }

// Начислить награду { gold, shards, keys } и сохранить
function grant(r) {
  SAVE.gold += Math.floor(r.gold || 0);
  SAVE.shards += r.shards || 0;
  SAVE.keys.blue += r.keys || 0;
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

// Бусты качаются только пазлами из синего кейса: сколько нужно на следующий уровень (null — максимум)
const boostHave = id => SAVE.boostPuzzles[id] || 0;
const boostNeed = id => medalLvl(id) < MEDALS[id].max ? BOOST_PUZZLES[medalLvl(id)] : null;
function upgradeBoost(id) {
  const need = boostNeed(id);
  if (!need || boostHave(id) < need) return false;
  SAVE.boostPuzzles[id] -= need;
  SAVE.medals[id] = medalLvl(id) + 1;
  save();
  return true;
}
// Гем за 100 открытий: +1 уровень выбранному бусту (boost) или красному оружию (red)
function useGem(kind, id) {
  if (!(SAVE.gems[kind] > 0)) return false;
  if (kind === 'boost') { if (medalLvl(id) >= MEDALS[id].max) return false; SAVE.medals[id] = medalLvl(id) + 1; }
  else { if (WEAPONS[id].tier !== 'red' || wLvl(id) >= ECON.weaponMax) return false; SAVE.weapons[id] = wLvl(id) + 1; }
  SAVE.gems[kind]--;
  save();
  return true;
}
// Ключ дня: бесплатно 1 раз и KEY_ADS раз за рекламу (кнопки в магазине)
function giveKey(color) { SAVE.keys[color]++; save(); logGot('key', color, 1); return 'ключ'; }

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

// Что выдало последнее действие игрока — окно «Получено!» показывает это карточками.
// Очищается при каждом тапе (hitUi). Одинаковое складывается: 10 сундуков = одна карточка на оружие
let gotLog = [];
function logGot(kind, id, n, lvl) {
  const same = gotLog.find(g => g.kind === kind && g.id === id);
  if (same) { same.n += n; if (lvl) same.lvl = lvl; } else gotLog.push({ kind, id, n, lvl });
}

// Пазлы тира достаются случайному оружию этого тира. Если такого оружия ещё нет,
// они копятся на аккаунте и перейдут в оружие, когда оно появится. Возвращает, кому достались
function grantPuzzles(tier, n) {
  const ids = weaponsOfTier(tier);
  if (!ids.length) { SAVE.tierPuzzles[tier] = (SAVE.tierPuzzles[tier] || 0) + n; logGot('tierPuzzle', tier, n); return `${TIERS[tier].many} пазлы-джокеры`; }
  const id = ids[Math.floor(Math.random() * ids.length)];
  addPuzzles(id, n);
  logGot('puzzle', id, n);
  return WEAPONS[id].name;
}
// Джокеры (на будущее — особые награды): пазлы и гемы цвета, игрок сам выбирает, куда вложить
function useJokerPuzzles(id) {
  const t = WEAPONS[id].tier, n = SAVE.tierPuzzles[t] || 0;
  if (!n || wLvl(id) >= ECON.weaponMax) return false;
  SAVE.tierPuzzles[t] = 0;
  addPuzzles(id, n);
  save();
  return true;
}
function useJokerGem(id) {
  const t = WEAPONS[id].tier;
  if (!(SAVE.jokerGems[t] > 0) || wLvl(id) >= ECON.weaponMax) return false;
  SAVE.jokerGems[t]--;
  SAVE.weapons[id] = wLvl(id) + 1;
  save();
  return true;
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
  if (r.gold) { const g = rewardGold(r); SAVE.gold += g; got.push(g + ' ●'); logGot('gold', 'gold', g); }
  if (r.stars) { SAVE.stars += r.stars; got.push(r.stars + ' ⭐'); logGot('stars', 'stars', r.stars); }
  for (const t in r.puzzles || {}) got.push(`🧩${r.puzzles[t]} → ${grantPuzzles(t, r.puzzles[t])}`);
  for (const k in r.keys || {}) { SAVE.keys[k] += r.keys[k]; got.push(keyChar(k) + r.keys[k]); logGot('key', k, r.keys[k]); }
  if (r.gems) { SAVE.gems.boost += r.gems; got.push(`💎${r.gems}`); logGot('gem', 'boost', r.gems); }
  for (const t in r.jokerPuzzles || {}) { SAVE.tierPuzzles[t] = (SAVE.tierPuzzles[t] || 0) + r.jokerPuzzles[t]; got.push(`★🧩${r.jokerPuzzles[t]}`); logGot('tierPuzzle', t, r.jokerPuzzles[t]); }
  for (const t in r.jokerGems || {}) { SAVE.jokerGems[t] = (SAVE.jokerGems[t] || 0) + r.jokerGems[t]; got.push(`★💎${r.jokerGems[t]}`); logGot('jokerGem', t, r.jokerGems[t]); }
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
// Подписки: бонусы — по лучшей из активных, билеты и рейды — сумма
const subOn = i => PAID && (SAVE.subs[i] === 'forever' || SAVE.subs[i] > Date.now());
const subsOn = () => SHOP.subs.map((P, i) => i).filter(subOn);
const subBest = (key, base) => subsOn().reduce((m, i) => Math.max(m, SHOP.subs[i][key] || base), base);
const subSum = key => subsOn().reduce((s, i) => s + (SHOP.subs[i][key] || 0), 0);
const runSpeedMax = () => subBest('speed', 1);
const freeRerolls = () => 1 + subBest('rerolls', 0); // «Новый набор» без рекламы за бой
const subGoldMul = () => subBest('goldMul', 1);
// Новый день: дневные лимиты обнуляются, подписки выдают билеты
function today() {
  const id = localDay();
  if (!SAVE.day || SAVE.day.id !== id) {
    SAVE.day = { id, n: {} };
    SAVE.tickets += subSum('tickets');
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
    // 1 пазл случайного буста, который ещё можно качать; если все на максимуме — золото
    const pool = Object.keys(MEDALS).filter(m => medalLvl(m) < MEDALS[m].max);
    if (!pool.length) return grantReward({ gold: 1000 });
    const m = pool[Math.floor(Math.random() * pool.length)];
    SAVE.boostPuzzles[m] = boostHave(m) + 1;
    save();
    logGot('boostPuzzle', m, 1);
    return 'Пазл: ' + MEDALS[m].name;
  }
  if (id === 'red') {
    let r = Math.random(), tier = 'purple';
    for (const [t, w] of RED_CHEST_TIERS) { if ((r -= w) <= 0) { tier = t; break; } }
    const to = grantPuzzles(tier, 1);
    save();
    return `${TIERS[tier].name} пазл: ${to}`;
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
  // Каждые GEM_EVERY открытий — гем на выбор
  SAVE.chestOpens[id] = (SAVE.chestOpens[id] || 0) + 1;
  if (SAVE.chestOpens[id] % GEM_EVERY === 0) { SAVE.gems[id] = (SAVE.gems[id] || 0) + 1; logGot('gem', id, 1); }
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
  if (o.keys.blue) logGot('key', 'blue', o.keys.blue);
  if (o.keys.red) logGot('key', 'red', o.keys.red);
  return grantReward({ gold: o.gold, stars: o.stars }) + `  ${KB}${o.keys.blue} синих  ${KR}${o.keys.red} красный`;
}

// Подписка (в браузере — тестовая активация): награда сразу и билеты первого дня.
// Продление добавляет дни к оставшимся; days: 0 — навсегда
function activateSub(tier) {
  const P = SHOP.subs[tier];
  today();
  SAVE.subs[tier] = P.days ? Math.max(Date.now(), SAVE.subs[tier] || 0) + P.days * 86400000 : 'forever';
  SAVE.tickets += P.tickets;
  return grantReward(P.now);
}
// Награда дня подписки — кнопкой, раз в день
function claimSubDaily(tier) {
  if (!subOn(tier) || dayUsed('sub' + tier)) return null;
  dayUse('sub' + tier);
  return grantReward(SHOP.subs[tier].daily);
}
// «Неделя подписчика»: раз в день при любой активной подписке, по кругу из 7 наград
function claimSubWeek() {
  const n = subsOn().length;
  if (!n || dayUsed('subWeek')) return null;
  dayUse('subWeek');
  const k = n >= 2 ? 2 : 1, r = SHOP.subWeek[SAVE.subWeek % 7], x = {};
  for (const key in r) x[key] = typeof r[key] === 'number' ? r[key] * k : Object.fromEntries(Object.entries(r[key]).map(([a, v]) => [a, v * k]));
  SAVE.subWeek++;
  return grantReward(x);
}
// Рейд: награда за повтор пройденной главы без боя (рейды дают подписки)
const raidsLeft = () => Math.max(0, subSum('raids') - dayUsed('raid'));
function raid(n, d) {
  if (!SAVE.cleared[clearKey(n, d)] || !raidsLeft()) return null;
  dayUse('raid');
  const r = bossReward(n, false, d);
  SAVE.gold += r.gold;
  logGot('gold', 'gold', r.gold);
  grantReward({ puzzles: r.puzzles });
  return `Рейд: глава ${n}`;
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
  h.revive = subBest('revive', false); // Золотая подписка: 1 воскрешение за бой
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

// Награда за прохождение уровня (кейс): золото, осколки, пазлы и, на некоторых главах, синие ключи
// Сложность d открыта на главе n: лёгкая — если глава открыта, остальные — после прохождения предыдущей
const diffOpen = (n, d) => n <= SAVE.unlocked && (d === 0 || !!SAVE.cleared[clearKey(n, d - 1)]);

function bossReward(n, first, d = 0) {
  const r = { ...ECON.reward100(n, first) };
  r.gold = Math.round(r.gold * DIFFS[d].gold * subGoldMul());
  // Пазлы по сложности: при повторе вдвое меньше
  r.puzzles = {};
  for (const t in DIFFS[d].puzzles) r.puzzles[t] = first ? DIFFS[d].puzzles[t] : Math.max(1, Math.ceil(DIFFS[d].puzzles[t] / 2));
  if (first && ECON.firstClearKeys[n]) r.keys = ECON.firstClearKeys[n];
  return r;
}
