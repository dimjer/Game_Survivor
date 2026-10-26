'use strict';

// ============================================================
//  Мета-прогресс: сохранение, валюта, покупки и прокачка,
//  бонусы убежища, которые применяются к герою в забеге.
// ============================================================

// Настройки (отдельно от прогресса, чтобы сброс прогресса их не трогал)
const SETTINGS_KEY = 'survivor.settings';
const S = { shake: true, dmgText: true, vibrate: true };
try { Object.assign(S, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch {} }

const SAVE_KEY = 'survivor.save';
function defaultSave() {
  return {
    gold: 0, shards: 0,
    unlocked: 1,        // максимальный открытый уровень кампании
    cleared: {},        // уровень → сколько раз пройден
    weapons: {},        // id → мета-уровень (по умолчанию 1)
    startWeapon: WEAPONS[S.weapon] ? S.weapon : 'wand', // перенос выбора из старых настроек
    perks: {}, medals: {},
    skins: ['blue'], skin: 'blue',
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

// Цена следующего уровня или null, если максимум
function weaponCost(id) {
  const L = wLvl(id);
  if (L >= ECON.weaponMax) return null;
  return { gold: ECON.weaponCost(L), shards: ECON.weaponGate(L) };
}

function upgradeWeapon(id) {
  const c = weaponCost(id);
  if (!c || !canAfford(c)) return false;
  pay(c);
  SAVE.weapons[id] = wLvl(id) + 1;
  save();
  return true;
}

// ------------------------------------------------------------
//  Перки, медальоны, косметика, питомцы
// ------------------------------------------------------------

const isOpen = id => SAVE.unlocked >= (UNLOCKS[id] || 1);

const perkLvl = id => SAVE.perks[id] || 0;
const medalLvl = id => SAVE.medals[id] || 0;

function perkCost(id) {
  const l = perkLvl(id), P = PERKS[id];
  return l >= P.max ? null : { gold: P.cost(l) };
}
function buyPerk(id) {
  const c = perkCost(id);
  if (!c || !canAfford(c)) return false;
  pay(c); SAVE.perks[id] = perkLvl(id) + 1; save();
  return true;
}

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

// Скины, одежда, питомцы: купить или надеть. kind: 'skin' | 'outfit' | 'pet'
const SHOPS = {
  skin:   { data: SKINS,   owned: 'skins',   on: 'skin' },
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
//  Бонусы убежища в забеге
// ------------------------------------------------------------

// Урон оружия с учётом мета-уровня, тотема силы и медальона ярости
function metaDmg(id, base) {
  return (base + medalLvl('dmgTotem')) * ECON.weaponMult(wLvl(id)) * (1 + 0.15 * medalLvl('fury'));
}

function applyMeta(h) {
  h.maxHp = Math.round(100 * (1 + 0.1 * perkLvl('vitality')) + 5 * medalLvl('hpTotem'));
  h.hp = h.maxHp;
  h.speed *= 1 + 0.05 * perkLvl('agility');
  h.magnet *= (1 + 0.15 * perkLvl('magnet')) * (SAVE.pet === 'owl' ? 1.6 : 1);
  h.goldMul = 1 + 0.1 * perkLvl('greed');
  h.xpMul = 1 + 0.1 * perkLvl('wisdom');
  h.revive = perkLvl('revive') > 0;
}

// Награда за прохождение уровня (кейс): золото, осколки и, возможно, медальон
function bossReward(n, first) {
  const r = { ...ECON.reward100(n, first) };
  if (first && ECON.firstClearMedal[n]) {
    r.medal = ECON.firstClearMedal[n];
  } else if (!first && Math.random() < ECON.replayMedalChance) {
    const pool = Object.keys(MEDALS).filter(id => MEDALS[id].rare && !medalLvl(id) && !Object.values(ECON.firstClearMedal).includes(id));
    if (pool.length) r.medal = pool[Math.floor(Math.random() * pool.length)];
    else r.shards += 2;
  }
  return r;
}
