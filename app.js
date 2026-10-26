/* Due Date — calendar-day arithmetic on day numbers (no Date maths), so time zones and DST never shift a day. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$, h = S3.h;
  var KEY = "duedate.v1";

  // ---------- day numbers (days since 1970-01-01) ----------
  function isLeap(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
  function dim(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function dfc(o) {
    var y = o.y - (o.m <= 2 ? 1 : 0), era = Math.floor(y / 400), yoe = y - era * 400;
    var doy = Math.floor((153 * (o.m + (o.m > 2 ? -3 : 9)) + 2) / 5) + o.d - 1;
    return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  }
  function cfd(z) {
    z += 719468;
    var era = Math.floor(z / 146097), doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
    var m = mp + (mp < 10 ? 3 : -9);
    return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m: m, d: doy - Math.floor((153 * mp + 2) / 5) + 1 };
  }
  function parse(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); if (!m) return null;
    var o = { y: +m[1], m: +m[2], d: +m[3] };
    return o.m >= 1 && o.m <= 12 && o.d >= 1 && o.d <= dim(o.y, o.m) ? dfc(o) : null;
  }
  function iso(z) { var o = cfd(z); return o.y + "-" + String(o.m).padStart(2, "0") + "-" + String(o.d).padStart(2, "0"); }
  function asDate(z) { var o = cfd(z), d = new Date(0); d.setUTCFullYear(o.y, o.m - 1, o.d); return d; }
  function nice(z, short) { return Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: short ? undefined : "long", day: "numeric", month: short ? "short" : "long", year: "numeric" }).format(asDate(z)); }
  function hijri(z, loc) {
    try { return Intl.DateTimeFormat((loc || "en") + "-u-ca-islamic-umalqura", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(asDate(z)); }
    catch (e) { return ""; }
  }
  function today() { var t = new Date(); return dfc({ y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }); }

  // ---------- pregnancy maths (tested) ----------
  // Returns the "gestational start" (equivalent first day of last period, cycle-adjusted) and the due date.
  function estimate(method, z, cycle, ivfDay) {
    var start;
    if (method === "lmp") start = z + (cycle - 28);          // Naegele's rule with cycle adjustment
    else if (method === "conception") start = z - 14;
    else start = z - 14 - ivfDay;                               // embryo was conceived ivfDay days before transfer
    return { start: start, due: start + 280, conception: start + 14 };
  }
  function progress(start, now) {
    var d = now - start, wk = Math.floor(d / 7);
    return { days: d, weeks: wk, rest: d - wk * 7, tri: d < 0 ? 0 : wk < 14 ? 1 : wk < 28 ? 2 : 3, left: 280 - d };
  }
  var MILESTONES = [
    [4, 0, "A home pregnancy test can usually turn positive around now"],
    [6, 0, "A heartbeat can often be seen on an early ultrasound (weeks 6–7)"],
    [8, 0, "First prenatal visit is commonly booked between weeks 8 and 10"],
    [11, 0, "First-trimester screening window (nuchal scan, weeks 11–13+6)"],
    [14, 0, "Second trimester begins"],
    [16, 0, "Some people start to feel first movements (weeks 16–22)"],
    [18, 0, "Detailed anatomy scan window (weeks 18–22)"],
    [24, 0, "Glucose screening for gestational diabetes is often done (weeks 24–28)"],
    [28, 0, "Third trimester begins"],
    [32, 0, "Growth checks and more frequent visits are common from here"],
    [37, 0, "Early term"],
    [39, 0, "Full term"],
    [40, 0, "Estimated due date"],
    [41, 0, "Late term"],
    [42, 0, "Post-term: care teams usually plan delivery before now"]
  ];

  // ---------- UI ----------
  var st = Object.assign({ method: "lmp", date: "", cycle: 28, ivf: 5, hijri: false }, S3.store(KEY) || {});
  if (["lmp", "conception", "ivf"].indexOf(st.method) < 0) st.method = "lmp";
  st.cycle = st.cycle >= 20 && st.cycle <= 45 ? Math.round(st.cycle) : 28;
  st.ivf = st.ivf === 3 ? 3 : 5;
  st.date = parse(st.date) != null ? st.date : "";
  var text = "";

  var LABEL = { lmp: "First day of your last period", conception: "Conception date", ivf: "Embryo transfer date" };
  var HOW = {
    lmp: "Due date = first day of last period + 280 days, adjusted by your cycle length minus 28.",
    conception: "Due date = conception date + 266 days (38 weeks).",
    ivf: "Due date = transfer date + 266 days − the embryo's age (261 days for a day-5 transfer, 263 for day 3)."
  };
  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === String(value)));
      b.addEventListener("click", function () { $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); onPick(b.dataset.v); });
    });
  }
  function stat(label, value) { return h("div", { "class": "stat" }, [h("b", { text: value }), h("span", { text: label })]); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  function render() {
    S3.store(KEY, st);
    $("#dateLbl").textContent = LABEL[st.method];
    $("#how").textContent = HOW[st.method];
    $("#cycleWrap").hidden = st.method !== "lmp";
    $("#ivfWrap").hidden = st.method !== "ivf";
    var z = parse(st.date), res = $("#res"), stats = $("#stats"), tl = $("#tl");
    res.textContent = ""; stats.textContent = ""; tl.textContent = ""; text = "";
    $("#bar").hidden = $("#barLbl").hidden = true;
    if (z == null) {
      res.appendChild(h("div", { "class": "empty" }, [h("b", { text: "Pick a date" }), "Your estimated due date will appear here."]));
      tl.appendChild(h("li", { "class": "faint", text: "The timeline appears once you pick a date." }));
      $("#kv").textContent = "";
      return;
    }
    var e = estimate(st.method, z, st.cycle, st.ivf), now = today(), p = progress(e.start, now);
    res.appendChild(h("span", { "class": "dd-k", text: "Estimated due date" }));
    res.appendChild(h("b", { text: nice(e.due) }));
    if (st.hijri) res.appendChild(h("span", { "class": "dd-ar", lang: "ar", dir: "rtl", text: hijri(e.due, "ar-SA") }));
    var status;
    if (p.days < 0) status = "That date is in the future. Check the date you entered.";
    else if (p.days > 301) status = "This due date has passed.";
    else status = "Today you are " + plural(p.weeks, "week") + " and " + plural(p.rest, "day") + " (" + p.weeks + "+" + p.rest + ").";
    res.appendChild(h("span", { "class": "dd-sub", text: status }));

    if (p.days >= 0 && p.days <= 301) {
      $("#bar").hidden = $("#barLbl").hidden = false;
      $("#fill").style.width = Math.min(100, p.days / 280 * 100).toFixed(1) + "%";
      stats.appendChild(stat("weeks + days", p.weeks + "+" + p.rest));
      stats.appendChild(stat("trimester", ["", "1st", "2nd", "3rd"][p.tri]));
      stats.appendChild(stat(p.left >= 0 ? "days to go" : "days past due", String(Math.abs(p.left))));
      stats.appendChild(stat("of 40 weeks", Math.min(100, Math.round(p.days / 280 * 100)) + "%"));
    }
    var kv = $("#kv"); kv.textContent = "";
    [["Conception (estimate)", e.conception], ["Full term from", e.start + 259], ["Equivalent last period", e.start]].forEach(function (x) {
      kv.appendChild(h("div", {}, [h("span", { text: x[0] }), h("b", { text: nice(x[1], true) })]));
    });

    var nextShown = false;
    MILESTONES.forEach(function (m) {
      var dz = e.start + m[0] * 7 + m[1], past = dz <= now && p.days >= 0, isNext = !past && !nextShown && p.days >= 0;
      if (isNext) nextShown = true;
      tl.appendChild(h("li", { "class": (past ? "past" : "") + (isNext ? " next" : "") + (m[0] === 40 ? " due" : "") }, [
        h("span", { "class": "dd-wk", text: "Week " + m[0] }),
        h("span", { "class": "dd-date" }, [h("b", { text: nice(dz, true) }), st.hijri ? h("small", { text: hijri(dz) }) : null]),
        h("span", { "class": "dd-what", text: m[2] })
      ]));
    });
    text = "Estimated due date: " + nice(e.due) + (st.hijri ? " (" + hijri(e.due) + ")" : "") +
      (p.days >= 0 && p.days <= 301 ? "\nToday: " + p.weeks + " weeks " + p.rest + " days, trimester " + p.tri : "") +
      "\nEstimated conception: " + nice(e.conception) + "\n(" + HOW[st.method] + " Estimate only, not medical advice.)";
  }

  seg($("#method"), st.method, function (v) { st.method = v; render(); });
  seg($("#ivfDay"), st.ivf, function (v) { st.ivf = +v; render(); });
  $("#date").value = st.date;
  $("#date").addEventListener("input", function (e) { st.date = e.target.value; render(); });
  function setCycle(v, from) {
    var n = parseInt(String(v).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; }), 10);
    if (!(n >= 20 && n <= 45)) return;
    st.cycle = n; if (from !== "r") $("#cycleR").value = n; if (from !== "i") $("#cycle").value = n; render();
  }
  $("#cycleR").value = st.cycle; $("#cycle").value = st.cycle;
  $("#cycleR").addEventListener("input", function (e) { setCycle(e.target.value, "r"); });
  $("#cycle").addEventListener("input", function (e) { setCycle(e.target.value, "i"); });
  $("#cycle").addEventListener("blur", function (e) { e.target.value = st.cycle; });
  $("#hijri").checked = !!st.hijri;
  $("#hijri").addEventListener("change", function (e) { st.hijri = e.target.checked; render(); });
  $("#copy").addEventListener("click", function () { if (!text) return S3.toast("Pick a date first", "error"); S3.copy(text); S3.done(); });
  render();

  window.S3_DEMO = function () {
    st.method = "lmp"; st.cycle = 28; st.hijri = true; st.date = iso(today() - 150);
    $("#date").value = st.date; $("#hijri").checked = true; $("#cycleR").value = 28; $("#cycle").value = 28;
    $("#method button[data-v=lmp]").click();
  };

  window.S3_SELFTEST = function () {
    var a = estimate("lmp", parse("2026-01-01"), 28, 5);
    var b = estimate("lmp", parse("2026-01-01"), 32, 5);
    var c = estimate("conception", parse("2026-01-15"), 28, 5);
    var d5 = estimate("ivf", parse("2026-01-20"), 28, 5), d3 = estimate("ivf", parse("2026-01-20"), 28, 3);
    var p = progress(parse("2026-01-01"), parse("2026-03-01")), q = progress(0, 98), r = progress(0, 196);
    return iso(a.due) === "2026-10-08" && iso(a.conception) === "2026-01-15" && iso(b.due) === "2026-10-12" &&
      iso(c.due) === "2026-10-08" && d5.due - parse("2026-01-20") === 261 && d3.due - parse("2026-01-20") === 263 &&
      p.days === 59 && p.weeks === 8 && p.rest === 3 && p.tri === 1 && q.tri === 2 && r.tri === 3 &&
      iso(parse("2024-02-29") + 365) === "2025-02-28" && parse("2026-02-30") === null &&
      hijri(parse("2000-01-01")).indexOf("1420") >= 0;
  };
})();
