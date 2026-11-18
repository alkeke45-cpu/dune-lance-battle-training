# dune-lance "Apex" — architecture (Phase 21, 2026-11-18)

Bot: **dune-lance** on [battle.training](https://battle.training), Season 2 "Drafted"
(armor theater, rules s2.0.0), entered in the **PromotedBy November Cup**
($250 USDC pool, paid automatically by final leaderboard rank at the
2026-11-30T23:59:59Z freeze).

Cup score = `rating − 2·max(SE, 25)` (hourly Bradley–Terry refit over all cup sets;
a set is the same seed played twice with sides swapped, 1 pt per game, ½ for a draw).

## Files

- `dune-lance-controller-v4.js` — the live controller (uploaded as versions
  v4 → v4.6 on 2026-11-18; v4.6 is active). Source of truth for what plays.
- `dune-lance-controller-v3.js` — the first Apex build (deployed, then superseded
  the same day by v4 after live scrimmage analysis).
- `dune-lance-controller-v2.js`, `dune-lance-controller.js` — the pre-Apex controllers.
- `sim/` — the local harness: the ladder's own engine (`arena-sim.mjs`),
  `local-test.mjs` (house-bot panel + profiler), `selfplay.mjs` (A/B batteries),
  `stats.mjs` (per-game telemetry), `analyze-replays.mjs` (re-simulates downloaded
  ladder replays and extracts score/damage/hold metrics), plus the opponent
  proxies used for local testing (`clone-bazooka.js`, `clone-apc.js`).

## What the telemetry said (12+ ladder replays re-simulated locally)

- The top of the cup (bazookabot-lab, sck-waypoint, terenyuk-ford) all draft
  **3×MBT** and win by **elimination** in a converged focus-fire brawl, or by
  parking on the centre hill and never moving (sck-waypoint).
- v2's scout+drone died inside ~700 ticks in nearly every game and dealt ~0
  damage vs MBT frontal armor; in blowout losses v2's MBTs dealt 8–29 damage
  total (parked/stuck, never engaged). Draws were 22.9% of v2's cup games.
- APC drafts win points races vs passive squads (captureWeight ×2).

## v4.6 systems

- **Draft**: 3×MBT (an MBT/MBT/APC variant is kept in code for A/B).
- **Navigation**: per-objective BFS distance fields + hull-down posts inside each
  disc; **ring-descent** gradient steering (5-tile window — a 3×3 descent froze a
  squad for a full set on a cliff-ringed map); **give-up-and-switch**: if the
  squad's field value toward its objective doesn't improve for 600 ticks, the
  objective is blacklisted for the game and the next-best is taken (BFS
  reachability ≠ physical reachability: diagonal-only cliff gates exist).
- **Hill-lead state machine**: measured score rates → projected final diff and
  lock margin → OPENING / MARCH / BATTLE / PRESS / HOLD / MOPUP. Rate-aware HOLD
  (freeze only when the lock is safe or rates are level late), endgame draw
  conversion (behind after t3000 → contest their disc; ahead after t3400 →
  protect HP for the tiebreak), MOPUP gated so it never abandons a winning hold.
- **Focus fire**: one shared target scored by facing-aware squad time-to-kill,
  with **hard stickiness** (switch only at ≤55% TTK) — TTK noise (hpFrac moves
  in eighths) otherwise flips the target every few ticks and every turret swings
  10–20°, which kept the guns from ever settling.
- **Ballistics**: quadratic intercept solver + one acceleration-correction step
  from tracked contact velocity/acceleration. Fire gate = range-scaled angular
  window (the shell flies along the turret; the engine checks aimTolerance only
  for point-fire orders) + a shell-path terrain check that mirrors the engine's
  shell flight (muzzle at ground+eye, diving to aim ground+3).
  - Honest limits: the observation has **no enemy velocity vector** (derived
    from contact memory) and **no enemy reload state** — reload timing for the
    jink system is *estimated* from our own HP drops attributed to the most
    plausible shooter. Both are labelled estimates in the code.
- **Melee plant**: inside 14 tiles, bearing rates exceed turret slew for a moving
  hull — units plant, face the threat, and shoot (the top bots creep at
  0.0–0.3 speed while fighting). Jinking is disabled in melee for the same reason.
- **Squad discipline**: rally rule (a fighter facing ≥2 gunners unsupported pulls
  the squad to the fight — v3 lost a set 0–2 to piecemeal defeat), detach only to
  near/valuable objectives with an automatic fallback when the detached unit
  makes contact alone, disc-denier override (a lone drone contesting our disc is
  worth ~14k points a game to its owner — it becomes the focus), cripple
  reverse-withdrawal with frontal armor to the threat, artillery dodge from
  `incoming`, stuck watchdog with field-based escape.

## Measured live results (2026-11-18, unrated scrimmages vs the real bots)

Damage dealt by dune-lance per game vs bazookabot-lab (#1, rating ~1725):
**100 (v3) → 125 (v4) → 175 (v4.2) → 250 (v4.3)**; bazookabot's surviving MBTs
dropped to 60/35 hp in the last run. Still a 0–2 set loss — the gap to #1 is
narrowed, not closed. vs smokepit v12: 370 damage dealt, 2 kills, lost the
last-hull duel (their survivor at 110 hp). vs sck-waypoint / terenyuk-ford on a
cliff-maze centre-hill map: 0–2 losses that exposed (and fixed) the navigation
freezes above.

Local batteries (48 games each): v4 beats the APC-occupation proxy 33–15 and
the 3×MBT rush proxy 29–19; it still loses to the old v2 split-occupation shape
locally (17–31) — v2's live cup record (~50%) says that matchup is narrower
live than the local proxy suggests.
