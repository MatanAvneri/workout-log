// Wiring: holds the state, saves it on this phone, renders, and handles every tap.
import { normState, normEx, num, fmt, today, uid, finish } from "./model.js";
import { parseImport, mergePlan, keepHistory, historyText } from "./io.js";
import { appHTML, layerHTML } from "./views.js";

const KEY = "workout-log"; // the only place data lives: this phone's localStorage
const $ = (id) => document.getElementById(id);
const app = $("app"), layer = $("layer"), toastEl = $("toast");

let state = load();
let dirty = false, saveErr = false, saveTimer, toastTimer, sheetWasOpen = false;
const ui = { pick: null, sheet: null, confirm: null }; // pick: {ex, set}; sheet: {type, id?, isNew?, draft?}

const cur = () => state.workouts.find((w) => w.id === state.active) ?? null;
const findEx = (id) => cur()?.exercises.find((e) => e.id === id) ?? null;
const val = (id) => $(id)?.value ?? "";

/* ---------- storage ---------- */
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
  return normState(s);
}
function flush() {
  if (!dirty) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); saveErr = false; } catch { saveErr = true; }
  dirty = false;
  const el = $("status");
  if (el) el.textContent = statusText();
}
function touch() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500); }
function changed() { touch(); render(); }
const statusText = () => (saveErr ? "This phone can’t store changes right now." : "Saved on this phone only");
document.addEventListener("visibilitychange", flush); // don't lose the last tap when the app is closed

/* ---------- rendering ---------- */
function render() {
  const w = cur();
  const daysX = app.querySelector(".days")?.scrollLeft ?? 0;
  app.innerHTML = appHTML(state, w, ui, statusText());
  const days = app.querySelector(".days");
  if (days) days.scrollLeft = daysX;
  const goal = app.querySelector("#pick .goal");
  if (goal) goal.parentNode.scrollLeft = Math.max(0, goal.offsetLeft - 60);
  layer.innerHTML = layerHTML(state, w, ui, !!ui.sheet && !sheetWasOpen);
  sheetWasOpen = !!ui.sheet;
  document.body.classList.toggle("locked", sheetWasOpen);
}
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
}
function copy(text, done, fallback) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
  else fallback();
}

/* ---------- actions: one case per data-a value ---------- */
function act(a, d) {
  const w = cur(), s = ui.sheet;
  let e = d.id ? findEx(d.id) : null;
  if (!["delex", "delw", "imprep"].includes(a)) ui.confirm = null;

  switch (a) {
    case "day": state.active = d.id; ui.pick = null; changed(); scrollTo(0, 0); break;
    case "manage": ui.sheet = { type: "manage" }; render(); break;
    case "history": ui.sheet = { type: "history" }; render(); break;
    case "close": ui.sheet = null; render(); break;
    case "edit": if (e) { ui.sheet = { type: "edit", id: e.id }; render(); } break;
    case "addex": {
      const draft = normEx({ sets: 3, min: 10, max: 12 });
      draft.name = "";
      ui.sheet = { type: "edit", isNew: true, draft };
      render();
      break;
    }

    case "inc": case "dec": {
      const n = e && num(e.weight);
      if (n != null) { e.weight = fmt(Math.max(0, n + (a === "inc" ? e.step : -e.step))); changed(); }
      break;
    }
    case "apply": if (e) { e.weight = d.w; changed(); } break;

    case "set": {
      if (!e) break;
      const i = +d.i, same = ui.pick?.ex === e.id && ui.pick.set === i;
      ui.pick = same ? null : { ex: e.id, set: i };
      render();
      break;
    }
    case "rep": {
      e = ui.pick && findEx(ui.pick.ex);
      if (!e) break;
      const i = ui.pick.set;
      while (e.today.length < e.sets) e.today.push(null);
      e.today[i] = d.n === "" ? null : +d.n;
      if (e.today.every((x) => x == null)) { e.today = []; e.todayW = null; }
      else if (e.todayW == null) e.todayW = e.weight;
      // move on to the next empty set, wrapping round
      let next = -1;
      if (d.n !== "") for (let k = 1; k <= e.sets && next < 0; k++) if (e.today[(i + k) % e.sets] == null) next = (i + k) % e.sets;
      ui.pick = next >= 0 ? { ex: e.id, set: next } : null;
      changed();
      break;
    }
    case "finish": {
      if (!w) break;
      const c = finish(state, w);
      ui.pick = null;
      changed();
      toast("Workout saved: " + c + " exercise" + (c === 1 ? "" : "s"));
      break;
    }

    case "saveex": {
      const t = s && w && (s.isNew ? s.draft : findEx(s.id));
      if (!t) break;
      const f = normEx({
        ...t, name: val("f-name").trim() || "Exercise", tag: val("f-tag"), weight: val("f-weight").trim(),
        step: val("f-step"), sets: val("f-sets"), min: val("f-min"), max: val("f-max"),
      });
      f.today = f.today.slice(0, f.sets);
      if (s.isNew) w.exercises.push(f); else w.exercises[w.exercises.indexOf(t)] = f;
      ui.sheet = null;
      changed();
      break;
    }
    case "up": case "down": {
      e = s && findEx(s.id);
      if (!e) break;
      const i = w.exercises.indexOf(e), to = i + (a === "up" ? -1 : 1);
      if (to >= 0 && to < w.exercises.length) { w.exercises.splice(i, 1); w.exercises.splice(to, 0, e); changed(); }
      break;
    }
    case "delex":
      if (ui.confirm !== "delex") { ui.confirm = "delex"; render(); break; }
      ui.confirm = null;
      e = s && findEx(s.id);
      if (e) { w.exercises.splice(w.exercises.indexOf(e), 1); ui.sheet = null; changed(); }
      break;
    case "delw":
      if (ui.confirm !== "delw") { ui.confirm = "delw"; render(); break; }
      ui.confirm = null;
      if (w) { state.workouts.splice(state.workouts.indexOf(w), 1); state.active = state.workouts[0]?.id ?? null; ui.sheet = null; changed(); }
      break;

    case "copyhist":
      copy(historyText(state), "History copied", () => toast("Copying isn’t allowed here. Use Save backup file under Manage."));
      break;
    case "copy":
      copy(val("exp"), "Table copied", () => { $("exp")?.select(); toast("Select the text and copy it"); });
      break;
    case "file": {
      const name = "workouts-backup-" + today() + ".json";
      const f = new File([JSON.stringify(state, null, 1)], name, { type: "application/json" });
      if (navigator.canShare?.({ files: [f] })) { navigator.share({ files: [f] }).catch(() => {}); break; } // iOS: share sheet -> Save to Files
      const link = document.createElement("a");
      link.href = URL.createObjectURL(f);
      link.download = name;
      link.click();
      break;
    }

    case "impnew": case "imprep": {
      const raw = val("imp"), imp = parseImport(raw);
      if (!imp) { toast("Nothing to import. Paste a table with one exercise per line."); break; }
      if (a === "imprep" && !imp.plan && ui.confirm !== "imprep") { ui.confirm = "imprep"; render(); $("imp").value = raw; break; }
      ui.confirm = null;
      if (imp.plan) mergePlan(state, imp.plan);
      else if (imp.backup) {
        if (a === "imprep") state = imp.backup;
        else for (const x of imp.backup.workouts) { x.id = uid(); state.workouts.push(x); state.active = x.id; }
      } else if (a === "impnew") {
        const nw = { id: uid(), name: "Workout " + (state.workouts.length + 1), exercises: imp.exercises };
        state.workouts.push(nw);
        state.active = nw.id;
      } else if (w) {
        keepHistory(imp.exercises, w.exercises);
        w.exercises = imp.exercises;
      }
      ui.sheet = null;
      ui.pick = null;
      changed();
      toast("Imported");
      break;
    }
  }
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-a]");
  if (!el) return;
  if (el.dataset.a === "veil") { if (ev.target === el) { ui.sheet = null; ui.confirm = null; render(); } return; }
  act(el.dataset.a, el.dataset);
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "f-wname") { const w = cur(); if (w) { w.name = t.value.trim() || "Workout"; touch(); } }
  if (t.id === "f-file" && t.files?.[0]) t.files[0].text().then((text) => { const el = $("imp"); if (el) el.value = text; });
});

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
