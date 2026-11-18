# dune-lance v5 generation — Phase 22 (2026-11-18)

Active controller: **v5.2** (`ver_39cdc21084c8`), file `dune-lance-controller-v5.js`
(the file carries the full v5.0 → v5.1 → v5.2 changelog in its header; all three
iterations were built and server-tested the same day, each fixing a measured defect
found in the previous iteration's named-seed scrimmage).

Built from tick-level inspection of the three Phase 21 scrimmages (bazookabot-lab
seed 12345, sck-waypoint seed 4242 cliff-maze, smokepit seed 999):

- **Formation Cohesion Throttle** — battle-bound fighters throttle so the squad
  enters gun range together (v5.1 rewrite: no lip-hold, Euclidean+BFS gates,
  300-tick time-box — v5.0's version deadlocked a squad in a cliff gap on seed 12345).
- **Tick-0 Turret Pre-Aiming** — turrets pre-aim the convergence vector from t=0;
  no-target aim holds the freshest track's predicted position for 900 ticks.
- **Endgame Duel Protocol** — lone-survivor trigger (v5.2 rewrite: the observation
  model never reports enemy deaths and unseen enemies leave no track, so the
  exactly-one-track trigger never fired on seed 999); hunt on contact loss, hull
  faces the track bearing, HP-behind kiting band 15–26 tiles, corpse-hunt mute.
- **Per-unit stuck re-anchor** + tightened shell clearance (rim-blocked volleys).

Measured (server scrimmages, game 1 of each set, v5.2 active):
- seed 4242 vs sck-waypoint: damage dealt 0 → 186, first volley simultaneous
  (3 first-shots the same tick, 3–9 ticks before sck's), no navigation freeze;
  full-squad arrival still slow (range-30 entries spread by #2's early solo arrival);
  lost hill_locked 448–3486.
- seed 12345 vs bazookabot-lab: no-combat occupation race; game-1 margin improved
  from −2334 pts (v5.0) to −318 (8650–8968); set lost 0–2 (game 2 visible only in
  the set total: 1352–8616).
- seed 999 vs smokepit: damage dealt 310 (v4.6: 370, v5.1: 320) — the 370→480 target
  NOT met; the brawl trajectory is identical across v4.6/v5.1/v5.2 until the
  endgame (detached lead hull meets the full enemy squad on the flank route and
  dies at t1326 in every version). Duel protocol verified engaging in v5.2's 1v2
  endgame; the game was already lost in the brawl (480 taken vs ~310–370 dealt).

Local batteries (48 g per matchup, selfplay): v5 ≈ v4.6 within noise; damage dealt
vs the rush proxy up (1890 vs 1510 over the same 12-game battery). No exceptions
in any local or server run; deploy smokes clean (0 failures/timeouts/exceptions).

Live Cup line at v5.2 deployment: score 1122, rating 1172, W326 L301 D193,
820 games (freeze 2026-11-30). Full evidence: internal Phase 22 report.
