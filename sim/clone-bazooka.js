// clone-bazooka.js — sparring proxy approximating the live top-3 meta (bazookabot-lab /
// sck-waypoint / terenyuk-ford, all observed drafting 3xMBT): all three MBTs converge on the
// nearest flank objective, focus-fire the weakest contact with linear lead, hold the point.
// NOT a submission — a local sparring opponent for selfplay testing only.
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
    const pick = ["mbt", "mbt", "mbt"];
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
    // target objective: nearest flank by BFS from centroid (skip centre hill unless it's the only)
    const cx = alive.reduce((s, u) => s + u.x, 0) / Math.max(1, alive.length), cy = alive.reduce((s, u) => s + u.y, 0) / Math.max(1, alive.length);
    let oi = 0, bd = Infinity;
    objectives.forEach((ob, i) => {
      const f = fields[i]; const v = f ? f[Math.floor(cy / FP) * W + Math.floor(cx / FP)] : -1;
      const d = v >= 0 ? v : dist(cx, cy, ob.x, ob.y) / FP;
      if (d < bd) { bd = d; oi = i; }
    });
    // focus: lowest time-to-kill for an MBT gun (facing-averaged armour), tie -> nearest
    const hpAbs = c => (c.hpFrac / FP) * (rules.units[c.kind]?.hp ?? 100);
    const effD = k => { const a = rules.units[k]?.armor || [0,0,0]; return Math.max(1, 45 - (a[0]+a[1]+a[2])/3); };
    let focus = null, bf = Infinity;
    for (const c of o.contacts) { const s = hpAbs(c) / effD(c.kind) + dist(cx, cy, c.x, c.y) / FP * 0.02; if (s < bf) { bf = s; focus = c; } }
    const units = [];
    for (const u of alive) {
      const spec = rules.units[u.kind], order = { id: u.id };
      const ob = objectives[oi];
      const inDisc = ob && dist(u.x, u.y, ob.x, ob.y) <= ob.radius * 0.8;
      const dFocus = focus ? dist(u.x, u.y, focus.x, focus.y) : Infinity;
      // convoy: never outrun the slowest squadmate by more than ~7 tiles
      let maxLag = 0;
      for (const w of alive) maxLag = Math.max(maxLag, dist(u.x, u.y, w.x, w.y));
      if (ob && o.canMove) {
        if (dFocus <= spec.gun.maxRange * 0.95) order.throttle = 0;            // standoff: stop and shoot
        else if (inDisc && !focus) order.throttle = 0;                          // hold the point pre-contact
        else if (maxLag > FP * 7 && dFocus > spec.gun.maxRange) order.throttle = Math.round(FP * 0.25); // wait for the squad
        else { const g = gradStep(u, oi); steerTo(u, spec, g[0], g[1], order); }
      }
      if (focus && dist(u.x, u.y, focus.x, focus.y) <= spec.gun.maxRange) {
        const tof = dist(u.x, u.y, focus.x, focus.y) / spec.gun.shellSpeed;
        const v = vel[focus.id] || [0, 0];
        const px = Math.round(focus.x + v[0] * tof), py = Math.round(focus.y + v[1] * tof);
        order.aimAt = [px, py];
        if (u.reload === 0 && Math.abs(angDiff(u.turret, angleTo(u.x, u.y, px, py))) <= spec.gun.aimTolerance) order.fire = true;
      }
      units.push(order);
    }
    return { units };
  },
};
