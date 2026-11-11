// HTML for every screen. Pure functions of (state, ui) -> string. Clicks are wired by data-a in app.js.
import { num, fmt, range, hint, repsText } from "./model.js";
import { tableText } from "./io.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function appHTML(state, w, ui, status) {
  const days = state.workouts
    .map((x, i) => `<button class="day" data-a="day" data-id="${esc(x.id)}" aria-pressed="${x.id === state.active}"><span class="n">${i + 1}</span>${esc(x.name)}</button>`)
    .join("");
  const body = w
    ? w.exercises.map((e) => exerciseHTML(e, ui.pick)).join("") + `<button class="add" data-a="addex">Add an exercise</button>`
    : `<div class="card empty-state"><h2>No workouts yet</h2>
        <p>Paste your table from Notes, or import a backup file, and it becomes a workout you can log against.</p>
        <button class="primary" data-a="manage">Import a workout</button></div>`;
  return `
    <header class="hdr">
      <div class="title"><h1>${esc(w ? w.name : "Workouts")}</h1><p class="status" id="status">${esc(status)}</p></div>
      <button class="chip" data-a="history">History</button>
      <button class="chip" data-a="manage">Manage</button>
    </header>
    ${days ? `<nav class="days glass">${days}</nav>` : ""}
    ${body}`;
}

function exerciseHTML(e, pick) {
  const id = esc(e.id), n = num(e.weight), picking = pick?.ex === e.id;
  const tag = e.tag ? `<span class="tag">${e.tag === "warmup" ? "Warm-up" : "Optional"}</span>` : "";
  const weight = n != null
    ? `<div class="wt">
        <button class="step" data-a="dec" data-id="${id}" aria-label="Less weight">−</button>
        <input class="val num" type="number" inputmode="decimal" step="any" min="0" data-w="${id}" value="${esc(fmt(n))}" aria-label="Weight">
        <button class="step" data-a="inc" data-id="${id}" aria-label="More weight">+</button>
      </div>`
    : `<div class="wt txt"><button class="val" data-a="edit" data-id="${id}">${esc(e.weight || "Set weight")}</button></div>`;

  let sets = "";
  for (let i = 0; i < e.sets; i++) {
    const r = e.today[i];
    const cls = ["set", r == null ? "empty" : r >= e.max ? "top" : r < e.min ? "low" : "", picking && pick.set === i ? "on" : ""].join(" ");
    sets += `<button class="${cls}" data-a="set" data-id="${id}" data-i="${i}" aria-label="Set ${i + 1}${r == null ? ", not logged" : ", " + r + " reps"}">
      <small>Set ${i + 1}${e.todayWs[i] ? " · " + esc(e.todayWs[i]) : ""}</small><span class="num">${r ?? "–"}</span></button>`;
  }

  let picker = "";
  if (picking) {
    for (let k = 1; k <= 40; k++)
      picker += `<button class="num${k >= e.min && k <= e.max ? " goal" : ""}" data-a="rep" data-n="${k}">${k}</button>`;
    picker = `<div class="pick" id="pick">${picker}<button class="clear" data-a="rep" data-n="">Clear</button></div>
      <label class="setw">Different weight for set ${pick.set + 1}
        <input type="${n != null ? "number" : "text"}" inputmode="decimal" step="any" min="0" data-sw="${id}" data-i="${pick.set}"
          value="${esc(e.todayWs[pick.set] ?? "")}" placeholder="${esc(e.weight)}"></label>`;
  }

  const t = hint(e);
  const advice = t
    ? `<div class="hint ${t.tone}"><p>${esc(t.text)}</p>${t.to ? `<button data-a="apply" data-id="${id}" data-w="${esc(t.to)}">Set ${esc(t.to)}</button>` : ""}</div>`
    : "";

  return `<section class="card ex">
    <div class="head">
      <button class="name" data-a="edit" data-id="${id}"><b>${tag}${esc(e.name)}</b><span>${e.sets} × ${range(e)}</span></button>
      ${weight}
    </div>
    <div class="sets">${sets}</div>${picker}${advice}
  </section>`;
}

/** Everything that floats above the list: the Finish bar and the open sheet. `fresh` animates the sheet in. */
export function layerHTML(state, w, ui, fresh) {
  let h = "";
  const logged = w?.exercises.some((e) => e.today.some((x) => x != null));
  if (logged && !ui.sheet) h += `<div class="bar glass"><button class="primary" data-a="finish">Finish workout</button></div>`;
  if (ui.sheet) {
    const t = ui.sheet.type;
    const body = t === "history" ? historyHTML(state) : t === "edit" ? editHTML(w, ui) : manageHTML(w, ui);
    if (body) h += `<div class="veil${fresh ? " fresh" : ""}" data-a="veil"><div class="sheet glass" role="dialog" aria-modal="true">${body}</div></div>`;
  }
  return h;
}

const sheetTitle = (t) => `<h2>${t}<button class="link" data-a="close">Done</button></h2>`;

function editHTML(w, ui) {
  const s = ui.sheet, e = s.isNew ? s.draft : w?.exercises.find((x) => x.id === s.id);
  if (!e) return "";
  let h = sheetTitle(s.isNew ? "Add an exercise" : "Edit exercise") + `
    <label>Name<input type="text" id="f-name" value="${esc(e.name)}"></label>
    <div class="grid2">
      <label>Weight<input type="text" id="f-weight" value="${esc(e.weight)}" placeholder="50, or “light”"></label>
      <label>Step for − and +<input type="number" id="f-step" inputmode="decimal" step="any" value="${e.step}"></label>
    </div>
    <div class="grid3">
      <label>Sets<input type="number" id="f-sets" inputmode="numeric" value="${e.sets}"></label>
      <label>Reps from<input type="number" id="f-min" inputmode="numeric" value="${e.min}"></label>
      <label>Reps to<input type="number" id="f-max" inputmode="numeric" value="${e.max}"></label>
    </div>
    <label>Kind<select id="f-tag">
      <option value="">Main lift</option>
      <option value="warmup"${e.tag === "warmup" ? " selected" : ""}>Warm-up</option>
      <option value="optional"${e.tag === "optional" ? " selected" : ""}>Optional</option>
    </select></label>
    <div class="row"><button class="btn solid" data-a="saveex">Save exercise</button></div>`;
  if (!s.isNew) {
    h += `<div class="row">
      <button class="btn" data-a="up">Move up</button>
      <button class="btn" data-a="down">Move down</button>
      <button class="btn danger" data-a="delex">${ui.confirm === "delex" ? "Tap again to delete" : "Delete"}</button>
    </div>`;
    if (e.log.length) h += `<h3>History</h3>` + e.log.slice(0, 8).map((l) => `<p class="sess"><span>${esc(l.d)}</span><span class="r">${esc(repsText(l.r || [], l.ws))} at ${esc(l.w)}</span></p>`).join("");
  }
  return h;
}

function manageHTML(w, ui) {
  let h = sheetTitle("Workouts and backup");
  if (w) h += `
    <label>Name of this workout<input type="text" id="f-wname" value="${esc(w.name)}"></label>
    <h3>Export</h3>
    <textarea id="exp" readonly>${esc(tableText(w))}</textarea>
    <div class="row"><button class="btn" data-a="copy">Copy table</button><button class="btn" data-a="file">Save backup file</button></div>
    <p class="note">The table pastes straight into Notes. The backup file holds every workout with its history.</p>`;
  h += `
    <h3>Import</h3>
    <textarea id="imp" placeholder="Paste one table, your whole plan with its DAY 1, DAY 2 headings, or copied history"></textarea>
    <input type="file" id="f-file" accept=".json,.txt,.csv,.tsv,text/plain,application/json">
    <div class="row">
      <button class="btn solid" data-a="impnew">Add as new workout</button>
      ${w ? `<button class="btn" data-a="imprep">${ui.confirm === "imprep" ? "Tap again to replace" : "Replace this workout"}</button>` : ""}
    </div>
    <p class="note">A whole plan with DAY headings becomes one workout per day; a day whose name already exists is updated and keeps its history. A backup file replaces every workout. History copied from the History sheet is added to your sessions with either button; sessions already here are skipped.</p>`;
  if (w) h += `<div class="row"><button class="btn danger" data-a="delw">${ui.confirm === "delw" ? `Tap again to delete “${esc(w.name)}”` : "Delete this workout"}</button></div>`;
  h += `
    <h3>App</h3>
    <div class="row"><button class="btn" data-a="update">Update app</button></div>
    <p class="note">Loads the newest version of the app. Your workouts and history stay on this phone.</p>`;
  return h;
}

function niceDate(d) {
  const t = new Date(d + "T12:00:00");
  return isNaN(t) ? d : t.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function historyHTML(state) {
  let h = sheetTitle("History");
  if (!state.sessions.length) return h + `<p class="note">No sessions yet. Log your sets and tap Finish workout, and each session is listed here.</p>`;
  h += `<div class="row"><button class="btn" data-a="copyhist">Copy all history</button></div>`;
  for (const x of state.sessions) {
    h += `<h3>${esc(niceDate(x.d))} · ${esc(x.name)}</h3>`;
    h += x.items.map((it) => `<p class="sess"><span>${esc(it.n)}</span><span class="r">${esc(repsText(it.r, it.ws))}${it.w ? " at " + esc(it.w) : ""}</span></p>`).join("");
  }
  return h;
}
