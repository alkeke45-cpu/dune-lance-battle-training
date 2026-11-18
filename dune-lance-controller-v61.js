// dune-lance v6.1 "Deathball" — battle.training controller (Season 2 "Drafted", armor theater, s2.0.0)
//
// v6.1 REFINEMENTS (same day, from v6.0's three named-seed server scrimmages):
//  - Seed 999: the solo death is GONE (no t1326 — our #1 died at t3193 in a 2v2 with
//    #2 adjacent, and the pair killed both centre MBTs; game-1 damage trade WON
//    320-235, kills 2-1). But MOPUP fired at t2000 under TOTAL blindness (zero
//    contacts ever) and its scatter sent hulls to three different objectives —
//    the gate had allowed it because "seen gunners <= 1" counted 0 as safe. Zero
//    sightings is not visual evidence of anything: MOPUP fighter scatter now
//    requires the deathball unlock itself (confirmed cripple or split evidence).
//  - Seed 4242: arrival spread compressed 1834 -> 245 ticks, but the leash's
//    nearest-mate metric let a PAIR run off together (mutual nearest mates) and
//    leave the wedged trailer behind — the fight still fractured 2+1. The leash
//    gains a squad-diameter clause: separation to the FARTHEST alive squadmate
//    > 20 tiles restrains a unit whose goal does not close on that squadmate.
//  - Seed 999 again: after capping its disc, #3 wedged in a pocket and every
//    escape path (watchdog, re-anchor) steered by the same BFS gradient that
//    trapped it. A unit whose re-anchor fires a SECOND time for the same
//    objective now gets a 300-tick REGROUP order: steer directly at the squad
//    centroid (fan-fallback steering, not the gradient) — if it cannot reach
//    the objective, it rejoins the body.
// (Seed 4242's remaining wound is firing position, not doctrine: our 12 shots
// from the south approach all died on the centre plateau's rim — the shell-path
// check passed them, the engine's finer test did not. Measured, not fixed here.)
//
// v6.0 DEATHBALL DOCTRINE (Phase 23 — from the Phase 22 seed-999 autopsy, re-verified
// tick-by-tick from the v5.2 replay before designing): all three v4.6/v5.1/v5.2 runs of
// seed 999 lost the game in the BRAWL (480 taken vs 310-370 dealt), not the duel. The
// route probe showed the full causal chain: (1) the squad wedged on terrain ~7 tiles
// short of its home flank and never capped it; (2) at ~t750 the v4.5 give-up-and-switch
// flipped the battle objective to centre; (3) hull #1 — the only mobile unit — obeyed
// alone, met smokepit's centre pair 1v2 at t1072 and died at t1326, while #2/#3 stayed
// wedged ~500 more ticks (their goal steering runs through steerToPoint, whose blocked
// response — full reverse + spin EVERY blocked tick — never got steerToward's v4.5
// 8-tick fix and oscillates in a pocket indefinitely); range-30 entries landed
// t861/1221/1331, a 470-tick arrival spread. The old detach block never even fired in
// that game — the piecemeal death came from un-governed solo movement, so v6 governs
// ALL of it:
//  - NO LONE DETACHMENT (detach doctrine redesign): the v3.2 detach (securedQuiet and
//    midBattleSplit) is now GATED behind a deathball unlock. Default = all 3 MBTs stay
//    on the primary objective/convergence route as one deathball. A single unit may
//    detach only when (A) the enemy is CONFIRMED crippled: >= 2 enemy gunners
//    kill-confirmed and <= 1 gunner remaining of those seen; or (B) visual evidence
//    the enemy cannot concentrate: only non-gunners visible with no fresh gunner
//    track near the target objective, or >= 2 visible gunners split > 45 tiles apart
//    and all out of gun range. Kill confirmation uses the only death signal the
//    observation model gives: a gunner that vanishes from the squad-shared sensor
//    picture while <= 13 tiles from its nearest seer (an MBT moves 0.175 tiles/tick,
//    a scout 0.3 — it cannot exit a 20-tile sensor bubble from 13 tiles in one tick),
//    with the spot still sensor-covered at the vanish tick, and no reappearance for
//    150 ticks. A reappearing "corpse" is un-confirmed at once. Residual risk, stated
//    plainly: a gunner never yet seen is invisible to the arithmetic — the unlock
//    additionally requires <= 1 gunner currently in contact, and the v4
//    detachedOutnumbered fallback (any gunner contact while alone -> fall back to
//    the battle objective) remains the detached unit's safety net.
//  - SQUAD-INTEGRITY LEASH (the seed-999 fix proper): a travelling fighter with no
//    target of its own may not increase its separation from the nearest alive
//    squadmate beyond 16 tiles. If it is already beyond 16 and its goal does not
//    close on that squadmate, it holds position (facing the threat/convergence
//    bearing) until the squad closes up. The leash governs goal steering in every
//    mode — objective marches, give-up switches, re-anchors — so no mechanism can
//    send one hull into the enemy concentration alone again. Escapes, reverses,
//    jinks, dodges and fight-joining chases are exempt (they recover mobility or
//    move toward the fight). The detached unit is exempt only while the unlock
//    holds; the duel unit is alone by definition (fighters < 2 -> leash vacuous).
//  - MOPUP SPREAD GATED the same way: MOPUP's per-unit objective scatter is a split
//    by another name — fighters scatter only when the deathball unlock holds or at
//    most one enemy gunner has ever been seen (no deathball exists to punish it).
//  - steerToPoint BLOCKED RESPONSE brought up to the v4.5 standard (reverse + spin
//    only for the first 8 ticks of a blockage episode via the shared blockedStreak
//    counter, then creep at 0.4 and let wall-slide work): the un-fixed version is
//    what kept #2/#3 wedged for ~1,000 ticks on seed 999.
// Everything else is v5.2 verbatim: cohesion throttle (v5.1 form), tick-0 pre-aim,
// the lone-survivor duel protocol (v5.2 form), per-unit stuck re-anchor, shell-path
// margin, focus fire, melee plant, jink estimation.
//
// v5.2 FIX (same day, from the v5.1 seed-999 server scrimmage): the v5.0/5.1 duel
// trigger — "exactly one enemy gunner track <= 900 ticks old" — NEVER FIRED in the
// re-run: smokepit's surviving MBT had held the far flank and never entered our sensor
// range (no track existed for it at all), while the two DEAD enemies' tracks were
// still inside the 900-tick window and failed the count. Our survivor again held its
// post and died at 35 hp without the protocol engaging. The observation model never
// reports enemy deaths and unseen enemies leave no track, so the trigger is now the
// LONE-SURVIVOR STATE itself (our last fighter, win not locked): the foe is the single
// live gunner contact when there is one, else the freshest remembered gunner track;
// arriving at a presumed (dead) foe's last position mutes the hunt for 300 ticks so
// normal doctrine (MOPUP/PRESS) resumes instead of camping a corpse. Also from the
// v5.1 scrimmages: seed 4242's freeze is gone and the first volley was simultaneous
// (our three first shots the same tick, 3-9 ticks before sck's) with damage 0 -> 186,
// and seed 12345's occupation race tightened from -2334 (v5.0) to -318 points.
//
// v5.1 FIX (same day, from the v5.0 seed-12345 server scrimmage — a measured deadlock):
// v5.0's cohesion DEADLOCKED the squad on its own flank approach: the lead units reached
// BFS field <= 3 at a 1-wide cliff gap and the lip-hold parked them IN the gap mouth
// (throttle 0) while the trailer — physically 5 tiles behind them but 9 BFS tiles away
// around the cliff — could neither pass the parked hulls nor close the BFS gap, so the
// hold never released: ~1,900 ticks scoring 0 outside our own disc, lost the points race
// 6282-8616 without a shot fired. Cohesion is rewritten: NO lip-hold (a unit at field
// <= 6 is arriving — it enters, full speed), throttle only when the trailer is >5
// EUCLIDEAN tiles away as well as >3 BFS tiles behind (a BFS gap across a cliff is a
// terrain artifact, not a pace gap), floor raised 0.2/0.35 -> 0.3/0.45, never while the
// leader is blocked, and the whole mechanism time-boxes: 300 ticks of cumulative
// throttling (or first contact) expires it for the game. The per-unit re-anchor is also
// hardened: while the squad is fully blind (no contact, no tracks ever), a stuck unit
// takes the long ring-descent escape on its OWN objective instead of splitting alone to
// the battle objective (v5.0 sent an MBT solo to centre mid-wedge — blind splits are
// what v4 doctrine forbids).
//
// v5.0 changes (Phase 22 — from tick-level inspection of the three Phase 21 scrimmages):
//  - FORMATION COHESION THROTTLE (seed 4242, v4.5 vs sck-waypoint: range-30 entry spread was
//    363 ticks / 18.2 s — the lead MBT entered the parked trio's ground alone and died at
//    t1375 while its squadmates were still queueing at the cliff defile): during the
//    no-contact approach, any fighter >3 BFS tiles ahead of the squad's trailer toward the
//    battle objective is throttled (0.35, or 0.2 when >8 ahead; a unit already on the disc
//    lip holds position) so all three guns cross into range together and the first volley
//    is a simultaneous 3-shell volley.
//  - TICK-0 TURRET PRE-AIMING (seed 12345, v4.3 vs bazookabot-lab: turret error at first
//    contact was 24.8/62.9/60.8 deg = 6/15/13 ticks of slew delay, because turrets idled on
//    the objective centre; bazookabot pre-aims a fixed convergence point from t=0): turrets
//    now pre-aim the CONVERGENCE POINT (battle objective biased 35% toward the enemy spawn)
//    from tick 0, and the no-target aim never snaps back to the objective centre again —
//    it holds the freshest enemy track's predicted position for the track's whole 900-tick
//    memory, so re-contact after a flicker costs ~0 slew.
//  - ENDGAME DUEL PROTOCOL (seed 999, v4.6 vs smokepit — the named final-110-HP cause):
//    the duel began 85 hp vs 160 at 30.9 tiles and our survivor HELD ITS POST for ~1,040
//    ticks with no contact, letting smokepit choose the moment and angle: it charged in
//    and opened with a 35-dmg SIDE hit, then won the stationary frontal trade 25-for-25.
//    Three failures, three fixes: (i) PASSIVITY — in a 1v1 with no contact the last hull
//    now HUNTS the enemy's last known position instead of holding a post; (ii) ANGLE —
//    while contact is lost the hull faces the track bearing, so a charge never finds our
//    side; (iii) TRADE MATH — when behind on HP the duel unit refuses the melee plant and
//    fights from a 15-26 tile kiting band (close front-first when beyond 26, reverse
//    front-to-threat when inside 15, hold + jink inside the band), where the enemy must
//    cross open ground to reach us instead of dictating a point-blank slugfest.
//  - PER-UNIT STUCK RE-ANCHOR (seed 4242 again: two MBTs crept ~2 tiles in 2,000 ticks
//    against a cliff face en route to a flank post while the fight burned at centre — the
//    100-tick watchdog and the centroid give-up never freed them): every fighter now keeps
//    a personal progress tracker toward its current goal; 600 ticks without improvement
//    re-anchors it to the battle objective (or, if already bound there, to the centroid-
//    nearest post slot with a 150-tick forced ring-descent escape).
//  - SHELL-PATH MARGIN 10 -> 22 raw units, sampling 0.5 -> 0.33 tiles: on seed 4242 our
//    first six shells (8-30 tiles) ALL died on the cliff rim the old check waved through;
//    the engine's step test is finer than our approximation (v4.2 note). Open-map fire
//    volume is battery-checked against v4.6 to prove no starvation regression.
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
let convAim = null;         // v5.0: tick-0 turret pre-aim point (convergence vector)
let unitProg = {};          // v5.0: unit id -> {key, best, tick} personal progress tracker
let unitReanchor = {};      // v5.0: unit id -> {oi, until, longEscapeUntil}
let cohSince = 0;           // v5.1: first tick cohesion actually throttled a unit (0 = never)
let cohExpired = false;     // v5.1: cohesion time-box / first-contact expiry latch
let duelMuteUntil = 0;      // v5.2: corpse-hunt cooldown (duel hunt muted until this tick)
let seenGunners = new Set();  // v6.0: enemy gunner ids ever in contact
let lastSeenInfo = {};        // v6.0: contact id -> {tick, minDist} nearest-friendly distance at last sighting
let suspectDead = {};         // v6.0: gunner id -> vanish tick (close-range vanish, unconfirmed)
let confirmedDead = new Set();// v6.0: gunner ids kill-confirmed (no reappearance for 150 ticks)
let unitReanchorCount = {};   // v6.1: unit id -> {oi, count} consecutive re-anchors for one objective
let unitRegroup = {};         // v6.1: unit id -> tick until which it steers at the squad centroid

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
  // v5.0: margin 10 -> 22, step 0.5 -> 0.33 tiles (seed 4242 rim-blocked volley, see header)
  const steps = Math.max(2, Math.ceil(d / (FP / 3)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = u.x + (ax - u.x) * t, y = u.y + (ay - u.y) * t;
    if (heightAt(x, y) > z0 + (z1 - z0) * t + 22) return false;
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

/** steer directly at a point with a fan fallback when the tile ahead is impassable (from v2).
 *  v5.0: optional throttleScale (formation cohesion) multiplies the cruise throttle. */
function steerToPoint(u, spec, gx, gy, order, throttleScale) {
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
  order.throttle = Math.round(FP * turnScale * (throttleScale ?? 1));
  // v6.0: same v4.5 episode discipline as steerToward — the old unconditional
  // reverse+spin on every blocked tick oscillated wedged units in pockets for
  // ~1,000 ticks (seed 999's #2/#3). Reverse only for the first 8 ticks of a
  // blockage episode (shared blockedStreak counter), then creep and wall-slide.
  if (u.blocked) {
    const bs = (blockedStreak[u.id] = (blockedStreak[u.id] || 0) + 1);
    if (bs <= 8) { order.throttle = -FP; order.steer = FP; }
    else order.throttle = Math.round(FP * 0.4 * (throttleScale ?? 1));
  } else blockedStreak[u.id] = 0;
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
    unitProg = {}; unitReanchor = {};
    cohSince = 0; cohExpired = false; duelMuteUntil = 0;
    seenGunners = new Set(); lastSeenInfo = {}; suspectDead = {}; confirmedDead = new Set();
    unitReanchorCount = {}; unitRegroup = {};
    // v5.0 TICK-0 PRE-AIM: the convergence point — battle objective biased 35% toward the
    // enemy spawn. First contact almost always arrives along this bearing (both squads
    // converge on the same contested ground), so turrets idling on it start the fight
    // already laid on, instead of 25-63 deg off as measured in the seed-12345 scrimmage.
    convAim = null;
    if (battleOi >= 0 && objectives[battleOi]) {
      const bo = objectives[battleOi];
      const es = map.spawns[1 - side];
      convAim = [Math.round(bo.x + (es[0] * FP - bo.x) * 0.35),
                 Math.round(bo.y + (es[1] * FP - bo.y) * 0.35)];
    }
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

    // ---- v6.0 DEATHBALL kill bookkeeping: the observation model never reports enemy
    // deaths, so a kill is CONFIRMED only by a close-range vanish: a gunner that was
    // in contact last tick at <= 13 tiles from its nearest friendly (no unit in the
    // roster can move more than 0.3 tiles/tick, so it cannot exit the 20-tile sensor
    // bubble from 13 tiles in one tick), whose last position is still inside some
    // living friendly's sensor range at the vanish tick, and which does not
    // reappear for 150 ticks. A reappearance un-confirms at once (it was a
    // line-of-sight break, not a kill). False negatives only delay the detach
    // unlock; the design accepts no false positives it can avoid. ----
    {
      const isGunnerKind = k => { const g = rules.units[k]?.gun; return g && g.mode !== "none"; };
      const contactIds = new Set();
      for (const c of o.contacts) {
        contactIds.add(c.id);
        let md = Infinity;
        for (const u of alive) { const dd = dist(u.x, u.y, c.x, c.y); if (dd < md) md = dd; }
        lastSeenInfo[c.id] = { tick: o.tick, minDist: md };
        if (isGunnerKind(c.kind)) {
          seenGunners.add(c.id);
          if (suspectDead[c.id] !== undefined) delete suspectDead[c.id];
          if (confirmedDead.has(c.id)) confirmedDead.delete(c.id);
        }
      }
      for (const id in lastSeenInfo) {
        const info = lastSeenInfo[id];
        if (info.tick !== o.tick - 1 || contactIds.has(Number(id))) continue;
        const tr = tracks[id];
        if (!tr || !isGunnerKind(tr.kind)) continue;
        if (suspectDead[id] !== undefined || confirmedDead.has(Number(id))) continue;
        if (info.minDist > FP * 13) continue;
        // the spot must still be sensor-covered now, else the vanish proves nothing
        let covered = false;
        for (const u of alive) {
          const sr = rules.units[u.kind]?.sensorRange ?? FP * 20;
          if (dist(u.x, u.y, tr.x, tr.y) <= sr) { covered = true; break; }
        }
        if (covered) suspectDead[id] = o.tick;
      }
      for (const id in suspectDead) {
        if (o.tick - suspectDead[id] >= 150 && !contactIds.has(Number(id))) {
          confirmedDead.add(Number(id));
          delete suspectDead[id];
        }
      }
    }
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

    // ---- v6.0 DEATHBALL UNLOCK: a lone detachment is allowed ONLY when the enemy
    // cannot punish it — (A) confirmed crippled: >= 2 gunners kill-confirmed and
    // <= 1 gunner remaining of those ever seen, with <= 1 gunner in contact now; or
    // (B) visual split evidence: only non-gunners visible and no fresh gunner track
    // within 45 tiles of the candidate objective, or >= 2 visible gunners split
    // > 45 tiles apart with every one of them out of gun range of the squad. ----
    const gunContactsNow = o.contacts.filter(isGunner);
    const unlockA = confirmedDead.size >= 2 &&
      (seenGunners.size - confirmedDead.size) <= 1 && gunContactsNow.length <= 1;
    const detachUnlocked = candOi => {
      if (unlockA) return true;
      if (gunContactsNow.length >= 2) {
        let split = true;
        for (let a = 0; a < gunContactsNow.length && split; a++)
          for (let b = a + 1; b < gunContactsNow.length; b++)
            if (dist(gunContactsNow[a].x, gunContactsNow[a].y, gunContactsNow[b].x, gunContactsNow[b].y) <= FP * 45) split = false;
        if (split && gunContactsNow.every(c => dist(c.x, c.y, centroid[0], centroid[1]) > FP * 30)) return true;
      }
      if (gunContactsNow.length === 0 && o.contacts.length > 0 && candOi >= 0 && objectives[candOi]) {
        const ob = objectives[candOi];
        let freshNear = false;
        for (const id in tracks) {
          const t = tracks[id];
          const g = rules.units[t.kind]?.gun;
          if (g && g.mode !== "none" && o.tick - t.lastTick <= 600 &&
              dist(t.x, t.y, ob.x, ob.y) <= FP * 45) { freshNear = true; break; }
        }
        if (!freshNear) return true;
      }
      return false;
    };
    const deathballUnlocked = unlockA || detachUnlocked(battleOi);

    // ---- detach (v3.2; v3.4 loosened; v6.0 DEATHBALL-GATED): one fighter takes the second point so the squad
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
        if (!gunnersNear && detachUnlocked(i) && val > bv && (dTiles <= 55 || o.tick > 3000)) { bv = val; cand = i; }
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
          if (detachUnlocked(i) && val > bv && (dTiles <= 55 || o.tick > 3000)) { bv = val; detachOi = i; }
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

    // ---- v5.2 ENDGAME DUEL detection (rewritten): the trigger is the lone-survivor
    // state itself — our last fighter alive, win not already locked. The foe is the
    // single live gunner contact when exactly one exists; with no gunner contact, the
    // freshest remembered gunner track is the presumed foe (it may be a corpse — the
    // hunt mutes on arrival, see the steering branch). >= 2 gunner contacts = a real
    // multi-enemy endgame: normal doctrine governs. (v5.0/5.1 required exactly one
    // track <= 900 ticks; on seed 999 the real killer had never been in sensor range —
    // no track — while two dead enemies' stale tracks failed the count.) ----
    let duelFoe = null, duelFoeId = 0, duelLive = null;
    const endgame = fighters.length === 1 && alive.length === 1 && lockMargin <= 0;
    if (endgame && o.tick >= duelMuteUntil) {
      const gunContacts = o.contacts.filter(c => (rules.units[c.kind]?.gun?.mode ?? "none") !== "none");
      if (gunContacts.length === 1) {
        duelLive = gunContacts[0]; duelFoeId = duelLive.id;
        duelFoe = tracks[duelFoeId] || { x: duelLive.x, y: duelLive.y, vx: 0, vy: 0, hpFrac: duelLive.hpFrac, kind: duelLive.kind, lastTick: o.tick };
      } else if (gunContacts.length === 0) {
        let bAge = Infinity;
        for (const id in tracks) {
          const t = tracks[id], age = o.tick - t.lastTick;
          if ((rules.units[t.kind]?.gun?.mode ?? "none") !== "none" && age < bAge) { bAge = age; duelFoe = t; duelFoeId = Number(id); }
        }
        if (bAge > 900) { duelFoe = null; duelFoeId = 0; }
      }
    }

    // ---- v5.1 FORMATION COHESION precompute (rewritten after v5.0's seed-12345
    // deadlock): BFS progress of each battle-bound fighter toward the battle objective
    // + the trailer's identity. Throttling is applied in the steering branch, gated on
    // EUCLIDEAN separation as well as BFS gap, and time-boxed via cohSince/cohExpired. ----
    const cohFv = {};
    let cohTrailId = 0, cohTrailFv = 0, cohActive = false;
    if (anyContact) cohExpired = true; // cohesion is an opening tool only
    if (!anyContact && !cohExpired && (mode === "OPENING" || mode === "MARCH") && battleOi >= 0) {
      const group = fighters.filter(f => f.id !== detachedId);
      if (group.length >= 2) {
        for (const f of group) {
          const fld = fields[battleOi];
          let fv = fld ? fld[tileOf(f.x, f.y)] : -1;
          if (fv < 0) fv = Math.round(dist(f.x, f.y, objPts[battleOi][0], objPts[battleOi][1]) / FP);
          cohFv[f.id] = fv;
          if (fv >= cohTrailFv) { cohTrailFv = fv; cohTrailId = f.id; }
        }
        cohActive = true;
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
        // v6.0 DEATHBALL: the MOPUP scatter is a split by another name — fighters
        // scatter only when the deathball unlock holds. v6.1: total blindness
        // (zero gunners ever seen) is NOT evidence the enemy cannot punish a
        // split — the unlock itself (confirmed cripple / split sighting) is
        // required. Otherwise the squad mops up as one body on the battle objective.
        if (isCapper || deathballUnlocked) {
          const spread = objectives.filter((_, i) => true);
          myOi = spread.length ? (ui % spread.length) : battleOi;
        }
      }
      if (detachedId && u.id === detachedId && detachOi >= 0) myOi = detachOi;
      // ---- v5.0 PER-UNIT STUCK RE-ANCHOR (seed 4242: two MBTs crept ~2 tiles in 2,000
      // ticks against a cliff face bound for a flank post while the fight burned at
      // centre; the 100-tick watchdog's 25-tick escapes and the centroid give-up never
      // freed them). Personal progress tracker toward my objective's centre: while
      // travelling (outside the disc, no gun target of my own), 600 ticks without
      // >=0.5 tiles of improvement re-anchors me — to the battle objective, or if I am
      // already bound there, to a 150-tick forced ring-descent escape. ----
      if (spec.gun && spec.gun.mode === "direct" && myOi >= 0 && objectives[myOi]) {
        const ra = unitReanchor[u.id];
        if (ra && o.tick > ra.until) delete unitReanchor[u.id];
        if (ra && ra.oi !== myOi && !(detachedId && u.id === detachedId)) myOi = ra.oi;
        const dObj = dist(u.x, u.y, objPts[myOi][0], objPts[myOi][1]) / FP;
        const pk = mode + ":" + myOi;
        let pg = unitProg[u.id];
        if (!pg || pg.key !== pk) { pg = unitProg[u.id] = { key: pk, best: dObj, tick: o.tick }; }
        if (dObj < pg.best - 0.5) { pg.best = dObj; pg.tick = o.tick; delete unitReanchorCount[u.id]; }
        const myTargetNow = focus && dist(u.x, u.y, focus.x, focus.y) <= spec.gun.maxRange * 1.02;
        if (!myTargetNow && dObj > objectives[myOi].radius / FP + 2 && o.tick - pg.tick > 600 && o.tick > 700) {
          // v5.1: while the squad is fully blind (no contact, no enemy ever tracked), a
          // stuck unit takes the long escape on its OWN objective — splitting alone to
          // the battle objective blind is the piecemeal death v4 doctrine forbids (v5.0
          // sent a wedged MBT solo to centre on seed 12345 while its squad was stuck).
          const squadBlind = !anyContact && Object.keys(tracks).length === 0;
          // v6.1: count consecutive re-anchors for the same target objective — a
          // second failure means every gradient-based escape is cycling in the
          // same trap, so the unit gets a REGROUP order (see movement chain).
          const targetOi = (myOi !== battleOi && battleOi >= 0 && !squadBlind) ? battleOi : myOi;
          const rc = unitReanchorCount[u.id];
          if (rc && rc.oi === targetOi) rc.count++;
          else unitReanchorCount[u.id] = { oi: targetOi, count: 1 };
          if (unitReanchorCount[u.id].count >= 2 && fighters.length >= 2) unitRegroup[u.id] = o.tick + 300;
          if (myOi !== battleOi && battleOi >= 0 && !squadBlind) {
            unitReanchor[u.id] = { oi: battleOi, until: o.tick + 1200, longEscapeUntil: 0 };
            myOi = battleOi;
          } else {
            unitReanchor[u.id] = { oi: myOi, until: o.tick + 1200, longEscapeUntil: o.tick + 150 };
          }
          unitProg[u.id] = { key: mode + ":" + myOi, best: Infinity, tick: o.tick };
        }
      }
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
      // ---- v5.2 ENDGAME DUEL PROTOCOL (seed 999 post-mortem, see header): I am the last
      // hull and one enemy gunner remains. Doctrine by contact + trade math:
      //  - no contact: HUNT the last known position (never hold a post while the enemy
      //    repositions for free — that passivity cost us the duel before it started);
      //    arriving at a presumed foe's position with still no contact mutes the hunt
      //    for 300 ticks (the track was a corpse — normal doctrine resumes);
      //  - contact and BEHIND on HP: refuse the point-blank trade — close front-first
      //    beyond 26 tiles, reverse front-to-threat inside 15, hold + jink in the band;
      //  - contact and ahead/even: no plan — normal doctrine (close, plant, finish). ----
      let duelPlan = null;
      if (duelFoe && spec.gun && spec.gun.mode === "direct") {
        const foeC = duelLive || o.contacts.find(c => c.id === duelFoeId) || null;
        const foeHp = ((foeC ? foeC.hpFrac : duelFoe.hpFrac) / FP) * (rules.units[duelFoe.kind]?.hp ?? 160);
        if (!foeC) {
          const dTrack = dist(u.x, u.y, duelFoe.x, duelFoe.y);
          if (dTrack <= FP * 3) { duelMuteUntil = o.tick + 300; duelPlan = null; }
          else duelPlan = { goal: [duelFoe.x, duelFoe.y] };
        } else if (u.hp < foeHp - 10) {
          const d = dist(u.x, u.y, foeC.x, foeC.y);
          if (d > FP * 26) {
            const m = d || 1;
            duelPlan = { goal: [Math.round(foeC.x + (foeC.x - u.x) / m * FP * 10),
                                 Math.round(foeC.y + (foeC.y - u.y) / m * FP * 10)] };
          } else if (d < FP * 15) duelPlan = { reverse: true };
          else duelPlan = { hold: true };
        }
      }
      if (duelPlan && duelPlan.reverse) reverse = true;
      if (cripple) { reverse = true; }
      else if (duelPlan && duelPlan.goal) { goal = duelPlan.goal; }
      else if (duelPlan && duelPlan.hold) { holdPost = true; }
      else if (detachedOutnumbered && battleOi >= 0 && objectives[battleOi]) {
        goal = [objectives[battleOi].x, objectives[battleOi].y];
      }
      // v4 RALLY: I have no target of my own and a squadmate is being piecemealed -> go.
      else if (rallyPoint && !target && !(detachedId && u.id === detachedId) &&
               dist(u.x, u.y, rallyPoint[0], rallyPoint[1]) > FP * 18) {
        goal = rallyPoint;
      }
      // v6.1 REGROUP: my re-anchor has failed twice for the same objective — every
      // gradient-based escape is cycling in the same terrain trap. Steer directly
      // at the squad centroid instead (fan-fallback steering): if I cannot reach
      // the objective, I rejoin the body and the deathball moves as one.
      else if (o.tick < (unitRegroup[u.id] || 0) && fighters.length >= 2 &&
               !(detachedId && u.id === detachedId)) {
        goal = centroid;
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
        const longEsc = (unitReanchor[u.id] && unitReanchor[u.id].longEscapeUntil) || 0;
        if (((sm.escapeUntil && o.tick <= sm.escapeUntil) || o.tick <= longEsc) && !reverse) {
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
          // v6.0 DEATHBALL LEASH (seed 999's actual killer — see header): a fighter
          // travelling with no target of its own may not grow its separation from
          // the nearest alive squadmate beyond 16 tiles. Beyond 16, if the goal
          // does not close on that squadmate, the unit holds position and faces
          // the threat/convergence bearing until the squad closes up. This governs
          // EVERY goal-steering path (objective march, give-up switch, re-anchor),
          // so no mechanism can send one hull into the enemy concentration alone.
          // Moving toward the squad is always allowed (rally goals are a squadmate's
          // position, so they pass by construction). Exempt: the detached unit
          // while the unlock holds, cappers, and a lone surviving fighter.
          let leashHold = false;
          if (spec.gun && spec.gun.mode === "direct" && !target && fighters.length >= 2 &&
              !(detachedId && u.id === detachedId)) {
            let sep = Infinity, nearMate = null, farSep = -1, farMate = null;
            for (const g2 of fighters) {
              if (g2.id === u.id) continue;
              const dd = dist(u.x, u.y, g2.x, g2.y);
              if (dd < sep) { sep = dd; nearMate = g2; }
              if (dd > farSep) { farSep = dd; farMate = g2; }
            }
            if (nearMate && sep > FP * 16 &&
                dist(goal[0], goal[1], nearMate.x, nearMate.y) >= sep - FP * 0.5) leashHold = true;
            // v6.1 squad-diameter clause: the nearest-mate test alone let a PAIR
            // run off together on seed 4242 (mutual nearest mates, trailer left
            // wedged behind). Separation to the FARTHEST squadmate > 20 tiles
            // restrains any unit whose goal does not close on that squadmate.
            if (!leashHold && farMate && farSep > FP * 20 &&
                dist(goal[0], goal[1], farMate.x, farMate.y) >= farSep - FP * 0.5) leashHold = true;
          }
          if (leashHold) {
            order.throttle = 0;
            const facePos = threat || (duelFoe ? duelFoe : null) || (convAim ? { x: convAim[0], y: convAim[1] } : null);
            if (facePos && (u.kind === "mbt" || u.kind === "apc")) {
              const want = angleTo(u.x, u.y, facePos.x, facePos.y);
              const d = angDiff(u.heading, want);
              if (Math.abs(d) > 60) order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
            }
          } else {
          // v3.3: ALL goal steering goes through the fan-fallback driver — plain steerToward
          // has no obstacle escape and wall-grinds against rock/ruin/water edges.
          // v5.1 FORMATION COHESION (rewritten — v5.0's version deadlocked a squad in a
          // cliff gap, see header): throttle a battle-bound fighter only when it is
          // >3 BFS tiles ahead of the trailer AND >5 EUCLIDEAN tiles away from the
          // trailer hull AND still >6 BFS tiles out from the objective (inside 6 it is
          // arriving — it enters at full speed; there is NO lip-hold) AND not blocked.
          // Cumulative throttling beyond 300 ticks expires cohesion for the game.
          let cohScale = 1;
          if (cohActive && cohFv[u.id] !== undefined && cohFv[u.id] > 6 && !u.blocked) {
            const trailer = alive.find(a => a.id === cohTrailId);
            const gap = cohTrailFv - cohFv[u.id];
            const euclid = trailer ? dist(u.x, u.y, trailer.x, trailer.y) / FP : 0;
            if (gap > 3 && euclid > 5) {
              if (cohSince === 0) cohSince = o.tick;
              if (o.tick - cohSince > 300) cohExpired = true;
              else cohScale = gap > 8 ? 0.3 : 0.45;
            }
          }
          steerToPoint(u, spec, goal[0], goal[1], order, cohScale);
          }
        } else if (holdPost) {
          order.throttle = 0;
          // facing discipline: hull front to the threat (turret is independent on mbt/apc)
          // v5.0: in a duel with contact lost, face the TRACK bearing — smokepit's charge
          // found our side because a post-holding hull never turned toward the last known
          // enemy position while it approached outside sensor range.
          const facePos = threat || (duelFoe ? duelFoe : null);
          if (facePos && (u.kind === "mbt" || u.kind === "apc")) {
            const want = angleTo(u.x, u.y, facePos.x, facePos.y);
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
          // v5.0 TICK-0 PRE-AIM + BEARING MEMORY: turrets idle on (1) the freshest enemy
          // track's predicted position — now held for the track's whole 900-tick memory
          // (v4.1 dropped it at 200 ticks and snapped back to the objective centre, so a
          // contact flicker cost a fresh 10-20 deg slew at re-contact); (2) before any
          // contact exists, the CONVERGENCE POINT computed in hello() — the bearing the
          // enemy's approach actually arrives on (bazookabot's t=0 pre-aim, measured in
          // its replays; our seed-12345 turret error at first contact was 25-63 deg).
          let bt = null, bAge = Infinity;
          for (const id in tracks) {
            const t = tracks[id], age = o.tick - t.lastTick;
            if (age < bAge && (rules.units[t.kind]?.gun?.mode ?? "none") !== "none") { bAge = age; bt = t; }
          }
          if (bt && bAge <= 900) order.aimAt = [Math.round(bt.x + bt.vx * 20), Math.round(bt.y + bt.vy * 20)];
          else if (convAim) order.aimAt = convAim;
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
      out.say = `v6 ${mode} score ${myScore}-${theirScore} proj ${Math.round(projDiff)} focus ${focusId || "-"}`;
    }
    return out;
  },
};
