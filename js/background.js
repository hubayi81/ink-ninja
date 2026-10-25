'use strict';

// 水墨视差背景（多主题：竹林/雪夜/火山）+ 环境粒子 + 宣纸颗粒
const Bg = (() => {
  let ridges, near, groundJag, clouds, leaves, paperPattern = null;
  let vig = null, vigW = 0, vigH = 0, leafT = 0;
  let theme = THEME_DEFS[0];

  function setTheme(def){
    theme = def;
    leaves = [];
    leafT = 0;
  }

  function makeRidge(par, base, amp, color, seg){
    const n = Math.round(2600 / seg) + 1;
    const pts = [];
    let h = base + U.rand(0, amp * 0.5);
    for (let i = 0; i <= n; i++){
      h = U.clamp(h + U.rand(-amp * 0.3, amp * 0.3), base - amp * 0.15, base + amp);
      pts.push(h);
    }
    pts[n] = pts[0];
    const bamboo = [];
    if (par > 0.4){
      for (let i = 1; i < n; i++) if (U.chance(0.22)) bamboo.push(i);
    }
    return { par, color, seg, pts, n, period: n * seg, bamboo };
  }

  function init(){
    ridges = [
      makeRidge(0.10, 190, 130, '#placeholder1', 170),
      makeRidge(0.22, 140, 120, '#placeholder2', 140),
    ];
    near = makeRidge(0.45, 70, 80, '#placeholder3', 120);
    groundJag = [];
    for (let i = 0; i < 64; i++) groundJag.push(U.rand(0, 9));
    clouds = [];
    for (let i = 0; i < 5; i++){
      clouds.push({ x: U.rand(0, 1600), y: U.rand(40, 220), s: U.rand(0.7, 1.5), v: U.rand(6, 16) });
    }
    leaves = [];
  }

  function ridgeColor(slot){
    if (slot === 1) return theme.ridge1;
    if (slot === 2) return theme.ridge2;
    return theme.near;
  }

  function update(dt, g){
    for (const c of clouds){
      c.x -= c.v * dt;
      if (c.x < -280){
        c.x = g.W + 220;
        c.y = U.rand(30, Math.max(120, g.H * 0.45));
      }
    }
    // 环境粒子
    leafT -= dt;
    const rate = theme.ambient === 'snow' ? 0.12 : theme.ambient === 'ember' ? 0.18 : 0.8;
    if (leafT <= 0 && leaves.length < (theme.ambient === 'snow' ? 60 : 26)){
      leafT = U.rand(rate, rate + 0.5);
      if (theme.ambient === 'snow'){
        leaves.push({ x: U.rand(0, g.W + 120), y: -20, vy: U.rand(46, 90), ph: U.rand(0, TAU), sp: U.rand(-1.5, 1.5), s: U.rand(0.7, 1.6) });
      } else if (theme.ambient === 'ember'){
        leaves.push({ x: U.rand(0, g.W + 80), y: g.H + 20, vy: -U.rand(30, 70), ph: U.rand(0, TAU), sp: U.rand(-2, 2), s: U.rand(0.5, 1.2) });
      } else if (theme.ambient === 'dust'){
        leaves.push({ x: g.W + 30, y: U.rand(20, g.groundY), vy: U.rand(-6, 6), ph: U.rand(0, TAU), sp: 0, s: U.rand(0.8, 1.8) });
      } else if (theme.ambient === 'mote'){
        leaves.push({ x: U.rand(0, g.W + 60), y: U.rand(10, g.groundY - 20), vy: U.rand(-8, 8), ph: U.rand(0, TAU), sp: 0, s: U.rand(0.5, 1.1) });
      } else {
        leaves.push({ x: U.rand(g.W * 0.15, g.W + 60), y: -24, vy: U.rand(38, 80), ph: U.rand(0, TAU), sp: U.rand(-2.6, 2.6), s: U.rand(0.7, 1.3) });
      }
    }
    for (let i = leaves.length - 1; i >= 0; i--){
      const l = leaves[i];
      l.y += l.vy * dt;
      if (theme.ambient === 'dust') l.x -= (g.speed * 0.5 + 200) * dt;
      else if (theme.ambient === 'mote') l.x -= (g.speed * 0.06 + 12) * dt;
      else l.x -= (theme.ambient === 'leaf' ? (g.speed * 0.1 + 26) : 18) * dt;
      l.x += Math.sin(g.t * 1.6 + l.ph) * 22 * dt;
      const out = theme.ambient === 'ember' ? (l.y < -30 || l.x < -40)
        : theme.ambient === 'dust' || theme.ambient === 'mote' ? l.x < -40
        : (l.y > g.groundY + 40 || l.x < -40);
      if (out) leaves.splice(i, 1);
    }
  }

  function drawRidge(r, ctx, g, slot){
    const off = (g.camX * r.par) % r.period;
    const tiles = Math.ceil(g.W / r.period) + 2;
    ctx.fillStyle = ridgeColor(slot);
    ctx.beginPath();
    ctx.moveTo(-off, g.groundY + 6);
    for (let t2 = 0; t2 < tiles; t2++){
      const x0 = -off + t2 * r.period;
      for (let i = 0; i <= r.n; i++){
        ctx.lineTo(x0 + i * r.seg, g.groundY - r.pts[i]);
      }
    }
    ctx.lineTo(-off + tiles * r.period, g.groundY + 6);
    ctx.closePath();
    ctx.fill();
  }

  function draw(ctx, g){
    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, g.groundY);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, g.W, g.groundY + 2);
    // 日 / 月 / 熔岩辉光
    ctx.fillStyle = theme.sun;
    ctx.beginPath(); ctx.arc(g.W * 0.78, g.H * 0.24, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = theme.sunCore;
    ctx.beginPath(); ctx.arc(g.W * 0.78, g.H * 0.24, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = theme.sun.replace(/[\d.]+\)$/, '0.14)');
    ctx.beginPath(); ctx.arc(g.W * 0.78, g.H * 0.24, 68, 0, TAU); ctx.fill();
    // 云
    ctx.fillStyle = theme.ambient === 'snow' ? 'rgba(60,70,95,0.5)' : 'rgba(239,232,216,0.85)';
    if (theme.ambient === 'ember') ctx.fillStyle = 'rgba(80,45,35,0.6)';
    for (const c of clouds){
      const sx = ((c.x % (g.W + 460)) + g.W + 460) % (g.W + 460) - 140;
      ctx.beginPath();
      ctx.ellipse(sx, c.y, 46 * c.s, 15 * c.s, 0, 0, TAU);
      ctx.ellipse(sx + 34 * c.s, c.y + 6 * c.s, 30 * c.s, 11 * c.s, 0, 0, TAU);
      ctx.fill();
    }
    drawRidge(ridges[0], ctx, g, 1);
    drawRidge(ridges[1], ctx, g, 2);
    drawRidge(near, ctx, g, 3);
    // 竹林 / 枯木 / 火岩柱
    const off = (g.camX * near.par) % near.period;
    const tiles = Math.ceil(g.W / near.period) + 2;
    ctx.strokeStyle = theme.bamboo;
    ctx.lineCap = 'round';
    for (let t2 = 0; t2 < tiles; t2++){
      const x0 = -off + t2 * near.period;
      for (const i of near.bamboo){
        const bx = x0 + i * near.seg;
        if (bx < -30 || bx > g.W + 30) continue;
        const by = g.groundY - near.pts[i] + 4;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + 7, by - 50, bx + 3, by - 96);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx + 3, by - 96); ctx.lineTo(bx + 16, by - 104);
        ctx.moveTo(bx + 3, by - 82); ctx.lineTo(bx - 10, by - 90);
        ctx.moveTo(bx + 4, by - 70); ctx.lineTo(bx + 15, by - 74);
        ctx.stroke();
      }
    }
  }

  function drawGround(ctx, g){
    const gy = g.groundY;
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, gy + 7, g.W, g.H - gy - 7);
    // 锯齿状墨带顶边
    ctx.beginPath();
    const off = g.camX % 512;
    const xStart = -off;
    ctx.moveTo(xStart, gy + groundJag[0]);
    const count = Math.ceil((g.W + 16) / 8) + 1;
    for (let k = 0; k <= count; k++){
      const x = xStart + k * 8;
      const xi = ((x % 512) + 512) % 512;
      ctx.lineTo(x, gy + groundJag[Math.floor(xi / 8)]);
    }
    ctx.lineTo(xStart + count * 8, gy + 26);
    ctx.lineTo(xStart, gy + 26);
    ctx.closePath();
    ctx.fillStyle = theme.ground;
    ctx.fill();
    // 次层线
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(0, gy + 24, g.W, 3);
    // 速度流线
    ctx.strokeStyle = theme.groundLine.replace(/[\d.]+\)$/, '0.16)');
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++){
      const yy = gy + 34 + i * 14;
      const xx = -((g.camX * 1.3 + i * 260) % (g.W + 300));
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 90 + g.speed * 0.08, yy);
      ctx.stroke();
    }
  }

  function drawLeaves(ctx, g){
    for (const l of leaves){
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.ph + g.t * l.sp);
      ctx.scale(l.s, l.s);
      if (theme.ambient === 'snow'){
        ctx.fillStyle = 'rgba(235,240,250,0.85)';
        ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(235,240,250,0.35)';
        ctx.beginPath(); ctx.arc(2, 1, 5.5, 0, TAU); ctx.fill();
      } else if (theme.ambient === 'ember'){
        const flick = 0.6 + 0.4 * Math.sin(g.t * 9 + l.ph);
        ctx.fillStyle = `rgba(235,130,60,${0.75 * flick})`;
        ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(250,200,110,${0.5 * flick})`;
        ctx.beginPath(); ctx.arc(-1, -1, 1.4, 0, TAU); ctx.fill();
      } else if (theme.ambient === 'dust'){
        ctx.strokeStyle = 'rgba(200,170,110,0.4)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-14 * l.s, 0); ctx.lineTo(10 * l.s, 0); ctx.stroke();
      } else if (theme.ambient === 'mote'){
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(g.t * 3 + l.ph));
        ctx.fillStyle = `rgba(212,175,55,${0.7 * tw})`;
        ctx.beginPath(); ctx.arc(0, 0, 2 * l.s, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(190,72,48,0.8)';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.quadraticCurveTo(5, -1, 0, 7);
        ctx.quadraticCurveTo(-5, -1, 0, -6);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawOver(ctx, g){
    if (!paperPattern) paperPattern = ctx.createPattern(makePaperTexture(), 'repeat');
    ctx.fillStyle = paperPattern;
    ctx.fillRect(0, 0, g.W, g.H);
    if (!vig || vigW !== g.W || vigH !== g.H){
      vig = ctx.createRadialGradient(
        g.W / 2, g.H * 0.45, Math.min(g.W, g.H) * 0.42,
        g.W / 2, g.H * 0.45, Math.max(g.W, g.H) * 0.75
      );
      vig.addColorStop(0, 'rgba(40,34,22,0)');
      vig.addColorStop(1, 'rgba(40,34,22,0.16)');
      vigW = g.W; vigH = g.H;
    }
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, g.W, g.H);
  }

  return { init, setTheme, update, draw, drawGround, drawLeaves, drawOver,
    get theme(){ return theme; } };
})();
