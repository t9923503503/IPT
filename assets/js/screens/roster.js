'use strict';

// ── IPT Quick-Start state ─────────────────────────────────────
let _rosterFmt    = localStorage.getItem('kotc3_roster_fmt')    || 'standard';
let _iptCourts    = parseInt(localStorage.getItem('kotc3_ipt_courts') || '2', 10);
let _iptLimit     = parseInt(localStorage.getItem('kotc3_ipt_lim')    || '21', 10);
let _iptFinish    = localStorage.getItem('kotc3_ipt_finish') || 'hard';
let _iptGender    = localStorage.getItem('kotc3_ipt_gender') || 'mixed'; // 'male'|'female'|'mixed'
let _iptSelectedIds = new Set(
  JSON.parse(localStorage.getItem('kotc3_ipt_sel') || '[]')
);

// ── IPT finals nav keys — зависят от кол-ва групп/кортов ────
function getIPTFinalsNavKeys(n) {
  if (n <= 1) return ['hard'];
  if (n === 2) return ['hard', 'lite'];
  if (n === 3) return ['hard', 'medium', 'lite'];
  return ['hard', 'advance', 'medium', 'lite'];
}

function switchRosterFmt(fmt) {
  _rosterFmt = fmt;
  localStorage.setItem('kotc3_roster_fmt', fmt);
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
  else switchTab('roster');
}

function setIPTCourts(n) {
  _iptCourts = n;
  localStorage.setItem('kotc3_ipt_courts', n);
  // Full re-render card (player count changes)
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function setIPTQuickLimit(lim) {
  _iptLimit = lim;
  localStorage.setItem('kotc3_ipt_lim', lim);
  document.querySelectorAll('#seg-ipt-lim .seg-btn').forEach((b,i) => {
    b.classList.toggle('on', [10,12,15,18,21][i] === lim);
  });
}

function setIPTQuickFinish(f) {
  _iptFinish = f;
  localStorage.setItem('kotc3_ipt_finish', f);
  document.querySelectorAll('#seg-ipt-finish .seg-btn').forEach((b,i) => {
    b.classList.toggle('on', ['hard','balance'][i] === f);
  });
}

function setIPTGender(g) {
  _iptGender = g;
  localStorage.setItem('kotc3_ipt_gender', g);
  // Сбросить выбор — игроки другого пола должны уйти из списка
  _iptSelectedIds.clear();
  localStorage.setItem('kotc3_ipt_sel', '[]');
  // Перерисовать карточку чтобы обновился список и кнопки
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
  else switchTab('roster');
}

function iptTogglePlayer(pid) {
  if (_iptSelectedIds.has(pid)) {
    _iptSelectedIds.delete(pid);
  } else {
    _iptSelectedIds.add(pid);
  }
  localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));
  // Update counter
  const needed = _iptCourts * 8;
  const cnt = document.getElementById('ipt-ps-count');
  if (cnt) {
    const sel = _iptSelectedIds.size;
    cnt.textContent = `Выбрано: ${sel} / ${needed}`;
    cnt.style.color = sel === needed ? '#6ABF69' : sel > needed ? '#e94560' : 'var(--muted)';
  }
}

function iptPlayerSearch(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.ipt-pl-item').forEach(el => {
    const name = (el.dataset.name || '').toLowerCase();
    el.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

// Нормализация гендера: M/m/male → 'm', W/w/f/female → 'w'
function _normG(p) {
  var r = String(p && p.gender || '').toLowerCase();
  return (r === 'm' || r === 'male') ? 'm' : (r === 'w' || r === 'f' || r === 'female') ? 'w' : '';
}

function _renderIPTPlayerList() {
  // Фильтр по гендеру (нормализованный)
  const gfMap = { male: 'm', female: 'w', mixed: null };
  const gf = gfMap[_iptGender] || null;

  const db = loadPlayerDB()
    .filter(p => !p.id.startsWith('ipt_quick_'))
    .filter(p => !gf || _normG(p) === gf);

  const needed = _iptCourts * 8;

  // Удаляем из выбора тех кого нет в текущем отфильтрованном списке
  const validIds = new Set(db.map(p => p.id));
  let changed = false;
  for (const id of [..._iptSelectedIds]) {
    if (!validIds.has(id)) { _iptSelectedIds.delete(id); changed = true; }
  }
  if (changed) localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));

  // Sort: previously selected first, then by name
  const sorted = [...db].sort((a, b) => {
    const aS = _iptSelectedIds.has(a.id) ? 0 : 1;
    const bS = _iptSelectedIds.has(b.id) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return (a.name || '').localeCompare(b.name || '', 'ru');
  });

  // Auto-select if nothing selected
  if (_iptSelectedIds.size === 0 && sorted.length > 0) {
    if (_iptGender === 'mixed') {
      // М/Ж: поровну — половина мужчин, половина женщин
      const half  = Math.floor(needed / 2);
      const men   = sorted.filter(p => _normG(p) === 'm').slice(0, half);
      const women = sorted.filter(p => _normG(p) === 'w').slice(0, half);
      // Если одного пола меньше — добираем из другого
      const picked = new Set([...men, ...women].map(p => p.id));
      const extra  = needed - picked.size;
      const rest   = sorted.filter(p => !picked.has(p.id));
      [...men, ...women, ...rest.slice(0, extra)]
        .forEach(p => _iptSelectedIds.add(p.id));
    } else {
      sorted.slice(0, needed).forEach(p => _iptSelectedIds.add(p.id));
    }
    localStorage.setItem('kotc3_ipt_sel', JSON.stringify([..._iptSelectedIds]));
  }

  const lvlBadge = l => {
    const map = { hard:'ХРД', medium:'МЕД', lite:'ЛАЙ', advance:'АДВ' };
    return '<span class="ipt-pl-lv ' + (l||'medium') + '">' + (map[l]||'МЕД') + '</span>';
  };

  // Генерация одного item с нумерацией
  function _item(p, idx) {
    var chk    = _iptSelectedIds.has(p.id) ? 'checked' : '';
    var gd     = _normG(p);
    var gdAttr = gd ? ' data-gender="' + gd + '"' : '';
    var num    = '<span class="ipt-pl-num">' + (idx + 1) + '</span>';
    return '<label class="ipt-pl-item"' + gdAttr
      + ' data-name="' + (p.name||'').replace(/"/g,'')
      + '" data-pid="' + p.id + '">'
      + '<input type="checkbox" ' + chk + ' onchange="iptTogglePlayer(\'' + p.id + '\')">'
      + num
      + '<span class="ipt-pl-name">' + (p.name || '—') + '</span>'
      + lvlBadge(p.level)
      + '</label>';
  }

  var listHtml = '';
  var sel  = _iptSelectedIds.size;
  var selM = 0, selW = 0;

  if (_iptGender === 'mixed') {
    // Два отдельных блока: ♂ Мужчины и ♀ Женщины
    var men   = sorted.filter(function(p) { return _normG(p) === 'm'; });
    var women = sorted.filter(function(p) { return _normG(p) === 'w'; });
    selM = [..._iptSelectedIds].filter(function(id) { return _normG(db.find(function(p){return p.id===id;})) === 'm'; }).length;
    selW = [..._iptSelectedIds].filter(function(id) { return _normG(db.find(function(p){return p.id===id;})) === 'w'; }).length;
    var halfN   = Math.floor(needed / 2);
    var mColor  = selM === halfN ? '#6ABF69' : selM > halfN ? '#e94560' : 'var(--muted)';
    var wColor  = selW === halfN ? '#6ABF69' : selW > halfN ? '#e94560' : 'var(--muted)';
    var menHtml   = men.map(_item).join('') || '<div class="sc-info" style="padding:6px 0;opacity:.5">Нет мужчин в базе</div>';
    var womenHtml = women.map(_item).join('') || '<div class="sc-info" style="padding:6px 0;opacity:.5">Нет женщин в базе</div>';

    listHtml = '<div class="ipt-pl-section">'
      + '<div class="ipt-pl-section-hdr"><span class="ipt-pl-section-icon m">♂</span> Мужчины <span class="ipt-pl-section-cnt" style="color:' + mColor + '"><b>' + selM + '</b> / ' + halfN + '</span></div>'
      + '<div class="ipt-pl-list" data-group="m">' + menHtml + '</div>'
      + '</div>'
      + '<div class="ipt-pl-section">'
      + '<div class="ipt-pl-section-hdr"><span class="ipt-pl-section-icon w">♀</span> Женщины <span class="ipt-pl-section-cnt" style="color:' + wColor + '"><b>' + selW + '</b> / ' + halfN + '</span></div>'
      + '<div class="ipt-pl-list" data-group="w">' + womenHtml + '</div>'
      + '</div>';
  } else {
    var items = sorted.map(_item).join('') || '<div class="sc-info" style="padding:12px 0">База игроков пуста. Добавьте игроков в разделе 👥</div>';
    listHtml = '<div class="ipt-pl-list">' + items + '</div>';
  }

  var countColor = sel === needed ? '#6ABF69' : sel > needed ? '#e94560' : 'var(--muted)';
  var mixInfo    = _iptGender === 'mixed' ? ' <span style="opacity:.6;font-size:.85em">(♂<b>' + selM + '</b> ♀<b>' + selW + '</b>)</span>' : '';

  return '<div class="ipt-ps-wrap">'
    + '<input class="ipt-ps-inp" type="text" placeholder="🔍 Поиск '
    + ({ male:'мужчины', female:'женщины', mixed:'игрока' }[_iptGender] || 'игрока')
    + '..." oninput="iptPlayerSearch(this.value)">'
    + listHtml
    + '<div class="ipt-ps-footer">'
    + '<span id="ipt-ps-count" style="color:' + countColor + '">Выбрано: ' + sel + ' / ' + needed + mixInfo + '</span>'
    + '<button class="ipt-ps-clear-btn" onclick="iptClearSelection()">✕ Сбросить</button>'
    + '</div></div>';
}

function iptClearSelection() {
  _iptSelectedIds.clear();
  localStorage.setItem('kotc3_ipt_sel', '[]');
  const card = document.getElementById('fmt-settings-card');
  if (card) card.outerHTML = _renderFmtCard();
}

function _renderFmtCard() {
  if (_rosterFmt === 'ipt') {
    const needed  = _iptCourts * 8;
    // Nav preview string
    // К1..К[n] — по кол-ву кортов; финалы — по getIPTFinalsNavKeys
    const kLabels = ['К1','К2','К3','К4'].slice(0, _iptCourts).join(' ');
    const fLbl    = { hard:'HD', advance:'AV', medium:'MD', lite:'LT' };
    const fLabels = getIPTFinalsNavKeys(_iptCourts).map(k => fLbl[k]).join(' ');

    return `<div class="settings-card" id="fmt-settings-card">
      <div class="sc-title">⚙️ Формат турнира</div>
      <div class="fmt-mode-tabs">
        <button class="fmt-tab" onclick="switchRosterFmt('standard')">🏐 Стандартный</button>
        <button class="fmt-tab on" onclick="switchRosterFmt('ipt')">👑 IPT Mixed</button>
      </div>

      <div class="sc-row" style="margin-top:10px">
        <span class="sc-lbl">Кортов:</span>
        <div class="seg">
          ${[1,2,3,4].map(v=>`<button class="seg-btn${_iptCourts===v?' on':''}" onclick="setIPTCourts(${v})">${v}</button>`).join('')}
        </div>
      </div>
      <div class="ipt-nav-preview">
        <span class="ipt-nav-k">${kLabels}</span>
        <span class="ipt-nav-sep">|</span>
        <span class="ipt-nav-f">${fLabels}</span>
      </div>
      <div class="sc-info" style="margin-top:0">${_iptCourts} группа(ы) × 8 игроков = <strong>${needed} чел.</strong></div>

      <div class="sc-row">
        <span class="sc-lbl">Лимит очков:</span>
        <div class="seg" id="seg-ipt-lim">
          ${[10,12,15,18,21].map(v=>`<button class="seg-btn${_iptLimit===v?' on':''}" onclick="setIPTQuickLimit(${v})">${v}</button>`).join('')}
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-lbl">Финиш:</span>
        <div class="seg" id="seg-ipt-finish">
          <button class="seg-btn${_iptFinish==='hard'?' on':''}" onclick="setIPTQuickFinish('hard')">Хард</button>
          <button class="seg-btn${_iptFinish==='balance'?' on':''}" onclick="setIPTQuickFinish('balance')">±2 Баланс</button>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-lbl">Состав:</span>
        <div class="seg" id="seg-ipt-gender">
          <button class="seg-btn${_iptGender==='male'?' on':''}" data-val="male"   onclick="setIPTGender('male')">♂ М/М</button>
          <button class="seg-btn${_iptGender==='female'?' on':''}" data-val="female" onclick="setIPTGender('female')">♀ Ж/Ж</button>
          <button class="seg-btn${_iptGender==='mixed'?' on':''}" data-val="mixed"  onclick="setIPTGender('mixed')">⚡ М/Ж</button>
        </div>
      </div>

      <div class="sc-lbl" style="margin:10px 0 4px">Участники (${needed} чел.):</div>
      ${_renderIPTPlayerList()}

      <div class="sc-btns" style="margin-top:12px">
        <button class="btn-apply ipt-launch-btn" onclick="launchQuickIPT()">🏐 Запустить IPT</button>
      </div>
    </div>`;
  }

  // Standard
  return `<div class="settings-card" id="fmt-settings-card">
    <div class="sc-title">⚙️ Формат турнира</div>
    <div class="fmt-mode-tabs">
      <button class="fmt-tab on" onclick="switchRosterFmt('standard')">🏐 Стандартный</button>
      <button class="fmt-tab" onclick="switchRosterFmt('ipt')">👑 IPT Mixed</button>
    </div>
    <div class="sc-row" style="margin-top:10px">
      <span class="sc-lbl">Кортов:</span>
      <div class="seg" id="seg-c">
        ${[1,2,3,4].map(v=>{
          const disabled = v !== 4;
          return `<button class="seg-btn${_nc===v?' on':''}" ${disabled?'disabled':''} onclick="setPending(${v},_ppc)">${v}</button>`;
        }).join('')}
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">Игроков:</span>
      <div class="seg" id="seg-n">
        ${[4,5].map(v=>{
          const disabled = v !== 4;
          return `<button class="seg-btn${_ppc===v?' on':''}" ${disabled?'disabled':''} onclick="setPending(_nc,${v})">${v}</button>`;
        }).join('')}
      </div>
    </div>
    <div class="sc-info" id="sc-info">
      ${_nc} корт(а) × ${_ppc} = <strong>${_nc*_ppc}м + ${_nc*_ppc}ж</strong>
    </div>
    <div class="sc-row" style="margin-top:10px">
      <span class="sc-lbl">Draft seed:</span>
      <input class="trn-form-inp" id="thai32-draft-seed" type="number" step="1" min="0"
        style="flex:1;min-width:120px"
        value="${escAttr(localStorage.getItem('kotc3_thai32_draft_seed') || '')}"
        placeholder="авто (если пусто)"/>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">Пары:</span>
      <button class="seg-btn fixed-pairs-toggle on" disabled onclick="toggleFixedPairs()">🔄 Ротация</button>
    </div>
    <div class="sc-btns">
      <button class="btn-apply" onclick="applySettings()">✅ Применить</button>
      <button class="btn-dist"  onclick="autoDistribute()">📋 Распределить</button>
    </div>
    <div class="sc-warn">⚠️ Изменение настроек сбросит очки</div>
  </div>`;
}

async function launchQuickIPT() {
  const needed = _iptCourts * 8;
  const selectedIds = [..._iptSelectedIds];
  if (selectedIds.length < 8) {
    showToast(`❌ Выберите минимум 8 игроков (выбрано ${selectedIds.length})`, 'error');
    return;
  }
  if (selectedIds.length !== needed) {
    const ok = await showConfirm(`Выбрано ${selectedIds.length} из ${needed}. Продолжить?`);
    if (!ok) return;
  }

  // Use selected real players from DB
  const db = loadPlayerDB();
  const participants = selectedIds
    .map(id => db.find(p => p.id === id))
    .filter(Boolean);

  if (participants.length < 8) {
    showToast('❌ Не найдены игроки в базе', 'error');
    return;
  }

  // Create / overwrite quick tournament
  let arr = getTournaments();
  arr = arr.filter(t => t.id !== 'ipt_quick');
  const trn = {
    id:           'ipt_quick',
    name:         'IPT Быстрый старт',
    format:       'IPT Mixed',
    status:       'open',
    level:        'medium',
    gender:       _iptGender,
    date:         new Date().toISOString().split('T')[0],
    venue:        '',
    capacity:     needed,
    participants: participants.map(p => p.id),
    ipt: {
      pointLimit:   _iptLimit,
      finishType:   _iptFinish,
      courts:       _iptCourts,
      gender:       _iptGender,
      currentGroup: 0,
      groups:       null
    }
  };
  arr.push(trn);
  saveTournaments(arr);

  showToast(`👑 IPT Быстрый старт — ${_iptCourts} групп(ы), ${participants.length} игроков`);
  setTimeout(() => openIPT('ipt_quick'), 300);
}

function toggleFixedPairs() {
  // ThaiVolley32 requires rotating partners each round,
  // so we force fixedPairs=false (no-op if already correct).
  if (fixedPairs === false) {
    showToast('🔄 Ротация пар обязательна для ThaiVolley32', 'error');
    return;
  }
  fixedPairs = false;
  saveState();
  // Re-render courts to update pair display
  for (let ci = 0; ci < nc; ci++) {
    const s = document.getElementById(`screen-${ci}`);
    if (s) s.innerHTML = renderCourt(ci);
  }
  updateDivisions();
  // Update toggle button label without full rebuild
  document.querySelectorAll('.fixed-pairs-toggle').forEach(el => {
    el.textContent = '🔄 Ротация';
    el.classList.toggle('on', false);
  });
  saveState();
  showToast('🔄 Ротация пар включена');
}

function toggleSolar() {
  const on = document.body.classList.toggle('solar');
  localStorage.setItem('kotc3_solar', on ? '1' : '0');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#000000' : '#0d0d1a');
  // Re-render just the theme button label without full roster rebuild
  document.querySelectorAll('.solar-toggle-roster').forEach(el => {
    el.textContent = on ? '🌙 Ночь' : '☀️ Пляж';
  });
}

function setPending(newNc, newPpc) {
  // ThaiVolley32 enforcement: ppc=4, nc=4
  _nc = 4;
  _ppc = 4;
  // Update seg buttons
  document.querySelectorAll('#seg-c .seg-btn').forEach((b)=>b.classList.toggle('on', b.textContent.trim() === '4'));
  document.querySelectorAll('#seg-n .seg-btn').forEach((b)=>b.classList.toggle('on', b.textContent.trim() === '4'));
  // Update info text
  const info = document.getElementById('sc-info');
  if (info) info.innerHTML = `${_nc} корт(а) × ${_ppc} = <strong>${_nc*_ppc}м + ${_nc*_ppc}ж</strong>`;
}

// ── ThaiVolley32 Draft Engine (1903.md) ───────────────────────
function thai32IsRealName(n) {
  const t = String(n ?? '').trim();
  if (!t) return false;
  // Auto-placeholders produced by old distribute logic
  if (/^М\d+$/.test(t) || /^Ж\d+$/.test(t)) return false;
  return true;
}

function thai32HashRandKey(seed, gender, name) {
  // Simple deterministic integer hash → [0..2^32-1]
  const s = `${seed}|${gender}|${name}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getThai32DraftSeed() {
  const el = document.getElementById('thai32-draft-seed');
  let seed = NaN;
  if (el) {
    const raw = String(el.value ?? '').trim();
    const parsed = raw === '' ? NaN : parseInt(raw, 10);
    seed = Number.isFinite(parsed) ? parsed : NaN;
  }
  if (!Number.isFinite(seed)) {
    seed = parseInt(localStorage.getItem('kotc3_thai32_draft_seed') || '', 10);
    if (!Number.isFinite(seed)) seed = Date.now() % 1000000000;
    if (el) el.value = String(seed);
  }
  localStorage.setItem('kotc3_thai32_draft_seed', String(seed));
  return seed;
}

function readRosterInputsIntoAllCourts() {
  document.querySelectorAll('.rc-inp').forEach(inp => {
    const ci = +inp.dataset.ci;
    const g = inp.dataset.g;
    const pi = +inp.dataset.pi;
    if (!isNaN(ci) && ci < 4) {
      ALL_COURTS[ci][g][pi] = inp.value.trim();
    }
  });
}

/**
 * Mutates ALL_COURTS by drafting 16M + 16W into 4 courts (groups of 8).
 * Returns used seed, or null if roster is incomplete.
 */
function runThai32DraftEngine() {
  const expected = nc * ppc; // 16
  const men = [];
  const women = [];

  for (let ci = 0; ci < nc; ci++) {
    for (let pi = 0; pi < ppc; pi++) {
      const m = ALL_COURTS[ci].men[pi];
      const w = ALL_COURTS[ci].women[pi];
      if (thai32IsRealName(m)) men.push({ name: m, src: ci * ppc + pi });
      if (thai32IsRealName(w)) women.push({ name: w, src: ci * ppc + pi });
    }
  }

  if (men.length !== expected || women.length !== expected) {
    showToast(
      `❌ Для Draft Engine нужно заполнить ровно ${expected} мужчин и ${expected} женщин (итого 32). Сейчас: М=${men.length}, Ж=${women.length}`,
      'error'
    );
    return null;
  }

  const seed = getThai32DraftSeed();

  const sortByRand = (arr, gender) =>
    [...arr].sort((a, b) => {
      const ka = thai32HashRandKey(seed, gender, a.name);
      const kb = thai32HashRandKey(seed, gender, b.name);
      if (ka !== kb) return ka - kb;
      const ln = (a.name || '').localeCompare(b.name || '', 'ru');
      if (ln !== 0) return ln;
      return a.src - b.src;
    });

  const menSorted = sortByRand(men, 'M');
  const womenSorted = sortByRand(women, 'W');

  for (let gi = 0; gi < nc; gi++) {
    ALL_COURTS[gi].men = menSorted.slice(gi * ppc, (gi + 1) * ppc).map(x => x.name);
    ALL_COURTS[gi].women = womenSorted.slice(gi * ppc, (gi + 1) * ppc).map(x => x.name);
  }

  return seed;
}

async function applySettings() {
  // ThaiVolley32 enforcement: ppc=4, nc=4
  _ppc = 4; _nc = 4; fixedPairs = false;
  if (_ppc === ppc && _nc === nc) { showToast('Настройки не изменились'); return; }
  if (!await showConfirm(`Применить: ${_nc} кортов, ${_ppc} игроков?\n\nОчки будут сброшены!`)) return;

  // Draft engine uses current roster inputs (admin can edit names before applying)
  readRosterInputsIntoAllCourts();
  const usedSeed = runThai32DraftEngine();
  if (usedSeed == null) return;

  ppc = _ppc;
  nc = _nc;
  scores    = makeBlankScores();
  divScores = makeBlankDivScores();
  divRoster = makeBlankDivRoster();
  // Reset round selectors
  for (let ci = 0; ci < nc; ci++) courtRound[ci] = 0;
  DIV_KEYS.forEach(k => { divRoundState[k] = 0; });
  saveState();
  buildAll();
  switchTab('roster');
  showToast(`⚙️ ${nc} корт(а) · ${ppc} игроков · Draft seed: ${usedSeed}`);
}

function autoDistribute() {
  // Draft engine preview/commit uses current input values
  readRosterInputsIntoAllCourts();
  const usedSeed = runThai32DraftEngine();
  if (usedSeed == null) return;

  // Reset scores so results match the drafted roster
  scores    = makeBlankScores();
  divScores = makeBlankDivScores();
  divRoster = makeBlankDivRoster();
  for (let ci = 0; ci < nc; ci++) courtRound[ci] = 0;
  DIV_KEYS.forEach(k => { divRoundState[k] = 0; });

  // Re-render court screens with updated roster
  for (let ci = 0; ci < nc; ci++) {
    const s = document.getElementById(`screen-${ci}`);
    if (s) s.innerHTML = renderCourt(ci);
  }
  saveState();
  switchTab('roster');
  showToast(`📋 Draft распределено · seed: ${usedSeed}`);
}

// ════════════════════════════════════════════════════════════
// 9. ROSTER ACTIONS
// ════════════════════════════════════════════════════════════
// saveTournamentMeta() удалена — теперь tournamentMeta
// устанавливается автоматически при добавлении турнира
// через «ТУРНИРЫ РАСПИСАНИЕ» (submitTournamentForm)

function applyRoster() {
  document.querySelectorAll('.rc-inp').forEach(inp => {
    const ci = +inp.dataset.ci, g = inp.dataset.g, pi = +inp.dataset.pi;
    if (!isNaN(ci) && ci < 4) {
      ALL_COURTS[ci][g][pi] = inp.value.trim() || (g==='men' ? `М${pi+1}` : `Ж${pi+1}`);
    }
  });
  // Refresh court screens
  for (let ci = 0; ci < nc; ci++) {
    const s = document.getElementById(`screen-${ci}`);
    if (s) s.innerHTML = renderCourt(ci);
  }
  updateDivisions();
  saveState();
  showToast('✅ Ростер сохранён');
}

async function clearRoster() {
  if (!await showConfirm('Удалить текущий состав и начать заполнение с чистого листа?')) return;
  // 1. Убрать кэш из localStorage
  localStorage.removeItem('kotc3_roster');
  // 2. Обнулить глобальные массивы ALL_COURTS
  for (let ci = 0; ci < 4; ci++) {
    ALL_COURTS[ci].men   = Array(ppc).fill('');
    ALL_COURTS[ci].women = Array(ppc).fill('');
  }
  // 3. Очистить DOM-поля (если ростер уже отрисован)
  document.querySelectorAll('.rc-inp').forEach(inp => { inp.value = ''; });
  saveState();
  showToast('🧹 Состав очищен — введите новые имена и нажмите Сохранить');
}

async function resetRosterNames() {
  if (!await showConfirm('Сбросить имена к стандартным?')) return;
  const defaults = [
    { men:['Яковлев','Жидков','Алик','Куанбеков','Юшманов'],           women:['Лебедева','Чемерис В','Настя НМ','Сайдуллина','Маргарита'] },
    { men:['Обухов','Соболев','Иванов','Грузин','Шперлинг'],            women:['Шперлинг','Шерметова','Сабанцева','Микишева','Базутова'] },
    { men:['Сайдуллин','Лебедев','Камалов','Привет','Анашкин'],         women:['Носкова','Арефьева','Кузьмина','Яковлева','Маша Привет'] },
    { men:['Игрок М1','Игрок М2','Игрок М3','Игрок М4','Игрок М5'],    women:['Игрок Ж1','Игрок Ж2','Игрок Ж3','Игрок Ж4','Игрок Ж5'] },
  ];
  defaults.forEach((d,i)=>{ ALL_COURTS[i].men=[...d.men]; ALL_COURTS[i].women=[...d.women]; });
  saveState();
  switchTab('roster');
  showToast('↺ Имена сброшены');
}

// ════════════════════════════════════════════════════════════
// 10. HISTORY LOG
// ════════════════════════════════════════════════════════════
const DIV_COURT_LABELS = { hard:'🔥 HARD', advance:'⚡ ADV', medium:'⚙️ MED', lite:'🍀 LITE' };

function addHistoryEntry(courtName, playerName, delta, newScore, courtKey) {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  tournamentHistory.unshift({
    time:   `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    court:  courtName,
    player: playerName,
    delta,
    score:  newScore,
    key:    courtKey || 'all'
  });
  if (tournamentHistory.length > 450) tournamentHistory.length = 450;
  // Живое обновление если вкладка РОСТЕР открыта
  const el = document.getElementById('admin-history-log');
  if (el) el.innerHTML = renderHistoryLog();
}

function setHistoryFilter(f) {
  historyFilter = f;
  const el = document.getElementById('admin-history-log');
  if (el) el.innerHTML = renderHistoryLog();
  // Update filter bar buttons
  document.querySelectorAll('.hf-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.f === f);
  });
}

function renderHistoryLog() {
  const filtered = historyFilter === 'all'
    ? tournamentHistory
    : tournamentHistory.filter(e => e.key === historyFilter);
  if (!filtered.length)
    return `<div class="history-empty">${tournamentHistory.length ? 'Нет событий по этому фильтру' : 'Событий пока нет — нажмите «+» на любом корте'}</div>`;
  return filtered.map(e => {
    const pos  = e.delta > 0;
    const sign = pos ? '+1' : '−1';
    const dcls = pos ? 'pos' : 'neg';
    return `<div class="history-row${pos ? '' : ' neg'}">
      <span class="history-time">[${e.time}]</span>
      <span class="history-court">${esc(e.court)}</span>
      <span class="history-player">| ${esc(e.player)}</span>
      <span class="history-delta ${dcls}">${sign}</span>
      <span class="history-total">(${e.score})</span>
    </div>`;
  }).join('');
}

function clearHistory() {
  tournamentHistory = [];
  saveState();
  const el = document.getElementById('admin-history-log');
  if (el) el.innerHTML = renderHistoryLog();
}

// ════════════════════════════════════════════════════════════
// 11. RENDER: ROSTER
// ════════════════════════════════════════════════════════════
function renderRoster() {
  const today = new Date().toISOString().split('T')[0];

  let html = `<div class="page-h">✏️ РОСТЕР</div>
  <div class="page-sub">Настройки турнира и имена игроков</div>

  ${_renderFmtCard()}

  <!-- 3. Таймер -->
  <div class="settings-card">
    <div class="sc-title">⏱ Длительность таймера</div>
    <div class="sc-row">
      <span class="sc-lbl">Корты (К1–К${nc})</span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="timer-custom-btn" onclick="timerCustomStep(0,-1)">−</button>
        <div class="timer-custom-val active" id="roster-tmr-courts">${timerState[0].preset} мин</div>
        <button class="timer-custom-btn" onclick="timerCustomStep(0,1)">+</button>
      </div>
    </div>
    <div class="sc-row">
      <span class="sc-lbl">Финалы (HD/AV/MD/LT)</span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="timer-custom-btn" onclick="timerCustomStep(4,-1)">−</button>
        <div class="timer-custom-val active" id="roster-tmr-divs">${timerState[4].preset} мин</div>
        <button class="timer-custom-btn" onclick="timerCustomStep(4,1)">+</button>
      </div>
    </div>
    <div class="sc-info">Диапазон: 2–25 минут</div>
    <div class="sc-row" style="margin-top:8px">
      <span class="sc-lbl">Тема:</span>
      <button class="solar-toggle-roster seg-btn on" onclick="toggleSolar()">
        ${document.body.classList.contains('solar') ? '🌙 Ночь' : '☀️ Пляж'}
      </button>
    </div>
  </div>

  <!-- 4. Защита ростера -->
  <div class="settings-card">
    <div class="sc-title">🔐 Доступ к ростеру</div>
    <div class="sc-info">
      ${hasRosterPassword()
        ? (rosterUnlocked
            ? 'Пароль установлен. Это устройство разблокировано до закрытия вкладки.'
            : 'Пароль установлен. Для изменения составов нужен пароль.')
        : 'Пароль не настроен. Защита хранится локально в браузере и не заменяет серверную авторизацию.'}
    </div>
    <div class="sc-row">
      <span class="sc-lbl">Статус:</span>
      <span class="sc-info" style="margin:0;padding:0;border:none;background:none">
        ${hasRosterPassword()
          ? (rosterUnlocked ? '🔓 Доступ открыт' : '🔒 Требуется пароль')
          : '⚪ Защита отключена'}
      </span>
    </div>
    <div class="sc-btns">
      <button class="btn-apply" onclick="rosterConfigurePassword()">
        ${hasRosterPassword() ? '🔁 Сменить пароль' : '🔐 Установить пароль'}
      </button>
      ${hasRosterPassword() ? `
        <button class="btn-dist" onclick="${rosterUnlocked ? 'rosterLockNow()' : 'rosterUnlockNow()'}">
          ${rosterUnlocked ? '🔒 Заблокировать' : '🔓 Разблокировать'}
        </button>
        <button class="btn-dist" style="background:#3a2230;border-color:#7a3550;color:#ffd7e4"
          onclick="rosterRemovePassword()">🗑 Убрать пароль</button>
      ` : ''}
    </div>
    <div class="sc-warn">Локальная защита: действует только на этом устройстве.</div>
  </div>`;

  // ── 5. Ростер составы ────────────────────────────────────────
  for (let ci = 0; ci < nc; ci++) {
    const ct   = ALL_COURTS[ci];
    const meta = COURT_META[ci];
    const men   = ct.men.slice(0,ppc);
    const women = ct.women.slice(0,ppc);
    const incomplete = men.some(n=>!n.trim()) || men.length < ppc;
    html += `<div class="rc-block">
      <div class="rc-hdr" style="background:linear-gradient(90deg,${meta.color}20,transparent);border-bottom:2px solid ${meta.color}35">
        <span style="color:${meta.color}">${meta.name}</span>
        <span style="font-size:11px;color:var(--muted)">${ppc}м + ${ppc}ж</span>
      </div>
      <div class="rc-grid">
        <div class="rc-col-hdr m">🏋️ Мужчины</div>
        <div class="rc-col-hdr w">👩 Женщины</div>`;
    for (let pi = 0; pi < ppc; pi++) {
      html += `
        <div class="rc-entry"><span class="rc-num">${pi+1}</span>
          <input class="rc-inp men-input" type="text" id="rc-${ci}-men-${pi}" value="${esc(men[pi]||'')}"
            data-ci="${ci}" data-g="men" data-pi="${pi}" placeholder="Фамилия"
            oninput="rosterAcShow(this)" onblur="setTimeout(rosterAcHide,200)"></div>
        <div class="rc-entry"><span class="rc-num">${pi+1}</span>
          <input class="rc-inp women-input" type="text" id="rc-${ci}-women-${pi}" value="${esc(women[pi]||'')}"
            data-ci="${ci}" data-g="women" data-pi="${pi}" placeholder="Фамилия"
            oninput="rosterAcShow(this)" onblur="setTimeout(rosterAcHide,200)"></div>`;
    }
    html += `</div>`;
    if (incomplete) html += `<div class="rc-warn">⚠️ Внимание: неполный состав</div>`;
    html += `</div>`;
  }

  // Tournament Manager + Player DB
  html += `<div class="trn-mgr-wrap" id="roster-trn-section">${_rosterTrnHtml()}</div>`;
  html += `<div class="rdb-wrap" id="roster-db-section">${_rdbBodyHtml()}</div>`;

  // ── 5. Сохранить / Сброс / Новый состав ─────────────────────
  html += `<div class="roster-save-bar">
    <button class="btn-rsr primary"   onclick="applyRoster()">✅ Сохранить</button>
    <button class="btn-rsr sec"       onclick="resetRosterNames()">↺ Сброс имён</button>
    <button class="btn-rsr danger"    onclick="clearRoster()">🧹 Новый состав</button>
  </div>`;

  // ── Низ: Завершить / Сброс / Supabase / GSheets / Backup / History ──
  html += `<button class="btn-finish" onclick="finishTournament()">
    🏁 ЗАВЕРШИТЬ ТУРНИР
  </button>
  <div style="margin-top:12px;padding:14px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(233,69,96,.2);border-radius:12px">
    <div style="color:var(--muted);font-size:12px;margin-bottom:10px;text-align:center">⚠️ Сброс очищает все результаты. Ростер сохраняется.</div>
    <button class="btn-reset-tournament" onclick="resetTournament()">🗑 Сбросить турнир</button>
  </div>

  ${renderSupabaseCard()}

  ${typeof renderAdminPanel === 'function' ? renderAdminPanel() : ''}

  ${renderGSheetsCard()}

  <div class="backup-card" id="backup-card">
    <div class="backup-title">💾 Резервное копирование</div>
    <div class="backup-sub">Сохраните все данные (игроки + турниры) в один файл.<br>Используйте для переноса между устройствами или как защиту от очистки браузера.</div>
    <div class="backup-btns">
      <button class="backup-btn export" onclick="exportData()">
        📥 Экспортировать базу
      </button>
      <label class="backup-btn import" style="cursor:pointer">
        📤 Импортировать из файла
        <input type="file" accept=".json" style="display:none"
          onchange="importData(this.files[0]);this.value=''"
          capture="">
      </label>
    </div>
    <div class="backup-info-row">
      ℹ️ Формат файла: <b>kotc3_backup_YYYY-MM-DD.json</b> · Совместим с любым устройством
    </div>
  </div>

  <div class="history-card">
    <div class="history-hdr">
      <span class="history-hdr-title">📋 Лента событий (450)</span>
      <button class="btn-clear-log" onclick="clearHistory()">Очистить</button>
    </div>
    <div class="history-filter-bar">
      ${[
        {f:'all',   label:'Все'},
        {f:'k0',    label:'К1'},
        {f:'k1',    label:'К2'},
        {f:'k2',    label:'К3'},
        {f:'k3',    label:'К4'},
        {f:'hard',    label:'🔥'},
        {f:'advance', label:'⚡'},
        {f:'medium',  label:'⚙️'},
        {f:'lite',    label:'🍀'},
      ].map(({f,label})=>`<button class="hf-btn${historyFilter===f?' on':''}" data-f="${f}" onclick="setHistoryFilter('${f}')">${label}</button>`).join('')}
    </div>
    <div class="history-list" id="admin-history-log">${renderHistoryLog()}</div>
  </div>`;
  return html;
}
