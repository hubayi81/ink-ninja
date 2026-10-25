'use strict';

// 关卡模板：build(g, x) 在世界坐标 x 处放置实体，返回占位宽度
// 随机一律走 g.rnd / g.rint / g.rng —— 普通局为随机种子，每日挑战为当日固定种子
const Chunks = [
  { // 0：小地刺 + 铜钱弧
    tier: 0, w: 6,
    build(g, x){
      const n = g.rint(2, 3);
      g.obstacle('spikes', x, { n });
      g.coinArc(x + n * 18, 120, n * 36 + 50);
      return n * 36;
    }
  },
  { // 1：直线铜钱（喘息段）
    tier: 0, w: 3,
    build(g, x){
      for (let i = 0; i < 7; i++) g.coin(x + i * 46, 66);
      return 7 * 46;
    }
  },
  { // 2：铜钱拱
    tier: 0, w: 2,
    build(g, x){
      g.coinArc(x + 80, 100, 160);
      return 160;
    }
  },
  { // 3：长地刺 + 高弧钱（奖励二段跳）
    tier: 1, w: 4,
    build(g, x){
      const n = g.rint(5, 6);
      g.obstacle('spikes', x, { n });
      g.coinArc(x + n * 18, 200, n * 36 + 60);
      return n * 36;
    }
  },
  { // 4：血幅（滑铲钻过）
    tier: 1, w: 4,
    build(g, x){
      g.obstacle('banner', x);
      for (let i = 0; i < 4; i++) g.coin(x - 24 + i * 34, 36);
      return 70;
    }
  },
  { // 5：矮石碑
    tier: 1, w: 3,
    build(g, x){
      g.obstacle('wall', x, { h: 135 });
      g.coinArc(x + 19, 190, 120);
      return 38;
    }
  },
  { // 6：板车
    tier: 1, w: 3,
    build(g, x){
      g.obstacle('cart', x);
      g.coinArc(x + 61, 135, 150);
      return 122;
    }
  },
  { // 7：道具
    tier: 1, w: 2,
    build(g, x){
      const r = g.rnd(0, 1);
      const type = r < 0.42 ? 'shield' : r < 0.84 ? 'magnet' : 'heart';
      g.powerup(type, x, 108);
      return 44;
    }
  },
  { // 8：高石碑（需二段跳）
    tier: 2, w: 3,
    build(g, x){
      g.obstacle('wall', x, { h: 195 });
      g.coinArc(x + 19, 255, 140);
      return 38;
    }
  },
  { // 9：箭雨·低（跳过）
    tier: 2, w: 4,
    build(g, x){
      g.obstacle('arrowVolley', x, { oy: 34, count: 3 });
      g.coin(x - 120, 70); g.coin(x - 74, 70);
      return 60;
    }
  },
  { // 10：箭雨·中（滑铲或跳）
    tier: 2, w: 3,
    build(g, x){
      g.obstacle('arrowVolley', x, { oy: 66, count: 3 });
      return 60;
    }
  },
  { // 11：乌鸦
    tier: 2, w: 3,
    build(g, x){
      g.obstacle('crow', x);
      return 46;
    }
  },
  { // 12：鸟居（装饰 + 穿门铜钱）
    tier: 2, w: 2,
    build(g, x){
      g.decor('torii', x);
      g.coinArc(x + 66, 105, 190);
      return 150;
    }
  },
  { // 13：滚石
    tier: 3, w: 3,
    build(g, x){
      g.obstacle('boulder', x);
      g.coinArc(x + 44, 175, 150);
      return 60;
    }
  },
  { // 14：连招：地刺 → 血幅
    tier: 3, w: 4,
    build(g, x){
      const n = g.rint(2, 3);
      g.obstacle('spikes', x, { n });
      const bx = x + n * 36 + g.speed * 0.72;
      g.obstacle('banner', bx);
      g.coinArc(x + n * 18, 120, n * 36 + 50);
      for (let i = 0; i < 3; i++) g.coin(bx - 20 + i * 32, 36);
      return bx - x + 70;
    }
  },
  { // 15：箭雨风暴
    tier: 3, w: 3,
    build(g, x){
      g.obstacle('arrowVolley', x, { oy: 54, count: 5 });
      return 60;
    }
  },
  { // 16：双鸦
    tier: 3, w: 3,
    build(g, x){
      g.obstacle('crow', x);
      g.obstacle('crow', x + 185);
      g.coin(x + 92, 120);
      return 235;
    }
  },
  { // 17：滚石 + 地刺
    tier: 3, w: 2,
    build(g, x){
      g.obstacle('boulder', x);
      g.obstacle('spikes', x + 300, { n: 2 });
      g.coinArc(x + 44, 175, 150);
      return 380;
    }
  },
  { // 18：浪人（可击杀）
    tier: 1, w: 3,
    build(g, x){
      g.monster('ronin', x);
      for (let i = 0; i < 3; i++) g.coin(x + 60 + i * 40, 70);
      return 60;
    }
  },
  { // 19：弓手（远程放箭）
    tier: 1, w: 2,
    build(g, x){
      g.monster('archer', x);
      g.coin(x - 70, 70);
      return 60;
    }
  },
  { // 20：双浪人
    tier: 2, w: 3,
    build(g, x){
      g.monster('ronin', x);
      g.monster('ronin', x + 170);
      g.coinArc(x + 85, 120, 150);
      return 240;
    }
  },
  { // 21：弓手 + 浪人组合
    tier: 2, w: 3,
    build(g, x){
      g.monster('archer', x);
      g.monster('ronin', x + 220);
      return 290;
    }
  },
  { // 22：鬼火（飞行）
    tier: 2, w: 2,
    build(g, x){
      g.monster('wisp', x, { y: 110 });
      g.coin(x + 80, 120);
      return 60;
    }
  },
  { // 23：忍具匣（换武器）
    tier: 2, w: 1,
    build(g, x){
      g.powerup('box', x, 105);
      return 44;
    }
  },
  { // 24：鬼火三连
    tier: 3, w: 3,
    build(g, x){
      g.monster('wisp', x, { y: 150 });
      g.monster('wisp', x + 120, { y: 90 });
      g.monster('wisp', x + 240, { y: 130 });
      return 300;
    }
  },
  { // 25：怪军压境：浪人+弓手+鬼火
    tier: 3, w: 3,
    build(g, x){
      g.monster('wisp', x, { y: 150 });
      g.monster('archer', x + 150);
      g.monster('ronin', x + 340);
      return 420;
    }
  },
];

function pickChunkFor(tier, forced, rng){
  if (forced !== undefined && forced !== null) return Chunks[forced];
  const pool = Chunks.filter(c => c.tier <= tier);
  let total = 0;
  for (const c of pool) total += c.w;
  let r = rng() * total;
  for (const c of pool){
    r -= c.w;
    if (r <= 0) return c;
  }
  return pool[0];
}
