'use strict';

const PAPER = '#f2ecdf', INK = '#202028', INK_SOFT = '#3a3a46',
      RED = '#c8322b', RED_D = '#8f231b', BRONZE = '#b48a3e';

// 两段式肢体：角度以竖直向下为 0，正值朝前
function limb(ctx, x, y, a1, a2, l1, l2, w1, w2, color){
  const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
  const fx = kx + Math.sin(a2) * l2, fy = ky + Math.cos(a2) * l2;
  ctx.strokeStyle = color;
  ctx.lineWidth = w1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.lineWidth = w2;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
}

function kneeBend(ph){ return 0.35 + 1.15 * Math.max(0, Math.cos(ph)); }

/* ============ 忍者 ============ */
class Ninja {
  constructor(){ this.dustT = 0; this.maxHp = 3; this.skin = null; this.landT = 0; this.jumpT = 0; this.reset(null); }

  // 皮肤配色（未设置时用默认墨色）
  get sk(){
    return this.skin || { body: INK, soft: INK_SOFT, scarf: RED, scarfD: RED_D, eye: PAPER };
  }

  reset(g){
    if (g){
      this.groundY = g.groundY;
      this.feetY = g.groundY;
      const wx = g.camX + g.ninjaX;
      this.scarf = [];
      for (let i = 0; i < 9; i++) this.scarf.push({ x: wx - i * 12, y: this.feetY - 70 });
    }
    this.vy = 0;
    this.onGround = true;
    this.jumps = 0;
    this.sliding = false;
    this.state = 'run';            // run | jump | fall | slide | dead
    this.runPhase = 0;
    this.flipT = -1;
    this.deadRot = 0;
    this.deadSettled = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.attackT = 0;
    this.invT = 0;
    this.hp = this.maxHp || 3;
    this.shield = false;
    this.magnetT = 0;
  }

  get centerY(){ return this.feetY - (this.sliding ? 20 : 46); }

  hitbox(wx){
    const w = this.sliding ? 46 : 26;
    const h = this.sliding ? 40 : 84;
    return { x: wx - w / 2 - (this.sliding ? 6 : 0), y: this.feetY - h, w, h };
  }

  jump(g){
    if (this.state === 'dead') return;
    this.sliding = false;
    if (this.onGround || g.coyote > 0){
      this.vy = -CFG.jumpV;
      this.onGround = false;
      this.jumps = 1;
      this.state = 'jump';
      this.jumpT = 0.12;
      Sfx.jump();
      g.particles.dust(g.ninjaX, this.groundY, 5);
    } else if (this.jumps < 2){
      this.vy = -CFG.jumpV2;
      this.jumps = 2;
      this.flipT = 0;
      this.state = 'jump';
      this.jumpT = 0.12;
      Sfx.djump();
      g.particles.ring(g.ninjaX, this.feetY - 20);
    }
  }

  startDash(g){
    if (this.dashCd > 0 || this.state === 'dead') return;
    this.dashT = CFG.dashTime;
    this.dashCd = g.dashCdMax || CFG.dashCd;
    Sfx.dash();
  }

  update(dt, g){
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invT = Math.max(0, this.invT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.jumpT = Math.max(0, this.jumpT - dt);
    if (this.flipT >= 0){
      this.flipT += dt * 2.1;
      if (this.flipT > 1.05) this.flipT = -1;
    }

    if (this.state === 'dead'){
      this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
      this.feetY += this.vy * dt;
      if (!this.deadSettled) this.deadRot += dt * 8;
      if (this.feetY >= this.groundY){
        this.feetY = this.groundY;
        if (!this.deadSettled){
          this.deadSettled = true;
          g.particles.dust(g.ninjaX, this.groundY, 10);
        }
        this.vy = 0;
      }
      this.updateScarf(dt, g);
      return;
    }

    if (!this.onGround){
      const fastFall = Input.held.slide && this.vy > -80;
      this.vy = Math.min(this.vy + CFG.gravity * (fastFall ? 1.9 : 1) * dt, CFG.maxFall);
      this.feetY += this.vy * dt;
      this.state = this.vy < 0 ? 'jump' : 'fall';
      if (this.feetY >= this.groundY){
        this.feetY = this.groundY;
        this.vy = 0;
        this.onGround = true;
        this.jumps = 0;
        this.flipT = -1;
        this.landT = 0.16;
        Sfx.land();
        g.particles.dust(g.ninjaX, this.groundY, 7);
      }
    } else {
      this.state = this.sliding ? 'slide' : 'run';
    }

    if (this.onGround && !this.sliding && this.state === 'run'){
      this.runPhase += dt * (7 + g.speed / 55);
    }

    // 脚下扬尘
    this.dustT -= dt;
    if (this.onGround && this.dustT <= 0 && (this.state === 'run' || this.state === 'slide')){
      this.dustT = this.state === 'slide' ? 0.05 : 0.09;
      g.particles.dust(g.ninjaX - (this.state === 'slide' ? 26 : 12), this.groundY, 2);
    }
    // 冲刺速度线
    if (this.dashT > 0){
      g.particles.line(g.ninjaX + U.rand(-10, 30), this.feetY - U.rand(6, 80), g.speed + 500);
    }

    this.updateScarf(dt, g);
  }

  updateScarf(dt, g){
    const wx = g.camX + g.ninjaX;
    const ax = wx - 6;
    const ay = this.feetY - (this.sliding || this.state === 'dead' ? 28 : 70);
    const p = this.scarf;
    p[0].x = ax; p[0].y = ay;
    const wind = -(g.speed * 0.06 + (this.dashT > 0 ? 40 : 0)) - 10;
    for (let i = 1; i < p.length; i++){
      const tx = p[i - 1].x + wind * 0.15;
      const ty = p[i - 1].y + 0.9 + Math.sin(g.t * 10 + i * 0.9) * 1.9;
      const k = Math.min(1, dt * 14);
      p[i].x += (tx - p[i].x) * k;
      p[i].y += (ty - p[i].y) * k;
    }
  }

  draw(ctx, g){
    const sx = g.ninjaX;

    // 暗色主题（雪夜/火山）下的体表辉光，保证可见性
    if (Bg.theme && Bg.theme.dark){
      ctx.fillStyle = this.sk.scarf === '#4a8ab0' ? 'rgba(150,190,230,0.16)' : 'rgba(235,225,205,0.13)';
      ctx.beginPath();
      ctx.ellipse(sx, this.feetY - 44, 58, 62, 0, 0, TAU);
      ctx.fill();
    }

    // 影子
    const hgt = this.groundY - this.feetY;
    const sa = U.clamp(0.22 - hgt / 700, 0.05, 0.22);
    ctx.fillStyle = `rgba(30,28,24,${sa})`;
    ctx.beginPath();
    ctx.ellipse(sx, this.groundY + 6, Math.max(10, 26 - hgt * 0.03), 5, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    if (this.invT > 0 && this.state !== 'dead'){
      ctx.globalAlpha = 0.35 + 0.6 * Math.abs(Math.sin(this.invT * 22));
    }
    // 围巾（在身体后面）
    this.drawScarf(ctx, g);
    // 影分身残影
    if (g.cloneT > 0){
      this.paint(ctx, g, sx - 30, 0.22);
      this.paint(ctx, g, sx + 26, 0.15);
    }
    // 冲刺残影
    if (this.dashT > 0){
      this.paint(ctx, g, sx - 26, 0.16);
      this.paint(ctx, g, sx - 50, 0.08);
    }
    this.paint(ctx, g, sx, 1);
    ctx.restore();

    // 奥义就绪：红色灵环脉动
    if (g.ult >= 100 && this.state !== 'dead' && g.castT <= 0){
      const cy = this.feetY - 46;
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(g.t * 6);
      ctx.strokeStyle = g.skinDef ? g.skinDef().scarf : RED;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.arc(sx, cy, 60, g.t * 1.5, g.t * 1.5 + TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 护盾灵环
    if (this.shield && this.state !== 'dead'){
      const cy = this.feetY - 46;
      ctx.save();
      ctx.translate(sx, cy);
      ctx.rotate(g.t * 2);
      ctx.strokeStyle = 'rgba(63,111,174,0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.arc(0, 0, 58, 0, TAU); ctx.stroke();
      ctx.setLineDash([4, 14]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // 磁石标记
    if (this.magnetT > 0 && this.state !== 'dead'){
      const blink = this.magnetT < 1.5 && Math.sin(g.t * 14) < 0;
      if (!blink){
        const y = this.feetY - 112 + Math.sin(g.t * 4) * 4;
        ctx.save();
        ctx.translate(sx + 30, y);
        ctx.strokeStyle = '#5a5f6b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, -4, 9, Math.PI, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-9, 6); ctx.moveTo(9, -4); ctx.lineTo(9, 6); ctx.stroke();
        ctx.strokeStyle = RED; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(-9, 8); ctx.lineTo(-9, 12); ctx.moveTo(9, 8); ctx.lineTo(9, 12); ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawScarf(ctx, g){
    const p = this.scarf;
    const off = g.camX;
    const sk = this.sk;
    ctx.lineCap = 'round';
    for (let i = 1; i < p.length; i++){
      ctx.strokeStyle = i < 3 ? sk.scarfD : sk.scarf;
      ctx.lineWidth = Math.max(1.5, 9 - i * 0.85);
      ctx.globalAlpha = 0.95 - i * 0.04;
      ctx.beginPath();
      ctx.moveTo(p[i - 1].x - off, p[i - 1].y);
      ctx.lineTo(p[i].x - off, p[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paint(ctx, g, sx, alpha){
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(sx, this.feetY);
    // 落地挤压 / 起跳拉伸（以脚为轴心）
    if (this.landT > 0){
      const k = this.landT / 0.16;
      ctx.scale(1 + 0.26 * k, 1 - 0.28 * k);
    } else if (this.jumpT > 0){
      const k = this.jumpT / 0.12;
      ctx.scale(1 - 0.14 * k, 1 + 0.16 * k);
    }
    let rot = 0;
    if (this.flipT >= 0) rot = Math.min(this.flipT, 1) * TAU;
    if (this.state === 'dead') rot = this.deadRot;
    if (rot){
      ctx.translate(0, -42);
      ctx.rotate(rot);
      ctx.translate(0, 42);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.state === 'slide') this.poseSlide(ctx, g);
    else if (g.castT > 0.5 && this.onGround) this.poseUlt(ctx, g);
    else if (this.attackT > 0 && this.onGround) this.poseAttack(ctx, g);
    else if (this.state === 'run') this.poseRun(ctx, g);
    else this.poseAir(ctx, g);
    ctx.restore();
  }

  // 奥义蓄力姿态：沉腰拔刀，刀锋后引
  poseUlt(ctx, g){
    const sk = this.sk;
    limb(ctx, -2, -44, -0.7, -0.15, 24, 22, 10, 8, sk.soft);
    limb(ctx, -2, -44, 0.9, 0.15, 24, 22, 11, 9, sk.body);
    ctx.strokeStyle = sk.body; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(-2, -44); ctx.lineTo(5, -72); ctx.stroke();
    limb(ctx, 6, -70, -1.5, -2.3, 18, 15, 7, 6, sk.soft);
    limb(ctx, 6, -70, 0.4, -0.4, 18, 16, 8, 7, sk.body);
    // 后引的刀
    const hx = 6 + Math.sin(0.4) * 18 + Math.sin(-0.4) * 16;
    const hy = -70 + Math.cos(0.4) * 18 + Math.cos(-0.4) * 16;
    const sh = 1 - Math.min(1, g.castT - 0.5) / 0.3;
    ctx.strokeStyle = sk.scarf; ctx.lineWidth = 4 + sh * 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy - 4);
    ctx.lineTo(hx - 34 - sh * 8, hy - 20 - sh * 6);
    ctx.stroke();
    this.head(ctx, 11, -84, g);
  }

  // 攻击姿态（太刀 / 苦无 / 锁镰 / 雷刃 共用：持械前突）
  poseAttack(ctx, g){
    const sk = this.sk;
    const wt = g.weapon.type;
    // 稳健弓步
    limb(ctx, -2, -44, -0.55, -0.1, 24, 22, 10, 8, sk.soft);
    limb(ctx, -2, -44, 0.75, 0.1, 24, 22, 11, 9, sk.body);
    ctx.strokeStyle = sk.body; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(-2, -44); ctx.lineTo(9, -76); ctx.stroke();
    limb(ctx, 6, -72, -1.0, -1.5, 18, 16, 7, 6, sk.soft);
    if (wt === 'kunai'){
      // 投掷苦无：前臂甩出，指尖停一枚苦无
      limb(ctx, 6, -72, 1.35, 1.35, 19, 16, 8, 7, sk.body);
      const hx = 6 + Math.sin(1.35) * 19 + Math.sin(1.35) * 16;
      const hy = -72 + Math.cos(1.35) * 19 + Math.cos(1.35) * 16;
      ctx.strokeStyle = '#3c3c48'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 8, hy); ctx.lineTo(hx + 8, hy); ctx.stroke();
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.moveTo(hx + 8, hy); ctx.lineTo(hx + 13, hy - 4); ctx.lineTo(hx + 13, hy + 4); ctx.closePath(); ctx.fill();
    } else if (wt === 'chain'){
      // 锁镰：甩出链与镰刃
      limb(ctx, 6, -72, 1.45, 1.45, 19, 17, 8, 7, sk.body);
      const hx = 6 + Math.sin(1.45) * 19 + Math.sin(1.45) * 17;
      const hy = -72 + Math.cos(1.45) * 19 + Math.cos(1.45) * 17;
      const swing = 1 - this.attackT / 0.18;
      ctx.strokeStyle = '#6a6a74'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(hx + 60, hy - 26 + swing * 30, hx + 120, hy - 10 + swing * 40);
      ctx.stroke();
      ctx.strokeStyle = '#8f8f96'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(hx + 124, hy - 10 + swing * 40, 9, -2.4, 0.6);
      ctx.stroke();
    } else {
      // 太刀/雷刃：拔刀横挥
      const bladeCol = wt === 'thunder' ? '#b9b9ee' : '#e8e4d8';
      limb(ctx, 6, -72, 1.5, 1.5, 19, 17, 8, 7, sk.body);
      const hx = 6 + Math.sin(1.5) * 19 + Math.sin(1.5) * 17;
      const hy = -72 + Math.cos(1.5) * 19 + Math.cos(1.5) * 17;
      const swing = 1 - this.attackT / 0.18;
      const ang = -0.85 + swing * 1.7;
      ctx.strokeStyle = bladeCol; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ang) * 66, hy + Math.sin(ang) * 66);
      ctx.stroke();
      if (wt === 'thunder'){
        ctx.strokeStyle = 'rgba(122,122,216,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(ang) * 66, hy + Math.sin(ang) * 66);
        ctx.stroke();
      }
    }
    this.head(ctx, 15, -88, g);
  }

  sword(ctx){
    ctx.save();
    ctx.translate(-4, -58);
    ctx.rotate(0.62);
    ctx.strokeStyle = '#2c2c36'; ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.stroke();
    ctx.strokeStyle = '#6a5136'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, -48); ctx.stroke();
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, -41); ctx.lineTo(4, -43); ctx.stroke();
    ctx.restore();
  }

  head(ctx, x, y, g){
    const sk = this.sk;
    ctx.fillStyle = sk.body;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
    // 眼缝
    ctx.fillStyle = sk.eye;
    ctx.fillRect(x + 2.5, y - 3, 6.5, 4);
    // 头带飘带
    ctx.strokeStyle = sk.body; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 1);
    ctx.lineTo(x - 20, y + 2 + Math.sin(g.t * 9) * 2.5);
    ctx.moveTo(x - 8, y + 1);
    ctx.lineTo(x - 19, y - 4 + Math.cos(g.t * 8) * 2.5);
    ctx.stroke();
  }

  poseRun(ctx, g){
    const ph = this.runPhase;
    const sk = this.sk;
    this.sword(ctx);
    limb(ctx, 6, -72, -0.5 - Math.sin(ph) * 0.75, -0.2 - Math.sin(ph) * 0.45, 19, 17, 7, 6, sk.soft);
    limb(ctx, -2, -44, Math.sin(ph + Math.PI) * 0.85, Math.sin(ph + Math.PI) * 0.85 - kneeBend(ph + Math.PI), 24, 22, 10, 8, sk.soft);
    ctx.strokeStyle = sk.body; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(-2, -44); ctx.lineTo(7, -74); ctx.stroke();
    limb(ctx, -2, -44, Math.sin(ph) * 0.85, Math.sin(ph) * 0.85 - kneeBend(ph), 24, 22, 11, 9, sk.body);
    limb(ctx, 6, -72, -0.5 - Math.sin(ph + Math.PI) * 0.75, -0.2 - Math.sin(ph + Math.PI) * 0.45, 19, 17, 8, 7, sk.body);
    this.head(ctx, 13, -86, g);
  }

  poseAir(ctx, g){
    const sk = this.sk;
    const rising = this.vy < 0;
    this.sword(ctx);
    if (rising){
      limb(ctx, 6, -72, -1.2, -2.2, 18, 16, 7, 6, sk.soft);
      limb(ctx, -2, -44, -0.35, -1.5, 24, 22, 10, 8, sk.soft);
      ctx.strokeStyle = sk.body; ctx.lineWidth = 15;
      ctx.beginPath(); ctx.moveTo(-2, -44); ctx.lineTo(7, -74); ctx.stroke();
      limb(ctx, -2, -44, 1.15, 0.35, 24, 22, 11, 9, sk.body);
      limb(ctx, 6, -72, 0.9, 0.3, 18, 16, 8, 7, sk.body);
    } else {
      limb(ctx, 6, -72, -1.7, -2.4, 18, 16, 7, 6, sk.soft);
      limb(ctx, -2, -44, -0.75, -1.9, 24, 22, 10, 8, sk.soft);
      ctx.strokeStyle = sk.body; ctx.lineWidth = 15;
      ctx.beginPath(); ctx.moveTo(-2, -44); ctx.lineTo(7, -74); ctx.stroke();
      limb(ctx, -2, -44, 0.55, -0.1, 24, 22, 11, 9, sk.body);
      limb(ctx, 6, -72, 1.3, 1.8, 18, 16, 8, 7, sk.body);
    }
    this.head(ctx, 13, -86, g);
  }

  poseSlide(ctx, g){
    const sk = this.sk;
    ctx.strokeStyle = sk.body;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(-30, -13); ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-30, -13); ctx.lineTo(-48, -15); ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-2, -20); ctx.lineTo(-14, -10); ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-2, -6); ctx.stroke();
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(-4, -22); ctx.lineTo(14, -30); ctx.stroke();
    ctx.strokeStyle = sk.soft; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(8, -28); ctx.lineTo(-8, -18); ctx.stroke();
    this.head(ctx, 22, -34, g);
  }
}

/* ============ 粒子 ============ */
class Particles {
  constructor(){ this.list = []; }
  add(p){ if (this.list.length > 260) this.list.shift(); this.list.push(p); }

  dust(x, y, n = 3){
    for (; n > 0; n--){
      this.add({ t: 'd', x: x + U.rand(-6, 6), y: y - U.rand(0, 4),
        vx: U.rand(-70, -20), vy: U.rand(-46, -8), r: U.rand(2.5, 5.5),
        life: U.rand(0.3, 0.55), age: 0 });
    }
  }
  inkBurst(x, y, n = 10, colors = [INK, RED]){
    for (; n > 0; n--){
      const a = U.rand(0, TAU), v = U.rand(90, 330);
      this.add({ t: 'i', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
        r: U.rand(1.5, 4.5), c: U.pick(colors), life: U.rand(0.4, 0.75), age: 0 });
    }
  }
  sparkle(x, y, c = '#e8c86a'){
    this.add({ t: 's', x, y, r: U.rand(6, 10), c, life: 0.35, age: 0 });
  }
  ring(x, y){ this.add({ t: 'r', x, y, r: 10, life: 0.3, age: 0 }); }
  line(x, y, sp){ this.add({ t: 'l', x, y, vx: -sp, life: 0.25, age: 0, len: U.rand(30, 70) }); }

  update(dt){
    for (let i = this.list.length - 1; i >= 0; i--){
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life){ this.list.splice(i, 1); continue; }
      if (p.t === 'd' || p.t === 'i'){
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t === 'i') p.vy += 700 * dt;
      } else if (p.t === 'l'){
        p.x += p.vx * dt;
      }
    }
  }

  draw(ctx){
    for (const p of this.list){
      const k = 1 - p.age / p.life;
      if (p.t === 'd'){
        ctx.fillStyle = `rgba(120,112,96,${0.35 * k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + (1 - k) * 0.8), 0, TAU);
        ctx.fill();
      } else if (p.t === 'i'){
        ctx.globalAlpha = k;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * k + 0.5, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.t === 's'){
        ctx.strokeStyle = p.c;
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        const r = p.r * k + 1;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
        ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.t === 'r'){
        ctx.strokeStyle = `rgba(32,32,40,${0.5 * k})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + (1 - k) * 36, 0, TAU);
        ctx.stroke();
      } else if (p.t === 'l'){
        ctx.strokeStyle = `rgba(32,32,40,${0.3 * k})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len, p.y);
        ctx.stroke();
      }
    }
  }
  clear(){ this.list.length = 0; }
}

/* ============ 障碍物 ============ */
function makeObstacle(kind, x, opts = {}){
  const e = { kind, x, t: U.rand(0, 5), dead: false, float: false, pad: 0, padY: 0, elev: 0, w: 0, h: 0 };
  switch (kind){
    case 'spikes': {
      const n = opts.n || 2;
      e.w = n * 36; e.h = 56; e.pad = 6; e.padY = 16;
      e.jit = [];
      for (let i = 0; i < n; i++) e.jit.push({ h: U.rand(-5, 6), x: U.rand(-3, 3) });
      break;
    }
    case 'banner':
      e.w = 46; e.h = 210; e.elev = 58; e.pad = 8;
      break;
    case 'wall':
      e.w = 38; e.h = opts.h || 135; e.pad = 4; e.padY = 6;
      break;
    case 'cart':
      e.w = 122; e.h = 60; e.pad = 6; e.padY = 4;
      break;
    case 'boulder':
      e.w = 88; e.h = 88; e.r = 44; e.rot = 0;
      break;
    case 'crow':
      e.float = true; e.oy = opts.oy || 74; e.w = 46; e.hitW = 40; e.hitH = 22;
      break;
    case 'arrow':
      e.float = true; e.oy = opts.oy || 50; e.w = 30; e.hitW = 26; e.hitH = 8;
      break;
    case 'arrowVolley':
      e.float = true; e.oy = opts.oy || 50; e.noHit = true;
      e.count = opts.count || 3; e.started = false; e.wt = 0;
      break;
  }
  return e;
}

function obstacleHitbox(e, g){
  if (e.kind === 'boulder') return { x: e.x + 7, y: g.groundY - 81, w: 74, h: 74 };
  if (e.float) return {
    x: e.x + e.w / 2 - (e.hitW || e.w) / 2,
    y: g.groundY - e.oy - (e.hitH || 10) / 2,
    w: e.hitW || e.w, h: e.hitH || 10,
  };
  return {
    x: e.x + e.pad,
    y: g.groundY - e.elev - e.h + e.padY,
    w: e.w - 2 * e.pad,
    h: e.h - e.padY,
  };
}

function updateObstacle(e, dt, g){
  switch (e.kind){
    case 'boulder':
      e.x -= g.speed * 0.32 * dt;
      e.rot -= (g.speed * 1.32 / e.r) * dt;
      break;
    case 'crow':
      e.t += dt;
      e.x -= 55 * dt;
      e.oy = 74 + Math.sin(e.t * 3) * 12;
      break;
    case 'arrow':
      e.x -= (g.speed * 0.85 + 340) * dt;
      if (e.x < g.camX - 80) e.dead = true;
      break;
    case 'arrowVolley':
      if (!e.started && e.x - g.camX < g.W + 60){ e.started = true; e.wt = 0; }
      if (e.started){
        e.wt += dt;
        if (e.wt >= 0.8){
          for (let i = 0; i < e.count; i++){
            g.obstacles.push(makeObstacle('arrow', g.camX + g.W + 40 + i * 95, { oy: e.oy }));
          }
          e.dead = true;
          Sfx.arrow();
        }
      }
      break;
    default:
      e.t += dt;
  }
}

function drawObstacle(e, ctx, g){
  const gy = g.groundY;
  const sx = e.x - g.camX;

  if (e.kind === 'arrowVolley'){
    if (!e.started) return;
    const y = gy - e.oy;
    const blink = 0.5 + 0.5 * Math.sin(g.t * 18);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * blink;
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.moveTo(g.W - 66, y - 15); ctx.lineTo(g.W - 38, y - 15); ctx.lineTo(g.W - 52, y + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = 'bold 15px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', g.W - 52, y - 3);
    ctx.restore();
    return;
  }
  if (sx > g.W + 90 || sx + e.w + 60 < -90) return;

  switch (e.kind){
    case 'spikes': {
      ctx.fillStyle = INK;
      const n = e.jit.length;
      for (let i = 0; i < n; i++){
        const x0 = sx + i * 36;
        const j = e.jit[i];
        ctx.beginPath();
        ctx.moveTo(x0 + 3 + j.x, gy + 2);
        ctx.lineTo(x0 + 18 + j.x * 0.5, gy - 52 + j.h);
        ctx.lineTo(x0 + 33 + j.x, gy + 2);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = RED_D;
      ctx.fillRect(sx - 2, gy - 4, n * 36 + 4, 5);
      break;
    }
    case 'banner': {
      const poleY = gy - 276;
      // 吊绳
      ctx.strokeStyle = 'rgba(60,55,45,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 10, poleY - 260); ctx.lineTo(sx + 10, poleY);
      ctx.moveTo(sx + 36, poleY - 260); ctx.lineTo(sx + 36, poleY);
      ctx.stroke();
      // 竹竿
      ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx - 12, poleY); ctx.lineTo(sx + 58, poleY); ctx.stroke();
      // 血幅
      const sway = Math.sin(g.t * 2.2 + e.t) * 6;
      ctx.fillStyle = '#b03a2e';
      ctx.beginPath();
      ctx.moveTo(sx + 6, poleY + 3);
      ctx.lineTo(sx + 40, poleY + 3);
      ctx.lineTo(sx + 40 + sway * 0.5, gy - 72);
      ctx.lineTo(sx + 36 + sway, gy - 58);
      ctx.lineTo(sx + 10 + sway, gy - 58);
      ctx.lineTo(sx + 6 + sway * 0.5, gy - 72);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a2a20';
      ctx.fillRect(sx + 34 + sway * 0.4, poleY + 3, 6, gy - 58 - (poleY + 3) - 14);
      // 「斬」字
      ctx.fillStyle = 'rgba(245,238,225,0.9)';
      ctx.font = '20px "Kaiti SC","KaiTi",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(sx + 23 + sway * 0.4, (poleY + gy - 58) / 2);
      ctx.rotate(-0.03);
      ctx.fillText('斬', 0, 0);
      ctx.restore();
      break;
    }
    case 'wall': {
      ctx.fillStyle = '#2a2a33';
      ctx.beginPath();
      ctx.moveTo(sx + 2, gy);
      ctx.lineTo(sx, gy - e.h + 6);
      ctx.lineTo(sx + 8, gy - e.h);
      ctx.lineTo(sx + 30, gy - e.h + 4);
      ctx.lineTo(sx + 36, gy - e.h + 10);
      ctx.lineTo(sx + 34, gy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(242,236,223,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 8, gy - e.h + 18); ctx.lineTo(sx + 20, gy - e.h + 30);
      ctx.moveTo(sx + 26, gy - e.h * 0.45); ctx.lineTo(sx + 18, gy - e.h * 0.45 + 14);
      ctx.stroke();
      ctx.fillStyle = '#3c3c46';
      ctx.beginPath();
      ctx.arc(sx + 48, gy - 7, 8, Math.PI, TAU); ctx.fill();
      break;
    }
    case 'cart': {
      ctx.fillStyle = '#4a3b2e';
      ctx.fillRect(sx + 6, gy - 56, 110, 34);
      ctx.strokeStyle = 'rgba(30,24,18,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 6, gy - 45); ctx.lineTo(sx + 116, gy - 45);
      ctx.moveTo(sx + 6, gy - 34); ctx.lineTo(sx + 116, gy - 34);
      ctx.stroke();
      // 草捆
      ctx.fillStyle = '#8a7a4a';
      ctx.beginPath();
      ctx.ellipse(sx + 60, gy - 62, 34, 12, 0, 0, TAU); ctx.fill();
      // 车轮
      ctx.fillStyle = '#33291f';
      ctx.beginPath(); ctx.arc(sx + 30, gy - 15, 15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 92, gy - 15, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(242,236,223,0.35)';
      ctx.beginPath(); ctx.arc(sx + 30, gy - 15, 3.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 92, gy - 15, 3.5, 0, TAU); ctx.fill();
      break;
    }
    case 'boulder': {
      const cx = sx + e.r, cy = gy - e.r;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(e.rot);
      ctx.fillStyle = '#474751';
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2c2c34'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, e.r - 3, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-20, -14); ctx.lineTo(-4, 2); ctx.lineTo(-14, 20);
      ctx.moveTo(12, -22); ctx.lineTo(20, -2);
      ctx.moveTo(2, 10); ctx.lineTo(18, 18);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'crow': {
      const cy = gy - e.oy;
      const cx = sx + e.w / 2;
      const flap = Math.sin(e.t * 13);
      ctx.save();
      ctx.translate(cx, cy);
      // 翅膀（后）
      ctx.fillStyle = INK_SOFT;
      ctx.beginPath();
      ctx.moveTo(-2, -4);
      ctx.quadraticCurveTo(-14, -6 - flap * 16, -26, -2 - flap * 20);
      ctx.quadraticCurveTo(-14, 2 - flap * 6, -2, 2);
      ctx.closePath(); ctx.fill();
      // 身体
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 10, -0.08, 0, TAU); ctx.fill();
      // 尾
      ctx.beginPath();
      ctx.moveTo(-18, -2); ctx.lineTo(-30, -6); ctx.lineTo(-28, 2);
      ctx.closePath(); ctx.fill();
      // 头与喙
      ctx.beginPath(); ctx.arc(20, -5, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d08a2e';
      ctx.beginPath();
      ctx.moveTo(26, -6); ctx.lineTo(34, -4); ctx.lineTo(26, -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.arc(22, -6, 1.8, 0, TAU); ctx.fill();
      // 翅膀（前）
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(2, -4);
      ctx.quadraticCurveTo(10, -8 - flap * 18, 24, -4 - flap * 24);
      ctx.quadraticCurveTo(12, 0 - flap * 8, 2, 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'arrow': {
      const cy = gy - e.oy + Math.sin(e.t * 20) * 1.5;
      ctx.save();
      ctx.translate(sx + 15, cy);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(14, 0); ctx.stroke();
      ctx.fillStyle = '#8f8f96';
      ctx.beginPath();
      ctx.moveTo(-14, -3); ctx.lineTo(-22, 0); ctx.lineTo(-14, 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = RED; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(17, -5);
      ctx.moveTo(10, 0); ctx.lineTo(17, 5);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

/* ============ 铜钱 / 道具 / 装饰 ============ */
function drawCoin(c, ctx, g){
  const sx = c.x - g.camX;
  if (sx < -30 || sx > g.W + 30) return;
  const y = c.y + Math.sin(g.t * 3 + c.t) * 3;
  const spin = Math.abs(Math.cos(g.t * 3.4 + c.t));
  ctx.save();
  ctx.translate(sx, y);
  ctx.scale(Math.max(0.18, spin), 1);
  ctx.fillStyle = BRONZE;
  ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, TAU); ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.fillRect(-4.5, -4.5, 9, 9);
  ctx.restore();
}

function drawPowerup(p, ctx, g){
  const sx = p.x - g.camX;
  if (sx < -40 || sx > g.W + 40) return;
  const y = p.y + Math.sin(g.t * 3 + p.t) * 6;
  ctx.save();
  ctx.translate(sx, y);
  ctx.fillStyle = 'rgba(255,250,230,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
  if (p.type === 'shield'){
    ctx.rotate(-0.08);
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = '#4a6b8a'; ctx.lineWidth = 2.5;
    ctx.fillRect(-14, -19, 28, 38); ctx.strokeRect(-14, -19, 28, 38);
    ctx.fillStyle = '#4a6b8a';
    ctx.font = '20px "Kaiti SC","KaiTi",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('守', 0, 2);
    ctx.fillStyle = RED;
    ctx.fillRect(-3, -16, 6, 6);
  } else if (p.type === 'magnet'){
    ctx.strokeStyle = '#5a5f6b'; ctx.lineWidth = 7; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, -5, 11, Math.PI, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, -5); ctx.lineTo(-11, 7);
    ctx.moveTo(11, -5); ctx.lineTo(11, 7);
    ctx.stroke();
    ctx.strokeStyle = RED; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-11, 9); ctx.lineTo(-11, 13);
    ctx.moveTo(11, 9); ctx.lineTo(11, 13);
    ctx.stroke();
  } else if (p.type === 'box'){
    // 忍具匣：切换武器
    ctx.rotate(Math.sin(g.t * 2.5) * 0.08);
    ctx.fillStyle = '#6a5136';
    ctx.strokeStyle = '#463522'; ctx.lineWidth = 3;
    ctx.fillRect(-17, -15, 34, 30); ctx.strokeRect(-17, -15, 34, 30);
    ctx.strokeStyle = '#463522'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-17, -5); ctx.lineTo(17, -5);
    ctx.moveTo(-17, 6); ctx.lineTo(17, 6);
    ctx.moveTo(0, -15); ctx.lineTo(0, 15);
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.arc(0, -5, 5, 0, TAU); ctx.fill();
  } else {
    const pu = 1 + Math.sin(g.t * 6) * 0.08;
    ctx.scale(pu, pu);
    ctx.fillStyle = RED;
    ctx.strokeStyle = RED_D; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-16, -5, -7, -18, 0, -8);
    ctx.bezierCurveTo(7, -18, 16, -5, 0, 7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawDecor(d, ctx, g){
  const sx = d.x - g.camX;
  if (sx > g.W + 160 || sx < -180) return;
  const gy = g.groundY;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#93362c';
  ctx.fillRect(sx + 14, gy - 186, 13, 186);
  ctx.fillRect(sx + 105, gy - 186, 13, 186);
  ctx.fillRect(sx - 6, gy - 208, 144, 13);
  ctx.beginPath();
  ctx.moveTo(sx - 12, gy - 208); ctx.lineTo(sx - 2, gy - 216);
  ctx.lineTo(sx + 134, gy - 216); ctx.lineTo(sx + 144, gy - 208);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(sx + 4, gy - 184, 124, 9);
  ctx.fillRect(sx + 64, gy - 184, 12, 18);
  ctx.fillStyle = '#54504a';
  ctx.fillRect(sx + 6, gy - 8, 28, 8);
  ctx.fillRect(sx + 98, gy - 8, 28, 8);
  ctx.restore();
}

/* ============ 怪物 ============ */
// kind: ronin 浪人 | archer 弓手 | wisp 鬼火 | oni 鬼武士(精英)
function makeMonster(kind, x, opts = {}){
  const m = {
    kind, x, t: U.rand(0, 5), dead: false,
    hp: 1, maxHp: 1, state: 'idle', st: 0,
    hitFlash: 0, kb: 0, struck: false,
  };
  if (kind === 'ronin'){
    m.hp = m.maxHp = 20;
    m.state = 'walk';
  } else if (kind === 'archer'){
    m.hp = m.maxHp = 10;
    m.state = 'idle';
    m.cycle = 0.8;
  } else if (kind === 'wisp'){
    m.hp = m.maxHp = 10;
    m.y = opts.y || 130;           // 距地高度
  } else if (kind === 'oni'){
    m.hp = m.maxHp = 140;
    m.state = 'entry';
    m.screenX = opts.screenX || 900;
    m.atkTimer = 2.2;
    m.atkAnim = 0;
    m.atkKind = '';
    m.life = 0;
    m.yOff = 0;
    m.bw = 104; m.bh = 128;
  } else if (kind === 'tengu' || kind === 'golem' || kind === 'bone' || kind === 'vine'){
    m.hp = m.maxHp = 160;
    m.state = 'entry';
    m.screenX = opts.screenX || 900;
    m.atkTimer = 2.2;
    m.atkAnim = 0;
    m.atkKind = '';
    m.life = 0;
    m.yOff = kind === 'tengu' ? 70 : 0;
    m.hoverBase = m.yOff;
    m.bw = kind === 'tengu' ? 112 : 128;
    m.bh = kind === 'tengu' ? 56 : (kind === 'bone' ? 132 : 148);
  }
  return m;
}

function monsterHitbox(m, g){
  if (m.kind === 'wisp'){
    return { x: m.x - 15, y: g.groundY - m.y - 15, w: 30, h: 30 };
  }
  if (m.kind === 'oni' || m.kind === 'tengu' || m.kind === 'golem' || m.kind === 'bone' || m.kind === 'vine'){
    return { x: m.x - m.bw / 2, y: g.groundY - m.yOff - m.bh, w: m.bw, h: m.bh };
  }
  const h = m.kind === 'ronin' ? 82 : 74;
  return { x: m.x - 17, y: g.groundY - h, w: 34, h };
}

function updateMonster(m, dt, g){
  m.t += dt;
  m.hitFlash = Math.max(0, m.hitFlash - dt);
  m.kb = Math.max(0, m.kb - dt);
  const nx = g.camX + g.ninjaX;   // 忍者世界坐标

  if (m.kind === 'ronin'){
    const dist = m.x - nx;
    if (m.state === 'walk'){
      m.x -= (m.kb > 0 ? 160 : 62) * dt;
      if (dist < 165 && dist > -60){ m.state = 'windup'; m.st = 0; }
    } else if (m.state === 'windup'){
      m.st += dt;
      if (dist > 300){ m.state = 'walk'; }
      else if (m.st > 0.55){ m.state = 'strike'; m.st = 0; m.struck = false; }
    } else if (m.state === 'strike'){
      m.st += dt;
      if (m.st > 0.18){
        m.state = 'recover'; m.st = 0;
      }
    } else if (m.state === 'recover'){
      m.st += dt;
      if (m.st > 0.5) m.state = 'walk';
    }
    if (m.x < g.camX - 120) m.dead = true;
  } else if (m.kind === 'archer'){
    if (m.x < g.camX - 100){ m.dead = true; return; }
    if (m.state === 'idle'){
      m.st += dt;
      if (m.st > m.cycle){
        m.state = 'draw'; m.st = 0;
      }
    } else if (m.state === 'draw'){
      m.st += dt;
      if (m.st > 0.7){
        m.state = 'idle'; m.st = 0;
        m.cycle = g.rnd ? g.rnd(1.4, 2.2) : U.rand(1.4, 2.2);
        if (m.x - g.camX < g.W + 60){
          g.obstacles.push(makeObstacle('arrow', m.x - 14, { oy: 52 }));
          Sfx.arrow();
        }
      }
    }
  } else if (m.kind === 'wisp'){
    m.x -= 120 * dt;
    const targetY = U.clamp(g.groundY - g.ninja.centerY, 36, 170);
    m.y += (targetY - m.y) * Math.min(1, dt * 1.1);
    m.y += Math.sin(m.t * 4) * 14 * dt;
    if (m.x < g.camX - 80) m.dead = true;
  }
  // oni 由 Game 单独驱动（updateBoss）
}

function drawMonster(m, ctx, g){
  const gy = g.groundY;
  const sx = m.x - g.camX;
  if (sx > g.W + 130 || sx < -140) return;
  const flash = m.hitFlash > 0;
  const C = c => flash ? '#ffffff' : c;

  if (m.kind === 'ronin'){
    const step = m.state === 'walk' ? Math.sin(m.t * 9) * 5 : 0;
    // 斗笠
    ctx.fillStyle = C('#5a5348');
    ctx.beginPath();
    ctx.moveTo(sx - 24, gy - 78); ctx.lineTo(sx + 24, gy - 78); ctx.lineTo(sx, gy - 94);
    ctx.closePath(); ctx.fill();
    // 身体（和服宽袍）
    ctx.fillStyle = C('#2c2c36');
    ctx.beginPath();
    ctx.moveTo(sx - 15, gy);
    ctx.lineTo(sx - 12 + step, gy - 76);
    ctx.lineTo(sx + 12 + step, gy - 76);
    ctx.lineTo(sx + 15, gy);
    ctx.closePath(); ctx.fill();
    // 腰带
    ctx.fillStyle = C('#8a2a20');
    ctx.fillRect(sx - 14, gy - 44, 28, 7);
    // 腿
    ctx.strokeStyle = C('#26262e'); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - 5 + step, gy - 4); ctx.lineTo(sx - 8 + step * 1.4, gy);
    ctx.moveTo(sx + 5 - step, gy - 4); ctx.lineTo(sx + 8 - step * 1.4, gy);
    ctx.stroke();
    // 刀与手臂（面朝左侧的玩家）
    let ang = 2.07;                       // 收刀：斜下向前
    if (m.state === 'windup') ang = -1.0; // 蓄力：高举向右后
    else if (m.state === 'strike') ang = 2.79; // 挥砍：横斩向左
    const hx = sx - 13, hy = gy - 62;
    ctx.strokeStyle = C('#26262e'); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(sx - 4, gy - 60); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = flash ? '#fff' : '#c9c4b4'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(ang) * 46, hy + Math.sin(ang) * 46);
    ctx.stroke();
    // 蓄力红闪
    if (m.state === 'windup' && Math.sin(m.t * 22) > 0){
      ctx.fillStyle = 'rgba(200,50,43,0.85)';
      ctx.beginPath(); ctx.arc(hx + Math.cos(ang) * 52, hy + Math.sin(ang) * 52, 4.5, 0, TAU); ctx.fill();
    }
    // 挥砍弧光
    if (m.state === 'strike'){
      ctx.strokeStyle = 'rgba(200,50,43,0.5)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(sx - 10, gy - 55, 52, Math.PI - 1.1, Math.PI + 1.1); ctx.stroke();
    }
  } else if (m.kind === 'archer'){
    const drawing = m.state === 'draw';
    const pull = drawing ? Math.min(1, m.st / 0.7) : 0;
    // 跪姿身体
    ctx.fillStyle = C('#3a3a46');
    ctx.beginPath();
    ctx.moveTo(sx - 13, gy);
    ctx.lineTo(sx - 10, gy - 60);
    ctx.lineTo(sx + 10, gy - 60);
    ctx.lineTo(sx + 16, gy);
    ctx.closePath(); ctx.fill();
    // 斗笠（小）
    ctx.fillStyle = C('#5a5348');
    ctx.beginPath();
    ctx.moveTo(sx - 17, gy - 62); ctx.lineTo(sx + 15, gy - 62); ctx.lineTo(sx, gy - 74);
    ctx.closePath(); ctx.fill();
    // 弓
    const bowX = sx - 14;
    ctx.strokeStyle = flash ? '#fff' : '#6b5a3a'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(bowX, gy - 46, 20, -1.2, 1.2, true); ctx.stroke();
    // 弦与箭
    ctx.strokeStyle = 'rgba(240,236,225,0.8)'; ctx.lineWidth = 1.5;
    const tipY = gy - 46;
    ctx.beginPath();
    ctx.moveTo(bowX - Math.sin(1.2) * 20, tipY - Math.cos(1.2) * 20 * 0.01 - 18);
    ctx.lineTo(bowX - pull * 10, tipY);
    ctx.lineTo(bowX - Math.sin(1.2) * 20 * 0.01 - 3, tipY + 18);
    ctx.stroke();
    if (drawing){
      ctx.strokeStyle = '#8f8f96'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bowX - pull * 10, tipY); ctx.lineTo(bowX - pull * 10 - 20, tipY); ctx.stroke();
    }
  } else if (m.kind === 'wisp'){
    const y = gy - m.y;
    const bob = Math.sin(m.t * 5) * 4;
    // 尾焰
    ctx.fillStyle = 'rgba(120,150,200,0.25)';
    ctx.beginPath(); ctx.ellipse(sx + 22, y + bob, 18, 8, 0.2, 0, TAU); ctx.fill();
    // 外焰
    ctx.fillStyle = flash ? '#ffffff' : 'rgba(140,170,220,0.75)';
    ctx.beginPath(); ctx.arc(sx, y + bob, 15, 0, TAU); ctx.fill();
    // 内焰
    ctx.fillStyle = flash ? '#ffffff' : 'rgba(235,242,252,0.95)';
    ctx.beginPath(); ctx.arc(sx - 2, y + bob - 2, 8, 0, TAU); ctx.fill();
    // 鬼眼
    ctx.fillStyle = '#2c2c36';
    ctx.beginPath(); ctx.arc(sx - 4, y + bob - 2, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 2, y + bob - 2, 1.8, 0, TAU); ctx.fill();
  }
}

/* ============ 精英Boss（屏幕右侧随行，三种轮换） ============ */
function drawBoss(m, ctx, g){
  if (!m || m.dead) return;
  if (m.kind === 'tengu'){ drawTengu(m, ctx, g); return; }
  if (m.kind === 'golem'){ drawGolem(m, ctx, g); return; }
  if (m.kind === 'bone'){ drawBone(m, ctx, g); return; }
  if (m.kind === 'vine'){ drawVine(m, ctx, g); return; }
  const gy = g.groundY;
  const sx = m.x - g.camX;
  const C = c => m.hitFlash > 0 ? '#ffffff' : c;
  const bob = Math.sin(m.t * 2.6) * 5;
  const raise = m.atkKind === 'swing' && m.atkAnim > 0 ? Math.min(1, m.atkAnim / 0.6) : 0;
  const y = gy + bob;

  // 金棒（右臂持）
  const shx = sx + 34, shy = y - 92 - raise * 46;
  const cang = -2.4 + raise * 0.5;
  ctx.strokeStyle = C('#5a4a30'); ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shx, shy);
  ctx.lineTo(shx + Math.cos(cang) * 78, shy + Math.sin(cang) * 78);
  ctx.stroke();
  // 狼牙棒头
  ctx.fillStyle = C('#463522');
  ctx.beginPath(); ctx.arc(shx + Math.cos(cang) * 82, shy + Math.sin(cang) * 82, 16, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8f8f96';
  for (let i = 0; i < 6; i++){
    const a = i / 6 * TAU;
    ctx.beginPath();
    ctx.arc(shx + Math.cos(cang) * 82 + Math.cos(a) * 15, shy + Math.sin(cang) * 82 + Math.sin(a) * 15, 2.4, 0, TAU);
    ctx.fill();
  }
  // 壮硕躯干
  ctx.fillStyle = C('#33333d');
  ctx.beginPath();
  ctx.moveTo(sx - 44, y);
  ctx.quadraticCurveTo(sx - 58, y - 70, sx - 26, y - 108);
  ctx.lineTo(sx + 30, y - 108);
  ctx.quadraticCurveTo(sx + 56, y - 60, sx + 44, y);
  ctx.closePath(); ctx.fill();
  // 红腹挂
  ctx.fillStyle = C('#a03028');
  ctx.fillRect(sx - 26, y - 46, 52, 14);
  // 左臂
  ctx.strokeStyle = C('#2c2c36'); ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(sx - 26, y - 88); ctx.lineTo(sx - 56, y - 52); ctx.stroke();
  // 鬼面
  ctx.fillStyle = C('#b03a2e');
  ctx.beginPath(); ctx.arc(sx + 4, y - 124, 24, 0, TAU); ctx.fill();
  // 角
  ctx.fillStyle = C('#e8e4d8');
  ctx.beginPath();
  ctx.moveTo(sx - 12, y - 140); ctx.lineTo(sx - 22, y - 162); ctx.lineTo(sx - 4, y - 144);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + 20, y - 140); ctx.lineTo(sx + 30, y - 162); ctx.lineTo(sx + 12, y - 144);
  ctx.closePath(); ctx.fill();
  // 怒目
  ctx.fillStyle = '#f2ecdf';
  ctx.beginPath(); ctx.ellipse(sx - 6, y - 128, 5.5, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + 14, y - 128, 5.5, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2c2c36';
  ctx.beginPath(); ctx.arc(sx - 6, y - 128, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(sx + 14, y - 128, 2, 0, TAU); ctx.fill();
  // 獠牙嘴
  ctx.strokeStyle = '#2c2c36'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx - 8, y - 114); ctx.lineTo(sx + 16, y - 114);
  ctx.stroke();
  ctx.fillStyle = '#f2ecdf';
  ctx.beginPath();
  ctx.moveTo(sx - 4, y - 114); ctx.lineTo(sx - 1, y - 108); ctx.lineTo(sx + 2, y - 114);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + 8, y - 114); ctx.lineTo(sx + 11, y - 108); ctx.lineTo(sx + 14, y - 114);
  ctx.closePath(); ctx.fill();
}

/* ============ 玩家弹幕（苦无 / 刀气） ============ */
function makeShot(type, x, y, lv, g){
  const cfg = {
    kunai:    { vx: 700, dmg: 1,  pierce: 0,  size: 10 },
    shuriken: { vx: 760, dmg: 1,  pierce: 0,  size: 10 },
    wave:     { vx: 400, dmg: 1,  pierce: 99, size: 24 },
    ultwave:  { vx: 520, dmg: 10, pierce: 99, size: 92 },
    fireorb:  { vx: 400, dmg: 4,  pierce: 99, size: 26 },
    leaf:     { vx: 600, dmg: 2,  pierce: 1,  size: 10 },
    spike:    { vx: 330, dmg: 3,  pierce: 99, size: 30 },
  }[type] || {};
  const s = {
    type, x, y, t: 0, dead: false, vy: 0, elem: null,
    vx: g.speed + (cfg.vx || 500),
    dmg: type === 'wave' && lv >= 3 ? 2 : (cfg.dmg !== undefined ? cfg.dmg : 1),
    pierce: type === 'kunai' ? (lv >= 3 ? 1 : 0) : (cfg.pierce !== undefined ? cfg.pierce : 99),
    size: type === 'wave' ? (lv >= 3 ? 34 : 24) : (cfg.size || 10),
    lv,
  };
  return s;
}

function updateShot(s, dt, g){
  s.t += dt;
  s.x += s.vx * dt;
  if (s.vy) s.y += s.vy * dt;
  if (s.type === 'fireorb' && Math.random() < 0.6){
    g.particles.dust(s.x - g.camX - U.rand(-8, 8), s.y + U.rand(-8, 8), 1);
  }
  if (s.type !== 'wave' && s.type !== 'ultwave' && s.type !== 'fireorb' && s.type !== 'spike' && (s.x > g.camX + g.W + 70 || s.y < -70 || s.y > g.groundY + 70)) s.dead = true;
  if (s.type === 'fireorb' && s.x > g.camX + g.W + 80) s.dead = true;
  if (s.type === 'spike' && s.x > g.camX + g.W + 60) s.dead = true;
  if (s.type === 'wave' && s.t > 0.7) s.dead = true;
  if (s.type === 'ultwave' && (s.t > 1.0 || s.x > g.camX + g.W + 140)) s.dead = true;
}

function drawShot(s, ctx, g){
  const sx = s.x - g.camX;
  if (sx < -60 || sx > g.W + 120) return;
  ctx.save();
  if (s.type === 'kunai'){
    ctx.translate(sx, s.y + Math.sin(s.t * 30) * 1.5);
    ctx.strokeStyle = '#3c3c48'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.fillStyle = '#8f8f96';
    ctx.beginPath(); ctx.moveTo(9, -3.5); ctx.lineTo(16, 0); ctx.lineTo(9, 3.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c8322b'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(-17, -4);
    ctx.moveTo(-11, 0); ctx.lineTo(-17, 4);
    ctx.stroke();
  } else if (s.type === 'shuriken'){
    // 通用忍镖：旋转四芒星
    ctx.translate(sx, s.y);
    ctx.rotate(s.t * 22);
    ctx.fillStyle = '#2c2c36';
    for (let i = 0; i < 4; i++){
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -2.6); ctx.lineTo(11, 0); ctx.lineTo(0, 2.6);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
  } else if (s.type === 'fireorb'){
    // 技能·烈焰冲击：大火球
    ctx.translate(sx, s.y);
    ctx.fillStyle = 'rgba(216,100,42,0.35)';
    ctx.beginPath(); ctx.arc(6, 0, s.size + 12 + Math.sin(s.t * 20) * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d85a2a';
    ctx.beginPath(); ctx.arc(0, 0, s.size, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0904a';
    ctx.beginPath(); ctx.arc(-4, -3, s.size * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f8d060';
    ctx.beginPath(); ctx.arc(-9, -6, s.size * 0.3, 0, TAU); ctx.fill();
    // 尾焰
    ctx.strokeStyle = 'rgba(232,120,50,0.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s.size - 4, 0);
    ctx.quadraticCurveTo(-s.size - 26, -10, -s.size - 40, -4);
    ctx.moveTo(-s.size - 4, 4);
    ctx.quadraticCurveTo(-s.size - 24, 12, -s.size - 38, 8);
    ctx.stroke();
  } else if (s.type === 'leaf'){
    // 技能·木叶旋刃
    ctx.translate(sx, s.y);
    ctx.rotate(s.t * 18);
    ctx.fillStyle = '#4a8a3a';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(8, -2, 0, 9);
    ctx.quadraticCurveTo(-8, -2, 0, -9);
    ctx.fill();
    ctx.strokeStyle = '#2e5a24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
  } else if (s.type === 'spike'){
    // 技能·裂地崩：地刺波
    const gy = g.groundY;
    const h = 70 + Math.sin(s.t * 24) * 10;
    ctx.fillStyle = '#7a6248';
    ctx.beginPath();
    ctx.moveTo(sx - 30, gy);
    ctx.lineTo(sx - 16, gy - h);
    ctx.lineTo(sx - 2, gy - h * 0.7);
    ctx.lineTo(sx + 10, gy - h * 1.1);
    ctx.lineTo(sx + 26, gy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#54422e'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 16, gy - h + 6); ctx.lineTo(sx - 8, gy - h * 0.4);
    ctx.moveTo(sx + 10, gy - h + 8); ctx.lineTo(sx + 18, gy - h * 0.5);
    ctx.stroke();
  } else {
    // 刀气：新月
    ctx.translate(sx, s.y);
    const r = s.size;
    if (s.type === 'ultwave'){
      // 奥义·裂空斩：巨型墨月
      ctx.strokeStyle = 'rgba(32,32,40,0.9)';
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(0, 0, r, -1.05, 1.05); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,50,43,0.7)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(-6, 0, r - 12, -0.95, 0.95); ctx.stroke();
      ctx.strokeStyle = 'rgba(242,236,223,0.95)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(-10, 0, r + 6, -0.9, 0.9); ctx.stroke();
      ctx.strokeStyle = 'rgba(32,32,40,0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-16, 0, r + 22, -0.8, 0.8); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(32,32,40,0.85)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = 'rgba(242,236,223,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-4, 0, r, -1.05, 1.05); ctx.stroke();
    }
  }
  ctx.restore();
}

/* ============ 敌方危险物（火球 / 冲击波） ============ */
function makeHazard(type, x, y, vx, vy){
  return { type, x, y, vx, vy, t: 0, dead: false };
}

function updateHazard(h, dt, g){
  h.t += dt;
  h.x += h.vx * dt;
  if (h.type === 'fireball' || h.type === 'feather' || h.type === 'blade'){
    h.y += h.vy * dt;
    if (h.x < g.camX - 80 || h.y > g.groundY + 20) h.dead = true;
  } else if (h.type === 'rock'){
    h.vy += (h.gvy || 980) * dt;
    h.y += h.vy * dt;
    if (h.y >= g.groundY - 10){
      h.dead = true;
      g.particles.dust(h.x - g.camX, g.groundY, 8);
    }
  } else if (h.type === 'burst'){
    if (h.t > 1.15) h.dead = true;   // 预警 0.65s + 生效 0.5s
  } else {
    if (h.x < g.camX - 120) h.dead = true;
  }
}

function hazardHitbox(h, g){
  if (h.type === 'fireball') return { x: h.x - 9, y: h.y - 9, w: 18, h: 18 };
  if (h.type === 'feather') return { x: h.x - 7, y: h.y - 10, w: 14, h: 20 };
  if (h.type === 'blade') return { x: h.x - 12, y: h.y - 5, w: 24, h: 10 };
  if (h.type === 'rock') return { x: h.x - 12, y: h.y - 12, w: 24, h: 24 };
  if (h.type === 'burst'){
    if (h.t > 0.65 && h.t < 1.15){
      return { x: h.x - 23, y: g.groundY - 88, w: 46, h: 88 };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: h.x - 22, y: g.groundY - 62, w: 44, h: 62 }; // 地面冲击波
}

function drawHazard(h, ctx, g){
  const sx = h.x - g.camX;
  if (sx < -80 || sx > g.W + 120) return;
  const gy = g.groundY;
  if (h.type === 'fireball'){
    // 尾焰
    ctx.fillStyle = 'rgba(216,120,60,0.3)';
    ctx.beginPath(); ctx.ellipse(sx + 14, h.y, 14, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c85a2b';
    ctx.beginPath(); ctx.arc(sx, h.y, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0c060';
    ctx.beginPath(); ctx.arc(sx - 2, h.y - 1, 4.5, 0, TAU); ctx.fill();
  } else if (h.type === 'feather'){
    // 鸦羽：幽蓝黑羽
    ctx.save();
    ctx.translate(sx, h.y);
    ctx.rotate(Math.sin(h.t * 9) * 0.35 + 0.3);
    ctx.fillStyle = '#2c3444';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(7, -2, 0, 11);
    ctx.quadraticCurveTo(-7, -2, 0, -11);
    ctx.fill();
    ctx.strokeStyle = '#55627e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
    ctx.restore();
  } else if (h.type === 'blade'){
    // 骨魔将·金色飞刃
    ctx.save();
    ctx.translate(sx, h.y);
    ctx.rotate(Math.atan2(h.vy, h.vx - 200) * 0.3);
    ctx.fillStyle = '#c9a53a';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-4, -6); ctx.lineTo(-10, 0); ctx.lineTo(-4, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a6f22'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(14, 0); ctx.stroke();
    ctx.restore();
  } else if (h.type === 'rock'){
    // 落点预警圈
    if (h.tx !== undefined){
      const mx = h.tx - g.camX;
      ctx.strokeStyle = `rgba(200,50,43,${0.4 + 0.3 * Math.sin(g.t * 14)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(mx, gy + 3, 22, 6, 0, 0, TAU); ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, h.y);
    ctx.rotate(h.t * 7);
    ctx.fillStyle = '#57575f';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3c3c44'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-6, -4); ctx.lineTo(2, 1); ctx.lineTo(-2, 7);
    ctx.stroke();
    ctx.restore();
  } else if (h.type === 'burst'){
    if (h.t <= 0.65){
      // 预警：地面红圈
      const k = h.t / 0.65;
      ctx.strokeStyle = `rgba(200,50,43,${0.35 + 0.45 * Math.abs(Math.sin(h.t * 16))})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, gy + 2, 12 + k * 16, 4 + k * 4, 0, 0, TAU); ctx.stroke();
    } else {
      // 石刺爆发
      const k = Math.min(1, (h.t - 0.65) / 0.12);
      ctx.fillStyle = INK;
      for (let i = -1; i <= 1; i++){
        const x0 = sx + i * 15;
        const hh = (i === 0 ? 92 : 64) * k;
        ctx.beginPath();
        ctx.moveTo(x0 - 8, gy + 2);
        ctx.lineTo(x0, gy + 2 - hh);
        ctx.lineTo(x0 + 8, gy + 2);
        ctx.closePath(); ctx.fill();
      }
    }
  } else {
    // 地面冲击波：奔涌墨浪
    const w = 1 + Math.sin(h.t * 26) * 0.12;
    ctx.fillStyle = '#2c2c36';
    ctx.beginPath();
    ctx.moveTo(sx - 26 * w, gy);
    ctx.quadraticCurveTo(sx - 6, gy - 66 * w, sx + 20 * w, gy - 8);
    ctx.lineTo(sx + 20 * w, gy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,50,43,0.55)';
    ctx.beginPath();
    ctx.moveTo(sx - 18 * w, gy);
    ctx.quadraticCurveTo(sx - 4, gy - 40 * w, sx + 12 * w, gy - 6);
    ctx.lineTo(sx + 12 * w, gy);
    ctx.closePath(); ctx.fill();
  }
}

/* ============ 武魂 ============ */
function updateSoul(s, dt, g){
  s.t += dt;
  s.life -= dt;
  if (s.life <= 0){ s.taken = true; return; }
  const cx = g.camX + g.ninjaX, cy = g.ninja.centerY;
  const dx = cx - s.x, dy = cy - s.y;
  const d = Math.hypot(dx, dy) || 1;
  const v = s.t < 0.35 ? 60 : 1200;
  s.x += dx / d * v * dt;
  s.y += dy / d * v * dt;
  if (d < 30){
    s.taken = true;
    g.addSoul(1);
  }
}

function drawSoul(s, ctx, g){
  const sx = s.x - g.camX;
  if (sx < -40 || sx > g.W + 40) return;
  const bob = Math.sin(s.t * 6) * 3;
  ctx.fillStyle = 'rgba(120,160,210,0.35)';
  ctx.beginPath(); ctx.arc(sx, s.y + bob, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(210,230,250,0.95)';
  ctx.beginPath();
  ctx.moveTo(sx, s.y - 10 + bob);
  ctx.quadraticCurveTo(sx + 8, s.y - 2 + bob, sx, s.y + 9 + bob);
  ctx.quadraticCurveTo(sx - 8, s.y - 2 + bob, sx, s.y - 10 + bob);
  ctx.closePath(); ctx.fill();
}

/* ============ 鸦天狗（飞行Boss） ============ */
function drawTengu(m, ctx, g){
  const gy = g.groundY;
  const sx = m.x - g.camX;
  const C = c => m.hitFlash > 0 ? '#ffffff' : c;
  const y = gy - m.yOff + Math.sin(m.t * 2) * 5;
  const flap = Math.sin(m.t * 6.5);
  const tele = m.charge && m.charge.phase === 0 && Math.sin(m.t * 18) > 0;

  // 双翼
  ctx.fillStyle = C('#262630');
  for (const s of [-1, 1]){
    ctx.beginPath();
    ctx.moveTo(sx + s * 8, y - 8);
    ctx.quadraticCurveTo(sx + s * 46, y - 26 - flap * 30, sx + s * 86, y - 6 - flap * 44);
    ctx.quadraticCurveTo(sx + s * 50, y - 2 - flap * 10, sx + s * 10, y + 4);
    ctx.closePath(); ctx.fill();
  }
  // 尾羽
  ctx.strokeStyle = C('#262630'); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx + 30, y + 2); ctx.lineTo(sx + 56, y + 12);
  ctx.moveTo(sx + 30, y + 6); ctx.lineTo(sx + 52, y + 22);
  ctx.stroke();
  // 身体
  ctx.fillStyle = C('#1e2634');
  ctx.beginPath(); ctx.ellipse(sx, y, 42, 19, -0.06, 0, TAU); ctx.fill();
  // 红腹
  ctx.fillStyle = C('#8a2a20');
  ctx.beginPath(); ctx.ellipse(sx + 4, y + 7, 26, 8, 0, 0, TAU); ctx.fill();
  // 天狗面（朝左）：长鼻红面
  const hx = sx - 44, hy = y - 8;
  ctx.fillStyle = C('#b03a2e');
  ctx.beginPath(); ctx.arc(hx, hy, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = C('#8a2a20');
  ctx.beginPath();
  ctx.moveTo(hx - 8, hy - 2); ctx.lineTo(hx - 30, hy + 3); ctx.lineTo(hx - 8, hy + 7);
  ctx.closePath(); ctx.fill();
  // 怒目
  ctx.fillStyle = '#f2ecdf';
  ctx.beginPath(); ctx.ellipse(hx - 3, hy - 5, 4, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#26262e';
  ctx.beginPath(); ctx.arc(hx - 3, hy - 5, 1.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#26262e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx - 8, hy - 9); ctx.lineTo(hx + 2, hy - 6); ctx.stroke();
  // 乌帽
  ctx.fillStyle = C('#141821');
  ctx.beginPath();
  ctx.moveTo(hx - 10, hy - 11);
  ctx.quadraticCurveTo(hx, hy - 26, hx + 12, hy - 12);
  ctx.closePath(); ctx.fill();
  // 铁扇（爪下）
  ctx.save();
  ctx.translate(sx - 6, y + 20);
  ctx.rotate(-0.3 + Math.sin(m.t * 2) * 0.08);
  ctx.fillStyle = C('#8a7a5a');
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-22, -16); ctx.lineTo(6, -22);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5c5138'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -19); ctx.stroke();
  ctx.restore();
  // 俯冲蓄力红闪
  if (tele){
    ctx.fillStyle = 'rgba(200,50,43,0.9)';
    ctx.beginPath(); ctx.arc(hx - 30, hy + 3, 5, 0, TAU); ctx.fill();
  }
}

/* ============ 山魈（石魔Boss） ============ */
function drawGolem(m, ctx, g){
  const gy = g.groundY;
  const sx = m.x - g.camX;
  const C = c => m.hitFlash > 0 ? '#ffffff' : c;
  const bob = Math.sin(m.t * 1.8) * 4;
  const y = gy + bob;
  const raise = m.atkKind === 'swing' && m.atkAnim > 0 ? Math.min(1, m.atkAnim / 0.6) : 0;

  // 双腿石柱
  ctx.fillStyle = C('#4c4c55');
  ctx.fillRect(sx - 44, y - 52, 24, 52);
  ctx.fillRect(sx + 20, y - 52, 24, 52);
  // 躯干巨岩
  ctx.fillStyle = C('#57575f');
  ctx.beginPath();
  ctx.moveTo(sx - 58, y - 46);
  ctx.quadraticCurveTo(sx - 70, y - 118, sx - 30, y - 138);
  ctx.lineTo(sx + 30, y - 138);
  ctx.quadraticCurveTo(sx + 70, y - 118, sx + 58, y - 46);
  ctx.closePath(); ctx.fill();
  // 裂纹与苔藓
  ctx.strokeStyle = '#3c3c44'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 30, y - 120); ctx.lineTo(sx - 14, y - 96); ctx.lineTo(sx - 26, y - 72);
  ctx.moveTo(sx + 26, y - 110); ctx.lineTo(sx + 12, y - 84);
  ctx.stroke();
  ctx.fillStyle = C('#7a8a5a');
  ctx.beginPath(); ctx.ellipse(sx + 38, y - 122, 13, 7, 0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx - 44, y - 60, 10, 5, -0.3, 0, TAU); ctx.fill();
  // 双臂巨拳
  ctx.fillStyle = C('#4c4c55');
  ctx.beginPath(); ctx.arc(sx - 66, y - 78, 17, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(sx + 66, y - 78, 17, 0, TAU); ctx.fill();
  ctx.strokeStyle = C('#4c4c55'); ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx - 50, y - 112); ctx.lineTo(sx - 66, y - 82); ctx.stroke();
  // 举拳（砸地预备）
  ctx.beginPath(); ctx.moveTo(sx + 50, y - 112); ctx.lineTo(sx + 62, y - 118 - raise * 34); ctx.stroke();
  ctx.beginPath(); ctx.arc(sx + 62, y - 128 - raise * 40, 17 + raise * 3, 0, TAU); ctx.fill();
  // 小头：独眼怒颜
  ctx.fillStyle = C('#4c4c55');
  ctx.beginPath(); ctx.arc(sx, y - 148, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f0c060';
  ctx.beginPath(); ctx.arc(sx - 4, y - 150, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#26262e';
  ctx.beginPath(); ctx.arc(sx - 4, y - 150, 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#26262e'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 12, y - 158); ctx.lineTo(sx + 4, y - 155);
  ctx.moveTo(sx - 8, y - 138); ctx.lineTo(sx + 6, y - 140);
  ctx.stroke();
}

/* ============ 骨魔将（金Boss） ============ */
function drawBone(m, ctx, g){
  const gy = g.groundY;
  const sx = m.x - g.camX;
  const C = c => m.hitFlash > 0 ? '#ffffff' : c;
  const bob = Math.sin(m.t * 2.4) * 5;
  const y = gy + bob;
  const raise = m.atkKind === 'swing' && m.atkAnim > 0 ? Math.min(1, m.atkAnim / 0.6) : 0;

  // 骨刀（右臂）
  const shx = sx + 30, shy = y - 88 - raise * 40;
  const cang = -2.3 + raise * 0.4;
  ctx.strokeStyle = C('#b8b2a2'); ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shx, shy);
  ctx.lineTo(shx + Math.cos(cang) * 84, shy + Math.sin(cang) * 84);
  ctx.stroke();
  ctx.strokeStyle = C('#e8e4d8'); ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(shx + Math.cos(cang) * 84, shy + Math.sin(cang) * 84);
  ctx.lineTo(shx + Math.cos(cang) * 102, shy + Math.sin(cang) * 102);
  ctx.stroke();
  // 灰白骨躯干
  ctx.fillStyle = C('#cfc9ba');
  ctx.beginPath();
  ctx.moveTo(sx - 40, y);
  ctx.quadraticCurveTo(sx - 52, y - 66, sx - 24, y - 102);
  ctx.lineTo(sx + 28, y - 102);
  ctx.quadraticCurveTo(sx + 50, y - 58, sx + 40, y);
  ctx.closePath(); ctx.fill();
  // 肋骨纹
  ctx.strokeStyle = C('#a8a292'); ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 24, y - 88); ctx.lineTo(sx + 24, y - 88);
  ctx.moveTo(sx - 27, y - 72); ctx.lineTo(sx + 27, y - 72);
  ctx.moveTo(sx - 25, y - 56); ctx.lineTo(sx + 25, y - 56);
  ctx.stroke();
  // 金色战裙
  ctx.fillStyle = C('#c9a53a');
  ctx.fillRect(sx - 24, y - 44, 48, 12);
  // 左臂骨
  ctx.strokeStyle = C('#b8b2a2'); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(sx - 24, y - 86); ctx.lineTo(sx - 52, y - 50); ctx.stroke();
  // 骷髅面
  const hx = sx + 2, hy = y - 118;
  ctx.fillStyle = C('#e4dfd0');
  ctx.beginPath(); ctx.arc(hx, hy, 17, 0, TAU); ctx.fill();
  ctx.fillStyle = '#26262e';
  ctx.beginPath(); ctx.ellipse(hx - 6, hy - 2, 4, 5, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + 6, hy - 2, 4, 5, 0, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 5, hy + 8); ctx.lineTo(hx - 3, hy + 12); ctx.lineTo(hx - 1, hy + 8);
  ctx.moveTo(hx + 1, hy + 8); ctx.lineTo(hx + 3, hy + 12); ctx.lineTo(hx + 5, hy + 8);
  ctx.fill();
  // 金角
  ctx.fillStyle = C('#c9a53a');
  ctx.beginPath();
  ctx.moveTo(hx - 10, hy - 13); ctx.lineTo(hx - 20, hy - 34); ctx.lineTo(hx - 3, hy - 16);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy - 13); ctx.lineTo(hx + 20, hy - 34); ctx.lineTo(hx + 3, hy - 16);
  ctx.closePath(); ctx.fill();
}

/* ============ 藤魔（木Boss） ============ */
function drawVine(m, ctx, g){
  const gy = g.groundY;
  const sx = m.x - g.camX;
  const C = c => m.hitFlash > 0 ? '#ffffff' : c;
  const bob = Math.sin(m.t * 1.6) * 5;
  const y = gy + bob;
  const raise = m.atkKind === 'swing' && m.atkAnim > 0 ? Math.min(1, m.atkAnim / 0.6) : 0;

  // 树根腿
  ctx.strokeStyle = C('#3c5238'); ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - 24, y - 60); ctx.lineTo(sx - 34, y);
  ctx.moveTo(sx + 24, y - 60); ctx.lineTo(sx + 34, y);
  ctx.stroke();
  // 藤蔓躯干
  ctx.fillStyle = C('#46603f');
  ctx.beginPath();
  ctx.moveTo(sx - 54, y - 50);
  ctx.quadraticCurveTo(sx - 66, y - 112, sx - 30, y - 136);
  ctx.lineTo(sx + 30, y - 136);
  ctx.quadraticCurveTo(sx + 66, y - 112, sx + 54, y - 50);
  ctx.closePath(); ctx.fill();
  // 缠绕藤条
  ctx.strokeStyle = C('#5e7a4e'); ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx - 40, y - 118);
  ctx.quadraticCurveTo(sx - 8, y - 96, sx - 34, y - 66);
  ctx.moveTo(sx + 38, y - 112);
  ctx.quadraticCurveTo(sx + 10, y - 88, sx + 36, y - 60);
  ctx.stroke();
  // 枝叶
  ctx.fillStyle = C('#5a9a4a');
  ctx.beginPath(); ctx.ellipse(sx + 40, y - 128, 15, 8, 0.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx - 44, y - 64, 11, 6, -0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + 2, y - 146, 12, 7, 0.1, 0, TAU); ctx.fill();
  // 藤鞭右臂（举起砸落）
  const ax = sx + 44, ay = y - 100 - raise * 36;
  ctx.strokeStyle = C('#4c683e'); ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(sx + 30, y - 104);
  ctx.quadraticCurveTo(ax + 16, ay - 10, ax + 22, ay - raise * 40 - 20);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(ax + 22, ay - raise * 40 - 20); ctx.lineTo(ax + 36, ay - raise * 40 - 12);
  ctx.stroke();
  // 幽绿独眼
  const hx = sx, hy = y - 150;
  ctx.fillStyle = C('#3c5238');
  ctx.beginPath(); ctx.arc(hx, hy, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8ee06a';
  ctx.beginPath(); ctx.arc(hx, hy - 1, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1e2e1a';
  ctx.beginPath(); ctx.arc(hx, hy - 1, 2.2, 0, TAU); ctx.fill();
}

/* ============ 战斗特效（斩弧 / 浮字 / 白闪） ============ */
function drawFx(f, ctx, g){
  if (f.t < 0) return;   // 负 t = 延迟出场
  const k = 1 - f.t / f.life;
  if (f.type === 'slash'){
    const sx = g.ninjaX, sy = g.ninja.feetY - 52;
    const prog = f.t / f.life;
    const main = f.color || '#f2ecdf';
    const edge = f.edge || INK;
    ctx.save();
    ctx.globalAlpha = k * 0.9;
    if (f.wide){
      // 锁镰横扫：宽扁椭圆弧
      const rx = f.range * (0.6 + 0.5 * prog);
      ctx.strokeStyle = main;
      ctx.lineWidth = 13 - 6 * prog;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(sx - 4, sy, rx, 46 * (1 - 0.3 * prog), 0, -1.05, 1.05);
      ctx.stroke();
      ctx.globalAlpha = k * 0.5;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sx - 8, sy, rx + 8, 52, 0, -0.95, 0.95);
      ctx.stroke();
    } else {
      const r = f.range * (0.55 + 0.65 * prog);
      ctx.strokeStyle = main;
      ctx.lineWidth = 11 - 5 * prog;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sx - 6, sy, r, -1.15 + prog * 0.5, 1.15 + prog * 0.5);
      ctx.stroke();
      ctx.globalAlpha = k * 0.5;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx - 10, sy, r + 7, -1.0 + prog * 0.5, 1.0 + prog * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  } else if (f.type === 'bolt'){
    // 闪电链：两世界坐标间的锯齿折线
    ctx.save();
    ctx.globalAlpha = k;
    const x1 = f.x1 - g.camX, y1 = f.y1, x2 = f.x2 - g.camX, y2 = f.y2;
    ctx.strokeStyle = '#7a7ad8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const seg = 5;
    for (let i = 1; i < seg; i++){
      const t2 = i / seg;
      ctx.lineTo(U.lerp(x1, x2, t2) + U.rand(-9, 9), U.lerp(y1, y2, t2) + U.rand(-9, 9));
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235,235,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  } else if (f.type === 'text'){
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.fillStyle = f.color || RED;
    ctx.font = `bold ${f.size || 22}px "Kaiti SC","KaiTi",serif`;
    ctx.textAlign = 'center';
    ctx.fillText(f.str, f.x - g.camX, f.y - (1 - k) * 44);
    ctx.restore();
  } else if (f.type === 'dmgnum'){
    // 伤害飘字：弹出 → 上浮 → 渐隐（约 0.8s）
    ctx.save();
    const prog = f.t / f.life;
    const alpha = prog < 0.12 ? prog / 0.12 : Math.max(0, 1 - (prog - 0.12) / 0.88);
    const pop = prog < 0.1 ? 1.35 - prog * 3 : 1;
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round((f.size || 20) * pop)}px "Kaiti SC","KaiTi",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dx = f.x - g.camX + (f.jx || 0);
    const dy = f.y - prog * 36 + Math.sin(prog * 6) * 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(242,236,223,0.92)';
    ctx.strokeText(f.str, dx, dy);
    ctx.fillStyle = f.color || INK;
    ctx.fillText(f.str, dx, dy);
    ctx.restore();
  } else if (f.type === 'flash'){
    ctx.fillStyle = `rgba(250,246,235,${0.55 * k})`;
    ctx.fillRect(0, 0, g.W, g.H);
  } else if (f.type === 'redflash'){
    // 受伤红闪
    ctx.fillStyle = `rgba(180,40,30,${0.3 * k})`;
    ctx.fillRect(0, 0, g.W, g.H);
  }
}
