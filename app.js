import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteField, arrayUnion, arrayRemove,
  serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// This key only identifies the Firebase project. It is meant to be public;
// access is controlled by firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyAsuPrNLMkrY11mM0ybPAvcCoXi5TC_hVY",
  authDomain: "medium75-7c39.firebaseapp.com",
  projectId: "medium75-7c39",
  storageBucket: "medium75-7c39.firebasestorage.app",
  messagingSenderId: "901567497921",
  appId: "1:901567497921:web:db6a4032a4321f1122b640"
};

const app = initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch {
  db = getFirestore(app);
}

const TOTAL = 75;
const DAY_MS = 86400000;
const ME_KEY = "75medium:me";
const SEEN_KEY = "75medium:seen-cheers";
const LOCAL_KEY = "75medium:v2"; // progress saved before sync existed
const REACTIONS = ["🎉", "👏", "🔥", "💪", "🙌", "⭐"];

// Icon paths are drawn on a 24x24 grid with a stroke.
// "slot" is the task's position in the stored array. New tasks take the next free slot,
// so days saved earlier keep their meaning. The array order is the display order.
const TASKS = [
  { slot: 7, label: "Get out of bed right away", about: "When you wake up, get up. No snoozing, no scrolling in bed.",
    icon: "M3 12a9 9 0 0 1 18 0M2 12h20M12 3V1.5M5.6 5.6 4.5 4.5M18.4 5.6l1.1-1.1M8 16l4 4 4-4M12 20v-6" },
  { slot: 0, label: "Stick to your diet", about: "Choose a way of eating that works for you and follow it. No cheat meals.",
    icon: "M12 7.5c-1.6-1.4-4.6-1.6-6 .6-1.4 2.2-.6 6.2 1.4 9 1.6 2.3 3.2 2.8 4.6 1.9 1.4.9 3 .4 4.6-1.9 2-2.8 2.8-6.8 1.4-9-1.4-2.2-4.4-2-6-.6zM12 7.5c0-2 .9-3.4 2.8-4" },
  { slot: 1, label: "Exercise for 45 minutes", about: "Gym, a run, a long walk, yoga, a match. Any movement counts.",
    icon: "M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" },
  { slot: 2, label: "Drink water regularly", about: "Keep a bottle close and sip through the day.",
    icon: "M12 3.5s6 6.3 6 10.6a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" },
  { slot: 3, label: "No alcohol or weed", about: "A real social celebration is the only exception.", note: "Unless it's a social celebration",
    icon: "M8 3.5h8l-.6 5.5a3.4 3.4 0 0 1-6.8 0zM12 12.5v7M8.5 19.5h7M4 4l16 16" },
  { slot: 4, label: "Avoid excessive phone time", about: "Less scrolling, more being where you are.",
    icon: "M8.5 3h7A1.5 1.5 0 0 1 17 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3zM11 18h2" },
  { slot: 5, label: "Read 6 pages of non-fiction", about: "A small daily dose of learning. It adds up to whole books.",
    icon: "M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13" },
  { slot: 6, label: "Journal your daily progress", about: "A few honest lines on how the day went.",
    icon: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4" }
];

const $ = (id) => document.getElementById(id);
const svg = (cls, d) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// ---------- State ----------
// users/{id}: { name, start: "YYYY-MM-DD", days: { "<day>": [bool per slot] }, friends: [id] }
// cheers/{id}: { to, from, fromName, day, emoji, at }

let me = storage.get(ME_KEY);
let viewing = me;
const users = new Map();
let cheers = [];
let unsubCheers = null;

const userRef = (id) => doc(db, "users", id);
const meUser = () => users.get(me);
const viewed = () => users.get(viewing) || null;
const isMine = () => viewing === me;

// ---------- Day maths ----------

const emptyTasks = () => Array(TASKS.length).fill(false);
const dayTasks = (u, day) => (u?.days || {})[day] || null;

const parseDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const isoToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const dateFor = (u, day) => {
  if (!u?.start) return null;
  const d = parseDate(u.start);
  d.setDate(d.getDate() + day - 1);
  return d;
};
const todayFor = (u) =>
  u?.start ? Math.round((parseDate(isoToday()) - parseDate(u.start)) / DAY_MS) + 1 : 0;
// A past day saved before a task was added is judged on the tasks it had then.
const tasksOn = (u, day) => {
  const a = dayTasks(u, day);
  return a && a.length < TASKS.length && day < todayFor(u) ? TASKS.filter((t) => t.slot < a.length) : TASKS;
};
const taskTotal = (u, day) => tasksOn(u, day).length;
const doneCount = (u, day) => {
  const a = dayTasks(u, day) || [];
  return tasksOn(u, day).filter((t) => a[t.slot]).length;
};
const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);

// "complete" | "partial" | "missed" | "today" | "future" | "none"
function status(u, day) {
  if (dayTasks(u, day)) return doneCount(u, day) === taskTotal(u, day) ? "complete" : "partial";
  if (!u?.start) return "none";
  const t = todayFor(u);
  return day < t ? "missed" : day === t ? "today" : "future";
}

function stats(u) {
  let complete = 0, best = 0, run = 0;
  for (let d = 1; d <= TOTAL; d++) {
    if (status(u, d) === "complete") { complete++; run++; best = Math.max(best, run); }
    else run = 0;
  }
  // The current streak counts back from today, or from yesterday while today is still open.
  const t = Math.min(todayFor(u), TOTAL);
  let streak = 0;
  let d = status(u, t) === "complete" ? t : t - 1;
  while (d >= 1 && status(u, d) === "complete") { streak++; d--; }
  return { complete, best, streak };
}

// ---------- Calendar ----------

// The 75 days are laid out on real months, weeks starting on Monday. Dates in those
// months that fall outside the challenge are shown faintly so the month reads normally.
const grid = $("grid");
let cells = [];
let builtFor = null;

function buildCalendar(u) {
  const start = u?.start || isoToday();
  if (builtFor === start) return;
  builtFor = start;
  cells = [];
  const first = parseDate(start);
  const last = new Date(first);
  last.setDate(last.getDate() + TOTAL - 1);
  const monday = new Date(2024, 0, 1);
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return `<li>${fmt(d, { weekday: "short" }).slice(0, 3)}</li>`;
  }).join("");
  const sameYear = first.getFullYear() === last.getFullYear() && first.getFullYear() === new Date().getFullYear();
  const frag = document.createDocumentFragment();
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= last; m.setMonth(m.getMonth() + 1)) {
    const section = document.createElement("section");
    section.className = "month";
    section.innerHTML =
      `<h3>${fmt(m, sameYear ? { month: "long" } : { month: "long", year: "numeric" })}</h3>` +
      `<ol class="weekdays" aria-hidden="true">${weekdays}</ol>`;
    const ol = document.createElement("ol");
    ol.className = "grid";
    // Only the weeks that hold challenge days, from Monday to Sunday, clipped to the month.
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const from = m < first ? first.getDate() : 1;
    const to = new Date(m.getFullYear(), m.getMonth(), daysInMonth) > last ? last.getDate() : daysInMonth;
    const lead = (new Date(m.getFullYear(), m.getMonth(), from).getDay() + 6) % 7;
    const startDate = Math.max(1, from - lead);
    const trail = 6 - (new Date(m.getFullYear(), m.getMonth(), to).getDay() + 6) % 7;
    const endDate = Math.min(daysInMonth, to + trail);
    for (let i = 0; i < (new Date(m.getFullYear(), m.getMonth(), startDate).getDay() + 6) % 7; i++) ol.append(document.createElement("li"));
    for (let date = startDate; date <= endDate; date++) {
      const li = document.createElement("li");
      const day = Math.round((new Date(m.getFullYear(), m.getMonth(), date) - first) / DAY_MS) + 1;
      if (day < 1 || day > TOTAL) {
        li.className = "outside";
        li.innerHTML = `<span>${date}</span>`;
      } else {
        li.style.setProperty("--i", day);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "day";
        btn.dataset.day = day;
        btn.innerHTML =
          `<span class="num">${date}</span><span class="streak">${day}</span><span class="cheer-count"></span>` +
          `<span class="mark">${svg("x", "M6 6 L18 18 M18 6 L6 18")}${svg("tick", "M5 12.5 L10 17 L19 7")}</span>`;
        li.append(btn);
        cells[day - 1] = btn;
      }
      ol.append(li);
    }
    section.append(ol);
    frag.append(section);
  }
  grid.replaceChildren(frag);
}

const cheersForDay = (day) => cheers.filter((c) => c.day === day);

function renderDay(day) {
  const u = viewed();
  const btn = cells[day - 1];
  const s = status(u, day);
  for (const c of ["complete", "partial", "missed", "future"]) btn.classList.toggle(c, s === c);
  btn.classList.toggle("today", day === todayFor(u));

  const got = isMine() && s === "complete" ? cheersForDay(day).length : 0;
  btn.querySelector(".cheer-count").textContent = got ? `🎉${got > 1 ? got : ""}` : "";

  const date = dateFor(u, day);
  let label = date ? `${fmt(date, { weekday: "long", month: "long", day: "numeric" })}, day ${day} of ${TOTAL}` : `Day ${day}`;
  if (s === "complete") label += ", complete";
  else if (s === "partial") label += `, ${doneCount(u, day)} of ${taskTotal(u, day)} tasks done`;
  else if (s === "missed") label += ", missed";
  if (got) label += `, ${got} cheer${got > 1 ? "s" : ""}`;
  btn.setAttribute("aria-label", label);
}

// ---------- Panels ----------

function renderHero() {
  const u = viewed();
  const mine = isMine();
  const { complete, best, streak } = stats(u);

  $("ring-fill").style.strokeDashoffset = 326.73 * (1 - complete / TOTAL);
  $("ring-pct").textContent = `${Math.round((complete / TOTAL) * 100)}%`;
  $("ring").setAttribute("aria-label", `${complete} of ${TOTAL} days complete`);
  $("stat-complete").textContent = complete;
  $("stat-streak").textContent = streak;
  $("stat-best").textContent = best;
  $("stat-left").textContent = TOTAL - complete;
  $("finish").hidden = complete < TOTAL;
  $("finish").textContent = mine ? "All 75 days complete. You did it." : `${u?.name} finished all 75 days.`;

  if (!u) return;
  const t = todayFor(u);
  const short = { month: "short", day: "numeric" };
  $("kicker").textContent = t < 1 ? `Starts in ${1 - t} day${1 - t === 1 ? "" : "s"}`
    : t > TOTAL ? "Challenge finished" : `Day ${t} of ${TOTAL}`;
  const lead = !mine ? "Cheer on" : t < 1 ? "Get ready," : t > TOTAL ? "Well done," : "Keep going,";
  $("headline").innerHTML = `${lead} <em></em>`;
  $("headline").querySelector("em").textContent = `${u.name}.`;
  $("subline").textContent = `${fmt(parseDate(u.start), short)} – ${fmt(dateFor(u, TOTAL), { ...short, year: "numeric" })}`;
}

function renderToday() {
  const card = $("today");
  card.hidden = !isMine();
  const u = meUser();
  if (!u) return;
  const t = todayFor(u);
  const open = $("today-open");
  const count = $("today-count");
  const pips = $("today-pips");
  open.classList.remove("is-complete");

  if (t < 1 || t > TOTAL) {
    $("today-kicker").textContent = "Today";
    $("today-title").textContent = t < 1
      ? `Day 1 is ${fmt(parseDate(u.start), { weekday: "long", month: "long", day: "numeric" })}`
      : "All 75 days are behind you";
    count.textContent = "";
    pips.innerHTML = "";
    open.disabled = true;
    open.textContent = t > TOTAL ? "Challenge over" : "Not yet";
    return;
  }

  const n = doneCount(u, t);
  const done = dayTasks(u, t) || [];
  $("today-kicker").textContent = `Today · ${fmt(new Date(), { weekday: "long", month: "short", day: "numeric" })}`;
  $("today-title").textContent = `Day ${t}`;
  count.textContent = dayTasks(u, t) ? `${n}/${TASKS.length}` : "";
  count.classList.toggle("all", n === TASKS.length);
  pips.innerHTML = TASKS.map((t) => `<li class="${done[t.slot] ? "on" : ""}"></li>`).join("");
  open.disabled = false;
  if (n === TASKS.length) {
    open.textContent = "Today is complete";
    open.classList.add("is-complete");
  } else {
    open.textContent = n ? "Continue today's tasks" : "Log today's tasks";
  }
}

function personRow(id, u, extra = "") {
  const t = todayFor(u);
  const { complete } = stats(u);
  const where = t < 1 ? "Not started yet" : t > TOTAL ? "Finished" : `Day ${t}`;
  return `<li><button type="button" class="person${extra}" data-id="${esc(id)}">` +
    `<span class="avatar">${esc((u.name || "?").charAt(0).toUpperCase())}</span>` +
    `<span class="person-text"><span class="person-name">${esc(u.name)}</span>` +
    `<span class="person-meta">${where} · ${complete}/${TOTAL} complete</span></span>` +
    svg("chev", "M9 6l6 6-6 6") + `</button></li>`;
}

function renderFriends() {
  const u = meUser();
  const ids = (u?.friends || []).filter((id) => users.has(id));
  $("friend-list").innerHTML = ids
    .map((id) => personRow(id, users.get(id), id === viewing ? " active" : ""))
    .join("");
  $("friends-empty").hidden = ids.length > 0;
}

function renderCalendarHead() {
  const mine = isMine();
  const u = viewed();
  $("viewing").hidden = mine;
  $("viewing-name").textContent = u?.name || "";
  $("cal-title").textContent = mine ? "Your 75 days" : `${u?.name}'s 75 days`;
  $("cal-sub").textContent = mine ? "Tap any day to check off its tasks." : "Tap a green day to congratulate them.";
  $("reset").hidden = !mine;
  document.body.classList.toggle("friend-view", !mine);
}

function renderProfile() {
  const u = meUser();
  $("profile").hidden = !u;
  if (!u) return;
  $("profile-name").textContent = u.name;
  $("avatar").textContent = u.name.charAt(0).toUpperCase();
}

function renderAll() {
  if (!viewed()) return;
  document.body.classList.remove("loading");
  buildCalendar(viewed());
  for (let d = 1; d <= TOTAL; d++) renderDay(d);
  renderHero();
  renderToday();
  renderFriends();
  renderCalendarHead();
  renderProfile();
  if ($("day-sheet").open) renderSheet();
  if ($("cheer-sheet").open) renderCheerSheet();
}

// ---------- Sync ----------

onSnapshot(collection(db, "users"), (snap) => {
  users.clear();
  snap.forEach((d) => users.set(d.id, d.data()));

  if (me && !users.has(me)) { // this device's person was deleted
    storage.del(ME_KEY);
    me = viewing = null;
  }
  if (viewing && !users.has(viewing)) viewing = me;

  if (!me) {
    if (!$("who").open) openWho(true);
    else renderWhoList();
    return;
  }
  renderAll();
  if ($("friend-picker").open) renderFriendPicker();
}, (err) => {
  console.error(err);
  $("kicker").textContent = "Can't reach the server";
  toast("Couldn't load data. Check your connection and refresh.");
});

function watchCheers() {
  unsubCheers?.();
  cheers = [];
  if (!me) return;
  let first = true;
  unsubCheers = onSnapshot(query(collection(db, "cheers"), where("to", "==", me)), (snap) => {
    cheers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    announceCheers(first);
    first = false;
    if (isMine()) renderAll();
  });
}

function announceCheers() {
  let seen;
  try { seen = new Set(JSON.parse(storage.get(SEEN_KEY)) || []); } catch { seen = new Set(); }
  const fresh = cheers.filter((c) => !seen.has(c.id) && c.from !== me);
  fresh.slice(-3).forEach((c) => toast(`${c.emoji} ${c.fromName} congratulated you on day ${c.day}`));
  cheers.forEach((c) => seen.add(c.id));
  storage.set(SEEN_KEY, JSON.stringify([...seen]));
}

const save = (fields) =>
  updateDoc(userRef(me), { ...fields, updatedAt: serverTimestamp() })
    .catch((e) => { console.error(e); toast("Couldn't save. Check your connection."); });

function setMe(id) {
  me = viewing = id;
  storage.set(ME_KEY, id);
  watchCheers();
  renderAll();
}

// ---------- PIN ----------
// A light lock for a few friends, not real security: the hash sits in a readable document.
async function pinHash(id, pin) {
  const bytes = new TextEncoder().encode(`75medium:${id}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const validPin = (v) => /^\d{4}$/.test(v);
for (const input of document.querySelectorAll(".pin-input")) {
  input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 4); });
}

// ---------- Who's tracking ----------

const who = $("who");

function renderWhoList() {
  const ids = [...users.keys()].sort((a, b) => users.get(a).name.localeCompare(users.get(b).name));
  $("who-list").innerHTML = ids.map((id) => personRow(id, users.get(id), id === me ? " active" : "")).join("");
  $("who-lede").textContent = ids.length
    ? "Pick yourself to load your calendar on this device."
    : "Nobody's here yet. Be the first.";
}

function openWho(required) {
  $("who-pick").hidden = false;
  $("new-form").hidden = true;
  $("pin-form").hidden = true;
  $("who-cancel").hidden = required;
  renderWhoList();
  if (!who.open) who.showModal();
}

who.addEventListener("cancel", (e) => { if (!me) e.preventDefault(); });
$("who-cancel").addEventListener("click", () => who.close());

$("who-list").addEventListener("click", (e) => {
  const b = e.target.closest(".person");
  if (!b) return;
  if (b.dataset.id === me) return who.close();
  openPin(b.dataset.id);
});

// Picking a person asks for their PIN. Someone without one yet chooses it here.
let pinFor = null;
function openPin(id) {
  const u = users.get(id);
  if (!u) return;
  pinFor = id;
  const isNew = !u.pinHash;
  $("pin-avatar").textContent = u.name.charAt(0).toUpperCase();
  $("pin-name").textContent = `${u.name}.`;
  $("pin-lede").textContent = isNew
    ? "Choose a 4-digit PIN. You'll use it to open your calendar on other devices."
    : "Enter your 4-digit PIN to open your calendar.";
  $("pin").autocomplete = isNew ? "new-password" : "current-password";
  $("pin-submit").textContent = isNew ? "Save PIN" : "Unlock";
  $("pin").value = "";
  $("pin-error").textContent = "";
  $("who-pick").hidden = true;
  $("pin-form").hidden = false;
  $("pin").focus();
}

async function submitPin() {
  const pin = $("pin").value;
  const u = users.get(pinFor);
  if (!u || !validPin(pin)) return;
  const hash = await pinHash(pinFor, pin);
  if (!u.pinHash) {
    await updateDoc(userRef(pinFor), { pinHash: hash, updatedAt: serverTimestamp() }).catch(() => {});
  } else if (hash !== u.pinHash) {
    $("pin-error").textContent = "That PIN isn't right. Try again.";
    $("pin").value = "";
    $("pin-form").classList.remove("shake");
    void $("pin-form").offsetWidth;
    $("pin-form").classList.add("shake");
    navigator.vibrate?.([30, 40, 30]);
    return;
  }
  who.close();
  setMe(pinFor);
}
$("pin-form").addEventListener("submit", (e) => { e.preventDefault(); submitPin(); });
$("pin").addEventListener("input", () => {
  $("pin-error").textContent = "";
  if ($("pin").value.length === 4 && users.get(pinFor)?.pinHash) submitPin();
});
$("pin-back").addEventListener("click", () => openWho(!me));

$("who-new").addEventListener("click", () => {
  let local = {};
  try { local = JSON.parse(storage.get(LOCAL_KEY)) || {}; } catch {}
  $("new-name").value = local.name || "";
  $("new-start").value = local.start || isoToday();
  $("who-pick").hidden = true;
  $("new-form").hidden = false;
  $("new-name").focus();
});

$("new-back").addEventListener("click", () => openWho(!me));

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  // Bring along progress this browser saved before sync existed.
  let local = {};
  try { local = JSON.parse(storage.get(LOCAL_KEY)) || {}; } catch {}
  const ref = doc(collection(db, "users"));
  await setDoc(ref, {
    name: $("new-name").value.trim(),
    pinHash: await pinHash(ref.id, $("new-pin").value),
    start: $("new-start").value,
    days: local.days && typeof local.days === "object" ? local.days : {},
    friends: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  storage.del(LOCAL_KEY);
  who.close();
  setMe(ref.id);
});

// ---------- My details ----------

const details = $("details");
$("profile").addEventListener("click", () => {
  const u = meUser();
  $("det-name").value = u.name;
  $("det-start").value = u.start;
  $("det-pin").value = "";
  details.showModal();
});
$("details-form").addEventListener("submit", async () => {
  const fields = { name: $("det-name").value.trim(), start: $("det-start").value };
  const pin = $("det-pin").value;
  if (validPin(pin)) fields.pinHash = await pinHash(me, pin);
  save(fields);
  if (fields.pinHash) toast("PIN updated");
});
$("switch-person").addEventListener("click", () => {
  details.close();
  openWho(false);
});

// ---------- Friends ----------

const picker = $("friend-picker");

function renderFriendPicker() {
  const mine = new Set(meUser()?.friends || []);
  const ids = [...users.keys()].filter((id) => id !== me && !mine.has(id));
  $("fp-list").innerHTML = ids.map((id) => personRow(id, users.get(id))).join("");
  $("fp-empty").hidden = ids.length > 0;
  $("fp-empty").querySelector("p").textContent = users.size > 1
    ? "Everyone who's joined is already your friend. Invite someone new:"
    : "Nobody else has joined yet. Send them the link:";
}

$("add-friend").addEventListener("click", () => { renderFriendPicker(); picker.showModal(); });

$("fp-list").addEventListener("click", async (e) => {
  const b = e.target.closest(".person");
  if (!b) return;
  const id = b.dataset.id;
  picker.close();
  await Promise.all([
    updateDoc(userRef(me), { friends: arrayUnion(id) }),
    updateDoc(userRef(id), { friends: arrayUnion(me) })
  ]).catch(() => toast("Couldn't add friend. Try again."));
  toast(`You and ${users.get(id)?.name} are now friends`);
});

$("copy-link").addEventListener("click", async () => {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) await navigator.share({ title: "75 Medium", url });
    else { await navigator.clipboard.writeText(url); toast("Link copied"); }
  } catch {}
});

$("friend-list").addEventListener("click", (e) => {
  const b = e.target.closest(".person");
  if (!b) return;
  viewing = b.dataset.id === viewing ? me : b.dataset.id;
  renderAll();
  if (matchMedia("(max-width: 919px)").matches) {
    document.querySelector(".calendar").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

$("back-mine").addEventListener("click", () => { viewing = me; renderAll(); });

// ---------- My day sheet ----------

const sheet = $("day-sheet");
const tasksEl = $("tasks");
let openDay = 0;

tasksEl.innerHTML = TASKS.map((task) =>
  `<li><button type="button" class="task" role="checkbox" aria-checked="false" data-index="${task.slot}">` +
    `<span class="task-icon">${svg("", task.icon)}</span>` +
    `<span class="task-text"><span class="task-label">${task.label}</span>` +
    (task.note ? `<span class="task-note">${task.note}</span>` : "") +
    `</span><span class="check">${svg("", "M5 12.5 L10 17 L19 7")}</span>` +
  `</button></li>`
).join("");
const taskBtns = [...tasksEl.querySelectorAll(".task")];

function cheersHtml(list) {
  if (!list.length) return "";
  return `<p class="cheers-title">Cheers</p><ul>` + list
    .map((c) => `<li><span class="cheer-emoji">${esc(c.emoji)}</span>${esc(c.fromName)}</li>`)
    .join("") + `</ul>`;
}

function renderSheet() {
  const u = meUser();
  const day = openDay;
  const n = doneCount(u, day);
  const total = taskTotal(u, day);
  const all = n === total;
  const date = dateFor(u, day);
  $("day-title").textContent = `Day ${day}`;
  $("day-date").textContent = date ? fmt(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  $("mini-count").textContent = n;
  $("mini-fill").style.strokeDashoffset = 113.1 * (1 - n / total);
  $("mini-ring").classList.toggle("all", all);
  const st = $("day-status");
  st.textContent = all ? "All done. This day is complete."
    : `${total - n} task${total - n === 1 ? "" : "s"} left to complete this day`;
  st.classList.toggle("all", all);
  const done = dayTasks(u, day) || emptyTasks();
  const shown = new Set(tasksOn(u, day).map((t) => t.slot));
  taskBtns.forEach((b) => {
    const slot = Number(b.dataset.index);
    b.closest("li").hidden = !shown.has(slot);
    b.setAttribute("aria-checked", String(!!done[slot]));
  });
  const got = cheersForDay(day);
  $("day-cheers").hidden = !got.length;
  $("day-cheers").innerHTML = cheersHtml(got);
}

function openMyDay(day) {
  openDay = day;
  const u = meUser();
  if (!dayTasks(u, day)) {
    u.days = { ...(u.days || {}), [day]: emptyTasks() }; // show it straight away
    save({ [`days.${day}`]: emptyTasks() });
  }
  renderSheet();
  sheet.showModal();
}

tasksEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".task");
  if (!btn) return;
  const u = meUser();
  const i = Number(btn.dataset.index);
  const before = status(u, openDay);
  const saved = dayTasks(u, openDay) || [];
  const size = taskTotal(u, openDay) === TASKS.length ? TASKS.length : saved.length;
  const next = Array.from({ length: Math.max(size, saved.length) }, (_, j) => !!saved[j]);
  next[i] = !next[i];
  u.days = { ...(u.days || {}), [openDay]: next };
  save({ [`days.${openDay}`]: next });
  renderAll();
  navigator.vibrate?.(8);
  if (before !== "complete" && status(u, openDay) === "complete") {
    navigator.vibrate?.([12, 40, 12]);
    confetti();
  }
});

$("day-clear").addEventListener("click", () => {
  const u = meUser();
  const days = { ...(u.days || {}) };
  delete days[openDay];
  u.days = days;
  save({ [`days.${openDay}`]: deleteField() });
  sheet.close();
  renderAll();
});

$("reset").addEventListener("click", () => {
  if (!Object.keys(meUser()?.days || {}).length) return;
  if (!confirm("Clear all 75 days? Your name and start date stay.")) return;
  meUser().days = {};
  save({ days: {} });
  renderAll();
});

// ---------- Friend's day: congratulate ----------

const cheerSheet = $("cheer-sheet");
let cheerDay = 0;
let cheerTo = null;
let sentCheers = [];
let unsubSent = null;

$("reactions").innerHTML = REACTIONS
  .map((r) => `<button type="button" class="reaction" data-emoji="${r}" aria-label="Send ${r}">${r}</button>`)
  .join("");

function renderCheerSheet() {
  const u = users.get(cheerTo);
  if (!u) return;
  $("cheer-title").textContent = `Day ${cheerDay}`;
  const date = dateFor(u, cheerDay);
  $("cheer-date").textContent = date ? fmt(date, { weekday: "long", month: "long", day: "numeric" }) : "";
  $("cheer-lede").textContent = `${u.name} completed every task. Send them some love.`;
  const list = sentCheers.filter((c) => c.day === cheerDay);
  $("cheer-list").hidden = !list.length;
  $("cheer-list").innerHTML = cheersHtml(list);
}

function openCheer(day) {
  cheerDay = day;
  if (cheerTo !== viewing) {
    cheerTo = viewing;
    sentCheers = [];
    unsubSent?.();
    unsubSent = onSnapshot(query(collection(db, "cheers"), where("to", "==", cheerTo)), (snap) => {
      sentCheers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (cheerSheet.open) renderCheerSheet();
    });
  }
  renderCheerSheet();
  cheerSheet.showModal();
}

$("reactions").addEventListener("click", (e) => {
  const b = e.target.closest(".reaction");
  if (!b) return;
  const to = users.get(cheerTo);
  addDoc(collection(db, "cheers"), {
    to: cheerTo,
    from: me,
    fromName: meUser().name,
    day: cheerDay,
    emoji: b.dataset.emoji,
    at: serverTimestamp()
  }).catch(() => toast("Couldn't send. Try again."));
  b.classList.remove("sent");
  void b.offsetWidth;
  b.classList.add("sent");
  navigator.vibrate?.(10);
  toast(`${b.dataset.emoji} Sent to ${to?.name}`);
});

// ---------- Calendar clicks ----------

grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".day");
  if (!btn || !viewed()) return;
  const day = Number(btn.dataset.day);
  if (isMine()) return openMyDay(day);

  const u = viewed();
  const s = status(u, day);
  if (s === "complete") openCheer(day);
  else if (s === "partial") toast(`${u.name} has ${doneCount(u, day)} of ${taskTotal(u, day)} tasks done on day ${day}`);
  else if (s === "missed") toast(`${u.name} missed day ${day}`);
  else toast(`Day ${day} hasn't been logged yet`);
});

// ---------- Dialog plumbing ----------

for (const dlg of document.querySelectorAll("dialog")) {
  dlg.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) dlg.close();
    else if (e.target === dlg && (dlg !== who || me)) dlg.close(); // backdrop click
  });
}

sheet.addEventListener("close", () => bump(openDay));
cheerSheet.addEventListener("close", () => bump(cheerDay));

function bump(day) {
  const cell = cells[day - 1];
  if (!cell) return;
  cell.focus({ preventScroll: true });
  cell.classList.remove("bump");
  void cell.offsetWidth;
  cell.classList.add("bump");
}

// ---------- What's 75 Medium? ----------

const about = $("about");
$("about-tasks").innerHTML = TASKS.map((t) =>
  `<li><span class="task-icon">${svg("", t.icon)}</span>` +
  `<span><strong>${t.label}</strong><span class="desc">${t.about}</span></span></li>`
).join("");
document.addEventListener("click", (e) => {
  if (e.target.closest("#about-open, [data-about]")) about.showModal();
});

// ---------- Toasts ----------

const toasts = $("toasts");
function toast(text) {
  try { toasts.hidePopover(); toasts.showPopover(); } catch {}
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toasts.append(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => {
      el.remove();
      if (!toasts.children.length) { try { toasts.hidePopover(); } catch {} }
    }, 300);
  }, 3200);
}

// ---------- Confetti ----------

const canvas = $("confetti");
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  try { canvas.showPopover(); } catch {}
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = ["#0b8a73", "#1fae8d", "#3b3bff", "#7d7dff", "#f2701c", "#ffd36b"];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 16 - 6,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    c: colors[(Math.random() * colors.length) | 0]
  }));
  const startT = performance.now();
  (function frame(now) {
    const t = now - startT;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (t < 2200) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); try { canvas.hidePopover(); } catch {} }
  })(startT);
}

// ---------- Go ----------

if (me) watchCheers();

// Roll "today" over at midnight if the page stays open.
let lastDay = isoToday();
setInterval(() => { if (isoToday() !== lastDay) { lastDay = isoToday(); renderAll(); } }, 60000);
