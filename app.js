(() => {
  const TOTAL = 75;
  const KEY = "75medium:v2";
  const OLD_KEY = "75medium:days";
  const DAY_MS = 86400000;

  // Icon paths are drawn on a 24x24 grid with a stroke.
  const TASKS = [
    { label: "Stick to your diet",
      icon: "M12 7.5c-1.6-1.4-4.6-1.6-6 .6-1.4 2.2-.6 6.2 1.4 9 1.6 2.3 3.2 2.8 4.6 1.9 1.4.9 3 .4 4.6-1.9 2-2.8 2.8-6.8 1.4-9-1.4-2.2-4.4-2-6-.6zM12 7.5c0-2 .9-3.4 2.8-4" },
    { label: "Exercise for 45 minutes",
      icon: "M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" },
    { label: "Drink water regularly",
      icon: "M12 3.5s6 6.3 6 10.6a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" },
    { label: "No alcohol or weed", note: "Unless it's a social celebration",
      icon: "M8 3.5h8l-.6 5.5a3.4 3.4 0 0 1-6.8 0zM12 12.5v7M8.5 19.5h7M4 4l16 16" },
    { label: "Avoid excessive phone time",
      icon: "M8.5 3h7A1.5 1.5 0 0 1 17 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3zM11 18h2" },
    { label: "Read 6 pages of non-fiction",
      icon: "M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13" },
    { label: "Journal your daily progress",
      icon: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4" }
  ];

  const $ = (id) => document.getElementById(id);
  const svg = (cls, d, box = "0 0 24 24") =>
    `<svg class="${cls}" viewBox="${box}" aria-hidden="true"><path d="${d}"/></svg>`;

  // ---------- State ----------
  // { name, start: "YYYY-MM-DD", days: { "<day>": [bool x 7] } }
  // A day present in `days` has been marked with an X.

  const emptyTasks = () => TASKS.map(() => false);

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (!s || typeof s !== "object") s = {};
    if (!s.days || typeof s.days !== "object") s.days = {};
    // Days crossed off in the first version had no tasks yet.
    try {
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (Array.isArray(old)) {
        old.forEach((d) => { if (!s.days[d]) s.days[d] = emptyTasks(); });
        localStorage.removeItem(OLD_KEY);
      }
    } catch {}
    return s;
  }

  const state = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  const doneCount = (day) => (state.days[day] || []).filter(Boolean).length;
  const status = (day) =>
    !state.days[day] ? "none" : doneCount(day) === TASKS.length ? "complete" : "partial";

  // ---------- Dates ----------

  const parseDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const isoToday = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const dateForDay = (day) => {
    if (!state.start) return null;
    const d = parseDate(state.start);
    d.setDate(d.getDate() + day - 1);
    return d;
  };
  const todayDay = () =>
    state.start ? Math.round((parseDate(isoToday()) - parseDate(state.start)) / DAY_MS) + 1 : 0;
  const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);

  // ---------- Stats ----------

  function stats() {
    let complete = 0, best = 0, run = 0;
    for (let d = 1; d <= TOTAL; d++) {
      if (status(d) === "complete") { complete++; run++; best = Math.max(best, run); }
      else run = 0;
    }
    // Current streak counts back from today, or from yesterday while today is still open.
    const t = Math.min(todayDay(), TOTAL);
    let streak = 0;
    let d = status(t) === "complete" ? t : t - 1;
    while (d >= 1 && status(d) === "complete") { streak++; d--; }
    return { complete, best, streak };
  }

  // ---------- Calendar ----------

  const grid = $("grid");
  const cells = [];
  for (let day = 1; day <= TOTAL; day++) {
    const li = document.createElement("li");
    li.style.setProperty("--i", day);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    btn.dataset.day = day;
    btn.innerHTML =
      `<span class="num">${day}</span><span class="tag">${day}</span>` +
      svg("x", "M6 6 L18 18 M18 6 L6 18") +
      svg("tick", "M5 12.5 L10 17 L19 7");
    li.append(btn);
    grid.append(li);
    cells.push(btn);
  }

  function renderWeekdays() {
    const first = state.start ? parseDate(state.start) : new Date(2024, 0, 1); // a Monday
    const labels = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(first);
      d.setDate(d.getDate() + i);
      labels.push(`<li>${fmt(d, { weekday: "short" }).slice(0, 3)}</li>`);
    }
    $("weekdays").innerHTML = labels.join("");
  }

  function renderDay(day) {
    const btn = cells[day - 1];
    const s = status(day);
    const t = todayDay();
    btn.classList.toggle("complete", s === "complete");
    btn.classList.toggle("partial", s === "partial");
    btn.classList.toggle("today", day === t);
    btn.classList.toggle("future", Boolean(s === "none" && state.start && day > t));
    btn.classList.toggle("missed", Boolean(s === "none" && state.start && day < t));

    const date = dateForDay(day);
    let label = `Day ${day}`;
    if (date) label += `, ${fmt(date, { weekday: "long", month: "long", day: "numeric" })}`;
    if (s === "complete") label += ", complete";
    else if (s === "partial") label += `, ${doneCount(day)} of ${TASKS.length} tasks done`;
    else if (btn.classList.contains("missed")) label += ", missed";
    btn.setAttribute("aria-label", label);
  }

  // ---------- Summary panels ----------

  function renderSummary() {
    const { complete, best, streak } = stats();
    const pct = Math.round((complete / TOTAL) * 100);
    $("ring-fill").style.strokeDashoffset = 326.73 * (1 - complete / TOTAL);
    $("ring-pct").textContent = `${pct}%`;
    $("ring").setAttribute("aria-label", `${complete} of ${TOTAL} days complete`);
    $("stat-complete").textContent = complete;
    $("stat-streak").textContent = streak;
    $("stat-best").textContent = best;
    $("stat-left").textContent = TOTAL - complete;
    $("finish").hidden = complete < TOTAL;
    renderToday();
  }

  function renderProfile() {
    if (!state.name) return;
    $("edit-profile").hidden = false;
    $("profile-name").textContent = state.name;
    $("avatar").textContent = state.name.charAt(0).toUpperCase();

    const t = todayDay();
    const start = parseDate(state.start);
    const end = dateForDay(TOTAL);
    const short = { month: "short", day: "numeric" };

    if (t < 1) {
      $("kicker").textContent = `Starts in ${1 - t} day${1 - t === 1 ? "" : "s"}`;
      $("headline").innerHTML = `Get ready, <em></em>`;
    } else if (t > TOTAL) {
      $("kicker").textContent = "Challenge finished";
      $("headline").innerHTML = `Well done, <em></em>`;
    } else {
      $("kicker").textContent = `Day ${t} of ${TOTAL}`;
      $("headline").innerHTML = `Keep going, <em></em>`;
    }
    $("headline").querySelector("em").textContent = `${state.name}.`;
    $("subline").textContent = `${fmt(start, short)} – ${fmt(end, { ...short, year: "numeric" })}`;
  }

  function renderToday() {
    const t = todayDay();
    const open = $("today-open");
    const count = $("today-count");
    const pips = $("today-pips");
    open.classList.remove("is-complete");

    if (!state.start || t < 1 || t > TOTAL) {
      $("today-kicker").textContent = "Today";
      $("today-title").textContent = !state.start ? "Not started"
        : t < 1 ? `Day 1 is ${fmt(parseDate(state.start), { weekday: "long", month: "long", day: "numeric" })}`
        : "All 75 days are behind you";
      count.textContent = "";
      pips.innerHTML = "";
      open.disabled = true;
      open.textContent = t > TOTAL ? "Challenge over" : "Not yet";
      return;
    }

    const n = doneCount(t);
    const done = state.days[t] || [];
    $("today-kicker").textContent = `Today · ${fmt(new Date(), { weekday: "long", month: "short", day: "numeric" })}`;
    $("today-title").textContent = `Day ${t}`;
    count.textContent = state.days[t] ? `${n}/${TASKS.length}` : "";
    count.classList.toggle("all", n === TASKS.length);
    pips.innerHTML = TASKS.map((_, i) => `<li class="${done[i] ? "on" : ""}"></li>`).join("");
    open.disabled = false;
    if (n === TASKS.length) {
      open.textContent = "Today is complete";
      open.classList.add("is-complete");
    } else {
      open.textContent = n ? "Continue today's tasks" : "Log today's tasks";
    }
  }

  function renderAll() {
    renderWeekdays();
    for (let d = 1; d <= TOTAL; d++) renderDay(d);
    renderProfile();
    renderSummary();
  }

  // ---------- Day sheet ----------

  const sheet = $("day-sheet");
  const tasksEl = $("tasks");
  let openDay = 0;

  tasksEl.innerHTML = TASKS.map((task, i) =>
    `<li><button type="button" class="task" role="checkbox" aria-checked="false" data-index="${i}">` +
      `<span class="task-icon">${svg("", task.icon)}</span>` +
      `<span class="task-text"><span class="task-label">${task.label}</span>` +
      (task.note ? `<span class="task-note">${task.note}</span>` : "") +
      `</span><span class="check">${svg("", "M5 12.5 L10 17 L19 7")}</span>` +
    `</button></li>`
  ).join("");
  const taskBtns = [...tasksEl.querySelectorAll(".task")];

  function renderSheet() {
    const day = openDay;
    const n = doneCount(day);
    const all = n === TASKS.length;
    const date = dateForDay(day);
    $("day-title").textContent = `Day ${day}`;
    $("day-date").textContent = date ? fmt(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
    $("mini-count").textContent = n;
    $("mini-fill").style.strokeDashoffset = 113.1 * (1 - n / TASKS.length);
    $("mini-ring").classList.toggle("all", all);
    const st = $("day-status");
    st.textContent = all ? "All seven done. This day is complete."
      : `${TASKS.length - n} task${TASKS.length - n === 1 ? "" : "s"} left to complete this day`;
    st.classList.toggle("all", all);
    taskBtns.forEach((b, i) => b.setAttribute("aria-checked", String(!!state.days[day][i])));
  }

  function openSheet(day) {
    openDay = day;
    if (!state.days[day]) {
      state.days[day] = emptyTasks();
      save();
      renderDay(day);
      renderSummary();
    }
    renderSheet();
    sheet.showModal();
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".day");
    if (btn) openSheet(Number(btn.dataset.day));
  });

  $("today-open").addEventListener("click", () => openSheet(todayDay()));

  tasksEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".task");
    if (!btn) return;
    const i = Number(btn.dataset.index);
    const before = status(openDay);
    state.days[openDay][i] = !state.days[openDay][i];
    save();
    renderSheet();
    renderDay(openDay);
    renderSummary();
    navigator.vibrate?.(8);
    if (before !== "complete" && status(openDay) === "complete") {
      navigator.vibrate?.([12, 40, 12]);
      confetti();
    }
  });

  const closeSheet = () => sheet.close();
  $("day-done").addEventListener("click", closeSheet);
  $("day-close").addEventListener("click", closeSheet);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

  $("day-clear").addEventListener("click", () => {
    delete state.days[openDay];
    save();
    renderDay(openDay);
    renderSummary();
    closeSheet();
  });

  sheet.addEventListener("close", () => {
    const cell = cells[openDay - 1];
    if (!cell) return;
    cell.focus({ preventScroll: true });
    cell.classList.remove("bump");
    void cell.offsetWidth;
    cell.classList.add("bump");
  });

  // ---------- Setup ----------

  const setup = $("setup");

  function openSetup() {
    const first = !state.name;
    $("setup-title").innerHTML = first ? "Start your <em>75 Medium</em>" : "Your <em>details</em>";
    $("setup-submit").textContent = first ? "Let's go" : "Save";
    $("name").value = state.name || "";
    $("start").value = state.start || isoToday();
    setup.showModal();
  }

  $("setup-form").addEventListener("submit", () => {
    state.name = $("name").value.trim();
    state.start = $("start").value;
    save();
    renderAll();
  });

  // The first-visit setup can't be dismissed until it's filled in.
  setup.addEventListener("cancel", (e) => { if (!state.name) e.preventDefault(); });
  setup.addEventListener("click", (e) => { if (e.target === setup && state.name) setup.close(); });

  $("edit-profile").addEventListener("click", openSetup);

  $("reset").addEventListener("click", () => {
    if (!Object.keys(state.days).length) return;
    if (!confirm("Clear all 75 days? Your name and start date stay.")) return;
    state.days = {};
    save();
    renderAll();
  });

  // ---------- Confetti ----------

  const canvas = $("confetti");
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    try { canvas.showPopover(); } catch {}
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
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

  renderAll();
  if (!state.name || !state.start) openSetup();

  // Roll "today" over at midnight if the page stays open.
  let lastDay = isoToday();
  setInterval(() => { if (isoToday() !== lastDay) { lastDay = isoToday(); renderAll(); } }, 60000);
})();
