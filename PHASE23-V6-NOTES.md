# Phase 23 — dune-lance v6 generation ("Deathball")

Full evidence: `~/workspace/high-ticket/phase23-dune-v6.md` (parent workspace).
Final active controller: **v6.2 Deathball, version id `ver_bbf4f3227b2b`**
(file `dune-lance-controller-v62.js`). The generation iterated three times in
one day — v6.0 → v6.1 → v6.2 — each iteration fixing a defect MEASURED in the
previous iteration's named-seed server scrimmage (the Phase 21/22 pattern).

## The design brief (Phase 22 seed-999 autopsy, re-verified tick-by-tick)

All three v4.6/v5.1/v5.2 runs of seed 999 lost in the BRAWL (480 taken vs
310–370 dealt), not the duel. The route probe of the v5.2 replay showed the
full chain: (1) the squad wedged on terrain ~7 tiles short of its home flank
and never capped it; (2) at ~t750 the give-up-and-switch flipped the battle
objective to centre; (3) hull #1 — the only mobile unit — obeyed alone, met
smokepit's centre pair 1v2 at t1072 and died at t1326, while #2/#3 stayed
wedged ~500 more ticks (their goal steering runs through steerToPoint, whose
blocked response — full reverse + spin EVERY blocked tick — never got
steerToward's v4.5 8-tick fix). Range-30 entries landed t861/1221/1331: a
470-tick arrival spread created by un-governed solo movement, not by the
detach block (which never fired in that game).

## v6.0 — Deathball doctrine

- **No lone detachment**: the v3.2 detach (securedQuiet + midBattleSplit) is
  gated behind a deathball unlock. Detach only when (A) the enemy is confirmed
  crippled — ≥2 enemy gunners kill-confirmed, ≤1 remaining of those seen, ≤1
  in contact — or (B) visual split evidence (only non-gunners visible with no
  fresh gunner track near the target, or ≥2 visible gunners split >45 tiles
  apart and all out of gun range). Kill confirmation = close-range vanish from
  the squad-shared sensor picture (≤13 tiles from the nearest seer — no roster
  unit can exit a 20-tile sensor bubble from 13 tiles in one tick), spot still
  sensor-covered at the vanish tick, no reappearance for 150 ticks;
  reappearance un-confirms at once.
- **Squad-integrity leash**: a travelling fighter with no target of its own
  may not grow its separation from the nearest alive squadmate beyond 16
  tiles; beyond that, if its goal does not close on the squadmate, it holds
  and faces the threat/convergence bearing. Governs ALL goal steering
  (marches, objective switches, re-anchors). Escapes/reverses/jinks/dodges/
  fight-joining chases exempt; the detached unit exempt only while unlocked.
- **MOPUP scatter gated** the same way (it is a split by another name).
- **steerToPoint blocked response** brought to the v4.5 standard (reverse+spin
  only for the first 8 ticks of an episode via the shared blockedStreak
  counter, then creep at 0.4) — the un-fixed version kept seed 999's #2/#3
  wedged ~1,000 ticks.
- Everything else is v5.2 verbatim (cohesion, tick-0 pre-aim, duel protocol,
  re-anchor, shell margin, focus fire, melee plant, jink estimation).

Measured (server scrimmages, game 1 of each set; all sets lost 0–2):
seed 999 — solo death GONE (#1 died t3193 in a 2v2 with #2 adjacent; the pair
killed both centre MBTs; damage trade WON 320–235, kills 2–1; game lost on
points, hill_locked 501–7324). Seed 4242 — arrival spread 1834 → 245 ticks,
but damage 186 → 0 (rim-blocked firing position, see v6.1 note). Seed 12345 —
no-combat occupation race, game 1 −488 (8412–8900).

## v6.1 — three measured fixes

- MOPUP scatter under TOTAL blindness (zero contacts ever, seed 999 t2000)
  had been allowed because "seen gunners ≤ 1" counted 0 as safe. Zero
  sightings is not evidence: scatter now requires the deathball unlock itself.
- Leash squad-diameter clause: on seed 4242 a PAIR ran off together (mutual
  nearest mates) leaving the wedged trailer. Separation to the FARTHEST alive
  squadmate > 20 tiles now also restrains.
- Regroup escalation: a unit whose re-anchor fails a second time for the same
  objective gets a 300-tick order to steer directly at the squad centroid
  (fan-fallback steering, not the BFS gradient that trapped it).

Measured: seed 999 — the deathball arrived as one body (simultaneous contact
t2729, simultaneous first volley t2770) but turret error at contact was
42–90° (pre-aim still pointed at the opening objective), the point hull ate
two free volleys (160 → 60 hp) and the 3v2 was lost 285–480. Locals improved:
23-24-1 vs clone-bazooka (v6.0: 19-27-2); beat v6.0 head-to-head 15-9.

## v6.2 — pre-aim follows the fight

convAim is recomputed at both battle-objective re-pick sites (mode-entry
re-pick + give-up switch). Seed 999 game 1 after the fix: contact simultaneous
t2714; turret errors **5.9° / 0.3° / 17.3°** (v6.1: 69° / 42.6° / 90.5°); slew
delays 2 / 0 / 5 ticks (was 41 / 40 / 41); OUR first shots t2715–2718 landed
BEFORE smokepit's (t2727/2730); damage 320–370, kills 2–2, our survivor (110
hp) hunted the last enemy in the duel — game lost on points (875–5226,
hill_locked), not in the brawl. Seed 4242 game 1 unchanged in shape (spread
245, damage 0 — the centre plateau's rim still eats our shells from the south
approach; a firing-position problem, measured and documented, not doctrine).
Seed 12345 game 1 identical no-combat race (8412–8900).

## Honest scorecard vs the brief

- #1 hull no longer dies solo ~t1326 on seed 999: **MET** (v6.0 onward; in
  v6.2 it died t3459 in a 3-gun brawl, trade 320–370, kills 2–2).
- Win the 3v3 brawl on seed 999: **NOT MET as a game win** — the brawl trade
  is now near-even with first-shot advantage, but the game is decided earlier:
  smokepit banks two discs from ~t750 while our home-flank cap is delayed
  ~1,800 ticks by the terrain wedge in EVERY version (v4.6–v6.2). The
  occupation race, not the brawl, is seed 999's remaining wall; the wedge is
  a pathfinding/firing-position problem class (same family as seed 4242's
  plateau rim), not detach doctrine.
- All three sets still lost 0–2. v6.2's verified gains: no solo deaths, a
  synchronized deathball arrival with a first, accurate volley, no blind
  splits (detach + MOPUP gated on confirmed evidence), wedge-escape
  discipline, and no local-battery regression (24-23-1 vs clone-bazooka;
  v5.2 was 19-27-2-class on the same harness).

Live Cup line after deployment: score 1108, rating 1158, rd 25,
W326 L306 D193, 825 games (freeze 2026-11-30; score = rating − 2·max(SE, 25)).
