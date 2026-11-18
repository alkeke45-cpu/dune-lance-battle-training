// dune-lance v4 "Apex" — battle.training controller (Season 2 "Drafted", armor theater, s2.0.0)
//
// v4 changes (from the v3 live scrimmage vs bazookabot-lab, lost 0-2 by piecemeal defeat,
// and a local trace on the same seed exposing the same family of flaws):
//  - RALLY rule: a fighter in contact with >=2 enemy gunners pulls every unengaged fighter
//    to the fight — v3 left two MBTs on the far side of the map while the third died alone.
//  - Rate-aware HOLD: freezing on a lead only when the lock is mathematically safe or the
//    rates are level late; if their rate beats ours, the squad PRESSes to contest instead
//    of watching the lead erode. MOPUP no longer abandons a winning hold when outnumbered
//    by the objective count.
//  - Detach discipline: nearest valuable target (not max weight across the map), and a
//    detached unit outnumbered >=2:1 locally falls back to the squad instead of dying solo.
//
// Built from live-ladder replay telemetry (Phase 21; 12 replays re-simulated and measured).
// What the ladder actually rewards, and what v3 does about it:
//  - The top of the cup (bazookabot-lab / sck-waypoint / terenyuk-ford) all draft 3xMBT and end
//    games by ELIMINATION at t1200-2300 in a converged focus-fire brawl on one flank.
//  - APC drafts win the points race against passive squads (captureWeight x2) — v2 lost those
//    games scoring ~150 points while its MBTs never engaged (8-29 damage dealt in blowouts).
//  - v2's scout+drone died inside ~700 ticks in nearly every replay and dealt ~0 damage vs
//    MBT frontal armour. v3 drafts fighting hulls only: MBT x3 (DRAFT_VARIANT "mbt3");
//    variant "mbt2apc" (MBT,MBT,APC) is kept for A/B testing.
// Systems:
//  - hello(): BFS distance fields per objective + precomputed hull-down posts per objective
//    (3 slots on the enemy-facing arc of the disc, highest ground near the slot wins).
//  - Convoy movement: the squad travels together (no piecemeal arrival — v2's core wound).
//  - Hill-lead state machine: measured score rates -> projected final diff -> modes
//    OPENING / BATTLE / PRESS (behind: take the next point as a group) / HOLD (ahead: deny,
//    no chasing, preserve HP for the tiebreak) / MOPUP. Lock margin computed every tick.
//  - Focus fire: one shared target scored by squad time-to-kill using FACING-AWARE damage
//    (front/side/rear armour vs each shooter's bearing), stickiness to prevent target churn.
//  - Ballistics: quadratic intercept solver (constant-velocity closed form) + one
//    acceleration-correction step; fire gated on seenBy (true per-unit line of sight),
//    reload, turret alignment and range.
//  - Defence: hull facing discipline (MBT/APC turrets are independent, so the hull is angled
//    to put the primary threat in the frontal band while posted); reload-synced jinking —
//    enemy reload state is NOT in the observation, so it is ESTIMATED: our units' HP drops
//    are attributed to the most plausible shooter and its next-shot tick predicted from its
//    kind's reload; the threatened unit jinks perpendicular 6-10 ticks before that tick.
//    (Estimate, labelled as such — it cannot see shells in flight or enemy reload counters.)
//  - Artillery dodge from `incoming`, cripple withdrawal (reverse, front to threat).

const FP = 65536;
const FULL = 4096;
const DRAFT_VARIANT = "mbt3"; // "mbt3" | "mbt2apc"

let rules, map, side, W = 0, H = 0;
let passable = null;        // Uint8Array ground-passable
let heights = null;         // map heights
let fields = [];            // per objective BFS distance field
let objPts = [];            // per objective [x,y]
let posts = [];             // per objective: 3 post positions [[x,y],...]
let flankIdx = [], centreIdx = -1;
let battleOi = -1;          // chosen battle objective index
let tracks = {};            // contact id -> {x,y,vx,vy,ax,ay,lastTick,hpFrac,kind}
let lastShotEst = {};       // contact id -> estimated tick of its last shot
let prevOwnHp = {};         // own unit id -> hp last tick
let scoreHist = [];         // [tick, mine, theirs] ring, last ~240 ticks
let mode = "OPENING";
let modeSince = 0;
let focusId = 0, focusSince = 0;
let jinkUntil = {};         // unit id -> tick until which it jinks, and jinkDir
let jinkDir = {};
let lastSay = -9999;
let stuckMem = {};          // unit id -> {x, y, since, escapeUntil}
let unitTarget = {};        // unit id -> its current target contact id (turret-churn guard)
let lastContactTick = -9999;
let detachedId = 0;
let blockedStreak = {};     // unit id -> consecutive blocked ticks
let blockedOi = new Set();  // objectives proven unreachable in practice (physics != BFS)
let oiBestField = Infinity, oiBestTick = 0; // progress tracker for the battle objective

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angleTo(ax, ay, bx, by) { return Math.round((Math.atan2(by - ay, bx - ax) / (2 * Math.PI)) * FULL) & (FULL - 1); }
function angDiff(a, b) { let d = (b - a) & (FULL - 1); return d > FULL / 2 ? d - FULL : d; }
function tileOf(x, y) { return Math.floor(y / FP) * W + Math.floor(x / FP); }
function heightAt(x, y) {
  const tx = Math.max(0, Math.min(W - 1, Math.floor(x / FP))), ty = Math.max(0, Math.min(H - 1, Math.floor(y / FP)));
  return heights[ty * W + tx];
}

/** v4.2 shell-path check — a faithful approximation of the engine's shell flight: the
 *  shell leaves at (my ground height + eye) and dives/climbs linearly to (aim ground + 3);
 *  terrain rising above that line blocks it. Sampled every ~0.5 tile; a tile must exceed
 *  the line by >10 raw height units to count as blocking (approximation margin — the
 *  engine's exact step test is finer; when in doubt we FIRE, the opposite default of the
 *  old seenBy gate that starved us). */
function shellClear(u, ax, ay) {
  const z0 = heightAt(u.x, u.y) + 100; // ~eye height in raw height units (5 tiles x 20)
  const z1 = heightAt(ax, ay) + 60;
  const d = Math.hypot(ax - u.x, ay - u.y);
  const steps = Math.max(2, Math.ceil(d / (FP / 2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = u.x + (ax - u.x) * t, y = u.y + (ay - u.y) * t;
    if (heightAt(x, y) > z0 + (z1 - z0) * t + 10) return false;
  }
  return true;
}

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
    if (qt === 0) {
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
      if (tx > 0 && f[i - 1] < 0 && passable[i - 1]) { f[i - 1] = d; queue[qt++] = i - 1; }
      if (tx < W - 1 && f[i + 1] < 0 && passable[i + 1]) { f[i + 1] = d; queue[qt++] = i + 1; }
      if (ty > 0 && f[i - W] < 0 && passable[i - W]) { f[i - W] = d; queue[qt++] = i - W; }
      if (ty < H - 1 && f[i + W] < 0 && passable[i + W]) { f[i + W] = d; queue[qt++] = i + W; }
    }
    fields.push(f);
    objPts.push([o.x, o.y]);
  }
}

/** posts: 3 slots on the enemy-facing arc of each objective disc, snapped to passable high
 *  ground. v3.3: candidates MUST lie inside the disc (<= 0.7 x radius) and on the BFS field's
 *  reachable component (field >= 0) — v3.2 posts could snap outside the disc or onto
 *  unreachable tiles, and units parked 1 tile outside the disc for whole games. */
function buildPosts(objectives) {
  posts = [];
  const enSpawn = map.spawns[1 - side];
  const ex = enSpawn[0] * FP, ey = enSpawn[1] * FP;
  objectives.forEach((o, oi) => {
    const base = Math.atan2(ey - o.y, ex - o.x);
    const slots = [];
    for (const off of [-0.6, 0, 0.6]) {
      const a = base + off;
      const ix = o.x + Math.cos(a) * o.radius * 0.5, iy = o.y + Math.sin(a) * o.radius * 0.5;
      let best = null, bestScore = -Infinity;
      const R = Math.ceil(o.radius * 0.7 / FP);
      const cx = Math.floor(o.x / FP), cy = Math.floor(o.y / FP);
      for (let ty = cy - R; ty <= cy + R; ty++) for (let tx = cx - R; tx <= cx + R; tx++) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const px = (tx + 0.5) * FP, py = (ty + 0.5) * FP;
        if (dist(px, py, o.x, o.y) > o.radius * 0.7) continue;
        const i = ty * W + tx;
        if (!passable[i]) continue;
        if (fields[oi] && fields[oi][i] < 0) continue; // unreachable pocket: never a post
        const d = dist(px, py, ix, iy) / FP;
        const s = heightAt(px, py) - d * 14; // prefer height, stay near the ideal slot
        if (s > bestScore) { bestScore = s; best = [px, py]; }
      }
      slots.push(best || [o.x, o.y]);
    }
    posts.push(slots);
  });
}

function gradientStep(u, oi) {
  const f = fields[oi];
  if (!f) return objPts[oi];
  const tx = Math.floor(u.x / FP), ty = Math.floor(u.y / FP);
  const cur = (tx >= 0 && ty >= 0 && tx < W && ty < H) ? f[ty * W + tx] : -1;
  // v4.5 ring descent: search up to 5 tiles out for the lowest field value below ours.
  // The old 3x3 descent froze a whole squad for 4,300 ticks on seed 4242: a 2-wide water
  // band at the disc's edge made every immediate neighbour equal-or-higher, and neither
  // the fan steering nor the watchdog could route around it. The BFS field already
  // encodes the around-the-barrier path — a wider descent window follows it.
  let bx = -1, by = -1, bv = Infinity;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    if (!dx && !dy) continue;
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const i = ny * W + nx;
    if (!passable[i]) continue;
    const v = f[i];
    if (v < 0) continue;
    if (cur >= 0 && v >= cur) continue;
    if (v < bv) { bv = v; bx = nx; by = ny; }
  }
  if (bx >= 0) return [(bx + 0.5) * FP, (by + 0.5) * FP];
  return objPts[oi];
}

function steerToward(u, spec, gx, gy, order, throttleScale) {
  const want = angleTo(u.x, u.y, gx, gy);
  const d = angDiff(u.heading, want);
  order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
  // proportional slowdown in turns (v3.1: the old cliff at 512 strangled travel speed)
  const turnScale = Math.max(0.3, Math.min(1, 1.15 - Math.abs(d) / 1600));
  order.throttle = Math.round(FP * turnScale * (throttleScale ?? 1));
  // v4.5: the old "if blocked, full reverse + spin" oscillated forever at 1-wide doorways
  // (seed 4242's cliff gate): reverse only for the first ticks of a blockage episode,
  // then creep forward and let the engine's wall-slide work the unit through.
  if (u.blocked) {
    const bs = (blockedStreak[u.id] = (blockedStreak[u.id] || 0) + 1);
    if (bs <= 8) { order.throttle = -FP; order.steer = FP; }
    else order.throttle = Math.round(FP * 0.4);
  } else blockedStreak[u.id] = 0;
}

/** steer directly at a point with a fan fallback when the tile ahead is impassable (from v2) */
function steerToPoint(u, spec, gx, gy, order) {
  let want = angleTo(u.x, u.y, gx, gy);
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
  const d = angDiff(u.heading, want);
  order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
  const turnScale = Math.max(0.3, Math.min(1, 1.15 - Math.abs(d) / 1600));
  order.throttle = Math.round(FP * turnScale);
  if (u.blocked) { order.throttle = -FP; order.steer = FP; }
}

/** facing of a target relative to a shooter: 0 front, 1 side, 2 rear (engine bands: +-60deg front) */
function facingBand(target, sx, sy) {
  const bearing = angleTo(target.x, target.y, sx, sy); // direction from target to shooter
  const rel = Math.abs(angDiff(target.heading, bearing));
  if (rel <= 682) return 0;        // within +-60 deg of target's nose -> we hit its front
  if (rel >= 1365) return 2;       // within +-60 deg of its tail -> rear
  return 1;
}
function effDmgVs(gun, targetKind, band) {
  const a = rules.units[targetKind]?.armor || [0, 0, 0];
  let d = Math.max(1, gun.damage - a[band]);
  if (targetKind === "drone") d = Math.max(1, gun.damage * 2 - a[band]);
  return d;
}

/** quadratic intercept solver: solves |d + v t| = s t in closed form
 *  (A t^2 + B t + C = 0 with A = v^2 - s^2 < 0, so the physical root is
 *  t = (-B - sqrt(B^2 - 4AC)) / 2A), then one acceleration correction step.
 *  Falls back to fixed-point iteration if the form degenerates. Never null. */
function intercept(shooter, c, tr, shellSpeed) {
  const dx = c.x - shooter.x, dy = c.y - shooter.y;
  const vx = tr ? tr.vx : 0, vy = tr ? tr.vy : 0;
  const A = vx * vx + vy * vy - shellSpeed * shellSpeed;
  const B = 2 * (dx * vx + dy * vy);
  const C = dx * dx + dy * dy;
  let t = NaN;
  if (Math.abs(A) < 1e-9) { if (B < 0) t = -C / B; }
  else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const r1 = (-B - sq) / (2 * A), r2 = (-B + sq) / (2 * A);
      t = r1 > 0 ? r1 : (r2 > 0 ? r2 : NaN);
    }
  }
  if (!(t > 0) || t > 400) { // fallback: iterate |d + v t| / s
    t = Math.hypot(dx, dy) / shellSpeed;
    for (let i = 0; i < 3; i++) t = Math.hypot(dx + vx * t, dy + vy * t) / shellSpeed;
  }
  let px = c.x + vx * t, py = c.y + vy * t;
  if (tr && (tr.ax || tr.ay)) { px += 0.5 * tr.ax * t * t; py += 0.5 * tr.ay * t * t; }
  return [px, py, t];
}

globalThis.controller = {
  draft(h) {
    const d = h.draft;
    if (!d) return undefined;
    const pick = DRAFT_VARIANT === "mbt2apc" ? ["mbt", "mbt", "apc"] : ["mbt", "mbt", "mbt"];
    const cost = pick.reduce((c, k) => c + (d.costs[k] ?? 99), 0);
    return cost <= d.budget && pick.every(k => d.roster.includes(k)) ? pick : undefined;
  },

  hello(h) {
    rules = h.rules; map = h.map; side = h.side;
    blockedOi = new Set(); oiBestField = Infinity; oiBestTick = 0; blockedStreak = {};
    W = map.width; H = map.height; heights = map.heights;
    passable = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) passable[i] = (rules.terrainSpeed[map.terrain[i]] ?? 0) > 0 ? 1 : 0;
    const objectives = h.objectives || [];
    buildFields(objectives);
    buildPosts(objectives);
    // classify: centre hill = objective closest to map centre when 3 present
    flankIdx = objectives.map((_, i) => i); centreIdx = -1;
    if (objectives.length === 3) {
      let cd = Infinity;
      objectives.forEach((o, i) => {
        const d = dist(W * FP / 2, H * FP / 2, o.x, o.y);
        if (d < cd) { cd = d; centreIdx = i; }
      });
      flankIdx = flankIdx.filter(i => i !== centreIdx);
    }
    // battle objective: highest weight, with a strong distance penalty (v3.3: the old
    // tie-break let BFS quirks send the whole squad across the map to the far flank,
    // arriving ~1200 ticks late into the enemy's parked MBTs)
    const sx = map.spawns[side][0] * FP, sy = map.spawns[side][1] * FP;
    battleOi = -1;
    let bv = -Infinity;
    objectives.forEach((o, i) => {
      const f = fields[i];
      const v = f ? f[tileOf(sx, sy)] : -1;
      const dTiles = v >= 0 ? v : dist(sx, sy, o.x, o.y) / FP;
      const val = o.weight * 1000 - dTiles * 8;
      if (val > bv) { bv = val; battleOi = i; }
    });
    tracks = {}; lastShotEst = {}; prevOwnHp = {}; scoreHist = [];
    mode = "OPENING"; modeSince = 0; focusId = 0; jinkUntil = {}; jinkDir = {}; stuckMem = {};
    lastContactTick = -9999; detachedId = 0;
  },

  tick(o) {
    const objectives = o.objectives || [];
    const myScore = o.score[side], theirScore = o.score[1 - side];
    const remaining = rules.maxTicks - o.tick;
    const totalWeight = objectives.reduce((s, ob) => s + ob.weight, 0);

    // ---- score rate measurement (for the hill-lead projection) ----
    scoreHist.push([o.tick, myScore, theirScore]);
    while (scoreHist.length && scoreHist[0][0] < o.tick - 240) scoreHist.shift();
    let myRate = 0, theirRate = 0;
    if (scoreHist.length > 20) {
      const h0 = scoreHist[0], dt = Math.max(1, o.tick - h0[0]);
      myRate = (myScore - h0[1]) / dt; theirRate = (theirScore - h0[2]) / dt;
    }
    const projDiff = (myScore - theirScore) + (myRate - theirRate) * remaining;
    const lockMargin = (myScore - theirScore) - remaining * totalWeight; // >0: uncatchable, engine locks

    // ---- contact tracking: velocity + acceleration memory ----
    const seenNow = new Set();
    for (const c of o.contacts) {
      seenNow.add(c.id);
      const p = tracks[c.id];
      if (p && o.tick > p.lastTick && o.tick - p.lastTick <= 30) {
        const dt = o.tick - p.lastTick;
        const nvx = (c.x - p.x) / dt, nvy = (c.y - p.y) / dt;
        tracks[c.id] = {
          x: c.x, y: c.y, lastTick: o.tick, hpFrac: c.hpFrac, kind: c.kind,
          vx: nvx, vy: nvy,
          ax: (nvx - p.vx) / dt, ay: (nvy - p.vy) / dt,
        };
      } else {
        tracks[c.id] = { x: c.x, y: c.y, lastTick: o.tick, hpFrac: c.hpFrac, kind: c.kind, vx: 0, vy: 0, ax: 0, ay: 0 };
      }
    }
    for (const id in tracks) if (o.tick - tracks[id].lastTick > 900) delete tracks[id];

    // ---- damage attribution -> enemy reload estimation (ESTIMATE: hp drops are the only signal) ----
    const alive = o.units.filter(u => u.alive);
    const centroid = alive.length
      ? [alive.reduce((s, u) => s + u.x, 0) / alive.length, alive.reduce((s, u) => s + u.y, 0) / alive.length]
      : [0, 0];
    for (const u of alive) {
      const prev = prevOwnHp[u.id];
      if (prev !== undefined && u.hp < prev) {
        let bestC = null, bestD = Infinity;
        for (const c of o.contacts) {
          const g = rules.units[c.kind]?.gun;
          if (!g || g.mode !== "direct") continue;
          const d = dist(u.x, u.y, c.x, c.y);
          if (d <= g.maxRange * 1.05 && d < bestD) { bestD = d; bestC = c; }
        }
        if (bestC) {
          const g = rules.units[bestC.kind].gun;
          const tof = g.shellSpeed ? bestD / g.shellSpeed : 0;
          lastShotEst[bestC.id] = o.tick - tof;
        }
      }
      prevOwnHp[u.id] = u.hp;
    }

    // ---- mode selection (hill-lead state machine, hysteresis 100 ticks) ----
    const anyContact = o.contacts.length > 0;
    const enemyKnown = Object.keys(tracks).filter(id => o.tick - tracks[id].lastTick <= 600).length;
    let wantMode = mode;
    if (lockMargin > 0) wantMode = "HOLD";
    else if (anyContact) wantMode = "BATTLE";
    else if (mode === "BATTLE" && !anyContact) wantMode = projDiff < 0 ? "PRESS" : "HOLD";
    else if (o.tick > 1200 && projDiff < -150) wantMode = "PRESS";
    // v4 rate-aware HOLD: freezing on a lead is only sound if the lock is safe or the rates
    // are level. If their rate beats ours, the projection already says the lead erodes —
    // sitting still just watches it happen; PRESS to contest their scoring disc instead.
    else if (o.tick > 1200 && projDiff > 150 && mode !== "PRESS" && (myRate >= theirRate || o.tick > 3800)) wantMode = "HOLD";
    else if (o.tick > 1200 && projDiff > 0 && myRate < theirRate && mode !== "PRESS") wantMode = "PRESS";
    // v3.4 ENDGAME — draw conversion (draws are ~23% of our cup games, the single biggest
    // leak): after t3000 the projection is nearly final. Behind by anything -> PRESS: go
    // contest/flip their disc (a contested disc stops their rate even if we never own it).
    // Ahead after t3400 -> HOLD and protect HP: at 4800 the tiebreak after points is total
    // HP fraction, so a lead defended with hulls alive converts draws into wins.
    if (o.tick > 3000 && projDiff < 0 && !anyContact) wantMode = "PRESS";
    const protectLead = o.tick > 3400 && projDiff > 0;
    if (protectLead && !anyContact) wantMode = "HOLD";
    // v3.1: a lone surviving fighter does not PRESS into a known stronger force — it holds
    // its best point and plays for the points/HP tiebreak instead of feeding.
    if (wantMode === "PRESS" && alive.length <= 1 && enemyKnown >= 2) wantMode = "HOLD";
    else if (mode === "OPENING" && o.tick > 60) wantMode = "MARCH";
    if (mode === "MARCH" && !anyContact && enemyKnown === 0 && o.tick > 2000) wantMode = "MOPUP";
    // v3.4: MOPUP also fires when no enemy GUNNER is known alive — a lone surviving drone
    // cannot hurt us, but it can out-score us from an empty disc if we all sit on one.
    const gunnerKnown = Object.values(tracks).some(t => o.tick - t.lastTick <= 900 &&
      (rules.units[t.kind]?.gun?.mode ?? "none") !== "none");
    // v4: MOPUP must not abandon a winning hold when we have fewer fighters than objectives
    // (spreading = vacating a scoring disc). It fires when behind/level, or when we can
    // cover every objective without leaving one.
    if (!anyContact && !gunnerKnown && o.tick > 1500 && mode !== "OPENING" &&
        (projDiff < 500 || alive.length >= objectives.length)) wantMode = "MOPUP";
    if (wantMode !== mode && (o.tick - modeSince >= 100 || mode === "OPENING")) { mode = wantMode; modeSince = o.tick; }

    // ---- battle objective: where the fight/points are ----
    // v3.4: re-pick with the SAME valuation as hello (weight - distance x8 from the squad
    // centroid, owner-adjusted) plus hysteresis. The old re-pick used raw weight with
    // first-index tie-breaking and once flipped the whole squad across the map mid-game.
    if ((mode === "PRESS" || mode === "BATTLE") && o.tick - modeSince < 2) {
      let bi = battleOi, bv = -Infinity;
      objectives.forEach((ob, i) => {
        if (blockedOi.has(i)) return;
        const f = fields[i];
        const v = f ? f[tileOf(centroid[0], centroid[1])] : -1;
        const dTiles = v >= 0 ? v : dist(centroid[0], centroid[1], ob.x, ob.y) / FP;
        let val = ob.weight * 1000 - dTiles * 8;
        if (ob.owner === side && ob.state === "held") val = -2000;
        else if (ob.owner === 1 - side) val += 500; // flipping theirs swings both rates
        if (val > bv) { bv = val; bi = i; }
      });
      if (bi >= 0 && bi !== battleOi) {
        const cur = objectives[battleOi];
        const f = fields[battleOi];
        const v = f ? f[tileOf(centroid[0], centroid[1])] : -1;
        const dTiles = v >= 0 ? v : dist(centroid[0], centroid[1], cur.x, cur.y) / FP;
        let curVal = cur.weight * 1000 - dTiles * 8 + (cur.owner === 1 - side ? 500 : 0);
        if (bv > curVal + 150) battleOi = bi; // hysteresis: don't flip on noise
      }
    }

    // ---- v4.5 give-up-and-switch: BFS reachability is NOT physical reachability ----
    // (seed 4242: a flank plateau ringed by cliffs with a diagonal-only gate — BFS said
    // ~25 tiles, physics said never; the squad froze at its edge and scored 0 for a whole
    // set). If the centroid's field value toward battleOi has not improved for 600 ticks
    // while travelling, blacklist that objective for this game and take the next-best.
    if (battleOi >= 0 && fields[battleOi] && (mode === "MARCH" || mode === "PRESS" || mode === "OPENING")) {
      const fv = fields[battleOi][tileOf(centroid[0], centroid[1])];
      if (fv >= 0 && fv < oiBestField) { oiBestField = fv; oiBestTick = o.tick; }
      if (fv > 4 && o.tick > 700 && o.tick - oiBestTick > 600) {
        blockedOi.add(battleOi);
        let bi = -1, bv = -Infinity;
        objectives.forEach((ob, i) => {
          if (blockedOi.has(i)) return;
          const f = fields[i];
          const v = f ? f[tileOf(centroid[0], centroid[1])] : -1;
          const dTiles = v >= 0 ? v : dist(centroid[0], centroid[1], ob.x, ob.y) / FP;
          const val = ob.weight * 1000 - dTiles * 8;
          if (val > bv) { bv = val; bi = i; }
        });
        if (bi >= 0) { battleOi = bi; oiBestField = Infinity; oiBestTick = o.tick; }
      }
    }

    // ---- focus target: shared, facing-aware squad TTK, sticky ----
    const fighters = alive.filter(u => rules.units[u.kind].gun.mode === "direct");
    const squadDpsVs = c => {
      let dps = 0;
      for (const u of fighters) {
        // v4.2: no seenBy requirement — contacts are squad-shared vision; the shell-path
        // check at the fire gate (not target selection) is the LoS discipline.
        const g = rules.units[u.kind].gun;
        if (dist(u.x, u.y, c.x, c.y) > g.maxRange * 1.05) continue;
        dps += effDmgVs(g, c.kind, facingBand(c, u.x, u.y)) / g.reload;
      }
      return dps;
    };
    let focus = null, focusTtk = Infinity;
    // v3.1: focus among GUN-ARMED contacts first — a drone (no gun, 7 t/s) or a bare scout
    // otherwise wins every TTK comparison and drags the squad's fire onto an unhittable
    // spotter while the real guns hold the points. Fall back to any contact if no gunner.
    const isGunner = c => { const g = rules.units[c.kind]?.gun; return g && g.mode !== "none"; };
    const focusPool = o.contacts.filter(isGunner);
    for (const c of (focusPool.length ? focusPool : o.contacts)) {
      const dps = squadDpsVs(c);
      if (dps <= 0) continue;
      const hp = (c.hpFrac / FP) * (rules.units[c.kind]?.hp ?? 100);
      const ttk = hp / dps;
      if (ttk < focusTtk) { focusTtk = ttk; focus = c; }
    }
    if (focus && focus.id !== focusId) {
      const cur = o.contacts.find(c => c.id === focusId);
      if (cur) {
        // v4.1: HARD stickiness — TTK estimates are noisy (hpFrac moves in eighths, facing
        // bands flip as units move), and every focus flip swings every turret 10-20 deg,
        // which kept the squad's guns from EVER settling (measured: avg aim error 113-135
        // units vs a 12.75 tolerance, ~4 shots a game). Switch only for a target that
        // dies in <=55% of the current focus's time, or when the focus leaves contact.
        const dps = squadDpsVs(cur);
        const curTtk = dps > 0 ? ((cur.hpFrac / FP) * (rules.units[cur.kind]?.hp ?? 100)) / dps : Infinity;
        if (curTtk < focusTtk / 0.55) focus = cur; else { focusId = focus.id; focusSince = o.tick; }
      } else { focusId = focus.id; focusSince = o.tick; }
    }
    if (focus) focusId = focus.id;

    // ---- disc-denier override (v3.4): an enemy sitting inside a disc WE occupy, with no
    // enemy gunner inside that disc, denies every point from it until removed — a 30 hp
    // drone on a w3 disc is worth ~14k points a game (measured in smokepit v12's loss to
    // our own v2). Make it the focus when we can hurt it. ----
    {
      const isG = c => { const g = rules.units[c.kind]?.gun; return g && g.mode !== "none"; };
      let denier = null, denierTtk = Infinity;
      for (const c of o.contacts) {
        for (let i = 0; i < objectives.length; i++) {
          const ob = objectives[i];
          if (dist(c.x, c.y, ob.x, ob.y) > ob.radius) continue;
          if (!alive.some(u => dist(u.x, u.y, ob.x, ob.y) <= ob.radius)) continue;
          if (o.contacts.some(g => isG(g) && dist(g.x, g.y, ob.x, ob.y) <= ob.radius)) continue;
          const dps = squadDpsVs(c);
          if (dps <= 0) continue;
          const ttk = ((c.hpFrac / FP) * (rules.units[c.kind]?.hp ?? 100)) / dps;
          if (ttk < denierTtk) { denierTtk = ttk; denier = c; }
        }
      }
      if (denier) { focus = denier; focusId = denier.id; }
    }

    // ---- detach (v3.2; v3.4 loosened): one fighter takes the second point so the squad
    // scores from two discs, not one. Fires when the battle point is secured and quiet,
    // OR mid-battle when >=2 of ours hold the battle disc and the second point is free of
    // enemy gunners (the split-occupation counter: their scout banks a whole disc's points
    // while we brawl, and the lock math kills us before we can cross the map). ----
    if (anyContact) lastContactTick = o.tick;
    let detachOi = -1;
    const ourInBattle = battleOi >= 0 && objectives[battleOi]
      ? alive.filter(u => dist(u.x, u.y, objectives[battleOi].x, objectives[battleOi].y) <= objectives[battleOi].radius).length : 0;
    // v4: never split blind — if no enemy has EVER been tracked, their squad is probably
    // marching on us; keep all three hulls together until we know their axis (or late game).
    const securedQuiet = !anyContact && o.tick - lastContactTick > 300 && battleOi >= 0 &&
      (Object.keys(tracks).length > 0 || o.tick > 1800) &&
      objectives[battleOi] && objectives[battleOi].owner === side && objectives[battleOi].state === "held";
    let midBattleSplit = false;
    if (anyContact && ourInBattle >= 2 && fighters.length >= 3) {
      let bv = -Infinity, cand = -1;
      objectives.forEach((ob, i) => {
        if (i === battleOi || (ob.owner === side && ob.state === "held")) return;
        const gunnersNear = o.contacts.some(c => {
          const g = rules.units[c.kind]?.gun;
          return g && g.mode !== "none" && dist(c.x, c.y, ob.x, ob.y) <= ob.radius + FP * 6;
        });
        // v4: value by weight AND distance from the squad (BFS tiles) — the old max-weight
        // pick sent the detached tank on a death march to the far flank.
        const f = fields[i];
        const v = f ? f[tileOf(centroid[0], centroid[1])] : -1;
        const dTiles = v >= 0 ? v : dist(centroid[0], centroid[1], ob.x, ob.y) / FP;
        const val = ob.weight * 1000 - dTiles * 8;
        if (!gunnersNear && val > bv && (dTiles <= 55 || o.tick > 3000)) { bv = val; cand = i; }
      });
      if (cand >= 0) { midBattleSplit = true; detachOi = cand; }
    }
    if ((securedQuiet || midBattleSplit) && fighters.length >= 2) {
      if (!detachedId) {
        // detach the fighter farthest from the battle disc (least disruptive to the fight)
        const bd = objectives[battleOi];
        detachedId = fighters.slice().sort((a, b) =>
          (dist(b.x, b.y, bd.x, bd.y) - dist(a.x, a.y, bd.x, bd.y)) || (b.hp - a.hp))[0].id;
      }
      if (!midBattleSplit) {
        let bv = -Infinity; detachOi = -1;
        objectives.forEach((ob, i) => {
          if (i === battleOi || (ob.owner === side && ob.state === "held")) return;
          const f = fields[i];
          const v = f ? f[tileOf(centroid[0], centroid[1])] : -1;
          const dTiles = v >= 0 ? v : dist(centroid[0], centroid[1], ob.x, ob.y) / FP;
          const val = ob.weight * 1000 - dTiles * 8;
          if (val > bv && (dTiles <= 55 || o.tick > 3000)) { bv = val; detachOi = i; }
        });
      }
      if (detachOi < 0) detachedId = 0;
    } else if (!anyContact && o.tick - lastContactTick > 900) {
      detachedId = 0; // stale detach from an old fight: regroup
    }

    // ---- v4 RALLY anchor: a friendly fighter facing >=2 enemy gunners with no friendly
    // fighter within 15 tiles is being piecemealed (the exact way v3 lost its live scrimmage
    // 0-2: one MBT died alone while the other two sat 70 tiles away). Unless the win is
    // already mathematically locked, unengaged fighters converge on the fight. ----
    let rallyPoint = null;
    if (lockMargin <= 0) {
      for (const f of fighters) {
        const gunners = o.contacts.filter(c => {
          const g = rules.units[c.kind]?.gun;
          return g && g.mode === "direct" && dist(f.x, f.y, c.x, c.y) <= g.maxRange * 1.1;
        }).length;
        if (gunners < 2) continue;
        const supported = fighters.some(g2 => g2.id !== f.id && dist(f.x, f.y, g2.x, g2.y) <= FP * 15);
        if (!supported) { rallyPoint = [f.x, f.y]; break; }
      }
    }

    const units = [];

    alive.forEach((u, ui) => {
      const spec = rules.units[u.kind];
      const order = { id: u.id };
      const isCapper = u.kind === "apc";
      // my objective: cappers take the non-battle flank (or centre), fighters take the battle objective
      let myOi = battleOi;
      if (isCapper) {
        const alt = flankIdx.find(i => i !== battleOi);
        myOi = centreIdx >= 0 ? centreIdx : (alt !== undefined ? alt : battleOi);
      }
      if (mode === "MOPUP") {
        const spread = objectives.filter((_, i) => true);
        myOi = spread.length ? (ui % spread.length) : battleOi;
      }
      if (detachedId && u.id === detachedId && detachOi >= 0) myOi = detachOi;
      const myObj = myOi >= 0 ? objectives[myOi] : null;
      const myPost = myOi >= 0 && posts[myOi] ? posts[myOi][ui % posts[myOi].length] : null;
      const inMyDisc = myObj && dist(u.x, u.y, myObj.x, myObj.y) <= myObj.radius;

      // ---- my gun target ----
      let target = null;
      // v4.2: engageable = in range. seenBy is NOT required (v2 and the starter don't use
      // it; it starved our fire to ~4 shots a game in broken terrain).
      const engageable = c => dist(u.x, u.y, c.x, c.y) <= spec.gun.maxRange * 1.02;
      if (spec.gun.mode === "direct") {
        if (focus && engageable(focus)) target = focus;
        else {
          // v4.1: per-unit target memory — keep my previous target while it stays
          // engageable and within 1.8x of the best TTK (same turret-churn fix as focus).
          let bT = Infinity, best = null;
          for (const c of o.contacts) {
            if (!engageable(c)) continue;
            const hp = (c.hpFrac / FP) * (rules.units[c.kind]?.hp ?? 100);
            const ttk = hp / (effDmgVs(spec.gun, c.kind, facingBand(c, u.x, u.y)) / spec.gun.reload);
            if (ttk < bT) { bT = ttk; best = c; }
          }
          const prev = unitTarget[u.id] ? o.contacts.find(c => c.id === unitTarget[u.id]) : null;
          if (prev && engageable(prev)) {
            const hp = (prev.hpFrac / FP) * (rules.units[prev.kind]?.hp ?? 100);
            const pTtk = hp / (effDmgVs(spec.gun, prev.kind, facingBand(prev, u.x, u.y)) / spec.gun.reload);
            target = pTtk <= bT * 1.8 ? prev : best;
          } else target = best;
        }
        unitTarget[u.id] = target ? target.id : 0;
      }

      // ---- threat for facing/jink: most dangerous contact that can hit me ----
      let threat = null, threatDps = 0;
      for (const c of o.contacts) {
        const g = rules.units[c.kind]?.gun;
        if (!g || g.mode !== "direct") continue;
        const d = dist(u.x, u.y, c.x, c.y);
        if (d > g.maxRange * 1.1) continue;
        const dps = effDmgVs(g, u.kind, facingBand(u, c.x, c.y)) / g.reload;
        if (dps > threatDps) { threatDps = dps; threat = c; }
      }

      // ---- movement (v3.2 anchor doctrine) ----
      // The fighting position IS the scoring position: a unit belongs on its post inside its
      // objective's disc. It moves to the post and fights on the move (turrets are independent;
      // moving costs nothing in accuracy). It leaves the post only to close on a target that is
      // near the point, or to join the squad's fight when it has no shot of its own.
      let goal = null, holdPost = false, reverse = false, chaseTarget = null;
      const cripple = u.hp < (protectLead ? 70 : 40) && threat && o.contacts.filter(c => {
        const g = rules.units[c.kind]?.gun;
        return g && g.mode === "direct" && dist(u.x, u.y, c.x, c.y) <= g.maxRange;
      }).length >= 2;
      const anchor = myPost || (myObj ? [myObj.x, myObj.y] : null);
      const dAnchor = anchor ? dist(u.x, u.y, anchor[0], anchor[1]) : 0;
      // v4: a detached unit that makes contact with ANY enemy gunner while alone falls
      // back to the battle objective (shooting on the move) instead of dying solo — the
      // old >=2 threshold tripped only in the last ~50 ticks before it died.
      const detachedOutnumbered = detachedId && u.id === detachedId &&
        o.contacts.some(c => { const g = rules.units[c.kind]?.gun; return g && g.mode !== "none" && dist(u.x, u.y, c.x, c.y) <= FP * 30; }) &&
        !alive.some(g2 => g2.id !== u.id && dist(u.x, u.y, g2.x, g2.y) <= FP * 20);
      if (cripple) { reverse = true; }
      else if (detachedOutnumbered && battleOi >= 0 && objectives[battleOi]) {
        goal = [objectives[battleOi].x, objectives[battleOi].y];
      }
      // v4 RALLY: I have no target of my own and a squadmate is being piecemealed -> go.
      else if (rallyPoint && !target && !(detachedId && u.id === detachedId) &&
               dist(u.x, u.y, rallyPoint[0], rallyPoint[1]) > FP * 18) {
        goal = rallyPoint;
      }
      else if (anchor && dAnchor > FP * 0.8) {
        // travel to the post: BFS gradient while far out, direct steering inside ~7 tiles
        if (!inMyDisc && dAnchor > FP * 7 && myOi >= 0) goal = gradientStep(u, myOi);
        else goal = anchor;
      } else if (mode === "BATTLE" && !target && focus && isGunner(focus) &&
                 dist(u.x, u.y, focus.x, focus.y) <= spec.gun.maxRange * 2.2) {
        chaseTarget = focus; // no shot of my own: join the squad's real fight near the point
      } else if (mode === "BATTLE" && target && inMyDisc && !protectLead &&
                 dist(u.x, u.y, target.x, target.y) > spec.gun.maxRange * 0.9 &&
                 dist(u.x, u.y, target.x, target.y) <= spec.gun.maxRange * 1.25) {
        chaseTarget = target; // brief sally: the target is just outside range of my post
      } else {
        holdPost = true;
      }
      // v4.3 MELEE PLANT: with a target inside 14 tiles, bearing rates exceed the turret's
      // slew for a MOVING hull — the side that stands still wins the turret race (measured
      // vs bazookabot-lab: they creep at 0.0-0.3 speed and fire at full rate; our jinking/
      // travelling hulls fired 3x slower and lost every DPS race). Inside 14 tiles: plant,
      // face the threat, and shoot. Only a cripple withdrawal or artillery dodge moves us.
      const melee = target && dist(u.x, u.y, target.x, target.y) <= FP * 14;
      if (melee && !reverse) { goal = null; chaseTarget = null; holdPost = true; }
      // artillery dodge overrides
      if (o.incoming && o.incoming.length) {        for (const s of o.incoming) {
          if (s.ticks <= 28 && dist(u.x, u.y, s.x, s.y) < FP * 3) {
            const dx = u.x - s.x, dy = u.y - s.y, m = Math.hypot(dx, dy) || 1;
            goal = [u.x + Math.round(dx / m * FP * 5), u.y + Math.round(dy / m * FP * 5)];
            holdPost = false; reverse = false; chaseTarget = null;
            break;
          }
        }
      }
      // jink: predicted enemy shot at this unit within 6-10 ticks -> perpendicular burst.
      // v4.3: never in melee (inside 14 tiles the jink's own bearing swing costs more
      // turret time than the dodge saves).
      let jinking = false;
      if (threat && !reverse && !melee) {
        const last = lastShotEst[threat.id];
        const period = rules.units[threat.kind]?.gun?.reload || 0;
        if (last !== undefined && period > 0) {
          const nextShot = last + period;
          if (nextShot - o.tick >= 0 && nextShot - o.tick <= 9) {
            if (!jinkUntil[u.id] || o.tick > jinkUntil[u.id]) {
              jinkUntil[u.id] = o.tick + 7;
              jinkDir[u.id] = (u.id % 2 === 0) ? 1 : -1;
            }
          }
        }
        if (jinkUntil[u.id] && o.tick <= jinkUntil[u.id]) jinking = true;
      }

      if (o.canMove) {
        // stuck watchdog: a unit ordered to move that hasn't moved in 100 ticks is wedged
        // (pocket / wall grind) — break out toward the squad centroid for 25 ticks.
        const sm = stuckMem[u.id] || (stuckMem[u.id] = { x: u.x, y: u.y, since: o.tick, escapeUntil: 0 });
        if (o.tick - sm.since >= 100) {
          const moved = dist(u.x, u.y, sm.x, sm.y);
          const wantsMove = (goal && !holdPost) || chaseTarget;
          if (wantsMove && moved < FP * 0.6 && !reverse) sm.escapeUntil = o.tick + 25;
          sm.x = u.x; sm.y = u.y; sm.since = o.tick;
        }
        if (sm.escapeUntil && o.tick <= sm.escapeUntil && !reverse) {
          // v4.6: escape along the BFS ring descent toward my objective — the old
          // centre-steering was the very thing that wedged units in defiles (it fans
          // against the same wall that blocked the goal steering).
          const esc = myOi >= 0 ? gradientStep(u, myOi) : (myObj ? [myObj.x, myObj.y] : centroid);
          steerToPoint(u, spec, esc[0], esc[1], order);
        } else if (reverse) {
          // withdraw backwards toward spawn, hull (and front armour) kept on the threat
          const want = threat ? angleTo(u.x, u.y, threat.x, threat.y) : u.heading;
          const d = angDiff(u.heading, want);
          order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
          order.throttle = -Math.round(FP * 0.8);
          if (u.blocked) { order.throttle = FP; order.steer = FP; }
        } else if (jinking && threat) {
          const tb = angleTo(u.x, u.y, threat.x, threat.y);
          const perp = (tb + jinkDir[u.id] * 1024) & (FULL - 1);
          const gx = u.x + Math.round(Math.cos((perp / FULL) * 2 * Math.PI) * FP * 4);
          const gy = u.y + Math.round(Math.sin((perp / FULL) * 2 * Math.PI) * FP * 4);
          steerToward(u, spec, gx, gy, order, 1);
        } else if (chaseTarget) {
          steerToPoint(u, spec, chaseTarget.x, chaseTarget.y, order);
        } else if (goal && !holdPost) {
          // v3.3: ALL goal steering goes through the fan-fallback driver — plain steerToward
          // has no obstacle escape and wall-grinds against rock/ruin/water edges.
          steerToPoint(u, spec, goal[0], goal[1], order);
        } else if (holdPost) {
          order.throttle = 0;
          // facing discipline: hull front to the threat (turret is independent on mbt/apc)
          if (threat && (u.kind === "mbt" || u.kind === "apc")) {
            const want = angleTo(u.x, u.y, threat.x, threat.y);
            const d = angDiff(u.heading, want);
            if (Math.abs(d) > 60) order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
          }
        }
      }

      // ---- weapons ----
      if (spec.gun.mode === "direct") {
        const aimTarget = target || focus;
        if (aimTarget) {
          const tr = tracks[aimTarget.id];
          const hit = intercept(u, aimTarget, tr, spec.gun.shellSpeed);
          if (hit) {
            order.aimAt = [Math.round(hit[0]), Math.round(hit[1])];
            if (target && u.reload === 0) {
              const dNow = dist(u.x, u.y, target.x, target.y);
              const err = Math.abs(angDiff(u.turret, angleTo(u.x, u.y, hit[0], hit[1])));
              // v4.1: the engine does NOT check aimTolerance for fire===true — the shell
              // flies along the turret. The old gate (err <= 12.75 units = 1.1 deg) opened
              // ~7 times a game (measured avg err at ready = 135). Fire window is now
              // range-scaled: allow the error whose lateral miss at the target is ~0.9
              // tiles (target radius + splash still connects): ~103 units at 10 tiles,
              // ~51 at 20, ~34 at 30.
              const errMax = Math.max(spec.gun.aimTolerance * 1.5,
                Math.atan2(FP * 0.9, Math.max(dNow, 1)) / (2 * Math.PI) * FULL);
              if (err <= errMax && dNow <= spec.gun.maxRange && shellClear(u, hit[0], hit[1])) order.fire = true;
            }
          }
        } else {
          // v4.1: pre-aim at the freshest enemy track (turrets start on the likely bearing,
          // not slewed to the objective centre and back when contact flickers).
          let bt = null, bAge = Infinity;
          for (const id in tracks) {
            const t = tracks[id], age = o.tick - t.lastTick;
            if (age < bAge && (rules.units[t.kind]?.gun?.mode ?? "none") !== "none") { bAge = age; bt = t; }
          }
          if (bt && bAge <= 200) order.aimAt = [Math.round(bt.x + bt.vx * 20), Math.round(bt.y + bt.vy * 20)];
          else if (myObj) order.aimAt = [myObj.x, myObj.y];
        }
        // v4.1 stop-to-shoot: in the last 16 ticks before the gun is ready, own motion is
        // the biggest source of bearing swing at fighting range — plant and let the
        // turret settle (the top bots creep at 0.0-0.3 speed while fighting; we did not).
        if (target && u.reload <= 16 && !jinking && !reverse) order.throttle = 0;
      }
      units.push(order);
    });

    const out = { units };
    if (o.tick - lastSay >= 600) {
      lastSay = o.tick;
      out.say = `v4 ${mode} score ${myScore}-${theirScore} proj ${Math.round(projDiff)} focus ${focusId || "-"}`;
    }
    return out;
  },
};
