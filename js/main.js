'use strict';

(function(){
  const canvas = $id('game');
  const game = new Game(canvas);
  Input.init(game, canvas);
  window.game = game; // 调试用

  // 按钮
  $id('btn-start').addEventListener('click', () => { Sfx.unlock(); game.startRun('stage', game.selectedStage); });
  const replay = () => { Sfx.unlock(); game.startRun(game.mode === 'daily' ? 'daily' : 'stage', game.stageNum); };
  for (const id of ['btn-retry', 'btn-restart-p']){
    $id(id).addEventListener('click', replay);
  }
  $id('btn-daily').addEventListener('click', () => { Sfx.unlock(); game.startRun('daily'); });
  $id('btn-shop').addEventListener('click', () => { Sfx.unlock(); game.openShop(); });
  $id('btn-shop-close').addEventListener('click', () => game.closeShop());
  $id('btn-ach').addEventListener('click', () => { Sfx.unlock(); game.openAch(); });
  $id('btn-ach-close').addEventListener('click', () => game.closeAch());
  $id('shop-list').addEventListener('click', e => {
    const b = e.target.closest('button.buy');
    if (b && !b.disabled) game.buyUpgrade(b.dataset.id);
  });
  $id('skin-list').addEventListener('click', e => {
    const buy = e.target.closest('button.buyc');
    const eq = e.target.closest('button.equip');
    if (buy && !buy.disabled) game.buySkin(buy.dataset.id);
    else if (eq) game.equipSkin(eq.dataset.id);
  });
  // 武器/关卡/角色选择
  $id('wp-select').addEventListener('click', e => {
    const c = e.target.closest('.wcard');
    if (c){ Sfx.boxSfx(); game.setWeapon(c.dataset.w); }
  });
  $id('stage-select').addEventListener('click', e => {
    const c = e.target.closest('.scard');
    if (c && !c.classList.contains('lock')){ Sfx.boxSfx(); game.setStage(parseInt(c.dataset.s, 10)); }
  });
  $id('char-select').addEventListener('click', e => {
    const c = e.target.closest('.ccard');
    if (c){ Sfx.boxSfx(); game.setChar(c.dataset.c); }
  });
  // 局内商店
  $id('btn-rs-close').addEventListener('click', () => game.closeRunShop());
  $id('rs-list').addEventListener('click', e => {
    const b = e.target.closest('button.rsbuy');
    if (b && !b.disabled) game.buyRunItem(b.dataset.id);
  });
  $id('btn-resume').addEventListener('click', () => game.resume());
  $id('btn-menu-p').addEventListener('click', () => game.toMenu());
  $id('btn-menu-o').addEventListener('click', () => game.toMenu());
  $id('btn-pause').addEventListener('click', () => game.pause());
  $id('btn-sound').addEventListener('click', () => game.toggleSound());
  $id('btn-music').addEventListener('click', () => { Sfx.toggleMusic(); game.syncToggles(); });
  $id('btn-sfx').addEventListener('click', () => { Sfx.toggleSfx(); game.syncToggles(); });

  // 触屏按键
  function bindHold(el, down, up){
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err){}
      Sfx.unlock();
      down();
    });
    const u = () => up();
    el.addEventListener('pointerup', u);
    el.addEventListener('pointercancel', u);
  }
  bindHold($id('t-jump'), () => Input.jumpDown(), () => Input.jumpUp());
  bindHold($id('t-slide'), () => Input.slideDown(), () => Input.slideUp());
  bindHold($id('t-attack'), () => Input.attackDown(), () => Input.attackUp());
  $id('t-dash').addEventListener('pointerdown', e => {
    e.preventDefault();
    Sfx.unlock();
    Input.q.dash = true;
  });
  $id('t-ult').addEventListener('pointerdown', e => {
    e.preventDefault();
    Sfx.unlock();
    Input.q.ult = true;
  });
  $id('t-skill').addEventListener('pointerdown', e => {
    e.preventDefault();
    Sfx.unlock();
    Input.q.skill = true;
  });

  // 窗口
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('resize', () => { applyForcedLandscape(); });
  addEventListener('orientationchange', () => setTimeout(() => { applyForcedLandscape(); }, 150));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.pause();
  });

  // ---------- 移动端强制横屏：竖屏时整个游戏旋转90°渲染 ----------
  const root = $id('game-root');
  const isMobile = () => window.__mobOverride !== undefined
    ? window.__mobOverride
    : matchMedia('(hover: none) and (pointer: coarse)').matches;

  // 屏幕坐标 → 游戏坐标（旋转模式下反旋映射，供画布触控分区用）
  window.__toGameXY = (cx, cy, rect) => {
    if (root.classList.contains('rot')){
      return [cy - rect.top, rect.right - cx];   // 顺时针90°：gx=↓, gy=←
    }
    return [cx - rect.left, cy - rect.top];
  };

  function applyForcedLandscape(){
    const portrait = window.innerHeight > window.innerWidth;
    if (isMobile() && portrait){
      root.classList.add('rot');
      window.__gameW = window.innerHeight;   // 长边作游戏宽
      window.__gameH = window.innerWidth;
    } else {
      root.classList.remove('rot');
      window.__gameW = undefined;
      window.__gameH = undefined;
    }
    game.resize();
  }
  applyForcedLandscape();

  // 开始游戏时尝试全屏并锁定横屏（安卓生效；微信/iOS 靠旋转渲染兜底）
  async function tryLockLandscape(){
    if (!isMobile()) return;
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen();
    } catch (e){}
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (e){}
    setTimeout(applyForcedLandscape, 100);
  }
  for (const id of ['btn-start', 'btn-daily', 'btn-retry', 'btn-restart-p']){
    $id(id).addEventListener('click', tryLockLandscape);
  }

  // PWA：离线缓存（http/https 环境下注册）
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // 新版本就绪时自动刷新一次，玩家永远拿到最新版
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data === 'inkninja-updated' && document.hidden === false){
        location.reload();
      }
    });
  }

  // 主循环
  let last = performance.now();
  function frame(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
