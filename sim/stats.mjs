// Stats runner: A vs B over seeds with full telemetry per game (damage, deaths, holds).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { runMatch, RULES_S2 } from "./arena-sim.mjs";

function load(path) {
  const src = readFileSync(path, "utf8");
  return () => {
    const ctx = vm.createContext({});
    vm.runInContext(src, ctx);
    const c = ctx.controller;
    const w = { hello: h => c.hello && c.hello(h), tick: o => { try { const r = c.tick(o); return r ? { tick: o.tick, units: r.units ?? [] } : { tick: o.tick, units: [] }; } catch (e) { return { tick: o.tick, units: [] }; } } };
    if (typeof c.draft === "function") w.draft = h => c.draft(h);
    return w;
  };
}
const [,, fileA, fileB, nArg] = process.argv;
const n = Number(nArg || 6);
const mkA = load(fileA), mkB = load(fileB);
let agg = { w: 0, l: 0, d: 0 };
for (let s = 1; s <= n; s++) {
  const seed = (s * 2654435761) >>> 0;
  for (const side of [0, 1]) {
    const A = mkA(), B = mkB();
    const r = runMatch(seed, side === 0 ? A : B, side === 0 ? B : A, { rules: RULES_S2, keepStates: true, names: ["A", "B"] });
    const f = r.final, states = r.states;
    const dmg = [0, 0]; const prevHp = {}; const deaths = [];
    const seenDead = new Set();
    const hold = f.objectives.map(() => [0, 0]); let samples = 0;
    states.forEach((st, t) => {
      for (const u of st.units) {
        const k = u.side + ":" + u.id;
        if (prevHp[k] !== undefined && u.hp < prevHp[k]) dmg[1 - u.side] += prevHp[k] - u.hp;
        prevHp[k] = u.hp;
        if (!u.alive && !seenDead.has(k)) { seenDead.add(k); deaths.push(`t${t}:${u.side === side ? "A" : "B"}:${u.kind}`); }
      }
      if (t % 20 === 0) { samples++; st.objectives.forEach((o, i) => { if (o.owner !== null) hold[i][o.owner]++; }); }
    });
    const res = f.winner === null ? "D" : (f.winner === side ? "W" : "L");
    if (res === "W") agg.w++; else if (res === "L") agg.l++; else agg.d++;
    console.log(`seed${s} side${side} ${res} ${f.reason} t${f.tick} score ${f.score[side]}-${f.score[1 - side]} dmg ${dmg[side]}-${dmg[1 - side]} holdsA ${hold.map(h => (h[side] / samples).toFixed(2)).join("/")} deaths ${deaths.join(" ") || "-"}`);
  }
}
console.log(`TOTAL A: ${agg.w}W ${agg.l}L ${agg.d}D`);
