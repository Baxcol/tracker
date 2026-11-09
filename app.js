/* Интерфейс. Данные хранятся на телефоне (localStorage), сервера нет.
   Вся математика живёт в logic.js, здесь только показ и ввод. */
(function () {
  'use strict';
  const L = window.Logic;
  const KEY = 'habitstudy.v1';
  const TKEY = 'habitstudy.timer.v1';
  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6', '#84cc16', '#f97316'];
  const KIND = { study: 'Учёба', habit: 'Привычки' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------------- данные ---------------- */
  function seed() {
    const t = L.today();
    const A = (name, kind, block, goal, period, color, tags) => ({
      id: uid(), name, kind, block, goal, period, tags: tags || [], color, from: t, required: period === 'day', archived: false
    });
    return {
      v: 1,
      activities: [
        A('Английский', 'study', 40, 1, 'day', COLORS[0], ['Чтение (комиксы)', 'Просмотр сериала', 'Активный вывод', 'Грамматика', 'Мини-игра', 'Карточки слов']),
        A('Программирование', 'study', 40, 1, 'day', COLORS[4], ['freeCodeCamp', 'Codewars', 'Теория', 'Документация']),
        A('Зарядка для тела', 'habit', 20, 1, 'day', COLORS[3]),
        A('Гимнастика для глаз', 'habit', 3, 1, 'day', COLORS[5]),
        A('ДСМ (тишина)', 'habit', 20, 1, 'day', COLORS[2]),
        A('Чистка зубов', 'habit', 3, 2, 'day', COLORS[6]),
        A('Тяжёлый спорт', 'habit', 40, 3, 'week', COLORS[1])
      ],
      entries: [],
      settings: { theme: 'auto', lastTag: {} }
    };
  }

  function valid(s) {
    return s && Array.isArray(s.activities) && Array.isArray(s.entries) &&
      s.activities.every((a) => a && a.id && a.name && a.block > 0 && a.goal > 0 && (a.period === 'day' || a.period === 'week')) &&
      s.entries.every((e) => e && e.a && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && typeof e.n === 'number' && typeof e.m === 'number');
  }

  function normalize(s) {
    s.settings = s.settings || {};
    s.settings.theme = s.settings.theme || 'auto';
    s.settings.lastTag = s.settings.lastTag || {};
    s.activities.forEach((a) => {
      a.tags = Array.isArray(a.tags) ? a.tags : [];
      a.from = a.from || L.today();
      a.kind = a.kind === 'habit' ? 'habit' : 'study';
      a.color = a.color || COLORS[0];
    });
    s.entries.forEach((e) => { e.tag = e.tag || ''; e.t = e.t || 0; e.id = e.id || uid(); });
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (valid(s)) return normalize(s);
      }
    } catch (e) { /* ниже создадим новые данные */ }
    return normalize(seed());
  }

  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Не удалось сохранить данные! Сделай экспорт в настройках.'); }
  }
  if (!localStorage.getItem(KEY)) save();

  const actById = (id) => state.activities.find((a) => a.id === id);

  const ui = { tab: 'today', day: L.today(), period: 'week', anchor: L.today(), chartKind: 'all', sheet: null };

  /* ---------------- действия с записями ---------------- */
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) { /* не страшно */ } }

  function addEntry(actId, tag, n, minutes, day) {
    const a = actById(actId);
    if (!a) return;
    const t = day === L.today() ? Date.now() : L.parseKey(day).getTime() + 12 * 3600 * 1000;
    state.entries.push({ id: uid(), a: actId, d: day, t: t, n: n, m: minutes != null ? minutes : n * a.block, tag: tag || '' });
    if (tag) state.settings.lastTag[actId] = tag;
    save(); buzz(); render();
  }

  // нажатие «+»: если у активности есть темы, сначала спросим тему
  function startAdd(actId, n, day) {
    const a = actById(actId);
    if (a.tags.length) { ui.sheet = { type: 'tag', id: actId, n: n, day: day }; render(); }
    else addEntry(actId, '', n, null, day);
  }

  function undoLast(actId) {
    const list = state.entries.filter((e) => e.a === actId && e.d === ui.day).sort((x, y) => y.t - x.t);
    if (list.length) deleteEntry(list[0].id);
  }

  function deleteEntry(id) {
    const i = state.entries.findIndex((e) => e.id === id);
    if (i < 0) return;
    const gone = state.entries.splice(i, 1)[0];
    save(); render();
    toast('Запись удалена', 'Вернуть', () => { state.entries.push(gone); save(); render(); });
  }

  /* ---------------- таймер ---------------- */
  let tickId = null, buzzedFor = null;
  function getTimer() { try { const t = JSON.parse(localStorage.getItem(TKEY)); return t && t.a && t.start ? t : null; } catch (e) { return null; } }
  function setTimer(t) { try { if (t) localStorage.setItem(TKEY, JSON.stringify(t)); else localStorage.removeItem(TKEY); } catch (e) { /* не страшно */ } }

  function renderTimer() {
    const el = $('timerbar'), t = getTimer(), a = t && actById(t.a);
    if (!t || !a) {
      if (t && !a) setTimer(null);
      el.innerHTML = ''; el.className = '';
      if (tickId) { clearInterval(tickId); tickId = null; }
      document.title = 'Привычки и учёба';
      return;
    }
    el.className = 'on';
    el.innerHTML = `<div class="tb" id="tb"><span class="dot" style="--c:#fff"></span>
      <div class="txt"><b>${esc(a.name)}</b><small id="tsub"></small></div>
      <div class="tt" id="tt"></div>
      <button class="btn" data-a="timer-done">Готово</button>
      <button class="x" data-a="timer-cancel" aria-label="Отменить таймер">✕</button></div>`;
    tick();
    if (!tickId) tickId = setInterval(tick, 1000);
  }

  function tick() {
    const t = getTimer(), a = t && actById(t.a), tt = $('tt');
    if (!t || !a || !tt) return;
    const s = Math.floor((Date.now() - t.start) / 1000), total = a.block * 60, rem = total - s;
    const mm = (x) => L.pad(Math.floor(x / 60)) + ':' + L.pad(x % 60);
    if (rem > 0) {
      tt.textContent = mm(rem);
      $('tsub').textContent = 'до подхода (' + a.block + ' мин)';
      $('tb').classList.remove('ready');
    } else {
      tt.textContent = '+' + mm(-rem);
      $('tsub').textContent = 'подход набран — жми «Готово»';
      $('tb').classList.add('ready');
      if (buzzedFor !== t.start) { buzzedFor = t.start; buzz(400); }
    }
    document.title = (rem > 0 ? mm(rem) : '✓') + ' · ' + a.name;
  }

  function startTimer(actId) {
    if (getTimer()) { toast('Таймер уже запущен'); return; }
    setTimer({ a: actId, start: Date.now(), day: ui.day });
    renderTimer();
  }

  function finishTimer() {
    const t = getTimer(), a = t && actById(t.a);
    if (!t || !a) { setTimer(null); renderTimer(); return; }
    const minutes = Math.floor((Date.now() - t.start) / 60000);
    const blocks = Math.floor(minutes / a.block);
    if (blocks >= 1) { setTimer(null); renderTimer(); startAdd(a.id, blocks, t.day); }
    else { ui.sheet = { type: 'early', id: a.id, min: minutes, day: t.day }; render(); }
  }

  /* ---------------- общие куски разметки ---------------- */
  const pct = (p) => L.fmtPct(p);

  function bar(val, goal, color) {
    const main = Math.min(val / goal, 1) * 100;
    const over = val > goal ? Math.min((val - goal) / goal, 1) * 100 : 0;
    return `<div class="bar ${val >= goal ? 'done' : ''}" style="--c:${color}"><i style="width:${main}%"></i></div>` +
      (over > 0 ? `<div class="bar thin"><i style="width:${over}%"></i></div>` : '');
  }

  /* ---------------- экран «Сегодня» ---------------- */
  function actCard(r) {
    const a = r.act;
    const daily = a.period === 'day';
    const val = daily ? r.n : r.weekN;
    const done = val >= a.goal;
    const meta = daily ? `${r.n} / ${a.goal} · ${pct(r.pct)}` : `неделя ${r.weekN} / ${a.goal}`;
    let sub = r.m > 0 ? L.fmtMin(r.m) : '—';
    if (!daily) sub = 'сегодня: ' + r.n + (r.m > 0 ? ' · ' + L.fmtMin(r.m) : '');
    if (val > a.goal) {
      const extra = val - a.goal;
      sub += ` · сверх нормы +${pct((extra / a.goal) * 100)} (+${L.fmtMin(extra * a.block)})`;
    }
    const timer = getTimer();
    const running = timer && timer.a === a.id;
    return `<div class="card act" style="--c:${a.color}">
      <div class="act-top"><b>${esc(a.name)}</b><span class="meta ${done ? 'done' : ''}">${meta}${done ? ' ✓' : ''}</span></div>
      ${bar(val, a.goal, a.color)}
      <div class="act-sub">${sub}</div>
      <div class="act-btns">
        <button class="btn big" data-a="add" data-id="${a.id}">+ ${a.block} мин</button>
        <button class="icon" data-a="timer" data-id="${a.id}" aria-label="Таймер" ${timer ? 'disabled' : ''}>${running ? '⏱' : '▶'}</button>
        <button class="icon" data-a="undo" data-id="${a.id}" aria-label="Отменить последнее" ${r.n === 0 && r.m === 0 ? 'disabled' : ''}>↶</button>
      </div></div>`;
  }

  function viewToday() {
    const idx = L.index(state.entries), tk = L.today(), day = ui.day;
    const info = L.dayInfo(state, idx, day);
    const st = L.streaks(state, idx, tk);
    const isToday = day === tk;

    let html = `<div class="daynav">
      <button class="arrow" data-a="day-prev" aria-label="Предыдущий день">‹</button>
      <button class="daytitle" data-a="day-today">${L.dayLabel(day)}${isToday ? ' · сегодня' : ''}</button>
      <button class="arrow" data-a="day-next" aria-label="Следующий день" ${day >= tk ? 'disabled' : ''}>›</button></div>
      <div class="chips"><span class="chip">🔥 серия ${st.current} дн.</span><span class="chip">рекорд ${st.best}</span><span class="chip">${L.fmtMin(info.minutes)} за день</span></div>`;

    if (info.reqTotal > 0) {
      html += `<div class="card daybox"><div class="row"><b>Минимум дня</b><span>${info.reqDone} из ${info.reqTotal}${info.complete ? ' ✓' : ''}</span></div>
        ${bar(info.reqDone, info.reqTotal, 'var(--accent)')}
        <div class="small muted" style="margin-top:6px">${info.complete ? 'Всё обязательное выполнено — серия идёт.' : 'Закрой все обязательные пункты, чтобы день засчитался в серию.'}</div></div>`;
    }

    ['study', 'habit'].forEach((kind) => {
      const rows = info.rows.filter((r) => r.act.kind === kind && !r.act.archived);
      if (!rows.length) return;
      html += `<h2>${KIND[kind]}</h2>` + rows.map(actCard).join('');
    });
    if (!info.rows.length) html += `<div class="empty">Пока нет активностей. Добавь их в настройках.</div>`;

    const list = state.entries.filter((e) => e.d === day).sort((x, y) => y.t - x.t);
    if (list.length) {
      html += `<h2>Журнал дня</h2><div class="card">` + list.map((e) => {
        const a = actById(e.a);
        const time = e.t ? new Date(e.t).toTimeString().slice(0, 5) : '';
        const what = a ? esc(a.name) : 'Удалённая активность';
        const plus = e.n > 0 ? `+${L.fmtMin(e.m)}` : `${L.fmtMin(e.m)} без %`;
        return `<div class="log"><time>${isToday ? time : ''}</time><div class="what">${what}${e.tag ? `<small>${esc(e.tag)}</small>` : ''}</div><span>${plus}</span><button class="del" data-a="del" data-id="${e.id}" aria-label="Удалить">✕</button></div>`;
      }).join('') + `</div>`;
    }
    return html;
  }

  /* ---------------- экран «Статистика» ---------------- */
  function niceTicks(maxv) {
    const steps = [10, 15, 30, 60, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200, 1800, 2400, 3600, 4800, 7200, 14400];
    let step = steps[steps.length - 1];
    for (let i = 0; i < steps.length; i++) { if (maxv / steps[i] <= 5) { step = steps[i]; break; } }
    return { step: step, top: Math.ceil(maxv / step) * step };
  }
  const tickLabel = (v) => (v >= 60 ? (v % 60 === 0 ? v / 60 : (v / 60).toFixed(1)) + 'ч' : v + 'м');

  function chartSvg(ser, mode, spanDays) {
    const B = ser.buckets;
    let maxv = 0;
    B.forEach((b) => { if (b.total > maxv) maxv = b.total; });
    if (!B.length || maxv === 0) return `<div class="empty">Пока нет данных за этот период</div>`;
    const W = 340, H = 200, pl = 36, pr = 6, pt = 10, pb = 24, cw = W - pl - pr, ch = H - pt - pb;
    const tk = niceTicks(maxv);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График времени">`;
    for (let v = 0; v <= tk.top; v += tk.step) {
      const y = pt + ch - (v / tk.top) * ch;
      s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text x="${pl - 5}" y="${y + 3}" text-anchor="end">${tickLabel(v)}</text>`;
    }
    const slot = cw / B.length, bw = Math.min(slot * 0.72, 30), every = Math.ceil(B.length / 8);
    B.forEach((b, i) => {
      const x = pl + slot * i + (slot - bw) / 2;
      let y0 = pt + ch;
      ser.acts.forEach((a) => {
        const m = b.parts[a.id];
        if (!m) return;
        const h = (m / tk.top) * ch;
        y0 -= h;
        s += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${a.color}"><title>${esc(a.name)}: ${L.fmtMin(m)}</title></rect>`;
      });
      if (i % every === 0) {
        const d = L.parseKey(b.key);
        const lab = mode === 'week' ? d.getDate() + '.' + L.pad(d.getMonth() + 1)
          : (B.length <= 7 ? L.WEEKDAYS[(d.getDay() + 6) % 7] : String(d.getDate()));
        s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${lab}</text>`;
      }
    });
    return s + '</svg>';
  }

  function balanceBlock(rep, kind) {
    const items = rep.acts.filter((x) => (kind === 'all' || x.act.kind === kind) && x.m > 0).sort((a, b) => b.m - a.m);
    const total = items.reduce((s, x) => s + x.m, 0);
    if (!total) return '';
    return `<h2>Баланс времени</h2><div class="card"><div class="stack">${items.map((x) => `<i style="flex:${x.m};--c:${x.act.color}"></i>`).join('')}</div>` +
      items.map((x) => `<div class="share"><span><span class="dot" style="--c:${x.act.color}"></span>${esc(x.act.name)}</span><span>${L.fmtMin(x.m)} · ${Math.round((x.m / total) * 100)}%</span></div>`).join('') + `</div>`;
  }

  function detailCard(x) {
    const a = x.act;
    const daily = a.period === 'day';
    let rows = '';
    rows += `<div class="kv"><span>Подходов</span><span>${Math.round(x.n * 100) / 100}</span></div>`;
    rows += `<div class="kv"><span>Суммарно, %</span><span>${pct(x.pctSum)}</span></div>`;
    if (x.completion !== null) rows += `<div class="kv"><span>Выполнение нормы</span><span>${pct(x.completion)}</span></div>`;
    if (daily && x.applicable > 0) {
      rows += `<div class="kv"><span>Дней с минимумом</span><span>${x.daysDone} / ${x.applicable}</span></div>`;
      rows += `<div class="kv"><span>В среднем за день</span><span>${pct(x.avgPct)}</span></div>`;
      if (x.applicable > 1) {
        rows += `<div class="kv"><span>Дней ≥ 200% / 300% / 500%</span><span>${x.levels[2]} / ${x.levels[3]} / ${x.levels[5]}</span></div>`;
      }
    }
    if (x.weeks.length) {
      rows += `<div class="sub">По неделям</div>` + x.weeks.map((w) => {
        const d = L.parseKey(w.start);
        return `<div class="kv"><span>с ${d.getDate()} ${L.MONTHS_S[d.getMonth()]}</span><span>${w.n} / ${w.goal}${w.done ? ' ✓' : ''}</span></div>`;
      }).join('');
    }
    const tags = Object.keys(x.tags).filter((t) => x.tags[t].m > 0 || x.tags[t].n > 0).sort((p, q) => x.tags[q].m - x.tags[p].m);
    if (tags.length > 1 || (tags.length === 1 && tags[0] !== '')) {
      rows += `<div class="sub">По темам</div>` + tags.map((t) =>
        `<div class="kv"><span>${t ? esc(t) : 'без темы'}</span><span>${L.fmtMin(x.tags[t].m)}</span></div>`).join('');
    }
    return `<details class="card"><summary><span class="dot" style="--c:${a.color}"></span><span class="nm">${esc(a.name)}</span>
      <span class="vals"><b>${L.fmtMin(x.m)}</b>${pct(x.pctSum)}</span></summary><div class="body">${rows}</div></details>`;
  }

  function viewStats() {
    const idx = L.index(state.entries), tk = L.today();
    const pr = L.periodRange(ui.period, ui.anchor, state, idx, tk);
    const rep = L.report(state, idx, pr.from, pr.to, tk);
    const st = L.streaks(state, idx, tk);
    const P = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё']];

    let html = `<div class="seg">${P.map((p) => `<button class="${ui.period === p[0] ? 'on' : ''}" data-a="period" data-v="${p[0]}">${p[1]}</button>`).join('')}</div>`;
    if (ui.period !== 'all') {
      const nextDisabled = L.shiftAnchor(ui.period, ui.anchor, 1) > tk && pr.to >= tk;
      html += `<div class="daynav" style="margin-bottom:12px"><button class="arrow" data-a="p-prev" aria-label="Назад">‹</button>
        <button class="daytitle" data-a="p-now">${esc(L.periodLabel(ui.period, ui.anchor, pr.from, pr.to))}</button>
        <button class="arrow" data-a="p-next" aria-label="Вперёд" ${nextDisabled ? 'disabled' : ''}>›</button></div>`;
    }

    const K = rep.kinds;
    const stat = (name, g) => `<div class="stat"><div class="k">${name}</div><div class="v">${L.fmtMin(g.minutes)}</div>
      <div class="s">${pct(g.pctSum)} суммарно</div><div class="s">норма ${g.completion === null ? '—' : pct(g.completion)}</div></div>`;
    html += `<div class="grid3">${stat('Учёба', K.study)}${stat('Привычки', K.habit)}${stat('Вместе', K.all)}</div>`;
    html += `<div class="chips"><span class="chip">Дней с полным минимумом: ${rep.okDays} из ${rep.reqDays}</span><span class="chip">🔥 серия ${st.current}</span><span class="chip">рекорд ${st.best}</span></div>`;

    const KT = [['all', 'Вместе'], ['study', 'Учёба'], ['habit', 'Привычки']];
    html += `<div class="seg">${KT.map((p) => `<button class="${ui.chartKind === p[0] ? 'on' : ''}" data-a="ckind" data-v="${p[0]}">${p[1]}</button>`).join('')}</div>`;

    if (ui.period !== 'day') {
      const mode = ui.period === 'all' ? 'week' : 'day';
      const ser = L.series(state, idx, pr.from, pr.to, ui.chartKind, mode);
      html += `<div class="card">${chartSvg(ser, mode)}<div class="legend">${ser.acts.map((a) => `<span style="--c:${a.color}">${esc(a.name)}</span>`).join('')}</div></div>`;
    }
    html += balanceBlock(rep, ui.chartKind);

    const items = rep.acts.filter((x) => ui.chartKind === 'all' || x.act.kind === ui.chartKind);
    if (items.length) html += `<h2>По активностям</h2>` + items.map(detailCard).join('');
    return html;
  }

  /* ---------------- экран «Настройки» ---------------- */
  function viewSettings() {
    const act = state.activities;
    const row = (a, i) => `<div class="setrow ${a.archived ? 'arch' : ''}"><span class="dot" style="--c:${a.color}"></span>
      <div class="nm">${esc(a.name)}<small>${KIND[a.kind]} · ${a.block} мин × ${a.goal} ${a.period === 'day' ? 'в день' : 'в неделю'}${a.archived ? ' · в архиве' : ''}</small></div>
      <button class="mini" data-a="up" data-id="${a.id}" ${i === 0 ? 'disabled' : ''} aria-label="Выше">↑</button>
      <button class="mini" data-a="down" data-id="${a.id}" ${i === act.length - 1 ? 'disabled' : ''} aria-label="Ниже">↓</button>
      <button class="mini" data-a="edit" data-id="${a.id}" aria-label="Изменить">✎</button></div>`;
    const th = state.settings.theme;
    const T = [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']];
    return `<h2>Активности</h2><div class="card">${act.map(row).join('') || '<div class="empty">Пусто</div>'}
      <button class="btn ghost full" data-a="new">+ Новая активность</button></div>
      <h2>Тема</h2><div class="seg">${T.map((t) => `<button class="${th === t[0] ? 'on' : ''}" data-a="theme" data-v="${t[0]}">${t[1]}</button>`).join('')}</div>
      <h2>Данные</h2><div class="card">
        <div class="small muted">Всё хранится только на этом телефоне. Если очистишь данные браузера — история пропадёт, поэтому иногда делай экспорт.</div>
        <button class="btn ghost full" data-a="export">Скачать копию (JSON)</button>
        <button class="btn ghost full" data-a="import">Загрузить копию</button>
        <button class="btn danger full" data-a="reset">Стереть всё</button>
        <div class="small muted" style="margin-top:10px">Записей: ${state.entries.length}</div></div>`;
  }

  /* ---------------- шторки ---------------- */
  function sheetTag(s) {
    const a = actById(s.id);
    const last = state.settings.lastTag[a.id];
    return `<h3>${esc(a.name)}</h3><p class="hint">Что именно делал(а)?${s.n > 1 ? ' Подходов: ' + s.n : ''}</p>
      <div class="chipgrid">${a.tags.map((t, i) => `<button class="${t === last ? 'on' : ''}" data-a="pick-tag" data-i="${i}">${esc(t)}</button>`).join('')}
      <button data-a="pick-tag" data-i="-1">Без темы</button></div>
      <div class="actions"><button class="btn ghost" data-a="sheet-close">Отмена</button></div>`;
  }

  function sheetEarly(s) {
    const a = actById(s.id);
    return `<h3>Подход ещё не набран</h3><p class="hint">Прошло ${s.min} мин из ${a.block}. Минимум не достигнут — как записать?</p>
      <div class="actions" style="flex-direction:column">
        <button class="btn" data-a="early-block">Засчитать как подход (+${pct(100 / a.goal)})</button>
        <button class="btn ghost" data-a="early-minutes">Записать только ${s.min} мин, без процентов</button>
        <button class="btn ghost" data-a="sheet-close">Продолжить таймер</button>
        <button class="btn danger" data-a="early-cancel">Сбросить таймер</button></div>`;
  }

  function sheetEdit(s) {
    const a = s.id ? actById(s.id) : { name: '', kind: 'study', block: 40, goal: 1, period: 'day', tags: [], color: COLORS[state.activities.length % COLORS.length], from: L.today(), required: true, archived: false };
    const sw = COLORS.map((c) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === a.color ? 'checked' : ''}><span></span></label>`).join('');
    return `<h3>${s.id ? 'Изменить активность' : 'Новая активность'}</h3>
      <label class="f">Название</label><input type="text" id="f-name" value="${esc(a.name)}" maxlength="40">
      <div class="two"><div><label class="f">Тип</label><select id="f-kind"><option value="study" ${a.kind === 'study' ? 'selected' : ''}>Учёба</option><option value="habit" ${a.kind === 'habit' ? 'selected' : ''}>Привычка</option></select></div>
      <div><label class="f">Один подход, мин</label><input type="number" id="f-block" min="1" max="600" value="${a.block}" inputmode="numeric"></div></div>
      <div class="two"><div><label class="f">Норма (подходов)</label><input type="number" id="f-goal" min="1" max="50" value="${a.goal}" inputmode="numeric"></div>
      <div><label class="f">Период нормы</label><select id="f-period"><option value="day" ${a.period === 'day' ? 'selected' : ''}>в день</option><option value="week" ${a.period === 'week' ? 'selected' : ''}>в неделю</option></select></div></div>
      <label class="f">Темы (необязательно, через запятую)</label><textarea id="f-tags" placeholder="Например: Чтение, Грамматика, Сериал">${esc(a.tags.join(', '))}</textarea>
      <label class="f">Цвет</label><div class="swatches">${sw}</div>
      <label class="f">Считать с даты</label><input type="date" id="f-from" value="${a.from}">
      <label class="check"><input type="checkbox" id="f-req" ${a.required !== false ? 'checked' : ''}> Нужна для серии (дневная норма обязательна)</label>
      <p class="hint" style="margin-top:10px">Длина подхода влияет только на новые записи — старые не меняются.</p>
      <div class="actions"><button class="btn" data-a="save-act" data-id="${s.id || ''}">Сохранить</button><button class="btn ghost" data-a="sheet-close">Отмена</button></div>
      ${s.id ? `<div class="actions"><button class="btn ghost" data-a="archive" data-id="${s.id}">${a.archived ? 'Вернуть из архива' : 'В архив'}</button><button class="btn danger" data-a="delete-act" data-id="${s.id}">Удалить</button></div>` : ''}`;
  }

  function renderSheet() {
    const s = ui.sheet, el = $('sheet');
    if (!s) { el.innerHTML = ''; el.className = ''; return; }
    const body = s.type === 'tag' ? sheetTag(s) : s.type === 'early' ? sheetEarly(s) : sheetEdit(s);
    el.className = 'open';
    el.innerHTML = `<div class="backdrop" data-a="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true">${body}</div>`;
  }

  /* ---------------- общий рендер ---------------- */
  function applyTheme() {
    const th = state.settings.theme;
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
  }

  function render() {
    applyTheme();
    $('app').innerHTML = ui.tab === 'today' ? viewToday() : ui.tab === 'stats' ? viewStats() : viewSettings();
    const N = [['today', '✅', 'Сегодня'], ['stats', '📊', 'Статистика'], ['settings', '⚙️', 'Настройки']];
    $('nav').innerHTML = N.map((n) => `<button class="${ui.tab === n[0] ? 'on' : ''}" data-a="tab" data-v="${n[0]}"><span>${n[1]}</span>${n[2]}</button>`).join('');
    renderSheet();
    renderTimer();
  }

  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const el = $('toast');
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button id="toastBtn">${esc(actionLabel)}</button>` : ''}`;
    el.className = 'on';
    if (actionLabel) $('toastBtn').onclick = () => { el.className = ''; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 5000);
  }

  /* ---------------- сохранение активности ---------------- */
  function saveActivity(id) {
    const name = $('f-name').value.trim();
    const block = Math.round(Number($('f-block').value));
    const goal = Math.round(Number($('f-goal').value));
    if (!name) { toast('Введи название'); return; }
    if (!(block >= 1)) { toast('Длина подхода — минимум 1 минута'); return; }
    if (!(goal >= 1)) { toast('Норма — минимум 1 подход'); return; }
    const tags = [];
    $('f-tags').value.split(/[,\n]/).forEach((t) => { t = t.trim(); if (t && tags.indexOf(t) < 0) tags.push(t); });
    const colorEl = document.querySelector('input[name="color"]:checked');
    const data = {
      name, block, goal, tags,
      kind: $('f-kind').value, period: $('f-period').value,
      color: colorEl ? colorEl.value : COLORS[0],
      from: $('f-from').value || L.today(), required: $('f-req').checked
    };
    if (id) Object.assign(actById(id), data);
    else state.activities.push(Object.assign({ id: uid(), archived: false }, data));
    ui.sheet = null; save(); render();
  }

  /* ---------------- экспорт / импорт ---------------- */
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'habit-study-' + L.today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importData(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result);
        if (!valid(s)) throw new Error('bad');
        if (!confirm('Заменить все текущие данные данными из файла? (Записей в файле: ' + s.entries.length + ')')) return;
        state = normalize(s); save(); ui.day = L.today(); render(); toast('Данные загружены');
      } catch (e) { toast('Файл не похож на копию этого приложения'); }
    };
    rd.readAsText(file);
  }

  /* ---------------- обработка нажатий ---------------- */
  function move(id, dir) {
    const i = state.activities.findIndex((a) => a.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= state.activities.length) return;
    const t = state.activities[i]; state.activities[i] = state.activities[j]; state.activities[j] = t;
    save(); render();
  }

  const H = {
    'tab': (el) => { ui.tab = el.dataset.v; window.scrollTo(0, 0); render(); },
    'day-prev': () => { ui.day = L.addDays(ui.day, -1); render(); },
    'day-next': () => { if (ui.day < L.today()) { ui.day = L.addDays(ui.day, 1); render(); } },
    'day-today': () => { ui.day = L.today(); render(); },
    'add': (el) => startAdd(el.dataset.id, 1, ui.day),
    'undo': (el) => undoLast(el.dataset.id),
    'del': (el) => deleteEntry(el.dataset.id),
    'timer': (el) => startTimer(el.dataset.id),
    'timer-done': () => finishTimer(),
    'timer-cancel': () => { if (confirm('Сбросить таймер? Время не будет записано.')) { setTimer(null); render(); } },
    'pick-tag': (el) => {
      const s = ui.sheet, a = actById(s.id), i = Number(el.dataset.i);
      ui.sheet = null;
      addEntry(s.id, i >= 0 ? a.tags[i] : '', s.n, null, s.day);
    },
    'early-block': () => { const s = ui.sheet; setTimer(null); ui.sheet = null; startAdd(s.id, 1, s.day); },
    'early-minutes': () => { const s = ui.sheet; setTimer(null); ui.sheet = null; addEntry(s.id, '', 0, Math.max(1, s.min), s.day); },
    'early-cancel': () => { setTimer(null); ui.sheet = null; render(); },
    'sheet-close': () => { ui.sheet = null; render(); },
    'period': (el) => { ui.period = el.dataset.v; ui.anchor = L.today(); render(); },
    'p-prev': () => { ui.anchor = L.shiftAnchor(ui.period, ui.anchor, -1); render(); },
    'p-next': () => { ui.anchor = L.shiftAnchor(ui.period, ui.anchor, 1); render(); },
    'p-now': () => { ui.anchor = L.today(); render(); },
    'ckind': (el) => { ui.chartKind = el.dataset.v; render(); },
    'theme': (el) => { state.settings.theme = el.dataset.v; save(); render(); },
    'up': (el) => move(el.dataset.id, -1),
    'down': (el) => move(el.dataset.id, 1),
    'new': () => { ui.sheet = { type: 'edit', id: null }; render(); },
    'edit': (el) => { ui.sheet = { type: 'edit', id: el.dataset.id }; render(); },
    'save-act': (el) => saveActivity(el.dataset.id),
    'archive': (el) => { const a = actById(el.dataset.id); a.archived = !a.archived; ui.sheet = null; save(); render(); },
    'delete-act': (el) => {
      const a = actById(el.dataset.id), n = state.entries.filter((e) => e.a === a.id).length;
      if (!confirm('Удалить «' + a.name + '» вместе со всеми записями (' + n + ')? Это нельзя отменить. Если хочешь сохранить историю — лучше отправь в архив.')) return;
      state.activities = state.activities.filter((x) => x.id !== a.id);
      state.entries = state.entries.filter((e) => e.a !== a.id);
      ui.sheet = null; save(); render();
    },
    'export': exportData,
    'import': () => $('importFile').click(),
    'reset': () => {
      if (!confirm('Стереть ВСЕ данные на этом устройстве? Сначала лучше сделать копию.')) return;
      if (!confirm('Точно стереть? Это необратимо.')) return;
      setTimer(null); state = normalize(seed()); save(); ui.day = L.today(); render();
    }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('[data-a]') : null;
    if (!el || el.disabled) return;
    const fn = H[el.dataset.a];
    if (fn) fn(el);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); } });
  $('importFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; });

  // если приложение открыто после полуночи — перейти на новый «сегодня»
  let lastDay = L.today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const now = L.today();
    if (now !== lastDay) { if (ui.day === lastDay) ui.day = now; if (ui.anchor === lastDay) ui.anchor = now; lastDay = now; }
    render();
  });

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* не страшно */ }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  render();
})();
