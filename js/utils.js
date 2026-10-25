'use strict';

const TAU = Math.PI * 2;

// 全局配置（逻辑单位，与像素无关）
const CFG = {
  viewW: 620,          // 逻辑视口最小宽
  viewH: 540,          // 逻辑视口最小高
  groundBand: 86,      // 地面墨带高度
  gravity: 2300,
  jumpV: 840,
  jumpV2: 800,         // 二段跳
  maxFall: 1600,
  baseSpeed: 360,      // 初始世界速度
  maxSpeed: 780,
  speedPerMeter: 0.55, // 每米提速
  dashTime: 0.32,      // 冲刺时长（无敌）
  dashBoost: 360,
  dashCd: 2.2,
  invTime: 1.3,        // 受伤无敌
  coyote: 0.09,        // 土狼时间
  jumpBuffer: 0.12,    // 跳跃缓冲
};

const store = {
  get(k, d){
    try {
      const v = localStorage.getItem('inkninja_' + k);
      return v === null ? d : JSON.parse(v);
    } catch (e){ return d; }
  },
  set(k, v){
    try { localStorage.setItem('inkninja_' + k, JSON.stringify(v)); } catch (e){}
  }
};

const U = {
  clamp(v, a, b){ return v < a ? a : v > b ? b : v; },
  lerp(a, b, t){ return a + (b - a) * t; },
  rand(a, b){ return a + Math.random() * (b - a); },
  randInt(a, b){ return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p){ return Math.random() < p; },
  // mulberry32：种子随机（每日挑战固定种子用）
  mulberry(seed){
    let t = seed >>> 0;
    return function(){
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  },
  aabb(a, b){
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },
};

// 宣纸颗粒纹理
function makePaperTexture(){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 1500; i++){
    x.fillStyle = `rgba(62,50,30,${Math.random() * 0.055})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, Math.random() < 0.8 ? 1 : 2, 1);
  }
  for (let i = 0; i < 40; i++){
    x.strokeStyle = `rgba(62,50,30,${Math.random() * 0.03})`;
    x.lineWidth = 1;
    x.beginPath();
    const sx = Math.random() * 256, sy = Math.random() * 256;
    x.moveTo(sx, sy);
    x.lineTo(sx + U.rand(-30, 30), sy + U.rand(-8, 8));
    x.stroke();
  }
  return c;
}

/* ============ 五行元素（金→木→土→水→火→金 相克） ============ */
const ELEM = {
  order: ['metal', 'wood', 'earth', 'water', 'fire'],
  zh:    { metal: '金', wood: '木', earth: '土', water: '水', fire: '火' },
  color: { metal: '#c9a53a', wood: '#5a9a4a', earth: '#a8784a', water: '#4a7ab8', fire: '#d84a2a' },
  counter(a, b){
    if (!a || !b) return false;
    const i = this.order.indexOf(a);
    return this.order[(i + 1) % 5] === b;
  },
  // a 打 b 的伤害倍率：克制 ×1.15 / 被克 ×0.9 / 无关 ×1
  mult(a, b){
    if (!a || !b) return 1;
    if (this.counter(a, b)) return 1.15;
    if (this.counter(b, a)) return 0.9;
    return 1;
  },
};

/* ============ 武器流派（开局可选，五行各一，忍具匣轮换） ============ */
const WEAPON_DEFS = [
  { id: 'katana',  icon: '刀', name: '太刀·疾风', elem: 'metal', desc: '金·均衡近战，二段起斩出刀气' },
  { id: 'kunai',   icon: '镖', name: '苦无·残月', elem: 'water', desc: '水·远程连发，满级三连穿透' },
  { id: 'chain',   icon: '镰', name: '锁镰·蚀骨', elem: 'wood',  desc: '木·宽域重击，横扫吸财' },
  { id: 'thunder', icon: '雷', name: '雷刃·紫电', elem: 'fire',  desc: '火·闪电链跳，连斩如风' },
  { id: 'hammer',  icon: '锤', name: '岩锤·崩山', elem: 'earth', desc: '土·势大力沉，近战伤害最高' },
];

/* ============ 忍者皮肤 ============ */
const SKIN_DEFS = [
  { id: 'ink',    name: '墨影', cost: 0,    body: '#202028', soft: '#3a3a46', scarf: '#c8322b', scarfD: '#8f231b', eye: '#f2ecdf' },
  { id: 'flame',  name: '赤焰', cost: 300,  body: '#2e1a12', soft: '#4a2f22', scarf: '#e8642b', scarfD: '#a03a14', eye: '#f2ecdf' },
  { id: 'storm',  name: '苍雷', cost: 500,  body: '#141e2c', soft: '#2a3a4e', scarf: '#3f6fae', scarfD: '#274a78', eye: '#f2ecdf' },
  { id: 'frost',  name: '白霜', cost: 800,  body: '#d8d4c8', soft: '#b4ae9e', scarf: '#4a8ab0', scarfD: '#2e648a', eye: '#202028' },
  { id: 'gold',   name: '金乌', cost: 1200, body: '#2a2416', soft: '#463c26', scarf: '#d4a017', scarfD: '#9a720e', eye: '#f2ecdf' },
  { id: 'yaksha', name: '夜叉', cost: null, body: '#0e0e16', soft: '#2a2436', scarf: '#8a3a9a', scarfD: '#5a2468', eye: '#e05a5a', needAch: 'kill200' },
];

/* ============ 成就 ============ */
const ACH_DEFS = [
  { id: 'stage1',  name: '初出茅庐', desc: '完成第 1 关' },
  { id: 'stage3',  name: '小有名气', desc: '完成第 3 关' },
  { id: 'stage5',  name: '名震一方', desc: '完成第 5 关' },
  { id: 'kill50',  name: '斩妖除魔', desc: '累计击杀 50' },
  { id: 'kill200', name: '百人斩',   desc: '累计击杀 200（解锁皮肤·夜叉）' },
  { id: 'rich',    name: '富甲一方', desc: '钱袋持有 1000 钱' },
  { id: 'boss1',   name: '鬼见愁',   desc: '击杀任意鬼王' },
  { id: 'boss3',   name: '三鬼退治', desc: '三种鬼王各击杀一次' },
  { id: 'ult10',   name: '奥义大师', desc: '累计释放奥义 10 次' },
  { id: 'dist1k',  name: '日行千里', desc: '单局距离达到 1000m' },
  { id: 'perfect', name: '完美通关', desc: '无伤通过任意一关' },
];

/* ============ 角色（各带 元素+被动+攻击技能+奥义） ============ */
const CHAR_DEFS = [
  {
    id: 'kage', name: '影', title: '炽炎之影', cost: 0, elem: 'fire',
    desc: '驭火的均衡型忍者，攻守兼备',
    stats: { atk: 3, hp: 3, spd: 3, rng: 3, luk: 3, tec: 3 },
    perks: ['被动·胧：受击后无敌延长，下一击强化', '技能·烈焰冲击：召唤大火球向前轰击', '奥义·万象裂空斩'],
    maxHp: 100, speedMul: 1, meleeDmg: 0, rangedN: 1, coinLuck: 0,
    skillCd: 10, skill: { id: 'fireorb', name: '烈焰冲击' },
    ult: { id: 'zangeki', name: '万象裂空斩' },
  },
  {
    id: 'kuro', name: '玄', title: '厚土之玄', cost: 600, elem: 'earth',
    desc: '御土的刚力型，皮糙肉厚一击千钧',
    stats: { atk: 5, hp: 5, spd: 2, rng: 2, luk: 2, tec: 3 },
    perks: ['被动·刚躯：受伤后无敌时间大幅延长', '技能·裂地崩：地刺波向前碾轧', '奥义·崩山击'],
    maxHp: 130, speedMul: 0.96, meleeDmg: 1, rangedN: 1, coinLuck: 0,
    skillCd: 12, skill: { id: 'spike', name: '裂地崩' },
    ult: { id: 'landslide', name: '崩山击' },
  },
  {
    id: 'rin', name: '凛', title: '青木之凛', cost: 1000, elem: 'wood',
    desc: '操木的疾风型，身轻如燕财运亨通',
    stats: { atk: 2, hp: 2, spd: 5, rng: 4, luk: 5, tec: 4 },
    perks: ['被动·风灵：吸钱更远、冲刺更快', '技能·木叶旋刃：五片叶刃扇形激射', '奥义·残月风暴'],
    maxHp: 85, speedMul: 1.05, meleeDmg: 0, rangedN: 2, coinLuck: 0.25,
    skillCd: 8, skill: { id: 'leaf', name: '木叶旋刃' },
    ult: { id: 'storm', name: '残月风暴' },
  },
];

/* ============ 关卡地形主题（五行轮换：木水火土金） ============ */
const THEME_DEFS = [
  { id: 'bamboo', name: '木·竹林', elem: 'wood',
    skyTop: '#f7f2e7', skyBot: '#efe7d3', sun: 'rgba(226,140,110,0.5)', sunCore: 'rgba(226,140,110,0.5)',
    ridge1: '#dcd6c8', ridge2: '#cbc4b2', near: '#b1aa97', bamboo: '#7c7561',
    ground: '#1d1d26', groundLine: 'rgba(255,255,255,0.06)', ambient: 'leaf', dark: false },
  { id: 'snow', name: '水·雪夜', elem: 'water',
    skyTop: '#2c3446', skyBot: '#1b2233', sun: 'rgba(225,232,245,0.5)', sunCore: 'rgba(235,240,250,0.55)',
    ridge1: '#3d475c', ridge2: '#2f3850', near: '#27304a', bamboo: '#39435a',
    ground: '#10131d', groundLine: 'rgba(200,215,240,0.10)', ambient: 'snow', dark: true },
  { id: 'volcano', name: '火·火山', elem: 'fire',
    skyTop: '#3d221a', skyBot: '#26120e', sun: 'rgba(226,100,55,0.42)', sunCore: 'rgba(235,120,60,0.5)',
    ridge1: '#4a2e26', ridge2: '#3a241e', near: '#301c16', bamboo: '#48302a',
    ground: '#170f0d', groundLine: 'rgba(232,100,43,0.14)', ambient: 'ember', dark: true },
  { id: 'desert', name: '土·黄沙', elem: 'earth',
    skyTop: '#dccba6', skyBot: '#c8b28c', sun: 'rgba(226,180,110,0.5)', sunCore: 'rgba(232,192,124,0.55)',
    ridge1: '#c9b48e', ridge2: '#b6a077', near: '#9c8760', bamboo: '#8a7a52',
    ground: '#2a221a', groundLine: 'rgba(255,235,200,0.10)', ambient: 'dust', dark: false },
  { id: 'cave', name: '金·月窟', elem: 'metal',
    skyTop: '#3a4152', skyBot: '#262c3a', sun: 'rgba(212,218,232,0.5)', sunCore: 'rgba(224,228,240,0.6)',
    ridge1: '#4a5265', ridge2: '#3c4456', near: '#303748', bamboo: '#565f72',
    ground: '#171a22', groundLine: 'rgba(220,226,240,0.10)', ambient: 'mote', dark: true },
];

/* ============ 局内商店 ============ */
const RUNSHOP_DEFS = [
  { id: 'heal',   name: '樱心·体力+1',      cost: 30 },
  { id: 'soul',   name: '武魂·+4',          cost: 35 },
  { id: 'shield', name: '守符·获护盾',      cost: 40 },
  { id: 'magnet', name: '磁石·吸钱6秒',     cost: 25 },
  { id: 'box',    name: '忍具匣·换武器',    cost: 30 },
  { id: 'bless',  name: '祝福·攻击+10(本局)', cost: 60 },
];
