/* Логика подсчёта. Никакого DOM: только данные -> числа.
   Всё (проценты, часы, стрики, отчёты) считается из списка записей (entries),
   вручную ничего не хранится. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  /* ---------- даты (ключ дня: "2026-11-09", местное время) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return dateKey(new Date()); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function weekStart(k) { var d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); }
  function monthStart(k) { return k.slice(0, 7) + '-01'; }
  function monthEnd(k) { var d = parseKey(k); return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  function range(from, to) {
    var out = [], k = from, guard = 0;
    while (k <= to && guard++ < 4000) { out.push(k); k = addDays(k, 1); }
    return out;
  }
  function maxKey(a, b) { return a > b ? a : b; }
  function minKey(a, b) { return a < b ? a : b; }

  /* ---------- форматирование ---------- */
  function fmtMin(m) {
    m = Math.round(m);
    var h = Math.floor(m / 60), r = m % 60;
    if (h === 0) return r + ' мин';
    return h + ' ч ' + pad(r) + ' мин';
  }
  function fmtPct(p) { return Math.round(p) + '%'; }
  function dayLabel(k) {
    var d = parseKey(k);
    return WEEKDAYS[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS_S[d.getMonth()];
  }

  /* ---------- индекс записей: день -> активность -> {n, m, tags} ---------- */
  function index(entries) {
    var idx = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var day = idx[e.d] || (idx[e.d] = {});
      var rec = day[e.a] || (day[e.a] = { n: 0, m: 0, tags: {} });
      rec.n += e.n;
      rec.m += e.m;
      var tg = e.tag || '';
      var t = rec.tags[tg] || (rec.tags[tg] = { n: 0, m: 0 });
      t.n += e.n;
      t.m += e.m;
    }
    return idx;
  }
  function rec(idx, day, actId) {
    var d = idx[day];
    return (d && d[actId]) || { n: 0, m: 0, tags: {} };
  }

  /* ---------- один день ---------- */
  function isRequired(a, day) {
    return a.period === 'day' && a.required !== false && !a.archived && a.from <= day;
  }

  // true — все обязательные выполнены, false — нет, null — обязательных в этот день не было
  function dayComplete(state, idx, day) {
    var total = 0, done = 0;
    for (var i = 0; i < state.activities.length; i++) {
      var a = state.activities[i];
      if (!isRequired(a, day)) continue;
      total++;
      if (rec(idx, day, a.id).n >= a.goal) done++;
    }
    if (total === 0) return null;
    return done === total;
  }

  function weekCount(idx, act, day) {
    var s = weekStart(day), n = 0;
    for (var i = 0; i < 7; i++) n += rec(idx, addDays(s, i), act.id).n;
    return n;
  }

  function dayInfo(state, idx, day) {
    var rows = [], reqTotal = 0, reqDone = 0, minutes = 0;
    for (var i = 0; i < state.activities.length; i++) {
      var a = state.activities[i];
      var r = rec(idx, day, a.id);
      minutes += r.m;
      if (isRequired(a, day)) { reqTotal++; if (r.n >= a.goal) reqDone++; }
      if (a.archived && !r.n && !r.m) continue;
      if (a.from > day && !r.n && !r.m) continue; // активность ещё не существовала
      rows.push({
        act: a, n: r.n, m: r.m, tags: r.tags,
        pct: a.goal > 0 ? (r.n / a.goal) * 100 : 0,
        weekN: a.period === 'week' ? weekCount(idx, a, day) : null
      });
    }
    return { rows: rows, reqTotal: reqTotal, reqDone: reqDone, minutes: minutes, complete: reqTotal === 0 ? null : reqDone === reqTotal };
  }

  /* ---------- стрики ---------- */
  function earliest(state, idx) {
    var e = null, i;
    for (i = 0; i < state.activities.length; i++) { var f = state.activities[i].from; if (f && (e === null || f < e)) e = f; }
    for (var d in idx) if (e === null || d < e) e = d;
    return e;
  }

  function streaks(state, idx, todayKey) {
    var cur = 0, d = todayKey, c = dayComplete(state, idx, d);
    if (c !== true) d = addDays(d, -1); // сегодня ещё не закончился — стрик не рвём
    var guard = 0;
    while (guard++ < 4000 && dayComplete(state, idx, d) === true) { cur++; d = addDays(d, -1); }
    var best = 0, run = 0, start = earliest(state, idx);
    if (start) {
      var all = range(start, todayKey);
      for (var i = 0; i < all.length; i++) {
        var r = dayComplete(state, idx, all[i]);
        if (r === true) { run++; if (run > best) best = run; }
        else if (all[i] === todayKey && r === false) { /* сегодня не закончен */ }
        else run = 0;
      }
    }
    if (cur > best) best = cur;
    return { current: cur, best: best };
  }

  /* ---------- отчёт за период ---------- */
  function emptyAgg() { return { minutes: 0, pctSum: 0, capped: 0, expected: 0 }; }

  function report(state, idx, from, to, todayKey) {
    var end = minKey(to, todayKey);
    var days = from <= end ? range(from, end) : [];
    var singleDay = from === to;
    var acts = [];
    var kinds = { study: emptyAgg(), habit: emptyAgg(), all: emptyAgg() };

    for (var i = 0; i < state.activities.length; i++) {
      var a = state.activities[i];
      var n = 0, m = 0, tags = {}, daysDone = 0, applicable = 0, capped = 0, expected = 0;
      var lvl = { 2: 0, 3: 0, 5: 0 }, weeks = [];

      for (var j = 0; j < days.length; j++) {
        var d = days[j], r = rec(idx, d, a.id);
        n += r.n; m += r.m;
        for (var tg in r.tags) {
          var t = tags[tg] || (tags[tg] = { n: 0, m: 0 });
          t.n += r.tags[tg].n; t.m += r.tags[tg].m;
        }
        if (a.period === 'day' && d >= a.from) {
          applicable++;
          expected += a.goal;
          capped += Math.min(r.n, a.goal);
          if (r.n >= a.goal) daysDone++;
          [2, 3, 5].forEach(function (L) { if (r.n >= a.goal * L) lvl[L]++; });
        }
      }

      if (a.period === 'week' && !singleDay && days.length) {
        var ws = weekStart(from);
        while (ws <= end) {
          var we = addDays(ws, 6), wn = 0;
          for (var k = 0; k < 7; k++) wn += rec(idx, addDays(ws, k), a.id).n;
          if (we >= a.from) {
            weeks.push({ start: ws, n: wn, goal: a.goal, done: wn >= a.goal });
            expected += a.goal;
            capped += Math.min(wn, a.goal);
          }
          ws = addDays(ws, 7);
        }
      }

      if (a.archived && !n && !m) continue;
      if (a.from > end && !n && !m) continue;

      var pctSum = a.goal > 0 ? (n / a.goal) * 100 : 0;
      var item = {
        act: a, n: n, m: m, tags: tags,
        pctSum: pctSum,                                   // «суммарно %»: 21 блок при цели 1 = 2100%
        completion: expected > 0 ? (capped / expected) * 100 : null, // выполнение нормы, максимум 100%
        avgPct: applicable > 0 ? pctSum / applicable : null,         // средний процент в день
        daysDone: daysDone, applicable: applicable, levels: lvl, weeks: weeks,
        weekN: (a.period === 'week' && singleDay) ? weekCount(idx, a, from) : null
      };
      acts.push(item);

      [a.kind, 'all'].forEach(function (key) {
        var g = kinds[key];
        g.minutes += m; g.pctSum += pctSum; g.capped += capped; g.expected += expected;
      });
    }

    for (var key in kinds) kinds[key].completion = kinds[key].expected > 0 ? (kinds[key].capped / kinds[key].expected) * 100 : null;

    // дни, когда выполнен весь минимум
    var okDays = 0, reqDays = 0;
    for (var q = 0; q < days.length; q++) {
      var c = dayComplete(state, idx, days[q]);
      if (c === null) continue;
      reqDays++;
      if (c) okDays++;
    }

    return { from: from, to: to, end: end, days: days.length, acts: acts, kinds: kinds, okDays: okDays, reqDays: reqDays };
  }

  /* ---------- ряд для графика ---------- */
  function series(state, idx, from, to, kind, mode) {
    var acts = state.activities.filter(function (a) { return kind === 'all' || a.kind === kind; });
    var buckets = [], i;
    if (mode === 'day') {
      range(from, to).forEach(function (d) { buckets.push({ key: d, from: d, to: d }); });
    } else {
      var s = weekStart(from);
      while (s <= to) { buckets.push({ key: s, from: s, to: addDays(s, 6) }); s = addDays(s, 7); }
      if (buckets.length > 30) buckets = buckets.slice(buckets.length - 30);
    }
    var used = {};
    buckets.forEach(function (b) {
      b.parts = {}; b.total = 0;
      range(maxKey(b.from, from), minKey(b.to, to)).forEach(function (d) {
        for (i = 0; i < acts.length; i++) {
          var r = rec(idx, d, acts[i].id);
          if (r.m > 0) {
            b.parts[acts[i].id] = (b.parts[acts[i].id] || 0) + r.m;
            b.total += r.m;
            used[acts[i].id] = true;
          }
        }
      });
    });
    return { buckets: buckets, acts: acts.filter(function (a) { return used[a.id]; }) };
  }

  /* ---------- навигация по периодам ---------- */
  function periodRange(type, anchor, state, idx, todayKey) {
    if (type === 'day') return { from: anchor, to: anchor };
    if (type === 'week') { var s = weekStart(anchor); return { from: s, to: addDays(s, 6) }; }
    if (type === 'month') return { from: monthStart(anchor), to: monthEnd(anchor) };
    return { from: earliest(state, idx) || todayKey, to: todayKey };
  }
  function shiftAnchor(type, anchor, dir) {
    if (type === 'day') return addDays(anchor, dir);
    if (type === 'week') return addDays(anchor, 7 * dir);
    if (type === 'month') { var d = parseKey(monthStart(anchor)); d.setMonth(d.getMonth() + dir); return dateKey(d); }
    return anchor;
  }
  function periodLabel(type, anchor, from, to) {
    if (type === 'day') return dayLabel(anchor);
    if (type === 'week') {
      var a = parseKey(from), b = parseKey(to);
      return a.getDate() + (a.getMonth() !== b.getMonth() ? ' ' + MONTHS_S[a.getMonth()] : '') + ' – ' + b.getDate() + ' ' + MONTHS_S[b.getMonth()];
    }
    if (type === 'month') { var m = parseKey(anchor); return MONTHS[m.getMonth()] + ' ' + m.getFullYear(); }
    return 'За всё время';
  }

  return {
    MONTHS: MONTHS, MONTHS_S: MONTHS_S, WEEKDAYS: WEEKDAYS,
    pad: pad, dateKey: dateKey, parseKey: parseKey, today: today, addDays: addDays,
    weekStart: weekStart, monthStart: monthStart, monthEnd: monthEnd, range: range,
    fmtMin: fmtMin, fmtPct: fmtPct, dayLabel: dayLabel,
    index: index, rec: rec, dayComplete: dayComplete, dayInfo: dayInfo, weekCount: weekCount,
    streaks: streaks, report: report, series: series,
    periodRange: periodRange, shiftAnchor: shiftAnchor, periodLabel: periodLabel
  };
});
