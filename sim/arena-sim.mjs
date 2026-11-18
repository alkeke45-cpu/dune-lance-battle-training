// ../engine/src/fixed.ts
var FP_SHIFT = 16;
var FP = 1 << FP_SHIFT;
var FP_MASK = FP - 1;
var fx = (n) => Math.round(n * FP);
var toFloat = (a) => a / FP;
var fxMul = (a, b) => Math.trunc(a * b / FP);
var fxDiv = (a, b) => Math.trunc(a * FP / b);
var fxFloor = (a) => a >> FP_SHIFT;
var fxAbs = (a) => a < 0 ? -a : a;
var fxClamp = (a, lo, hi) => a < lo ? lo : a > hi ? hi : a;
function isqrt(n) {
  if (n <= 0)
    return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n)
    x--;
  while ((x + 1) * (x + 1) <= n)
    x++;
  return x;
}
var fxSqrt = (a) => isqrt(a * FP);
var ANG_BITS = 12;
var ANG_FULL = 1 << ANG_BITS;
var ANG_MASK = ANG_FULL - 1;
var angNorm = (a) => a & ANG_MASK;
function angDiff(a, b) {
  let d = b - a & ANG_MASK;
  if (d > ANG_FULL / 2)
    d -= ANG_FULL;
  return d;
}
var SIN = (() => {
  const t = new Int32Array(ANG_FULL);
  for (let i = 0;i < ANG_FULL; i++)
    t[i] = Math.round(Math.sin(i / ANG_FULL * Math.PI * 2) * FP);
  return t;
})();
var fxSin = (ang) => SIN[ang & ANG_MASK];
var fxCos = (ang) => SIN[ang + ANG_FULL / 4 & ANG_MASK];
function fxAtan2(y, x) {
  if (x === 0 && y === 0)
    return 0;
  const ax = fxAbs(x), ay = fxAbs(y);
  const swap = ay > ax;
  const r = swap ? fxDiv(ax, ay) : fxDiv(ay, ax);
  const idx = r >> 8;
  let a = ATAN[idx];
  if (swap)
    a = ANG_FULL / 4 - a;
  if (x < 0)
    a = ANG_FULL / 2 - a;
  if (y < 0)
    a = -a;
  return angNorm(a);
}
var ATAN = (() => {
  const t = new Int32Array(257);
  for (let i = 0;i <= 256; i++)
    t[i] = Math.round(Math.atan(i / 256) / (Math.PI * 2) * ANG_FULL);
  return t;
})();
var fxLen = (x, y) => {
  const ax = fxAbs(x), ay = fxAbs(y);
  if (ax === 0 && ay === 0)
    return 0;
  const m = Math.max(ax, ay);
  const s = m > 1 << 20 ? 8 : 0;
  const sx = ax >> s, sy = ay >> s;
  return isqrt(sx * sx + sy * sy) << s;
};
// ../engine/src/rng.ts
class Rng {
  s = new Uint32Array(4);
  constructor(seed) {
    let h = typeof seed === "string" ? hashStr(seed) : seed >>> 0;
    for (let i = 0;i < 4; i++) {
      h = h + 2654435769 >>> 0;
      let z = h;
      z = Math.imul(z ^ z >>> 16, 2246822507) >>> 0;
      z = Math.imul(z ^ z >>> 13, 3266489909) >>> 0;
      this.s[i] = (z ^ z >>> 16) >>> 0;
    }
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0)
      this.s[0] = 1;
  }
  next() {
    const s = this.s;
    const r = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = s[1] << 9 >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return r;
  }
  int(n) {
    return n <= 0 ? 0 : this.next() % n;
  }
  range(lo, hi) {
    return lo + this.int(hi - lo + 1);
  }
  fx() {
    return this.next() >>> 16;
  }
  fork(label) {
    return new Rng((this.next() ^ hashStr(label)) >>> 0);
  }
}
var rotl = (x, k) => (x << k | x >>> 32 - k) >>> 0;
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0;i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
// ../engine/src/urban.ts
var URBAN = {
  ground: [58, 74],
  low: [16, 22],
  mid: [34, 46],
  tower: [104, 124],
  wreck: [8, 10],
  barrier: [6, 7],
  monument: 14,
  pylon: 150,
  spawnYard: { halfX: 5, halfY: 7 }
};
var LOT = 0;
var STREET = 1;
var PLAZA = 2;
var PARK = 3;
var WATER = 4;
var YARD = 5;
var BRIDGE_ST = 6;
var FORD = 7;
var DECK = 8;
var OPEN = 9;
var CLIFF = 10;
var KEEP = 11;
var sq = (v) => v * v;
function generateUrban(seed, params) {
  const { width: w, height: h } = params, N = w * h;
  const family = params.urbanFamily ?? "city";
  const rng = new Rng(seed).fork(`urban:${family}`);
  const W = { w, h, rng, terrain: new Uint8Array(N), heights: new Uint8Array(N), ground: new Uint8Array(N), kind: new Uint8Array(N), roofs: new Map, lot: new Uint16Array(N), lotIds: new Map, lotKinds: ["low"] };
  const gSeed = rng.next();
  for (let y = 0;y < h; y++)
    for (let x = 0;x < w; x++) {
      const i = y * w + x, j = twin(W, i);
      if (j < i)
        continue;
      const n = fbm(gSeed, x << FP_SHIFT, y << FP_SHIFT, 40, 3) + fbm(gSeed, w - 1 - x << FP_SHIFT, h - 1 - y << FP_SHIFT, 40, 3) >> 1;
      const g = URBAN.ground[0] + (n * (URBAN.ground[1] - URBAN.ground[0]) >> FP_SHIFT);
      W.ground[i] = g;
      W.ground[j] = g;
    }
  const sites = [];
  const spawnX = rng.range(20, 24);
  let spawns = [[spawnX, h / 2], [w - 1 - spawnX, h / 2 - 1]];
  if (family === "bridge")
    spawns = buildBridge(W, sites, params.urbanFord, params.urbanSpanWeight ?? 3);
  else
    buildCity(W, spawns, sites);
  finish(W);
  if (!reachable(W.terrain, w, h, spawns[0], spawns[1])) {
    for (let x = 0;x < w; x++)
      for (const y of [h / 2 - 1, h / 2]) {
        const i = y * w + x;
        if (W.terrain[i] === 8 /* Building */ || W.terrain[i] === 4 /* Rock */)
          setTile(W, i, 5 /* Road */, W.ground[i]);
        else if (W.terrain[i] === 2 /* Water */)
          setTile(W, i, 3 /* Ford */, W.ground[i]);
      }
  }
  let hash = 2166136261 >>> 0;
  for (let i = 0;i < N; i++) {
    hash ^= W.heights[i];
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= W.terrain[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hashStr(`${spawns[0]}|${spawns[1]}`);
  hash = Math.imul(hash ^ hashStr(`urban:${family}`), 16777619) >>> 0;
  return { seed, width: w, height: h, heights: W.heights, terrain: W.terrain, fog: new Uint8Array(N), spawns, hash: hash >>> 0, grammar: "urban", family, ground: W.ground, sites, lots: W.lot, lotKinds: W.lotKinds, ...W.bridge ? { bridge: W.bridge } : {} };
}
var twin = (W, i) => {
  const x = i % W.w, y = (i - x) / W.w;
  return (W.h - 1 - y) * W.w + (W.w - 1 - x);
};
var inside = (W, x, y) => x >= 0 && y >= 0 && x < W.w && y < W.h;
function paintKind(W, x, y, k) {
  if (!inside(W, x, y))
    return;
  const i = y * W.w + x;
  W.kind[i] = k;
  W.kind[twin(W, i)] = k;
}
function setTile(W, i, t, height) {
  const c = height < 0 ? 0 : height > HEIGHT_MAX ? HEIGHT_MAX : height;
  const j = twin(W, i);
  W.terrain[i] = t;
  W.terrain[j] = t;
  W.heights[i] = c;
  W.heights[j] = c;
}
function paintRect(W, x0, y0, x1, y1, k) {
  for (let y = Math.min(y0, y1);y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1);x <= Math.max(x0, x1); x++)
      paintKind(W, x, y, k);
}
function paintDisc(W, cx, cy, r, k, over) {
  for (let y = cy - r;y <= cy + r; y++)
    for (let x = cx - r;x <= cx + r; x++) {
      if (!inside(W, x, y) || sq(2 * (x - cx) + 1) + sq(2 * (y - cy) + 1) > sq(2 * r + 1))
        continue;
      if (over && !over(W.kind[y * W.w + x]))
        continue;
      paintKind(W, x, y, k);
    }
}
function paintLine(W, x0, y0, x1, y1, wd, k, over) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  const lo = -(wd - 1 >> 1), hi = wd >> 1;
  for (;; ) {
    for (let a = lo;a <= hi; a++)
      for (let b = lo;b <= hi; b++) {
        const px = x + a, py = y + b;
        if (!inside(W, px, py) || over && !over(W.kind[py * W.w + px]))
          continue;
        paintKind(W, px, py, k);
      }
    if (x === x1 && y === y1)
      break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
function buildCity(W, spawns, sites) {
  const { w, h, rng } = W;
  const cx = w / 2, cy = h / 2;
  W.kind.fill(LOT);
  const vx = gridLines(rng, w), hy = gridLines(rng, h);
  for (const s of vx)
    paintRect(W, s.at, 0, s.at + s.wd - 1, h - 1, STREET);
  for (const s of hy)
    paintRect(W, 0, s.at, w - 1, s.at + s.wd - 1, STREET);
  const xs = [0, ...vx.map((s) => s.at + s.wd), w], ys = [0, ...hy.map((s) => s.at + s.wd), h];
  for (let a = 0;a < vx.length; a++)
    for (let b = 0;b + 1 < ys.length; b++) {
      if (rng.int(100) >= 14)
        continue;
      const s = vx[a], y0 = ys[b], y1 = (hy[b]?.at ?? h) - 1;
      if (y1 - y0 < 4 || y0 <= cy + 4 && y1 >= cy - 5)
        continue;
      paintRect(W, s.at, y0, s.at + s.wd - 1, y1, LOT);
    }
  for (let b = 0;b < hy.length; b++)
    for (let a = 0;a + 1 < xs.length; a++) {
      if (rng.int(100) >= 14)
        continue;
      const s = hy[b], x0 = xs[a], x1 = (vx[a]?.at ?? w) - 1;
      if (x1 - x0 < 4 || Math.abs(s.at - cy) < 6)
        continue;
      paintRect(W, x0, s.at, x1, s.at + s.wd - 1, LOT);
    }
  const pairs = 1 + rng.int(2);
  const corners = [[cx - 40, cy - 34], [cx - 40, cy + 33]];
  const order = rng.int(2);
  for (let p = 0;p < pairs; p++) {
    const [x0, y0] = corners[(p + order) % 2];
    paintLine(W, x0 + rng.range(-3, 3), y0 + rng.range(-3, 3), cx, cy, 3, STREET);
  }
  const R = rng.range(9, 11);
  paintDisc(W, cx, cy, R, PLAZA);
  sites.push({ x: cx, y: cy, kind: "centre" });
  const want = 1 + rng.int(2);
  const crossings = [];
  for (const s of vx)
    for (const t of hy)
      crossings.push([s.at + (s.wd >> 1), t.at + (t.wd >> 1)]);
  shuffle(rng, crossings);
  const plazas = [];
  for (const [px, py] of crossings) {
    if (plazas.length >= want)
      break;
    if (py >= cy)
      continue;
    const d2 = sq(px - cx) + sq(py - cy);
    if (d2 < sq(24) || d2 > sq(42))
      continue;
    if (spawns.some(([sx, sy]) => sq(px - sx) + sq(py - sy) < sq(18)))
      continue;
    if (plazas.some(([qx, qy]) => sq(qx - px) + sq(qy - py) < sq(20) || sq(w - 1 - qx - px) + sq(h - 1 - qy - py) < sq(20)))
      continue;
    plazas.push([px, py]);
    paintDisc(W, px, py, rng.range(5, 7), PLAZA);
    sites.push({ x: px, y: py, kind: "plaza" });
  }
  const parks = 1 + rng.int(2);
  for (let k = 0, tries = 0;k < parks && tries < 60; tries++) {
    const px = rng.range(10, w - 11), py = rng.range(10, cy - 8);
    const d2 = sq(px - cx) + sq(py - cy);
    if (d2 < sq(18) || W.kind[py * w + px] !== LOT)
      continue;
    if (spawns.some(([sx, sy]) => sq(px - sx) + sq(py - sy) < sq(14)))
      continue;
    floodKind(W, px, py, LOT, PARK, 140);
    k++;
  }
  if (rng.int(100) < 35) {
    const off = rng.range(18, 24);
    const x0 = cx - off - 1;
    const cSeed = rng.next();
    for (let y = 0;y < h; y++) {
      const m = (fbm(cSeed, 0, y << FP_SHIFT, 24, 2) * 5 >> FP_SHIFT) - 2;
      for (let x = x0 + m;x < x0 + m + 3; x++) {
        const k = W.kind[y * w + x];
        if (k === PLAZA)
          continue;
        paintKind(W, x, y, k === STREET ? BRIDGE_ST : WATER);
      }
    }
    const fy = rng.range(18, 30);
    for (let y = fy;y < fy + 3; y++)
      for (let x = x0 - 3;x < x0 + 6; x++)
        if (W.kind[y * w + x] === WATER)
          paintKind(W, x, y, FORD);
  }
  {
    const [sx, sy] = spawns[0];
    const yx1 = sx + URBAN.spawnYard.halfX;
    paintRect(W, sx - URBAN.spawnYard.halfX, sy - URBAN.spawnYard.halfY, yx1, sy + URBAN.spawnYard.halfY, YARD);
    let ex = yx1 + 1;
    while (ex < cx && W.kind[sy * w + ex] !== STREET && W.kind[sy * w + ex] !== PLAZA)
      ex++;
    paintRect(W, yx1 + 1, sy - 1, ex - 1, sy, STREET);
  }
  raiseBlocks(W, [{ x: cx, y: cy, r: 30, tower: 22 }], 5);
}
function gridLines(rng, n) {
  const out = [];
  let at = rng.range(3, 6);
  while (true) {
    const wd = rng.int(5) === 0 ? 4 : rng.range(2, 3);
    if (at + wd > n / 2 - 2)
      break;
    out.push({ at, wd });
    at += wd + rng.range(8, 13);
  }
  const mirrored = out.map((s) => ({ at: n - s.at - s.wd, wd: s.wd }));
  return [...out, ...mirrored.reverse()];
}
function shuffle(rng, a) {
  for (let i = a.length - 1;i > 0; i--) {
    const j = rng.int(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}
function floodKind(W, x0, y0, from, to, max) {
  const q = [y0 * W.w + x0];
  const seen = new Set(q);
  for (let qi = 0;qi < q.length && qi < max; qi++) {
    const i = q[qi], x = i % W.w, y = (i - x) / W.w;
    paintKind(W, x, y, to);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inside(W, nx, ny))
        continue;
      const j = ny * W.w + nx;
      if (seen.has(j) || W.kind[j] !== from)
        continue;
      seen.add(j);
      q.push(j);
    }
  }
}
function raiseBlocks(W, hot, towerElse) {
  const { w, h, rng } = W;
  const region = new Int32Array(w * h).fill(-1);
  let next = 0;
  for (let i = 0;i < w * h; i++) {
    if (W.kind[i] !== LOT || region[i] >= 0)
      continue;
    const tiles = [i];
    region[i] = next;
    for (let qi = 0;qi < tiles.length; qi++) {
      const t = tiles[qi], x = t % w, y = (t - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inside(W, nx, ny))
          continue;
        const j = ny * w + nx;
        if (W.kind[j] !== LOT || region[j] >= 0)
          continue;
        region[j] = next;
        tiles.push(j);
      }
    }
    const id = next++;
    if (region[twin(W, i)] === id) {
      for (const t of tiles)
        paintKind(W, t % w, (t - t % w) / w, OPEN);
      continue;
    }
    raiseBlock(W, tiles, hot, towerElse);
  }
}
function raiseBlock(W, tiles, hot, towerElse) {
  const { w, rng } = W;
  let x0 = w, y0 = W.h, x1 = -1, y1 = -1;
  for (const t of tiles) {
    const x = t % w, y = (t - x) / w;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const inBlock = new Set(tiles);
  if (tiles.length < 6) {
    for (const t of tiles)
      markBuilding(W, t, "low", tiles[0]);
    return;
  }
  const lots = [];
  const split = (ax, ay, bx, by, depth) => {
    const ww = bx - ax + 1, hh = by - ay + 1;
    if (ww <= 9 && hh <= 9 || depth > 6) {
      lots.push([ax, ay, bx, by]);
      return;
    }
    const alley = Math.max(ww, hh) >= 14 && rng.int(100) < 30 ? 2 : 0;
    if (ww >= hh) {
      const m = ax + 4 + rng.int(Math.max(1, ww - 8 - alley));
      split(ax, ay, m - 1, by, depth + 1);
      for (let y = ay;y <= by; y++)
        for (let x = m;x < m + alley; x++)
          if (inBlock.has(y * w + x))
            paintKind(W, x, y, STREET);
      split(m + alley, ay, bx, by, depth + 1);
    } else {
      const m = ay + 4 + rng.int(Math.max(1, hh - 8 - alley));
      split(ax, ay, bx, m - 1, depth + 1);
      for (let y = m;y < m + alley; y++)
        for (let x = ax;x <= bx; x++)
          if (inBlock.has(y * w + x))
            paintKind(W, x, y, STREET);
      split(ax, m + alley, bx, by, depth + 1);
    }
  };
  split(x0, y0, x1, y1, 0);
  for (const [ax, ay, bx, by] of lots) {
    const mx = ax + bx >> 1, my = ay + by >> 1;
    let towerP = towerElse;
    for (const q of hot) {
      const d2 = Math.min(sq(mx - q.x) + sq(my - q.y), sq(W.w - 1 - mx - q.x) + sq(W.h - 1 - my - q.y));
      if (d2 < sq(q.r))
        towerP = Math.max(towerP, q.tower);
    }
    const r = rng.int(100);
    const cls = r < towerP ? "tower" : r < 62 ? "mid" : "low";
    const yard = bx - ax >= 7 && by - ay >= 7 && rng.int(100) < 30;
    for (let y = ay;y <= by; y++)
      for (let x = ax;x <= bx; x++) {
        const i = y * w + x;
        if (!inBlock.has(i) || W.kind[i] !== LOT)
          continue;
        const ring = x - ax < 2 || bx - x < 2 || y - ay < 2 || by - y < 2;
        const gate = yard && y - ay < 2 && (x === mx || x === mx + 1);
        if (yard && (!ring || gate)) {
          paintKind(W, x, y, OPEN);
          continue;
        }
        markBuilding(W, i, cls, ax * 131 + ay);
      }
  }
}
function markBuilding(W, i, cls, lot) {
  const key = `${cls}:${lot}`;
  let add = W.roofs.get(key);
  if (add === undefined) {
    const band = URBAN[cls];
    add = band[0] + W.rng.int(band[1] - band[0] + 1);
    W.roofs.set(key, add);
  }
  W.kind[i] = KEEP;
  W.kind[twin(W, i)] = KEEP;
  setTile(W, i, 8 /* Building */, W.ground[i] + add);
  const id = lotId(W, key, cls);
  W.lot[i] = id;
  W.lot[twin(W, i)] = id + 1;
}
function lotId(W, key, cls) {
  let id = W.lotIds.get(key);
  if (id === undefined) {
    id = W.lotKinds.length;
    W.lotKinds.push(cls, cls);
    W.lotIds.set(key, id);
  }
  return id;
}
function buildBridge(W, sites, fordOverride, spanWeight) {
  const { w, h, rng } = W;
  const cx = w / 2, cy = h / 2;
  W.kind.fill(LOT);
  const ANGLES = [0, 0, 171, -171, 341, -341, 512, -512];
  const ang = ANGLES[rng.int(ANGLES.length)];
  const gx = fxSin(ang), gy = fxCos(ang);
  const nx = gy, ny = -gx;
  const G = rng.range(24, 34);
  const mSeed = rng.next();
  const along = (rx, ry) => Math.trunc((rx * gx + ry * gy) / FP);
  const across = (rx, ry) => Math.trunc((rx * nx + ry * ny) / FP);
  const meander = (s2) => {
    const a = fbm(mSeed, s2 + 600 << FP_SHIFT - 1, 0, 22, 2), b = fbm(mSeed, -s2 + 600 << FP_SHIFT - 1, 0, 22, 2);
    const f = Math.trunc((a - b) * 12 / FP);
    const k = Math.min(Math.abs(s2), 20);
    return Math.trunc(f * k / 20);
  };
  const rel = (i) => {
    const x = i % w, y = (i - x) / w;
    return [2 * x + 1 - w, 2 * y + 1 - h];
  };
  const deck = [];
  for (let i = 0;i < w * h; i++) {
    const [rx, ry] = rel(i);
    const s2 = along(rx, ry), d2 = across(rx, ry);
    const e2 = Math.abs(d2 - meander(s2));
    if (Math.abs(s2) < 8 && Math.abs(d2) < G + 8) {
      W.kind[i] = DECK;
      deck.push({ i, s2, d2 });
      continue;
    }
    W.kind[i] = e2 < G - 4 ? WATER : e2 < G ? CLIFF : e2 < G + 4 ? STREET : LOT;
  }
  sites.push({ x: cx, y: cy, kind: "centre", weight: spanWeight });
  const D = 44, o = rng.range(-18, 18);
  const sx = Math.max(8, Math.min(w - 9, Math.round(cx - 0.5 + (-D * nx + o * gx) / FP)));
  const sy = Math.max(10, Math.min(h - 11, Math.round(cy - 0.5 + (-D * ny + o * gy) / FP)));
  const spawns = [[sx, sy], [w - 1 - sx, h - 1 - sy]];
  const onLand = (k) => k === LOT || k === STREET;
  const vx = gridLines(rng, w), hy = gridLines(rng, h);
  for (const l of vx)
    for (let y = 0;y < h; y++)
      for (let x = l.at;x < l.at + l.wd; x++)
        if (W.kind[y * w + x] === LOT)
          paintKind(W, x, y, STREET);
  for (const l of hy)
    for (let x = 0;x < w; x++)
      for (let y = l.at;y < l.at + l.wd; y++)
        if (W.kind[y * w + x] === LOT)
          paintKind(W, x, y, STREET);
  const endX = Math.round(cx - 0.5 - (G / 2 + 4) * nx / FP), endY = Math.round(cy - 0.5 - (G / 2 + 4) * ny / FP);
  paintLine(W, sx, sy, endX, endY, 5, STREET, onLand);
  const side = rng.int(2) === 0 ? 1 : -1;
  const bx = Math.round(cx - 0.5 - ((G / 2 + 10) * nx - side * 10 * gx) / FP), by = Math.round(cy - 0.5 - ((G / 2 + 10) * ny - side * 10 * gy) / FP);
  paintDisc(W, bx, by, 6, PLAZA, onLand);
  sites.push({ x: bx, y: by, kind: "bridgehead", weight: 1 });
  for (let k = 0, tries = 0;k < 1 && tries < 80; tries++) {
    const px = rng.range(8, w - 9), py = rng.range(8, h - 9);
    if (W.kind[py * w + px] !== LOT)
      continue;
    if (sq(px - cx) + sq(py - cy) < sq(34) || sq(px - sx) + sq(py - sy) < sq(14) || sq(w - 1 - px - sx) + sq(h - 1 - py - sy) < sq(14))
      continue;
    floodKind(W, px, py, LOT, PARK, 160);
    k++;
  }
  const ford = fordOverride ?? rng.int(2) === 0;
  if (ford) {
    const s0 = (rng.int(2) === 0 ? 1 : -1) * rng.range(56, 84);
    for (let i = 0;i < w * h; i++) {
      const k = W.kind[i];
      if (k !== WATER && k !== CLIFF)
        continue;
      const [rx, ry] = rel(i);
      if (Math.abs(along(rx, ry) - s0) < 3)
        paintKind(W, i % w, (i - i % w) / w, FORD);
    }
  }
  paintRect(W, sx - URBAN.spawnYard.halfX, sy - URBAN.spawnYard.halfY, sx + URBAN.spawnYard.halfX, sy + URBAN.spawnYard.halfY, YARD);
  raiseBlocks(W, [{ x: endX, y: endY, r: 24, tower: 38 }], 6);
  let deckBase = 0;
  for (const t of deck)
    deckBase = Math.max(deckBase, W.ground[t.i]);
  for (const t of deck)
    W.ground[t.i] = deckBase;
  W.bridge = { ang, gorgeHalf: G / 2, deckHalfLen: G / 2 + 4, deckHalfWidth: 4, pylonAt: G / 4, deckY: deckBase };
  const open = (i) => W.kind[i] === DECK;
  const lanesNow = () => {
    const lanes = new Map;
    for (const t of deck)
      if (open(t.i))
        lanes.set(t.d2 >> 1, (lanes.get(t.d2 >> 1) ?? 0) + 1);
    return lanes;
  };
  let base = new Map;
  const deckOk = () => {
    const lanes = lanesNow();
    for (const t of deck)
      if ((lanes.get(t.d2 >> 1) ?? 0) < Math.min(4, base.get(t.d2 >> 1) ?? 0))
        return false;
    const inDeck = new Set(deck.filter((t) => open(t.i)).map((t) => t.i));
    const start = deck.filter((t) => open(t.i)).reduce((a, b) => b.d2 < a.d2 ? b : a);
    const seen = new Set([start.i]), q = [start.i];
    for (let qi = 0;qi < q.length; qi++) {
      const i = q[qi], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
        if (j >= 0 && inDeck.has(j) && !seen.has(j)) {
          seen.add(j);
          q.push(j);
        }
    }
    return seen.size === inDeck.size;
  };
  const place = (cells, cls, key) => {
    if (cells.some((i) => !open(i)))
      return false;
    for (const i of cells)
      markBuilding(W, i, cls, key);
    if (deckOk())
      return true;
    for (const i of cells) {
      W.kind[i] = DECK;
      W.kind[twin(W, i)] = DECK;
      W.lot[i] = 0;
      W.lot[twin(W, i)] = 0;
      setTile(W, i, 5 /* Road */, deckBase);
    }
    return false;
  };
  const q2 = -(G >> 1);
  const legs = deck.filter((t) => Math.abs(t.d2 - q2) <= 1 && Math.abs(t.s2) >= 5).map((t) => t.i);
  const pid = lotId(W, "pylon", "pylon");
  for (const i of legs) {
    W.kind[i] = KEEP;
    W.kind[twin(W, i)] = KEEP;
    setTile(W, i, 8 /* Building */, deckBase + URBAN.pylon);
    W.lot[i] = pid;
    W.lot[twin(W, i)] = pid + 1;
  }
  base = lanesNow();
  const west = deck.filter((t) => t.d2 < -6 && Math.abs(t.d2 - q2) > 4);
  const wrecks = rng.range(3, 6);
  for (let k = 0, tries = 0;k < wrecks && tries < 120; tries++) {
    const t = west[rng.int(west.length)];
    const x = t.i % w, y = (t.i - x) / w;
    const j = rng.int(2) === 0 ? x + 1 < w ? t.i + 1 : -1 : y + 1 < h ? t.i + w : -1;
    if (j < 0 || !west.some((u) => u.i === j))
      continue;
    if (place([t.i, j], "wreck", 1000 + k))
      k++;
  }
  const rows = rng.range(1, 2);
  for (let k = 0, tries = 0;k < rows && tries < 40; tries++) {
    const d0 = -6 - 2 * rng.range(2, G + 6 >> 1);
    const edge = (k + tries) % 2 === 0 ? 1 : -1, len = rng.range(3, 4);
    const cells = west.filter((t) => Math.abs(t.d2 - d0) <= 1 && edge * t.s2 > 8 - 2 * len).map((t) => t.i);
    if (cells.length < 2)
      continue;
    if (place(cells, "barrier", 2000 + k))
      k++;
  }
  return spawns;
}
function finish(W) {
  const { w, h } = W;
  for (let i = 0;i < w * h; i++) {
    const j = twin(W, i);
    if (j < i)
      continue;
    const g = W.ground[i];
    switch (W.kind[i]) {
      case KEEP:
        continue;
      case STREET:
      case DECK:
        setTile(W, i, 5 /* Road */, g);
        break;
      case BRIDGE_ST:
        setTile(W, i, 7 /* Bridge */, g);
        break;
      case PLAZA:
      case YARD:
      case OPEN:
        setTile(W, i, 0 /* Plain */, g);
        break;
      case PARK:
        setTile(W, i, W.rng.int(100) < 72 ? 1 /* Forest */ : 0 /* Plain */, g);
        break;
      case WATER:
        setTile(W, i, 2 /* Water */, Math.max(0, g - 40));
        break;
      case CLIFF:
        setTile(W, i, 4 /* Rock */, Math.max(0, g - 16));
        break;
      case FORD:
        setTile(W, i, 3 /* Ford */, Math.max(0, g - 30));
        break;
      case LOT:
        setTile(W, i, 0 /* Plain */, g);
        break;
      default:
        setTile(W, i, 0 /* Plain */, g);
    }
  }
  if (W.terrain[h / 2 * w + w / 2] === 0 /* Plain */) {
    const id = lotId(W, "monument", "monument");
    for (const [x, y] of [[w / 2 - 1, h / 2 - 1], [w / 2, h / 2 - 1]]) {
      const i = y * w + x;
      setTile(W, i, 8 /* Building */, W.ground[i] + URBAN.monument);
      W.lot[i] = id;
      W.lot[twin(W, i)] = id;
    }
  }
}

// ../engine/src/terrain.ts
var Terrain;
((Terrain2) => {
  Terrain2[Terrain2["Plain"] = 0] = "Plain";
  Terrain2[Terrain2["Forest"] = 1] = "Forest";
  Terrain2[Terrain2["Water"] = 2] = "Water";
  Terrain2[Terrain2["Ford"] = 3] = "Ford";
  Terrain2[Terrain2["Rock"] = 4] = "Rock";
  Terrain2[Terrain2["Road"] = 5] = "Road";
  Terrain2[Terrain2["Ruin"] = 6] = "Ruin";
  Terrain2[Terrain2["Bridge"] = 7] = "Bridge";
  Terrain2[Terrain2["Building"] = 8] = "Building";
})(Terrain ||= {});
var HEIGHT_MAX = 255;
var DEFAULT_PARAMS = {
  width: 128,
  height: 128,
  seaLevel: 40,
  forestDensity: Math.round(0.545 * FP),
  river: true,
  fords: 3,
  rockThreshold: 7,
  grammar: "s1"
};
var S2_TERRAIN = {
  plateauRaise: 35,
  plateauRadius: [6, 10],
  plateauDist: [20, 40],
  ruinDist: [12, 30],
  fogRadius: [6, 12],
  loopRadius: [14, 20],
  spawnClear: 9
};
function latticeHash(seed, x, y) {
  let h = (seed ^ Math.imul(x, 668265261) ^ Math.imul(y, 374761393)) >>> 0;
  h = Math.imul(h ^ h >>> 15, 739982445) >>> 0;
  h = Math.imul(h ^ h >>> 12, 695872825) >>> 0;
  return (h ^ h >>> 15) >>> 0;
}
var latticeVal = (seed, x, y) => latticeHash(seed, x, y) >>> 16;
function smooth(t) {
  const t2 = fxMul(t, t);
  return fxMul(t2, 3 * FP - 2 * t);
}
var lerp = (a, b, t) => a + fxMul(b - a, t);
function valueNoise(seed, x, y, cell) {
  const cx = Math.floor(x / (cell * FP));
  const cy = Math.floor(y / (cell * FP));
  const fx2 = Math.floor((x - cx * cell * FP) / cell);
  const fy = Math.floor((y - cy * cell * FP) / cell);
  const sx = smooth(fx2), sy = smooth(fy);
  const v00 = latticeVal(seed, cx, cy), v10 = latticeVal(seed, cx + 1, cy);
  const v01 = latticeVal(seed, cx, cy + 1), v11 = latticeVal(seed, cx + 1, cy + 1);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}
function fbm(seed, x, y, baseCell, octaves) {
  let sum = 0, amp = FP, norm = 0, cell = baseCell, s = seed;
  for (let o = 0;o < octaves && cell >= 1; o++) {
    sum += fxMul(valueNoise(s, x, y, cell), amp);
    norm += amp;
    amp >>= 1;
    cell >>= 1;
    s = s * 1103515245 + 12345 >>> 0;
  }
  return Math.floor(sum * FP / norm) >> 0;
}
function generateTerrain(seed, params = DEFAULT_PARAMS) {
  const { width, height } = params;
  if (width % 2 !== 0 || height % 2 !== 0)
    throw new Error("width and height must be even (point-symmetric map)");
  if (params.grammar === "urban")
    return generateUrban(seed, params);
  const grammar = params.grammar === "s2" ? "s2" : params.grammar === "sub" ? "sub" : "s1";
  const N = width * height;
  const half = width / 2, halfH = height / 2;
  const heights = new Uint8Array(N);
  const terrain = new Uint8Array(N);
  const fog = new Uint8Array(N);
  const rng = new Rng(seed);
  const hSeed = rng.next(), fSeed = rng.next(), rSeed = rng.next();
  const sym = (i) => {
    const x = i % width, y = (i - x) / width;
    return (height - 1 - y) * width + (width - 1 - x);
  };
  if (grammar === "sub") {
    for (let y = 0;y < height; y++)
      for (let x = 0;x < width; x++) {
        const n = fbm(hSeed, x << FP_SHIFT, y << FP_SHIFT, 26, 4);
        const ridge = fbm(hSeed ^ 1540483477, x << FP_SHIFT, y << FP_SHIFT, 14, 3);
        const valley = Math.abs(ridge - FP / 2) * 2;
        const v = (n * 2 + (FP - valley)) / 3;
        const i = y * width + x;
        heights[i] = 35 + (v * 155 >> FP_SHIFT);
      }
    for (let i = 0;i < N; i++) {
      const hAvg = heights[i] + heights[sym(i)] >> 1;
      heights[i] = hAvg;
    }
    let left2 = nearestPassable(terrain, width, height, Math.floor(half / 2), halfH);
    let spawns2 = [left2, [width - 1 - left2[0], height - 1 - left2[1]]];
    applySubBathymetry(rng.fork("sub"), terrain, heights, fog, width, height, spawns2);
    left2 = nearestPassable(terrain, width, height, left2[0], left2[1]);
    spawns2 = [left2, [width - 1 - left2[0], height - 1 - left2[1]]];
    if (!reachable(terrain, width, height, spawns2[0], spawns2[1])) {
      const sy = halfH;
      for (let x = 0;x < width; x++) {
        const i = sy * width + x, j = sym(i);
        if (terrain[i] === 4 /* Rock */) {
          terrain[i] = 0 /* Plain */;
          terrain[j] = 0 /* Plain */;
          heights[i] = 110;
          heights[j] = 110;
        }
      }
    }
    let h2 = 2166136261 >>> 0;
    for (let i = 0;i < heights.length; i++) {
      h2 ^= heights[i];
      h2 = Math.imul(h2, 16777619) >>> 0;
      h2 ^= terrain[i];
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
    h2 ^= hashStr(`${spawns2[0]}|${spawns2[1]}`);
    h2 = Math.imul(h2 ^ 1398096384, 16777619) >>> 0;
    for (let i = 0;i < fog.length; i++) {
      h2 ^= fog[i];
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
    return { seed, width, height, heights, terrain, fog, spawns: spawns2, hash: h2 >>> 0, grammar };
  }
  const raw = new Int32Array(N);
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const n = fbm(hSeed, x << FP_SHIFT, y << FP_SHIFT, 32, 4);
      const ridge = fbm(hSeed ^ 1540483477, x << FP_SHIFT, y << FP_SHIFT, 16, 2);
      const dx = x - half, dy = y - halfH;
      const r2 = dx * dx + dy * dy;
      const bowl = Math.max(0, FP - Math.floor(r2 * FP / (half * half + halfH * halfH | 0)));
      raw[y * width + x] = n * 3 + ridge + bowl >> 2;
    }
  const clampH = params.heightClamp === true;
  for (let i = 0;i < N; i++) {
    const v = (raw[i] + raw[sym(i)] >> 1) * HEIGHT_MAX >> FP_SHIFT;
    heights[i] = clampH && v > HEIGHT_MAX ? HEIGHT_MAX : v;
  }
  const fraw = new Int32Array(N);
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++)
      fraw[y * width + x] = fbm(fSeed, x << FP_SHIFT, y << FP_SHIFT, 24, 3);
  for (let i = 0;i < N; i++)
    if (fraw[i] + fraw[sym(i)] >> 1 > params.forestDensity)
      terrain[i] = 1 /* Forest */;
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const i = y * width + x, h2 = heights[i];
      let maxd = 0;
      if (x > 0)
        maxd = Math.max(maxd, Math.abs(h2 - heights[i - 1]));
      if (x + 1 < width)
        maxd = Math.max(maxd, Math.abs(h2 - heights[i + 1]));
      if (y > 0)
        maxd = Math.max(maxd, Math.abs(h2 - heights[i - width]));
      if (y + 1 < height)
        maxd = Math.max(maxd, Math.abs(h2 - heights[i + width]));
      if (maxd > params.rockThreshold)
        terrain[i] = 4 /* Rock */;
    }
  const fordRows = new Set;
  if (params.river) {
    const cx = new Int32Array(height), hw = new Int32Array(height);
    for (let y = 0;y < halfH; y++) {
      const m = fbm(rSeed, 0, y << FP_SHIFT, 20, 3) - FP / 2;
      let off = m * 2 * 26 >> FP_SHIFT;
      const toCentre = halfH - y;
      if (toCentre < 12)
        off = Math.round(off * toCentre / 12);
      cx[y] = Math.max(6, Math.min(width - 7, half + off));
      hw[y] = 1 + (fbm(rSeed ^ 2654435769, 0, y << FP_SHIFT, 10, 2) * 3 >> FP_SHIFT);
    }
    for (let y = 0;y < halfH; y++) {
      const y2 = height - 1 - y;
      cx[y2] = width - 1 - cx[y];
      hw[y2] = hw[y];
    }
    fordRows.add(halfH - 1);
    fordRows.add(halfH);
    const candidates = [];
    for (let y = 4;y < halfH - 10; y++)
      if (hw[y] === 1)
        candidates.push(y);
    candidates.sort((a, b) => Math.abs(a - halfH / 2) - Math.abs(b - halfH / 2));
    const chosen = [];
    for (const y of candidates) {
      if (chosen.every((c) => Math.abs(c - y) >= 14))
        chosen.push(y);
      if (chosen.length >= params.fords - 1)
        break;
    }
    for (const y of chosen) {
      fordRows.add(y);
      fordRows.add(y + 1);
      fordRows.add(height - 1 - y);
      fordRows.add(height - 2 - y);
    }
    for (let y = 0;y < height; y++) {
      const prev = y > 0 ? cx[y - 1] : cx[y];
      const lo = Math.min(cx[y], prev) - hw[y], hi = Math.max(cx[y], prev) + hw[y];
      const bankL = heights[y * width + Math.max(0, lo - 1)], bankR = heights[y * width + Math.min(width - 1, hi + 1)];
      const bed = Math.min(bankL, bankR);
      const t = fordRows.has(y) ? 3 /* Ford */ : 2 /* Water */;
      for (let x = Math.max(0, lo);x <= Math.min(width - 1, hi); x++) {
        terrain[y * width + x] = t;
        heights[y * width + x] = bed;
      }
    }
    for (let i = 0;i < N; i++) {
      const j = sym(i);
      if (j <= i)
        continue;
      const ti = terrain[i], tj = terrain[j];
      const wet = (t) => t === 2 /* Water */ || t === 3 /* Ford */;
      if (wet(ti) !== wet(tj)) {
        const t = wet(ti) ? ti : tj;
        terrain[i] = t;
        terrain[j] = t;
      } else if (ti !== tj) {
        terrain[i] = ti;
        terrain[j] = ti;
      }
      const h2 = Math.min(heights[i], heights[j]);
      heights[i] = h2;
      heights[j] = h2;
    }
  }
  if (params.river) {
    const src = heights.slice();
    for (let y = 0;y < height; y++)
      for (let x = 0;x < width; x++) {
        const i = y * width + x;
        if (terrain[i] === 2 /* Water */ || terrain[i] === 3 /* Ford */)
          continue;
        let found = -1, bank = 255;
        for (let r = 1;r <= 3 && found < 0; r++) {
          for (let dy = -r;dy <= r; dy++)
            for (let dx = -r;dx <= r; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r)
                continue;
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                continue;
              if (terrain[ny * width + nx] === 3 /* Ford */) {
                found = r;
                bank = Math.min(bank, src[ny * width + nx]);
              }
            }
        }
        if (found < 0)
          continue;
        if (terrain[i] === 4 /* Rock */)
          terrain[i] = 0 /* Plain */;
        const w = 4 - found;
        heights[i] = Math.round((src[i] * (4 - w) + bank * w) / 4);
      }
  }
  {
    const src = terrain.slice();
    for (let y = 0;y < height; y++)
      for (let x = 0;x < width; x++) {
        const i = y * width + x;
        if (src[i] !== 4 /* Rock */)
          continue;
        let n = 0;
        for (let dy = -1;dy <= 1; dy++)
          for (let dx = -1;dx <= 1; dx++) {
            if (!dx && !dy)
              continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height)
              continue;
            if (src[ny * width + nx] === 4 /* Rock */)
              n++;
          }
        if (n <= 2)
          terrain[i] = 0 /* Plain */;
      }
  }
  let left = nearestPassable(terrain, width, height, Math.floor(half / 2), halfH);
  let spawns = [left, [width - 1 - left[0], height - 1 - left[1]]];
  if (grammar === "s2") {
    applySeason2(rng.fork("s2"), terrain, heights, fog, width, height, spawns, params.s2Ramps ?? 2);
    left = nearestPassable(terrain, width, height, left[0], left[1]);
    spawns = [left, [width - 1 - left[0], height - 1 - left[1]]];
  }
  if (!reachable(terrain, width, height, spawns[0], spawns[1])) {
    const sy = halfH;
    for (let x = 0;x < width; x++) {
      const i = sy * width + x, j = sym(i);
      if (terrain[i] === 2 /* Water */) {
        terrain[i] = 3 /* Ford */;
        terrain[j] = 3 /* Ford */;
      }
      if (terrain[i] === 4 /* Rock */) {
        terrain[i] = 0 /* Plain */;
        terrain[j] = 0 /* Plain */;
      }
      if (grammar === "s2" && terrain[i] === 6 /* Ruin */) {
        terrain[i] = 0 /* Plain */;
        terrain[j] = 0 /* Plain */;
      }
    }
  }
  let h = 2166136261 >>> 0;
  for (let i = 0;i < heights.length; i++) {
    h ^= heights[i];
    h = Math.imul(h, 16777619) >>> 0;
    h ^= terrain[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= hashStr(`${spawns[0]}|${spawns[1]}`);
  if (grammar === "s2") {
    h = Math.imul(h ^ 1395785728, 16777619) >>> 0;
    for (let i = 0;i < fog.length; i++) {
      h ^= fog[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return { seed, width, height, heights, terrain, fog, spawns, hash: h >>> 0, grammar };
}
var sq2 = (v) => v * v;
function makePainter(terrain, heights, w, h) {
  const idx = (x, y) => y * w + x;
  const twin2 = (x, y) => (h - 1 - y) * w + (w - 1 - x);
  return {
    inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h,
    t: (x, y) => terrain[idx(x, y)],
    setT(x, y, t) {
      terrain[idx(x, y)] = t;
      terrain[twin2(x, y)] = t;
    },
    setH(x, y, v) {
      const c = v < 0 ? 0 : v > HEIGHT_MAX ? HEIGHT_MAX : v;
      heights[idx(x, y)] = c;
      heights[twin2(x, y)] = c;
    }
  };
}
function applySubBathymetry(rng, terrain, heights, _fog, w, h, spawns) {
  const half = w / 2, halfH = h / 2;
  const p = makePainter(terrain, heights, w, h);
  const nearSpawn = (x, y, extra = 0) => spawns.some(([sx, sy]) => Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= 10 + extra);
  for (let y = 0;y < h; y++) {
    const dy = y - halfH;
    const cx = half + Math.round(Math.sin(y * 0.08) * 14);
    for (let x = Math.max(0, cx - 10);x <= Math.min(w - 1, cx + 10); x++) {
      const d = Math.abs(x - cx);
      if (d <= 10) {
        const k = 1 - d / 10;
        const cur = heights[y * w + x];
        p.setH(x, y, Math.round(cur * (1 - 0.55 * k) + 22 * (0.55 * k)));
      }
    }
  }
  const mounts = [];
  const wantMounts = rng.range(3, 4);
  for (let attempt = 0;attempt < 360 && mounts.length < wantMounts * 2; attempt++) {
    const r = rng.range(4, 6);
    const slopeR = r + 5;
    const dx = rng.range(-42, 42), dy = rng.range(-42, 42);
    const d2 = dx * dx + dy * dy;
    if (d2 < sq2(13) || d2 > sq2(44))
      continue;
    const cx = half + dx, cy = halfH + dy;
    if (cx - slopeR - 2 < 0 || cy - slopeR - 2 < 0 || cx + slopeR + 2 >= w || cy + slopeR + 2 >= h)
      continue;
    if (nearSpawn(cx, cy, slopeR))
      continue;
    const mx = w - 1 - cx, my = h - 1 - cy;
    if (sq2(mx - cx) + sq2(my - cy) < sq2(2 * slopeR + 4))
      continue;
    if (mounts.some((q) => sq2(q.x - cx) + sq2(q.y - cy) < sq2(q.r + slopeR + 4)))
      continue;
    for (let yy = cy - slopeR;yy <= cy + slopeR; yy++)
      for (let xx = cx - slopeR;xx <= cx + slopeR; xx++) {
        const dist = Math.sqrt(sq2(xx - cx) + sq2(yy - cy));
        if (dist > slopeR)
          continue;
        if (dist <= r) {
          const peak = Math.round(248 - dist / Math.max(1, r) * 32);
          p.setT(xx, yy, 4 /* Rock */);
          p.setH(xx, yy, peak);
        } else {
          const k = 1 - (dist - r) / (slopeR - r);
          const orig = heights[yy * w + xx];
          p.setT(xx, yy, 0 /* Plain */);
          p.setH(xx, yy, Math.round(orig + (214 - orig) * k * k));
        }
      }
    mounts.push({ x: cx, y: cy, r: slopeR }, { x: mx, y: my, r: slopeR });
  }
  for (const [sx, sy] of spawns) {
    for (let dy = -6;dy <= 6; dy++)
      for (let dx = -6;dx <= 6; dx++) {
        const x = sx + dx, y = sy + dy;
        if (p.inside(x, y))
          p.setT(x, y, 0 /* Plain */);
      }
  }
}
function applySeason2(rng, terrain, heights, fog, w, h, spawns, rampRev = 2) {
  const half = w / 2, halfH = h / 2;
  const p = makePainter(terrain, heights, w, h);
  const reserved = new Uint8Array(w * h);
  const wet = (t) => t === 2 /* Water */ || t === 3 /* Ford */ || t === 7 /* Bridge */;
  const nearSpawn = (x, y, extra = 0) => spawns.some(([sx, sy]) => Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= S2_TERRAIN.spawnClear + extra);
  const anyAround = (x, y, r, pred) => {
    for (let dy = -r;dy <= r; dy++)
      for (let dx = -r;dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!p.inside(nx, ny))
          return true;
        if (pred(terrain[ny * w + nx], ny * w + nx))
          return true;
      }
    return false;
  };
  const plateaus = [];
  const wantPlateaus = rng.range(1, 2);
  for (let attempt = 0;attempt < 400 && plateaus.length < wantPlateaus * 2; attempt++) {
    const r = rng.range(S2_TERRAIN.plateauRadius[0], attempt < 150 ? S2_TERRAIN.plateauRadius[1] : S2_TERRAIN.plateauRadius[0] + 1);
    const dx = rng.range(-S2_TERRAIN.plateauDist[1], S2_TERRAIN.plateauDist[1]), dy = rng.range(-S2_TERRAIN.plateauDist[1], S2_TERRAIN.plateauDist[1]);
    const d2 = dx * dx + dy * dy;
    if (d2 < sq2(S2_TERRAIN.plateauDist[0]) || d2 > sq2(S2_TERRAIN.plateauDist[1]))
      continue;
    const cx = half + dx, cy = halfH + dy;
    const outer = r + 2;
    if (cx - outer - 3 < 0 || cy - outer - 3 < 0 || cx + outer + 3 >= w || cy + outer + 3 >= h)
      continue;
    if (nearSpawn(cx, cy, outer))
      continue;
    const mx = w - 1 - cx, my = h - 1 - cy;
    if (sq2(mx - cx) + sq2(my - cy) < sq2(2 * outer + 4))
      continue;
    if (plateaus.some((q) => sq2(q.x - cx) + sq2(q.y - cy) < sq2(q.r + outer + 5)))
      continue;
    let ok = true;
    for (let yy = cy - outer - 2;yy <= cy + outer + 2 && ok; yy++)
      for (let xx = cx - outer - 2;xx <= cx + outer + 2; xx++) {
        if (sq2(xx - cx) + sq2(yy - cy) > sq2(outer + 2))
          continue;
        if (wet(p.t(xx, yy))) {
          ok = false;
          break;
        }
      }
    if (!ok)
      continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = dirs.length - 1;i > 0; i--) {
      const j = rng.int(i + 1);
      const t = dirs[i];
      dirs[i] = dirs[j];
      dirs[j] = t;
    }
    let ramp = null;
    for (const [ux, uy] of dirs) {
      let open = true;
      for (let k = -1;k <= 1 && open; k++)
        for (let s = outer + 1;s <= outer + 3; s++) {
          const ax = cx + ux * s + (uy !== 0 ? k : 0), ay = cy + uy * s + (ux !== 0 ? k : 0);
          const t = p.t(ax, ay);
          if (t === 4 /* Rock */ || wet(t))
            open = false;
        }
      if (open) {
        ramp = [ux, uy];
        break;
      }
    }
    if (!ramp)
      continue;
    const top = Math.min(HEIGHT_MAX, heights[cy * w + cx] + S2_TERRAIN.plateauRaise);
    const src = heights.slice();
    const ext = rampRev >= 2 ? 2 : 0;
    for (let yy = cy - outer - ext;yy <= cy + outer + ext; yy++)
      for (let xx = cx - outer - ext;xx <= cx + outer + ext; xx++) {
        if (rampRev >= 2 && (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1))
          continue;
        const d = sq2(xx - cx) + sq2(yy - cy);
        const i = yy * w + xx;
        if (d > sq2(outer)) {
          if (rampRev < 2)
            continue;
          const alongO = ramp[0] !== 0 ? (xx - cx) * ramp[0] : (yy - cy) * ramp[1];
          const acrossO = ramp[0] !== 0 ? Math.abs(yy - cy) : Math.abs(xx - cx);
          if (!(alongO > 0 && acrossO <= 1 && d <= sq2(outer + 2)))
            continue;
          const t0 = p.t(xx, yy);
          if (t0 === 2 /* Water */ || t0 === 3 /* Ford */)
            continue;
          const orig0 = src[i];
          const step = alongO - outer;
          reserved[i] = 1;
          reserved[(h - 1 - yy) * w + (w - 1 - xx)] = 1;
          if (t0 === 4 /* Rock */)
            p.setT(xx, yy, 0 /* Plain */);
          p.setH(xx, yy, Math.trunc(orig0 + (top - orig0) * (2 - step) / 5));
          continue;
        }
        reserved[i] = 1;
        reserved[(h - 1 - yy) * w + (w - 1 - xx)] = 1;
        if (d <= sq2(r)) {
          p.setH(xx, yy, top);
          if (p.t(xx, yy) === 4 /* Rock */)
            p.setT(xx, yy, 0 /* Plain */);
          continue;
        }
        const band = d <= sq2(r + 1) ? 1 : 2;
        const along = ramp[0] !== 0 ? (xx - cx) * ramp[0] : (yy - cy) * ramp[1];
        const across = ramp[0] !== 0 ? Math.abs(yy - cy) : Math.abs(xx - cx);
        const orig = src[i];
        if (along > 0 && across <= 1) {
          p.setT(xx, yy, 0 /* Plain */);
          if (rampRev < 2)
            p.setH(xx, yy, band === 1 ? Math.trunc((2 * top + orig) / 3) : Math.trunc((top + 2 * orig) / 3));
          else
            p.setH(xx, yy, band === 1 ? Math.trunc(orig + (top - orig) * 4 / 5) : Math.trunc(orig + (top - orig) * 3 / 5));
        } else {
          p.setT(xx, yy, 4 /* Rock */);
          p.setH(xx, yy, Math.trunc((top + orig) / 2));
        }
      }
    const laneH = (along, orig) => {
      const k = along <= r ? 5 : along === r + 1 ? 4 : along === outer ? 3 : along === outer + 1 ? 2 : 1;
      return Math.trunc(orig + (top - orig) * k / 5);
    };
    if (rampRev >= 2)
      for (let along = r + 1;along <= outer + 2; along++)
        for (const across of [2, 3])
          for (const sgn of [-1, 1]) {
            const xx = ramp[0] !== 0 ? cx + along * ramp[0] : cx + sgn * across;
            const yy = ramp[0] !== 0 ? cy + sgn * across : cy + along * ramp[1];
            if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1)
              continue;
            const t0 = p.t(xx, yy);
            if (t0 === 2 /* Water */ || t0 === 3 /* Ford */ || t0 === 4 /* Rock */)
              continue;
            const i = yy * w + xx;
            const orig0 = src[i];
            p.setH(xx, yy, Math.trunc((laneH(along, orig0) + orig0) / 2));
            reserved[i] = 1;
            reserved[(h - 1 - yy) * w + (w - 1 - xx)] = 1;
          }
    plateaus.push({ x: cx, y: cy, r }, { x: mx, y: my, r });
  }
  const paintRoad = (x, y) => {
    const t = p.t(x, y);
    if (t === 0 /* Plain */ || t === 1 /* Forest */)
      p.setT(x, y, 5 /* Road */);
    else if (t === 2 /* Water */)
      p.setT(x, y, 7 /* Bridge */);
  };
  if (rng.int(2) === 1) {
    const lr = rng.range(S2_TERRAIN.loopRadius[0], S2_TERRAIN.loopRadius[1]);
    for (let yy = halfH - lr - 1;yy <= halfH + lr; yy++)
      for (let xx = half - lr - 1;xx <= half + lr; xx++) {
        const ddx = 2 * (xx - half) + 1, ddy = 2 * (yy - halfH) + 1;
        const d4 = ddx * ddx + ddy * ddy;
        if (d4 >= sq2(2 * lr - 1) && d4 < sq2(2 * lr + 1)) {
          if (nearSpawn(xx, yy))
            continue;
          paintRoad(xx, yy);
        }
      }
  }
  {
    const target = [half - 1, halfH - 1];
    const path = astar(terrain, heights, w, h, spawns[0], target);
    const tiles = [];
    if (path) {
      for (let k = 0;k < path.length; k++) {
        tiles.push(path[k]);
        if (k + 1 < path.length) {
          const a = path[k], b = path[k + 1];
          const ax = a % w, ay = (a - ax) / w, bx = b % w, by = (b - bx) / w;
          if (ax !== bx && ay !== by) {
            const c1 = ay * w + bx, c2 = by * w + ax;
            const ok1 = isPassable(terrain[c1]) || terrain[c1] === 2 /* Water */;
            const ok2 = isPassable(terrain[c2]) || terrain[c2] === 2 /* Water */;
            if (ok1 && (!ok2 || heights[c1] <= heights[c2]))
              tiles.push(c1);
            else if (ok2)
              tiles.push(c2);
          }
        }
      }
    } else {
      for (let x = Math.min(spawns[0][0], target[0]);x <= Math.max(spawns[0][0], target[0]); x++)
        tiles.push(halfH * w + x);
    }
    tiles.push((halfH - 1) * w + half, halfH * w + (half - 1));
    for (const i of tiles) {
      const x = i % w, y = (i - x) / w;
      paintRoad(x, y);
    }
  }
  const wantRuins = rng.range(1, 2);
  let ruins = 0;
  for (let attempt = 0;attempt < 400 && ruins < wantRuins; attempt++) {
    const dx = rng.range(-S2_TERRAIN.ruinDist[1], S2_TERRAIN.ruinDist[1]), dy = rng.range(-S2_TERRAIN.ruinDist[1], S2_TERRAIN.ruinDist[1]);
    const d2 = dx * dx + dy * dy;
    if (d2 < sq2(S2_TERRAIN.ruinDist[0]) || d2 > sq2(S2_TERRAIN.ruinDist[1]))
      continue;
    const cx = half + dx, cy = halfH + dy;
    const crowded = attempt >= 200;
    const shape = ruinShape(rng, crowded);
    let ok = true;
    for (const [sx, sy] of shape) {
      const x = cx + sx, y = cy + sy;
      if (!p.inside(x, y) || reserved[y * w + x] || nearSpawn(x, y)) {
        ok = false;
        break;
      }
      const base = p.t(x, y);
      if (base !== 0 /* Plain */ && !(crowded && base === 1 /* Forest */)) {
        ok = false;
        break;
      }
      if (anyAround(x, y, 2, (t) => wet(t))) {
        ok = false;
        break;
      }
      if (anyAround(x, y, 4, (t) => t === 3 /* Ford */)) {
        ok = false;
        break;
      }
      if (anyAround(x, y, 1, (t) => t === 5 /* Road */ || t === 6 /* Ruin */)) {
        ok = false;
        break;
      }
    }
    if (!ok)
      continue;
    for (const [sx, sy] of shape)
      p.setT(cx + sx, cy + sy, 6 /* Ruin */);
    ruins++;
  }
  const wantFog = rng.range(0, 2);
  let banks = 0;
  for (let attempt = 0;attempt < 40 && banks < wantFog; attempt++) {
    const a = rng.range(S2_TERRAIN.fogRadius[0], S2_TERRAIN.fogRadius[1]), b = rng.range(S2_TERRAIN.fogRadius[0], S2_TERRAIN.fogRadius[1]);
    const cx = rng.range(a + 1, w - 2 - a), cy = rng.range(b + 1, h - 2 - b);
    const a2 = a * a, b2 = b * b, ab = a2 * b2;
    const covers = (x, y) => sq2(x - cx) * b2 + sq2(y - cy) * a2 <= ab;
    if (spawns.some(([sx, sy]) => covers(sx, sy) || covers(w - 1 - sx, h - 1 - sy)))
      continue;
    if (nearSpawn(cx, cy, Math.max(a, b)))
      continue;
    for (let yy = cy - b;yy <= cy + b; yy++)
      for (let xx = cx - a;xx <= cx + a; xx++) {
        if (!covers(xx, yy))
          continue;
        fog[yy * w + xx] = 1;
        fog[(h - 1 - yy) * w + (w - 1 - xx)] = 1;
      }
    banks++;
  }
}
function ruinShape(rng, small = false) {
  const cells = [];
  if (small || rng.int(2) === 0) {
    const a = rng.range(2, small ? 3 : 5), b = rng.range(2, small ? 3 : 5);
    for (let i = 0;i < a; i++)
      cells.push([i, 0]);
    for (let j = 1;j < b; j++)
      cells.push([0, j]);
  } else {
    const base = rng.range(3, 5), arm = rng.range(2, 3);
    for (let i = 0;i < base; i++)
      cells.push([i, 0]);
    for (let j = 1;j < arm; j++) {
      cells.push([0, j]);
      cells.push([base - 1, j]);
    }
  }
  const rot = rng.int(4), flip = rng.int(2);
  return cells.map(([x, y]) => {
    if (flip)
      x = -x;
    for (let r = 0;r < rot; r++) {
      const t = x;
      x = -y;
      y = t;
    }
    return [x, y];
  });
}
function astar(terrain, heights, w, h, a, b) {
  const N = w * h;
  const start = a[1] * w + a[0], goal = b[1] * w + b[0];
  const g = new Int32Array(N).fill(1073741823);
  const f = new Int32Array(N);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const tileCost = (t) => {
    switch (t) {
      case 5 /* Road */:
      case 7 /* Bridge */:
        return 8;
      case 0 /* Plain */:
      case 3 /* Ford */:
        return 10;
      case 1 /* Forest */:
        return 16;
      case 2 /* Water */:
        return 90;
      default:
        return -1;
    }
  };
  const heur = (i) => {
    const x = i % w, y = (i - x) / w;
    const dx = Math.abs(x - b[0]), dy = Math.abs(y - b[1]);
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  };
  const heap = [];
  const less = (i, j) => f[i] < f[j] || f[i] === f[j] && i < j;
  const push = (i) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const par = k - 1 >> 1;
      if (!less(heap[k], heap[par]))
        break;
      const t = heap[k];
      heap[k] = heap[par];
      heap[par] = t;
      k = par;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;; ) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && less(heap[l], heap[m]))
          m = l;
        if (r < heap.length && less(heap[r], heap[m]))
          m = r;
        if (m === k)
          break;
        const t = heap[k];
        heap[k] = heap[m];
        heap[m] = t;
        k = m;
      }
    }
    return top;
  };
  g[start] = 0;
  f[start] = heur(start);
  push(start);
  while (heap.length) {
    const i = pop();
    if (closed[i])
      continue;
    closed[i] = 1;
    if (i === goal)
      break;
    const x = i % w, y = (i - x) / w, hi = heights[i];
    for (let dy = -1;dy <= 1; dy++)
      for (let dx = -1;dx <= 1; dx++) {
        if (!dx && !dy)
          continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h)
          continue;
        const j = ny * w + nx;
        if (closed[j])
          continue;
        const tc = tileCost(terrain[j]);
        if (tc < 0)
          continue;
        if (dx && dy) {
          const c1 = terrain[y * w + nx], c2 = terrain[ny * w + x];
          if (tileCost(c1) < 0 || tileCost(c2) < 0)
            continue;
        }
        const slope = Math.abs(heights[j] - hi);
        let step = tc + 6 * slope;
        if (dx && dy)
          step = Math.trunc(step * 7 / 5);
        const ng = g[i] + step;
        if (ng < g[j]) {
          g[j] = ng;
          f[j] = ng + heur(j);
          from[j] = i;
          push(j);
        }
      }
  }
  if (from[goal] < 0 && goal !== start)
    return null;
  const path = [];
  for (let i = goal;i >= 0; i = from[i]) {
    path.push(i);
    if (i === start)
      break;
  }
  return path.reverse();
}
var isPassable = (t) => t !== 2 /* Water */ && t !== 4 /* Rock */ && t !== 6 /* Ruin */ && t !== 8 /* Building */;
var blocksSight = (t) => t === 6 /* Ruin */;
function nearestPassable(terrain, w, h, x0, y0) {
  for (let r = 0;r < Math.max(w, h); r++) {
    for (let dy = -r;dy <= r; dy++) {
      for (let dx = -r;dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r)
          continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h)
          continue;
        if (isPassable(terrain[y * w + x]))
          return [x, y];
      }
    }
  }
  return [x0, y0];
}
function reachable(terrain, w, h, a, b) {
  const seen = new Uint8Array(w * h);
  const q = [a[1] * w + a[0]];
  seen[q[0]] = 1;
  const target = b[1] * w + b[0];
  while (q.length) {
    const i = q.pop();
    if (i === target)
      return true;
    const x = i % w, y = (i - x) / w;
    const nb = [i - 1, i + 1, i - w, i + w];
    const ok = [x > 0, x + 1 < w, y > 0, y + 1 < h];
    for (let k = 0;k < 4; k++) {
      const j = nb[k];
      if (ok[k] && !seen[j] && isPassable(terrain[j])) {
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  return false;
}
var TERRAIN_GLYPHS = [".", "T", "~", "=", "^", "+", "H", "#", "B"];
var GLYPH_PRIORITY = [0, 1, 3, 5, 2, 6, 7, 8, 4];
function asciiMap(m, step = 2, fogLayer = false) {
  const rows = [];
  for (let y = 0;y < m.height; y += step) {
    let row = "";
    for (let x = 0;x < m.width; x += step) {
      const isSpawn = m.spawns.some(([sx, sy]) => Math.abs(sx - x) < step && Math.abs(sy - y) < step);
      let best = m.terrain[y * m.width + x], fogged = false;
      for (let yy = y;yy < Math.min(m.height, y + step); yy++)
        for (let xx = x;xx < Math.min(m.width, x + step); xx++) {
          const i = yy * m.width + xx, t = m.terrain[i];
          if ((GLYPH_PRIORITY[t] ?? 0) > (GLYPH_PRIORITY[best] ?? 0))
            best = t;
          if (m.fog?.[i])
            fogged = true;
        }
      row += isSpawn ? "@" : fogLayer && fogged ? "%" : TERRAIN_GLYPHS[best] ?? "?";
    }
    rows.push(row);
  }
  return rows.join(`
`);
}
// ../engine/src/los.ts
var FOG_SENSOR_FACTOR = FP >> 1;
function heightAt(map, x, y) {
  const tx = clampi(x >> FP_SHIFT, 0, map.width - 1);
  const ty = clampi(y >> FP_SHIFT, 0, map.height - 1);
  return map.heights[ty * map.width + tx];
}
function terrainAt(map, x, y) {
  const tx = x >> FP_SHIFT, ty = y >> FP_SHIFT;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height)
    return 4 /* Rock */;
  return map.terrain[ty * map.width + tx];
}
function fogAt(map, x, y) {
  const tx = x >> FP_SHIFT, ty = y >> FP_SHIFT;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height)
    return false;
  return fogAtTile(map, ty * map.width + tx);
}
var fogAtTile = (map, tile) => map.fog !== undefined && map.fog[tile] === 1;
var clampi = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
function lineOfSight(map, ox, oy, oh, tx, ty, th, range, forestFactor, fogFactor = FOG_SENSOR_FACTOR) {
  const dx = tx - ox, dy = ty - oy;
  const dist = fxLen(dx, dy);
  let effectiveRange = range;
  if (dist > range)
    return { visible: false, effectiveRange };
  let fogged = false;
  if (fogAt(map, ox, oy)) {
    fogged = true;
    effectiveRange = fxMul(effectiveRange, fogFactor);
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
  }
  const h0 = heightAt(map, ox, oy) + oh;
  const h1 = heightAt(map, tx, ty) + th;
  const steps = Math.max(1, dist >> FP_SHIFT - 1);
  let lastTile = -1;
  for (let i = 1;i < steps; i++) {
    const f = fxDiv(i * FP, steps * FP);
    const sx = ox + fxMul(dx, f), sy = oy + fxMul(dy, f);
    const tile = (sy >> FP_SHIFT) * map.width + (sx >> FP_SHIFT);
    const ground = heightAt(map, sx, sy);
    const line = h0 + (h1 - h0) * i / steps;
    if (ground > line)
      return { visible: false, effectiveRange };
    if (tile !== lastTile) {
      lastTile = tile;
      const t = map.terrain[tile];
      if (blocksSight(t))
        return { visible: false, effectiveRange };
      if (t === 1 /* Forest */) {
        effectiveRange = fxMul(effectiveRange, forestFactor);
        if (dist > effectiveRange)
          return { visible: false, effectiveRange };
      }
      if (!fogged && fogAtTile(map, tile)) {
        fogged = true;
        effectiveRange = fxMul(effectiveRange, fogFactor);
        if (dist > effectiveRange)
          return { visible: false, effectiveRange };
      }
    }
  }
  if (terrainAt(map, tx, ty) === 1 /* Forest */) {
    effectiveRange = fxMul(effectiveRange, forestFactor);
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
  }
  if (!fogged && fogAt(map, tx, ty)) {
    effectiveRange = fxMul(effectiveRange, fogFactor);
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
  }
  return { visible: true, effectiveRange };
}
function traceSegment(map, ox, oy, tx, ty, visit, corner) {
  const { width: w, height: h } = map;
  let ix = ox >> FP_SHIFT, iy = oy >> FP_SHIFT;
  const ex = tx >> FP_SHIFT, ey = ty >> FP_SHIFT;
  const dx = tx - ox, dy = ty - oy;
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tile = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  const nextT = (i, s, o, d) => {
    if (s === 0)
      return 2147483647;
    const b = (s > 0 ? i + 1 : i) << FP_SHIFT;
    return fxDiv(b - o, d);
  };
  let tMaxX = nextT(ix, sx, ox, dx), tMaxY = nextT(iy, sy, oy, dy);
  const limit = Math.abs(ex - ix) + Math.abs(ey - iy) + 2;
  for (let n = 0;n < limit && (ix !== ex || iy !== ey); n++) {
    let t;
    if (tMaxX === tMaxY) {
      t = tMaxX;
      if (t > FP)
        break;
      if (corner(tile(ix + sx, iy), tile(ix, iy + sy), t))
        return t;
      ix += sx;
      iy += sy;
      tMaxX = nextT(ix, sx, ox, dx);
      tMaxY = nextT(iy, sy, oy, dy);
    } else if (tMaxX < tMaxY) {
      t = tMaxX;
      if (t > FP)
        break;
      ix += sx;
      tMaxX = nextT(ix, sx, ox, dx);
    } else {
      t = tMaxY;
      if (t > FP)
        break;
      iy += sy;
      tMaxY = nextT(iy, sy, oy, dy);
    }
    const out = Math.min(FP, tMaxX, tMaxY);
    if (visit(tile(ix, iy), t, out))
      return t;
  }
  return -1;
}
function lineOfSightUrban(map, ox, oy, oh, tx, ty, th, range, forestFactor, fogFactor = FOG_SENSOR_FACTOR) {
  const dx = tx - ox, dy = ty - oy;
  const dist = fxLen(dx, dy);
  let effectiveRange = range;
  if (dist > range)
    return { visible: false, effectiveRange };
  let fogged = false;
  if (fogAt(map, ox, oy)) {
    fogged = true;
    effectiveRange = fxMul(effectiveRange, fogFactor);
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
  }
  const h0 = heightAt(map, ox, oy) + oh;
  const h1 = heightAt(map, tx, ty) + th;
  const targetTile = (ty >> FP_SHIFT) * map.width + (tx >> FP_SHIFT);
  const lineFP = (t) => h0 * FP + (h1 - h0) * t;
  const above = (tile, t) => tile >= 0 && (blocksSight(map.terrain[tile]) || map.heights[tile] * FP > lineFP(t));
  let blocked = false;
  const stop = traceSegment(map, ox, oy, tx, ty, (tile, tIn, tOut) => {
    if (tile < 0) {
      blocked = true;
      return true;
    }
    if (tile === targetTile)
      return false;
    const t = map.terrain[tile];
    if (blocksSight(t) || map.heights[tile] * FP > Math.min(lineFP(tIn), lineFP(tOut))) {
      blocked = true;
      return true;
    }
    if (t === 1 /* Forest */) {
      effectiveRange = fxMul(effectiveRange, forestFactor);
      if (dist > effectiveRange) {
        blocked = true;
        return true;
      }
    }
    if (!fogged && fogAtTile(map, tile)) {
      fogged = true;
      effectiveRange = fxMul(effectiveRange, fogFactor);
      if (dist > effectiveRange) {
        blocked = true;
        return true;
      }
    }
    return false;
  }, (a, b, t) => {
    if (a === targetTile || b === targetTile)
      return false;
    if (above(a, t) && above(b, t)) {
      blocked = true;
      return true;
    }
    return false;
  });
  if (blocked)
    return { visible: false, effectiveRange };
  if (terrainAt(map, tx, ty) === 1 /* Forest */) {
    effectiveRange = fxMul(effectiveRange, forestFactor);
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
  }
  if (!fogged && fogAt(map, tx, ty)) {
    effectiveRange = fxMul(effectiveRange, fogFactor);
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
  }
  return { visible: true, effectiveRange };
}
// ../engine/src/rules.ts
var TICK_HZ = 20;
var perSec = (tilesPerSec) => fx(tilesPerSec / TICK_HZ);
var perSec2 = (tilesPerSec2) => Math.max(1, fx(tilesPerSec2 / (TICK_HZ * TICK_HZ)));
var degPerSec = (deg) => Math.round(deg / 360 * ANG_FULL / TICK_HZ);
var secs = (s) => Math.round(s * TICK_HZ);
var scout = {
  kind: "scout",
  hp: 60,
  armor: [4, 2, 0],
  maxSpeed: perSec(6),
  accel: perSec2(4),
  turnRate: degPerSec(180),
  turretRate: degPerSec(180),
  sensorRange: fx(30),
  eyeHeight: 6,
  radius: fx(0.45),
  gun: { mode: "direct", damage: 8, splash: 0, minRange: 0, maxRange: fx(18), reload: secs(1), shellSpeed: perSec(40), aimTolerance: degPerSec(180), dispersion: 0 }
};
var mbt = {
  kind: "mbt",
  hp: 160,
  armor: [20, 10, 4],
  maxSpeed: perSec(3.5),
  accel: perSec2(1.5),
  turnRate: degPerSec(60),
  turretRate: degPerSec(90),
  sensorRange: fx(20),
  eyeHeight: 5,
  radius: fx(0.6),
  gun: { mode: "direct", damage: 45, splash: fx(0.8), minRange: 0, maxRange: fx(30), reload: secs(4), shellSpeed: perSec(60), aimTolerance: degPerSec(90) / 4, dispersion: 0 }
};
var artillery = {
  kind: "artillery",
  hp: 70,
  armor: [6, 4, 2],
  maxSpeed: perSec(2),
  accel: perSec2(1),
  turnRate: degPerSec(45),
  turretRate: degPerSec(45),
  sensorRange: fx(12),
  eyeHeight: 4,
  radius: fx(0.55),
  gun: { mode: "indirect", damage: 60, splash: fx(3), minRange: fx(10), maxRange: fx(60), reload: secs(8), shellSpeed: 0, aimTolerance: ANG_FULL, dispersion: fx(2.5) },
  secondary: { mode: "direct", damage: 6, splash: 0, minRange: 0, maxRange: fx(8), reload: secs(1.5), shellSpeed: perSec(40), aimTolerance: degPerSec(45) * 2, dispersion: 0 }
};
var drone = {
  kind: "drone",
  hp: 30,
  armor: [0, 0, 0],
  maxSpeed: perSec(7),
  accel: perSec2(6),
  turnRate: degPerSec(240),
  turretRate: 0,
  sensorRange: fx(36),
  eyeHeight: 40,
  radius: fx(0.4),
  air: true,
  damageTaken: fx(2),
  fixedGun: true,
  gun: { mode: "none", damage: 0, splash: 0, minRange: 0, maxRange: 0, reload: 0, shellSpeed: 0, aimTolerance: 0, dispersion: 0 }
};
var missile = {
  kind: "missile",
  hp: 90,
  armor: [8, 4, 2],
  maxSpeed: perSec(3),
  accel: perSec2(1.5),
  turnRate: degPerSec(60),
  turretRate: degPerSec(120),
  sensorRange: fx(18),
  eyeHeight: 5,
  radius: fx(0.55),
  ammo: 6,
  gun: { mode: "direct", damage: 70, splash: 0, minRange: fx(6), maxRange: fx(40), reload: secs(10), shellSpeed: perSec(30), aimTolerance: ANG_FULL, dispersion: 0, lockTicks: secs(2) }
};
var engineer = {
  kind: "engineer",
  hp: 80,
  armor: [8, 6, 4],
  maxSpeed: perSec(3.5),
  accel: perSec2(2),
  turnRate: degPerSec(90),
  turretRate: degPerSec(90),
  sensorRange: fx(14),
  eyeHeight: 5,
  radius: fx(0.55),
  fixedGun: true,
  gun: { mode: "none", damage: 0, splash: 0, minRange: 0, maxRange: 0, reload: 0, shellSpeed: 0, aimTolerance: 0, dispersion: 0 },
  secondary: { mode: "direct", damage: 6, splash: 0, minRange: 0, maxRange: fx(8), reload: secs(1.5), shellSpeed: perSec(40), aimTolerance: degPerSec(90) * 2, dispersion: 0 },
  abilities: {
    smoke: { charges: 3, radius: fx(6), duration: secs(15) },
    mine: { charges: 3, damage: 25, triggerRadius: fx(0.9) }
  }
};
var apc = {
  kind: "apc",
  hp: 110,
  armor: [12, 8, 4],
  maxSpeed: perSec(4.5),
  accel: perSec2(2),
  turnRate: degPerSec(90),
  turretRate: degPerSec(150),
  sensorRange: fx(16),
  eyeHeight: 5,
  radius: fx(0.55),
  captureWeight: 2,
  gun: { mode: "direct", damage: 10, splash: 0, minRange: 0, maxRange: fx(14), reload: secs(1.5), shellSpeed: perSec(45), aimTolerance: degPerSec(150) / 4, dispersion: 0 }
};
var ssk = {
  kind: "ssk",
  hp: 110,
  armor: [10, 6, 4],
  maxSpeed: perSec(3.2),
  accel: perSec2(1.8),
  turnRate: degPerSec(75),
  turretRate: degPerSec(150),
  sensorRange: fx(34),
  eyeHeight: 26,
  radius: fx(0.55),
  ammo: 8,
  silentNoise: fx(0.35),
  cavitationNoise: fx(1.75),
  terminalHomingRadius: fx(5),
  gun: { mode: "direct", damage: 55, splash: fx(0.8), minRange: 0, maxRange: fx(32), reload: secs(4.5), shellSpeed: perSec(28), aimTolerance: degPerSec(60), dispersion: 0 },
  abilities: {
    smoke: { charges: 2, radius: fx(6), duration: secs(14) },
    ping: { range: fx(44), cooldown: secs(5), revealTicks: secs(3), selfRevealTicks: secs(4) }
  }
};
var ssn = {
  kind: "ssn",
  hp: 165,
  armor: [16, 10, 6],
  maxSpeed: perSec(4.4),
  accel: perSec2(2.4),
  turnRate: degPerSec(60),
  turretRate: degPerSec(120),
  sensorRange: fx(28),
  eyeHeight: 26,
  radius: fx(0.6),
  ammo: 8,
  silentNoise: fx(0.5),
  cavitationNoise: fx(1.85),
  terminalHomingRadius: fx(6),
  gun: { mode: "direct", damage: 65, splash: fx(1), minRange: 0, maxRange: fx(36), reload: secs(5), shellSpeed: perSec(30), aimTolerance: degPerSec(60), dispersion: 0 },
  secondary: { mode: "direct", damage: 20, splash: 0, minRange: 0, maxRange: fx(14), reload: secs(2), shellSpeed: perSec(34), aimTolerance: degPerSec(90), dispersion: 0 },
  abilities: {
    smoke: { charges: 2, radius: fx(6), duration: secs(14) },
    ping: { range: fx(46), cooldown: secs(5), revealTicks: secs(3), selfRevealTicks: secs(4) }
  }
};
var ssgn = {
  kind: "ssgn",
  hp: 130,
  armor: [12, 8, 4],
  maxSpeed: perSec(2.8),
  accel: perSec2(1.4),
  turnRate: degPerSec(50),
  turretRate: degPerSec(90),
  sensorRange: fx(24),
  eyeHeight: 26,
  radius: fx(0.58),
  ammo: 10,
  silentNoise: fx(0.5),
  cavitationNoise: fx(1.8),
  requireShallowFire: true,
  terminalHomingRadius: fx(7.5),
  gun: { mode: "direct", damage: 65, splash: fx(2.2), minRange: fx(10), maxRange: fx(54), reload: secs(6.5), shellSpeed: perSec(26), aimTolerance: ANG_FULL, dispersion: 0 },
  secondary: { mode: "direct", damage: 18, splash: 0, minRange: 0, maxRange: fx(12), reload: secs(2), shellSpeed: perSec(30), aimTolerance: degPerSec(90), dispersion: 0 }
};
var uuv = {
  kind: "uuv",
  hp: 45,
  armor: [2, 0, 0],
  maxSpeed: perSec(5.6),
  accel: perSec2(3.5),
  turnRate: degPerSec(180),
  turretRate: degPerSec(180),
  sensorRange: fx(42),
  eyeHeight: 30,
  radius: fx(0.42),
  silentNoise: fx(0.28),
  cavitationNoise: fx(1.3),
  fixedGun: true,
  gun: { mode: "none", damage: 0, splash: 0, minRange: 0, maxRange: 0, reload: 0, shellSpeed: 0, aimTolerance: 0, dispersion: 0 },
  abilities: {
    ping: { range: fx(50), cooldown: secs(4), revealTicks: secs(3.5), selfRevealTicks: secs(4) }
  }
};
var minelayer = {
  kind: "minelayer",
  hp: 130,
  armor: [12, 8, 6],
  maxSpeed: perSec(4.2),
  accel: perSec2(2),
  turnRate: degPerSec(85),
  turretRate: degPerSec(160),
  sensorRange: fx(28),
  eyeHeight: 28,
  radius: fx(0.55),
  captureWeight: 2,
  silentNoise: fx(0.65),
  cavitationNoise: fx(1.8),
  gun: { mode: "direct", damage: 24, splash: 0, minRange: 0, maxRange: fx(24), reload: secs(1.5), shellSpeed: perSec(46), aimTolerance: degPerSec(60), dispersion: 0 },
  secondary: { mode: "direct", damage: 8, splash: 0, minRange: 0, maxRange: fx(14), reload: secs(0.8), shellSpeed: perSec(48), aimTolerance: degPerSec(120), dispersion: 0 },
  abilities: {
    smoke: { charges: 2, radius: fx(6), duration: secs(14) },
    mine: { charges: 5, damage: 45, triggerRadius: fx(1.8) },
    ping: { range: fx(42), cooldown: secs(5), revealTicks: secs(3), selfRevealTicks: secs(4) }
  }
};
var RULES_S1 = {
  version: "s1.2.0",
  tickHz: TICK_HZ,
  maxTicks: 4800,
  width: 128,
  height: 128,
  heightScale: fx(0.05),
  units: { scout, mbt, artillery },
  squad: ["scout", "mbt", "artillery"],
  terrainSpeed: {
    [0 /* Plain */]: FP,
    [1 /* Forest */]: fx(0.5),
    [2 /* Water */]: 0,
    [3 /* Ford */]: fx(0.6),
    [4 /* Rock */]: 0
  },
  forestSensorFactor: fx(0.85),
  forestStopsShellsAfter: 4,
  hill: { radius: fx(6), pointsPerTick: 1, lockAfter: secs(60), debounce: 10 },
  startupTicks: secs(2),
  say: { maxLength: 80, cooldown: 20 }
};
var RULES_S2 = {
  ...RULES_S1,
  version: "s2.0.0",
  season: "s2",
  units: {
    scout,
    mbt,
    artillery: { ...artillery, ammo: 10 },
    drone,
    missile,
    engineer,
    apc
  },
  squad: ["scout", "mbt", "artillery"],
  draft: {
    roster: ["scout", "mbt", "artillery", "drone", "missile", "engineer", "apc"],
    costs: { scout: 2, mbt: 4, artillery: 4, drone: 2, missile: 4, engineer: 3, apc: 3 },
    budget: 12,
    min: 3,
    max: 5
  },
  objectives: {
    pairs: 1,
    radius: fx(5),
    weight: [1, 3],
    centre: "seeded",
    minCentreDist: 24,
    maxCentreDist: 48,
    minSpawnDist: 20
  },
  resupply: { radius: fx(3), ticksPerRound: secs(3) },
  terrainSpeed: {
    ...RULES_S1.terrainSpeed,
    [5 /* Road */]: fx(1.6),
    [6 /* Ruin */]: 0,
    [7 /* Bridge */]: FP
  },
  fogSensorFactor: fx(0.5),
  heightAdvantage: { minDelta: 20, rangeBonus: fx(1.15) },
  bridge: { hp: 60, breakSplash: 20 },
  elevatedFire: true,
  lockRequiresNoComeback: true
};
var { lockRequiresNoComeback: _noComeback, ...S2_BASE } = RULES_S2;
var RULES_S2_PREVIEW_2 = { ...S2_BASE, version: "s2.0.0-preview.2" };
var RULES_S2_PREVIEW_3 = { ...RULES_S2, version: "s2.0.0-preview.3" };
var RULES_SUB = {
  ...RULES_S2,
  version: "sub-s1.0.0",
  season: "s2",
  theater: "sub",
  units: { ssk, ssn, ssgn, uuv, minelayer },
  squad: ["ssk", "ssn", "ssgn"],
  draft: {
    roster: ["ssk", "ssn", "ssgn", "uuv", "minelayer"],
    costs: { ssk: 4, ssn: 4, ssgn: 4, uuv: 2, minelayer: 3 },
    budget: 12,
    min: 3,
    max: 5
  },
  terrainSpeed: {
    [0 /* Plain */]: FP,
    [1 /* Forest */]: fx(0.85),
    [2 /* Water */]: fx(1.1),
    [3 /* Ford */]: fx(1.05),
    [4 /* Rock */]: 0,
    [5 /* Road */]: fx(1.25),
    [6 /* Ruin */]: 0,
    [7 /* Bridge */]: fx(1.15)
  },
  forestSensorFactor: fx(0.97),
  forestStopsShellsAfter: 0,
  sub: {
    cavitationSpeedFrac: fx(0.65),
    thermoclineFactor: fx(0.5),
    pinpointFrac: fx(0.42),
    shoalHeight: 205,
    depthTransitionTicks: secs(2),
    deepSplashFactor: fx(0.75),
    shallowSpeedBonus: fx(1.08),
    transientTicks: secs(2),
    decoySeduceRadius: fx(7)
  }
};
var RULES_URBAN_PREVIEW_2 = {
  ...RULES_S2,
  version: "urban-s1.0.0-preview.2",
  theater: "armor",
  terrainSpeed: { ...RULES_S2.terrainSpeed, [8 /* Building */]: 0 },
  objectives: { ...RULES_S2.objectives, sites: true },
  urban: {
    families: [["nature", 3], ["city", 2], ["bridge", 1]],
    arcApex: { base: 60, perTile: 4 },
    hitBand: 4
  }
};
var RULES_URBAN = RULES_URBAN_PREVIEW_2;
var RULESETS = {
  [RULES_S1.version]: RULES_S1,
  [RULES_S2_PREVIEW_2.version]: RULES_S2_PREVIEW_2,
  [RULES_S2_PREVIEW_3.version]: RULES_S2_PREVIEW_3,
  [RULES_S2.version]: RULES_S2,
  [RULES_SUB.version]: RULES_SUB,
  [RULES_URBAN_PREVIEW_2.version]: RULES_URBAN_PREVIEW_2
};
var TERRAIN_REV = {
  "s2.0.0-preview.1": { s2Ramps: 1 },
  "s2.0.0-preview.2": { s2Ramps: 1 },
  "s2.0.0": { heightClamp: true },
  "sub-s1.0.0": { heightClamp: true },
  "urban-s1.0.0-preview.2": { heightClamp: true }
};
function rulesFor(version) {
  return (version ? RULESETS[version] : undefined) ?? RULES_S1;
}
function unitSpec(rules, kind) {
  const s = rules.units[kind];
  if (!s)
    throw new Error(`rules ${rules.version}: no unit kind ${kind}`);
  return s;
}
function rulesHash(r) {
  return hashStr(JSON.stringify(r)).toString(16).padStart(8, "0");
}
function flightTicks(distFx) {
  return secs(2) + Math.round(distFx / FP * (TICK_HZ * 0.05));
}
// ../engine/src/objectives.ts
var tileCentre = (t) => (t << FP_SHIFT) + FP / 2;
function placeObjectives(map, rules, seed) {
  const centre = {
    x: map.width << FP_SHIFT >> 1,
    y: map.height << FP_SHIFT >> 1,
    radius: rules.hill.radius,
    weight: rules.hill.pointsPerTick,
    owner: null,
    state: "empty"
  };
  const o = rules.objectives;
  if (!o)
    return [centre];
  const rng = new Rng(seed >>> 0).fork("objectives");
  if (o.sites && map.sites && map.sites.length)
    return fromSites(map, rules, rng);
  const withCentre = o.centre === "always" || o.centre === "seeded" && rng.int(2) === 0;
  const out = withCentre ? [centre] : [];
  const reach = reachableFrom(map, map.spawns[0]);
  const cx = (map.width - 1) / 2, cy = (map.height - 1) / 2;
  const [s0x, s0y] = map.spawns[0], [s1x, s1y] = map.spawns[1];
  const cands = [];
  for (let y = 2;y < map.height / 2; y += 2)
    for (let x = 2;x < map.width - 2; x += 2) {
      const mx = map.width - 1 - x, my = map.height - 1 - y;
      const i = y * map.width + x, j = my * map.width + mx;
      if (map.terrain[i] !== 0 /* Plain */ || map.terrain[j] !== 0 /* Plain */)
        continue;
      if (!reach[i] || !reach[j])
        continue;
      const dc = Math.hypot(x - cx, y - cy);
      if (dc < o.minCentreDist || dc > o.maxCentreDist)
        continue;
      if (Math.hypot(x - s0x, y - s0y) < o.minSpawnDist || Math.hypot(x - s1x, y - s1y) < o.minSpawnDist)
        continue;
      if (Math.hypot(mx - s0x, my - s0y) < o.minSpawnDist || Math.hypot(mx - s1x, my - s1y) < o.minSpawnDist)
        continue;
      if (!ringPassable(map, x, y, o.radius) || !ringPassable(map, mx, my, o.radius))
        continue;
      const score = map.heights[i] * 4 + rng.int(64);
      cands.push({ x, y, score });
    }
  cands.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= o.pairs)
      break;
    if (chosen.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < o.minCentreDist || Math.hypot(map.width - 1 - p.x - c.x, map.height - 1 - p.y - c.y) < o.minCentreDist))
      continue;
    chosen.push(c);
  }
  for (const c of chosen) {
    const weight = o.weight[0] + rng.int(o.weight[1] - o.weight[0] + 1);
    out.push({ x: tileCentre(c.x), y: tileCentre(c.y), radius: o.radius, weight, owner: null, state: "empty" });
    out.push({ x: tileCentre(map.width - 1 - c.x), y: tileCentre(map.height - 1 - c.y), radius: o.radius, weight, owner: null, state: "empty" });
  }
  if (out.length === 0)
    out.push(centre);
  return out;
}
function fromSites(map, rules, rng) {
  const o = rules.objectives;
  const out = [];
  const centre = map.sites.find((s) => s.kind === "centre");
  if (centre && o.centre !== "never") {
    out.push({ x: centre.x << FP_SHIFT, y: centre.y << FP_SHIFT, radius: rules.hill.radius, weight: centre.weight ?? rules.hill.pointsPerTick, owner: null, state: "empty" });
  }
  const flank = map.sites.filter((s) => s.kind !== "centre");
  for (let i = flank.length - 1;i > 0; i--) {
    const j = rng.int(i + 1);
    const t = flank[i];
    flank[i] = flank[j];
    flank[j] = t;
  }
  for (const s of flank.slice(0, o.pairs)) {
    const weight = s.weight ?? o.weight[0] + rng.int(o.weight[1] - o.weight[0] + 1);
    out.push({ x: s.x << FP_SHIFT, y: s.y << FP_SHIFT, radius: o.radius, weight, owner: null, state: "empty" });
    out.push({ x: map.width - s.x << FP_SHIFT, y: map.height - s.y << FP_SHIFT, radius: o.radius, weight, owner: null, state: "empty" });
  }
  return out;
}
function ringPassable(map, x, y, radiusFx) {
  const r = Math.max(1, radiusFx >> FP_SHIFT);
  let ok = 0, n = 0;
  for (let dy = -r;dy <= r; dy++)
    for (let dx = -r;dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r)
        continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height)
        continue;
      n++;
      if (isPassable(map.terrain[ty * map.width + tx]))
        ok++;
    }
  return n > 0 && ok * 2 >= n;
}
function reachableFrom(map, from) {
  const { width: w, height: h } = map;
  const seen = new Uint8Array(w * h);
  const q = [from[1] * w + from[0]];
  seen[q[0]] = 1;
  for (let qi = 0;qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i - x) / w;
    const nb = [i - 1, i + 1, i - w, i + w];
    const okNb = [x > 0, x < w - 1, y > 0, y < h - 1];
    for (let k = 0;k < 4; k++) {
      const j = nb[k];
      if (!okNb[k] || seen[j] || !isPassable(map.terrain[j]))
        continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}
function objectiveCounts(o, units) {
  let a = 0, b = 0;
  for (const u of units) {
    if (!u.alive)
      continue;
    if (fxLen(u.x - o.x, u.y - o.y) <= o.radius) {
      if (u.side === 0)
        a++;
      else
        b++;
    }
  }
  return [a, b];
}
// ../engine/src/sim.ts
var ENGINE_VERSION = "0.1.0";
var FRONT_ARC = ANG_FULL / 6;
var REAR_ARC = ANG_FULL / 3;

class Match {
  rules;
  rulesHash;
  seed;
  map;
  rng;
  units = [];
  shells = [];
  nextShellId = 1;
  tick = 0;
  score = [0, 0];
  objectives;
  pending;
  totalWeight;
  centreIndex;
  drafts = [null, null];
  spawned = false;
  resupplyTicks = new Map;
  smokes = [];
  mines = [];
  nextFxId = 1;
  bridgeHp = new Map;
  s2;
  sub;
  urban;
  family;
  events = [];
  refused = [[], []];
  over = false;
  winner = null;
  reason = null;
  lastSay = [-1e6, -1e6];
  constructor(seed, opts = {}) {
    this.rules = opts.rules ?? RULES_S1;
    this.rulesHash = rulesHash(this.rules);
    this.seed = seed >>> 0;
    this.s2 = this.rules.season === "s2";
    this.sub = this.rules.theater === "sub";
    const rev = TERRAIN_REV[this.rules.version];
    const { family: forced, ...terrainOpts } = opts.terrain ?? {};
    this.family = this.rules.urban ? forced ?? urbanFamilyFor(this.seed, this.rules.urban.families) : null;
    this.urban = this.family === "city" || this.family === "bridge";
    const urbanParams = this.urban ? { grammar: "urban", urbanFamily: this.family } : null;
    const gen = generateTerrain(this.seed, { ...DEFAULT_PARAMS, width: this.rules.width, height: this.rules.height, ...this.sub ? { grammar: "sub", ...rev ?? {} } : urbanParams ? urbanParams : this.s2 ? { grammar: "s2", ...rev ?? {} } : {}, ...terrainOpts });
    this.map = this.s2 ? { ...gen, terrain: gen.terrain.slice() } : gen;
    this.rng = new Rng(this.seed).fork("match");
    this.objectives = placeObjectives(this.map, this.rules, this.seed);
    this.pending = this.objectives.map(() => null);
    this.totalWeight = this.objectives.reduce((s, o) => s + o.weight, 0);
    const cx = this.rules.width << FP_SHIFT >> 1, cy = this.rules.height << FP_SHIFT >> 1;
    this.centreIndex = this.objectives.findIndex((o) => o.x === cx && o.y === cy);
    if (!this.rules.draft)
      this.start();
  }
  get needsDraft() {
    return !!this.rules.draft && !this.spawned;
  }
  draft(side, kinds) {
    const d = this.rules.draft;
    const fallback = this.rules.squad.slice();
    const refuse = (reason) => {
      this.refuse(side, 0, "draft", reason);
      this.drafts[side] = fallback;
      return { ok: false, reason, squad: fallback };
    };
    if (!d)
      return refuse("no_draft");
    if (this.spawned)
      return refuse("too_late");
    if (!Array.isArray(kinds))
      return refuse("malformed");
    if (kinds.length < d.min || kinds.length > d.max)
      return refuse("size");
    let cost = 0;
    for (const k of kinds) {
      if (typeof k !== "string" || !d.roster.includes(k) || !this.rules.units[k])
        return refuse("unknown_kind");
      cost += d.costs[k] ?? Number.POSITIVE_INFINITY;
    }
    if (cost > d.budget)
      return refuse("budget");
    const squad = kinds.slice();
    this.drafts[side] = squad;
    return { ok: true, reason: null, squad };
  }
  get squads() {
    return [this.drafts[0] ?? this.rules.squad.slice(), this.drafts[1] ?? this.rules.squad.slice()];
  }
  start() {
    if (this.spawned)
      return;
    this.spawned = true;
    this.spawnSquads();
  }
  static DEPTH = {
    scout: 2,
    mbt: 0,
    artillery: -2,
    drone: 4,
    apc: 0,
    missile: -2,
    engineer: -2,
    ssk: 2,
    ssn: 0,
    ssgn: -2,
    uuv: 4,
    minelayer: 0
  };
  spec(kind) {
    return unitSpec(this.rules, kind);
  }
  spawnSquads() {
    let id = 1;
    const [sq0, sq1] = this.squads;
    for (const side of [0, 1]) {
      const [sx, sy] = this.map.spawns[side];
      const facing = side === 0 ? 0 : ANG_FULL / 2;
      const dir = side === 0 ? 1 : -1;
      const kinds = (side === 0 ? sq0 : sq1).slice().sort((a, b) => Math.abs(Match.DEPTH[a] ?? 0) - Math.abs(Match.DEPTH[b] ?? 0));
      const lateral = [0, 2, -2, 4, -4, 6, -6];
      const perDepth = new Map;
      for (const kind of kinds) {
        const depth = Match.DEPTH[kind] ?? 0;
        const n = perDepth.get(depth) ?? 0;
        perDepth.set(depth, n + 1);
        const ox = depth * dir, oy = (lateral[n] ?? 0) * dir;
        const [px, py] = this.findSpawnTile(sx + ox, sy + oy);
        const spec = this.spec(kind);
        this.units.push({
          id: id++,
          side,
          kind,
          x: (px << FP_SHIFT) + FP / 2,
          y: (py << FP_SHIFT) + FP / 2,
          heading: facing,
          turret: facing,
          speed: 0,
          hp: spec.hp,
          maxHp: spec.hp,
          reload: 0,
          reload2: 0,
          alive: true,
          inForest: false,
          blocked: false,
          ammo: spec.ammo ?? -1,
          lockTarget: 0,
          lockTicks: 0,
          charges: { smoke: spec.abilities?.smoke?.charges ?? 0, mine: spec.abilities?.mine?.charges ?? 0 },
          ...this.sub ? {
            depth: "shallow",
            depthCooldown: 0,
            cavitating: false,
            noise: spec.silentNoise ?? fx(0.5),
            pingCooldown: 0,
            pingedUntil: 0,
            pingRevealUntil: 0,
            transientUntil: 0
          } : {}
        });
      }
    }
  }
  findSpawnTile(x0, y0) {
    const taken = new Set(this.units.map((u) => `${u.x >> FP_SHIFT},${u.y >> FP_SHIFT}`));
    for (let r = 0;r < 8; r++)
      for (let dy = -r;dy <= r; dy++)
        for (let dx = -r;dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r)
            continue;
          const x = x0 + dx, y = y0 + dy;
          if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height)
            continue;
          if (!isPassable(this.map.terrain[y * this.map.width + x]))
            continue;
          if (taken.has(`${x},${y}`))
            continue;
          return [x, y];
        }
    return [x0, y0];
  }
  get state() {
    return {
      tick: this.tick,
      units: this.units.map((u) => ({ ...u })),
      shells: this.shells.map((s) => ({ ...s })),
      score: [this.score[0], this.score[1]],
      hillOwner: this.hillOwner,
      hillState: this.hillState,
      objectives: this.objectives.map((o) => ({ ...o })),
      smokes: this.smokes.map((x) => ({ ...x })),
      mines: this.mines.map((x) => ({ ...x })),
      vision: [this.visibleTo(0), this.visibleTo(1)],
      events: this.events.slice(),
      over: this.over,
      winner: this.winner,
      reason: this.reason
    };
  }
  get isOver() {
    return this.over;
  }
  get currentTick() {
    return this.tick;
  }
  get hillOwner() {
    return this.centreIndex >= 0 ? this.objectives[this.centreIndex].owner : null;
  }
  get hillState() {
    return this.centreIndex >= 0 ? this.objectives[this.centreIndex].state : "empty";
  }
  hello(side) {
    return {
      side,
      rules: this.rules,
      rulesHash: this.rulesHash,
      seed: this.seed,
      map: {
        width: this.map.width,
        height: this.map.height,
        heights: Array.from(this.map.heights),
        terrain: Array.from(this.map.terrain),
        spawns: this.map.spawns,
        hash: this.map.hash,
        grammar: this.map.grammar ?? "s1",
        fog: Array.from(this.map.fog ?? []),
        ...this.family ? { family: this.family } : {},
        ...this.urban ? { ground: Array.from(this.map.ground ?? this.map.heights) } : {}
      },
      units: this.units.filter((u) => u.side === side).map((u) => ({ ...u })),
      enemyKinds: this.rules.draft ? [] : this.units.filter((u) => u.side !== side).map((u) => u.kind),
      objectives: this.objectives.map((o) => ({ ...o })),
      ...this.rules.draft ? { draft: { ...this.rules.draft, default: this.rules.squad.slice() } } : {}
    };
  }
  observe(side) {
    const own = this.units.filter((u) => u.side === side && u.alive);
    const enemies = this.units.filter((u) => u.side !== side && u.alive);
    const contacts = [];
    for (const e of enemies) {
      const seenBy = [];
      for (const o of own)
        if (this.canSee(o, e))
          seenBy.push(o.id);
      if (seenBy.length) {
        const spec = this.spec(e.kind);
        contacts.push({
          id: e.id,
          kind: e.kind,
          x: e.x,
          y: e.y,
          heading: e.heading,
          speed: e.speed,
          hpFrac: Math.round(e.hp * 8 / spec.hp) * (FP / 8),
          seenBy,
          ...this.sub ? { depth: e.depth ?? "shallow", cavitating: !!e.cavitating } : {}
        });
      }
    }
    const incoming = [];
    for (const s of this.shells) {
      if (s.side === side || s.mode !== "indirect")
        continue;
      for (const o of own) {
        if (fxLen(s.tx - o.x, s.ty - o.y) <= this.spec(o.kind).sensorRange) {
          incoming.push({ x: s.tx, y: s.ty, ticks: s.ticksLeft });
          break;
        }
      }
    }
    return {
      tick: this.tick,
      side,
      units: this.units.filter((u) => u.side === side).map((u) => ({ ...u })),
      contacts,
      incoming,
      score: [this.score[0], this.score[1]],
      hillOwner: this.hillOwner,
      objectives: this.objectives.map((o) => ({ ...o })),
      smokes: this.smokes.map((x) => ({ ...x })),
      mines: this.mines.filter((m) => m.side === side).map((x) => ({ ...x })),
      canMove: this.tick >= this.rules.startupTicks,
      lastRefused: this.refused[side].slice(),
      ...this.sub ? { bearings: this.passiveBearings(side, own, enemies) } : {}
    };
  }
  acousticLos(ox, oy, oDepth, tx, ty, tDepth, range) {
    const dx = tx - ox, dy = ty - oy;
    const dist = fxLen(dx, dy);
    let effectiveRange = range;
    if (oDepth !== tDepth && dist > fx(6)) {
      effectiveRange = fxMul(effectiveRange, this.rules.sub?.thermoclineFactor ?? fx(0.5));
    }
    if (dist > effectiveRange)
      return { visible: false, effectiveRange };
    if (this.smokes.some((sm) => segmentHitT(ox, oy, tx, ty, sm.x, sm.y, sm.radius) !== null)) {
      return { visible: false, effectiveRange };
    }
    const fogFactor = this.rules.fogSensorFactor ?? FOG_SENSOR_FACTOR;
    const forestFactor = this.rules.forestSensorFactor;
    let fogged = false;
    const oTile = (oy >> FP_SHIFT) * this.map.width + (ox >> FP_SHIFT);
    if (this.map.fog && this.map.fog[oTile] === 1) {
      fogged = true;
      effectiveRange = fxMul(effectiveRange, fogFactor);
      if (dist > effectiveRange)
        return { visible: false, effectiveRange };
    }
    const steps = Math.max(1, dist >> FP_SHIFT - 1);
    let lastTile = -1;
    for (let i = 1;i < steps; i++) {
      const f = fxDiv(i * FP, steps * FP);
      const sx = ox + fxMul(dx, f), sy = oy + fxMul(dy, f);
      const tile = (sy >> FP_SHIFT) * this.map.width + (sx >> FP_SHIFT);
      if (heightAt(this.map, sx, sy) > 205)
        return { visible: false, effectiveRange };
      if (tile !== lastTile) {
        lastTile = tile;
        const t = this.map.terrain[tile];
        if (blocksSight(t))
          return { visible: false, effectiveRange };
        if (t === 1 /* Forest */) {
          effectiveRange = fxMul(effectiveRange, forestFactor);
          if (dist > effectiveRange)
            return { visible: false, effectiveRange };
        }
        if (!fogged && this.map.fog && this.map.fog[tile] === 1) {
          fogged = true;
          effectiveRange = fxMul(effectiveRange, fogFactor);
          if (dist > effectiveRange)
            return { visible: false, effectiveRange };
        }
      }
    }
    if (terrainAt(this.map, tx, ty) === 1 /* Forest */) {
      effectiveRange = fxMul(effectiveRange, forestFactor);
      if (dist > effectiveRange)
        return { visible: false, effectiveRange };
    }
    const tTile = (ty >> FP_SHIFT) * this.map.width + (tx >> FP_SHIFT);
    if (!fogged && this.map.fog && this.map.fog[tTile] === 1) {
      effectiveRange = fxMul(effectiveRange, fogFactor);
      if (dist > effectiveRange)
        return { visible: false, effectiveRange };
    }
    return { visible: true, effectiveRange };
  }
  passiveBearings(side, own, enemies) {
    const out = [];
    for (const o of own) {
      const so = this.spec(o.kind);
      const oDepth = o.depth ?? "shallow";
      for (const e of enemies) {
        const se = this.spec(e.kind);
        const noise = e.noise ?? se.silentNoise ?? fx(0.5);
        const range = fxMul(so.sensorRange, noise);
        const dist = fxLen(e.x - o.x, e.y - o.y);
        const los = this.acousticLos(o.x, o.y, oDepth, e.x, e.y, e.depth ?? "shallow", range);
        if (!los.visible)
          continue;
        const ratio = fxDiv(dist, Math.max(1, los.effectiveRange));
        const strength = ratio < fx(0.45) ? "loud" : ratio < fx(0.75) ? "clear" : "faint";
        const arc = strength === "loud" ? 28 : strength === "clear" ? 64 : 120;
        const trueAng = fxAtan2(e.y - o.y, e.x - o.x);
        const h = hashStr(`${this.seed}:${this.tick >> 2}:${o.id}:${e.id}`);
        const jitter = arc > 0 ? h % (2 * arc + 1) - arc : 0;
        out.push({
          fromUnit: o.id,
          angle: angNorm(trueAng + jitter),
          arc,
          strength,
          cavitating: !!e.cavitating || (e.transientUntil ?? 0) > this.tick,
          depth: e.depth ?? "shallow"
        });
      }
      for (const sm of this.smokes) {
        if (sm.side === side)
          continue;
        const dist = fxLen(sm.x - o.x, sm.y - o.y);
        if (dist > so.sensorRange)
          continue;
        const trueAng = fxAtan2(sm.y - o.y, sm.x - o.x);
        const h = hashStr(`${this.seed}:${this.tick >> 2}:${o.id}:sm${sm.id}`);
        const arc = 28;
        const jitter = h % (2 * arc + 1) - arc;
        out.push({
          fromUnit: o.id,
          angle: angNorm(trueAng + jitter),
          arc,
          strength: "loud",
          cavitating: true,
          depth: "shallow"
        });
      }
    }
    return out;
  }
  visibleTo(side) {
    const own = this.units.filter((u) => u.side === side && u.alive);
    const out = [];
    for (const e of this.units) {
      if (e.side === side || !e.alive)
        continue;
      if (own.some((o) => this.canSee(o, e)))
        out.push(e.id);
    }
    return out;
  }
  canSee(o, e) {
    const so = this.spec(o.kind), se = this.spec(e.kind);
    if (this.smokes.length && !so.air) {
      for (const sm of this.smokes)
        if (segmentHitT(o.x, o.y, e.x, e.y, sm.x, sm.y, sm.radius) !== null)
          return false;
    }
    const fogFactor = this.rules.fogSensorFactor ?? FOG_SENSOR_FACTOR;
    if (this.sub) {
      const oDepth = o.depth ?? "shallow", eDepth = e.depth ?? "shallow";
      if ((e.pingRevealUntil ?? 0) > this.tick) {
        if (this.acousticLos(o.x, o.y, oDepth, e.x, e.y, eDepth, fx(96)).visible)
          return true;
      }
      if ((e.pingedUntil ?? 0) > this.tick) {
        if (this.acousticLos(o.x, o.y, oDepth, e.x, e.y, eDepth, fxMul(so.sensorRange, fx(1.6))).visible)
          return true;
      }
      const subRules = this.rules.sub;
      const noise = e.noise ?? se.silentNoise ?? fx(0.5);
      const range = Math.max(fx(5), fxMul(fxMul(so.sensorRange, noise), subRules?.pinpointFrac ?? fx(0.42)));
      return this.acousticLos(o.x, o.y, oDepth, e.x, e.y, eDepth, range).visible;
    }
    if (this.urban)
      return lineOfSightUrban(this.map, o.x, o.y, so.eyeHeight, e.x, e.y, se.eyeHeight >> 1, so.sensorRange, this.rules.forestSensorFactor, fogFactor).visible;
    return lineOfSight(this.map, o.x, o.y, so.eyeHeight, e.x, e.y, se.eyeHeight >> 1, so.sensorRange, this.rules.forestSensorFactor, fogFactor).visible;
  }
  step(orders) {
    if (this.over)
      return [];
    this.start();
    this.events = [];
    this.refused = [[], []];
    const canMove = this.tick >= this.rules.startupTicks;
    const applied = new Map;
    for (const side of [0, 1]) {
      const o = orders[side];
      if (!o)
        continue;
      if (o.tick !== this.tick) {
        this.refuse(side, 0, "tick", "wrong_tick");
        continue;
      }
      if (o.say !== undefined) {
        if (typeof o.say !== "string" || o.say.length === 0 || o.say.length > this.rules.say.maxLength)
          this.refuse(side, 0, "say", "malformed");
        else if (this.tick - this.lastSay[side] < this.rules.say.cooldown)
          this.refuse(side, 0, "say", "cooldown");
        else {
          this.lastSay[side] = this.tick;
          this.events.push({ kind: "say", side, text: o.say });
        }
      }
      for (const uo of o.units ?? []) {
        const u = this.units.find((x) => x.id === uo.id);
        if (!u || u.side !== side) {
          this.refuse(side, uo.id, "unit", "not_yours");
          continue;
        }
        if (!u.alive) {
          this.refuse(side, uo.id, "unit", "dead");
          continue;
        }
        if (applied.has(u.id)) {
          this.refuse(side, uo.id, "unit", "duplicate");
          continue;
        }
        applied.set(u.id, uo);
      }
    }
    if (this.smokes.length)
      this.smokes = this.smokes.filter((sm) => sm.until > this.tick);
    let visionCache = [null, null];
    const sideSees = (side, id) => {
      if (!visionCache[side])
        visionCache[side] = this.visibleTo(side);
      return visionCache[side].includes(id);
    };
    for (const u of this.units) {
      if (!u.alive)
        continue;
      const spec = this.spec(u.kind);
      const uo = applied.get(u.id);
      u.blocked = false;
      if (spec.gun.lockTicks) {
        const t = uo?.target;
        const tgt = t !== undefined ? this.units.find((x) => x.id === t) : undefined;
        if (t !== undefined && (!Number.isInteger(t) || !tgt || tgt.side === u.side)) {
          this.refuse(u.side, u.id, "target", "malformed");
          u.lockTarget = 0;
          u.lockTicks = 0;
        } else if (tgt && tgt.alive && sideSees(u.side, tgt.id)) {
          if (u.lockTarget === tgt.id)
            u.lockTicks++;
          else {
            u.lockTarget = tgt.id;
            u.lockTicks = 1;
          }
          if (u.lockTicks === spec.gun.lockTicks)
            this.events.push({ kind: "lock", unit: u.id, target: tgt.id });
        } else {
          u.lockTarget = 0;
          u.lockTicks = 0;
        }
      }
      let desiredTurret = null;
      if (uo?.aimAt) {
        if (!isPoint(uo.aimAt))
          this.refuse(u.side, u.id, "aimAt", "malformed");
        else
          desiredTurret = fxAtan2(uo.aimAt[1] - u.y, uo.aimAt[0] - u.x);
      } else if (uo && typeof uo.turret === "number") {
        if (!Number.isInteger(uo.turret))
          this.refuse(u.side, u.id, "turret", "malformed");
        else
          desiredTurret = angNorm(uo.turret);
      } else if (Array.isArray(uo?.fire) && spec.gun.mode === "direct") {
        if (isPoint(uo.fire))
          desiredTurret = fxAtan2(uo.fire[1] - u.y, uo.fire[0] - u.x);
      }
      if (desiredTurret !== null && !spec.fixedGun) {
        const d = angDiff(u.turret, desiredTurret);
        u.turret = angNorm(u.turret + fxClamp(d, -spec.turretRate, spec.turretRate));
      }
      let steer = 0, throttle = 0;
      if (uo && (uo.steer !== undefined || uo.throttle !== undefined)) {
        if (!canMove)
          this.refuse(u.side, u.id, "move", "startup");
        else {
          if (uo.steer !== undefined) {
            if (!Number.isInteger(uo.steer))
              this.refuse(u.side, u.id, "steer", "malformed");
            else
              steer = fxClamp(uo.steer, -FP, FP);
          }
          if (uo.throttle !== undefined) {
            if (!Number.isInteger(uo.throttle))
              this.refuse(u.side, u.id, "throttle", "malformed");
            else
              throttle = fxClamp(uo.throttle, -FP, FP);
          }
        }
      }
      const turretRel = angDiff(u.heading, u.turret);
      u.heading = angNorm(u.heading + fxMul(steer, spec.turnRate * FP) / FP);
      if (spec.gun.mode !== "direct" || u.kind === "scout" || spec.fixedGun)
        u.turret = angNorm(u.heading + turretRel);
      if (this.sub) {
        if ((u.depthCooldown ?? 0) > 0)
          u.depthCooldown--;
        if ((u.pingCooldown ?? 0) > 0)
          u.pingCooldown--;
        if (uo && uo.depth !== undefined) {
          if (uo.depth !== "shallow" && uo.depth !== "deep")
            this.refuse(u.side, u.id, "depth", "malformed");
          else if (uo.depth !== u.depth) {
            const shoalH = this.rules.sub?.shoalHeight ?? 165;
            if (u.kind === "minelayer" && uo.depth === "deep")
              this.refuse(u.side, u.id, "depth", "surface_only");
            else if ((u.depthCooldown ?? 0) > 0)
              this.refuse(u.side, u.id, "depth", "cooldown");
            else if (uo.depth === "deep" && heightAt(this.map, u.x, u.y) > shoalH)
              this.refuse(u.side, u.id, "depth", "shoal");
            else {
              u.depth = uo.depth;
              u.depthCooldown = this.rules.sub?.depthTransitionTicks ?? 40;
              this.events.push({ kind: "depth", unit: u.id, side: u.side, depth: u.depth });
            }
          }
        }
      }
      const here = terrainAt(this.map, u.x, u.y);
      let tmul = spec.air ? FP : this.rules.terrainSpeed[here] ?? FP;
      if (this.sub && (u.depth ?? "shallow") === "shallow") {
        tmul = fxMul(tmul, this.rules.sub?.shallowSpeedBonus ?? fx(1.08));
      }
      let target = fxMul(fxMul(throttle, spec.maxSpeed), tmul);
      const ax = u.x + fxCos(u.heading), ay = u.y + fxSin(u.heading);
      const dh = spec.air || this.sub ? 0 : heightAt(this.map, ax, ay) - heightAt(this.map, u.x, u.y);
      if (dh > 0 && throttle > 0)
        target = fxMul(target, fxClamp(FP - dh * FP / 40, fx(0.3), FP));
      const dv = target - u.speed;
      const a = this.sub && throttle === 0 ? Math.max(1, spec.accel >> 2) : dv > 0 === u.speed >= 0 ? spec.accel : spec.accel * 2;
      u.speed += fxClamp(dv, -a, a);
      if (Math.abs(u.speed) < 8)
        u.speed = 0;
      if (u.speed !== 0) {
        const nx = u.x + fxMul(u.speed, fxCos(u.heading));
        const ny = u.y + fxMul(u.speed, fxSin(u.heading));
        const reason = this.blockedAt(u, nx, ny);
        if (!reason) {
          u.x = nx;
          u.y = ny;
        } else {
          const slideX = !this.blockedAt(u, nx, u.y), slideY = !slideX && !this.blockedAt(u, u.x, ny);
          if (slideX) {
            u.x = nx;
            u.speed = fxMul(u.speed, fx(0.6));
          } else if (slideY) {
            u.y = ny;
            u.speed = fxMul(u.speed, fx(0.6));
          } else {
            u.speed = 0;
          }
          u.blocked = true;
          this.events.push({ kind: "blocked", unit: u.id, reason });
        }
      }
      if (this.sub) {
        const shoalH = this.rules.sub?.shoalHeight ?? 165;
        if (u.depth === "deep" && heightAt(this.map, u.x, u.y) > shoalH) {
          u.depth = "shallow";
          this.events.push({ kind: "depth", unit: u.id, side: u.side, depth: "shallow" });
        }
        const cavSpeed = fxMul(spec.maxSpeed, this.rules.sub?.cavitationSpeedFrac ?? fx(0.65));
        u.cavitating = Math.abs(u.speed) > cavSpeed;
        let noise;
        if (u.cavitating) {
          noise = spec.cavitationNoise ?? fx(1.8);
        } else if (throttle === 0 && u.speed === 0 && u.depth === "deep") {
          noise = fx(0.08);
        } else if (throttle === 0) {
          noise = fx(0.15);
        } else {
          noise = spec.silentNoise ?? fx(0.5);
          if (u.depth === "deep")
            noise = fxMul(noise, fx(0.85));
        }
        if ((u.transientUntil ?? 0) > this.tick)
          noise += fx(0.75);
        u.noise = noise;
      }
      u.inForest = !spec.air && terrainAt(this.map, u.x, u.y) === 1 /* Forest */;
      if (u.reload > 0)
        u.reload--;
      if (u.reload2 > 0)
        u.reload2--;
      this.resupply(u, spec.ammo);
    }
    if (this.mines.length) {
      const left = [];
      for (const m of this.mines) {
        let victim = null;
        for (const u of this.units) {
          if (!u.alive || u.side === m.side || this.spec(u.kind).air)
            continue;
          if (fxLen(u.x - m.x, u.y - m.y) <= (m.trigger ?? this.spec(u.kind).abilities?.mine?.triggerRadius ?? fx(0.9)) + this.spec(u.kind).radius) {
            victim = u;
            break;
          }
        }
        if (!victim) {
          left.push(m);
          continue;
        }
        const owner = this.units.find((x) => x.id === m.id && false);
        const dmgSpec = this.mineDamage(m.side);
        const dmg = this.applyDamage(victim, dmgSpec, 1, null);
        this.events.push({ kind: "mine", unit: victim.id, mine: m.id, damage: dmg, x: m.x, y: m.y });
      }
      this.mines = left;
    }
    for (const u of this.units) {
      if (!u.alive)
        continue;
      const uo = applied.get(u.id);
      if (!uo || uo.ability === undefined)
        continue;
      const ab = this.spec(u.kind).abilities;
      if (uo.ability === "smoke") {
        if (!ab?.smoke) {
          this.refuse(u.side, u.id, "ability", "no_ability");
          continue;
        }
        if (u.charges.smoke <= 0) {
          this.refuse(u.side, u.id, "ability", "no_charges");
          continue;
        }
        u.charges.smoke--;
        this.smokes.push({ id: this.nextFxId++, side: u.side, x: u.x, y: u.y, radius: ab.smoke.radius, until: this.tick + ab.smoke.duration });
        this.events.push({ kind: "ability", unit: u.id, side: u.side, ability: "smoke", x: u.x, y: u.y });
      } else if (uo.ability === "mine") {
        if (!ab?.mine) {
          this.refuse(u.side, u.id, "ability", "no_ability");
          continue;
        }
        if (u.charges.mine <= 0) {
          this.refuse(u.side, u.id, "ability", "no_charges");
          continue;
        }
        const hereT = terrainAt(this.map, u.x, u.y);
        const passableHere = this.sub ? hereT !== 4 /* Rock */ && hereT !== 6 /* Ruin */ : isPassable(hereT);
        if (this.spec(u.kind).air || !passableHere) {
          this.refuse(u.side, u.id, "ability", "terrain");
          continue;
        }
        u.charges.mine--;
        this.mines.push(this.sub ? { id: this.nextFxId++, side: u.side, x: u.x, y: u.y, trigger: ab.mine.triggerRadius } : { id: this.nextFxId++, side: u.side, x: u.x, y: u.y });
        this.events.push({ kind: "ability", unit: u.id, side: u.side, ability: "mine", x: u.x, y: u.y });
      } else if (uo.ability === "ping") {
        if (!ab?.ping) {
          this.refuse(u.side, u.id, "ability", "no_ability");
          continue;
        }
        if ((u.pingCooldown ?? 0) > 0) {
          this.refuse(u.side, u.id, "ability", "cooldown");
          continue;
        }
        u.pingCooldown = ab.ping.cooldown;
        u.pingRevealUntil = Math.max(u.pingRevealUntil ?? 0, this.tick + ab.ping.selfRevealTicks);
        const revealed = [];
        for (const e of this.units) {
          if (!e.alive || e.side === u.side)
            continue;
          const parkedOnBottom = e.depth === "deep" && e.speed === 0;
          const pingRange = parkedOnBottom ? fxMul(ab.ping.range, fx(0.45)) : ab.ping.range;
          if (this.acousticLos(u.x, u.y, u.depth ?? "shallow", e.x, e.y, e.depth ?? "shallow", pingRange).visible) {
            e.pingedUntil = Math.max(e.pingedUntil ?? 0, this.tick + ab.ping.revealTicks);
            revealed.push(e.id);
          }
        }
        this.events.push({ kind: "ping", unit: u.id, side: u.side, x: u.x, y: u.y, range: ab.ping.range, revealed });
      } else
        this.refuse(u.side, u.id, "ability", "malformed");
    }
    for (const u of this.units) {
      if (!u.alive)
        continue;
      const uo = applied.get(u.id);
      if (!uo || !uo.fire)
        continue;
      const spec = this.spec(u.kind);
      if (spec.gun.mode !== "direct" && uo.fire === true || this.sub && spec.gun.mode === "direct" && spec.secondary && uo.fire === true && (u.reload > 0 || u.ammo === 0) && u.reload2 === 0) {
        if (!spec.secondary) {
          this.refuse(u.side, u.id, "fire", spec.gun.mode === "none" ? "no_weapon" : "missing_target");
          continue;
        }
        if (u.reload2 > 0) {
          this.refuse(u.side, u.id, "fire", "reloading");
          continue;
        }
        this.fireDirect(u, spec.secondary, spec.radius, "secondary");
        u.reload2 = spec.secondary.reload;
        if (this.sub)
          u.transientUntil = this.tick + (this.rules.sub?.transientTicks ?? 40);
        continue;
      }
      if (spec.gun.mode === "none") {
        this.refuse(u.side, u.id, "fire", "no_weapon");
        continue;
      }
      if (this.sub && spec.requireShallowFire && (u.depth ?? "shallow") !== "shallow") {
        this.refuse(u.side, u.id, "fire", "depth");
        continue;
      }
      if (u.reload > 0) {
        this.refuse(u.side, u.id, "fire", "reloading");
        continue;
      }
      if (u.ammo === 0) {
        this.refuse(u.side, u.id, "fire", "ammo");
        continue;
      }
      if (spec.gun.lockTicks) {
        const tgt = this.units.find((x) => x.id === u.lockTarget);
        if (uo.fire !== true) {
          this.refuse(u.side, u.id, "fire", "malformed");
          continue;
        }
        if (!tgt || !tgt.alive || u.lockTicks < spec.gun.lockTicks) {
          this.refuse(u.side, u.id, "fire", "lock");
          continue;
        }
        const dist = fxLen(tgt.x - u.x, tgt.y - u.y);
        if (dist < spec.gun.minRange || dist > spec.gun.maxRange) {
          this.refuse(u.side, u.id, "fire", "range");
          continue;
        }
        this.fireHoming(u, spec.gun, spec.radius, tgt);
        u.reload = spec.gun.reload;
        if (u.ammo > 0)
          u.ammo--;
        if (this.sub)
          u.transientUntil = this.tick + (this.rules.sub?.transientTicks ?? 40);
        continue;
      }
      if (spec.gun.mode === "direct") {
        if (Array.isArray(uo.fire)) {
          if (!isPoint(uo.fire)) {
            this.refuse(u.side, u.id, "fire", "malformed");
            continue;
          }
          if (spec.gun.minRange > 0) {
            const dist = fxLen(uo.fire[0] - u.x, uo.fire[1] - u.y);
            if (dist < spec.gun.minRange || dist > spec.gun.maxRange) {
              this.refuse(u.side, u.id, "fire", "range");
              continue;
            }
          }
          const want = fxAtan2(uo.fire[1] - u.y, uo.fire[0] - u.x);
          if (Math.abs(angDiff(u.turret, want)) > spec.gun.aimTolerance) {
            this.refuse(u.side, u.id, "fire", "aim");
            continue;
          }
        }
        this.fireDirect(u, spec.gun, spec.radius, "main", Array.isArray(uo.fire) ? uo.fire : null);
        u.reload = spec.gun.reload;
        if (u.ammo > 0)
          u.ammo--;
        if (this.sub)
          u.transientUntil = this.tick + (this.rules.sub?.transientTicks ?? 40);
      } else {
        if (!isPoint(uo.fire)) {
          this.refuse(u.side, u.id, "fire", "missing_target");
          continue;
        }
        const [tx, ty] = uo.fire;
        const dist = fxLen(tx - u.x, ty - u.y);
        if (dist < spec.gun.minRange || dist > spec.gun.maxRange) {
          this.refuse(u.side, u.id, "fire", "range");
          continue;
        }
        const r = fxMul(spec.gun.dispersion, fxDiv(dist, spec.gun.maxRange));
        const ang = this.rng.int(ANG_FULL), mag = fxMul(r, this.rng.fx());
        const ix = fxClamp(tx + fxMul(mag, fxCos(ang)), 0, (this.map.width << FP_SHIFT) - 1);
        const iy = fxClamp(ty + fxMul(mag, fxSin(ang)), 0, (this.map.height << FP_SHIFT) - 1);
        const id = this.nextShellId++;
        const arc = this.urban ? this.arcImpact(u, spec, ix, iy) : null;
        const landX = arc ? arc.x : ix, landY = arc ? arc.y : iy;
        const flight = arc ? Math.max(1, Math.trunc(flightTicks(dist) * arc.t / FP)) : flightTicks(dist);
        this.shells.push({
          id,
          side: u.side,
          shooter: u.id,
          mode: "indirect",
          x: u.x,
          y: u.y,
          tx: landX,
          ty: landY,
          vx: 0,
          vy: 0,
          z: 0,
          ticksLeft: flight,
          damage: spec.gun.damage,
          splash: spec.gun.splash,
          forest: 0,
          homing: 0,
          dz: 0
        });
        u.reload = spec.gun.reload;
        if (u.ammo > 0)
          u.ammo--;
        if (this.sub)
          u.transientUntil = this.tick + (this.rules.sub?.transientTicks ?? 40);
        this.events.push({ kind: "fire", unit: u.id, shell: id, mode: "indirect", x: u.x, y: u.y, angle: fxAtan2(iy - u.y, ix - u.x), tx: landX, ty: landY, weapon: "main", ...arc ? { intercepted: true } : {} });
      }
    }
    const keep = [];
    for (const s of this.shells) {
      if (s.mode === "direct") {
        const { x: ox, y: oy } = s;
        if (this.sub) {
          const seduceR = this.rules.sub?.decoySeduceRadius ?? fx(7);
          let seduced = null, seduceD = seduceR + 1;
          for (const sm of this.smokes) {
            if (sm.side === s.side)
              continue;
            const d = fxLen(sm.x - s.x, sm.y - s.y);
            if (d <= seduceR && d < seduceD) {
              seduced = sm;
              seduceD = d;
            }
          }
          if (seduced) {
            s.homing = -seduced.id;
            const spd = fxLen(s.vx, s.vy);
            if (seduceD > 0) {
              s.vx = fxDiv(fxMul(seduced.x - s.x, spd), seduceD);
              s.vy = fxDiv(fxMul(seduced.y - s.y, spd), seduceD);
            }
            s.tx = seduced.x;
            s.ty = seduced.y;
            if (seduceD <= fx(0.9)) {
              this.events.push({ kind: "ground", shell: s.id, x: s.x, y: s.y });
              continue;
            }
          } else if (s.homing < 0) {
            s.homing = 0;
          }
          if (s.homing === 0) {
            const shooterUnit = this.units.find((x) => x.id === s.shooter);
            const seekR = shooterUnit ? this.spec(shooterUnit.kind).terminalHomingRadius ?? 0 : 0;
            if (seekR > 0) {
              const sAng = fxAtan2(s.vy, s.vx);
              let best = null, bestD = seekR + 1;
              for (const u of this.units) {
                if (!u.alive || u.side === s.side)
                  continue;
                const d = fxLen(u.x - s.x, u.y - s.y);
                if (d > seekR || d >= bestD)
                  continue;
                if (Math.abs(angDiff(sAng, fxAtan2(u.y - s.y, u.x - s.x))) > ANG_FULL / 6)
                  continue;
                if (this.smokes.some((sm) => segmentHitT(s.x, s.y, u.x, u.y, sm.x, sm.y, sm.radius) !== null))
                  continue;
                best = u;
                bestD = d;
              }
              if (best) {
                s.homing = best.id;
                this.events.push({ kind: "lock", unit: s.shooter, target: best.id });
              }
            }
          }
        }
        if (s.homing > 0) {
          const tgt = this.units.find((x) => x.id === s.homing);
          if (tgt && tgt.alive) {
            const d = fxLen(tgt.x - s.x, tgt.y - s.y), spd = fxLen(s.vx, s.vy);
            if (d > 0) {
              s.vx = fxDiv(fxMul(tgt.x - s.x, spd), d);
              s.vy = fxDiv(fxMul(tgt.y - s.y, spd), d);
            }
            s.tx = tgt.x;
            s.ty = tgt.y;
          }
        }
        const oz = s.z;
        s.x += s.vx;
        s.y += s.vy;
        s.z += s.dz;
        s.ticksLeft--;
        if (this.urban) {
          if (this.urbanShellFlies(s, ox, oy, oz))
            keep.push(s);
          continue;
        }
        let hit = null, hitT = FP + 1;
        for (const u of this.units) {
          if (!u.alive || u.side === s.side)
            continue;
          const t = segmentHitT(ox, oy, s.x, s.y, u.x, u.y, this.spec(u.kind).radius + fx(0.15));
          if (t !== null && t < hitT) {
            hitT = t;
            hit = u;
          }
        }
        if (hit) {
          const facing = this.facingOf(hit, ox, oy);
          const hx = ox + fxMul(s.x - ox, hitT), hy = oy + fxMul(s.y - oy, hitT);
          const dmg = this.applyDamage(hit, s.damage, facing, s.shooter, hx, hy);
          this.events.push({ kind: "hit", shell: s.id, unit: hit.id, damage: dmg, facing, x: hx, y: hy });
          if (s.splash > 0)
            this.splash(s, hit.x, hit.y, hit.id);
          continue;
        }
        if (terrainAt(this.map, s.x, s.y) === 1 /* Forest */ && (s.x >> FP_SHIFT !== ox >> FP_SHIFT || s.y >> FP_SHIFT !== oy >> FP_SHIFT))
          s.forest++;
        const treed = !s.homing && this.rules.forestStopsShellsAfter > 0 && s.forest >= this.rules.forestStopsShellsAfter;
        const out = s.x < 0 || s.y < 0 || s.x >= this.map.width << FP_SHIFT || s.y >= this.map.height << FP_SHIFT;
        const hereTile = !out ? terrainAt(this.map, s.x, s.y) : 4 /* Rock */;
        const terrainHit = this.sub ? !out && (hereTile === 4 /* Rock */ || blocksSight(hereTile)) : !s.homing && (heightAt(this.map, s.x, s.y) > s.z || !out && blocksSight(hereTile));
        if (out || treed || s.ticksLeft <= 0 || terrainHit) {
          this.events.push({ kind: "ground", shell: s.id, x: s.x, y: s.y });
          continue;
        }
        keep.push(s);
      } else {
        s.ticksLeft--;
        if (s.ticksLeft <= 0) {
          this.splash(s, s.tx, s.ty, null);
          this.events.push({ kind: "ground", shell: s.id, x: s.tx, y: s.ty });
          continue;
        }
        keep.push(s);
      }
    }
    this.shells = keep;
    for (let i = 0;i < this.objectives.length; i++) {
      const o = this.objectives[i];
      let a = 0, b = 0, mult = [1, 1];
      for (const u of this.units) {
        if (!u.alive || fxLen(u.x - o.x, u.y - o.y) > o.radius)
          continue;
        if (u.side === 0)
          a++;
        else
          b++;
        const cw = this.spec(u.kind).captureWeight ?? 1;
        if (cw > mult[u.side])
          mult[u.side] = cw;
      }
      const owner = a > 0 && b === 0 ? 0 : b > 0 && a === 0 ? 1 : null;
      const state = owner !== null ? "held" : a > 0 && b > 0 ? "contested" : "empty";
      if (owner !== null)
        this.score[owner] += o.weight * mult[owner];
      if (owner === o.owner && state === o.state)
        this.pending[i] = null;
      else {
        let p = this.pending[i];
        if (!p || p.owner !== owner || p.state !== state)
          p = this.pending[i] = { owner, state, since: this.tick };
        if (this.tick - p.since + 1 >= this.rules.hill.debounce) {
          o.owner = owner;
          o.state = state;
          this.pending[i] = null;
          this.events.push({ kind: "hill", side: owner, state, objective: i });
        }
      }
    }
    this.tick++;
    const alive0 = this.units.some((u) => u.side === 0 && u.alive);
    const alive1 = this.units.some((u) => u.side === 1 && u.alive);
    const remaining = (this.rules.maxTicks - this.tick) * this.totalWeight;
    const lead = this.score[0] - this.score[1];
    if (!alive0 || !alive1)
      this.finish(alive0 ? 0 : alive1 ? 1 : null, "eliminated");
    else if (this.tick >= this.rules.hill.lockAfter && Math.abs(lead) > remaining && !this.comebackPossible(lead > 0 ? 1 : 0))
      this.finish(lead > 0 ? 0 : 1, "hill_locked");
    else if (this.tick >= this.rules.maxTicks) {
      if (this.score[0] !== this.score[1])
        this.finish(this.score[0] > this.score[1] ? 0 : 1, "hill");
      else {
        const hp = (side) => this.units.filter((u) => u.side === side).reduce((s, u) => s + fxDiv(u.hp * FP, this.spec(u.kind).hp * FP), 0);
        const h0 = hp(0), h1 = hp(1);
        this.finish(h0 === h1 ? null : h0 > h1 ? 0 : 1, h0 === h1 ? "draw" : "hp");
      }
    }
    return this.events;
  }
  fireDirect(u, gun, radius, weapon, aim = null) {
    const id = this.nextShellId++;
    const launchAng = this.sub && aim ? fxAtan2(aim[1] - u.y, aim[0] - u.x) : u.turret;
    const vx = fxMul(gun.shellSpeed, fxCos(launchAng)), vy = fxMul(gun.shellSpeed, fxSin(launchAng));
    const sx = u.x + fxMul(radius + fx(0.2), fxCos(launchAng)), sy = u.y + fxMul(radius + fx(0.2), fxSin(launchAng));
    let range = gun.maxRange;
    const ha = this.rules.heightAdvantage;
    if (ha && !this.sub) {
      const fx0 = sx + fxMul(gun.maxRange, fxCos(launchAng)), fy0 = sy + fxMul(gun.maxRange, fxSin(launchAng));
      const level = this.urban ? (x, y) => this.groundAt(x, y) : (x, y) => heightAt(this.map, x, y);
      const far = level(fxClamp(fx0, 0, (this.map.width << FP_SHIFT) - 1), fxClamp(fy0, 0, (this.map.height << FP_SHIFT) - 1));
      if (level(u.x, u.y) - far >= ha.minDelta)
        range = fxMul(range, ha.rangeBonus);
    }
    const tx = sx + fxMul(range, fxCos(launchAng)), ty = sy + fxMul(range, fxSin(launchAng));
    const z = heightAt(this.map, u.x, u.y) + this.spec(u.kind).eyeHeight;
    const ticks = Math.ceil(range / gun.shellSpeed);
    let dz = 0;
    if (this.rules.elevatedFire && !this.sub) {
      const [ax, ay] = aim ?? [tx, ty];
      const cx = fxClamp(ax, 0, (this.map.width << FP_SHIFT) - 1), cy = fxClamp(ay, 0, (this.map.height << FP_SHIFT) - 1);
      const dist = Math.max(1, fxLen(cx - sx, cy - sy));
      const zt = (this.urban ? this.groundAt(cx, cy) : heightAt(this.map, cx, cy)) + 3;
      dz = Math.round((zt - z) * gun.shellSpeed / dist);
    }
    this.shells.push({
      id,
      side: u.side,
      shooter: u.id,
      mode: "direct",
      x: sx,
      y: sy,
      tx,
      ty,
      vx,
      vy,
      z,
      ticksLeft: ticks,
      damage: gun.damage,
      splash: gun.splash,
      forest: 0,
      homing: 0,
      dz
    });
    this.events.push({ kind: "fire", unit: u.id, shell: id, mode: "direct", x: sx, y: sy, angle: launchAng, tx, ty, weapon });
  }
  fireHoming(u, gun, radius, tgt) {
    const id = this.nextShellId++;
    const ang = fxAtan2(tgt.y - u.y, tgt.x - u.x);
    const vx = fxMul(gun.shellSpeed, fxCos(ang)), vy = fxMul(gun.shellSpeed, fxSin(ang));
    const sx = u.x + fxMul(radius + fx(0.2), fxCos(ang)), sy = u.y + fxMul(radius + fx(0.2), fxSin(ang));
    this.shells.push({
      id,
      side: u.side,
      shooter: u.id,
      mode: "direct",
      x: sx,
      y: sy,
      tx: tgt.x,
      ty: tgt.y,
      vx,
      vy,
      z: 255,
      ticksLeft: Math.ceil(fxMul(gun.maxRange, fx(1.5)) / gun.shellSpeed),
      damage: gun.damage,
      splash: gun.splash,
      forest: 0,
      homing: tgt.id,
      dz: 0
    });
    this.events.push({ kind: "fire", unit: u.id, shell: id, mode: "direct", x: sx, y: sy, angle: ang, tx: tgt.x, ty: tgt.y, weapon: "main" });
  }
  mineDamage(side) {
    for (const k of Object.keys(this.rules.units)) {
      const d = this.rules.units[k]?.abilities?.mine?.damage;
      if (d !== undefined)
        return d;
    }
    return 25;
  }
  comebackPossible(side) {
    if (!this.rules.lockRequiresNoComeback)
      return false;
    const left = Math.max(0, this.rules.maxTicks - this.tick);
    let potential = 0, targetHp = 0;
    for (const u of this.units) {
      if (!u.alive)
        continue;
      if (u.side !== side) {
        targetHp += u.hp;
        continue;
      }
      const s = this.spec(u.kind);
      const shots = (gun, reloadNow, ammo) => {
        if (gun.mode === "none" || gun.damage <= 0)
          return 0;
        const n = reloadNow >= left ? 0 : 1 + Math.floor((left - reloadNow) / Math.max(1, gun.reload));
        return ammo >= 0 ? Math.min(n, ammo) : n;
      };
      potential += shots(s.gun, u.reload, u.ammo) * s.gun.damage;
      if (s.secondary)
        potential += shots(s.secondary, u.reload2, -1) * s.secondary.damage;
      const mine = s.abilities?.mine;
      if (mine)
        potential += u.charges.mine * mine.damage;
    }
    return potential >= targetHp;
  }
  resupply(u, capacity) {
    const r = this.rules.resupply;
    if (!r || capacity === undefined || u.ammo >= capacity) {
      this.resupplyTicks.delete(u.id);
      return;
    }
    const [sx, sy] = this.map.spawns[u.side];
    const home = fxLen(u.x - ((sx << FP_SHIFT) + FP / 2), u.y - ((sy << FP_SHIFT) + FP / 2)) <= r.radius;
    if (!home || u.speed !== 0 || u.reload > 0) {
      this.resupplyTicks.delete(u.id);
      return;
    }
    const t = (this.resupplyTicks.get(u.id) ?? 0) + 1;
    if (t >= r.ticksPerRound) {
      u.ammo++;
      this.resupplyTicks.set(u.id, 0);
    } else
      this.resupplyTicks.set(u.id, t);
  }
  finish(winner, reason) {
    this.over = true;
    this.winner = winner;
    this.reason = reason;
    this.events.push({ kind: "end", winner, reason });
  }
  refuse(side, unit, part, reason) {
    this.refused[side].push({ unit, part, reason });
    this.events.push({ kind: "refused", side, unit, part, reason });
  }
  blockedAt(u, nx, ny) {
    const spec = this.spec(u.kind);
    if (nx < spec.radius || ny < spec.radius || nx >= (this.map.width << FP_SHIFT) - spec.radius || ny >= (this.map.height << FP_SHIFT) - spec.radius)
      return "edge";
    if (spec.air) {
      for (const o of this.units) {
        if (o === u || !o.alive || !this.spec(o.kind).air)
          continue;
        if (fxLen(o.x - nx, o.y - ny) < spec.radius + this.spec(o.kind).radius)
          return "unit";
      }
      return null;
    }
    const t = terrainAt(this.map, nx, ny);
    if (this.urban) {
      if (t === 8 /* Building */)
        return "building";
      const ox = u.x >> FP_SHIFT, oy = u.y >> FP_SHIFT, tx = nx >> FP_SHIFT, ty = ny >> FP_SHIFT;
      if (ox !== tx && oy !== ty && !this.groundPassable(tx, oy) && !this.groundPassable(ox, ty))
        return "corner";
    }
    if (t === 4 /* Rock */ || t === 6 /* Ruin */)
      return "rock";
    if (t === 2 /* Water */ && !this.sub)
      return "water";
    for (const o of this.units) {
      if (o === u || !o.alive || this.spec(o.kind).air)
        continue;
      if (fxLen(o.x - nx, o.y - ny) < spec.radius + this.spec(o.kind).radius)
        return "unit";
    }
    return null;
  }
  groundAt(x, y) {
    const g = this.map.ground;
    if (!g)
      return heightAt(this.map, x, y);
    const tx = Math.min(this.map.width - 1, Math.max(0, x >> FP_SHIFT)), ty = Math.min(this.map.height - 1, Math.max(0, y >> FP_SHIFT));
    return g[ty * this.map.width + tx];
  }
  shielded(x, y, u) {
    const map = this.map, own = (u.y >> FP_SHIFT) * map.width + (u.x >> FP_SHIFT);
    const wall = (tile) => tile >= 0 && tile !== own && map.terrain[tile] === 8 /* Building */;
    return traceSegment(map, x, y, u.x, u.y, (tile) => wall(tile), (a, b) => wall(a) && wall(b)) >= 0;
  }
  groundPassable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height)
      return false;
    return isPassable(this.map.terrain[ty * this.map.width + tx]);
  }
  urbanShellFlies(s, ox, oy, oz) {
    const map = this.map, w = map.width;
    const zAt = (t) => oz + Math.trunc((s.z - oz) * t / FP);
    const wall = (tile, t) => tile >= 0 && (blocksSight(map.terrain[tile]) || map.heights[tile] > zAt(t));
    let wallT = -1, treedT = -1, forest = s.forest;
    if (!s.homing) {
      const ix = ox >> FP_SHIFT, iy = oy >> FP_SHIFT;
      const here = ix >= 0 && iy >= 0 && ix < w && iy < map.height ? iy * w + ix : -1;
      if (here >= 0 && (blocksSight(map.terrain[here]) || map.heights[here] > oz))
        wallT = 0;
      else
        wallT = traceSegment(map, ox, oy, s.x, s.y, (tile, tIn, tOut) => {
          if (tile < 0)
            return false;
          if (blocksSight(map.terrain[tile]) || map.heights[tile] > Math.min(zAt(tIn), zAt(tOut)))
            return true;
          if (map.terrain[tile] === 1 /* Forest */ && this.rules.forestStopsShellsAfter > 0 && treedT < 0 && ++forest >= this.rules.forestStopsShellsAfter)
            treedT = tIn;
          return false;
        }, (a, b, t) => wall(a, t) && wall(b, t));
    }
    s.forest = forest;
    const stopT = wallT >= 0 && (treedT < 0 || wallT < treedT) ? wallT : treedT;
    let hit = null, hitT = FP + 1;
    for (const u of this.units) {
      if (!u.alive || u.side === s.side)
        continue;
      const t = segmentHitT(ox, oy, s.x, s.y, u.x, u.y, this.spec(u.kind).radius + fx(0.15));
      if (t === null || t >= hitT || stopT >= 0 && t > stopT)
        continue;
      if (!s.homing && zAt(t) > heightAt(map, u.x, u.y) + this.spec(u.kind).eyeHeight + this.rules.urban.hitBand)
        continue;
      hitT = t;
      hit = u;
    }
    if (hit) {
      const facing = this.facingOf(hit, ox, oy);
      const hx = ox + fxMul(s.x - ox, hitT), hy = oy + fxMul(s.y - oy, hitT);
      const dmg = this.applyDamage(hit, s.damage, facing, s.shooter, hx, hy);
      this.events.push({ kind: "hit", shell: s.id, unit: hit.id, damage: dmg, facing, x: hx, y: hy });
      if (s.splash > 0)
        this.splash(s, hit.x, hit.y, hit.id);
      return false;
    }
    if (stopT >= 0) {
      this.events.push({ kind: "ground", shell: s.id, x: ox + fxMul(s.x - ox, stopT), y: oy + fxMul(s.y - oy, stopT) });
      return false;
    }
    const out = s.x < 0 || s.y < 0 || s.x >= map.width << FP_SHIFT || s.y >= map.height << FP_SHIFT;
    if (out || s.ticksLeft <= 0) {
      this.events.push({ kind: "ground", shell: s.id, x: s.x, y: s.y });
      return false;
    }
    return true;
  }
  arcImpact(u, spec, ix, iy) {
    const map = this.map, ap = this.rules.urban.arcApex;
    const d = fxLen(ix - u.x, iy - u.y);
    const apex = ap.base + ap.perTile * (d >> FP_SHIFT);
    const zs = this.groundAt(u.x, u.y) + spec.eyeHeight, zt = this.groundAt(ix, iy);
    const zAt = (t2) => zs + Math.trunc((zt - zs) * t2 / FP) + Math.trunc(4 * apex * fxMul(t2, FP - t2) / FP);
    const target = (iy >> FP_SHIFT) * map.width + (ix >> FP_SHIFT);
    const over = (tile, t2) => tile >= 0 && tile !== target && map.heights[tile] > zAt(t2);
    const t = traceSegment(map, u.x, u.y, ix, iy, (tile, tIn, tOut) => tile >= 0 && tile !== target && map.heights[tile] > Math.min(zAt(tIn), zAt(tOut)), (a, b, tc) => over(a, tc) && over(b, tc));
    if (t < 0)
      return null;
    return { x: u.x + fxMul(ix - u.x, t), y: u.y + fxMul(iy - u.y, t), t };
  }
  facingOf(target, fromX, fromY) {
    const toShooter = fxAtan2(fromY - target.y, fromX - target.x);
    const rel = Math.abs(angDiff(target.heading, toShooter));
    return rel <= FRONT_ARC ? 0 : rel >= REAR_ARC ? 2 : 1;
  }
  applyDamage(u, raw, facing, by, _hx, _hy) {
    const spec = this.spec(u.kind);
    if (spec.damageTaken !== undefined)
      raw = Math.round(raw * spec.damageTaken / FP);
    const dmg = Math.max(1, raw - spec.armor[facing]);
    u.hp -= dmg;
    if (u.hp <= 0) {
      u.hp = 0;
      u.alive = false;
      u.speed = 0;
      this.events.push({ kind: "destroyed", unit: u.id, by, x: u.x, y: u.y });
    }
    return dmg;
  }
  splash(s, x, y, exclude) {
    const victims = [];
    for (const u of this.units) {
      if (!u.alive || u.id === exclude)
        continue;
      const d = fxLen(u.x - x, u.y - y);
      if (d > s.splash)
        continue;
      if (this.urban && this.shielded(x, y, u))
        continue;
      let scaled = s.damage - Math.floor(s.damage * fxDiv(d, s.splash) / (2 * FP));
      if (this.sub && u.depth === "deep") {
        scaled = Math.round(scaled * (this.rules.sub?.deepSplashFactor ?? fx(0.75)) / FP);
      }
      const dmg = this.applyDamage(u, scaled, 1, s.shooter);
      victims.push({ unit: u.id, damage: dmg });
    }
    if (victims.length || exclude === null)
      this.events.push({ kind: "splash", shell: s.id, x, y, radius: s.splash, victims });
    const br = this.rules.bridge;
    if (br && s.damage >= br.breakSplash) {
      const r = Math.max(1, s.splash >> FP_SHIFT), cx = x >> FP_SHIFT, cy = y >> FP_SHIFT;
      for (let ty = cy - r;ty <= cy + r; ty++)
        for (let tx = cx - r;tx <= cx + r; tx++) {
          if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height)
            continue;
          const i = ty * this.map.width + tx;
          if (this.map.terrain[i] !== 7 /* Bridge */)
            continue;
          if (fxLen((tx << FP_SHIFT) + FP / 2 - x, (ty << FP_SHIFT) + FP / 2 - y) > s.splash)
            continue;
          const hp = (this.bridgeHp.get(i) ?? br.hp) - s.damage;
          if (hp > 0) {
            this.bridgeHp.set(i, hp);
            continue;
          }
          this.bridgeHp.delete(i);
          this.map.terrain[i] = 2 /* Water */;
          this.events.push({ kind: "bridge", x: (tx << FP_SHIFT) + FP / 2, y: (ty << FP_SHIFT) + FP / 2 });
        }
    }
  }
  hash() {
    let h = 2166136261 >>> 0;
    const mix = (v) => {
      h ^= v & 65535;
      h = Math.imul(h, 16777619) >>> 0;
      h ^= v >>> 16 & 65535;
      h = Math.imul(h, 16777619) >>> 0;
    };
    mix(this.tick);
    const s2 = this.rules.season === "s2";
    for (const u of this.units) {
      mix(u.id);
      mix(u.x);
      mix(u.y);
      mix(u.heading);
      mix(u.turret);
      mix(u.speed);
      mix(u.hp);
      mix(u.reload);
      mix(u.reload2);
      mix(u.alive ? 1 : 0);
      if (s2) {
        mix(u.ammo + 1);
        mix(u.lockTarget);
        mix(u.lockTicks);
        mix(u.charges.smoke);
        mix(u.charges.mine);
      }
      if (this.sub) {
        mix(u.depth === "deep" ? 2 : 1);
        mix(u.depthCooldown ?? 0);
        mix(u.pingCooldown ?? 0);
        mix(u.pingedUntil ?? 0);
        mix(u.pingRevealUntil ?? 0);
        mix(u.transientUntil ?? 0);
      }
    }
    if (s2) {
      for (const o of this.objectives) {
        mix(o.owner === null ? 0 : o.owner + 1);
        mix(o.state === "held" ? 1 : o.state === "contested" ? 2 : 0);
      }
      for (const sm of this.smokes) {
        mix(sm.id);
        mix(sm.x);
        mix(sm.y);
        mix(sm.until);
      }
      for (const m of this.mines) {
        mix(m.id);
        mix(m.x);
        mix(m.y);
      }
      for (const [i, hp] of this.bridgeHp) {
        mix(i);
        mix(hp);
      }
    }
    for (const s of this.shells) {
      mix(s.id);
      mix(s.x);
      mix(s.y);
      mix(s.tx);
      mix(s.ty);
      mix(s.ticksLeft);
    }
    mix(this.score[0]);
    mix(this.score[1]);
    mix(hashStr(this.rulesHash));
    return h >>> 0;
  }
}
function urbanFamilyFor(seed, families) {
  const total = families.reduce((a, [, wgt]) => a + wgt, 0);
  let r = new Rng(seed >>> 0).fork("urban-family").int(Math.max(1, total));
  for (const [f, wgt] of families) {
    if (r < wgt)
      return f;
    r -= wgt;
  }
  return families[0]?.[0] ?? "nature";
}
var isPoint = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]);
function segmentHitT(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fxx = ax - cx, fyy = ay - cy;
  const S = 8;
  const Dx = dx >> S, Dy = dy >> S, Fx = fxx >> S, Fy = fyy >> S, R = r >> S;
  const A = Dx * Dx + Dy * Dy;
  if (A === 0)
    return Fx * Fx + Fy * Fy <= R * R ? 0 : null;
  const B = 2 * (Fx * Dx + Fy * Dy);
  const C = Fx * Fx + Fy * Fy - R * R;
  const disc = B * B - 4 * A * C;
  if (disc < 0)
    return null;
  const sq3 = Math.floor(Math.sqrt(disc));
  const t0 = (-B - sq3) / (2 * A);
  const t = t0 < 0 ? C <= 0 ? 0 : null : t0 <= 1 ? t0 : null;
  if (t === null)
    return null;
  return Math.round(t * FP);
}
// ../engine/src/replay.ts
function runMatch(seed, a, b, opts = {}) {
  const m = new Match(seed, opts);
  const bots = [a, b];
  if (m.needsDraft) {
    for (const side of [0, 1]) {
      let pick;
      try {
        pick = bots[side].draft?.(m.hello(side));
      } catch {
        pick = undefined;
      }
      if (pick !== undefined)
        m.draft(side, pick);
    }
    m.start();
  }
  bots[0].hello(m.hello(0));
  bots[1].hello(m.hello(1));
  const ticks = [];
  const states = [];
  if (opts.keepStates)
    states.push(m.state);
  const limit = opts.maxTicks ?? m.rules.maxTicks;
  while (!m.isOver && m.currentTick < limit) {
    const t = m.currentTick;
    const o = [safeOrders(bots[0], m.observe(0)), safeOrders(bots[1], m.observe(1))];
    const events = m.step(o);
    ticks.push({ type: "tick", t, o, h: m.hash() });
    const st = m.state;
    if (opts.keepStates)
      states.push(st);
    opts.onTick?.(st, events);
  }
  const final = m.state;
  const replay = {
    header: {
      type: "header",
      engine: ENGINE_VERSION,
      rulesVersion: m.rules.version,
      rulesHash: m.rulesHash,
      seed: m.seed,
      mapHash: m.map.hash,
      ...m.rules.draft ? { drafts: m.squads } : {},
      bots: [
        { name: opts.names?.[0] ?? "A", version: opts.versions?.[0] ?? "v1" },
        { name: opts.names?.[1] ?? "B", version: opts.versions?.[1] ?? "v1" }
      ]
    },
    ticks,
    result: { type: "result", winner: final.winner, reason: final.reason ?? "running", ticks: final.tick, score: final.score }
  };
  return { replay, states, final };
}
function safeOrders(c, obs) {
  try {
    const o = c.tick(obs);
    if (!o)
      return null;
    return typeof o.tick === "number" ? o : { ...o, tick: obs.tick };
  } catch {
    return null;
  }
}
function verifyReplay(r, opts = {}) {
  const m = new Match(r.header.seed, opts);
  if (m.needsDraft) {
    if (r.header.drafts) {
      m.draft(0, r.header.drafts[0]);
      m.draft(1, r.header.drafts[1]);
    }
    m.start();
  }
  const states = [m.state];
  let ok = true, firstMismatch = null;
  let reason = "ok";
  if (m.rulesHash !== r.header.rulesHash) {
    ok = false;
    firstMismatch = -1;
    reason = "rules_mismatch";
  } else if (m.map.hash !== r.header.mapHash) {
    ok = false;
    firstMismatch = -1;
    reason = "map_mismatch";
  }
  for (const t of r.ticks) {
    if (m.isOver)
      break;
    m.step(t.o);
    states.push(m.state);
    if (ok && m.hash() !== t.h) {
      ok = false;
      firstMismatch = t.t;
      reason = "hash_mismatch";
    }
  }
  return { ok, firstMismatch, reason, states };
}
function encodeReplay(r) {
  const compactSide = (o) => {
    if (!o)
      return null;
    const units = (o.units ?? []).filter((u) => Object.keys(u).some((k) => k !== "id"));
    if (typeof o.say === "string" && o.say.length)
      return { u: units, s: o.say };
    return units.length ? units : null;
  };
  const lines = [JSON.stringify(r.header)];
  for (const t of r.ticks) {
    const w = { type: "tick", t: t.t, o: [compactSide(t.o[0]), compactSide(t.o[1])], h: t.h };
    lines.push(JSON.stringify(w));
  }
  lines.push(JSON.stringify(r.result));
  return lines.join(`
`) + `
`;
}
function decodeReplay(text) {
  const lines = text.split(`
`).filter(Boolean).map((l) => JSON.parse(l));
  const header = lines.find((l) => l.type === "header");
  const result = lines.find((l) => l.type === "result");
  if (!header || !result)
    throw new Error("replay: missing header or result");
  const ticks = [];
  for (const l of lines) {
    if (l.type !== "tick")
      continue;
    const w = l;
    const expand = (side) => {
      if (!side)
        return null;
      if (Array.isArray(side))
        return { tick: w.t, units: side };
      if ("u" in side && "s" in side)
        return { tick: w.t, units: side.u, say: side.s };
      return side;
    };
    ticks.push({ type: "tick", t: w.t, o: [expand(w.o[0]), expand(w.o[1])], h: w.h });
  }
  return { header, ticks, result };
}
// ../engine/src/bots.ts
var isSubPassable = (t) => t !== 4 /* Rock */ && t !== 6 /* Ruin */;
function driveTowards(u, turnRate, tx, ty, slow = false, map, sub = false) {
  let want = fxAtan2(ty - u.y, tx - u.x);
  if (map) {
    const pass = sub ? isSubPassable : isPassable;
    const clear = (ang) => {
      for (const ahead of [fx(0.8), fx(1.6)]) {
        const px = u.x + Math.round(ahead * Math.cos(ang / 4096 * Math.PI * 2)), py = u.y + Math.round(ahead * Math.sin(ang / 4096 * Math.PI * 2));
        const txl = px >> FP_SHIFT, tyl = py >> FP_SHIFT;
        if (txl < 0 || tyl < 0 || txl >= map.width || tyl >= map.height)
          return false;
        if (!pass(map.terrain[tyl * map.width + txl]))
          return false;
      }
      return true;
    };
    if (!clear(want)) {
      for (const off of [341, 683, 1024, 1365]) {
        if (clear(want + off & 4095)) {
          want = want + off & 4095;
          break;
        }
        if (clear(want - off & 4095)) {
          want = want - off & 4095;
          break;
        }
      }
    }
  }
  const d = angDiff(u.heading, want);
  const steer = fxClamp(Math.round(d * FP / Math.max(1, turnRate)), -FP, FP);
  const ad = Math.abs(d);
  const throttle = ad > 512 ? fx(0.15) : ad > 256 ? fx(0.5) : slow ? fx(0.6) : FP;
  return { steer, throttle };
}
function gridPath(terrain, w, h, a, b, sub = false) {
  const start = a[1] * w + a[0], goal = b[1] * w + b[0];
  if (start === goal)
    return [];
  const pass = sub ? isSubPassable : isPassable;
  const prev = new Int32Array(w * h).fill(-1);
  prev[start] = start;
  const q = [start];
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    if (i === goal)
      break;
    const x = i % w, y = (i - x) / w;
    for (let dy = -1;dy <= 1; dy++)
      for (let dx = -1;dx <= 1; dx++) {
        if (!dx && !dy)
          continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h)
          continue;
        const j = ny * w + nx;
        if (prev[j] !== -1 || !pass(terrain[j]))
          continue;
        if (dx && dy && (!pass(terrain[y * w + nx]) || !pass(terrain[ny * w + x])))
          continue;
        prev[j] = i;
        q.push(j);
      }
  }
  if (prev[goal] === -1)
    return [];
  const path = [];
  for (let i = goal;i !== start; i = prev[i])
    path.push([i % w, (i - i % w) / w]);
  return path.reverse();
}
var tileOf = (v) => v >> FP_SHIFT;
var centre = (t) => (t << FP_SHIFT) + FP / 2;
function nearestPassableTile(terrain, w, h, x, y, sub = false) {
  const pass = sub ? isSubPassable : isPassable;
  for (let r = 0;r < Math.max(w, h); r++)
    for (let dy = -r;dy <= r; dy++)
      for (let dx = -r;dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r)
          continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h)
          continue;
        if (pass(terrain[ny * w + nx]))
          return [nx, ny];
      }
  return [x, y];
}

class Navigator {
  terrain;
  w;
  h;
  sub;
  path = [];
  goal = null;
  age = 0;
  sinceReplan = 0;
  stuck = 0;
  constructor(terrain, w, h, sub = false) {
    this.terrain = terrain;
    this.w = w;
    this.h = h;
    this.sub = sub;
  }
  next(u, gx, gy, nudge) {
    const g = nearestPassableTile(this.terrain, this.w, this.h, tileOf(gx), tileOf(gy), this.sub);
    const here = [tileOf(u.x), tileOf(u.y)];
    this.age++;
    this.sinceReplan++;
    this.stuck = u.blocked ? this.stuck + 1 : 0;
    const goalChanged = !this.goal || Math.max(Math.abs(this.goal[0] - g[0]), Math.abs(this.goal[1] - g[1])) >= 3;
    if (goalChanged || this.age > 40 + nudge % 7 || u.blocked && this.sinceReplan > 8) {
      this.goal = g;
      this.age = 0;
      this.sinceReplan = 0;
      this.path = gridPath(this.terrain, this.w, this.h, here, g, this.sub);
    }
    while (this.path.length && this.path[0][0] === here[0] && this.path[0][1] === here[1])
      this.path.shift();
    const wp = this.path[0] ?? g;
    return { wp: [centre(wp[0]), centre(wp[1])], stuck: this.stuck };
  }
}
function triangulateBearings(units, bearings, w, h) {
  if (!bearings || !bearings.length)
    return null;
  const byUnit = new Map;
  for (const u of units)
    if (u.alive)
      byUnit.set(u.id, u);
  const rank = (b) => (b.strength === "loud" ? 3 : b.strength === "clear" ? 2 : 1) + (b.cavitating ? 1 : 0);
  const sorted = bearings.slice().sort((a, b) => rank(b) - rank(a));
  for (let i = 0;i < sorted.length; i++) {
    const b1 = sorted[i];
    const u1 = byUnit.get(b1.fromUnit);
    if (!u1)
      continue;
    const r1 = b1.angle / 4096 * Math.PI * 2;
    const dx1 = Math.cos(r1), dy1 = Math.sin(r1);
    for (let j = i + 1;j < sorted.length; j++) {
      const b2 = sorted[j];
      if (b2.fromUnit === b1.fromUnit)
        continue;
      const u2 = byUnit.get(b2.fromUnit);
      if (!u2)
        continue;
      const r2 = b2.angle / 4096 * Math.PI * 2;
      const dx2 = Math.cos(r2), dy2 = Math.sin(r2);
      const det = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(det) < 0.18)
        continue;
      const ox = (u2.x - u1.x) / FP, oy = (u2.y - u1.y) / FP;
      const t1 = (ox * dy2 - oy * dx2) / det;
      const t2 = (ox * dy1 - oy * dx1) / det;
      if (t1 > 2 && t1 < 95 && t2 > 2 && t2 < 95) {
        const ix = fxClamp(Math.round(u1.x + dx1 * t1 * FP), FP * 2, (w << FP_SHIFT) - FP * 2);
        const iy = fxClamp(Math.round(u1.y + dy1 * t1 * FP), FP * 2, (h << FP_SHIFT) - FP * 2);
        return [ix, iy];
      }
    }
  }
  const top = sorted[0];
  const u0 = byUnit.get(top.fromUnit);
  if (!u0)
    return null;
  const estTiles = top.strength === "loud" ? 15 : top.strength === "clear" ? 24 : 34;
  const rad = top.angle / 4096 * Math.PI * 2;
  return [
    fxClamp(Math.round(u0.x + Math.cos(rad) * estTiles * FP), FP * 2, (w << FP_SHIFT) - FP * 2),
    fxClamp(Math.round(u0.y + Math.sin(rad) * estTiles * FP), FP * 2, (h << FP_SHIFT) - FP * 2)
  ];
}
function makeHouseBot(opts = {}) {
  const style = opts.style ?? "brawler";
  let hello;
  let hill = [0, 0];
  let hillOwner = null;
  const pickObjective = (o) => {
    hillOwner = o.hillOwner;
    if (!o.objectives || o.objectives.length <= 1)
      return;
    const spawn = hello.map.spawns[hello.side];
    const hx = centre(spawn[0]), hy = centre(spawn[1]);
    let best = null, score = -1;
    for (const ob of o.objectives) {
      if (ob.owner === hello.side && ob.state === "held")
        continue;
      const sc = ob.weight / (1 + fxLen(ob.x - hx, ob.y - hy) / FP);
      if (sc > score) {
        score = sc;
        best = ob;
      }
    }
    if (best) {
      hill = [best.x, best.y];
      hillOwner = best.owner;
    }
  };
  let navs = new Map;
  let navFor = () => {
    throw new Error("hello() not called");
  };
  let rng = new Rng(opts.seed ?? 1);
  let lastContacts = [];
  let lastSeenTick = -1;
  let wander = new Map;
  const backoff = new Map;
  const forestIdle = new Map;
  const applyBackoff = (u, stuck, tick, order) => {
    const b = backoff.get(u.id);
    if (b && tick < b.until) {
      order.throttle = -fx(0.7);
      order.steer = b.steer;
      return;
    }
    if (stuck > 2 && (!b || tick >= b.until + 10)) {
      const steer = u.id + (tick >> 4) & 1 ? FP : -FP;
      backoff.set(u.id, { until: tick + 14, steer });
      order.throttle = -fx(0.7);
      order.steer = steer;
    }
  };
  const memory = new Map;
  let quietSince = 0;
  const spec = (k) => unitSpec(hello.rules, k);
  let lastSmoke = -1000;
  const engineerAbilities = (u, s, order, threat, dist, tick) => {
    if (!s.abilities)
      return;
    if (threat && dist < fx(16) && u.charges.smoke > 0 && tick - lastSmoke > 200) {
      order.ability = "smoke";
      lastSmoke = tick;
      return;
    }
    if (u.charges.mine > 0 && fxLen(u.x - hill[0], u.y - hill[1]) < fx(9) && tick % 30 === 0)
      order.ability = "mine";
  };
  const lockFire = (u, s, order, live, dist) => {
    if (!s.gun.lockTicks)
      return false;
    if (live && dist <= s.gun.maxRange && dist >= s.gun.minRange) {
      order.target = live.id;
      order.aimAt = [live.x, live.y];
      if (u.lockTicks >= s.gun.lockTicks && u.reload === 0 && u.ammo !== 0)
        order.fire = true;
    }
    return true;
  };
  const predict = (c, ticks) => [
    c.x + fxMulSafe(c.speed, ticks * FP, Math.cos(c.heading / 4096 * Math.PI * 2)),
    c.y + fxMulSafe(c.speed, ticks * FP, Math.sin(c.heading / 4096 * Math.PI * 2))
  ];
  const clampGoal = (g) => [
    fxClamp(g[0], FP, (hello.map.width << FP_SHIFT) - FP),
    fxClamp(g[1], FP, (hello.map.height << FP_SHIFT) - FP)
  ];
  const away = (u, from, tiles) => {
    const ang = fxAtan2(u.y - from[1], u.x - from[0]);
    return clampGoal([u.x + Math.round(Math.cos(ang / 4096 * Math.PI * 2) * tiles * FP), u.y + Math.round(Math.sin(ang / 4096 * Math.PI * 2) * tiles * FP)]);
  };
  function hunterOrders(o, u, s, order) {
    for (const c of o.contacts)
      memory.set(c.id, { c, tick: o.tick });
    for (const [id, m] of memory)
      if (o.tick - m.tick > 400)
        memory.delete(id);
    if (o.contacts.length)
      quietSince = o.tick;
    const live = nearestOf(u, o.contacts);
    const remembered = nearestOf(u, [...memory.values()].map((m) => m.c));
    const target = live ?? remembered;
    const dist = target ? fxLen(target.x - u.x, target.y - u.y) : Infinity;
    const enemySpawn = hello.map.spawns[hello.side === 0 ? 1 : 0];
    const enemyHome = [centre(enemySpawn[0]), centre(enemySpawn[1])];
    let goal = null;
    for (const inc of o.incoming) {
      const d = fxLen(inc.x - u.x, inc.y - u.y);
      if (d < fx(4.5) && inc.ticks < 45) {
        goal = away(u, [inc.x, inc.y], 6);
        break;
      }
    }
    const idleKey = u.id;
    if (u.inForest && !live && Math.abs(u.speed) < fx(0.05))
      forestIdle.set(idleKey, (forestIdle.get(idleKey) ?? 0) + 1);
    else
      forestIdle.set(idleKey, 0);
    if (!goal && (forestIdle.get(idleKey) ?? 0) > 40) {
      const tx = u.x >> FP_SHIFT, ty = u.y >> FP_SHIFT;
      let best = null, bd = 1e9;
      for (let dy = -6;dy <= 6; dy++)
        for (let dx = -6;dx <= 6; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= hello.map.width || y >= hello.map.height)
            continue;
          if (hello.map.terrain[y * hello.map.width + x] !== 0)
            continue;
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = [x, y];
          }
        }
      if (best)
        goal = [centre(best[0]), centre(best[1])];
    }
    if (!goal) {
      if (u.kind === "mbt" || u.kind === "apc" || u.kind === "missile") {
        if (live) {
          const want = Math.round(s.gun.maxRange * 0.7);
          goal = dist > want ? [live.x, live.y] : dist < fx(8) ? away(u, [live.x, live.y], 4) : [u.x, u.y];
        } else if (remembered)
          goal = [remembered.x, remembered.y];
        else
          goal = o.tick - quietSince > 300 && hillOwner === hello.side ? enemyHome : hill;
      } else if (u.kind === "scout" || u.kind === "drone") {
        if (live) {
          const standoff = Math.round(s.sensorRange * 0.7);
          goal = dist < standoff - fx(4) ? away(u, [live.x, live.y], 8) : dist > standoff + fx(4) ? [live.x, live.y] : [u.x, u.y];
        } else if (remembered)
          goal = [remembered.x, remembered.y];
        else
          goal = o.tick - quietSince > 200 ? enemyHome : [hill[0], hill[1] + (hello.side === 0 ? -fx(10) : fx(10))];
      } else {
        const spawn = hello.map.spawns[hello.side];
        const post = [centre(spawn[0]) + (hill[0] - centre(spawn[0])) * 2 / 5 | 0, hill[1] + (hello.side === 0 ? fx(6) : -fx(6))];
        goal = target && dist < s.gun.minRange + fx(6) ? away(u, [target.x, target.y], 8) : post;
      }
    }
    if (o.canMove && goal && !(goal[0] === u.x && goal[1] === u.y)) {
      const g = clampGoal(goal);
      const nav = navFor(u.id).next(u, g[0], g[1], u.id);
      Object.assign(order, driveTowards(u, s.turnRate, nav.wp[0], nav.wp[1], u.kind === "mbt" && dist < fx(14), hello.map));
      applyBackoff(u, nav.stuck, o.tick, order);
      if (u.kind === "mbt" && live && goal[0] === u.x && goal[1] === u.y) {
        const d = angDiff(u.heading, fxAtan2(live.y - u.y, live.x - u.x));
        order.steer = fxClamp(Math.round(d * FP / Math.max(1, s.turnRate)), -FP, FP);
        order.throttle = 0;
      }
    }
    engineerAbilities(u, s, order, live ?? target, dist, o.tick);
    if (lockFire(u, s, order, live, dist)) {} else if (s.gun.mode === "direct") {
      if (live && dist <= s.gun.maxRange) {
        const flight = Math.max(1, Math.round(dist / Math.max(1, s.gun.shellSpeed)));
        const [tx, ty] = predict(live, flight);
        order.aimAt = [tx, ty];
        if (u.reload === 0 && Math.abs(angDiff(u.turret, fxAtan2(ty - u.y, tx - u.x))) <= s.gun.aimTolerance)
          order.fire = true;
      } else if (target)
        order.aimAt = [target.x, target.y];
    } else if (live && s.secondary && dist <= s.secondary.maxRange && u.reload2 === 0) {
      const want = fxAtan2(live.y - u.y, live.x - u.x);
      const d = angDiff(u.heading, want);
      if (Math.abs(d) <= s.secondary.aimTolerance)
        order.fire = true;
      else {
        order.steer = fxClamp(Math.round(d * FP / Math.max(1, s.turnRate)), -FP, FP);
        order.throttle = 0;
      }
    } else if (s.gun.mode === "indirect" && u.reload === 0 && u.ammo !== 0) {
      const shootAt = live ?? (remembered && o.tick - (memory.get(remembered.id)?.tick ?? 0) < 40 ? remembered : null);
      if (shootAt) {
        const d = fxLen(shootAt.x - u.x, shootAt.y - u.y);
        if (d >= s.gun.minRange && d <= s.gun.maxRange) {
          const flight = Math.round(2 * hello.rules.tickHz + d / FP * (hello.rules.tickHz * 0.05));
          const [px, py] = live ? predict(shootAt, flight) : [shootAt.x, shootAt.y];
          order.fire = clampGoal([px, py]);
        }
      }
    }
  }
  let lastPing = -1000;
  let lastTma = null;
  let lastTmaTick = -1000;
  function subTick(o) {
    pickObjective(o);
    if (o.contacts.length) {
      lastContacts = o.contacts;
      lastSeenTick = o.tick;
    }
    const tma = triangulateBearings(o.units, o.bearings, hello.map.width, hello.map.height);
    if (tma) {
      lastTma = tma;
      lastTmaTick = o.tick;
    }
    const freshMemory = o.tick - lastSeenTick < 90 ? lastContacts : [];
    const activeFix = tma ?? (o.tick - lastTmaTick < 80 ? lastTma : null);
    const enemySpawn = hello.map.spawns[hello.side === 0 ? 1 : 0];
    const enemyHome = [centre(enemySpawn[0]), centre(enemySpawn[1])];
    const orders = [];
    for (const u of o.units) {
      if (!u.alive)
        continue;
      const s = spec(u.kind);
      const order = { id: u.id };
      const live = nearestOf(u, o.contacts);
      const rem = nearestOf(u, freshMemory);
      const target = live ?? rem;
      const fix = target ? [target.x, target.y] : activeFix;
      const dist = fix ? fxLen(fix[0] - u.x, fix[1] - u.y) : Infinity;
      const shoalH = hello.rules.sub?.shoalHeight ?? 165;
      const onShoal = (hello.map.heights[(u.y >> FP_SHIFT) * hello.map.width + (u.x >> FP_SHIFT)] ?? 0) > shoalH;
      if ((u.depthCooldown ?? 0) === 0 && !onShoal) {
        if (u.kind === "ssgn" || u.kind === "minelayer") {
          if (u.depth !== "shallow")
            order.depth = "shallow";
        } else if (u.kind === "ssk") {
          const wantDepth = live && live.depth === "shallow" && dist < fx(22) ? "shallow" : "deep";
          if (u.depth !== wantDepth)
            order.depth = wantDepth;
        } else if (u.kind === "ssn") {
          const wantDepth = live ? live.depth ?? "shallow" : (o.tick >> 7) + u.id & 1 ? "deep" : "shallow";
          if (u.depth !== wantDepth)
            order.depth = wantDepth;
        }
      }
      const ab = s.abilities;
      if (ab) {
        if (ab.smoke && u.charges.smoke > 0 && live && dist < fx(15) && o.tick - lastSmoke > 140) {
          order.ability = "smoke";
          lastSmoke = o.tick;
        } else if (!order.ability && ab.mine && u.charges.mine > 0 && fxLen(u.x - hill[0], u.y - hill[1]) < fx(9) && o.tick % 28 === 0) {
          order.ability = "mine";
        } else if (!order.ability && ab.ping && (u.pingCooldown ?? 0) === 0) {
          const wantPing = u.kind === "uuv" ? !o.contacts.length && o.tick - lastPing > 90 && fxLen(u.x - hill[0], u.y - hill[1]) < fx(36) : !o.contacts.length && (!!activeFix || style === "brawler") && o.tick - lastPing > 150 && dist < fx(42);
          if (wantPing) {
            order.ability = "ping";
            lastPing = o.tick;
          }
        }
      }
      let goal = hill;
      if (style === "random") {
        if (!wander.has(u.id) || rng.int(60) === 0)
          wander.set(u.id, [centre(rng.int(hello.map.width)), centre(rng.int(hello.map.height))]);
        goal = wander.get(u.id);
      } else if (u.kind === "ssgn") {
        const spawn = hello.map.spawns[hello.side];
        const post = [centre(spawn[0]) + (hill[0] - centre(spawn[0])) * 2 / 5 | 0, hill[1] + (hello.side === 0 ? fx(6) : -fx(6))];
        goal = fix && dist < s.gun.minRange + fx(5) ? away(u, fix, 8) : post;
      } else if (u.kind === "uuv") {
        const flankY = hill[1] + (u.id & 1 ? fx(14) : -fx(14));
        goal = live && dist < fx(12) ? away(u, [live.x, live.y], 10) : fix ? [fix[0], flankY] : [hill[0], flankY];
      } else if (u.kind === "minelayer") {
        goal = hill;
      } else {
        if (fix) {
          goal = dist > fx(16) ? fix : dist < fx(7) ? away(u, fix, 5) : [u.x, u.y];
        } else {
          goal = o.tick > 450 && hillOwner === hello.side ? enemyHome : hill;
        }
      }
      const silentRun = (u.kind === "ssk" || style === "hunter" || style === "holder") && (!live || dist > fx(18));
      if (o.canMove && !(goal[0] === u.x && goal[1] === u.y)) {
        const g = clampGoal(goal);
        const nav = navFor(u.id).next(u, g[0], g[1], u.id);
        Object.assign(order, driveTowards(u, s.turnRate, nav.wp[0], nav.wp[1], silentRun, hello.map, true));
        applyBackoff(u, nav.stuck, o.tick, order);
      }
      if (u.kind === "ssgn") {
        if (live && s.secondary && dist <= s.secondary.maxRange && u.reload2 === 0) {
          const want = fxAtan2(live.y - u.y, live.x - u.x);
          if (Math.abs(angDiff(u.heading, want)) <= s.secondary.aimTolerance)
            order.fire = true;
        } else if (fix && (u.depth ?? "shallow") === "shallow" && u.reload === 0 && u.ammo !== 0) {
          const d = fxLen(fix[0] - u.x, fix[1] - u.y);
          if (d >= s.gun.minRange && d <= s.gun.maxRange) {
            const flight = Math.max(1, Math.round(d / Math.max(1, s.gun.shellSpeed)));
            const [px, py] = live ? predict(live, flight) : fix;
            order.fire = clampGoal([px, py]);
          }
        }
      } else if (s.gun.mode === "direct") {
        if (live && dist <= s.gun.maxRange) {
          const flight = Math.max(1, Math.round(dist / Math.max(1, s.gun.shellSpeed)));
          const [tx, ty] = predict(live, flight);
          order.aimAt = [tx, ty];
          if (u.reload === 0 && u.ammo !== 0 && Math.abs(angDiff(u.turret, fxAtan2(ty - u.y, tx - u.x))) <= s.gun.aimTolerance) {
            order.fire = true;
          } else if (s.secondary && dist <= s.secondary.maxRange && u.reload2 === 0 && Math.abs(angDiff(u.turret, fxAtan2(ty - u.y, tx - u.x))) <= s.secondary.aimTolerance) {
            order.fire = true;
          }
        } else if (fix && dist <= s.gun.maxRange) {
          order.aimAt = fix;
          if (u.reload === 0 && u.ammo > 1 && Math.abs(angDiff(u.turret, fxAtan2(fix[1] - u.y, fix[0] - u.x))) <= s.gun.aimTolerance) {
            order.fire = true;
          }
        } else if (fix) {
          order.aimAt = fix;
        }
      }
      orders.push(order);
    }
    return { tick: o.tick, units: orders };
  }
  return {
    draft(h) {
      const d = h.draft;
      if (!d)
        return;
      if (h.rules.theater === "sub") {
        const subWant = {
          brawler: ["ssn", "ssn", "uuv", "uuv"],
          holder: ["minelayer", "minelayer", "ssk", "uuv"],
          hunter: ["ssk", "ssgn", "uuv", "uuv"],
          random: []
        };
        let pick2 = subWant[style];
        if (style === "random") {
          const r = new Rng((opts.seed ?? 1) ^ h.seed ^ h.side * 7919).fork("draft");
          pick2 = [];
          let budget = d.budget;
          for (let i = 0;i < d.max; i++) {
            const affordable = d.roster.filter((k2) => (d.costs[k2] ?? Infinity) <= budget);
            if (!affordable.length)
              break;
            const k = affordable[r.int(affordable.length)];
            pick2.push(k);
            budget -= d.costs[k] ?? 0;
          }
          while (pick2.length < d.min)
            pick2.push("uuv");
        }
        const cost2 = pick2.reduce((c, k) => c + (d.costs[k] ?? Infinity), 0);
        const legal2 = pick2.length >= d.min && pick2.length <= d.max && cost2 <= d.budget && pick2.every((k) => d.roster.includes(k));
        return legal2 ? pick2 : undefined;
      }
      const want = {
        brawler: ["mbt", "mbt", "scout", "scout"],
        holder: ["apc", "mbt", "engineer", "scout"],
        hunter: ["missile", "mbt", "drone", "scout"],
        random: []
      };
      let pick = want[style];
      if (style === "random") {
        const r = new Rng((opts.seed ?? 1) ^ h.seed ^ h.side * 7919).fork("draft");
        pick = [];
        let budget = d.budget;
        for (let i = 0;i < d.max; i++) {
          const affordable = d.roster.filter((k2) => (d.costs[k2] ?? Infinity) <= budget);
          if (!affordable.length)
            break;
          const k = affordable[r.int(affordable.length)];
          pick.push(k);
          budget -= d.costs[k] ?? 0;
        }
        while (pick.length < d.min)
          pick.push("scout");
      }
      const cost = pick.reduce((c, k) => c + (d.costs[k] ?? Infinity), 0);
      const legal = pick.length >= d.min && pick.length <= d.max && cost <= d.budget && pick.every((k) => d.roster.includes(k));
      return legal ? pick : undefined;
    },
    hello(h) {
      hello = h;
      const isSub = h.rules.theater === "sub";
      hill = [centre(h.map.width >> 1), centre(h.map.height >> 1)];
      navs = new Map(h.units.map((u) => [u.id, new Navigator(h.map.terrain, h.map.width, h.map.height, isSub)]));
      navFor = (id) => {
        let n = navs.get(id);
        if (!n) {
          n = new Navigator(h.map.terrain, h.map.width, h.map.height, isSub);
          navs.set(id, n);
        }
        return n;
      };
      rng = new Rng((opts.seed ?? 1) ^ h.seed ^ h.side);
    },
    tick(o) {
      if (hello.rules.theater === "sub")
        return subTick(o);
      pickObjective(o);
      if (o.contacts.length) {
        lastContacts = o.contacts;
        lastSeenTick = o.tick;
      }
      const memory2 = o.tick - lastSeenTick < 80 ? lastContacts : [];
      const orders = [];
      for (const u of o.units) {
        if (!u.alive)
          continue;
        const s = spec(u.kind);
        const order = { id: u.id };
        const nearest = nearestOf(u, memory2);
        const dist = nearest ? fxLen(nearest.x - u.x, nearest.y - u.y) : Infinity;
        if (style === "random") {
          if (!wander.has(u.id) || rng.int(60) === 0)
            wander.set(u.id, [centre(rng.int(hello.map.width)), centre(rng.int(hello.map.height))]);
          const [wx, wy] = wander.get(u.id);
          const nav = navFor(u.id).next(u, wx, wy, rng.int(10));
          Object.assign(order, driveTowards(u, s.turnRate, nav.wp[0], nav.wp[1], false, hello.map));
          applyBackoff(u, nav.stuck, o.tick, order);
          engineerAbilities(u, s, order, nearest, dist, o.tick);
          if (lockFire(u, s, order, nearest, dist)) {} else if (nearest && dist <= s.gun.maxRange && dist >= s.gun.minRange) {
            if (s.gun.mode === "direct") {
              order.aimAt = [nearest.x, nearest.y];
              if (u.reload === 0 && u.ammo !== 0)
                order.fire = true;
            } else if (s.gun.mode === "indirect" && u.reload === 0 && u.ammo !== 0)
              order.fire = [nearest.x, nearest.y];
          } else if (nearest && s.secondary && dist <= s.secondary.maxRange && u.reload2 === 0)
            order.fire = true;
          orders.push(order);
          continue;
        }
        if (style === "hunter") {
          hunterOrders(o, u, s, order);
          orders.push(order);
          continue;
        }
        let goal;
        if (u.kind === "artillery") {
          const spawn = hello.map.spawns[hello.side];
          const back = [centre(spawn[0]) + (hill[0] - centre(spawn[0]) >> 2), hill[1]];
          goal = nearest && dist < s.gun.minRange + fx(4) ? [u.x + (u.x - nearest.x), u.y + (u.y - nearest.y)] : back;
        } else if (u.kind === "scout" || u.kind === "drone") {
          goal = nearest && dist < fx(10) ? [u.x + (u.x - nearest.x), u.y + (u.y - nearest.y)] : [hill[0], hill[1] + (hello.side === 0 ? -fx(8) : fx(8))];
        } else {
          goal = style === "holder" || !nearest ? hill : [nearest.x, nearest.y];
          if (nearest && dist < fx(6))
            goal = [u.x, u.y];
        }
        if (o.canMove && !(goal[0] === u.x && goal[1] === u.y)) {
          const nav = navFor(u.id).next(u, fxClamp(goal[0], FP, (hello.map.width << FP_SHIFT) - FP), fxClamp(goal[1], FP, (hello.map.height << FP_SHIFT) - FP), u.id);
          Object.assign(order, driveTowards(u, s.turnRate, nav.wp[0], nav.wp[1], u.kind === "mbt" && dist < fx(12), hello.map));
          applyBackoff(u, nav.stuck, o.tick, order);
        }
        engineerAbilities(u, s, order, nearest, dist, o.tick);
        if (lockFire(u, s, order, nearest, dist)) {} else if (nearest && dist <= s.gun.maxRange && dist >= s.gun.minRange) {
          if (s.gun.mode === "direct") {
            const lead = Math.min(FP * 2, fxDiv(dist, Math.max(1, s.gun.shellSpeed)));
            const tx = nearest.x + fxMulSafe(nearest.speed, lead, Math.cos(nearest.heading / 4096 * Math.PI * 2));
            const ty = nearest.y + fxMulSafe(nearest.speed, lead, Math.sin(nearest.heading / 4096 * Math.PI * 2));
            order.aimAt = [tx, ty];
            if (u.reload === 0 && Math.abs(angDiff(u.turret, fxAtan2(ty - u.y, tx - u.x))) <= s.gun.aimTolerance)
              order.fire = true;
          } else if (s.gun.mode === "indirect" && u.reload === 0 && u.ammo !== 0 && o.tick === lastSeenTick) {
            order.fire = [nearest.x, nearest.y];
          }
        } else if (nearest && s.secondary && dist <= s.secondary.maxRange && o.tick === lastSeenTick) {
          const d = angDiff(u.heading, fxAtan2(nearest.y - u.y, nearest.x - u.x));
          if (Math.abs(d) <= s.secondary.aimTolerance) {
            if (u.reload2 === 0)
              order.fire = true;
          } else {
            order.steer = fxClamp(Math.round(d * FP / Math.max(1, s.turnRate)), -FP, FP);
            order.throttle = 0;
          }
        } else if (nearest && s.gun.mode === "direct") {
          order.aimAt = [nearest.x, nearest.y];
        }
        orders.push(order);
      }
      return { tick: o.tick, units: orders };
    }
  };
}
function nearestOf(u, cs) {
  let best = null, bd = Infinity;
  for (const c of cs) {
    const d = fxLen(c.x - u.x, c.y - u.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
function fxMulSafe(speed, ticks, dir) {
  return Math.round(speed / FP * (ticks / FP) * dir * FP);
}
export {
  verifyReplay,
  valueNoise,
  urbanFamilyFor,
  unitSpec,
  triangulateBearings,
  traceSegment,
  toFloat,
  terrainAt,
  runMatch,
  rulesHash,
  rulesFor,
  reachable,
  placeObjectives,
  objectiveCounts,
  nearestPassableTile,
  makeHouseBot,
  lineOfSightUrban,
  lineOfSight,
  isqrt,
  isPassable,
  heightAt,
  hashStr,
  gridPath,
  generateTerrain,
  fxSqrt,
  fxSin,
  fxMul,
  fxLen,
  fxFloor,
  fxDiv,
  fxCos,
  fxClamp,
  fxAtan2,
  fxAbs,
  fx,
  fogAt,
  flightTicks,
  fbm,
  encodeReplay,
  driveTowards,
  decodeReplay,
  clampi,
  blocksSight,
  astar,
  asciiMap,
  angNorm,
  angDiff,
  Terrain,
  TICK_HZ,
  TERRAIN_REV,
  TERRAIN_GLYPHS,
  S2_TERRAIN,
  Rng,
  RULES_URBAN_PREVIEW_2,
  RULES_URBAN,
  RULES_SUB,
  RULES_S2_PREVIEW_3,
  RULES_S2_PREVIEW_2,
  RULES_S2,
  RULES_S1,
  RULESETS,
  Match,
  HEIGHT_MAX,
  FP_SHIFT,
  FP_MASK,
  FP,
  FOG_SENSOR_FACTOR,
  ENGINE_VERSION,
  DEFAULT_PARAMS,
  ANG_MASK,
  ANG_FULL,
  ANG_BITS
};
