# Phase 24 — dune-lance v7.0 "Apex" (terrain-truth release)

Deployed 2026-11-18: **v7.0, version id `ver_837d4130cf03`, ACTIVE, smoke clean**
(400 ticks, 0 failures/timeouts/exceptions). Built on v6.2 Deathball verbatim
except for the two fixes below. Full evidence:
`~/workspace/high-ticket/phase24-dune-v7.md`.

## FIX 1 — home-flank cap navigation (seed 999)

Root cause (measured on the real seed-999 map): oi2 (31.5, 85.5) is ringed by
rock with a north gate at x≈32–34, y≈78 (plus a SW corridor). `gradientStep`'s
11×11 window-minimum steering aims at low-field tiles INSIDE the ring, across
2–4 rock tiles, so the squad drove into the ring's outer face at (26–32, 75–82)
and ground there from t150 to t750+, never capping. (Movement blocking in this
engine is terrain-type only — heights never block a hull — so the wedge is a
steering failure, not a wall.)

Fix: **exact shortest-path BFS waypoint stepping** (`bfsStep`/`navStep`) — from
the unit's tile, step to the orthogonal neighbour whose field value is exactly
cur−1 (a true BFS parent; the centre-path between adjacent passable tiles can
never cross an impassable tile), until within (radius − 1.5) of the objective
centre AND the straight line to the post is passable; only then direct-steer.
Applied to post travel and the stuck-escape branch.

Offline validation (kinematic walker, real seed-999 map, from spawn):
gradient rule NEVER caps in 4,000 ticks (final dist 8.1); BFS stepping caps at
t96, on post at t115. From the grind tile (28.5, 76.5): gradient never; BFS
caps t44.

Server scrimmage (smokepit, seed 999): **oi2 first owned at t187** (target
~t250; v6.0 capped ~t2550, v6.2 was delayed ~1,800 ticks). All three hulls
inside the disc by t300. Smokepit's #6 counter-pushed into our disc and was
killed at t858 (damage 160–50, zero friendly deaths in game 1). Game 1 lost
4399–4565 (166 pts) on the 1-vs-2 disc economy; set 0–2, 8796–9130 (v6.2:
5282–9793). The remaining seed-999 gap is strategic (the squad holds home and
never rotates to contest centre), not navigational.

## FIX 2 — engine-exact shellClear + plateau breach (seed 4242)

The old shellClear was a loose line approximation on an invented height scale
(eye +100, aim +60, +22 slack). The engine's real test (arena-sim fireDirect +
shell step, armor/S2): shell leaves the muzzle (radius+0.2 along the TURRET)
at z = heightAt(shooter) + eyeHeight (5, raw units; heights are raw 0–255),
flies 3 tiles/tick, dz anchored at heightAt(aim)+3 — aim = the fire point for
point fire, or the MAX-RANGE point along the turret for fire===true — and each
tick the unit segment test runs FIRST, then a terrain test at the endpoint
only (heightAt > z, Ruin, 4 forest entries).

`shellClearExact` replicates that test step for step in both fire modes. The
fire gate now prefers POINT FIRE (order.fire = [x, y]) when turret error ≤ the
engine's aimTolerance (dz anchors at the target = highest legal arc), falling
back to fire===true in the old range-scaled window. PLATEAU BREACH: a unit in
range but terrain-blocked in both modes advances (BFS path on its objective's
field when the target fights from it, else straight at the target) until a
mode connects or it is point-blank (≤2.5 tiles); breaching units are exempt
from stop-to-shoot.

Offline validation (shadow simulation over the v6.2 server replays, per-shot
event attribution): **40/40 outcomes predicted** — seed 4242: all 13 v6.2
shots TERRAIN-H (old check passed all 13; actual damage 0); seed 999: every
attributed hit predicted REACH.

Server scrimmage (sck-waypoint, seed 4242): **damage dealt 0 → 305**, 1 kill
(their #6, t1038), 13 shots with 9 enemy HP-drop events; the fight came to our
flank this time and the sub-11-tile shots connected at a high rate. The
opening ~16-tile volley still died on a 1–2 raw-unit height margin at the
12-tile endpoint (ground 211–216 vs z 209–210 in turret mode; point mode
clears two of the three). Game 1 eliminated t1547 (521–669); set 0–2,
521–5047 (v6.2: 0–7168). Game 2 is not exposed by the replay endpoint.

Seed 12345 (bazookabot-lab): no-combat occupation race again; game 1 lost
8790–9008 — margin 218 (v6.2: 488), our score up from the fast home cap.
Set 0–2, 17582–18016 (v6.2: 10327–17516).

## Local batteries (selfplay.mjs, RULES_S2)

- vs clone-bazooka (48 games): **28-20-0** (v6.2: 24-23-1)
- vs clone-apc (48 games): **17-31-0** (v6.0: 13-35-0)
- vs v6.2 head-to-head (24 games): **14-10-0**
- vs v2 (48 games): **25-23-0** (v6.0: 3-45-0 — the hardest local matchup is
  now a winning one)
- stats battery vs clone-bazooka (12 games): 10W-2L

## Live Cup line after deployment

score **1118**, rating **1168**, rd 25, W327 L310 D193, 830 games
(freeze 2026-11-30; score = rating − 2·max(SE, 25) = 1168 − 50 ✓).
Interim drift since Phase 23's close (1108/1158, 825 games) came from
matchmaker sets played by v6.2/v7.0 during the day.
