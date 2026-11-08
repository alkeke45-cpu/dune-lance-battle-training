// dune-lance v2 — battle.training controller (Season 2 "Drafted", armor theater)
//
// What changed vs v1 (diagnosis in CAMPAIGN-LEDGER.md):
//  - Draft: APC+MBT+scout+scout -> MBT+MBT+drone+scout. The drone (36-tile sensor, flies)
//    was the single biggest lever in local tests (56.9% -> 72.7% with the v1 brain):
//    the squad sees enemies at 36 tiles instead of 20, so focus fire starts earlier.
//    The APC died early on the live ladder and scout guns (8 dmg) cannot hurt an MBT's
//    front armour (20), so v1's paper DPS never materialised.
//  - Movement: BFS distance fields per objective computed in hello() — true shortest
//    paths around water/rock/ruins. v1's fan-steering stalled on shore lines, which is
//    how whole games ended with 0 objective points (two live 0-0 sets, one 0-49698 set).
//  - Assignment: units no longer all converge on one hill. MBTs take the primary
//    objective, the scout takes the secondary, the drone spots over the primary.
//    Units inside an owned/contested objective HOLD it instead of wandering off.
//  - Targeting: squad focus by time-to-kill with armour awareness (don't waste the
//    focus on a target a gun cannot hurt), per-unit fallback target in its own range,
//    velocity leading kept from v1. Fighters keep driving to their objective and fire
//    on the move; they only stop to duel at standoff range when assaulting defenders.
//  - Dodge: incoming artillery shells (o.incoming) move a unit off the landing point.

const FP = 65536;
const FULL = 4096;

let rules, map, side;
let W = 0, H = 0;
let passable = null;        // Uint8Array W*H, ground-passable tiles
let fields = [];            // per objective: Int32Array W*H BFS distance (in tiles) to the capture disc, -1 = unreachable
let objPts = [];            // per objective: [x, y] fixed-point centre
const velMem = {};          // contact id -> [x, y, tick]
const assign = {};          // unit id -> objective index (sticky)

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angleTo(ax, ay, bx, by) { return Math.round((Math.atan2(by - ay, bx - ax) / (2 * Math.PI)) * FULL) & (FULL - 1); }
function angDiff(a, b) { let d = (b - a) & (FULL - 1); return d > FULL / 2 ? d - FULL : d; }
function tileOf(x, y) { return Math.floor(y / FP) * W + Math.floor(x / FP); }

function buildFields(objectives) {
  fields = []; objPts = [];
  for (const o of objectives) {
    const f = new Int32Array(W * H).fill(-1);
    const queue = new Int32Array(W * H);
    let qh = 0, qt = 0;
    const cx = Math.floor(o.x / FP), cy = Math.floor(o.y / FP);
    const rTiles = Math.max(1, Math.floor(o.radius / FP) - 1);
    for (let ty = cy - rTiles; ty <= cy + rTiles; ty++) {
      for (let tx = cx - rTiles; tx <= cx + rTiles; tx++) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const dx = (tx + 0.5) * FP - o.x, dy = (ty + 0.5) * FP - o.y;
        if (dx * dx + dy * dy <= o.radius * o.radius) {
          const i = ty * W + tx;
          if (f[i] !== 0) { f[i] = 0; queue[qt++] = i; }
        }
      }
    }
    if (qt === 0) { // objective centre on impassable tile: seed the nearest passable tile
      let best = -1, bd = Infinity;
      for (let ty = Math.max(0, cy - 8); ty <= Math.min(H - 1, cy + 8); ty++)
        for (let tx = Math.max(0, cx - 8); tx <= Math.min(W - 1, cx + 8); tx++) {
          const i = ty * W + tx;
          if (!passable[i]) continue;
          const d = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
          if (d < bd) { bd = d; best = i; }
        }
      if (best >= 0) { f[best] = 0; queue[qt++] = best; }
    }
    while (qh < qt) {
      const i = queue[qh++], d = f[i] + 1;
      const tx = i % W, ty = (i / W) | 0;
      if (tx > 0     && f[i - 1] < 0 && passable[i - 1]) { f[i - 1] = d; queue[qt++] = i - 1; }
      if (tx < W - 1 && f[i + 1] < 0 && passable[i + 1]) { f[i + 1] = d; queue[qt++] = i + 1; }
      if (ty > 0     && f[i - W] < 0 && passable[i - W]) { f[i - W] = d; queue[qt++] = i - W; }
      if (ty < H - 1 && f[i + W] < 0 && passable[i + W]) { f[i + W] = d; queue[qt++] = i + W; }
    }
    fields.push(f);
    objPts.push([o.x, o.y]);
  }
}

/** next waypoint for a ground unit heading to objective oi: gradient descent on its BFS field */
function gradientStep(u, oi) {
  const f = fields[oi];
  if (!f) return objPts[oi];
  const tx = Math.floor(u.x / FP), ty = Math.floor(u.y / FP);
  let bestI = -1, bestV = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = ny * W + nx;
      if (!passable[i]) continue;
      const v = f[i];
      if (v >= 0 && v < bestV) { bestV = v; bestI = i; }
    }
  }
  if (bestI < 0) return objPts[oi]; // unreachable pocket: fall back to straight line
  return [((bestI % W) + 0.5) * FP, (((bestI / W) | 0) + 0.5) * FP];
}

function steerTo(u, spec, gx, gy, order) {
  let want = angleTo(u.x, u.y, gx, gy);
  if (u.kind !== "drone") {
    // if the direct tile ahead is blocked, fan out like v1 (gradient usually prevents this)
    const tx = Math.floor((u.x + Math.cos((want / FULL) * 2 * Math.PI) * FP * 1.5) / FP);
    const ty = Math.floor((u.y + Math.sin((want / FULL) * 2 * Math.PI) * FP * 1.5) / FP);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H || !passable[ty * W + tx]) {
      const offsets = [341, -341, 683, -683, 1024, -1024, 1536, -1536];
      for (const off of offsets) {
        const a = (want + off) & (FULL - 1);
        const rad = (a / FULL) * 2 * Math.PI;
        const px = Math.floor((u.x + Math.cos(rad) * FP * 1.5) / FP);
        const py = Math.floor((u.y + Math.sin(rad) * FP * 1.5) / FP);
        if (px >= 0 && py >= 0 && px < W && py < H && passable[py * W + px]) { want = a; break; }
      }
    }
  }
  const d = angDiff(u.heading, want);
  order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
  order.throttle = Math.abs(d) > 512 ? Math.round(FP * 0.2) : FP;
  if (u.blocked) { order.throttle = -FP; order.steer = FP; }
}

globalThis.controller = {
  draft(h) {
    const d = h.draft;
    if (!d) return undefined;
    const pick = ["mbt", "mbt", "drone", "scout"];
    const cost = pick.reduce((c, k) => c + (d.costs[k] ?? 99), 0);
    return cost <= d.budget && pick.every(k => d.roster.includes(k)) ? pick : undefined;
  },

  hello(h) {
    rules = h.rules; map = h.map; side = h.side;
    W = map.width; H = map.height;
    passable = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = map.terrain[i];
      passable[i] = (rules.terrainSpeed[t] ?? 0) > 0 ? 1 : 0;
    }
    buildFields(h.objectives || []);
    for (const k in velMem) delete velMem[k];
    for (const k in assign) delete assign[k];
  },

  tick(o) {
    const objectives = o.objectives || [];
    // --- contact velocity memory (for leading) ---
    const vel = {};
    for (const c of o.contacts) {
      const p = velMem[c.id];
      vel[c.id] = (p && o.tick > p[2] && o.tick - p[2] <= 40)
        ? [(c.x - p[0]) / (o.tick - p[2]), (c.y - p[1]) / (o.tick - p[2])] : [0, 0];
      velMem[c.id] = [c.x, c.y, o.tick];
    }
    const hpAbs = c => (c.hpFrac / FP) * (rules.units[c.kind]?.hp ?? 100);
    const effDmg = (gun, kind) => {
      const a = rules.units[kind]?.armor || [0, 0, 0];
      return Math.max(1, gun.damage - (a[0] + a[1] + a[2]) / 3);
    };
    // --- squad focus: lowest time-to-kill for an MBT gun (our reference weapon) ---
    const mbtGun = rules.units.mbt.gun;
    let focus = null, focusTtk = Infinity;
    for (const c of o.contacts) {
      const ttk = hpAbs(c) / effDmg(mbtGun, c.kind);
      if (ttk < focusTtk) { focusTtk = ttk; focus = c; }
    }
    const alive = o.units.filter(u => u.alive);
    const fighters = alive.filter(u => u.kind === "mbt" || u.kind === "apc" || u.kind === "missile" || u.kind === "artillery");
    const scout = alive.find(u => u.kind === "scout");
    const drone = alive.find(u => u.kind === "drone");

    // --- objective valuation ---
    // value of sending the main force there: unowned/enemy hills by weight & distance; ours only if contested
    const centroid = alive.length
      ? [alive.reduce((s, u) => s + u.x, 0) / alive.length, alive.reduce((s, u) => s + u.y, 0) / alive.length]
      : [0, 0];
    const objValue = (oi, fromX, fromY) => {
      const ob = objectives[oi];
      const f = fields[oi];
      let dTiles = 40;
      if (f) { const v = f[tileOf(fromX, fromY)]; dTiles = v >= 0 ? v : 60; }
      else dTiles = dist(fromX, fromY, ob.x, ob.y) / FP;
      if (ob.owner === side && ob.state === "held") return -1;               // secured: no force needed
      if (ob.owner === side) return ob.weight * 0.4 / (1 + dTiles / 24);     // ours but contested: defend
      return ob.weight / (1 + dTiles / 24);
    };
    let primary = -1, pv = -1;
    for (let i = 0; i < objectives.length; i++) {
      const v = objValue(i, centroid[0], centroid[1]);
      if (v > pv) { pv = v; primary = i; }
    }
    let secondary = -1, sv = -1;
    for (let i = 0; i < objectives.length; i++) {
      if (i === primary) continue;
      const v = objValue(i, centroid[0], centroid[1]);
      if (v > sv) { sv = v; secondary = i; }
    }
    if (primary < 0) { // everything held: defend the heaviest of ours
      let bw = -1;
      for (let i = 0; i < objectives.length; i++)
        if (objectives[i].weight > bw) { bw = objectives[i].weight; primary = i; }
    }

    const units = [];
    for (const u of alive) {
      const spec = rules.units[u.kind];
      const order = { id: u.id };

      // which objective is this unit standing in?
      let insideOi = -1;
      for (let i = 0; i < objectives.length; i++) {
        if (dist(u.x, u.y, objectives[i].x, objectives[i].y) <= objectives[i].radius) { insideOi = i; break; }
      }

      // --- role assignment (sticky, with garrison rule) ---
      let myOi;
      if (u === drone) myOi = primary;
      else if (u === scout) myOi = (secondary >= 0 && secondary !== primary) ? secondary : primary;
      else myOi = primary;
      if (insideOi >= 0 && objectives[insideOi].owner === side) myOi = insideOi;       // garrison what we hold
      else if (insideOi >= 0 && objectives[insideOi].state === "contested") myOi = insideOi; // fight for the hill we're on
      else if (assign[u.id] !== undefined && objectives[assign[u.id]] &&
               !(objectives[assign[u.id]].owner === side && objectives[assign[u.id]].state === "held")) {
        // keep the sticky target unless the new one is clearly better
        const cur = objValue(assign[u.id], u.x, u.y), alt = myOi >= 0 ? objValue(myOi, u.x, u.y) : -1;
        if (cur > 0 && alt < cur * 1.25) myOi = assign[u.id];
      }
      assign[u.id] = myOi;

      // --- pick my gun target: squad focus if I can hurt it and it's in range, else best own target ---
      let target = null, targetD = Infinity;
      const inRange = c => dist(u.x, u.y, c.x, c.y) <= spec.gun.maxRange * 1.02;
      if (focus && spec.gun.mode !== "none" && effDmg(spec.gun, focus.kind) >= 3 && inRange(focus)) {
        target = focus; targetD = dist(u.x, u.y, focus.x, focus.y);
      } else if (spec.gun.mode !== "none") {
        let bTtk = Infinity;
        for (const c of o.contacts) {
          if (!inRange(c)) continue;
          const ttk = hpAbs(c) / effDmg(spec.gun, c.kind);
          if (ttk < bTtk) { bTtk = ttk; target = c; targetD = dist(u.x, u.y, c.x, c.y); }
        }
      }
      const nearestD = o.contacts.length
        ? Math.min(...o.contacts.map(c => dist(u.x, u.y, c.x, c.y))) : Infinity;

      // --- movement decision ---
      let goal = null, hold = false;
      const myObj = myOi >= 0 ? objectives[myOi] : null;
      const onMyHill = myObj && dist(u.x, u.y, myObj.x, myObj.y) <= myObj.radius * 0.8;
      if (myObj && onMyHill) {
        hold = true; // sit in the capture disc and shoot
      } else if (myObj) {
        // assault standoff: if I'm a fighter, my objective is enemy-held, and my target is in range -> duel from here
        const assaultDuel = fighters.includes(u) && target && myObj.owner !== null && myObj.owner !== side;
        if (!assaultDuel) {
          goal = (u.kind === "drone") ? [myObj.x, myObj.y] : gradientStep(u, myOi);
          // spread the garrison: aim at a per-unit offset point once close
          if (myObj && dist(u.x, u.y, myObj.x, myObj.y) <= myObj.radius * 1.6) {
            const idx = alive.indexOf(u);
            const ang = (idx * (FULL / Math.max(1, alive.length))) / FULL * 2 * Math.PI;
            goal = [myObj.x + Math.round(Math.cos(ang) * myObj.radius * 0.45),
                    myObj.y + Math.round(Math.sin(ang) * myObj.radius * 0.45)];
          }
        } else hold = true;
      }
      // artillery dodge overrides everything except holding our own hill under no contest
      if (o.incoming && o.incoming.length) {
        for (const s of o.incoming) {
          if (s.ticks <= 28 && dist(u.x, u.y, s.x, s.y) < FP * 3) {
            const dx = u.x - s.x, dy = u.y - s.y, m = Math.hypot(dx, dy) || 1;
            goal = [u.x + Math.round(dx / m * FP * 5), u.y + Math.round(dy / m * FP * 5)];
            hold = false;
            break;
          }
        }
      }
      if (goal && o.canMove) steerTo(u, spec, goal[0], goal[1], order);
      else if (hold) { order.throttle = 0; }

      // --- weapons ---
      if (target && spec.gun.mode !== "none") {
        if (u.kind === "missile") {
          order.target = target.id;
          if (u.lockTarget === target.id && u.reload === 0) order.fire = true;
        } else if (spec.gun.mode === "direct") {
          const tof = spec.gun.shellSpeed ? targetD / spec.gun.shellSpeed : 0;
          const v = vel[target.id] || [0, 0];
          const px = Math.round(target.x + v[0] * tof), py = Math.round(target.y + v[1] * tof);
          order.aimAt = [px, py];
          const aimed = Math.abs(angDiff(u.turret, angleTo(u.x, u.y, px, py))) <= spec.gun.aimTolerance;
          if (u.reload === 0 && aimed && targetD <= spec.gun.maxRange) order.fire = true;
        } else { // indirect (artillery)
          if (u.reload === 0 && targetD >= spec.gun.minRange && targetD <= spec.gun.maxRange) {
            const v = vel[target.id] || [0, 0];
            const tof = 40 + (targetD / FP);
            order.fire = [Math.round(target.x + v[0] * tof), Math.round(target.y + v[1] * tof)];
          }
        }
      } else if (spec.gun.mode === "none" && spec.secondary && target) {
        if (u.reload2 === 0 && targetD <= spec.secondary.maxRange) order.fire = true;
      }
      units.push(order);
    }
    return { units };
  },
};
