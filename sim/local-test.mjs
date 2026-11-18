#!/usr/bin/env node
// battle.training local test harness (local-test 1.2: --profile)
//
//   curl -O https://api.battle.training/sdk/arena-sim.mjs
//   curl -O https://api.battle.training/sdk/local-test.mjs
//   node local-test.mjs ./controller.js --seeds 20 --vs brawler,holder,random --save replays/
//   node local-test.mjs ./controller-sub.js --rules sub          # Silent Service (submarine theater)
//
// Runs your controller (the same file you upload) against the house bots on many seeds, from both
// sides, exactly as the ladder does, and prints win rate, damage and failure stats. The simulator is
// the ladder's own engine, so a result here is a result there. As on the ladder, a tick() that throws
// gets empty orders and the match plays on; here every such exception is counted per game and the
// first one is printed with its stack, so a controller that never runs cannot pass for a weak one.
// Every game's replay is re-simulated and its per-tick hashes checked (--no-verify skips that), so
// what you save with --save verifies on the ladder's viewer too.
//
// Rules: --rules s2 (default: the public Armor ladder and the cup, s2.0.0), --rules s1 (archived
// season 1), --rules sub (the Silent Service preview ladder, sub-s1.0.0), --rules urban (the Armor preview
// ladder: Season 2's nature maps shuffled with cities and giant-bridge gorges; --family nature|city|bridge plays
// only seeds of one family).
// --theater armor|sub is an alias. Any full version string from GET /api/rules works too.
//
// --profile times your hello() and every tick() in Node and prints p50 / p99 / max with the worst ticks.
// Node's JIT runs your code roughly 15-20x faster than the ladder's QuickJS, which counts interrupt units
// (40 per tick, 4,000 for hello), so the harness warns at 0.8 ms for one tick and 80 ms for hello.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { runMatch, makeHouseBot, encodeReplay, decodeReplay, verifyReplay, rulesFor, RULES_S1, RULES_S2, RULES_SUB, RULES_URBAN, RULESETS, urbanFamilyFor } from "./arena-sim.mjs";

const HARNESS = "local-test 1.2";
const USAGE = "usage: node local-test.mjs <controller.js> [--seeds N] [--vs brawler,holder,random,hunter] [--rules s2|s1|sub|urban|<version>] [--family nature|city|bridge] [--theater armor|sub] [--save dir] [--no-verify] [--quiet] [--profile]";
const args = process.argv.slice(2);
const flagsWithValue = new Set(["--seeds", "--vs", "--rules", "--theater", "--save", "--family"]);
const file = args.find((a, i) => !a.startsWith("--") && !flagsWithValue.has(args[i - 1]));
if (!file || args.includes("--help")) { console.error(USAGE); process.exit(2); }
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const seeds = Number(opt("seeds", 10));
const opponents = String(opt("vs", "brawler,holder,random,hunter")).split(",").filter(Boolean);
const save = opt("save", null);
const quiet = args.includes("--quiet");
const verify = !args.includes("--no-verify");
const profile = args.includes("--profile");
// --profile: wall time of every hello() and tick() call in Node, and where the slowest ticks happened
const PROFILE_TICK_MS = 0.8, PROFILE_HELLO_MS = 80;
const prof = { hello: [], draft: [], tick: [], worst: [], where: null };
const keepWorst = (ms, tick) => {
  const w = prof.worst;
  if (w.length < 5 || ms > w[w.length - 1].ms) {
    w.push({ ms, tick, ...prof.where });
    w.sort((x, y) => y.ms - x.ms);
    if (w.length > 5) w.pop();
  }
};
// --rules s2 (default) is the public ladder's season-2 ruleset; s1 the archived season 1; sub the submarine theater
const rulesArg = String(opt("rules", opt("theater", "s2"))).toLowerCase();
const ALIASES = { s1: RULES_S1, s2: RULES_S2, armor: RULES_S2, sub: RULES_SUB, "silent-service": RULES_SUB, urban: RULES_URBAN, "armor-preview": RULES_URBAN };
const rules = ALIASES[rulesArg] ?? RULESETS[rulesArg] ?? null;
if (!rules) { console.error(`unknown --rules ${rulesArg}; use s2, s1, sub or one of: ${Object.keys(RULESETS).join(", ")}`); process.exit(2); }
const isSub = rules.theater === "sub";
// urban: the seed picks the family (nature, city or bridge); --family keeps only seeds of one (the maps stay the ladder's own)
const family = opt("family", null);
if (family && (!rules.urban || !rules.urban.families.some(([f]) => f === family))) { console.error(`--family ${rules.urban ? rules.urban.families.map(([f]) => f).join("|") : "nature|city|bridge"} needs --rules urban`); process.exit(2); }

/** Load the controller file: it must assign globalThis.controller = { draft?, hello, tick }. Fresh copy per match. */
const source = readFileSync(file, "utf8");
// tick() exceptions: the engine swallows them (empty orders, as on the ladder), so count them here
let tickErrors = 0, firstTickError = null;
function freshController() {
  const g = globalThis;
  delete g.controller;
  // Evaluate as a script in this realm. Same semantics as the arena's VM for plain JS controllers.
  new Function(source)();
  const c = g.controller;
  if (!c || typeof c.tick !== "function") throw new Error("controller.js must set globalThis.controller = { hello(h), tick(o) }");
  const wrapped = {
    hello: h => {
      if (typeof c.hello !== "function") return;
      if (!profile) { c.hello(h); return; }
      const t = performance.now(); try { c.hello(h); } finally { prof.hello.push(performance.now() - t); }
    },
    tick: o => {
      let r;
      const t = profile ? performance.now() : 0;
      try { r = c.tick(o); } catch (e) {
        tickErrors++;
        if (!firstTickError) { firstTickError = e; console.error(`tick ${o.tick}: your tick() threw (empty orders sent, as on the ladder):`, e); }
        return { tick: o.tick, units: [] };
      } finally {
        if (profile) { const ms = performance.now() - t; prof.tick.push(ms); keepWorst(ms, o.tick); }
      }
      return r ? { tick: o.tick, units: r.units ?? [], ...(typeof r.say === "string" ? { say: r.say } : {}) } : { tick: o.tick, units: [] };
    },
  };
  // season 2: the draft callback must reach the engine, or the harness would test the default squad
  if (typeof c.draft === "function") wrapped.draft = h => {
    if (!profile) return c.draft(h);
    const t = performance.now(); try { return c.draft(h); } finally { prof.draft.push(performance.now() - t); }
  };
  return wrapped;
}

if (save) mkdirSync(save, { recursive: true });

let games = 0, wins = 0, losses = 0, draws = 0, dmgDealt = 0, dmgTaken = 0, refused = 0, failed = 0, gamesWithErrors = 0;
let verified = 0, verifyFailed = 0;
// submarine theater: what your squad did with the theater's mechanics
const sub = { pings: 0, depthChanges: 0, decoys: 0, mines: 0, torpedoes: 0, blind: 0, hits: 0 };
let urbanBlocked = 0, urbanHullTicks = 0;
const perOpp = {};
const t0 = performance.now();
for (const opp of opponents) {
  perOpp[opp] = { w: 0, l: 0, d: 0 };
  for (let s = 1, played = 0; played < seeds && s < seeds * 50; s++) {
    const seed = (s * 2654435761) >>> 0;
    if (family && urbanFamilyFor(seed, rules.urban.families) !== family) continue;
    played++;
    for (const side of [0, 1]) {
      const me = freshController();
      const house = makeHouseBot({ style: opp, seed: 7 });
      const a = side === 0 ? me : house, b = side === 0 ? house : me;
      let stats = { dealt: 0, taken: 0, refused: 0 };
      let sawEnemy = false; // what the controller could see when it issued this tick's orders
      const errorsBefore = tickErrors;
      prof.where = { seed, side, opp };
      let r;
      try {
        r = runMatch(seed, a, b, {
          rules,
          names: side === 0 ? ["you", opp] : [opp, "you"],
          onTick: (st, ev) => {
            const sideOf = id => st.units.find(u => u.id === id)?.side;
            if (rules.urban) for (const u of st.units) if (u.side === side && u.alive && !rules.units[u.kind]?.air) urbanHullTicks++;
            for (const e of ev) {
              if (e.kind === "hit" || e.kind === "splash") {
                const victims = e.kind === "hit" ? [{ unit: e.unit, damage: e.damage }] : e.victims;
                for (const v of victims) { const vs = sideOf(v.unit); if (vs === side) stats.taken += v.damage; else if (vs !== undefined) stats.dealt += v.damage; }
                if (e.kind === "hit" && sideOf(e.unit) !== side) sub.hits++;
              }
              if (e.kind === "refused" && e.side === side) stats.refused++;
              if (e.kind === "blocked" && (e.reason === "building" || e.reason === "corner") && sideOf(e.unit) === side) urbanBlocked++;
              if (!isSub) continue;
              if (e.kind === "ping" && e.side === side) sub.pings++;
              if (e.kind === "depth" && e.side === side) sub.depthChanges++;
              if (e.kind === "ability" && e.side === side && e.ability === "smoke") sub.decoys++;
              if (e.kind === "ability" && e.side === side && e.ability === "mine") sub.mines++;
              if (e.kind === "fire" && sideOf(e.unit) === side) { sub.torpedoes++; if (!sawEnemy) sub.blind++; }
            }
            sawEnemy = st.vision[side].length > 0;
          },
        });
      } catch (e) { failed++; console.error(`seed ${seed} side ${side} vs ${opp}: controller threw:`, e); continue; }
      games++;
      const won = r.final.winner === side, lost = r.final.winner === (1 - side);
      if (won) { wins++; perOpp[opp].w++; } else if (lost) { losses++; perOpp[opp].l++; } else { draws++; perOpp[opp].d++; }
      dmgDealt += stats.dealt; dmgTaken += stats.taken; refused += stats.refused;
      const errs = tickErrors - errorsBefore;
      if (errs) gamesWithErrors++;
      const text = encodeReplay(r.replay);
      let check = "";
      if (verify) {
        // the check the ladder's viewer runs: re-simulate the recorded orders under the replay's own rules
        const replay = decodeReplay(text);
        const v = verifyReplay(replay, { rules: rulesFor(replay.header.rulesVersion) });
        if (v.ok) verified++; else { verifyFailed++; check = `  REPLAY ${v.reason} at tick ${v.firstMismatch}`; }
      }
      if (!quiet) console.log(`${won ? "WIN " : lost ? "LOSS" : "DRAW"}  vs ${opp.padEnd(7)} seed ${String(seed).padStart(10)} side ${side}  ${r.final.reason.padEnd(10)} t=${String(r.final.tick).padStart(4)}  dealt ${String(stats.dealt).padStart(3)} taken ${String(stats.taken).padStart(3)}  refused ${stats.refused}${errs ? `  TICK ERRORS ${errs}/${r.final.tick}` : ""}${check}`);
      if (save) writeFileSync(`${save}/${opp}-${seed}-${side}.jsonl`, text);
    }
  }
}
const ms = performance.now() - t0;
const per = n => (n / Math.max(1, games)).toFixed(1);
console.log("\n=== summary ===");
console.log(`games ${games}  W-L-D ${wins}-${losses}-${draws}  win rate ${(100 * wins / Math.max(1, games)).toFixed(1)}%  (${(ms / Math.max(1, games)).toFixed(0)} ms/game)`);
for (const [opp, r] of Object.entries(perOpp)) console.log(`  vs ${opp.padEnd(8)} ${r.w}-${r.l}-${r.d}`);
console.log(`damage dealt/taken per game ${(dmgDealt / Math.max(1, games)).toFixed(0)}/${(dmgTaken / Math.max(1, games)).toFixed(0)}   refused orders per game ${per(refused)}   tick errors ${tickErrors} in ${gamesWithErrors}/${games} games   matches aborted ${failed}`);
if (isSub) {
  console.log(`submarine play per game: torpedoes ${per(sub.torpedoes)} (${per(sub.blind)} at boats not pinpointed, hits ${per(sub.hits)})  pings ${per(sub.pings)}  depth changes ${per(sub.depthChanges)}  decoys ${per(sub.decoys)}  mines ${per(sub.mines)}`);
  if (!sub.pings && !sub.depthChanges && !sub.decoys && !sub.mines && !sub.blind) console.log("WARNING: your squad never changed depth, pinged, dropped a decoy, laid a mine or fired at a boat it could not see. The ladder's Silent Service smoke test rejects a controller that ignores the theater; branch on hello(h).rules.theater === \"sub\".");
}
if (verify) console.log(`replays verified ${verified}/${verified + verifyFailed}${verifyFailed ? "  (MISMATCH: does your controller keep state across matches, or read something outside the observation?)" : ""}`);
if (tickErrors) console.log(`WARNING: your tick() threw ${tickErrors} times; those ticks sent no orders (the ladder does the same). Fix the error printed above (first: ${String(firstTickError?.message ?? firstTickError)}) before reading the win rate.`);
if (refused / Math.max(1, games) > 20) console.log("hint: many refused orders — check lastRefused in the observation (firing while reloading? moving during startup? diving onto a shoal?)");
if (rules.draft) {
  const probe = freshController();
  const m = new (await import("./arena-sim.mjs")).Match(1, { rules });
  const pick = typeof probe.draft === "function" ? probe.draft(m.hello(0)) : undefined;
  const legal = pick ? m.draft(0, pick) : null;
  console.log(`draft: ${pick ? `${pick.join(" + ")} (your draft()${legal && !legal.ok ? `, REFUSED: ${legal.reason}, so the default squad plays` : ""})` : (rules.squad.join(" + ")) + " (default squad: no draft() in your controller)"}`);
}
// urban: how often the squad was blocked by a building or a corner (a controller that avoids only 2, 4 and 6 drives into them)
// as a share of your hulls' ticks, like the enrol smoke test: a controller that knows buildings sits around 10-15% (corners and
// traffic), one that treats buildings as open road goes far above
if (rules.urban) {
  const share = urbanHullTicks ? (100 * urbanBlocked) / urbanHullTicks : 0;
  console.log(`buildings: your hulls were blocked by a building or a corner on ${share.toFixed(1)}% of their ticks (${urbanBlocked} of ${urbanHullTicks})${share > 30 ? " — far above a controller that knows buildings (about 10-15%): check that your passability treats terrain 8 (buildings) as closed: a tile is open when h.rules.terrainSpeed[class] > 0" : ""}`);
}
if (profile) {
  const q = (xs, p) => { if (!xs.length) return 0; const a = Float64Array.from(xs).sort(); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; };
  const f = ms => `${ms.toFixed(3)} ms`;
  const slowTicks = prof.tick.filter(ms => ms > PROFILE_TICK_MS).length;
  const helloMax = q(prof.hello, 1);
  console.log("\n=== profile (wall time in Node) ===");
  console.log(`hello() ${prof.hello.length} calls  p50 ${f(q(prof.hello, 0.5))}  max ${f(helloMax)}${prof.draft.length ? `   draft() max ${f(q(prof.draft, 1))}` : ""}`);
  console.log(`tick()  ${prof.tick.length} calls  p50 ${f(q(prof.tick, 0.5))}  p99 ${f(q(prof.tick, 0.99))}  max ${f(q(prof.tick, 1))}`);
  if (prof.worst.length) console.log(`slowest ticks: ${prof.worst.map(w => `${f(w.ms)} at tick ${w.tick} (vs ${w.opp}, seed ${w.seed}, side ${w.side})`).join("; ")}`);
  if (slowTicks) console.log(`WARNING: ${slowTicks} tick() call(s) took over ${PROFILE_TICK_MS} ms here. The ladder runs your code in QuickJS, roughly 15-20x slower than Node's JIT, and stops a tick after 40 interrupt units: those ticks are likely to come back "tick: interrupted" there. Move the work into hello() (precompute) or spread it across ticks.`);
  if (helloMax > PROFILE_HELLO_MS) console.log(`WARNING: hello() took ${f(helloMax)} here; the ladder allows 4,000 interrupt units for hello (and draft), roughly ${PROFILE_HELLO_MS} ms in Node. Precompute less, or more cheaply.`);
  if (!slowTicks && helloMax <= PROFILE_HELLO_MS) console.log(`within the rough budget: no tick over ${PROFILE_TICK_MS} ms, hello under ${PROFILE_HELLO_MS} ms (Node timings only approximate the ladder's QuickJS units).`);
}
console.log(`rules ${rules.version}${isSub ? " (theater sub: Silent Service)" : ""}${rules.urban ? ` (families ${rules.urban.families.map(([f, w]) => `${f} ${w}`).join(", ")}${family ? `; only ${family}` : ""})` : ""} · ${HARNESS} · the ladder uses the same engine.`);
