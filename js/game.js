'use strict';

const $id = id => document.getElementById(id);

const HEART_SVG = '<svg viewBox="0 0 24 22"><path d="M12 21 C4 15 1 10 1 6.5 C1 3 3.5 1 6.5 1 C9 1 11 2.5 12 4.5 C13 2.5 15 1 17.5 1 C20.5 1 23 3 23 6.5 C23 10 20 15 12 21 Z" fill="#c0392b" stroke="#8f2b22" stroke-width="1.5"/></svg>';

// 五鬼王轮换（五行各一）：金骨魔将 → 木藤魔 → 土山魈 → 水鸦天狗 → 火鬼武士
const BOSS_DEFS = [
  { kind: 'bone',   name: '骨魔将', elem: 'metal', hp: 15, bw: 104, bh: 132, cycle: [2.2, 2.8], half: [1.5, 2.0],
    attacks: ['swing', 'bladeFan', 'charge', 'summon'] },
  { kind: 'vine',   name: '藤魔',   elem: 'wood',  hp: 18, bw: 128, bh: 148, cycle: [2.6, 3.3], half: [1.9, 2.5],
    attacks: ['rocks', 'burst', 'charge', 'swing'] },
  { kind: 'golem',  name: '山魈',   elem: 'earth', hp: 20, bw: 128, bh: 148, cycle: [2.6, 3.3], half: [1.9, 2.5],
    attacks: ['rocks', 'burst', 'charge', 'swing'] },
  { kind: 'tengu',  name: '鸦天狗', elem: 'water', hp: 16, bw: 112, bh: 56,  cycle: [1.9, 2.5], half: [1.3, 1.8],
    attacks: ['feathers', 'crow', 'swoop', 'fire'] },
  { kind: 'oni',    name: '鬼武士', elem: 'fire',  hp: 14, bw: 104, bh: 128, cycle: [2.3, 2.9], half: [1.6, 2.1],
    attacks: ['swing', 'fire', 'summon', 'charge'] },
];

// 功坊永久升级（铜钱购买，跨局生效）
const SHOP_DEFS = [
  { id: 'hp',     name: '体魄',     desc: '体力上限 +25',      costs: [200, 500, 900] },
  { id: 'soul',   name: '武魂亲和', desc: '开局额外武魂 +3',   costs: [150, 350, 650] },
  { id: 'magnet', name: '聚财',     desc: '铜钱吸取范围 +25%', costs: [120, 280, 520] },
  { id: 'dash',   name: '疾风靴',   desc: '冲刺冷却 -0.3 秒',  costs: [180, 420, 780] },
  { id: 'ult',    name: '奥义心得', desc: '奥义积蓄效率 +20%', costs: [200, 450, 800] },
];

// 体力 100 制：各类伤害源数值
const DMG = {
  obstacle: 15, monster: 12, roninSlash: 18, arrow: 12, fireball: 14,
  feather: 10, shock: 18, rock: 16, burst: 18, bossTouch: 15, wisp: 10,
};

class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.scale = 1;
    this.W = CFG.viewW; this.H = CFG.viewH;
    this.groundY = this.H - CFG.groundBand;

    this.state = 'menu';
    this.mode = 'normal';
    this.t = 0;
    this.camX = 0;
    this.speed = 120;
    this.ninjaX = 180;
    this.ninja = new Ninja();
    this.obstacles = [];
    this.coins = [];
    this.powerups = [];
    this.decors = [];
    this.monsters = [];
    this.shots = [];
    this.hazards = [];
    this.souls = [];
    this.fx = [];
    this.particles = new Particles();
    this.boss = null;
    this.nextBossAt = 380;
    this.bossRound = 0;
    this.kills = 0;
    this.weapon = { type: 'katana', lv: 1, xp: 0, atkCd: 0 };
    this.weaponNeed = [0, 8, 22];   // 升到 Lv2 / Lv3 所需累计武魂
    this.ult = 0;                   // 奥义槽 0-100（满级武器可释放）
    this.castT = 0;                 // 奥义演出计时
    this.rng = Math.random;

    this.best = store.get('best', 0);
    this.bank = store.get('bank', 0);
    this.shop = store.get('shop', { hp: 0, soul: 0, magnet: 0, dash: 0, ult: 0 });
    this.coinR = 44;
    this.dashCdMax = CFG.dashCd;
    this.ultMul = 1;

    // 关卡 / 武器 / 皮肤 / 成就 / 角色
    this.selWeapon = store.get('selW', 'katana');
    this.selectedStage = Math.min(store.get('unlocked', 1), 99);
    this.stageNum = 1;
    this.stageLen = Infinity;
    this.bossSchedule = [];
    this.damageTaken = 0;
    this.clearT = 0;
    this.skins = store.get('skins', ['ink']);
    this.skinId = store.get('skin', 'ink');
    this.ach = store.get('ach', {});
    this.stats = store.get('stats', { kills: 0, ults: 0, bossKills: { oni: 0, tengu: 0, golem: 0 }, maxDist: 0 });
    this._perfect = false;
    this.selChar = store.get('selC', 'kage');
    this.chars = store.get('chars', ['kage']);
    this.skillCd = 0;
    this.cloneT = 0;
    this.speedBoostT = 0;
    this.blessAtk = 0;
    this.empowerNext = false;
    this.coinsEarned = 0;
    this.shopNodes = [];
    this.finalBossDone = false;
    this._gateNotified = false;
    this.speedMul = 1;

    this.score = 0; this.coinCount = 0; this.dist = 0;
    this.nextSpawn = 0;
    this.forced = [];
    this.shakeT = 0; this.shakeMag = 0;
    this.slowT = 0; this.dyingT = 0; this.overAt = 0;
    this.coyote = 0; this.jumpBufferT = 0;
    this.prevHeldJump = false;
    this.coinStreak = 0; this.coinStreakT = 0;
    this.combo = 0; this.comboT = 0; this.comboBest = 0; this.comboBonus = 0;
    this.hitStopT = 0;
    this.bossBarFlash = 0;
    this.lowHpT = 0;
    this._hud = {};

    Bg.init();
    this.resize();
    this.ninja.reset(this);
    this.syncSoundIcon();
    this.syncToggles();
    this.syncMenuInfo();
  }

  /* ---------- 种子随机 ---------- */
  rnd(a, b){ return a + (b - a) * this.rng(); }
  rint(a, b){ return Math.floor(this.rnd(a, b + 1)); }
  todayStr(){
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  resize(){
    const cw = window.innerWidth, ch = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.scale = Math.min(cw / CFG.viewW, ch / CFG.viewH);
    this.W = cw / this.scale;
    this.H = ch / this.scale;
    this.groundY = this.H - CFG.groundBand;
    this.ninjaX = U.clamp(this.W * 0.3, 150, 360);
    this.ninja.groundY = this.groundY;
    if (this.ninja.onGround) this.ninja.feetY = this.groundY;
  }

  syncMenuInfo(){
    $id('best-score').textContent = this.best;
    $id('bank-coins').textContent = this.bank;
    $id('daily-best').textContent = store.get('daily_' + this.todayStr(), 0);
    $id('skin-name').textContent = this.skinDef().name;
    this.renderSelects();
  }

  skinDef(){
    return SKIN_DEFS.find(s => s.id === this.skinId) || SKIN_DEFS[0];
  }

  charDef(){
    return CHAR_DEFS.find(c => c.id === this.selChar) || CHAR_DEFS[0];
  }

  // 武器/关卡/角色选择卡
  renderSelects(){
    const wpBox = $id('wp-select');
    wpBox.innerHTML = WEAPON_DEFS.map(w =>
      `<div class="wcard ${w.id === this.selWeapon ? 'on' : ''}" data-w="${w.id}" title="${w.desc}">
        <b>${w.icon}<i class="ebadge" style="background:${ELEM.color[w.elem]}">${ELEM.zh[w.elem]}</i></b><span>${w.name.split('·')[1] || w.name}</span>
      </div>`).join('');
    const unlocked = store.get('unlocked', 1);
    const stars = store.get('stars', {});
    const maxShow = Math.min(Math.max(unlocked, this.selectedStage) + 1, 12);
    let html = '';
    for (let n = 1; n <= maxShow; n++){
      const st = stars[n] || 0;
      const starStr = st > 0 ? '★'.repeat(st) + '☆'.repeat(3 - st) : '···';
      const locked = n > unlocked;
      html += `<div class="scard ${n === this.selectedStage && !locked ? 'on' : ''} ${locked ? 'lock' : ''}" data-s="${n}">
        <b>第${n}关</b><span>${locked ? '🔒' : starStr}</span></div>`;
    }
    $id('stage-select').innerHTML = html;
    const chart = $id('elem-chart');
    if (chart){
      chart.innerHTML = ELEM.order
        .map(e => `<i style="background:${ELEM.color[e]}">${ELEM.zh[e]}</i>`)
        .join('<em>克</em>') + '<em>克</em><i style="background:' + ELEM.color[ELEM.order[0]] + '">' + ELEM.zh[ELEM.order[0]] + '</i><em>（循环）</em>';
    }
    this.renderCharSelect();
  }

  // 角色选择 + 六边形属性面板
  renderCharSelect(){
    const box = $id('char-select');
    if (!box) return;
    box.innerHTML = CHAR_DEFS.map(c => {
      const owned = this.chars.includes(c.id);
      const sel = this.selChar === c.id;
      return `<div class="ccard ${sel ? 'on' : ''} ${owned ? '' : 'lock'}" data-c="${c.id}">
        <b>${c.name}<i class="ebadge" style="background:${ELEM.color[c.elem]}">${ELEM.zh[c.elem]}</i></b><span>${owned ? (sel ? '出战' : c.title) : (c.cost + '钱')}</span>
      </div>`;
    }).join('');
    this.renderCharDetail();
  }

  renderCharDetail(){
    const el = $id('char-detail');
    if (!el) return;
    const c = this.charDef();
    const owned = this.chars.includes(c.id);
    // 六边形雷达图（攻击/体力/速度/射程/幸运/技巧，0-5）
    const cx = 62, cy = 58, R = 44;
    const axes = ['atk', 'hp', 'spd', 'rng', 'luk', 'tec'];
    const names = ['攻击', '体力', '速度', '射程', '幸运', '技巧'];
    const pt = (i, r) => {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    };
    let grid = '';
    for (let ring = 1; ring <= 3; ring++){
      grid += `<polygon points="${axes.map((_, i) => pt(i, R * ring / 3)).join(' ')}" fill="none" stroke="rgba(32,32,40,.25)" stroke-width="1"/>`;
    }
    let spokes = '', labels = '';
    axes.forEach((k, i) => {
      spokes += `<line x1="${cx}" y1="${cy}" x2="${pt(i, R).split(',')[0]}" y2="${pt(i, R).split(',')[1]}" stroke="rgba(32,32,40,.2)"/>`;
      const la = -Math.PI / 2 + i * Math.PI / 3;
      labels += `<text x="${cx + Math.cos(la) * (R + 14)}" y="${cy + Math.sin(la) * (R + 14) + 4}" text-anchor="middle" font-size="11" fill="#55503f">${names[i]}·${c.stats[k]}</text>`;
    });
    const poly = axes.map((k, i) => pt(i, R * U.clamp(c.stats[k], 0.5, 5) / 5)).join(' ');
    const dots = axes.map((k, i) => {
      const p = pt(i, R * U.clamp(c.stats[k], 0.5, 5) / 5).split(',');
      return `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#c0392b"/>`;
    }).join('');
    el.innerHTML =
      `<div class="char-hd"><b>${c.name}·${c.title}</b><span>${c.desc}</span></div>` +
      `<div class="char-body">` +
        `<svg viewBox="0 0 124 116" class="radar">${grid}${spokes}<polygon points="${poly}" fill="rgba(192,57,43,.25)" stroke="#c0392b" stroke-width="2"/>${dots}${labels}</svg>` +
        `<div class="char-perks">${c.perks.map(p => `<p>${p}</p>`).join('')}</div>` +
      `</div>` +
      (owned ? '' : `<button class="btn small" id="btn-buychar" ${this.bank >= c.cost ? '' : 'disabled'}>解锁 ${c.cost} 钱</button>`);
    const buyBtn = el.querySelector('#btn-buychar');
    if (buyBtn) buyBtn.onclick = () => this.buyChar(c.id);
  }

  setChar(id){
    if (!this.chars.includes(id)) return;
    this.selChar = id;
    store.set('selC', id);
    this.renderCharSelect();
  }

  buyChar(id){
    const c = CHAR_DEFS.find(d => d.id === id);
    if (!c || this.chars.includes(id)) return;
    if (this.bank < c.cost){ Sfx.deny(); return; }
    this.bank -= c.cost;
    this.chars.push(id);
    store.set('bank', this.bank);
    store.set('chars', this.chars);
    Sfx.buy();
    this.toast(`解锁角色：${c.name}·${c.title}`);
    this.selChar = id;
    store.set('selC', id);
    this.renderCharSelect();
    this.syncMenuInfo();
    this.checkAch();
  }

  setWeapon(id){
    this.selWeapon = id;
    store.set('selW', id);
    this.renderSelects();
  }

  setStage(n){
    this.selectedStage = n;
    this.renderSelects();
  }

  /* ---------- 流程 ---------- */
  startRun(mode = 'stage', stage){
    this.mode = mode;
    // 每日挑战：当日固定种子，人人同图
    const seed = mode === 'daily'
      ? parseInt(this.todayStr(), 10)
      : (Math.random() * 1e9) | 0;
    this.rng = U.mulberry(seed ^ 0x5f3759df);

    // 功坊永久加成 + 角色特性（体力 100 制）
    const ch = this.charDef();
    this.ninja.maxHp = ch.maxHp + this.shop.hp * 25;
    this.coinR = 44 + this.shop.magnet * 11 + (ch.id === 'rin' ? 18 : 0);
    this.dashCdMax = Math.max(0.8, CFG.dashCd - this.shop.dash * 0.3 - (ch.id === 'rin' ? 0.5 : 0));
    this.ultMul = 1 + this.shop.ult * 0.2;
    this.speedMul = ch.speedMul;
    this.ninja.skin = this.skinDef();
    this.skillCdMax = ch.skillCd;
    this.skillCd = 0;
    this.cloneT = 0;
    this.speedBoostT = 0;
    this.blessAtk = 0;
    this.empowerNext = false;
    this.coinsEarned = 0;
    this.finalBossDone = false;
    this._gateNotified = false;

    // 关卡参数
    if (mode === 'stage'){
      this.stageNum = stage || this.selectedStage || 1;
      this.stageLen = Math.min(1800, 500 + (this.stageNum - 1) * 150);
      const themeDef = THEME_DEFS[(this.stageNum - 1) % THEME_DEFS.length];
      Bg.setTheme(themeDef);
      // 鬼王队列：中场两只按相克链轮换，终幕=本关元素鬼王
      const ti = ELEM.order.indexOf(themeDef.elem);
      const finalBoss = BOSS_DEFS.find(b => b.elem === themeDef.elem);
      this.bossQueue = this.stageNum === 1
        ? [finalBoss]
        : [
            BOSS_DEFS.find(b => b.elem === ELEM.order[(ti + 1) % 5]),
            BOSS_DEFS.find(b => b.elem === ELEM.order[(ti + 3) % 5]),
            finalBoss,
          ];
      this.bossSchedule = this.stageNum === 1
        ? [this.stageLen * 0.8]
        : [0.35, 0.7, 0.95].map(f => this.stageLen * f);
      this.shopNodes = [0.5, 0.82].map(f => this.stageLen * f);
    } else {
      this.stageNum = 1;
      this.stageLen = Infinity;
      this.bossSchedule = [];
      this.bossQueue = [];
      this.shopNodes = [];
      this.nextBossAt = 380;
      Bg.setTheme(THEME_DEFS[0]);
    }
    this.damageTaken = 0;
    this.clearT = 0;

    this.state = 'playing';
    this.camX = 0;
    this.speed = CFG.baseSpeed;
    this.obstacles.length = 0;
    this.coins.length = 0;
    this.powerups.length = 0;
    this.decors.length = 0;
    this.monsters.length = 0;
    this.shots.length = 0;
    this.hazards.length = 0;
    this.souls.length = 0;
    this.fx.length = 0;
    this.particles.clear();
    this.boss = null;
    this.bossRound = 0;
    this.kills = 0;
    this.ult = 0;
    this.castT = 0;
    this.ninja.reset(this);
    this.weapon = { type: this.selWeapon, lv: 1, xp: this.shop.soul * 3, atkCd: 0 };
    while (this.weapon.lv < 3 && this.weapon.xp >= this.weaponNeed[this.weapon.lv]) this.weapon.lv++;
    this.score = 0; this.coinCount = 0; this.dist = 0;
    this.coinStreak = 0;
    this.combo = 0; this.comboT = 0; this.comboBonus = 0;
    this.shakeT = 0; this.slowT = 0;
    this.coyote = 0; this.jumpBufferT = 0;
    this.nextSpawn = this.W + 300;
    this.forced = [0, 1];
    Input.clearQ();
    document.body.classList.add('playing');
    $id('menu').classList.add('hidden');
    $id('over').classList.add('hidden');
    $id('pause').classList.add('hidden');
    $id('shop').classList.add('hidden');
    $id('ach').classList.add('hidden');
    $id('mode-tag').classList.toggle('hidden', mode !== 'daily');
    $id('stage-label').textContent = '第' + this.stageNum + '关';
    Sfx.startMusic();
    // 开场标题卡
    this.fx.push({
      type: 'text', t: 0, life: 2.2,
      x: this.camX + this.W / 2, y: this.groundY - 230,
      str: mode === 'daily' ? '每 日 挑 战' : '第' + this.stageNum + '关 · ' + Bg.theme.name,
      size: 40,
    });
    // 首次游玩：操作与五行提示（负 t 延迟出场）
    if (mode === 'stage' && this.stageNum === 1 && !store.get('hinted', false)){
      store.set('hinted', true);
      const cx = this.camX + this.W / 2;
      this.fx.push({ type: 'text', t: -1.6, life: 2.6, x: cx, y: this.groundY - 160, str: 'J/X 攻击（可长按连发）', size: 20 });
      this.fx.push({ type: 'text', t: -2.8, life: 2.6, x: cx, y: this.groundY - 160, str: 'E 技能 · L 奥义 · Shift 冲刺', size: 20 });
      this.fx.push({ type: 'text', t: -4.0, life: 3.0, x: cx, y: this.groundY - 160, str: '金克木·木克土·土克水·水克火·火克金', size: 20, color: '#c98a1a' });
    }
    this.syncHud(true);
  }

  pause(){
    if (this.state !== 'playing') return;
    this.state = 'paused';
    $id('pause').classList.remove('hidden');
    Input.clearQ();
  }

  resume(){
    if (this.state !== 'paused') return;
    this.state = 'playing';
    $id('pause').classList.add('hidden');
    Input.clearQ();
  }

  toMenu(){
    this.state = 'menu';
    this.mode = 'normal';
    this.camX = 0;
    this.speed = 120;
    this.obstacles.length = 0;
    this.coins.length = 0;
    this.powerups.length = 0;
    this.decors.length = 0;
    this.monsters.length = 0;
    this.shots.length = 0;
    this.hazards.length = 0;
    this.souls.length = 0;
    this.fx.length = 0;
    this.particles.clear();
    this.boss = null;
    this.ninja.reset(this);
    document.body.classList.remove('playing');
    $id('pause').classList.add('hidden');
    $id('over').classList.add('hidden');
    $id('shop').classList.add('hidden');
    $id('menu').classList.remove('hidden');
    this.syncMenuInfo();
    Sfx.stopMusic();
  }

  toggleSound(){
    const on = Sfx.toggleMute();
    this.syncSoundIcon();
    return on;
  }

  syncSoundIcon(){
    $id('btn-sound').textContent = Sfx.muted ? '🔇' : '🔊';
  }

  syncToggles(){
    $id('btn-music').textContent = '音乐：' + (Sfx.musicOn ? '开' : '关');
    $id('btn-sfx').textContent = '音效：' + (Sfx.sfxOn ? '开' : '关');
  }

  die(){
    this.state = 'dying';
    this.dyingT = 1.3;
    this.ninja.state = 'dead';
    this.ninja.vy = -620;
    this.ninja.onGround = false;
    this.ninja.sliding = false;
    Sfx.death();
    Sfx.stopMusic();
    this.shake(0.7, 14);
    this.slowT = 0.3;
    this.particles.inkBurst(this.ninjaX, this.ninja.feetY - 46, 22);
  }

  finishOver(){
    this.state = 'over';
    this.overAt = this.t;
    const s = this.score, d = Math.floor(this.dist), c = this.coinCount;

    // 铜钱入账钱袋 + 单局最远统计
    this.bank += c;
    this.stats.maxDist = Math.max(this.stats.maxDist, d);
    store.set('stats', this.stats);
    let bonus = 0;
    if (this.mode === 'daily'){
      // 每日挑战：当日最佳 + 每日首战奖励
      const key = 'daily_' + this.todayStr();
      const db = store.get(key, 0);
      if (s > db) store.set(key, s);
      $id('r-daily-row').classList.remove('hidden');
      $id('r-daily').classList.remove('hidden');
      $id('r-daily').textContent = Math.max(db, s);
      if (store.get('dailyBonus', '') !== this.todayStr()){
        store.set('dailyBonus', this.todayStr());
        this.bank += 200;
        bonus = 200;
      }
    } else {
      $id('r-daily-row').classList.add('hidden');
      $id('r-daily').classList.add('hidden');
    }
    store.set('bank', this.bank);

    const nb = s > this.best;
    if (nb){
      this.best = s;
      store.set('best', s);
    }
    $id('over-title').textContent = '忍者陨落';
    $id('over-stamp').textContent = '卒';
    $id('r-score').textContent = s;
    $id('r-dist').textContent = d + 'm';
    $id('r-coins').textContent = c;
    $id('r-kills').textContent = this.kills;
    $id('r-best').textContent = this.best;
    $id('new-best').classList.toggle('hidden', !nb);
    $id('r-bonus').classList.toggle('hidden', bonus <= 0);
    if (bonus > 0) $id('r-bonus').textContent = `每日首战奖励 +${bonus} 钱`;
    document.body.classList.remove('playing');
    $id('over').classList.remove('hidden');
    this.checkAch();
  }

  shake(t, mag){ this.shakeT = Math.max(this.shakeT, t); this.shakeMag = mag; }

  /* ---------- 主更新 ---------- */
  update(dt){
    this.t += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);

    if (Input.consume('start')){
      if (this.state === 'menu'){
        this.startRun('stage', this.selectedStage);
        return;
      }
      if (this.state === 'over' && this.t - this.overAt > 0.5){
        this.startRun(this.mode === 'daily' ? 'daily' : 'stage', this.stageNum);
        return;
      }
    }
    if (Input.consume('pause')){
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }

    if (this.state === 'paused' || this.state === 'over' || this.state === 'shop') return;

    // 顿帧（受击/斩杀的打击停顿）：世界暂停，画面保留
    if (this.hitStopT > 0){
      this.hitStopT -= dt;
      return;
    }

    this.slowT = Math.max(0, this.slowT - dt);
    const dts = dt * (this.slowT > 0 ? 0.35 : 1);

    if (this.state === 'menu'){
      this.camX += this.speed * dts;
      this.ninja.update(dts, this);
      Bg.update(dts, this);
      this.particles.update(dts);
      return;
    }

    if (this.state === 'playing') this.updatePlaying(dts);
    else if (this.state === 'dying') this.updateDying(dts);
    else if (this.state === 'clear') this.updateClear(dts);

    Bg.update(dts, this);
    this.particles.update(dts);
    this.cull();
  }

  updatePlaying(dt){
    const nin = this.ninja;

    // 跳跃（含缓冲 + 土狼时间）
    this.coyote = nin.onGround ? CFG.coyote : Math.max(0, this.coyote - dt);
    if (Input.consume('jump')) this.jumpBufferT = CFG.jumpBuffer;
    else this.jumpBufferT = Math.max(0, this.jumpBufferT - dt);
    if (this.jumpBufferT > 0 && (nin.onGround || this.coyote > 0 || nin.jumps < 2)){
      nin.jump(this);
      this.jumpBufferT = 0;
    }
    if (Input.consume('dash')) nin.startDash(this);
    if (Input.consume('attack')) this.attack();
    if (Input.held.attack) this.attack();          // 长按连发
    if (Input.consume('skill')) this.castSkill();
    if (Input.consume('ult')) this.castUlt();
    this.weapon.atkCd = Math.max(0, this.weapon.atkCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.cloneT = Math.max(0, this.cloneT - dt);
    this.speedBoostT = Math.max(0, this.speedBoostT - dt);
    this.bossBarFlash = Math.max(0, this.bossBarFlash - dt);

    // 击杀连击窗口
    if (this.comboT > 0){
      this.comboT -= dt;
      if (this.comboT <= 0){ this.combo = 0; }
    }

    // 低血量心跳警示
    if (nin.hp > 0 && nin.hp <= nin.maxHp * 0.3){
      this.lowHpT -= dt;
      if (this.lowHpT <= 0){
        this.lowHpT = 1.1;
        Sfx.thump();
      }
    }

    // 奥义演出：前半蓄力（无敌+慢镜），过半释放
    if (this.castT > 0){
      const was = this.castT;
      this.castT -= dt;
      if (was > 0.5 && this.castT <= 0.5) this.ultRelease();
      if (this.castT > 0.5 && Math.random() < 0.5){
        this.particles.ring(this.ninjaX + U.rand(-10, 10), nin.centerY);
      }
    }
    // 奥义被动积蓄（角色制；对鬼王存在角色五行抵抗关系：克制积蓄×1.5 / 被克×0.8）
    let ultGain = 2.4 * this.ultMul;
    if (this.boss){
      const ce = this.charDef().elem;
      if (ELEM.counter(ce, this.boss.elem)) ultGain *= 1.5;
      else if (ELEM.counter(this.boss.elem, ce)) ultGain *= 0.8;
    }
    const wasUlt = this.ult;
    this.ult = Math.min(100, this.ult + ultGain * dt);
    if (wasUlt < 100 && this.ult >= 100){
      this.fx.push({
        type: 'text', t: 0, life: 1.2,
        x: this.camX + this.ninjaX, y: this.ninja.feetY - 200,
        str: '奥义就绪！', size: 24, color: '#c0392b',
      });
      Sfx.power();
    }

    nin.sliding = Input.held.slide && nin.onGround && nin.dashT <= 0;
    nin.update(dt, this);

    // 短按小跳
    if (this.prevHeldJump && !Input.held.jump && nin.vy < -260) nin.vy *= 0.55;
    this.prevHeldJump = Input.held.jump;

    // 速度与距离（角色速度系数 + 疾风增益）
    const boost = this.speedBoostT > 0 ? 130 : 0;
    this.speed = Math.min(CFG.maxSpeed + boost, (CFG.baseSpeed + this.dist * CFG.speedPerMeter) * this.speedMul + boost);
    const sp = this.speed + (nin.dashT > 0 ? CFG.dashBoost : 0);
    this.camX += sp * dt;
    this.dist = this.camX / 55;

    // 生成关卡
    while (this.nextSpawn < this.camX + this.W + 240){
      const chunk = pickChunkFor(this.tier(), this.forced.length ? this.forced.shift() : null, this.rng);
      const w = chunk.build(this, this.nextSpawn);
      this.nextSpawn += w + this.speed * this.rnd(0.55, 0.85) * (this.boss ? 1.7 : 1);
    }

    // 实体更新
    for (const e of this.obstacles) updateObstacle(e, dt, this);
    for (const m of this.monsters) updateMonster(m, dt, this);
    for (const s of this.shots) updateShot(s, dt, this);
    for (const h of this.hazards) updateHazard(h, dt, this);
    for (const so of this.souls) updateSoul(so, dt, this);
    for (const f of this.fx) f.t += dt;
    if (this.fx.length) this.fx = this.fx.filter(f => f.t < f.life);
    this.updateShotsHits();
    this.updateBossLogic(dt);

    // 磁石吸钱
    if (nin.magnetT > 0){
      const cx = this.camX + this.ninjaX, cy = nin.centerY;
      for (const c of this.coins){
        if (c.taken) continue;
        const dx = cx - c.x, dy = cy - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 250 * 250){
          const d = Math.sqrt(d2) || 1;
          const v = Math.min(1400, 90000 / d);
          c.x += dx / d * v * dt;
          c.y += dy / d * v * dt;
        }
      }
    }

    this.collide();
    this.score = Math.floor(this.dist) + this.coinsEarned * 5 + this.kills * 15 + this.comboBonus;
    this.syncHud();

    // 局内商店节点
    if (this.mode === 'stage' && this.shopNodes.length && this.dist > this.shopNodes[0]){
      this.shopNodes.shift();
      this.openRunShop();
      return;
    }

    // 到达终点：必须已讨伐终幕鬼王才能通关
    if (this.mode === 'stage' && this.dist >= this.stageLen){
      if (this.finalBossDone){
        this.stageClear();
      } else if (!this._gateNotified && !this.boss){
        this._gateNotified = true;
        this.fx.push({
          type: 'text', t: 0, life: 1.4,
          x: this.camX + this.ninjaX, y: this.ninja.feetY - 180,
          str: '鬼王未灭，不可通关！', size: 26,
        });
        // 终幕鬼王立即压上
        if (!this.boss && this.bossSchedule.length){
          this.spawnBoss();
          this.bossSchedule.shift();
        }
      }
    }
  }

  updateClear(dt){
    this.speed *= Math.pow(0.01, dt);
    this.camX += this.speed * dt;
    this.ninja.update(dt, this);
    for (const f of this.fx) f.t += dt;
    if (this.fx.length) this.fx = this.fx.filter(f => f.t < f.life);
    if (Math.random() < 0.3){
      this.particles.sparkle(U.rand(0, this.W), U.rand(40, this.groundY - 60), '#e8c86a');
    }
    this.clearT -= dt;
    if (this.clearT <= 0) this.finishClear();
  }

  stageClear(){
    this.state = 'clear';
    this.clearT = 1.4;
    this.slowT = 0.4;
    Sfx.power();
    Sfx.levelup();
    this.fx.push({
      type: 'text', t: 0, life: 1.3,
      x: this.camX + this.ninjaX, y: this.ninja.feetY - 170,
      str: '关卡完成！', size: 36,
    });
    this.particles.inkBurst(this.ninjaX, this.ninja.centerY, 26, ['#e8c86a', PAPER, RED]);
  }

  finishClear(){
    this.state = 'over';
    this.overAt = this.t;
    const stars = 3 - Math.min(2, this.damageTaken);
    const starRec = store.get('stars', {});
    const first = !starRec[this.stageNum];
    starRec[this.stageNum] = Math.max(starRec[this.stageNum] || 0, stars);
    store.set('stars', starRec);
    store.set('unlocked', Math.max(store.get('unlocked', 1), this.stageNum + 1));
    let bonus = 0;
    if (first) bonus = 100 + this.stageNum * 50;
    this.bank += this.coinCount + bonus;
    store.set('bank', this.bank);
    this.stats.maxDist = Math.max(this.stats.maxDist, Math.floor(this.dist));
    store.set('stats', this.stats);

    $id('over-title').textContent = '关卡完成！';
    $id('over-stamp').textContent = '捷';
    $id('r-score').textContent = this.score;
    $id('r-dist').textContent = Math.floor(this.dist) + 'm';
    $id('r-coins').textContent = this.coinCount;
    $id('r-kills').textContent = this.kills;
    $id('r-best').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $id('new-best').classList.toggle('hidden', true);
    $id('r-daily-row').classList.add('hidden');
    $id('r-daily').classList.add('hidden');
    $id('r-bonus').classList.toggle('hidden', bonus <= 0);
    if (bonus > 0) $id('r-bonus').textContent = `首通奖励 +${bonus} 钱`;
    document.body.classList.remove('playing');
    $id('over').classList.remove('hidden');

    this._perfect = stars >= 3;
    this.checkAch();
    this._perfect = false;
  }

  updateDying(dt){
    this.speed *= Math.pow(0.001, dt);
    this.camX += this.speed * dt;
    for (const e of this.obstacles) updateObstacle(e, dt, this);
    for (const m of this.monsters) updateMonster(m, dt, this);
    for (const h of this.hazards) updateHazard(h, dt, this);
    this.ninja.update(dt, this);
    this.dyingT -= dt;
    if (this.dyingT <= 0) this.finishOver();
  }

  tier(){
    if (this.mode === 'stage'){
      return Math.min(3, Math.floor((this.stageNum - 1) / 2));
    }
    const m = this.dist;
    return m < 200 ? 0 : m < 500 ? 1 : m < 900 ? 2 : 3;
  }

  cull(){
    this.obstacles = this.obstacles.filter(e => !e.dead && e.x + (e.w || 60) > this.camX - 260);
    this.coins = this.coins.filter(c => !c.taken && c.x > this.camX - 80);
    this.powerups = this.powerups.filter(p => !p.taken && p.x > this.camX - 80);
    this.decors = this.decors.filter(d => d.x + 160 > this.camX - 100);
    this.monsters = this.monsters.filter(m => !m.dead && m.x > this.camX - 180);
    this.shots = this.shots.filter(s => !s.dead);
    this.hazards = this.hazards.filter(h => !h.dead);
    this.souls = this.souls.filter(s => !s.taken);
  }

  /* ---------- 碰撞 ---------- */
  collide(){
    const nin = this.ninja;
    if (nin.state === 'dead') return;
    const hb = nin.hitbox(this.camX + this.ninjaX);
    const inv = nin.invT > 0 || nin.dashT > 0 || this.castT > 0;

    for (const e of this.obstacles){
      if (e.dead || e.noHit) continue;
      if (!U.aabb(hb, obstacleHitbox(e, this))) continue;
      if (inv) continue;
      this.damage(e.kind === 'arrow' ? DMG.arrow : DMG.obstacle);
      break;
    }

    // 怪物触碰 / 浪人挥砍
    if (nin.hp > 0){
      for (const m of this.monsterTargets()){
        if (m.dead) continue;
        if (!inv && U.aabb(hb, monsterHitbox(m, this))){
          this.damage(m.kind === 'wisp' ? DMG.wisp : (m.bh > 100 ? DMG.bossTouch : DMG.monster));
          break;
        }
        if (m.kind === 'ronin' && m.state === 'strike' && !m.struck){
          const sb = { x: m.x - 84, y: this.groundY - 86, w: 88, h: 86 };
          if (!inv && U.aabb(hb, sb)){ m.struck = true; this.damage(DMG.roninSlash); break; }
        }
      }
    }
    // 危险物（火球/羽/飞刃/落石/冲击波/地刺爆发）
    if (nin.hp > 0 && !inv){
      for (const h of this.hazards){
        if (!h.dead && U.aabb(hb, hazardHitbox(h, this))){
          this.damage({ fireball: DMG.fireball, feather: DMG.feather, blade: DMG.arrow,
                        rock: DMG.rock, shock: DMG.shock, burst: DMG.burst }[h.type] || DMG.obstacle);
          break;
        }
      }
    }

    // 铜钱（幸运可能双倍）
    const cx = this.camX + this.ninjaX, cy = nin.centerY;
    const cr = this.coinR;
    const luck = this.charDef().coinLuck;
    for (const c of this.coins){
      if (c.taken) continue;
      const dx = c.x - cx, dy = c.y - cy;
      if (dx * dx + dy * dy < cr * cr){
        c.taken = true;
        const gain = Math.random() < luck ? 2 : 1;
        this.coinCount += gain;
        this.coinsEarned += gain;
        this.coinStreakT = 0.9;
        Sfx.coin(this.coinStreak);
        this.coinStreak = Math.min(8, this.coinStreak + 1);
        this.particles.sparkle(c.x - this.camX, c.y);
        if (gain > 1) this.particles.sparkle(c.x - this.camX, c.y - 10, '#e8642b');
      }
    }
    this.coinStreakT -= 1 / 120;
    if (this.coinStreakT <= 0) this.coinStreak = 0;

    // 道具
    for (const p of this.powerups){
      if (p.taken) continue;
      const dx = p.x - cx, dy = p.y - cy;
      if (dx * dx + dy * dy < 48 * 48){
        p.taken = true;
        if (p.type === 'shield'){ nin.shield = true; Sfx.power(); }
        else if (p.type === 'magnet'){ nin.magnetT = 7; Sfx.power(); }
        else if (p.type === 'box'){
          // 忍具匣：四种武器流派轮换
          const order = WEAPON_DEFS.map(w => w.id);
          const idx = order.indexOf(this.weapon.type);
          this.weapon.type = order[(idx + 1) % order.length];
          Sfx.boxSfx();
          const def = WEAPON_DEFS.find(w => w.id === this.weapon.type);
          this.fx.push({
            type: 'text', t: 0, life: 1, x: p.x, y: p.y - 50, size: 20,
            str: '得·' + (def ? def.name : this.weapon.type),
          });
        }
        else {
          const heal = 30;
          nin.hp = Math.min(nin.maxHp, nin.hp + heal);
          Sfx.heart();
          this.fx.push({
            type: 'dmgnum', t: 0, life: 0.8,
            x: p.x, y: p.y - 30, str: '+' + heal, size: 21, color: '#3f8a5a',
          });
        }
        this.particles.inkBurst(p.x - this.camX, p.y, 10, ['#e8c86a', PAPER]);
      }
    }
  }

  damage(amount){
    const nin = this.ninja;
    if (nin.shield){
      nin.shield = false;
      nin.invT = 1.0;
      this.fx.push({
        type: 'dmgnum', t: 0, life: 0.8,
        x: this.camX + this.ninjaX, y: nin.feetY - 120,
        str: '格挡！', size: 22, color: '#4a6b8a',
      });
      this.particles.inkBurst(this.ninjaX, nin.feetY - 46, 12, ['#4a6b8a', '#8fb0d8']);
      this.shake(0.25, 6);
      Sfx.shieldPop();
      return;
    }
    nin.hp -= amount;
    this.damageTaken++;
    if (nin.hp <= 0){
      this.die();
      return;
    }
    // 角色被动：玄·刚躯 无敌加倍；影·胧 延长+强化下一击
    const chId = this.charDef().id;
    nin.invT = chId === 'kuro' ? CFG.invTime + 0.8 : CFG.invTime;
    if (chId === 'kage'){
      nin.invT += 0.5;
      this.empowerNext = true;
    }
    // 受伤红色飘字 + 红闪 + 顿帧
    this.fx.push({
      type: 'dmgnum', t: 0, life: 0.8,
      x: this.camX + this.ninjaX, y: nin.feetY - 118,
      str: '-' + amount, size: 23, color: '#c0392b', jx: U.rand(-8, 8),
    });
    this.fx.push({ type: 'redflash', t: 0, life: 0.3 });
    this.hitStopT = Math.max(this.hitStopT, 0.07);
    this.shake(0.5, 10);
    this.slowT = 0.22;
    Sfx.hit();
    this.particles.inkBurst(this.ninjaX, nin.feetY - 46, 16);
  }

  /* ---------- 战斗 ---------- */
  attack(){
    const w = this.weapon;
    const nin = this.ninja;
    if (w.atkCd > 0 || nin.state === 'dead' || this.castT > 0) return;
    const ch = this.charDef();
    const cloneMul = this.cloneT > 0 ? 2 : 1;
    let empower = 0;
    if (this.empowerNext){ empower = 1; this.empowerNext = false; }

    // 近战范围（按武器与等级，大幅加大的判定带）
    const ranges = {
      katana: [170, 190, 210],
      kunai: [140, 160, 180],
      chain: [250, 280, 310],
      thunder: [160, 180, 200],
      hammer: [200, 230, 260],
    };
    const range = (ranges[w.type] || ranges.katana)[Math.min(3, w.lv) - 1];
    const band = { x: this.camX + this.ninjaX - 40, y: nin.feetY - 190, w: range + 40, h: 210 };

    // 是否存在近身目标（敌人/乌鸦/来袭弹幕）→ 有则挥刀并抵消弹幕
    let meleeTarget = false;
    for (const m of this.monsterTargets()){
      if (!m.dead && U.aabb(band, monsterHitbox(m, this))){ meleeTarget = true; break; }
    }
    if (!meleeTarget){
      for (const e of this.obstacles){
        if (e.dead || (e.kind !== 'arrow' && e.kind !== 'crow')) continue;
        if (U.aabb(band, obstacleHitbox(e, this))){ meleeTarget = true; break; }
      }
    }
    if (!meleeTarget){
      for (const h of this.hazards){
        if (h.dead || h.type === 'burst') continue;
        if (U.aabb(band, hazardHitbox(h, this))){ meleeTarget = true; break; }
      }
    }

    nin.attackT = 0.18;

    // 远程：无近身目标时自动投掷
    if (!meleeTarget){
      if (w.type === 'kunai'){
        w.atkCd = w.lv >= 3 ? 0.36 : 0.42;
        const n = w.lv === 1 ? 1 : w.lv === 2 ? 2 : 3;
        const wx = this.camX + this.ninjaX + 16;
        for (let i = 0; i < n; i++){
          const s = makeShot('kunai', wx, nin.centerY + (i - (n - 1) / 2) * 24, w.lv, this);
          s.dmg = (1 + this.blessAtk) * cloneMul;
          this.shots.push(s);
        }
      } else {
        w.atkCd = 0.45;
        const n = ch.rangedN;
        const wx = this.camX + this.ninjaX + 16;
        for (let i = 0; i < n; i++){
          const s = makeShot('shuriken', wx, nin.centerY + (i - (n - 1) / 2) * 20, w.lv, this);
          s.dmg = (1 + this.blessAtk) * cloneMul;
          this.shots.push(s);
        }
      }
      Sfx.throwKunai();
      return;
    }

    // 近战：按武器风味
    const baseDmg = (w.type === 'chain' ? 2 : w.type === 'hammer' ? 3 : 1) + ch.meleeDmg + this.blessAtk + empower;
    const dmg = baseDmg * cloneMul;
    if (w.type === 'kunai'){
      w.atkCd = [0, 0.32, 0.3, 0.28][w.lv];
      this.fx.push({ type: 'slash', t: 0, life: 0.14, range, color: '#d8d4c8' });
      Sfx.slash();
      this.meleeHit(range, { band, dmg });
    } else if (w.type === 'chain'){
      w.atkCd = [0, 0.6, 0.55, 0.5][w.lv];
      this.fx.push({ type: 'slash', t: 0, life: 0.18, range, wide: true });
      Sfx.slash();
      this.meleeHit(range, { band, dmg, pull: w.lv >= 2 });
    } else if (w.type === 'thunder'){
      w.atkCd = [0, 0.4, 0.36, 0.32][w.lv];
      this.fx.push({ type: 'slash', t: 0, life: 0.14, range, color: '#b9b9ee', edge: '#7a7ad8' });
      Sfx.slash();
      this.meleeHit(range, { band, dmg, chain: w.lv, color: '#7a7ad8' });
    } else if (w.type === 'hammer'){
      // 岩锤：势大力沉，带小震屏
      w.atkCd = [0, 0.75, 0.7, 0.65][w.lv];
      this.fx.push({ type: 'slash', t: 0, life: 0.2, range, wide: true, color: '#c8a878', edge: '#a8784a' });
      Sfx.slash();
      this.shake(0.2, 6);
      this.meleeHit(range, { band, dmg });
    } else {
      w.atkCd = w.lv >= 3 ? 0.34 : w.lv === 2 ? 0.38 : 0.42;
      this.fx.push({ type: 'slash', t: 0, life: 0.16, range });
      Sfx.slash();
      this.meleeHit(range, { band, dmg });
      if (w.lv >= 2){
        const wave = makeShot('wave', this.camX + this.ninjaX + 34, nin.centerY, w.lv, this);
        wave.dmg = 1 + this.blessAtk;
        this.shots.push(wave);
      }
    }
  }

  meleeHit(range, opts = {}){
    const nin = this.ninja;
    const wx = this.camX + this.ninjaX;
    const dmg = opts.dmg !== undefined ? opts.dmg : 1;
    const band = opts.band || { x: wx - 40, y: nin.feetY - 190, w: range + 40, h: 210 };
    const hitList = [];
    for (const m of this.monsterTargets()){
      if (m.dead) continue;
      if (U.aabb(band, monsterHitbox(m, this))){
        this.hitMonster(m, dmg);
        hitList.push(m);
      }
    }
    // 抵消敌方弹幕（箭矢/乌鸦/火球/鸦羽/冲击波/落石）
    for (const e of this.obstacles){
      if (e.dead || (e.kind !== 'arrow' && e.kind !== 'crow')) continue;
      const hb2 = obstacleHitbox(e, this);
      if (U.aabb(band, hb2)){
        e.dead = true;
        if (e.kind === 'crow'){
          this.particles.inkBurst(hb2.x - this.camX, hb2.y, 8);
          this.coin(e.x + U.rand(-10, 10), 70);
          Sfx.hitEnemy();
        } else {
          this.particles.sparkle(hb2.x - this.camX, hb2.y + 3, '#c9c4b4');
        }
      }
    }
    for (const h of this.hazards){
      if (h.dead || h.type === 'burst') continue;
      if (U.aabb(band, hazardHitbox(h, this))){
        h.dead = true;
        this.particles.sparkle(h.x - this.camX, h.type === 'shock' ? this.groundY - 30 : h.y, '#e8c86a');
      }
    }
    // 锁镰·吸财
    if (opts.pull){
      const cx = wx, cy = nin.centerY;
      for (const c of this.coins){
        if (c.taken) continue;
        if (c.x > band.x - 40 && c.x < band.x + band.w + 40){
          c.x = U.lerp(c.x, cx, 0.75);
          c.y = U.lerp(c.y, cy, 0.7);
        }
      }
    }
    // 雷刃·闪电链
    if (opts.chain && hitList.length){
      const hit = new Set(hitList);
      const queue = hitList.slice();
      let chained = 0;
      while (chained < opts.chain && queue.length){
        const src = queue.shift();
        const shb = monsterHitbox(src, this);
        const sx = shb.x + shb.w / 2, sy = shb.y + shb.h / 2;
        let best = null, bd = 260;
        for (const m of this.monsterTargets()){
          if (m.dead || hit.has(m)) continue;
          const mh = monsterHitbox(m, this);
          const d = Math.abs(mh.x + mh.w / 2 - sx);
          if (d < bd){ bd = d; best = m; }
        }
        if (!best) break;
        const bh = monsterHitbox(best, this);
        this.fx.push({
          type: 'bolt', t: 0, life: 0.18,
          x1: sx, y1: sy, x2: bh.x + bh.w / 2, y2: bh.y + bh.h / 2,
        });
        this.hitMonster(best, dmg);
        hit.add(best);
        queue.push(best);
        chained++;
      }
    }
  }

  monsterTargets(){
    return this.boss ? this.monsters.concat([this.boss]) : this.monsters;
  }

  hitMonster(m, dmg, elem){
    if (m.dead || m.hitFlash > 0.06) return;   // 短窗口防同一击重复结算
    // Boss 受击：血条白闪 + 命中回奥义（打鬼王越久奥义涨越快）
    if (['oni', 'tengu', 'golem', 'bone', 'vine'].includes(m.kind)){
      this.bossBarFlash = 0.12;
      this.ult = Math.min(100, this.ult + 2 * this.ultMul);
    }
    // 五行克制：克制 ×1.15 / 被克 ×0.9（×10 数值制）
    const wElem = elem || (WEAPON_DEFS.find(w => w.id === this.weapon.type) || {}).elem;
    const mult = ELEM.mult(wElem, m.elem);
    const finalDmg = Math.max(1, Math.round(dmg * 10 * mult));
    m.hp -= finalDmg;
    m.hitFlash = 0.14;
    m.kb = 0.18;
    Sfx.hitEnemy();
    const hb = monsterHitbox(m, this);
    const hx = hb.x + hb.w / 2 - this.camX, hy = hb.y + hb.h / 2;
    this.particles.inkBurst(hx, hy, 6, [INK, '#55555f']);
    if (mult > 1){
      this.particles.sparkle(hx, hy, '#e8c86a');
      this.particles.sparkle(hx + 8, hy - 6, '#e8c86a');
    } else if (mult < 1){
      this.particles.sparkle(hx, hy, '#9a958a');
    }
    // 伤害飘字：克制金色放大 / 被克灰色 / 普通墨色
    this.fx.push({
      type: 'dmgnum', t: 0, life: 0.8,
      x: hb.x + hb.w / 2 + U.rand(-8, 8), y: hb.y - 6,
      str: String(finalDmg) + (mult > 1 ? ' ⚡' : ''),
      size: mult > 1 ? 26 : 19,
      color: mult > 1 ? '#c98a1a' : mult < 1 ? '#9a958a' : INK,
    });
    if (m.hp <= 0) this.killMonster(m);
  }

  killMonster(m){
    m.dead = true;
    this.kills++;
    Sfx.enemyDie();
    // 击杀连击（3 秒窗口，连击加分）
    this.combo++;
    this.comboT = 3;
    this.comboBest = Math.max(this.comboBest, this.combo);
    if (this.combo >= 2){
      this.comboBonus += this.combo * 5;
      this.fx.push({
        type: 'dmgnum', t: 0, life: 0.7,
        x: m.x, y: monsterHitbox(m, this).y - 30,
        str: this.combo + ' 连杀', size: 17, color: '#c98a1a',
      });
      Sfx.coin(Math.min(8, this.combo));
    }
    // 全局统计与成就
    this.stats.kills++;
    const isBoss = ['oni', 'tengu', 'golem', 'bone', 'vine'].includes(m.kind);
    if (isBoss) this.stats.bossKills[m.kind] = (this.stats.bossKills[m.kind] || 0) + 1;
    store.set('stats', this.stats);
    const hb = monsterHitbox(m, this);
    const wx = hb.x + hb.w / 2;
    const wy = hb.y + hb.h / 2;
    this.particles.inkBurst(wx - this.camX, wy, isBoss ? 30 : 12);
    this.shake(isBoss ? 0.7 : 0.22, isBoss ? 14 : 6);
    // 奥义积蓄
    const gain = isBoss ? 100 : m.kind === 'wisp' ? 14 : 22;
    this.ult = Math.min(100, this.ult + gain * this.ultMul);
    if (isBoss){
      this.bossDieRewards(m, wx, wy);
    } else {
      this.spawnCoinsAt(wx, m.kind === 'wisp' ? 2 : 4);
      this.spawnSouls(wx, wy, m.kind === 'wisp' ? 1 : 2);
    }
    this.checkAch();
  }

  bossDieRewards(m, wx, wy){
    Sfx.bossDie();
    this.slowT = 0.4;
    this.hitStopT = Math.max(this.hitStopT, 0.14);   // 斩杀顿帧
    const big = m.kind === 'golem' ? 20 : m.kind === 'tengu' ? 18 : 16;
    this.spawnCoinsAt(wx, big);
    this.spawnSouls(wx, wy, m.kind === 'golem' ? 10 : 8);
    this.powerup('heart', wx + 34, 100);
    this.powerup('box', wx - 30, 135);
    this.fx.push({ type: 'text', t: 0, life: 1.3, x: wx, y: wy - 90, str: m.name + '·讨伐！', size: 30 });
    // 终幕鬼王已灭 → 解除通关门禁
    if (this.mode === 'stage' && this.bossSchedule.length === 0){
      this.finalBossDone = true;
    }
    this.boss = null;
    this.nextBossAt = this.dist + U.rand(420, 560);
  }

  addSoul(v){
    this.weapon.xp += v;
    Sfx.soul();
    while (this.weapon.lv < 3 && this.weapon.xp >= this.weaponNeed[this.weapon.lv]){
      this.weapon.lv++;
      Sfx.levelup();
      this.fx.push({
        type: 'text', t: 0, life: 1.1,
        x: this.camX + this.ninjaX, y: this.ninja.feetY - 140,
        str: '武器升级！', size: 26,
      });
      this.particles.ring(this.ninjaX, this.ninja.centerY);
    }
  }

  /* ---------- 技能（每角色一个元素攻击技） ---------- */
  castSkill(){
    const ch = this.charDef();
    if (this.skillCd > 0 || this.ninja.state === 'dead' || this.castT > 0){ Sfx.deny(); return; }
    const wx = this.camX + this.ninjaX;
    const elem = ch.elem;
    const bonus = this.blessAtk + (this.empowerNext ? 1 : 0);
    if (this.empowerNext) this.empowerNext = false;

    if (ch.skill.id === 'fireorb'){
      // 烈焰冲击：大火球向前轰击，碾碎沿途一切
      const s = makeShot('fireorb', wx + 30, this.ninja.centerY, 1, this);
      s.dmg = 4 + bonus;
      s.elem = elem;
      this.shots.push(s);
      this.fx.push({ type: 'text', t: 0, life: 0.9, x: wx, y: this.ninja.feetY - 170, str: '烈焰冲击！', size: 24, color: ELEM.color.fire });
      this.shake(0.3, 8);
      Sfx.ultCharge();
    } else if (ch.skill.id === 'spike'){
      // 裂地崩：地刺波向前碾轧
      const s = makeShot('spike', wx + 40, this.groundY, 1, this);
      s.dmg = 3 + ch.meleeDmg + bonus;
      s.elem = elem;
      this.shots.push(s);
      // 就地小震
      const band = { x: wx - 40, y: this.ninja.feetY - 200, w: 240, h: 220 };
      for (const m of this.monsterTargets()){
        if (!m.dead && U.aabb(band, monsterHitbox(m, this))) this.hitMonster(m, 2 + ch.meleeDmg, elem);
      }
      this.fx.push({ type: 'text', t: 0, life: 0.9, x: wx, y: this.ninja.feetY - 170, str: '裂地崩！', size: 24, color: ELEM.color.earth });
      this.shake(0.4, 10);
      Sfx.bossRoar();
    } else if (ch.skill.id === 'leaf'){
      // 木叶旋刃：五片叶刃扇形激射
      for (let i = 0; i < 5; i++){
        const a = (i - 2) / 2 * 0.3;
        const s = makeShot('leaf', wx + 16, this.ninja.centerY, 1, this);
        s.vx = (this.speed + 600) * Math.cos(a);
        s.vy = (this.speed + 600) * Math.sin(a) * 0.5;
        s.dmg = 2 + bonus;
        s.elem = elem;
        this.shots.push(s);
      }
      this.fx.push({ type: 'text', t: 0, life: 0.9, x: wx, y: this.ninja.feetY - 170, str: '木叶旋刃！', size: 24, color: ELEM.color.wood });
      Sfx.throwKunai();
    }
    this.skillCd = ch.skillCd;
  }

  /* ---------- 奥义（角色制，蓄满即放） ---------- */
  castUlt(){
    if (this.castT > 0 || this.ninja.state === 'dead') return;
    if (this.ult < 100){
      this.fx.push({
        type: 'text', t: 0, life: 0.8,
        x: this.camX + this.ninjaX, y: this.ninja.feetY - 160,
        str: '奥义未蓄满', size: 18, color: '#8a8a96',
      });
      Sfx.deny();
      return;
    }
    this.ult = 0;
    this.castT = 0.8;
    this.slowT = 0.32;
    this.stats.ults++;
    store.set('stats', this.stats);
    Sfx.ultCharge();
    this.checkAch();
  }

  ultRelease(){
    const nin = this.ninja;
    const ch = this.charDef();
    const wx = this.camX + this.ninjaX;
    Sfx.ultRelease();
    this.shake(0.6, 12);
    this.fx.push({ type: 'flash', t: 0, life: 0.28 });
    if (ch.ult.id === 'zangeki'){
      // 影·万象裂空斩
      const wave = makeShot('ultwave', wx + 46, nin.centerY, 3, this);
      wave.size = 110;
      wave.elem = ch.elem;
      this.shots.push(wave);
      const band = { x: wx - 20, y: nin.feetY - 180, w: 260, h: 200 };
      for (const m of this.monsterTargets()){
        if (!m.dead && U.aabb(band, monsterHitbox(m, this))) this.hitMonster(m, 4, ch.elem);
      }
    } else if (ch.ult.id === 'landslide'){
      // 玄·崩山击：全场巨石崩落
      const elem = ch.elem;
      for (const m of this.monsterTargets()){
        if (m.dead || m.x - this.camX > this.W + 60) continue;
        const hb = monsterHitbox(m, this);
        this.fx.push({
          type: 'bolt', t: 0, life: 0.3,
          x1: hb.x + hb.w / 2, y1: -20, x2: hb.x + hb.w / 2, y2: hb.y + hb.h / 2,
        });
        this.hitMonster(m, 8, elem);
      }
      this.fx.push({ type: 'slash', t: 0, life: 0.35, range: this.W * 0.8, wide: true });
      this.shake(1.0, 16);
    } else if (ch.ult.id === 'storm'){
      // 凛·残月风暴：镖雨 + 疾风加速
      for (let i = 0; i < 24; i++){
        const a = (i - 11.5) / 11.5 * 0.55;
        const s = makeShot('kunai', wx + 16, nin.centerY, 3, this);
        s.vx = (this.speed + 660) * Math.cos(a);
        s.vy = (this.speed + 660) * Math.sin(a) * 0.5;
        s.dmg = 2;
        s.pierce = 4;
        this.shots.push(s);
      }
      this.speedBoostT = 3;
    }
    // 荡清敌方弹幕
    for (const e of this.obstacles) if (e.kind === 'arrow' || e.kind === 'crow') e.dead = true;
    for (const h of this.hazards) if (h.type !== 'burst') h.dead = true;
  }

  updateShotsHits(){
    for (const s of this.shots){
      if (s.dead) continue;
      const box = s.type === 'wave' || s.type === 'ultwave'
        ? { x: s.x - s.size, y: s.y - s.size * 0.8, w: s.size * 2, h: s.size * 1.6 }
        : { x: s.x - 14, y: s.y - 6, w: 28, h: 12 };
      for (const m of this.monsterTargets()){
        if (m.dead) continue;
        if (s.hitSet && s.hitSet.has(m)) continue;
        if (U.aabb(box, monsterHitbox(m, this))){
          this.hitMonster(m, s.dmg, s.elem);
          if (s.pierce-- <= 0){ s.dead = true; break; }
          if (!s.hitSet) s.hitSet = new Set();
          s.hitSet.add(m);
        }
      }
      if (s.dead) continue;
      // 弹幕对撞：我方飞行物抵消敌方弹幕
      for (const h of this.hazards){
        if (h.dead || h.type === 'burst') continue;
        if (U.aabb(box, hazardHitbox(h, this))){
          h.dead = true;
          this.particles.sparkle(h.x - this.camX, h.type === 'shock' ? this.groundY - 30 : h.y, '#e8c86a');
        }
      }
      for (const e of this.obstacles){
        if (e.dead || e.kind !== 'arrow') continue;
        if (U.aabb(box, obstacleHitbox(e, this))) e.dead = true;
      }
      if (s.dead) continue;
      if (s.type === 'wave' || s.type === 'ultwave'){
        for (const e of this.obstacles){
          if (e.dead || e.kind !== 'crow') continue;
          if (U.aabb(box, obstacleHitbox(e, this))){
            e.dead = true;
            this.coin(e.x + U.rand(-10, 10), 70);
          }
        }
      }
    }
  }

  /* ---------- Boss（三Boss轮换） ---------- */
  spawnBoss(){
    const round = this.bossRound;
    // 关卡模式：按队列（终幕=本关元素鬼王）；其他模式按顺序轮换
    let def;
    if (this.mode === 'stage' && this.bossQueue && this.bossQueue.length){
      def = this.bossQueue.shift();
    } else {
      def = BOSS_DEFS[round % BOSS_DEFS.length];
    }
    const loop = Math.floor(round / BOSS_DEFS.length);
    const stageBonus = this.mode === 'stage' ? Math.min(10, (this.stageNum - 1) * 2) : 0;
    const m = makeMonster(def.kind, 0);
    m.maxHp = m.hp = (def.hp + loop * 4 + stageBonus) * 10;   // ×10 数值制
    m.bw = def.bw; m.bh = def.bh;
    m.name = def.name;
    m.elem = def.elem;
    m.cycle = def.cycle;
    m.halfCy = def.half;
    m.attacks = def.attacks;
    m.hoverBase = m.yOff;
    m.screenX = this.W + 160;
    m.x = this.camX + m.screenX;
    this.boss = m;
    this.bossRound = round + 1;
    $id('boss-name').textContent = def.name;
    $id('boss-elem').textContent = ELEM.zh[def.elem];
    $id('boss-elem').style.background = ELEM.color[def.elem];
    // 鬼王来袭横幅 + 慢镜
    this.fx.push({
      type: 'text', t: 0, life: 1.6,
      x: this.camX + this.W / 2, y: this.groundY - 260,
      str: '⚠ ' + def.name + ' · ' + ELEM.zh[def.elem] + ' 来袭 ⚠', size: 34,
    });
    this.slowT = Math.max(this.slowT, 0.3);
    Sfx.bossRoar();
    this.shake(0.5, 10);
  }

  updateBossLogic(dt){
    if (!this.boss){
      if (this.mode === 'stage'){
        if (this.bossSchedule.length && this.dist > this.bossSchedule[0]){
          this.spawnBoss();
          this.bossSchedule.shift();
        }
      } else if (this.dist > this.nextBossAt){
        this.spawnBoss();
      }
      return;
    }
    const m = this.boss;
    m.t += dt;
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    m.life += dt;
    const targetX = this.W - (m.kind === 'golem' ? 185 : 165);

    if (m.state === 'entry'){
      m.screenX += (targetX - m.screenX) * Math.min(1, dt * 3.5);
      if (Math.abs(m.screenX - targetX) < 8){ m.state = 'fight'; m.atkTimer = 1.4; }
    } else if (m.state === 'fight'){
      this.updateBossFight(m, dt, targetX);
      // 终幕鬼王永不撤退（必须讨伐）；中场鬼王与每日模式可撤退
      if (m.life > 26 && (this.mode === 'daily' || this.bossSchedule.length > 0)) m.state = 'retreat';
    } else if (m.state === 'retreat'){
      m.screenX += 520 * dt;
      m.yOff += (m.hoverBase + 60 - m.yOff) * Math.min(1, dt * 2);
      if (m.screenX > this.W + 240){
        this.boss = null;
        this.nextBossAt = this.dist + U.rand(420, 560);
      }
    }
    m.x = this.camX + m.screenX;
  }

  updateBossFight(m, dt, targetX){
    // 通用：贴脸冲锋（oni/bone 砸地；tengu 俯冲掠击；golem/vine 重锤连震）
    if (m.charge){
      const c = m.charge;
      if (m.kind === 'tengu'){
        if (c.phase === 0){
          // 升空蓄力
          c.t += dt;
          m.yOff += (m.hoverBase + 46 - m.yOff) * Math.min(1, dt * 4);
          m.screenX += (targetX + 40 - m.screenX) * Math.min(1, dt * 3);
          if (c.t > 0.55){ c.phase = 1; c.t = 0; Sfx.bossRoar(); }
        } else if (c.phase === 1){
          // 贴头掠过（高度约在站立头顶上方，跳跃会撞上；地面可用太刀斩到）
          c.t += dt;
          const k = Math.min(1, c.t / 0.75);
          m.screenX = U.lerp(c.sx0, this.ninjaX - 250, k);
          m.yOff = U.lerp(m.hoverBase + 46, 92, Math.min(1, k * 2));
          if (k >= 1){ c.phase = 2; c.t = 0; }
        } else {
          c.t += dt;
          m.yOff += (m.hoverBase - m.yOff) * Math.min(1, dt * 3);
          m.screenX += 420 * dt;
          if (m.screenX >= targetX){ m.screenX = targetX; m.charge = null; }
        }
      } else {
        const linger = (m.kind === 'golem' || m.kind === 'vine') ? 1.15 : 0.95;
        if (c.phase === 0){
          m.screenX -= 620 * dt;
          if (m.screenX <= this.ninjaX + 160){
            c.phase = 1; c.t = 0;
            m.atkKind = 'swing'; m.atkAnim = 0.98;
          }
        } else if (c.phase === 1){
          c.t += dt;
          if (m.atkAnim > 0.35) m.atkAnim -= dt;
          if (c.t > linger){
            m.charge = { phase: 2, home: c.home };
            m.atkKind = ''; m.atkAnim = 0;
            this.hazards.push(makeHazard('shock', m.x - 70, 0, -(this.speed * 0.25 + 300), 0));
            if (m.kind === 'golem' || m.kind === 'vine'){
              // 山魈/藤魔·二连震
              this.hazards.push(makeHazard('shock', m.x - 70, 0, -(this.speed * 0.25 + 200), 0));
            }
            Sfx.arrow();
            this.shake(0.4, 10);
          }
        } else {
          m.screenX += 540 * dt;
          if (m.screenX >= c.home){ m.screenX = c.home; m.charge = null; }
        }
      }
      return;
    }

    m.screenX = targetX + Math.sin(m.t * 0.8) * 26;
    if (m.kind === 'tengu') m.yOff = m.hoverBase + Math.sin(m.t * 1.6) * 14;

    if (m.atkAnim > 0){
      m.atkAnim -= dt;
      if (m.atkKind === 'swing' && m.atkAnim <= 0){
        this.hazards.push(makeHazard('shock', m.x - 70, 0, -(this.speed * 0.25 + 280), 0));
        Sfx.arrow();
        this.shake(0.3, 8);
      } else if (m.atkKind === 'fire' && m.atkAnim <= 0){
        this.bossFan(m, 3, 60, 300, 'fireball');
        Sfx.throwKunai();
      } else if (m.atkKind === 'bladeFan' && m.atkAnim <= 0){
        this.bossFan(m, 5, 34, 400, 'blade');
        Sfx.throwKunai();
      } else if (m.atkKind === 'feathers' && m.atkAnim <= 0){
        this.bossFan(m, 5, 34, 360, 'feather');
        Sfx.throwKunai();
      } else if (m.atkKind === 'rocks' && m.atkAnim <= 0){
        this.bossRocks(m, 3);
        Sfx.throwKunai();
      } else if (m.atkKind === 'burst' && m.atkAnim <= 0){
        const px = this.camX + this.ninjaX;
        this.hazards.push(makeHazard('burst', px, 0, 0, 0));
        this.hazards.push(makeHazard('burst', px + 130, 0, 0, 0));
        Sfx.arrow();
      } else if (m.atkKind === 'crow' && m.atkAnim <= 0){
        this.obstacles.push(makeObstacle('crow', this.camX + this.W + 30));
        this.obstacles.push(makeObstacle('crow', this.camX + this.W + 140));
        Sfx.bossRoar();
      } else if (m.atkKind === 'summon' && m.atkAnim <= 0){
        this.monsters.push(makeMonster('wisp', this.camX + this.W + 40, { y: 160 }));
        this.monsters.push(makeMonster('wisp', this.camX + this.W + 150, { y: 110 }));
        Sfx.bossRoar();
      }
      return;
    }

    m.atkTimer -= dt;
    if (m.atkTimer <= 0){
      const half = m.hp <= m.maxHp / 2;
      const cy = half ? m.halfCy : m.cycle;
      m.atkTimer = this.rnd(cy[0], cy[1]);
      const pick = m.attacks[Math.floor(this.rng() * m.attacks.length)];
      if (pick === 'charge'){
        m.charge = { phase: 0, home: targetX };
        Sfx.bossRoar();
      } else if (pick === 'swoop'){
        m.charge = { phase: 0, t: 0, sx0: m.screenX };
        Sfx.bossRoar();
      } else if (pick === 'swing'){ m.atkKind = 'swing'; m.atkAnim = 0.62; }
      else if (pick === 'fire'){ m.atkKind = 'fire'; m.atkAnim = 0.5; }
      else if (pick === 'bladeFan'){ m.atkKind = 'bladeFan'; m.atkAnim = 0.5; }
      else if (pick === 'feathers'){ m.atkKind = 'feathers'; m.atkAnim = 0.55; }
      else if (pick === 'rocks'){ m.atkKind = 'rocks'; m.atkAnim = 0.6; }
      else if (pick === 'burst'){ m.atkKind = 'burst'; m.atkAnim = 0.5; }
      else if (pick === 'crow'){ m.atkKind = 'crow'; m.atkAnim = 0.4; }
      else if (pick === 'summon'){ m.atkKind = 'summon'; m.atkAnim = 0.4; }
    }
  }

  // 扇形弹幕（火球/鸦羽）
  bossFan(m, n, spread, speed, type){
    const bx = m.x - 40;
    const by = this.groundY - m.yOff - m.bh * 0.55;
    const tx = this.camX + this.ninjaX, ty = this.ninja.centerY;
    for (let i = 0; i < n; i++){
      const off = (i - (n - 1) / 2) * spread;
      const dx = tx - bx, dy = ty + off - by;
      const d = Math.hypot(dx, dy) || 1;
      const sp = this.speed * 0.35 + speed;
      this.hazards.push(makeHazard(type, bx, by, dx / d * sp, dy / d * sp));
    }
  }

  // 山魈抛石：预判落点 + 预警圈
  bossRocks(m, n){
    const bx = m.x - 30, by = this.groundY - m.yOff - m.bh - 10;
    const px = this.camX + this.ninjaX;
    const T = 0.9;
    for (let i = 0; i < n; i++){
      const tx = px + this.speed * T * 0.6 + (i - (n - 1) / 2) * 130;
      const h = makeHazard('rock', bx, by, (tx - bx) / T, -320);
      h.gvy = 980;
      h.tx = tx;
      this.hazards.push(h);
    }
  }

  /* ---------- 功坊（永久升级商店） ---------- */
  openShop(){
    this.renderShop();
    $id('shop').classList.remove('hidden');
  }

  closeShop(){
    $id('shop').classList.add('hidden');
  }

  renderShop(){
    $id('shop-coins').textContent = this.bank;
    const list = $id('shop-list');
    list.innerHTML = '';
    for (const def of SHOP_DEFS){
      const lv = this.shop[def.id];
      const maxed = lv >= 3;
      const cost = maxed ? 0 : def.costs[lv];
      const afford = this.bank >= cost;
      const row = document.createElement('div');
      row.className = 'shop-row';
      const pips = [0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      row.innerHTML =
        `<div class="shop-info"><b>${def.name}</b><span>${def.desc}</span><div class="pips">${pips}</div></div>` +
        `<button class="btn small buy" data-id="${def.id}" ${maxed || !afford ? 'disabled' : ''}>` +
        `${maxed ? '已满级' : cost + ' 钱'}</button>`;
      list.appendChild(row);
    }
    // 皮肤区
    const skins = $id('skin-list');
    skins.innerHTML = '';
    for (const sk of SKIN_DEFS){
      const owned = this.skins.includes(sk.id);
      const equipped = this.skinId === sk.id;
      const canBuy = sk.cost !== null && this.bank >= sk.cost;
      const row = document.createElement('div');
      row.className = 'shop-row skin-row';
      let btn;
      if (equipped) btn = `<button class="btn small" disabled>使用中</button>`;
      else if (owned) btn = `<button class="btn small equip" data-id="${sk.id}">装备</button>`;
      else if (sk.cost === null) btn = `<button class="btn small" disabled>成就解锁</button>`;
      else btn = `<button class="btn small buyc" data-id="${sk.id}" ${canBuy ? '' : 'disabled'}>${sk.cost} 钱</button>`;
      row.innerHTML =
        `<div class="shop-info"><b><i class="dot" style="background:${sk.scarf}"></i>${sk.name}</b>` +
        `<span>${sk.cost === null ? '成就「百人斩」解锁' : '忍者皮肤配色'}</span></div>` + btn;
      skins.appendChild(row);
    }
  }

  buySkin(id){
    const sk = SKIN_DEFS.find(s => s.id === id);
    if (!sk || sk.cost === null || this.skins.includes(id)) return;
    if (this.bank < sk.cost){ Sfx.deny(); return; }
    this.bank -= sk.cost;
    this.skins.push(id);
    store.set('bank', this.bank);
    store.set('skins', this.skins);
    Sfx.buy();
    this.equipSkin(id);
  }

  equipSkin(id){
    if (!this.skins.includes(id)) return;
    this.skinId = id;
    store.set('skin', id);
    this.ninja.skin = this.skinDef();
    this.renderShop();
    this.syncMenuInfo();
  }

  buyUpgrade(id){
    const def = SHOP_DEFS.find(d => d.id === id);
    if (!def) return;
    const lv = this.shop[id];
    if (lv >= 3) return;
    const cost = def.costs[lv];
    if (this.bank < cost){ Sfx.deny(); return; }
    this.bank -= cost;
    this.shop[id] = lv + 1;
    store.set('bank', this.bank);
    store.set('shop', this.shop);
    Sfx.buy();
    this.renderShop();
    this.syncMenuInfo();
    this.checkAch();
  }

  /* ---------- 成就系统 ---------- */
  openAch(){
    this.renderAch();
    $id('ach').classList.remove('hidden');
  }

  closeAch(){
    $id('ach').classList.add('hidden');
  }

  renderAch(){
    const done = ACH_DEFS.filter(a => this.ach[a.id]).length;
    $id('ach-count').textContent = `${done} / ${ACH_DEFS.length}`;
    const list = $id('ach-list');
    list.innerHTML = '';
    for (const a of ACH_DEFS){
      const got = !!this.ach[a.id];
      const row = document.createElement('div');
      row.className = 'ach-row' + (got ? ' done' : '');
      row.innerHTML =
        `<b>${a.name}</b><span>${a.desc}</span><i>${got ? '✓' : '·'}</i>`;
      list.appendChild(row);
    }
  }

  toast(msg){
    const t = $id('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  checkAch(){
    const s = this.stats;
    const stars = store.get('stars', {});
    const bk = s.bossKills || {};
    const conds = {
      stage1: !!stars[1],
      stage3: !!stars[3],
      stage5: !!stars[5],
      kill50: s.kills >= 50,
      kill200: s.kills >= 200,
      rich: this.bank >= 1000,
      boss1: (bk.oni || 0) + (bk.tengu || 0) + (bk.golem || 0) > 0,
      boss3: (bk.oni || 0) > 0 && (bk.tengu || 0) > 0 && (bk.golem || 0) > 0,
      ult10: s.ults >= 10,
      dist1k: s.maxDist >= 1000,
      perfect: this._perfect,
    };
    let newly = [];
    for (const def of ACH_DEFS){
      if (!this.ach[def.id] && conds[def.id]){
        this.ach[def.id] = true;
        newly.push(def);
      }
    }
    if (newly.length){
      store.set('ach', this.ach);
      for (const def of newly){
        this.toast(`成就达成：${def.name}`);
        Sfx.levelup();
        // 成就奖励皮肤
        if (def.id === 'kill200' && !this.skins.includes('yaksha')){
          this.skins.push('yaksha');
          store.set('skins', this.skins);
          this.toast(`成就达成：${def.name}（解锁皮肤·夜叉）`);
        }
      }
    }
  }

  /* ---------- 局内商店（跑图中途补给点，花本局铜钱） ---------- */
  openRunShop(){
    this.state = 'shop';
    this.renderRunShop();
    $id('runshop').classList.remove('hidden');
    Input.clearQ();
    Sfx.boxSfx();
  }

  closeRunShop(){
    if (this.state !== 'shop') return;
    this.state = 'playing';
    $id('runshop').classList.add('hidden');
    Input.clearQ();
  }

  renderRunShop(){
    $id('rs-coins').textContent = this.coinCount;
    const list = $id('rs-list');
    list.innerHTML = '';
    for (const it of RUNSHOP_DEFS){
      const afford = this.coinCount >= it.cost;
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML =
        `<div class="shop-info"><b>${it.name}</b></div>` +
        `<button class="btn small rsbuy" data-id="${it.id}" ${afford ? '' : 'disabled'}>${it.cost} 钱</button>`;
      list.appendChild(row);
    }
  }

  buyRunItem(id){
    const it = RUNSHOP_DEFS.find(d => d.id === id);
    if (!it || this.coinCount < it.cost) { Sfx.deny(); return; }
    this.coinCount -= it.cost;
    const nin = this.ninja;
    if (id === 'heal'){
      const heal = 35;
      nin.hp = Math.min(nin.maxHp, nin.hp + heal);
      this.fx.push({
        type: 'dmgnum', t: 0, life: 0.8,
        x: this.camX + this.ninjaX, y: nin.feetY - 120, str: '+' + heal, size: 21, color: '#3f8a5a',
      });
    }
    else if (id === 'soul') this.addSoul(4);
    else if (id === 'shield') nin.shield = true;
    else if (id === 'magnet') nin.magnetT = 6;
    else if (id === 'box'){
      const order = WEAPON_DEFS.map(w => w.id);
      const idx = order.indexOf(this.weapon.type);
      this.weapon.type = order[(idx + 1) % order.length];
    }
    else if (id === 'bless') this.blessAtk++;
    Sfx.buy();
    this.renderRunShop();
    this.syncHud(true);
  }

  /* ---------- 生成辅助（供 Chunks 调用） ---------- */
  obstacle(kind, x, opts){ this.obstacles.push(makeObstacle(kind, x, opts)); }
  monster(kind, x, opts){ this.monsters.push(makeMonster(kind, x, opts)); }
  coin(x, h){ this.coins.push({ x, y: this.groundY - h, t: Math.random() * 9, taken: false }); }
  coinArc(cx, peak, w){
    const n = 7;
    for (let i = 0; i < n; i++){
      const h = 50 + (peak - 50) * Math.sin(Math.PI * i / (n - 1));
      this.coin(cx - w / 2 + i * (w / (n - 1)), h);
    }
  }
  powerup(type, x, h){ this.powerups.push({ type, x, y: this.groundY - h, t: Math.random() * 9, taken: false }); }
  decor(kind, x){ this.decors.push({ x, kind }); }
  spawnCoinsAt(x, n){
    for (let i = 0; i < n; i++) this.coin(x + U.rand(-55, 55), U.rand(50, 150));
  }
  spawnSouls(x, y, n){
    for (let i = 0; i < n; i++){
      this.souls.push({
        x: x + U.rand(-34, 34), y: y + U.rand(-30, 20),
        t: U.rand(0, 3), life: 7, taken: false,
      });
    }
  }

  /* ---------- 绘制 ---------- */
  draw(){
    const ctx = this.ctx;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    if (this.shakeT > 0){
      const m = this.shakeMag * Math.min(1, this.shakeT / 0.5);
      ctx.translate(U.rand(-m, m), U.rand(-m, m));
    }
    Bg.draw(ctx, this);
    for (const d of this.decors) drawDecor(d, ctx, this);
    Bg.drawGround(ctx, this);
    for (const p of this.powerups) drawPowerup(p, ctx, this);
    for (const so of this.souls) drawSoul(so, ctx, this);
    for (const c of this.coins) drawCoin(c, ctx, this);
    for (const e of this.obstacles) drawObstacle(e, ctx, this);
    for (const m of this.monsters) drawMonster(m, ctx, this);
    drawBoss(this.boss, ctx, this);
    for (const s of this.shots) drawShot(s, ctx, this);
    for (const h of this.hazards) drawHazard(h, ctx, this);
    this.particles.draw(ctx);
    this.ninja.draw(ctx, this);
    for (const f of this.fx) drawFx(f, ctx, this);
    Bg.drawLeaves(ctx, this);
    Bg.drawOver(ctx, this);
  }

  /* ---------- HUD ---------- */
  syncHud(force){
    const set = (id, v) => {
      if (force || this._hud[id] !== v){
        this._hud[id] = v;
        $id(id).textContent = v;
      }
    };
    set('score', String(this.score));
    set('dist', Math.floor(this.dist) + 'm');
    set('coins', String(this.coinCount));

    // 体力条（100 制）
    const hpPct = U.clamp(this.ninja.hp / this.ninja.maxHp * 100, 0, 100);
    $id('hp-fill').style.width = hpPct + '%';
    $id('hp-num').textContent = Math.max(0, Math.ceil(this.ninja.hp)) + '/' + this.ninja.maxHp;
    $id('hp-box').classList.toggle('low', hpPct <= 30);
    $id('shield-tag').classList.toggle('hidden', !this.ninja.shield);

    const cd = this.ninja.dashCd;
    const bar = $id('dash-fill');
    bar.style.transform = `scaleX(${1 - cd / this.dashCdMax})`;
    $id('dash-cd').classList.toggle('ready', cd <= 0);

    // 武器与攻击冷却
    const w = this.weapon;
    const wdef = WEAPON_DEFS.find(d => d.id === w.type);
    const wname = (wdef ? ELEM.zh[wdef.elem] + '·' + (wdef.name.split('·')[1] || wdef.name) : w.type) + '·' + (w.lv >= 3 ? 'MAX' : 'Lv' + w.lv);
    if (this._hud.wname !== wname){
      this._hud.wname = wname;
      $id('wp-name').textContent = wname;
    }
    let k = 1;
    if (w.lv < 3){
      const prev = w.lv === 1 ? 0 : this.weaponNeed[1];
      const need = this.weaponNeed[w.lv];
      k = U.clamp((w.xp - prev) / (need - prev), 0, 1);
    }
    $id('wp-fill').style.transform = `scaleX(${k})`;
    const acd = w.atkCd;
    $id('atk-fill').style.transform = `scaleX(${1 - Math.min(1, acd / 0.45)})`;
    $id('atk-cd').classList.toggle('ready', acd <= 0);

    // 奥义槽（角色制，蓄满即放）
    $id('ult-fill').style.transform = `scaleX(${this.ult / 100})`;
    const uc = $id('ult-cd');
    uc.classList.toggle('ready', this.ult >= 100);
    uc.classList.remove('dim');

    // 技能冷却
    $id('skill-fill').style.transform = `scaleX(${1 - this.skillCd / (this.skillCdMax || 12)})`;
    $id('skill-cd').classList.toggle('ready', this.skillCd <= 0);

    // 关卡进度条（终点=鬼王门禁）
    const sh = $id('stage-hud');
    if (this.mode === 'stage' && this.state !== 'menu'){
      sh.classList.remove('hidden');
      $id('stage-fill').style.width = Math.min(100, this.dist / this.stageLen * 100) + '%';
      const gating = !this.finalBossDone && this.dist > this.stageLen * 0.7;
      const lbl = $id('stage-label');
      lbl.textContent = gating ? '⚔ 讨伐鬼王' : '第' + this.stageNum + '关 · ' + Bg.theme.name;
      lbl.classList.toggle('gating', gating);
    } else {
      sh.classList.add('hidden');
    }

    // 击杀连击显示
    const cb = $id('combo');
    if (this.combo >= 2 && this.comboT > 0){
      cb.classList.remove('hidden');
      cb.textContent = this.combo + ' 连杀';
    } else {
      cb.classList.add('hidden');
    }

    // 低血量红色警示
    $id('low-hp').classList.toggle('on', this.ninja.hp > 0 && this.ninja.hp <= this.ninja.maxHp * 0.3);

    // Boss 血条受击白闪
    $id('boss-hp').classList.toggle('hit', this.bossBarFlash > 0);

    // Boss 血条 + 五行克制提示
    const bb = $id('boss-bar');
    if (this.boss && this.boss.state !== 'entry'){
      bb.classList.remove('hidden');
      $id('boss-fill').style.width = Math.max(0, this.boss.hp / this.boss.maxHp * 100) + '%';
      const we = (WEAPON_DEFS.find(d => d.id === this.weapon.type) || {}).elem;
      const m2 = ELEM.mult(we, this.boss.elem);
      const hint = $id('boss-hint');
      hint.textContent = m2 > 1 ? '克制+15%' : m2 < 1 ? '被克-10%' : '';
      hint.style.color = m2 > 1 ? '#8a6a2a' : '#7a7a84';
    } else {
      bb.classList.add('hidden');
    }
  }
}
