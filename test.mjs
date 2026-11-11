// Logic check, no dependencies:  node test.mjs
import assert from "node:assert/strict";
import { num, normEx, normState, hint, finish } from "./js/model.js";
import { parseTable, parsePlan, parseImport, mergePlan, tableText } from "./js/io.js";

assert.equal(num("50 kg"), 50);
assert.equal(num("20 / 40"), null);

// progression rules
const ex = (o) => normEx({ weight: "50", sets: 3, min: 8, max: 12, ...o });
assert.equal(hint(ex({})), null);
assert.equal(hint(ex({ tag: "warmup", today: [12, 12, 12] })), null);
assert.equal(hint(ex({ today: [12, 12, 13] })).to, "51");
assert.equal(hint(ex({ today: [7, 6, 5], step: 2.5 })).to, "47.5");
assert.match(hint(ex({ today: [10, 9, 7] })).text, /until every set reaches 8/);
assert.match(hint(ex({ today: [12, 11, 10] })).text, /3 more reps/);
assert.match(hint(ex({ last: { d: "2026-01-01", w: "45", r: [12, 12, 12] } })).text, /Now set to 50/);
assert.equal(hint(ex({ weight: "light", today: [12, 12, 12] })).to, undefined);

// drop sets: a set done at its own weight is recorded, and ignored by the progression rule
const drop = ex({ today: [12, 12, 6], todayWs: [null, null, "40"] });
assert.equal(hint(drop).to, "51");
assert.match(hint(drop).text, /12, 12, 6 @40 at 50/);
const ds = normState({ workouts: [{ id: "w", name: "Heavy", exercises: [drop] }] });
finish(ds, ds.workouts[0]);
assert.deepEqual(ds.sessions[0].items[0].ws, [null, null, "40"]);
assert.deepEqual(ds.workouts[0].exercises[0].todayWs, []);
assert.deepEqual(normState(JSON.parse(JSON.stringify(ds))).workouts[0].exercises[0].last.ws, [null, null, "40"]);
assert.equal(state0().sessions.length, 0);

// import formats
const [a, b] = parseTable("Exercise\tWeight\tSets and Reps\n[WARM-UP] Band Pull-Apart\tlight\t2 × 12-15\nBench Press\t50\t3 x 10");
assert.deepEqual([a.name, a.tag, a.weight, a.sets, a.min, a.max], ["Band Pull-Apart", "warmup", "light", 2, 12, 15]);
assert.deepEqual([b.name, b.weight, b.min, b.max], ["Bench Press", "50", 10, 10]);
const plan = parsePlan("DAY 1 — HEAVY (notes)\nPush-up\tbodyweight\t3 × 8-12\nDAY 2 — LIGHT\nRow\t40\t3 × 8-12");
assert.deepEqual(plan.map((d) => d.name), ["Heavy", "Light"]);
assert.ok(parseImport('{"workouts":[]}').backup);
assert.equal(parseImport("nothing here"), null);

// finish, then re-import keeps history; export round-trips
const state = normState({ workouts: [{ id: "w", name: "Heavy", exercises: [ex({ name: "Push-up", today: [10, null, 9] })] }] });
assert.equal(finish(state, state.workouts[0]), 1);
assert.deepEqual(state.sessions[0].items[0].r, [10, 9]);
assert.equal(state.sessions[0].items[0].ws, undefined);
assert.deepEqual(state.workouts[0].exercises[0].today, []);
mergePlan(state, plan);
assert.equal(state.workouts.length, 2);
assert.deepEqual(state.workouts[0].exercises[0].last.r, [10, 9]);
assert.equal(parseTable(tableText(state.workouts[0]))[0].name, "Push-up");

function state0() { return normState({ sessions: [{ d: "x", items: null }] }); }

console.log("ok");
