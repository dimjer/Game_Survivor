'use strict';

// ============================================================
//  Данные и баланс: враги, боссы, оружие, арены, экономика,
//  предметы убежища. Все числа для тюнинга — здесь.
//  Как считалась экономика кампании — см. ECONOMY.md
// ============================================================

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------
//  Мобы: 4 архетипа задают характеристики, 20 видов — внешний вид
// ------------------------------------------------------------

const ARCH = {
  grunt:  { r: 9,  hp: 24,  speed: 46, dmg: 8,  xp: 1, weight: 1 },
  runner: { r: 7,  hp: 14,  speed: 82, dmg: 6,  xp: 1, weight: 0.7 },
  brute:  { r: 12, hp: 60,  speed: 40, dmg: 11, xp: 2, weight: 0.35 },
  tank:   { r: 16, hp: 180, speed: 30, dmg: 15, xp: 5, weight: 0.1 },
};

// Особые мобы (не по локациям): появляются по таймеру главы, см. ECON ниже.
// swarm — стая: быстрые, хилые, кусают один раз и умирают (bite — доля макс. HP героя за укус);
// assassin — убийца: очень быстрый, бьёт больно, умирает с одного удара;
// fat — толстяк: с него падает бой-бонус (BOONS); magnet — убегает, с него падает магнит
// hp и dmg — множители к HP и урону обычного моба главы; oneHit — умирает с любого удара
const SPECIAL = {
  swarm:    { r: 5,  hp: 1,  speed: 150, dmg: 0, xp: 0.3, bite: 0.015, oneHit: true },
  assassin: { r: 7,  hp: 1,  speed: 240, dmg: 3, xp: 3, oneHit: true, color: '#2a1a33' },
  fat:      { r: 20, hp: 25, speed: 28, dmg: 1.5, xp: 15, color: '#e9c46a' },
  magnet:   { r: 11, hp: 6,  speed: 0.75, dmg: 0, xp: 5, life: 25, color: '#4cc9f0' }, // speed — доля скорости героя
};

// Уровень моба (tier) = индекс + 1. По 3 вида на локацию, в порядке LOCATIONS
const MOBS = [
  // Опушка
  { name: 'Волк',                 arch: 'runner', shape: 'tri',  color: '#9aa3ad' },
  { name: 'Гоблин',               arch: 'grunt',  shape: 'sq',   color: '#5fb84a' },
  { name: 'Лесной дух',           arch: 'brute',  shape: 'circ', color: '#a8e6cf' },
  // Иссохшие земли
  { name: 'Гнилой зверь',         arch: 'runner', shape: 'tri',  color: '#a39060' },
  { name: 'Ядовитая спора',       arch: 'grunt',  shape: 'circ', color: '#9acd32' },
  // Мёртвое ходячее дерево: стрелы, нова и прочее его не берут — только топоры, огонь стрел и Живое дерево
  { name: 'Мёртвый древень',      arch: 'tank',   shape: 'tree', color: '#8a6a4a', woody: true },
  // Башня Равновесия
  { name: 'Дух магии',            arch: 'runner', shape: 'dia',  color: '#7df9ff' },
  { name: 'Элементаль',           arch: 'grunt',  shape: 'dia',  color: '#ff8a4c' },
  { name: 'Голем',                arch: 'tank',   shape: 'hex',  color: '#8a8f99' },
  // Шахты Подгорья
  { name: 'Шепчущая тень',        arch: 'runner', shape: 'dia',  color: '#8a7ad0' },
  { name: 'Одержимый шахтёр',     arch: 'grunt',  shape: 'sq',   color: '#c8a165' },
  { name: 'Каменная тварь',       arch: 'brute',  shape: 'hex',  color: '#7a7f88' },
  // Небесные Врата
  { name: 'Огненная птица',       arch: 'runner', shape: 'tri',  color: '#ffb347' },
  { name: 'Падший ангел',         arch: 'grunt',  shape: 'circ', color: '#b0a0ff' },
  { name: 'Страж без памяти',     arch: 'tank',   shape: 'sq',   color: '#d8d4e8' },
  // Преисподняя
  { name: 'Адская гончая',        arch: 'runner', shape: 'tri',  color: '#ff5d3a' },
  { name: 'Демон-солдат',         arch: 'grunt',  shape: 'sq',   color: '#d0203a' },
  { name: 'Палач',                arch: 'tank',   shape: 'hex',  color: '#a01830' },
  // Бездна
  { name: 'Осколок времени',      arch: 'runner', shape: 'dia',  color: '#e040fb' },
  { name: 'Тень героя',           arch: 'grunt',  shape: 'sq',   color: '#9a9ab8' },
  { name: 'Порождение пустоты',   arch: 'brute',  shape: 'circ', color: '#7a5ad0' },
];

// Поведение (ai): golem — идёт напролом и делает рывки; lich — держит дистанцию, стреляет
// кольцом снарядов и призывает мобов; hybrid (босс локации) — рывки, кольца и призыв вместе.
const BOSSES = {
  wolfLeader:  { name: 'Вожак стаи',             ai: 'golem',  r: 26, hp: 700, speed: 42, dmg: 25, color: '#9aa3ad', xp: 40 },
  goblinShaman:{ name: 'Шаман гоблинов',         ai: 'lich',   r: 22, hp: 560, speed: 34, dmg: 18, color: '#5fb84a', xp: 40 },
  barkWarden:  { name: 'Кора-Хранитель',         ai: 'golem',  r: 28, hp: 700, speed: 36, dmg: 25, color: '#8a6a3a', xp: 40 },
  rootGuard:   { name: 'Корень-Страж',           ai: 'hybrid', r: 32, hp: 700, speed: 34, dmg: 25, color: '#6b8f3a', xp: 60 },
  rotBoar:     { name: 'Гнилой вепрь',           ai: 'golem',  r: 26, hp: 700, speed: 40, dmg: 25, color: '#a39060', xp: 40 },
  sporeLord:   { name: 'Споровик',               ai: 'lich',   r: 22, hp: 560, speed: 34, dmg: 18, color: '#9acd32', xp: 40 },
  rotMother:   { name: 'Мать Гнили',             ai: 'hybrid', r: 32, hp: 700, speed: 34, dmg: 25, color: '#7a9a2a', xp: 60 },
  stoneGolem:  { name: 'Каменный голем',         ai: 'golem',  r: 28, hp: 700, speed: 38, dmg: 25, color: '#b0a090', xp: 40 },
  madMage:     { name: 'Безумный маг',           ai: 'lich',   r: 22, hp: 560, speed: 34, dmg: 18, color: '#c77dff', xp: 40 },
  archmage:    { name: 'Сломанный Архимаг',      ai: 'hybrid', r: 30, hp: 700, speed: 36, dmg: 25, color: '#7df9ff', xp: 60 },
  oreGiant:    { name: 'Рудный исполин',         ai: 'golem',  r: 30, hp: 700, speed: 36, dmg: 25, color: '#c8a165', xp: 40 },
  whisperer:   { name: 'Тень-шептунья',          ai: 'lich',   r: 22, hp: 560, speed: 34, dmg: 18, color: '#8a7ad0', xp: 40 },
  whisperVein: { name: 'Шепчущая Жила',          ai: 'hybrid', r: 34, hp: 700, speed: 32, dmg: 25, color: '#9d6bdf', xp: 60 },
  gateGuard:   { name: 'Страж Врат',             ai: 'golem',  r: 28, hp: 700, speed: 38, dmg: 25, color: '#e8e0d0', xp: 40 },
  fallenSeraph:{ name: 'Падший серафим',         ai: 'lich',   r: 22, hp: 560, speed: 36, dmg: 18, color: '#ffd166', xp: 40 },
  gatekeeper:  { name: 'Привратник',             ai: 'hybrid', r: 32, hp: 700, speed: 34, dmg: 25, color: '#fff3a0', xp: 60 },
  hellBrute:   { name: 'Адский громила',         ai: 'golem',  r: 30, hp: 700, speed: 40, dmg: 25, color: '#d0203a', xp: 40 },
  demonologist:{ name: 'Демонолог',              ai: 'lich',   r: 22, hp: 560, speed: 34, dmg: 18, color: '#ff5d3a', xp: 40 },
  fireLord:    { name: 'Владыка Огненных Врат',  ai: 'hybrid', r: 34, hp: 700, speed: 36, dmg: 25, color: '#ff8a4c', xp: 60 },
  timeEater:   { name: 'Пожиратель времени',     ai: 'golem',  r: 28, hp: 700, speed: 42, dmg: 25, color: '#e040fb', xp: 40 },
  heroShade:   { name: 'Отражение героя',        ai: 'lich',   r: 22, hp: 560, speed: 38, dmg: 18, color: '#9a9ab8', xp: 40 },
  gateOpener:  { name: 'Тот, кто открыл Врата',  ai: 'hybrid', r: 36, hp: 700, speed: 36, dmg: 25, color: '#f0e8ff', xp: 80 },
};

// ------------------------------------------------------------
//  Оружие и пассивки внутри забега
// ------------------------------------------------------------

// Тиры оружия (см. DESIGN.md). Пазлы тира, на который ещё нет оружия, копятся на аккаунте
const TIERS = {
  green:  { name: 'Зелёный',    many: 'зелёные',    color: '#57e389' },
  blue:   { name: 'Синий',      many: 'синие',      color: '#4cc9f0' },
  purple: { name: 'Фиолетовый', many: 'фиолетовые', color: '#c77dff' },
  yellow: { name: 'Жёлтый',     many: 'жёлтые',     color: '#ffd166' },
  red:    { name: 'Красный',    many: 'красные',    color: '#ff5d73' },
};
const PUZZLES_PER_LEVEL = 10; // 10 пазлов оружия = +1 уровень

// Оружие забега. В бою на новом уровне героя выпадают улучшения уже взятого оружия:
// у каждого оружия свои (ups: сколько раз можно взять и что даёт). stats(u) собирает
// итоговые характеристики из взятых улучшений u = { id улучшения: сколько раз }.
const WEAPONS = {
  // Внутренние id (wand, aura) остались от первых версий — на них завязаны сохранения
  wand: {
    name: 'Лук', color: '#e0a860', tier: 'green', info: 'Стреляет стрелами в ближайшего врага',
    ups: {
      dmg:    { max: 5, name: 'Урон',        info: '+30% урона' },
      rate:   { max: 5, name: 'Перезарядка', info: '−12% перезарядки' },
      count:  { max: 3, name: 'Стрела',      info: '+1 стрела в залпе' },
      pierce: { max: 2, name: 'Пробитие',    info: 'Стрела пробивает ещё 1 врага' },
      volley: { max: 3, name: 'Залп',        info: '+20% шанс второго залпа' },
      fire:   { max: 3, name: 'Огненная стрела', info: 'Стрела поджигает: каждое попадание — +1 стак ожога' },
    },
    stats: u => ({ dmg: 10 * (1 + 0.3 * u.dmg), cd: 0.8 * 0.88 ** u.rate, count: 1 + u.count, pierce: 1 + u.pierce, volley: 0.2 * u.volley, fire: u.fire }),
  },
  orbit: {
    name: 'Сюрикены', color: '#c9d3e0', tier: 'purple', info: 'Сюрикены кружат вокруг героя',
    ups: {
      count:  { max: 4, name: 'Сюрикен',      info: '+1 сюрикен' },
      dmg:    { max: 5, name: 'Урон',         info: '+30% урона' },
      radius: { max: 3, name: 'Размах',       info: 'Сюрикены летают дальше от героя' },
      spin:   { max: 3, name: 'Вращение',     info: '+15% к скорости вращения' },
      push:   { max: 3, name: 'Отбрасывание', info: '+50% к отбрасыванию' },
    },
    stats: u => ({ count: 2 + u.count, dmg: 11 * (1 + 0.3 * u.dmg), radius: 53 + 10 * u.radius, spin: 2.8 * (1 + 0.15 * u.spin), push: 140 * (1 + 0.5 * u.push) }),
  },
  aura: {
    name: 'Меч', color: '#c8d0dc', tier: 'green', info: 'Рубит дугой всех врагов перед героем',
    ups: {
      radius: { max: 5, name: 'Длинный клинок', info: '+12 к длине удара' },
      dmg:    { max: 5, name: 'Урон',           info: '+30% урона' },
      rate:   { max: 4, name: 'Быстрый взмах',  info: '−12% перезарядки' },
      arc:    { max: 3, name: 'Широкий взмах',  info: 'Дуга удара шире на 30°' },
    },
    stats: u => ({ radius: 62 + 12 * u.radius, dmg: 14 * (1 + 0.3 * u.dmg), cd: 0.6 * 0.88 ** u.rate, arc: 2.1 + 0.52 * u.arc, push: 90 }),
  },
  nova: {
    name: 'Нова', color: '#c77dff', tier: 'blue', info: 'Залп снарядов во все стороны',
    ups: {
      count:  { max: 4, name: 'Снаряды',     info: '+3 снаряда в кольце' },
      dmg:    { max: 5, name: 'Урон',        info: '+30% урона' },
      rate:   { max: 4, name: 'Перезарядка', info: '−12% перезарядки' },
      volley: { max: 3, name: 'Залп',        info: '+20% шанс второго кольца' },
    },
    stats: u => ({ count: 10 + 3 * u.count, dmg: 11 * (1 + 0.3 * u.dmg), cd: 2.9 * 0.88 ** u.rate, volley: 0.2 * u.volley }),
  },
  stench: {
    name: 'Аура', color: '#a8c256', tier: 'blue', info: 'Вонючее облако жжёт всех врагов рядом',
    ups: {
      radius: { max: 5, name: 'Радиус',   info: '+12 к радиусу' },
      dmg:    { max: 5, name: 'Урон',     info: '+30% урона' },
      tick:   { max: 3, name: 'Жар',      info: 'Жжёт на 15% чаще' },
      slow:   { max: 3, name: 'Вязкость', info: 'Враги в ауре медленнее на 10%' },
    },
    stats: u => ({ radius: 52 + 12 * u.radius, dmg: 5 * (1 + 0.3 * u.dmg), tick: 0.5 * 0.85 ** u.tick, slow: 0.1 * u.slow }),
  },
  // Топоры: летают вокруг героя, как сюрикены, но их максимум 2 и бьют сильнее. Рубят Мёртвых древней
  axes: {
    name: 'Топоры', color: '#d9a066', tier: 'blue', info: 'Тяжёлые топоры кружат вокруг героя. Рубят мёртвые деревья',
    ups: {
      count:  { max: 1, name: 'Второй топор', info: '+1 топор (максимум 2)' },
      dmg:    { max: 5, name: 'Урон',         info: '+30% урона' },
      radius: { max: 3, name: 'Размах',       info: 'Топоры летают дальше от героя' },
      spin:   { max: 3, name: 'Вращение',     info: '+15% к скорости вращения' },
    },
    stats: u => ({ count: 1 + u.count, dmg: 30 * (1 + 0.3 * u.dmg), radius: 62 + 10 * u.radius, spin: 2.2 * (1 + 0.15 * u.spin), push: 220 }),
  },
};
const MAX_AXES = 2;
const MAGIC_WEAPONS = ['nova', 'stench']; // их усиливает бой-бонус «Магия»
const MAX_RUN_WEAPONS = 8; // сколько оружия можно собрать за бой
const newUps = id => Object.fromEntries(Object.keys(WEAPONS[id].ups).map(k => [k, 0])); // оружие без улучшений

// Характеристики героя в бою: одна из четырёх карточек на новом уровне
const PASSIVES = {
  hp:     { name: 'Сердце',      color: '#ff5d73', max: 5, info: '+20 к макс. HP',          apply: h => { h.maxHp += 20; h.hp += 20; } },
  speed:  { name: 'Сапоги',      color: '#57e389', max: 5, info: '+10% скорость',           apply: h => { h.speed *= 1.1; } },
  magnet: { name: 'Магнит',      color: '#4cc9f0', max: 5, info: '+35% радиус сбора опыта', apply: h => { h.magnet *= 1.35; } },
  regen:  { name: 'Регенерация', color: '#80ffdb', max: 5, info: '+0.6 HP в секунду',       apply: h => { h.regen += 0.6; } },
};

// Бой-бонусы: падают с толстяков прямо в бою и копятся до конца боя (не путать с бустами убежища)
const BOONS = {
  xp:     { name: 'Опыт',      color: '#4cc9f0', info: '+25% опыта' },
  proj:   { name: 'Снаряды',   color: '#ffd166', info: '+1 стрела, сюрикен и топор, +3 снаряда Новы' },
  magic:  { name: 'Магия',     color: '#c77dff', info: '+25% урона Новы и Ауры' },
  crit:   { name: 'Крит',      color: '#ff9f1c', info: '+5% шанс крита' },
  size:   { name: 'Размер',    color: '#a8e6cf', info: '+15% к размеру атак' },
  speed:  { name: 'Скорость',  color: '#57e389', info: '+10% к скорости героя' },
  hp:     { name: 'Здоровье',  color: '#ff5d73', info: '+25 к макс. HP' },
  thorns: { name: 'Шипы',      color: '#b8c0cc', info: 'Отражает 30% урона от касаний' },
  regen:  { name: 'Регенерация', color: '#80ffdb', info: '+0.8 HP в секунду' },
  magnet: { name: 'Магнит',    color: '#7df9ff', info: '+35% радиус сбора' },
};

// ------------------------------------------------------------
//  Локации кампании (см. DESIGN.md). Это и поля боя: декор и палитра.
//  mult — множитель сложности на входе в локацию; hazard — что горит
//  на поле при особенности «h»; bosses — [чётный уровень, нечётный, финал].
// ------------------------------------------------------------

const LOCATIONS = [
  { id: 'forest', name: 'Опушка Звёздного леса', from: 1, to: 10, mult: 1, color: '#57e389', bg: '#101611', decor: 'grass',
    hazard: 'swamp', bosses: ['goblinShaman', 'wolfLeader', 'rootGuard'],
    pal: { patch: ['#141e15', '#0d130e'], tuft: '#26391f', stone: ['#2a2f2b', '#383e39'], bush: ['#1a2b19', '#233a20'], flowers: ['#7d7444', '#6f5470', '#566b8a'] } },
  { id: 'withered', name: 'Иссохшие земли', from: 11, to: 25, mult: 3, color: '#c8b45a', bg: '#15120c', decor: 'grass',
    hazard: 'sand', bosses: ['sporeLord', 'rotBoar', 'rotMother'],
    pal: { patch: ['#1d1810', '#100d08'], tuft: '#3a3220', stone: ['#2e2a22', '#3b362c'], bush: ['#2a2416', '#3a3020'], flowers: ['#5a6a2a', '#4a3a2a', '#6a5a3a'] } },
  { id: 'tower', name: 'Башня Равновесия', from: 26, to: 45, mult: 8, color: '#7df9ff', bg: '#0a0b18', decor: 'crypt',
    hazard: 'fire', bosses: ['madMage', 'stoneGolem', 'archmage'],
    pal: { tiles: ['#12142a', '#101226', '#15182e'], crack: '#0a0b18', debris: '#1e2240', bone: '#343a5a', skull: '#3a4060' } },
  { id: 'mines', name: 'Шахты Подгорья', from: 46, to: 70, mult: 20, color: '#c8a165', bg: '#0e0c0a', decor: 'crypt',
    hazard: 'thorns', bosses: ['whisperer', 'oreGiant', 'whisperVein'],
    pal: { tiles: ['#1a1612', '#17130f', '#1d1915'], crack: '#0e0c0a', debris: '#2a241c', bone: '#3a3328', skull: '#40382c' } },
  { id: 'gates', name: 'Небесные Врата', from: 71, to: 100, mult: 50, color: '#fff3a0', bg: '#10131c', decor: 'crypt',
    hazard: 'fire', bosses: ['fallenSeraph', 'gateGuard', 'gatekeeper'],
    pal: { tiles: ['#1c2130', '#1a1e2c', '#202536'], crack: '#10131c', debris: '#2c3448', bone: '#4a5470', skull: '#4f5a78' } },
  { id: 'hell', name: 'Преисподняя', from: 101, to: 140, mult: 120, color: '#ff8a4c', bg: '#140b09', decor: 'lava',
    hazard: 'lava', bosses: ['demonologist', 'hellBrute', 'fireLord'] },
  { id: 'abyss', name: 'Бездна', from: 141, to: 150, mult: 300, color: '#e040fb', bg: '#08060e', decor: 'crypt',
    hazard: 'void', bosses: ['heroShade', 'timeEater', 'gateOpener'],
    pal: { tiles: ['#120c1e', '#0f0a19', '#150e24'], crack: '#08060e', debris: '#2a1a40', bone: '#3a2a55', skull: '#45306a' } },
];
const ARENAS = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));
const locOf = n => LOCATIONS.find(l => n <= l.to) || LOCATIONS[LOCATIONS.length - 1];
const locIndex = id => LOCATIONS.findIndex(l => l.id === id);

// Особенности уровня (буквы в LEVELS). Что они делают в бою — числа в ECON ниже
const TRAITS = {
  a: { name: 'Броня',   icon: '🛡', color: '#b8c0cc', info: 'Мобы и босс режут 30% урона' },
  s: { name: 'Стаи',    icon: '🐺', color: '#ffd166', info: 'Мобов больше, они слабее и налетают стаями' },
  r: { name: 'Стрелки', icon: '🏹', color: '#4cc9f0', info: 'Часть мобов стреляет издалека' },
  z: { name: 'Щит босса', icon: '🔰', color: '#7df9ff', info: 'Щит гасит снаряды без пробития и Нову. Бери Лук с Пробитием, Меч или Сюрикены' },
};
// slow — насколько тормозит героя в луже; dmg — жжёт ли при касании. Питомец со своим видом луж (PETS.ward) защищает
const HAZARDS = {
  swamp:  { name: 'Болото',         icon: '🟢', color: '#6b8f3a', rgb: '107,143,58',  slow: 0.5 },
  sand:   { name: 'Сыпучие пески',  icon: '⏳', color: '#d8b46a', rgb: '216,180,106', slow: 0.55, pull: 40 },
  thorns: { name: 'Колючие лозы',   icon: '🌿', color: '#4f8a3a', rgb: '79,138,58',   slow: 0.4, dmg: true },
  lava:   { name: 'Лава',           icon: '🌋', color: '#ff5a14', rgb: '255,90,20',   slow: 0.35, dmg: true },
  fire:   { name: 'Огонь',          icon: '🔥', color: '#ff8a4c', rgb: '255,138,76',  dmg: true },
  void:   { name: 'Разломы',        icon: '🌀', color: '#c77dff', rgb: '199,125,255', dmg: true },
};
const levelTraits = n => [...LEVELS[n - 1][1]];
const traitView = (t, n) => (t === 'h' ? HAZARDS[locOf(n).hazard] : TRAITS[t]);

// ------------------------------------------------------------
//  Экономика. Сложность задана по локациям (см. DESIGN.md).
//  Переходный баланс: мета-прокачка пока старая, пересчёт на этапах 2–3.
// ------------------------------------------------------------

const CAMPAIGN_LEVELS = 150;

const after10 = n => Math.max(0, n - 10);
const rewardScale = n => ECON.levelHp(n) ** 0.75; // награды растут вместе со сложностью, но медленнее

const ECON = {
  // Сложность уровня кампании n. Внутри локации плавно растёт к множителю следующей (на 80% пути),
  // на входе в новую локацию — скачок: это стена, под которую нужно фармить.
  levelHp: n => {
    const L = locOf(n), next = LOCATIONS[LOCATIONS.indexOf(L) + 1];
    const t = (n - L.from) / (L.to - L.from + 1);
    return L.mult * ((next ? next.mult : L.mult * 2.5) / L.mult) ** (0.8 * t);
  },
  levelDmg: n => 1 + 0.05 * (Math.min(n, 10) - 1) + 0.03 * after10(n),                          // урон мобов
  levelSpeed: n => Math.min(1.25, 1 + 0.015 * (n - 1)),
  // Сколько секунд идёт глава до появления босса: 1–10 — 1.5 мин, к 20-й — 5, к 30-й — 7, с 40-й — 10
  bossTime: n => 60 * (n <= 10 ? 1.5 : n <= 20 ? 1.5 + 3.5 * (n - 10) / 10 : n <= 30 ? 5 + 2 * (n - 20) / 10 : n <= 40 ? 7 + 3 * (n - 30) / 10 : 10),
  spawnRate: n => 1.2 + 0.05 * Math.min(n, 70), // мобов в секунду на 1-й волне
  // 4 волны: 0–25%, 25–50%, 50–75%, 75–100% прогресса
  waveHp: [1, 1.15, 1.3, 1.5],
  waveRate: [1, 1.3, 1.6, 2],
  bossHp: n => 2.5 * ECON.levelHp(n) * (n === 1 ? 0.6 : 1) * (n === locOf(n).to ? 1.6 : 1), // босс локации толще
  mobHp: n => 1 + 0.04 * (n - 1), // мобы крепнут с каждой главой, а не только скачками на входе в локацию

  // Особенности уровня
  armor: 0.3,                                  // «Броня»: доля урона, которую режут мобы и босс
  swarmRate: 1.6, swarmHp: 0.6, swarmRunner: 3, // «Стаи»: чаще спавн, слабее мобы, больше бегунов
  packEvery: 18, packSize: 12,                 // и стая бегунов с одной стороны
  shooterChance: 0.25, shooterCd: 2.8,         // «Стрелки»: доля стреляющих мобов и их перезарядка
  hazardEvery: 3.5, hazardLife: 8, hazardDmg: 6, // «Опасность»: лужа раз в N с, живёт N с, урон за касание

  // Промежуточный (элитный) моб: убил — выбираешь новое оружие из набора на бой
  eliteAt: 0.12,               // в кампании — на каждых 12% прогресса уровня (до 7 за уровень)
  eliteEvery: 50,              // в бесконечном — раз в столько секунд
  eliteHp: 8, eliteSize: 1.6,

  // Особые мобы (SPECIAL). В кампании — на долях прогресса главы, в бесконечном — раз в столько секунд
  fatAt: [0.2, 0.45, 0.7, 0.9], fatEvery: 70,     // толстяк с бой-бонусом
  magnetAt: [0.5, 0.95], magnetEvery: 150,      // моб-магнит: на 50% и перед боссом
  swarmFrom: 3, swarmEvery: 40, swarmSize: 20,  // стая птиц/пауков: с какой главы, как часто, сколько
  assassinFrom: 6, assassinEvery: 30,           // убийца: с какой главы и как часто
  burnTime: 3, burnDps: 0.05, burnMax: 10,      // ожог огненной стрелы: длительность, доля урона стрелы/с за стак, макс. стаков
  treeRevive: 0.35,                             // шанс, что Живое дерево возродит срубленного Мёртвого древня

  // Гардероб: у каждой характеристики своя цена, она растёт с каждой её прокачкой
  // (s — сколько раз прокачана именно эта характеристика): 10, 17, 30, 45, 65 … ≈800 к 25-му шагу, ≈60 тыс. к 500-му
  statSteps: 5,
  statCost: s => Math.round(10 + (4 * s) ** 1.45),
  critChance: 0.05,
  campXp: 2,                                   // множитель опыта: забеги короче бесконечных

  // Награды кампании
  coinChance: 0.2,                             // шанс монеты с моба
  campCoin: n => (1 + 0.1 * (n - 1)) * rewardScale(n), // номинал монеты на уровне n
  reward25: n => ({ gold: Math.round((10 + 5 * n) * rewardScale(n)), shards: 0 }),
  reward50: n => ({ gold: Math.round((20 + 10 * n) * rewardScale(n)), shards: n >= 2 ? 1 : 0 }),
  reward100: (n, first) => first
    ? { gold: Math.round((70 + 45 * n) * rewardScale(n)), shards: 1 + Math.floor(n / 3) }
    : { gold: Math.round((70 + 45 * n) / 2 * rewardScale(n)), shards: 1 },
  firstClearKeys: { 10: 1 },                   // синие ключи за первое прохождение главы (там открываются бусты)

  // Мета-прокачка оружия: уровни 1–50, каждые 5 уровней — новый ранг за осколки
  weaponMax: 50,
  weaponMult: L => 1.12 ** (L - 1),

  // Бесконечный режим: только золото
  // Номинал монеты растёт со временем забега и с прогрессом кампании, чтобы фарм не обесценивался
  endlessCoin: (t, unlocked) => (1 + 0.1 * (unlocked - 1)) * rewardScale(unlocked) * (1 + 0.25 * Math.floor(t / 120)),
  endlessCoinChance: 0.25,
  rampKills: 2000,            // после стольких убийств враги начинают звереть
  rampHp: 1.0012,             // ×HP за каждое убийство сверх порога (≈×3.3 за 1000)
  hatchAt: 120,               // через сколько секунд открывается подвал
  deathKeep: 0.5,             // доля золота, которая остаётся при смерти
};

// Сложности главы: та же локация и мобы, но толще и больнее; награды лучше.
// Сложный открывается после лёгкого на этой главе, героический — после сложного.
// puzzles — пазлы в кейсе за босса (при повторе вдвое меньше, но не меньше 1)
const DIFFS = [
  { name: 'Лёгкий',      color: '#57e389', hp: 1, dmg: 1,   gold: 1,   puzzles: { green: 6, blue: 2 } },
  { name: 'Сложный',     color: '#ffd166', hp: 3, dmg: 1.6, gold: 2.5, puzzles: { blue: 4, purple: 2 } },
  { name: 'Героический', color: '#ff5d73', hp: 8, dmg: 2.5, gold: 6,   puzzles: { yellow: 3, red: 1 } },
];
const clearKey = (n, d) => (d ? n + 'hx'[d - 1] : String(n)); // ключ в SAVE.cleared

// Разделы убежища открываются, когда игрок дошёл до этого уровня кампании
const UNLOCKS = { boost: 10, pet: 15 };

// Название, лор и босс уровня кампании (тексты уровней — в levels.js)
const levelArena = n => locOf(n).id;
const levelName = n => LEVELS[n - 1][0];
const levelLore = n => LEVELS[n - 1][2];
// Особые боссы отдельных глав; остальные главы берут боссов локации
const LEVEL_BOSS = { 3: 'barkWarden' };
const levelBoss = n => { const L = locOf(n); return LEVEL_BOSS[n] || L.bosses[n === L.to ? 2 : n % 2]; };

// ------------------------------------------------------------
//  Предметы убежища
// ------------------------------------------------------------

// ------------------------------------------------------------
//  Гардероб: уровень аккаунта (4 характеристики) и герои
// ------------------------------------------------------------

// Каждую характеристику можно прокачать 5 раз за уровень аккаунта; когда все четыре
// прокачаны — новый уровень, счётчики обнуляются. Шаг даёт pip% (зависит от эволюции героя).
const STATS = {
  dmg:  { name: 'Урон',        color: '#ff9f1c', info: p => `+${p}% урона всего оружия` },
  crit: { name: 'Крит',        color: '#ffd166', info: p => `Крит-урон ×${(1.5 + p / 100).toFixed(2)} (шанс 5%)` },
  hp:   { name: 'Здоровье',    color: '#ff5d73', info: p => `+${p}% к макс. HP` },
  cd:   { name: 'Перезарядка', color: '#4cc9f0', info: p => `+${p}% к скорости атаки` },
};
const ACCOUNT_MAX = 150;
// Награды за уровень аккаунта (выдаются, когда появятся пазлы, звёзды и оружие по тирам — см. DESIGN.md)
const ACCOUNT_REWARDS = {
  10: '10 случайных зелёных пазлов', 20: 'Случайное зелёное или синее оружие', 30: 'Синее оружие №1', 40: 'Звёзды',
  50: '+2% к характеристике на выбор', 60: 'Синее оружие №2', 70: 'Фиолетовые пазлы', 80: 'Случайное жёлтое оружие',
  90: 'Синее оружие №3', 100: 'Звёзды', 110: 'Синее оружие №4', 120: '+3% к характеристике на выбор', 130: 'Звёзды',
  140: 'Жёлтые и красные пазлы', 150: 'Случайное красное оружие',
};

// Герои. Внешний вид — палитра спрайта (HERO_PAL: 1 — кожа, 3 — одежда). Герой определяет
// стартовое оружие и активку. Пассивки всех открытых героев работают всегда: +% к их оружию.
// Открываются за звёзды ⭐ (их дают недельные задания).
const RARITY = [{ name: 'Базовый', color: '#c8cbd6' }, { name: 'Редкий', color: '#4cc9f0' }, { name: 'Эпический', color: '#c77dff' }, { name: 'Легендарный', color: '#ff9f1c' }];
// Редкость героя = редкость его оружия; у каждого из 5 оружий свой герой
const HEROES = {
  orin:   { name: 'Орин',   title: 'юный лучник',      race: 'Люди',   rarity: 0, weapon: 'wand',  stars: 0,
    pal: { 1: '#f2c9a0', 3: '#3e8ef7' }, desc: 'Юный лучник из деревни у Звёздного леса. Стреляет быстро и метко — с него начинается путь.',
    active: 'Град стрел',   activeInfo: 'лук стреляет вдвое чаще' },
  // id faeron остался от эльфа-клинка — на нём держатся сохранения
  faeron: { name: 'Кайто',  title: 'ниндзя',           race: 'Люди',   rarity: 2, weapon: 'orbit', stars: 1000,
    pal: { 1: '#e0b48a', 3: '#2b2d3a', 9: '#c0303a' }, desc: 'Ниндзя из далёкого клана. Сюрикены режут всех, кто подойдёт слишком близко.',
    active: 'Вихрь сюрикенов', activeInfo: 'сюрикенов больше, режут сильнее',
    body: ['..0000..', '.099990.', '.012120.', '.033330.', '..0330..', '.033330.', '01333310', '..3333..'] },
  grax:   { name: 'Гракс',  title: 'орк-рубака',       race: 'Орки',   rarity: 0, weapon: 'aura',  stars: 1000,
    pal: { 1: '#9ab070', 3: '#8a96a8' }, desc: 'Орк-рубака. Один широкий взмах меча — и толпа редеет.',
    active: 'Вихрь',         activeInfo: 'меч рубит по кругу и на треть дальше' },
  eliana: { name: 'Элиана', title: 'страж света',      race: 'Ангелы', rarity: 1, weapon: 'nova',  stars: 1000,
    pal: { 1: '#f8e0c8', 3: '#e8e4ff' }, desc: 'Страж света с Небесных Врат. Её нова бьёт во все стороны и лечит.',
    active: 'Сияние',        activeInfo: 'нова бьёт втрое чаще, лечит 15% HP' },
  // Болотный тролль: зелёная кожа, клыки (7), лохмотья
  burp:   { name: 'Бурп',   title: 'болотный тролль',  race: 'Тролли', rarity: 1, weapon: 'stench', stars: 1000,
    pal: { 1: '#7fa05a', 3: '#5a4a32' }, desc: 'Болотный тролль. Воняет так, что враги падают ещё на подходе.',
    active: 'Зловоние',     activeInfo: 'аура вдвое шире и жжёт вдвое чаще',
    body: ['..0000..', '.011110.', '.012120.', '.071170.', '..0330..', '.033330.', '01333310', '..3333..'] },
  // Лесоруб: зелёная вязаная шапка (9), рыжая борода (c), красная клетчатая рубаха
  bjorn:  { name: 'Бьорн',  title: 'лесоруб',          race: 'Люди',   rarity: 1, weapon: 'axes', stars: 1000,
    pal: { 1: '#e8b48a', 3: '#c0392b', 9: '#2f6a3a', c: '#b0602a' }, desc: 'Северный лесоруб. Знает, как валить мёртвые деревья: его топоры берут даже древней.',
    active: 'Буря топоров', activeInfo: 'топоры крутятся вдвое быстрее, летают шире, +1 топор',
    body: ['..0000..', '.099990.', '.012120.', '.0cccc0.', '..0cc0..', '.033330.', '01333310', '..3333..'] },
};

// ------------------------------------------------------------
//  Недельные задания: 10 штук от лёгкого к сложному, сбрасываются в понедельник.
//  stat — счётчик недели, который растёт в игре; pts — очки шкалы кейсов.
//  Награда: gold (масштабируется прогрессом кампании), stars ⭐, puzzles { тир: шт }.
// ------------------------------------------------------------

const QUESTS = [
  { stat: 'runs',    goal: 3,    name: 'Разминка',         info: 'Сыграй 3 боя',                     pts: 10, reward: { gold: 150 } },
  { stat: 'kills',   goal: 500,  name: 'Первая кровь',     info: 'Убей 500 мобов',                   pts: 10, reward: { stars: 5 } },
  { stat: 'elites',  goal: 5,    name: 'Оружейник',        info: 'Убей 5 промежуточных мобов',       pts: 10, reward: { puzzles: { green: 10 } } },
  { stat: 'wins',    goal: 3,    name: 'Поход',            info: 'Пройди 3 главы кампании',          pts: 15, reward: { gold: 300 } },
  { stat: 'actives', goal: 15,   name: 'Сила героя',       info: 'Используй активку 15 раз',         pts: 15, reward: { stars: 10 } },
  { stat: 'upgrades',goal: 10,   name: 'Тренировка',       info: 'Прокачай характеристики 10 раз',   pts: 15, reward: { puzzles: { green: 15 } } },
  { stat: 'kills',   goal: 4000, name: 'Жнец',             info: 'Убей 4000 мобов',                  pts: 20, reward: { stars: 15 } },
  { stat: 'endless', goal: 600,  name: 'Выживший',         info: 'Продержись 10 минут в бесконечном (за неделю)', pts: 20, reward: { gold: 600 } },
  { stat: 'bosses',  goal: 10,   name: 'Охотник на боссов', info: 'Убей 10 боссов',                  pts: 25, reward: { stars: 20 } },
  { stat: 'wins',    goal: 15,   name: 'Покоритель',       info: 'Пройди 15 глав кампании',          pts: 30, reward: { stars: 30, puzzles: { green: 20 } } },
];

// Шкала кейсов недели: 5 точек, открываются очками заданий (всего 170)
const WEEK_CHESTS = [
  { at: 20,  tier: 'green',  reward: { gold: 300,  puzzles: { green: 10 } } },
  { at: 50,  tier: 'blue',   reward: { gold: 500,  stars: 10, puzzles: { blue: 10 } } },
  { at: 90,  tier: 'purple', reward: { gold: 800,  stars: 15, puzzles: { purple: 10 } } },
  { at: 130, tier: 'yellow', reward: { gold: 1200, stars: 20, puzzles: { yellow: 5 } } },
  { at: 170, tier: 'red',    reward: { gold: 2000, stars: 30, puzzles: { red: 3 } } },
];

// ------------------------------------------------------------
//  Магазин. Реклама только по кнопке; билет (из подписки) пропускает рекламу.
//  Покупки за деньги в браузере — тестовые (выдают товар без оплаты).
// ------------------------------------------------------------

// Сундуки: что внутри. gold масштабируется прогрессом кампании (как в заданиях)
const CHESTS = {
  green:  { name: 'Зелёный сундук',        color: '#57e389', reward: { gold: 100, puzzles: { green: 5 } } },
  blue:   { name: 'Синий сундук',          color: '#4cc9f0', reward: { gold: 200, puzzles: { blue: 5 } } },
  purple: { name: 'Фиолетовый сундук',     color: '#c77dff', reward: { gold: 300, puzzles: { purple: 5 } } },
  weapon: { name: 'Сундук оружия',         color: '#c77dff', info: 'Золото и 10 пазлов: зелёные 60%, синие 30%, фиолетовые 10%' },
  boost:  { name: 'Кейс бустов',           color: '#4cc9f0', info: '1 пазл случайного буста', key: 'blue' },
  red:    { name: 'Особый красный сундук', color: '#ff5d73', info: '1 запчасть: фиолет. 80% · жёлт. 15% · красн. 5%', key: 'red' },
};
const RED_CHEST_TIERS = [['purple', 0.8], ['yellow', 0.15], ['red', 0.05]];
const KEY_ADS = 1;      // ключ каждого цвета: 1 в день бесплатно + KEY_ADS за рекламу
const GEM_EVERY = 100;  // каждые 100 открытий кейса — гем: +1 уровень бусту (синий) или красному оружию (красный)
const WEAPON_CHEST_TIERS = [['green', 0.6], ['blue', 0.3], ['purple', 0.1]]; // выше фиолетового не падает

// Платное (звёзды за деньги, подписки, сундуки глав, рейды и билеты из подписок). false — для тестовых сборок:
// в магазине этого нет, бонусы подписок из старых сохранений не действуют. Включать вместе с настоящими покупками
const PAID = false;

const SHOP = {
  freeStars: { stars: 100, ads: 5 },                 // 1 раз в день бесплатно, потом 5 раз за рекламу/билет
  // Предложения дня: пазлы на конкретное оружие (каждый день другое) и иногда один сундук
  daily: {
    slots: 3, buys: 3, chestChance: 0.5,
    puzzle: { green: { n: 10, gold: 300, stars: 10 }, blue: { n: 10, stars: 30 }, purple: { n: 10, stars: 60 } }, // жёлтые и красные не продаются
    chest: { green: 30, blue: 60, purple: 120 },   // цена сундука дня в звёздах
    chestTiers: [['green', 0.6], ['blue', 0.3], ['purple', 0.1]],
  },
  weaponChest: { stars: 60, stars10: 540, ticketDaily: 1 },
  gold: [
    { name: 'Малый мешок',   gold: 500,   ads: 5 },  // 1 раз в день бесплатно, потом 5 раз за рекламу/билет
    { name: 'Средний мешок', gold: 3000,  stars: 30 },
    { name: 'Большой ящик',  gold: 10000, stars: 80 },
  ],
  starPacks: [
    { stars: 100, usd: 0.99 }, { stars: 550, usd: 4.99 }, { stars: 1200, usd: 9.99 },
    { stars: 2500, usd: 19.99 }, { stars: 6500, usd: 49.99 },
  ],
  // Подписки можно держать одновременно: скорость, «Новый набор», золото и воскрешение — по лучшей,
  // билеты, рейды и награды дня — складываются. days: 0 — навсегда
  subs: [
    { name: 'Бронза',  eur: 4.99,  days: 30, color: '#c99a6a', tickets: 5,  speed: 1.5, rerolls: 1, raids: 1,
      now: { stars: 300 }, daily: { stars: 50, keys: { blue: 1 } } },
    { name: 'Серебро', eur: 14.99, days: 30, color: '#c8cbd6', tickets: 10, speed: 2,   rerolls: 2, raids: 2,
      now: { stars: 1000 }, daily: { stars: 100, keys: { blue: 1, red: 1 } } },
    { name: 'Золото',  eur: 49.99, days: 0,  color: '#ffd166', tickets: 20, speed: 2,   rerolls: 2, raids: 3, goldMul: 1.3, revive: true,
      now: { stars: 3000, keys: { blue: 5, red: 3 } }, daily: { stars: 150, keys: { blue: 2, red: 1 } } },
  ],
  // «Неделя подписчика»: награда за каждый день с подпиской, по кругу из 7. С двумя подписками и больше — вдвое
  subWeek: [
    { stars: 200 }, { keys: { blue: 2 } }, { gold: 1000 }, { keys: { red: 1 } },
    { stars: 300 }, { keys: { blue: 2, red: 1 } }, { gems: 1 },
  ],
  // Сундук главы: платное предложение за каждые 5 пройденных уровней кампании
  chapterEvery: 5,
  chapterOffer: k => ({ usd: 4.99, stars: 100 + 20 * k, gold: 2000, keys: { blue: 2, red: 1 } }),
};

// Эволюция героя: 10 ступеней, каждую открывает гем героя (только с ивентов). Ступени накопительные
const HERO_EVO = [
  'Пассивка +100%, активка +1000% урона на 3 с, прокачка +2% за шаг',
  'Активка: +5000% урона',
  '+1 к стартовому оружию',
  'Перезарядка активки −20%',
  'Активка длится на 1 с дольше',
  'Во время активки +2 к оружию',
  'Пассивка +200%',
  'Прокачка характеристик +3% за шаг',
  'Активка ×1.5 и перезарядка ещё −20%',
  'Пассивка +300%, прокачка +4% за шаг',
];
function heroEvo(lvl) {
  const v = { passive: 100, act: 1000, dur: 3, cd: 20, start: 0, extra: 0, pip: 2 };
  if (lvl >= 2) v.act = 5000;
  if (lvl >= 3) v.start = 1;
  if (lvl >= 4) v.cd *= 0.8;
  if (lvl >= 5) v.dur += 1;
  if (lvl >= 6) v.extra = 2;
  if (lvl >= 7) v.passive = 200;
  if (lvl >= 8) v.pip = 3;
  if (lvl >= 9) { v.act *= 1.5; v.cd *= 0.8; }
  if (lvl >= 10) { v.passive = 300; v.pip = 4; }
  return v;
}

// Медальоны и тотемы — пассивные бусты. Не покупаются: только пазлы из синего кейса (синий ключ).
// Открыть буст — 1 пазл, каждый следующий уровень дороже (BOOST_PUZZLES)
const MEDALS = {
  hpTotem:    { name: 'Тотем здоровья',    rare: false, color: '#ff5d73', max: 10, info: '+5 к макс. HP' },
  dmgTotem:   { name: 'Тотем силы',        rare: false, color: '#ff9f1c', max: 5,  info: '+1 к урону всего оружия' },
  fury:       { name: 'Медальон ярости',   rare: true,  color: '#ff5d3a', max: 3,  info: '+15% урона всем оружием' },
  wandDouble: { name: 'Двойная тетива',   rare: true,  color: '#e0a860', max: 4,  info: 'Лук: +25% шанс второго залпа' },
  novaDouble: { name: 'Двойной залп: Нова', rare: true, color: '#c77dff', max: 4,  info: '+25% шанс второго кольца' },
  bladeExtra: { name: 'Лишний сюрикен',    rare: true,  color: '#7df9ff', max: 2,  info: '+1 сюрикен' },
};
const BOOST_PUZZLES = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]; // пазлов на уровень буста 1, 2, 3…

// Головные уборы: пиксели над головой героя (цвета — 5..8 в HERO_PAL)
const OUTFITS = {
  none:  { name: 'Без шапки', price: 0,    rows: [] },
  hat:   { name: 'Шляпа',     price: 120,  rows: ['..5555..', '55555555'] },
  hood:  { name: 'Капюшон',   price: 250,  rows: ['..6666..', '.666666.'] },
  horns: { name: 'Рога',      price: 500,  rows: ['7......7', '.7....7.'] },
  crown: { name: 'Корона',    price: 3000, rows: ['.8.88.8.', '.888888.'] },
  // Комбинезон-котик: белый с розовым, капюшон с ушками, розовые лапки (pal перекрашивает одежду героя).
  // С ним рядом бегает кот Жора и царапает тех, кто бьёт героя (только визуал)
  // head — капюшон вместо 4 верхних строк героя: обнимает лицо по бокам, как ушанка
  catEars: { name: 'Комбинезон-котик', price: 300, cat: true, info: 'С тобой бегает кот Жора', rows: ['.b....b.', 'bab..bab'],
    head: ['.bbbbbb.', 'bb1111bb', 'bb1212bb', 'bb1111bb'], pal: { 3: '#fbf7f4', 4: '#f7a8c8' } },
};

// Питомцы бессмертны: мобы их не трогают. ward — от каких луж защищает (урон не наносит, оружие не баффает);
// from — с какой главы питомца можно встретить (принц находит его в «его» локации)
const PETS = {
  none:    { name: 'Без питомца', price: 0,   info: 'Ходишь один' },
  owl:     { name: 'Совёнок',     price: 300, info: '+60% к радиусу сбора' },
  firefly: { name: 'Светлячок',   price: 800, info: 'Стреляет в ближайшего врага' },
  beaver:  { name: 'Бобёр',       price: 1500, from: 1,   ward: ['swamp'],        info: 'Стелет мостки из веток: болото не тормозит' },
  fennec:  { name: 'Фенек',       price: 2500, from: 11,  ward: ['sand'],         info: 'Учит ступать легко: пески не засасывают' },
  tree:    { name: 'Живое дерево', price: 3000, from: 11, info: 'Бьёт Мёртвых древней корнями; срубленный может ожить и драться за тебя' },
  goat:    { name: 'Коза',        price: 4000, from: 46,  ward: ['thorns'],       info: 'Объедает лозы вокруг: колючки не тормозят и не ранят' },
  penguin: { name: 'Пингвин',     price: 6000, from: 101, ward: ['lava', 'fire'], info: 'Охлаждает героя: огонь и лава не страшны' },
};
const petWards = (pet, hz) => !!(PETS[pet].ward && PETS[pet].ward.includes(hz));
