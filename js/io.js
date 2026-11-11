// Import and export as text. Pure: no DOM, no storage. Checked by test.mjs.
import { normEx, normState, uid, repsText } from "./model.js";

/** One exercise per line: `Name<TAB>Weight<TAB>3 × 10-12`, optional [WARM-UP] / [OPTIONAL] prefix. */
export function parseTable(text) {
  const out = [];
  for (let line of String(text || "").split(/\r?\n/)) {
    line = line.replace(/[‘’'`]{3}/g, "").trim();
    if (!line || /^exercise\b/i.test(line)) continue;
    const m = line.match(/(\d+)\s*[×xX*]\s*(\d+)(?:\s*[-–—]\s*(\d+))?(?:\s*(?:per|each)\s+\w+)?\s*$/);
    let sets = 3, min = 8, max = 12, rest = line;
    if (m) { sets = +m[1]; min = +m[2]; max = m[3] ? +m[3] : +m[2]; rest = line.slice(0, m.index).trim(); }
    const parts = rest.split(/\t+|\s{2,}|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
    let name = parts[0] || "", weight = parts.slice(1).join(" ");
    if (parts.length < 2) {
      const w = rest.match(/^(.*?[A-Za-z)\]])\s+(\d.*|light|bodyweight|bw)$/i);
      if (w) { name = w[1]; weight = w[2]; } else if (!m) continue;
    }
    let tag = "";
    const t = name.match(/^\[([^\]]+)\]\s*/);
    if (t) { tag = /warm/i.test(t[1]) ? "warmup" : /opt/i.test(t[1]) ? "optional" : ""; name = name.slice(t[0].length); }
    if (name) out.push(normEx({ name, tag, weight, sets, min, max }));
  }
  return out;
}

/** A whole plan with `DAY 1 — NAME (…)` headings -> [{ name, exercises }], or null if there are none. */
export function parsePlan(text) {
  const days = [], seen = {};
  let curr = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*day\s*\d+\s*[—–:-]+\s*(.+)$/i);
    if (!m) { curr?.lines.push(line); continue; }
    let name = m[1].split("(")[0].trim().toLowerCase().replace(/(^|[\s/&-])([a-z])/g, (_, a, b) => a + b.toUpperCase()) || "Day " + (days.length + 1);
    const k = name.toLowerCase();
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) name += " " + seen[k];
    days.push((curr = { name, lines: [] }));
  }
  const out = days.map((d) => ({ name: d.name, exercises: parseTable(d.lines.join("\n")) })).filter((d) => d.exercises.length);
  return out.length ? out : null;
}

/** The text from "Copy all history" (Date, Workout, Exercise, Weight, Reps) -> sessions, or null if there are no such rows. */
export function parseHistory(text) {
  const by = new Map(); // ponytail: two sessions of the same workout on one day merge into one; add a session id column if that matters
  for (const line of String(text || "").split(/\r?\n/)) {
    const [d, name, n, w, reps] = line.split("\t").map((s) => s.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "") || !n || !reps) continue; // also skips the header row
    const r = [], ws = [];
    for (const part of reps.split(",")) {
      const m = part.trim().match(/^(\d+)(?:\s*@\s*(.+))?$/); // "6 @40" = 6 reps at its own weight
      if (m) { r.push(+m[1]); ws.push(m[2] ?? null); }
    }
    if (!r.length) continue;
    const key = d + "\t" + name;
    if (!by.has(key)) by.set(key, { d, name: name || "Workout", items: [] });
    by.get(key).items.push({ n, w: w || "", r, ...(ws.some(Boolean) ? { ws } : {}) });
  }
  return by.size ? [...by.values()] : null;
}

/**
 * Add imported sessions. One that is already here (same date and workout) is skipped, so importing
 * your own export twice changes nothing. Matching exercises get the entry in their log, so
 * "Last time" works again. Returns how many sessions were added.
 */
export function mergeHistory(state, sessions) {
  const have = new Set(state.sessions.map((x) => x.d + "\t" + x.name.toLowerCase()));
  const fresh = sessions.filter((x) => !have.has(x.d + "\t" + x.name.toLowerCase()));
  const newestFirst = (a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
  for (const x of fresh) {
    const w = state.workouts.find((w) => w.name.toLowerCase() === x.name.toLowerCase());
    for (const it of x.items) {
      const e = w?.exercises.find((e) => e.name.toLowerCase() === it.n.toLowerCase());
      if (!e) continue;
      e.log = [...e.log, { d: x.d, w: it.w, r: it.r, ...(it.ws ? { ws: it.ws } : {}) }].sort(newestFirst).slice(0, 20);
      e.last = e.log[0];
    }
  }
  state.sessions = [...state.sessions, ...fresh].sort(newestFirst).slice(0, 400);
  return fresh.length;
}

/** What the Import box holds: { backup } | { history } | { plan } | { exercises } | null. */
export function parseImport(text) {
  const t = String(text || "").trim();
  if (t[0] === "{") {
    try { const o = JSON.parse(t); if (Array.isArray(o?.workouts)) return { backup: normState(o) }; } catch {}
  }
  const history = parseHistory(t);
  if (history) return { history };
  const plan = parsePlan(t);
  if (plan) return { plan };
  const exercises = parseTable(t);
  return exercises.length ? { exercises } : null;
}

/** Carry last/log/step over to re-imported exercises that match by name. */
export function keepHistory(fresh, old) {
  for (const x of fresh) {
    const o = old.find((o) => o.name.toLowerCase() === x.name.toLowerCase());
    if (o) { x.last = o.last; x.log = o.log; x.step = o.step; }
  }
}

/** Merge a parsed plan: a day whose name already exists is updated and keeps its history. */
export function mergePlan(state, plan) {
  plan.forEach((p, i) => {
    let hit = state.workouts.find((w) => w.name.toLowerCase() === p.name.toLowerCase());
    if (hit) { keepHistory(p.exercises, hit.exercises); hit.exercises = p.exercises; }
    else state.workouts.push((hit = { id: uid(), name: p.name, exercises: p.exercises }));
    if (i === 0) state.active = hit.id;
  });
}

/** One workout as the tab-separated table used in Notes. */
export function tableText(w) {
  const rows = ["Exercise\tWeight\tSets and Reps"];
  for (const e of w.exercises) {
    const p = e.tag === "warmup" ? "[WARM-UP] " : e.tag === "optional" ? "[OPTIONAL] " : "";
    rows.push(p + e.name + "\t" + e.weight + "\t" + e.sets + " × " + (e.min === e.max ? e.min : e.min + "-" + e.max));
  }
  return rows.join("\n");
}

/** Every finished session as tab-separated text. */
export function historyText(state) {
  const rows = ["Date\tWorkout\tExercise\tWeight\tReps"];
  for (const x of state.sessions) for (const it of x.items) rows.push([x.d, x.name, it.n, it.w, repsText(it.r, it.ws)].join("\t"));
  return rows.join("\n");
}
