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
  addEventListener('resize', () => game.resize());
  addEventListener('orientationchange', () => setTimeout(() => game.resize(), 150));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.pause();
  });

  // PWA：离线缓存（http/https 环境下注册）
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js').catch(() => {});
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
