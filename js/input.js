'use strict';

// 键盘 + 触屏/鼠标输入，边缘触发用队列，持续按住用计数
const Input = {
  q: { jump: false, dash: false, attack: false, skill: false, ult: false, pause: false, start: false },
  _j: 0, _s: 0, _a: 0,
  jumpSet: new Set(),
  slideSet: new Set(),

  get held(){
    return { jump: this._j > 0, slide: this._s > 0, attack: this._a > 0 };
  },

  jumpDown(){ this.q.jump = true; this._j++; },
  jumpUp(){ this._j = Math.max(0, this._j - 1); },
  slideDown(){ this._s++; },
  slideUp(){ this._s = Math.max(0, this._s - 1); },
  attackDown(){ this.q.attack = true; this._a++; },
  attackUp(){ this._a = Math.max(0, this._a - 1); },

  consume(k){ const v = this.q[k]; this.q[k] = false; return v; },
  clearQ(){ this.q.jump = this.q.dash = this.q.attack = this.q.skill = this.q.ult = this.q.pause = this.q.start = false; },

  init(game, canvas){
    const isJumpKey = e => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    const isSlideKey = e => e.code === 'ArrowDown' || e.code === 'KeyS';
    const isDashKey = e => e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK';
    const isAtkKey = e => e.code === 'KeyJ' || e.code === 'KeyX';
    const isUltKey = e => e.code === 'KeyL' || e.code === 'KeyC';
    const isSkillKey = e => e.code === 'KeyE' || e.code === 'KeyQ';

    addEventListener('keydown', e => {
      if (e.repeat) return;
      Sfx.unlock();
      if (isJumpKey(e)){
        Input.jumpDown();
        if (game.state === 'menu' || game.state === 'over') Input.q.start = true;
        e.preventDefault();
      } else if (isSlideKey(e)){
        Input.slideDown(); e.preventDefault();
      } else if (isDashKey(e)){
        Input.q.dash = true;
      } else if (isAtkKey(e)){
        Input.attackDown();
      } else if (isUltKey(e)){
        Input.q.ult = true;
      } else if (isSkillKey(e)){
        Input.q.skill = true;
      } else if (e.code === 'KeyP' || e.code === 'Escape'){
        Input.q.pause = true;
      } else if (e.code === 'KeyM'){
        game.toggleSound();
      } else if (e.code === 'Enter'){
        Input.q.start = true;
      }
    });
    addEventListener('keyup', e => {
      if (isJumpKey(e)) Input.jumpUp();
      else if (isSlideKey(e)) Input.slideUp();
      else if (isAtkKey(e)) Input.attackUp();
    });

    // 画布触控：右半边跳、左半边按住滑铲；菜单/结算时点按即开始
    canvas.addEventListener('pointerdown', e => {
      Sfx.unlock();
      if (game.state === 'menu' || game.state === 'over'){
        Input.q.start = true;
        return;
      }
      if (game.state !== 'playing') return;
      const r = canvas.getBoundingClientRect();
      // 旋转横屏模式下坐标反旋映射
      let gx = e.clientX - r.left;
      const gameW = window.__gameW || r.width;
      if (window.__toGameXY){
        const p = window.__toGameXY(e.clientX, e.clientY, r);
        gx = p[0];
      } else if (gx > r.width * 0.34){
        gx = gameW * 0.7;   // 落在右侧
      }
      if (gx > gameW * 0.34){
        Input.jumpSet.add(e.pointerId);
        Input.jumpDown();
      } else {
        Input.slideSet.add(e.pointerId);
        Input.slideDown();
      }
    });
    const release = e => {
      if (Input.jumpSet.delete(e.pointerId)) Input.jumpUp();
      if (Input.slideSet.delete(e.pointerId)) Input.slideUp();
    };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
  },
};
