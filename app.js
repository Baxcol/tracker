/* Интерфейс. Данные хранятся на телефоне (localStorage), сервера нет.
   Вся математика живёт в logic.js, здесь только показ и ввод. */
(function () {
  'use strict';
  const L = window.Logic;
  const KEY = 'habitstudy.v1';
  const TKEY = 'habitstudy.timer.v1';
  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6', '#84cc16', '#f97316'];
  const KIND = { study: 'Учёба', habit: 'Привычки' };

  // premium: true — тема будет закрыта до покупки (пока все бесплатные).
  const THEMES = [
    { id: 'auto', name: 'Авто', pv: ['#f4f4f8', '#ffffff', '#4f46e5'], premium: false },
    { id: 'light', name: 'Светлая', pv: ['#f4f4f8', '#ffffff', '#4f46e5'], premium: false },
    { id: 'dark', name: 'Тёмная', pv: ['#0e1016', '#181b24', '#7c75ff'], premium: false },
    { id: 'cyber', name: 'Киберпанк', pv: ['#07070f', '#0e1022', '#00e5ff'], premium: false },
    { id: 'medieval', name: 'Средневековье', pv: ['#d8c6a0', '#efe3c3', '#8b1e1e'], premium: false },
    { id: 'space', name: 'Космос', pv: ['#050816', '#171c46', '#9b8cff'], premium: false },
    { id: 'nature', name: 'Природа', pv: ['#e4eed9', '#f8fbf2', '#2e7d4f'], premium: false }
  ];
  const themeIds = THEMES.map((t) => t.id);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (p) => L.fmtPct(p);

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
    if (themeIds.indexOf(s.settings.theme) < 0) s.settings.theme = 'auto';
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
    catch (e) { toast('Не удалось сохранить данные! Сделай копию в настройках.'); }
  }
  if (!localStorage.getItem(KEY)) save();

  const actById = (id) => state.activities.find((a) => a.id === id);

  // sheet — нижняя шторка (форма, выбор темы, заполнение); dialog — окно поверх (календарь, вопрос)
  const ui = { tab: 'today', day: L.today(), period: 'week', anchor: L.today(), kind: 'all', sheet: null, dialog: null };

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
    el.innerHTML = `<div class="tb" id="tb">
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
  function bar(val, goal, color) {
    const main = Math.min(val / goal, 1) * 100;
    const over = val > goal ? Math.min((val - goal) / goal, 1) * 100 : 0;
    return `<div class="bar ${val >= goal ? 'done' : ''}" style="--c:${color}"><i style="width:${main}%"></i></div>` +
      (over > 0 ? `<div class="bar thin"><i style="width:${over}%"></i></div>` : '');
  }

  // одна клетка дня: кружок с цифрой. ok — зелёный (минимум выполнен), miss — красный контур
  function dayCell(key, idx, opts) {
    const tk = L.today(), d = L.parseKey(key), fut = key > tk;
    const st = opts.mark ? L.dayStatus(state, idx, key, tk) : '';
    const cls = ['cd', st, key === tk ? 'today' : '', key === opts.sel ? 'sel' : '', fut ? 'fut' : '', opts.out ? 'out' : ''].filter(Boolean).join(' ');
    const small = opts.wd ? `<small>${L.WEEKDAYS[(d.getDay() + 6) % 7]}</small>` : '';
    return `<button class="${cls}" data-a="${opts.action}" data-v="${key}" ${fut ? 'disabled' : ''} aria-label="${L.dayLabel(key)}">${small}<span class="cn">${d.getDate()}</span></button>`;
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
    const ws = L.weekStart(day);

    let strip = '';
    for (let i = 0; i < 7; i++) strip += dayCell(L.addDays(ws, i), idx, { mark: true, sel: day, wd: true, action: 'day-set' });

    let html = `<div class="daynav">
      <button class="arrow" data-a="week-prev" aria-label="Прошлая неделя">‹</button>
      <button class="daytitle" data-a="open-cal">📅 ${L.dayLabel(day)}${isToday ? ' · сегодня' : ''}</button>
      <button class="arrow" data-a="week-next" aria-label="Следующая неделя" ${L.addDays(ws, 7) > tk ? 'disabled' : ''}>›</button></div>
      <div class="strip">${strip}</div>
      <div class="chips"><span class="chip">🔥 серия ${st.current} дн.</span><span class="chip">рекорд ${st.best}</span><span class="chip">${L.fmtMin(info.minutes)} за день</span>
      ${isToday ? '' : '<button class="chip" data-a="day-today">↩ К сегодня</button>'}</div>`;

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
        const time = e.t && !e.auto ? new Date(e.t).toTimeString().slice(0, 5) : '';
        const what = a ? esc(a.name) : 'Удалённая активность';
        const plus = e.n > 0 ? `+${L.fmtMin(e.m)}` : `${L.fmtMin(e.m)} без %`;
        const sub = [e.tag ? esc(e.tag) : '', e.auto ? 'автозаполнение' : ''].filter(Boolean).join(' · ');
        return `<div class="log"><time>${time}</time><div class="what">${what}${sub ? `<small>${sub}</small>` : ''}</div><span>${plus}</span><button class="del" data-a="del" data-id="${e.id}" aria-label="Удалить">✕</button></div>`;
      }).join('') + `</div>`;
    }
    return html;
  }

  /* ---------------- экран «Статистика» (всё текстом) ---------------- */
  function balanceBlock(rep) {
    const items = rep.acts.filter((x) => (ui.kind === 'all' || x.act.kind === ui.kind) && x.m > 0).sort((a, b) => b.m - a.m);
    const total = items.reduce((s, x) => s + x.m, 0);
    if (!total) return '';
    return `<h2>Баланс времени</h2><div class="card">` +
      items.map((x) => `<div class="share"><span><span class="dot" style="--c:${x.act.color}"></span>${esc(x.act.name)}</span><span>${L.fmtMin(x.m)} · ${Math.round((x.m / total) * 100)}%</span></div>`).join('') + `</div>`;
  }

  function detailCard(x) {
    const a = x.act;
    const daily = a.period === 'day';
    let rows = '';
    rows += `<div class="kv"><span>Подходов</span><span>${Math.round(x.n * 100) / 100}</span></div>`;
    rows += `<div class="kv"><span>Время</span><span>${L.fmtMin(x.m)}</span></div>`;
    rows += `<div class="kv"><span>Суммарно, %</span><span>${pct(x.pctSum)}</span></div>`;
    if (x.completion !== null) rows += `<div class="kv"><span>Выполнение нормы</span><span>${pct(x.completion)}</span></div>`;
    if (daily && x.applicable > 0) {
      rows += `<div class="kv"><span>Дней с выполненной нормой</span><span>${x.daysDone} / ${x.applicable}</span></div>`;
      rows += `<div class="kv"><span>В среднем за день</span><span>${pct(x.avgPct)}</span></div>`;
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

  function rowsCard(pr, idx, tk) {
    if (ui.period === 'day') return '';
    const unit = ui.period === 'all' ? 'week' : 'day';
    let rows = L.breakdown(state, idx, pr.from, pr.to, ui.kind, unit, tk);
    if (!rows.length) return '';
    if (ui.period === 'all') rows = rows.slice().reverse();
    const body = rows.map((r) => {
      let left, right = r.minutes > 0 ? `${L.fmtMin(r.minutes)} · ${pct(r.pctSum)}` : '—';
      if (unit === 'day') {
        const mark = r.status === 'ok' ? ' <span class="okm">✓</span>' : r.status === 'miss' ? ' <span class="missm">✗</span>' : '';
        left = L.dayLabel(r.from) + mark;
      } else {
        left = L.periodLabel('week', null, r.from, r.to);
        if (r.reqDays) right += ` · дн. ${r.okDays}/${r.reqDays}`;
      }
      return `<div class="kv"><span>${left}</span><span>${right}</span></div>`;
    }).join('');
    return `<details class="card" ${ui.period === 'week' ? 'open' : ''}><summary><span class="nm">${unit === 'day' ? 'По дням' : 'По неделям'}</span><span class="vals">${rows.length}</span></summary><div class="body">${body}</div></details>`;
  }

  function viewStats() {
    const idx = L.index(state.entries), tk = L.today();
    const pr = L.periodRange(ui.period, ui.anchor, state, idx, tk);
    const rep = L.report(state, idx, pr.from, pr.to, tk);
    const st = L.streaks(state, idx, tk);
    const P = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']];

    let html = `<div class="seg">${P.map((p) => `<button class="${ui.period === p[0] ? 'on' : ''}" data-a="period" data-v="${p[0]}">${p[1]}</button>`).join('')}</div>`;
    if (ui.period !== 'all') {
      const nextDisabled = L.shiftAnchor(ui.period, ui.anchor, 1) > tk && pr.to >= tk;
      html += `<div class="daynav" style="margin-bottom:12px"><button class="arrow" data-a="p-prev" aria-label="Назад">‹</button>
        <button class="daytitle" data-a="p-pick">📅 ${esc(cap(L.periodLabel(ui.period, ui.anchor, pr.from, pr.to)))}</button>
        <button class="arrow" data-a="p-next" aria-label="Вперёд" ${nextDisabled ? 'disabled' : ''}>›</button></div>`;
    } else {
      html += `<div class="muted small" style="margin:0 2px 10px">${L.fmtDate(pr.from)} — ${L.fmtDate(pr.to)}</div>`;
    }

    if (rep.days === 0) return html + `<div class="empty">За этот период данных нет</div>`;

    const K = rep.kinds;
    const grp = (name, g, all) => `<div class="grp ${all ? 'all' : ''}"><div class="gt"><span>${name}</span><b>${L.fmtMin(g.minutes)}</b></div>
      <div class="gs">${pct(g.pctSum)} суммарно · норма ${g.completion === null ? '—' : pct(g.completion)}</div></div>`;
    html += `<div class="card">${grp('Учёба', K.study)}${grp('Привычки', K.habit)}${grp('Вместе', K.all, true)}</div>`;

    const info = [];
    if (rep.days > 1) info.push(['Прошло дней', rep.days], ['В среднем в день', L.fmtMin(K.all.minutes / rep.days)]);
    info.push(['Дней с полным минимумом', rep.reqDays ? `${rep.okDays} из ${rep.reqDays}` : '—']);
    info.push(['Серия сейчас / рекорд', `${st.current} / ${st.best} дн.`]);
    html += `<div class="card">${info.map((r) => `<div class="kv"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}</div>`;
    html += `<div class="muted small" style="margin:0 4px 6px">«Суммарно» — все подходы в процентах (100% = один подход, сверх нормы тоже считается). «Норма» — выполнение плана, не больше 100%.</div>`;

    const KT = [['all', 'Вместе'], ['study', 'Учёба'], ['habit', 'Привычки']];
    html += `<h2>Подробнее</h2><div class="seg">${KT.map((p) => `<button class="${ui.kind === p[0] ? 'on' : ''}" data-a="ckind" data-v="${p[0]}">${p[1]}</button>`).join('')}</div>`;

    html += balanceBlock(rep);
    html += rowsCard(pr, idx, tk);
    const items = rep.acts.filter((x) => ui.kind === 'all' || x.act.kind === ui.kind);
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
    const themes = THEMES.map((t) => `<button class="theme ${th === t.id ? 'on' : ''}" data-a="theme" data-v="${t.id}" style="--pb:${t.pv[0]};--pc:${t.pv[1]};--pa:${t.pv[2]}">
      <span class="pv"></span>${t.name}${t.premium && !state.settings.pro ? ' 🔒' : ''}</button>`).join('');
    const last = state.settings.lastExport ? L.fmtDate(state.settings.lastExport) : 'ещё не делалась';
    return `<h2>Активности</h2><div class="card">${act.map(row).join('') || '<div class="empty">Пусто</div>'}
      <button class="btn ghost full" data-a="new">+ Новая активность</button></div>
      <h2>Тема оформления</h2><div class="themes">${themes}</div>
      <h2>Данные</h2><div class="card">
        <div class="small muted">Всё хранится только на этом телефоне. Если очистишь данные браузера — история пропадёт, поэтому иногда делай копию.</div>
        <button class="btn ghost full" data-a="export">Скачать копию (JSON)</button>
        <button class="btn ghost full" data-a="import">Загрузить копию</button>
        <button class="btn danger full" data-a="reset">Стереть всё</button>
        <div class="small muted" style="margin-top:10px">Записей: ${state.entries.length} · последняя копия: ${last}</div></div>`;
  }

  /* ---------------- шторки ---------------- */
  function sheetTag(s) {
    const a = actById(s.id);
    const last = state.settings.lastTag[a.id];
    return `<h3>${esc(a.name)}</h3><p class="hint">Что именно делал(а)?${s.n > 1 ? ' Подходов: ' + s.n : ''}</p>
      <div class="chipgrid">${a.tags.map((t, i) => `<button class="${t === last ? 'on' : ''}" data-a="pick-tag" data-i="${i}">${esc(t)}</button>`).join('')}
      <button data-a="pick-tag" data-i="-1">Без темы</button><button data-a="tag-new-pick">+ Новая тема</button></div>
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

  function dateBtn(field, value) {
    return `<button class="datebtn" data-a="pick-date" data-field="${field}">📅 ${L.fmtDate(value)}</button>`;
  }

  function sheetEdit(s) {
    const d = s.draft, isNew = !s.id;
    const sw = COLORS.map((c) => `<label style="--c:${c}"><input type="radio" name="color" data-f="color" value="${c}" ${c === d.color ? 'checked' : ''}><span></span></label>`).join('');
    const tags = d.tags.map((t, i) => `<span class="tg">${esc(t)}<button data-a="tag-del" data-i="${i}" aria-label="Убрать тему">✕</button></span>`).join('');
    return `<h3>${isNew ? 'Новая активность' : 'Изменить активность'}</h3>
      <label class="f">Название</label><input type="text" data-f="name" value="${esc(d.name)}" maxlength="40">
      <div class="two"><div><label class="f">Тип</label><select data-f="kind"><option value="study" ${d.kind === 'study' ? 'selected' : ''}>Учёба</option><option value="habit" ${d.kind === 'habit' ? 'selected' : ''}>Привычка</option></select></div>
      <div><label class="f">Один подход, мин</label><input type="number" data-f="block" min="1" max="600" value="${esc(d.block)}" inputmode="numeric"></div></div>
      <div class="two"><div><label class="f">Норма (подходов)</label><input type="number" data-f="goal" min="1" max="50" value="${esc(d.goal)}" inputmode="numeric"></div>
      <div><label class="f">Период нормы</label><select data-f="period"><option value="day" ${d.period === 'day' ? 'selected' : ''}>в день</option><option value="week" ${d.period === 'week' ? 'selected' : ''}>в неделю</option></select></div></div>
      <label class="f">Темы (необязательно)</label>
      <div class="tagbox">${tags}<button class="tg add" data-a="tag-add">+ Тема</button></div>
      <label class="f">${isNew ? 'С какого дня считать' : 'Считать с даты'}</label>${dateBtn('from', d.from)}
      ${isNew ? '<p class="hint" style="margin:6px 0 0">Если выбрать прошедшую дату, приложение предложит заполнить прошедшие дни автоматически.</p>' : ''}
      <label class="f">Цвет</label><div class="swatches">${sw}</div>
      ${d.period === 'day' ? `<label class="check"><input type="checkbox" data-f="required" ${d.required ? 'checked' : ''}> Нужна для серии (дневная норма обязательна)</label>` : ''}
      <p class="hint" style="margin-top:10px">Длина подхода влияет только на новые записи — старые не меняются.</p>
      <div class="actions"><button class="btn" data-a="save-act" data-id="${s.id || ''}">Сохранить</button><button class="btn ghost" data-a="sheet-close">Отмена</button></div>
      ${isNew ? '' : `<div class="actions"><button class="btn ghost" data-a="open-fill" data-id="${s.id}">Заполнить задним числом</button></div>
      <div class="actions"><button class="btn ghost" data-a="archive" data-id="${s.id}">${actById(s.id).archived ? 'Вернуть из архива' : 'В архив'}</button><button class="btn danger" data-a="delete-act" data-id="${s.id}">Удалить</button></div>`}`;
  }

  function sheetFill(s) {
    const a = actById(s.id), d = s.draft;
    const chips = L.WEEKDAYS.map((w, i) => `<button class="${d.days[i] ? 'on' : ''}" data-a="fill-wd" data-i="${i}">${w}</button>`).join('');
    const tagSel = a.tags.length
      ? `<div><label class="f">Тема</label><select data-f="tag"><option value="">Без темы</option>${a.tags.map((t) => `<option value="${esc(t)}" ${d.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`
      : '<div></div>';
    return `<h3>Заполнить задним числом</h3>
      <p class="hint">«${esc(a.name)}»: приложение отметит выполненные подходы за выбранные дни, чтобы статистика не начиналась с нуля. Потом всё можно отменить.${a.period === 'day' && a.required !== false ? ' Если не заполнять, дни с даты начала без отметок будут считаться невыполненными, и серия обнулится.' : ''}</p>
      <div class="two"><div><label class="f">С даты</label>${dateBtn('from', d.from)}</div><div><label class="f">По дату</label>${dateBtn('to', d.to)}</div></div>
      <div class="two"><div><label class="f">Подходов в день (по ${a.block} мин)</label><input type="number" data-f="per" min="1" max="50" value="${esc(d.per)}" inputmode="numeric"></div>${tagSel}</div>
      <label class="f">В какие дни недели</label><div class="wdchips">${chips}</div>
      <label class="check"><input type="checkbox" data-f="skip" ${d.skip ? 'checked' : ''}> Не трогать дни, где уже есть записи</label>
      <div class="preview" id="fill-preview"></div>
      <div class="actions"><button class="btn" data-a="fill-go">Заполнить</button><button class="btn ghost" data-a="sheet-close">Не нужно</button></div>`;
  }

  function renderSheet() {
    const s = ui.sheet, el = $('sheet');
    if (!s) { el.innerHTML = ''; el.className = ''; return; }
    const old = el.querySelector('.sheet'), top = old ? old.scrollTop : 0;
    const body = s.type === 'tag' ? sheetTag(s) : s.type === 'early' ? sheetEarly(s) : s.type === 'fill' ? sheetFill(s) : sheetEdit(s);
    el.className = 'open';
    el.innerHTML = `<div class="backdrop" data-a="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true">${body}</div>`;
    const n = el.querySelector('.sheet');
    if (n && top) n.scrollTop = top;
    if (s.type === 'fill') updateFillPreview();
  }

  /* ---------------- окна поверх: календарь и вопрос ---------------- */
  function calHtml(c) {
    const idx = L.index(state.entries), tk = L.today();
    const y = +c.month.slice(0, 4), m = +c.month.slice(5, 7) - 1;
    if (c.view === 'months') {
      const cells = L.MONTHS.map((nm, i) => {
        const key = y + '-' + L.pad(i + 1);
        const fut = key > tk.slice(0, 7);
        return `<button class="${key === c.month.slice(0, 7) ? 'cur' : ''}" data-a="cal-month" data-v="${i}" ${fut ? 'disabled' : ''}>${cap(nm)}</button>`;
      }).join('');
      return `<div class="daynav"><button class="arrow" data-a="cal-prev" aria-label="Прошлый год">‹</button><div class="daytitle static">${y}</div>
        <button class="arrow" data-a="cal-next" aria-label="Следующий год" ${y >= +tk.slice(0, 4) ? 'disabled' : ''}>›</button></div>
        <div class="mgrid">${cells}</div>
        <div class="actions"><button class="btn ghost" data-a="dialog-close">Закрыть</button></div>`;
    }
    const grid = L.monthGrid(c.month).map((cell) => dayCell(cell.key, idx, { mark: c.mark, sel: c.sel, out: !cell.inMonth, action: 'cal-day' })).join('');
    let extra = '';
    if (c.mark) {
      const r = L.report(state, idx, c.month, L.monthEnd(c.month), tk);
      extra = `<div class="legend"><span><i class="mk ok"></i>минимум выполнен</span><span><i class="mk miss"></i>не выполнен</span></div>` +
        (r.reqDays ? `<div class="monthsum">${cap(L.MONTHS[m])}: минимум выполнен ${r.okDays} из ${r.reqDays} дн.</div>` : '');
    }
    return `<div class="daynav"><button class="arrow" data-a="cal-prev" aria-label="Прошлый месяц">‹</button>
      <button class="daytitle" data-a="cal-title">${cap(L.MONTHS[m])} ${y} ▾</button>
      <button class="arrow" data-a="cal-next" aria-label="Следующий месяц" ${c.month.slice(0, 7) >= tk.slice(0, 7) ? 'disabled' : ''}>›</button></div>
      <div class="wdays">${L.WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="calgrid">${grid}</div>${extra}
      <div class="actions"><button class="btn ghost" data-a="cal-today">Сегодня</button><button class="btn ghost" data-a="dialog-close">Закрыть</button></div>`;
  }

  function promptHtml(c) {
    return `<h3>${esc(c.title)}</h3>
      <input type="text" id="dlg-input" maxlength="40" placeholder="${esc(c.placeholder || '')}" value="${esc(c.value || '')}" autocomplete="off">
      <div class="actions"><button class="btn" data-a="prompt-ok">Добавить</button><button class="btn ghost" data-a="dialog-close">Отмена</button></div>`;
  }

  function renderDialog() {
    const c = ui.dialog, el = $('dialog');
    if (!c) { el.innerHTML = ''; el.className = ''; return; }
    el.className = 'open';
    el.innerHTML = `<div class="backdrop" data-a="dialog-close"></div><div class="dlg" role="dialog" aria-modal="true">${c.type === 'cal' ? calHtml(c) : promptHtml(c)}</div>`;
    if (c.type === 'prompt') { const i = $('dlg-input'); if (i) setTimeout(() => { try { i.focus(); } catch (e) { /* не страшно */ } }, 30); }
  }

  function openCal(purpose, sel, opts) {
    opts = opts || {};
    ui.dialog = { type: 'cal', purpose, sel: sel || null, month: L.monthStart(sel || L.today()), view: opts.view || 'days', mark: !!opts.mark, field: opts.field };
    render();
  }

  function pickDate(key) {
    const c = ui.dialog;
    ui.dialog = null;
    if (c.purpose === 'day') ui.day = key;
    else if (c.purpose === 'anchor') ui.anchor = key;
    else if (c.purpose === 'field' && ui.sheet && ui.sheet.draft) {
      const dr = ui.sheet.draft;
      dr[c.field] = key;
      if (ui.sheet.type === 'fill') {
        if (c.field === 'from' && dr.to < dr.from) dr.to = dr.from;
        if (c.field === 'to' && dr.to < dr.from) dr.from = dr.to;
      }
    }
    render();
  }

  function askTag(purpose) {
    ui.dialog = { type: 'prompt', purpose, title: 'Новая тема', placeholder: 'Например: Грамматика', value: '' };
    render();
  }

  /* ---------------- общий рендер ---------------- */
  function applyTheme() {
    const th = state.settings.theme, root = document.documentElement;
    if (th === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', th);
    try {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim(), m = document.querySelector('meta[name="theme-color"]');
      if (m && bg) m.setAttribute('content', bg);
    } catch (e) { /* не страшно */ }
  }

  function render() {
    applyTheme();
    $('app').innerHTML = ui.tab === 'today' ? viewToday() : ui.tab === 'stats' ? viewStats() : viewSettings();
    const N = [['today', '✅', 'Сегодня'], ['stats', '📊', 'Статистика'], ['settings', '⚙️', 'Настройки']];
    $('nav').innerHTML = N.map((n) => `<button class="${ui.tab === n[0] ? 'on' : ''}" data-a="tab" data-v="${n[0]}"><span>${n[1]}</span>${n[2]}</button>`).join('');
    renderSheet();
    renderDialog();
    renderTimer();
  }

  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const el = $('toast');
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button id="toastBtn">${esc(actionLabel)}</button>` : ''}`;
    el.className = 'on';
    if (actionLabel) $('toastBtn').onclick = () => { el.className = ''; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, actionLabel ? 8000 : 4000);
  }

  /* ---------------- форма активности ---------------- */
  function openEdit(id) {
    const a = id && actById(id);
    const draft = a
      ? { name: a.name, kind: a.kind, block: String(a.block), goal: String(a.goal), period: a.period, tags: a.tags.slice(), color: a.color, from: a.from, required: a.required !== false }
      : { name: '', kind: 'study', block: '40', goal: '1', period: 'day', tags: [], color: COLORS[state.activities.length % COLORS.length], from: L.today(), required: true };
    ui.sheet = { type: 'edit', id: id || null, draft };
    render();
  }

  // проверяет форму и записывает активность; возвращает её или null
  function commitDraft(id) {
    const d = ui.sheet.draft;
    const name = String(d.name || '').trim();
    const block = Math.round(Number(d.block)), goal = Math.round(Number(d.goal));
    if (!name) { toast('Введи название'); return null; }
    if (!(block >= 1)) { toast('Длина подхода — минимум 1 минута'); return null; }
    if (!(goal >= 1)) { toast('Норма — минимум 1 подход'); return null; }
    const data = { name, block, goal, tags: d.tags.slice(), kind: d.kind, period: d.period, color: d.color, from: d.from || L.today(), required: !!d.required };
    let a;
    if (id) { a = actById(id); Object.assign(a, data); }
    else { a = Object.assign({ id: uid(), archived: false }, data); state.activities.push(a); }
    save();
    return a;
  }

  /* ---------------- автозаполнение прошлого ---------------- */
  function openFill(actId) {
    const a = actById(actId), yest = L.addDays(L.today(), -1);
    const days = [false, false, false, false, false, false, false];
    if (a.period === 'day') days.fill(true);
    else { const g = Math.min(a.goal, 7); for (let i = 0; i < g; i++) days[Math.floor((i * 7) / g)] = true; }
    ui.sheet = { type: 'fill', id: actId, draft: { from: a.from < yest ? a.from : yest, to: yest, per: String(a.period === 'day' ? a.goal : 1), days, skip: true, tag: '' } };
    render();
  }

  function fillPlan() {
    const s = ui.sheet, dr = s.draft, a = actById(s.id);
    const per = Math.round(Number(dr.per));
    if (!(per >= 1)) return { err: 'Укажи, сколько подходов в день' };
    if (dr.from > dr.to) return { err: 'Начальная дата позже конечной' };
    if (!dr.days.some(Boolean)) return { err: 'Выбери хотя бы один день недели' };
    const all = L.range(dr.from, dr.to);
    if (all.length > 3660) return { err: 'Слишком большой период (максимум 10 лет)' };
    const idx = L.index(state.entries), days = [];
    all.forEach((k) => {
      if (!dr.days[(L.parseKey(k).getDay() + 6) % 7]) return;
      if (dr.skip) { const r = L.rec(idx, k, a.id); if (r.n > 0 || r.m > 0) return; }
      days.push(k);
    });
    return { days, per, block: a.block };
  }

  function updateFillPreview() {
    const el = $('fill-preview');
    if (!el || !ui.sheet || ui.sheet.type !== 'fill') return;
    const p = fillPlan();
    if (p.err) { el.className = 'preview err'; el.textContent = p.err; return; }
    el.className = 'preview';
    const total = p.days.length * p.per;
    el.textContent = p.days.length
      ? `Будет добавлено: ${p.days.length} дн. × ${p.per} подх. = ${total} подх. (${L.fmtMin(total * p.block)})`
      : 'Подходящих дней нет';
  }

  function doFill() {
    const s = ui.sheet, a = actById(s.id), p = fillPlan();
    if (p.err) { toast(p.err); return; }
    if (!p.days.length) { toast('Нет подходящих дней: везде уже есть записи'); return; }
    const ids = [], tag = s.draft.tag || '', oldFrom = a.from;
    p.days.forEach((k) => {
      const id = uid(); ids.push(id);
      state.entries.push({ id, a: a.id, d: k, t: L.parseKey(k).getTime() + 12 * 3600 * 1000, n: p.per, m: p.per * a.block, tag, auto: true });
    });
    if (s.draft.from < a.from) a.from = s.draft.from;
    ui.sheet = null; save(); render();
    toast('Заполнено дней: ' + p.days.length, 'Отменить', () => {
      state.entries = state.entries.filter((e) => ids.indexOf(e.id) < 0);
      a.from = oldFrom; save(); render();
    });
  }

  /* ---------------- экспорт / импорт ---------------- */
  function exportData() {
    state.settings.lastExport = L.today(); save();
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'habit-study-' + L.today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    render();
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

    // день
    'week-prev': () => { ui.day = L.addDays(ui.day, -7); render(); },
    'week-next': () => { const n = L.addDays(ui.day, 7), tk = L.today(); ui.day = n > tk ? tk : n; render(); },
    'day-set': (el) => { ui.day = el.dataset.v; render(); },
    'day-today': () => { ui.day = L.today(); render(); },
    'open-cal': () => openCal('day', ui.day, { mark: true }),

    // подходы и таймер
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
    'tag-new-pick': () => askTag('tag-pick'),
    'early-block': () => { const s = ui.sheet; setTimer(null); ui.sheet = null; startAdd(s.id, 1, s.day); },
    'early-minutes': () => { const s = ui.sheet; setTimer(null); ui.sheet = null; addEntry(s.id, '', 0, Math.max(1, s.min), s.day); },
    'early-cancel': () => { setTimer(null); ui.sheet = null; render(); },
    'sheet-close': () => { ui.sheet = null; render(); },

    // календарь и окна
    'dialog-close': () => { ui.dialog = null; render(); },
    'cal-prev': () => {
      const c = ui.dialog;
      c.month = c.view === 'months' ? (+c.month.slice(0, 4) - 1) + c.month.slice(4) : L.shiftAnchor('month', c.month, -1);
      render();
    },
    'cal-next': () => {
      const c = ui.dialog;
      c.month = c.view === 'months' ? (+c.month.slice(0, 4) + 1) + c.month.slice(4) : L.shiftAnchor('month', c.month, 1);
      render();
    },
    'cal-title': () => { ui.dialog.view = 'months'; render(); },
    'cal-month': (el) => {
      const c = ui.dialog, mk = c.month.slice(0, 4) + '-' + L.pad(+el.dataset.v + 1) + '-01';
      if (c.purpose === 'anchor' && ui.period === 'month') { pickDate(mk); return; }
      c.month = mk; c.view = 'days'; render();
    },
    'cal-day': (el) => pickDate(el.dataset.v),
    'cal-today': () => pickDate(L.today()),
    'prompt-ok': () => {
      const dg = ui.dialog, name = String(dg.value || '').trim().replace(/\s+/g, ' ');
      if (!name) { toast('Напиши название темы'); return; }
      if (dg.purpose === 'tag-draft') {
        const tags = ui.sheet.draft.tags;
        if (tags.some((t) => t.toLowerCase() === name.toLowerCase())) { toast('Такая тема уже есть'); return; }
        tags.push(name); ui.dialog = null; render();
      } else if (dg.purpose === 'tag-pick') {
        const s = ui.sheet, a = actById(s.id);
        const ex = a.tags.find((t) => t.toLowerCase() === name.toLowerCase());
        if (!ex) a.tags.push(name);
        ui.dialog = null; ui.sheet = null;
        addEntry(a.id, ex || name, s.n, null, s.day);
      }
    },

    // статистика
    'period': (el) => { ui.period = el.dataset.v; ui.anchor = L.today(); render(); },
    'p-prev': () => { ui.anchor = L.shiftAnchor(ui.period, ui.anchor, -1); render(); },
    'p-next': () => { ui.anchor = L.shiftAnchor(ui.period, ui.anchor, 1); render(); },
    'p-pick': () => openCal('anchor', ui.anchor, { mark: true, view: ui.period === 'month' ? 'months' : 'days' }),
    'ckind': (el) => { ui.kind = el.dataset.v; render(); },

    // настройки
    'theme': (el) => {
      const t = THEMES.find((x) => x.id === el.dataset.v);
      if (!t) return;
      if (t.premium && !state.settings.pro) { toast('Эта тема будет доступна позже'); return; }
      state.settings.theme = t.id; save(); render();
    },
    'up': (el) => move(el.dataset.id, -1),
    'down': (el) => move(el.dataset.id, 1),
    'new': () => openEdit(null),
    'edit': (el) => openEdit(el.dataset.id),
    'pick-date': (el) => openCal('field', ui.sheet.draft[el.dataset.field], { field: el.dataset.field }),
    'tag-add': () => askTag('tag-draft'),
    'tag-del': (el) => { ui.sheet.draft.tags.splice(Number(el.dataset.i), 1); render(); },
    'save-act': (el) => {
      const id = el.dataset.id || null;
      const a = commitDraft(id);
      if (!a) return;
      ui.sheet = null;
      if (!id && a.from < L.today()) openFill(a.id); else render();
    },
    'open-fill': (el) => { const a = commitDraft(el.dataset.id); if (a) openFill(a.id); },
    'fill-wd': (el) => { const d = ui.sheet.draft.days, i = Number(el.dataset.i); d[i] = !d[i]; render(); },
    'fill-go': () => doFill(),
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

  // поля форм сразу пишутся в черновик, поэтому перерисовка (например, после добавления темы) ничего не стирает
  function onField(e) {
    const el = e.target;
    if (!el || !el.dataset) return;
    if (el.id === 'dlg-input' && ui.dialog) { ui.dialog.value = el.value; return; }
    const f = el.dataset.f;
    if (!f || !ui.sheet || !ui.sheet.draft) return;
    const dr = ui.sheet.draft;
    if (el.type === 'checkbox') dr[f] = el.checked;
    else if (el.type === 'radio') { if (el.checked) dr[f] = el.value; }
    else dr[f] = el.value;
    if (ui.sheet.type === 'fill') updateFillPreview();
    if (f === 'period' && ui.sheet.type === 'edit') renderSheet();
  }
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (ui.dialog) { ui.dialog = null; render(); } else if (ui.sheet) { ui.sheet = null; render(); }
    } else if (e.key === 'Enter' && ui.dialog && ui.dialog.type === 'prompt') {
      e.preventDefault(); H['prompt-ok']();
    }
  });
  $('importFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; });

  // если приложение открыто после полуночи — перейти на новый «сегодня»
  let lastDay = L.today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const now = L.today();
    if (now !== lastDay) { if (ui.day === lastDay) ui.day = now; if (ui.anchor === lastDay) ui.anchor = now; lastDay = now; }
    if (!ui.dialog) render();
  });

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* не страшно */ }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  render();
})();
