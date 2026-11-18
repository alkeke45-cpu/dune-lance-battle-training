// Self-play: controller A vs controller B on ladder seeds, both sides.
// usage: node selfplay.mjs <A.js> <B.js> [nSeeds]
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { runMatch, RULES_S2 } from "./arena-sim.mjs";

function load(path) {
  const src = readFileSync(path, "utf8");
  return () => {
    const ctx = vm.createContext({});
    vm.runInContext(src, ctx);
    const c = ctx.controller;
    if (!c || typeof c.tick !== "function") throw new Error(path + " did not set controller");
    const w = { hello: h => c.hello && c.hello(h), tick: o => {
      try { const r = c.tick(o); return r ? { tick: o.tick, units: r.units ?? [] } : { tick: o.tick, units: [] }; }
      catch (e) { console.error("tick error in " + path, e.message); return { tick: o.tick, units: [] }; }
    }};
    if (typeof c.draft === "function") w.draft = h => c.draft(h);
    return w;
  };
}
const [,, fileA, fileB, nArg] = process.argv;
const n = Number(nArg || 12);
const mkA = load(fileA), mkB = load(fileB);
let w = 0, l = 0, d = 0, scoreFor = 0, scoreAgainst = 0;
for (let s = 1; s <= n; s++) {
  const seed = (s * 2654435761) >>> 0;
  for (const side of [0, 1]) {
    const A = mkA(), B = mkB();
    const r = runMatch(seed, side === 0 ? A : B, side === 0 ? B : A, { rules: RULES_S2, names: ["A", "B"] });
    const f = r.final;
    if (f.winner === side) w++; else if (f.winner === 1 - side) l++; else d++;
    scoreFor += f.score[side]; scoreAgainst += f.score[1 - side];
  }
}
console.log(`A=${fileA.split("/").pop()} vs B=${fileB.split("/").pop()}  games ${w + l + d}  W-L-D ${w}-${l}-${d}  winrate ${(100 * w / (w + l + d)).toFixed(1)}%  avg score ${Math.round(scoreFor / (w + l + d))}-${Math.round(scoreAgainst / (w + l + d))}`);
