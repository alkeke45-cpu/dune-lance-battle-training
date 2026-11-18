// clone-apc.js — sparring proxy approximating the APC-occupation meta observed live
// (kilnwarden mbt+mbt+apc; money-terrain-guard apc+apc+mbt+scout; taulant apc+apc+mbt+drone):
// APC doubles capture weight on the far flank, MBTs hold the near flank, everyone focus-fires
// the weakest contact in range and otherwise sits on points. Local sparring only.
const FP = 65536, FULL = 4096;
let rules, map, side, W = 0, H = 0, passable = null, fields = [], objPts = [];
const velMem = {};
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angleTo(ax, ay, bx, by) { return Math.round((Math.atan2(by - ay, bx - ax) / (2 * Math.PI)) * FULL) & (FULL - 1); }
function angDiff(a, b) { let d = (b - a) & (FULL - 1); return d > FULL / 2 ? d - FULL : d; }
function buildFields(objectives) {
  fields = []; objPts = [];
  for (const o of objectives) {
    const f = new Int32Array(W * H).fill(-1), queue = new Int32Array(W * H);
    let qh = 0, qt = 0;
    const cx = Math.floor(o.x / FP), cy = Math.floor(o.y / FP), rT = Math.max(1, Math.floor(o.radius / FP) - 1);
    for (let ty = cy - rT; ty <= cy + rT; ty++) for (let tx = cx - rT; tx <= cx + rT; tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const dx = (tx + 0.5) * FP - o.x, dy = (ty + 0.5) * FP - o.y;
      if (dx * dx + dy * dy <= o.radius * o.radius) { const i = ty * W + tx; if (f[i] !== 0) { f[i] = 0; queue[qt++] = i; } }
    }
    while (qh < qt) {
      const i = queue[qh++], d = f[i] + 1, tx = i % W, ty = (i / W) | 0;
      if (tx > 0 && f[i - 1] < 0 && passable[i - 1]) { f[i - 1] = d; queue[qt++] = i - 1; }
      if (tx < W - 1 && f[i + 1] < 0 && passable[i + 1]) { f[i + 1] = d; queue[qt++] = i + 1; }
      if (ty > 0 && f[i - W] < 0 && passable[i - W]) { f[i - W] = d; queue[qt++] = i - W; }
      if (ty < H - 1 && f[i + W] < 0 && passable[i + W]) { f[i + W] = d; queue[qt++] = i + W; }
    }
    fields.push(f); objPts.push([o.x, o.y]);
  }
}
function gradStep(u, oi) {
  const f = fields[oi]; if (!f) return objPts[oi];
  const tx = Math.floor(u.x / FP), ty = Math.floor(u.y / FP);
  let bestI = -1, bestV = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const i = ny * W + nx;
    if (passable[i] && f[i] >= 0 && f[i] < bestV) { bestV = f[i]; bestI = i; }
  }
  return bestI < 0 ? objPts[oi] : [((bestI % W) + 0.5) * FP, (((bestI / W) | 0) + 0.5) * FP];
}
function steerTo(u, spec, gx, gy, order) {
  const want = angleTo(u.x, u.y, gx, gy), d = angDiff(u.heading, want);
  order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
  order.throttle = Math.abs(d) > 512 ? Math.round(FP * 0.2) : FP;
  if (u.blocked) { order.throttle = -FP; order.steer = FP; }
}
globalThis.controller = {
  draft(h) {
    const d = h.draft; if (!d) return undefined;
    const pick = ["mbt", "mbt", "apc"];
    const cost = pick.reduce((c, k) => c + (d.costs[k] ?? 99), 0);
    return cost <= d.budget ? pick : undefined;
  },
  hello(h) {
    rules = h.rules; map = h.map; side = h.side; W = map.width; H = map.height;
    passable = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) passable[i] = (rules.terrainSpeed[map.terrain[i]] ?? 0) > 0 ? 1 : 0;
    buildFields(h.objectives || []);
    for (const k in velMem) delete velMem[k];
  },
  tick(o) {
    const objectives = o.objectives || [];
    const vel = {};
    for (const c of o.contacts) {
      const p = velMem[c.id];
      vel[c.id] = (p && o.tick > p[2] && o.tick - p[2] <= 40) ? [(c.x - p[0]) / (o.tick - p[2]), (c.y - p[1]) / (o.tick - p[2])] : [0, 0];
      velMem[c.id] = [c.x, c.y, o.tick];
    }
    const alive = o.units.filter(u => u.alive);
    // flank pair = the two objectives that are point-symmetric (exclude centre hill if 3 present:
    // centre is the one closest to map centre)
    const centre = [W * FP / 2, H * FP / 2];
    let flankIdx = objectives.map((_, i) => i);
    if (objectives.length === 3) {
      let ci = 0, cd = Infinity;
      objectives.forEach((ob, i) => { const d = dist(centre[0], centre[1], ob.x, ob.y); if (d < cd) { cd = d; ci = i; } });
      flankIdx = flankIdx.filter(i => i !== ci);
    }
    const spawn = map.spawns[side];
    const sx = spawn[0] * FP, sy = spawn[1] * FP;
    const near = flankIdx.reduce((a, b) => dist(sx, sy, objectives[a].x, objectives[a].y) < dist(sx, sy, objectives[b].x, objectives[b].y) ? a : b);
    const far = flankIdx.find(i => i !== near);
    let focus = null, bf = Infinity;
    for (const c of o.contacts) { if (c.hpFrac < bf) { bf = c.hpFrac; focus = c; } }
    const units = [];
    for (const u of alive) {
      const spec = rules.units[u.kind], order = { id: u.id };
      const oi = u.kind === "apc" ? far : near;
      const ob = objectives[oi];
      const inDisc = ob && dist(u.x, u.y, ob.x, ob.y) <= ob.radius * 0.8;
      if (ob && o.canMove) {
        if (inDisc) order.throttle = 0;
        else { const g = gradStep(u, oi); steerTo(u, spec, g[0], g[1], order); }
      }
      const tgt = (focus && dist(u.x, u.y, focus.x, focus.y) <= spec.gun.maxRange) ? focus : null;
      if (tgt) {
        const tof = dist(u.x, u.y, tgt.x, tgt.y) / spec.gun.shellSpeed;
        const v = vel[tgt.id] || [0, 0];
        const px = Math.round(tgt.x + v[0] * tof), py = Math.round(tgt.y + v[1] * tof);
        order.aimAt = [px, py];
        if (u.reload === 0 && Math.abs(angDiff(u.turret, angleTo(u.x, u.y, px, py))) <= spec.gun.aimTolerance) order.fire = true;
      }
      units.push(order);
    }
    return { units };
  },
};
