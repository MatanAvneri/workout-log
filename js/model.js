// Data model and progression rules. Pure: no DOM, no storage. Checked by test.mjs.

export const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** "50" or "50 kg" -> 50. Anything else ("light", "20 / 40") -> null, and is treated as text. */
export function num(w) {
  const m = String(w ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*(?:kg)?$/i);
  return m ? parseFloat(m[1]) : null;
}
export const fmt = (n) => String(Math.round(n * 100) / 100);
export const range = (e) => (e.min === e.max ? String(e.min) : e.min + "–" + e.max);
export function today() {
  const d = new Date(), p = (n) => ("0" + n).slice(-2);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** Validate and repair one exercise. Every load and import path goes through this. */
export function normEx(e = {}) {
  let min = clamp(parseInt(e.min, 10) || 8, 1, 100);
  let max = clamp(parseInt(e.max, 10) || min, 1, 100);
  if (max < min) [min, max] = [max, min];
  const last = e.last && Array.isArray(e.last.r) && e.last.r.length
    ? { d: String(e.last.d || ""), w: String(e.last.w ?? ""), r: e.last.r.map(Number) }
    : null;
  return {
    id: e.id || uid(),
    name: String(e.name || "Exercise"),
    tag: e.tag === "warmup" || e.tag === "optional" ? e.tag : "",
    weight: String(e.weight ?? ""),
    step: Number(e.step) > 0 ? Number(e.step) : 1,
    sets: clamp(parseInt(e.sets, 10) || 3, 1, 10),
    min, max,
    today: Array.isArray(e.today) ? e.today.map((x) => (x == null ? null : Number(x))) : [],
    todayW: e.todayW == null ? null : String(e.todayW),
    last,
    log: Array.isArray(e.log) ? e.log.slice(0, 20) : [],
  };
}

/** Validate and repair the whole document. */
export function normState(s) {
  const workouts = (Array.isArray(s?.workouts) ? s.workouts : []).map((w) => ({
    id: w.id || uid(),
    name: String(w.name || "Workout"),
    exercises: (Array.isArray(w.exercises) ? w.exercises : []).map(normEx),
  }));
  const active = workouts.some((w) => w.id === s?.active) ? s.active : workouts[0]?.id ?? null;
  const sessions = (Array.isArray(s?.sessions) ? s.sessions : [])
    .filter((x) => x && Array.isArray(x.items))
    .map((x) => ({
      d: String(x.d || ""),
      name: String(x.name || "Workout"),
      items: x.items.map((i) => ({ n: String(i.n || ""), w: String(i.w ?? ""), r: (Array.isArray(i.r) ? i.r : []).map(Number) })),
    }))
    .slice(0, 400);
  return { v: 1, active, workouts, sessions };
}

/** Close the session in progress: write last/log per exercise and one sessions entry. Returns exercises saved. */
export function finish(state, w) {
  const d = today(), items = [];
  for (const x of w.exercises) {
    const r = x.today.filter((v) => v != null);
    if (r.length) {
      x.last = { d, w: x.todayW ?? x.weight, r };
      x.log = [x.last, ...x.log].slice(0, 20);
      items.push({ n: x.name, w: x.last.w, r: [...r] });
    }
    x.today = [];
    x.todayW = null;
  }
  if (items.length) state.sessions = [{ d, name: w.name, items }, ...state.sessions].slice(0, 400);
  return items.length;
}

/**
 * Progression advice for one exercise, or null. Uses today's reps once every set is logged,
 * otherwise the last finished session. Returns { tone: "" | "up" | "low", text, to? } where
 * `to` is the weight a one-tap button should set.
 */
export function hint(e) {
  if (e.tag === "warmup") return null;
  const done = e.today.filter((x) => x != null);
  let src, lead;
  if (done.length >= e.sets) { src = { r: done, w: e.todayW ?? e.weight }; lead = "Today"; }
  else if (e.last) { src = e.last; lead = "Last time"; }
  else return null;

  const line = lead + ": " + src.r.join(", ") + (src.w ? " at " + src.w : "") + ".";
  if (String(src.w) !== String(e.weight)) return { tone: "", text: line + " Now set to " + e.weight + "." };

  const w = num(src.w);
  if (src.r.every((r) => r >= e.max)) {
    if (w == null) return { tone: "up", text: line + " Top of the range on every set, so add weight." };
    return { tone: "up", text: line + " Top of the range on every set, so go up to " + fmt(w + e.step) + ".", to: fmt(w + e.step) };
  }
  if (src.r.every((r) => r < e.min)) {
    if (w == null || w - e.step <= 0) return { tone: "low", text: line + " Under " + e.min + " on every set, so take some weight off." };
    return { tone: "low", text: line + " Under " + e.min + " on every set, so drop to " + fmt(w - e.step) + ".", to: fmt(w - e.step) };
  }
  if (src.r.some((r) => r < e.min)) return { tone: "low", text: line + " Stay at this weight until every set reaches " + e.min + "." };
  const need = src.r.reduce((a, r) => a + Math.max(0, e.max - r), 0);
  return { tone: "", text: line + " Stay at this weight; " + need + " more rep" + (need === 1 ? "" : "s") + " tops out every set." };
}
