'use strict';

// WebAudio 合成音效 + 简单五声音阶背景乐，无外部资源
const Sfx = (() => {
  let ctx = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
  let muted = store.get('mute', false);
  let sfxOn = store.get('sfx', true);
  let musicOn = store.get('music', true);
  let musicTimer = null, step = 0, nextT = 0;

  function ensure(){
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.connect(master);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicOn ? 0.16 : 0;
      musicGain.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e){ return false; }
    return true;
  }

  function unlock(){
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(o){
    if (!ctx || !sfxOn || muted) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0 || 440, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.t);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.25, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t0); osc.stop(t0 + o.t + 0.05);
  }

  function noise(o){
    if (!ctx || !sfxOn || muted) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    let node = src;
    if (o.hp){
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = o.hp;
      node.connect(f); node = f;
    }
    if (o.lp){
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lp;
      node.connect(f); node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
    node.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + o.t + 0.05);
  }

  // ---- 背景乐：五声音阶拨弦 ----
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
  const MELODY = [
    0, null, 2, 3, null, 5, null, 3,
    2, null, 0, null, 2, null, 3, null,
    0, null, 2, 3, null, 5, 6, null,
    5, null, 3, null, 2, null, 0, null,
  ];

  function pluck(freq, when, vol, dec){
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2200;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
    osc.connect(f); f.connect(g); g.connect(musicGain);
    osc.start(when); osc.stop(when + dec + 0.05);
  }

  function schedule(){
    if (!ctx || muted || !musicOn) { nextT = ctx.currentTime + 0.1; return; }
    while (nextT < ctx.currentTime + 0.35){
      const n = MELODY[step % 32];
      if (n !== null) pluck(SCALE[n], nextT, 0.5, 0.5);
      if (step % 8 === 0) pluck(SCALE[0] / 2, nextT, 0.4, 0.7);          // 低音
      if (step % 4 === 2){                                                 // 轻鼓
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, nextT);
        osc.frequency.exponentialRampToValueAtTime(50, nextT + 0.1);
        g.gain.setValueAtTime(0.35, nextT);
        g.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.12);
        osc.connect(g); g.connect(musicGain);
        osc.start(nextT); osc.stop(nextT + 0.15);
      }
      nextT += 0.21;
      step++;
    }
  }

  return {
    unlock,
    get muted(){ return muted; },
    get sfxOn(){ return sfxOn; },
    get musicOn(){ return musicOn; },
    toggleMute(){
      muted = !muted; store.set('mute', muted);
      if (master) master.gain.value = muted ? 0 : 0.5;
      return !muted;
    },
    toggleSfx(){
      sfxOn = !sfxOn; store.set('sfx', sfxOn);
      return sfxOn;
    },
    toggleMusic(){
      musicOn = !musicOn; store.set('music', musicOn);
      if (musicGain) musicGain.gain.value = musicOn ? 0.16 : 0;
      return musicOn;
    },
    startMusic(){
      if (!ensure() || musicTimer) return;
      step = 0; nextT = ctx.currentTime + 0.15;
      musicTimer = setInterval(schedule, 90);
    },
    stopMusic(){
      if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
    },
    jump(){ tone({ type: 'square', f0: 300, f1: 540, t: 0.12, vol: 0.14 }); },
    djump(){
      tone({ type: 'square', f0: 380, f1: 720, t: 0.12, vol: 0.14 });
      tone({ type: 'sine', f0: 760, t: 0.09, vol: 0.1, delay: 0.03 });
    },
    dash(){
      noise({ hp: 900, t: 0.22, vol: 0.2 });
      tone({ type: 'sawtooth', f0: 180, f1: 90, t: 0.2, vol: 0.1 });
    },
    slide(){ noise({ lp: 900, t: 0.16, vol: 0.1 }); },
    land(){
      tone({ type: 'sine', f0: 140, f1: 70, t: 0.07, vol: 0.12 });
      noise({ lp: 500, t: 0.06, vol: 0.08 });
    },
    coin(streak){
      const r = Math.min(8, streak || 0);
      const f = 780 * Math.pow(1.05946, r);
      tone({ type: 'triangle', f0: f, t: 0.14, vol: 0.2 });
      tone({ type: 'triangle', f0: f * 1.5, t: 0.11, vol: 0.1, delay: 0.03 });
    },
    hit(){
      noise({ lp: 1200, t: 0.25, vol: 0.4 });
      tone({ type: 'square', f0: 160, f1: 55, t: 0.3, vol: 0.3 });
    },
    shieldPop(){
      tone({ type: 'sine', f0: 620, f1: 300, t: 0.14, vol: 0.22 });
      tone({ type: 'triangle', f0: 930, t: 0.1, vol: 0.12, delay: 0.04 });
    },
    power(){
      [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, t: 0.16, vol: 0.16, delay: i * 0.07 }));
    },
    heart(){
      tone({ type: 'sine', f0: 523, t: 0.18, vol: 0.18 });
      tone({ type: 'sine', f0: 659, t: 0.24, vol: 0.18, delay: 0.09 });
    },
    arrow(){ noise({ hp: 2000, t: 0.15, vol: 0.1 }); tone({ type: 'sawtooth', f0: 900, f1: 320, t: 0.14, vol: 0.06 }); },
    slash(){
      noise({ hp: 1400, t: 0.13, vol: 0.18 });
      tone({ type: 'square', f0: 520, f1: 210, t: 0.1, vol: 0.08 });
    },
    throwKunai(){
      tone({ type: 'sawtooth', f0: 740, f1: 420, t: 0.08, vol: 0.1 });
      noise({ hp: 2500, t: 0.06, vol: 0.07 });
    },
    hitEnemy(){
      tone({ type: 'square', f0: 210, f1: 90, t: 0.12, vol: 0.2 });
      noise({ lp: 900, t: 0.08, vol: 0.14 });
    },
    enemyDie(){
      tone({ type: 'triangle', f0: 330, f1: 75, t: 0.26, vol: 0.22 });
      noise({ t: 0.2, vol: 0.16, lp: 1800 });
    },
    soul(){
      tone({ type: 'sine', f0: 660, t: 0.12, vol: 0.12 });
      tone({ type: 'sine', f0: 990, t: 0.1, vol: 0.09, delay: 0.05 });
    },
    levelup(){
      [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, t: 0.18, vol: 0.16, delay: i * 0.08 }));
    },
    bossRoar(){
      tone({ type: 'sawtooth', f0: 95, f1: 48, t: 0.65, vol: 0.3 });
      noise({ lp: 420, t: 0.55, vol: 0.28 });
    },
    bossDie(){
      noise({ t: 0.8, vol: 0.32, lp: 2200 });
      tone({ type: 'sawtooth', f0: 200, f1: 45, t: 0.9, vol: 0.24 });
      tone({ type: 'square', f0: 400, f1: 120, t: 0.5, vol: 0.12, delay: 0.12 });
    },
    boxSfx(){
      tone({ type: 'triangle', f0: 440, f1: 660, t: 0.12, vol: 0.16 });
      tone({ type: 'triangle', f0: 880, t: 0.1, vol: 0.1, delay: 0.06 });
    },
    ultCharge(){
      tone({ type: 'sawtooth', f0: 180, f1: 640, t: 0.45, vol: 0.18 });
      tone({ type: 'sine', f0: 90, f1: 260, t: 0.45, vol: 0.14 });
    },
    ultRelease(){
      noise({ hp: 600, t: 0.5, vol: 0.35 });
      tone({ type: 'sawtooth', f0: 420, f1: 80, t: 0.5, vol: 0.28 });
      tone({ type: 'square', f0: 900, f1: 200, t: 0.3, vol: 0.14, delay: 0.05 });
    },
    buy(){
      tone({ type: 'triangle', f0: 660, t: 0.09, vol: 0.18 });
      tone({ type: 'triangle', f0: 990, t: 0.12, vol: 0.14, delay: 0.07 });
    },
    deny(){
      tone({ type: 'square', f0: 130, t: 0.16, vol: 0.16 });
      tone({ type: 'square', f0: 110, t: 0.16, vol: 0.13, delay: 0.1 });
    },
    thump(){
      tone({ type: 'sine', f0: 78, f1: 46, t: 0.16, vol: 0.22 });
    },
    death(){
      tone({ type: 'sawtooth', f0: 220, f1: 60, t: 0.6, vol: 0.25 });
      noise({ t: 0.5, vol: 0.25, lp: 2500 });
      tone({ type: 'square', f0: 110, f1: 40, t: 0.7, vol: 0.16, delay: 0.1 });
    },
  };
})();
