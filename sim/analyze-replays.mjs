// Replay telemetry analyzer: re-simulates downloaded ladder replays with the
// ladder's own engine (verifyReplay) and extracts per-game metrics.
// usage: node analyze-replays.mjs <file.jsonl> [more files...]
import { readFileSync } from "node:fs";
import { verifyReplay, decodeReplay, RULES_S2 } from "./arena-sim.mjs";

const FP = 65536;
function splitGames(text) {
  const lines = text.split("\n").filter(Boolean);
  const games = [];
  let cur = null;
  for (const l of lines) {
    const o = JSON.parse(l);
    if (o.type === "header") { cur = [l]; games.push(cur); }
    else if (cur) cur.push(l);
  }
  return games.map(g => g.join("\n"));
}

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  const games = splitGames(text);
  games.forEach((gtext, gi) => {
    const r = decodeReplay(gtext);
    const v = verifyReplay(r, { rules: RULES_S2 });
    const states = v.states;
    const H = r.header;
    const fin = states[states.length - 1];
    const names = [H.bots[0].name, H.bots[1].name];
    // score timeline
    const sample = {};
    for (const t of [600, 1200, 1800, 2400, 3600, 4799]) {
      const s = states[Math.min(t, states.length - 1)];
      if (s) sample[t] = s.score;
    }
    // deaths
    const deaths = [];
    const seenDead = new Set();
    states.forEach((s, t) => {
      for (const u of s.units) {
        const key = u.side + ":" + u.id;
        if (!u.alive && !seenDead.has(key)) { seenDead.add(key); deaths.push({ t, side: u.side, kind: u.kind }); }
      }
    });
    // objective holding: fraction of sampled ticks (every 20) each objective owned by side
    const nObj = fin.objectives ? fin.objectives.length : 0;
    const hold = Array.from({ length: nObj }, () => [0, 0, 0]); // [side0, side1, none/contested]
    let samples = 0;
    for (let t = 0; t < states.length; t += 20) {
      const s = states[t]; samples++;
      (s.objectives || []).forEach((o, i) => {
        if (o.owner === 0) hold[i][0]++; else if (o.owner === 1) hold[i][1]++; else hold[i][2]++;
      });
    }
    // damage dealt: total hp lost per side (incl. overheal none) — sum positive drops
    const dmg = [0, 0];
    let prevHp = {};
    for (const s of states) {
      for (const u of s.units) {
        const key = u.side + ":" + u.id;
        if (prevHp[key] !== undefined && u.hp < prevHp[key]) dmg[1 - u.side] += prevHp[key] - u.hp;
        prevHp[key] = u.hp;
      }
    }
    // unit survival + end hp
    const endHp = [0, 1].map(sd => states[states.length - 1].units.filter(u => u.side === sd).map(u => `${u.kind}:${u.alive ? u.hp : "DEAD"}`).join(" "));
    console.log(`\n### ${file.split("/").pop()} game ${gi + 1}  verify=${v.ok ? "OK" : "FAIL:" + v.reason}`);
    console.log(`bots: [0]=${names[0]} (${H.bots[0].version}) drafts=${JSON.stringify(H.drafts?.[0])} | [1]=${names[1]} (${H.bots[1].version}) drafts=${JSON.stringify(H.drafts?.[1])}`);
    console.log(`result: winner=${fin.winner} reason=${fin.reason} ticks=${fin.tick} score=${JSON.stringify(fin.score)}`);
    console.log(`score timeline (t: [s0,s1]): ${Object.entries(sample).map(([t, s]) => `${t}:${s[0]}-${s[1]}`).join("  ")}`);
    console.log(`damage dealt: side0=${dmg[0]} side1=${dmg[1]}`);
    console.log(`deaths: ${deaths.map(d => `t${d.t} ${names[d.side]}'s ${d.kind}`).join(" | ") || "none"}`);
    console.log(`objective hold fractions (of ${samples} samples): ${hold.map((h, i) => `obj${i}[w=${fin.objectives[i].weight}] s0=${(h[0] / samples).toFixed(2)} s1=${(h[1] / samples).toFixed(2)} none=${(h[2] / samples).toFixed(2)}`).join(" ; ")}`);
    console.log(`end units: [0] ${endHp[0]} || [1] ${endHp[1]}`);
  });
}
