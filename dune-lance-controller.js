// battle.training starter controller (JavaScript)
//
// Your controller is an object with two functions, plus an optional third. The arena calls hello()
// once with the rules and the full map, then tick() twenty times a second with what your squad can
// see. You return orders. All positions are fixed-point: tiles × 65536. Angles are 0..4095 for a
// full turn, 0 = east, increasing clockwise (towards south). Everything is integers.
//
// Season 2 ("Drafted"): draft(h) runs before hello() with the same h (map, rules, h.draft.roster /
// costs / budget / min / max) and returns 3–5 unit kinds whose costs fit h.draft.budget. This starter
// drafts two tanks and two scouts (12 points) when a draft is offered; without a draft() the default
// squad (scout + MBT + artillery, 10 points) plays. If you draft other kinds, handle them in tick():
// drones have no gun, missile carriers need `target` every tick until locked, engineers use
// `ability: "smoke" | "mine"`. See docs/controller-api.md.
//
// This starter does three things: drives every unit towards the most valuable objective it does not
// hold (weight over distance; the centre of the map when there are no objectives) while steering
// around water, rock and ruins, points guns at the nearest visible enemy, and fires when ready. It
// loses to anything smarter. That is the point.

const FP = 65536;
const FULL = 4096;

let rules, map, side, hill;

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angleTo(ax, ay, bx, by) { return Math.round((Math.atan2(by - ay, bx - ax) / (2 * Math.PI)) * FULL) & (FULL - 1); }
function angDiff(a, b) { let d = (b - a) & (FULL - 1); return d > FULL / 2 ? d - FULL : d; }
function passable(x, y) {
  const tx = Math.floor(x / FP), ty = Math.floor(y / FP);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  const t = map.terrain[ty * map.width + tx];
  return t !== 2 && t !== 4 && t !== 6; // 2 water, 4 rock, 6 ruin
}
/** the objective worth driving to: highest weight per tile of distance, skipping the ones we already hold */
function pickObjective(objectives, x, y) {
  let best = null, score = -1;
  for (const o of objectives || []) {
    if (o.owner === side && o.state === "held") continue;
    const s = o.weight / (1 + dist(x, y, o.x, o.y) / FP);
    if (s > score) { score = s; best = o; }
  }
  return best ? [best.x, best.y] : hill;
}

globalThis.controller = {
  draft(h) {
    const d = h.draft;
    if (!d) return undefined;
    const pick = ["apc", "mbt", "scout", "scout"];
    const cost = pick.reduce((c, k) => c + (d.costs[k] ?? 99), 0);
    return cost <= d.budget && pick.every(k => d.roster.includes(k)) ? pick : undefined;
  },

  hello(h) {
    rules = h.rules; map = h.map; side = h.side;
    hill = [Math.floor(map.width / 2) * FP + FP / 2, Math.floor(map.height / 2) * FP + FP / 2];
  },

  tick(o) {
    // shared focus: weakest contact; velocity memory for leading
    globalThis._pv = globalThis._pv || {};
    const vel = {};
    for (const c of o.contacts) {
      const p = globalThis._pv[c.id];
      vel[c.id] = (p && o.tick > p[2]) ? [(c.x - p[0]) / (o.tick - p[2]), (c.y - p[1]) / (o.tick - p[2])] : [0, 0];
      globalThis._pv[c.id] = [c.x, c.y, o.tick];
    }
    let focus = null, fs = Infinity;
    for (const c of o.contacts) { const s = c.hpFrac; if (s < fs) { fs = s; focus = c; } }
    const units = [];
    for (const u of o.units) {
      if (!u.alive) continue;
      const spec = rules.units[u.kind];
      const order = { id: u.id };

      // focus target for guns; nearest for movement decisions
      let target = focus, best = focus ? dist(u.x, u.y, focus.x, focus.y) : Infinity;
      let nearD = Infinity;
      for (const c of o.contacts) { const d = dist(u.x, u.y, c.x, c.y); if (d < nearD) nearD = d; }
      if (!target) { best = Infinity; }

      // movement: towards the best objective, unless an enemy is close enough to shoot
      let goal = pickObjective(o.objectives, u.x, u.y);
      if (target && nearD < spec.gun.maxRange * 0.8 && u.kind !== "scout") goal = null;
      if (u.kind === "artillery") goal = target && nearD < spec.gun.minRange * 1.5 ? [u.x * 2 - target.x, u.y * 2 - target.y] : pickObjective(o.objectives, u.x, u.y);
      if (goal && o.canMove) {
        let want = angleTo(u.x, u.y, goal[0], goal[1]);
        // steer around obstacles: try the wanted heading, then fan out
        const offsets = [0, 341, -341, 683, -683, 1024, -1024];
        for (const off of offsets) {
          const a = (want + off) & (FULL - 1);
          const rad = (a / FULL) * 2 * Math.PI;
          if (passable(u.x + Math.cos(rad) * FP * 1.5, u.y + Math.sin(rad) * FP * 1.5)) { want = a; break; }
        }
        const d = angDiff(u.heading, want);
        order.steer = Math.max(-FP, Math.min(FP, Math.round((d / spec.turnRate) * FP)));
        order.throttle = Math.abs(d) > 512 ? Math.round(FP * 0.2) : FP;
        if (u.blocked) { order.throttle = -FP; order.steer = FP; }
      }

      // weapons (drones and engineers have no main gun; the engineer's MG fires with fire: true)
      if (target) {
        if (spec.gun.mode === "none") {
          if (spec.secondary && u.reload2 === 0 && best <= spec.secondary.maxRange) order.fire = true;
        } else if (spec.gun.mode === "direct") {
          const tof = spec.gun.shellSpeed ? best / spec.gun.shellSpeed : 0;
          const v = vel[target.id] || [0, 0];
          const px = Math.round(target.x + v[0] * tof), py = Math.round(target.y + v[1] * tof);
          order.aimAt = [px, py];
          const aimed = Math.abs(angDiff(u.turret, angleTo(u.x, u.y, px, py))) <= spec.gun.aimTolerance;
          if (u.reload === 0 && aimed && best <= spec.gun.maxRange) order.fire = true;
        } else if (u.reload === 0 && best >= spec.gun.minRange && best <= spec.gun.maxRange) {
          const v = vel[target.id] || [0, 0];
          const tof = 40 + (best / FP);
          order.fire = [Math.round(target.x + v[0] * tof), Math.round(target.y + v[1] * tof)];
        }
      }
      units.push(order);
    }
    return { units };
  },
};
