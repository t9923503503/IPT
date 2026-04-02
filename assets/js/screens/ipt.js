'use strict'; // ── IPT Match screen rendering ──

let _iptActiveTrnId = null;

// ── Inline score editor (двойной тап → ввод с клавиатуры) ──────
function iptOpenEdit(el, trnId, gi, rn, cn, side) {
  if (el.querySelector('input')) return; // уже открыт
  const cur = parseInt(el.textContent, 10) || 0;

  // Заменяем div на строку: [input] [✓] + подсказка
  el.innerHTML = `
    <input  id="ipt-inp-${gi}-${rn}-${cn}-${side}"
            class="ipt-score-input"
            type="number" inputmode="numeric" pattern="[0-9]*"
            min="0" max="99" value="${cur}"
            onkeydown="if(event.key==='Enter'){iptConfirmEdit(this,'${trnId}',${gi},${rn},${cn},${side})}"
            onclick="event.stopPropagation()"
            oninput="this.value=this.value.replace(/[^0-9]/g,'')" />
    <button class="ipt-edit-ok"
            onclick="event.stopPropagation();iptConfirmEdit(this.previousElementSibling,'${trnId}',${gi},${rn},${cn},${side})">✓</button>
    <span class="ipt-edit-hint">нажмите ✓</span>`;

  const inp = el.querySelector('input');
  inp.focus();
  inp.select();
}

function iptConfirmEdit(inp, trnId, gi, rn, cn, side) {
  const val = parseInt(inp.value, 10);
  if (!isNaN(val) && val >= 0) {
    iptSetScore(trnId, gi, rn, cn, side, val);
  } else {
    _iptRerender(); // отмена — перерисовать
  }
}

// ── Entry point ───────────────────────────────────────────────
function openIPT(trnId) {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn) return;

  _migrateIPTLegacy(trn);

  const parts = trn.participants || [];
  if (parts.length < 8) {
    showToast('❌ Для IPT нужно минимум 8 участников', 'error');
    return;
  }

  // Regenerate groups if missing or count doesn't match participants
  const expectedGroups = Math.max(1, Math.floor(parts.length / 8));
  const needsGenerate  = !trn.ipt?.groups || trn.ipt.groups.length !== expectedGroups;

  if (needsGenerate) {
    if (!trn.ipt) trn.ipt = {};
    const lim = parseInt(String(trn.ipt.pointLimit ?? ''), 10);
    trn.ipt.pointLimit   = Number.isFinite(lim) && lim >= 1 ? lim : 21;
    trn.ipt.finishType   = trn.ipt.finishType || 'hard';
    trn.ipt.currentGroup = 0;
    trn.ipt.groups       = generateIPTGroups(parts, trn.ipt.gender || trn.gender || 'mixed');
    if (trn.status !== 'finished') trn.status = 'active';
    saveTournaments(arr);
  }

  _iptActiveTrnId = trnId;
  try { localStorage.setItem('kotc3_ipt_active', trnId); } catch(e) {}
  document.getElementById('td-modal')?.remove();
  // Switch to court 0 (first group) — reuses existing nav
  switchTab(0);
}

// ── Render a group embedded in a court screen (no timer) ──────
function renderIPTGroup(gi) {
  const trnId = _iptActiveTrnId
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('kotc3_ipt_active') : null);
  if (!trnId) return _iptEmptyHtml();

  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn?.ipt?.groups) return _iptEmptyHtml();
  _migrateIPTLegacy(trn);

  const ipt    = trn.ipt;
  const groups = ipt.groups;
  const group  = groups[gi];
  if (!group) return _iptEmptyHtml();

  const db   = loadPlayerDB();
  const curR = group.currentRound || 0;

  // Tour nav
  const roundNav = group.rounds.map((r, i) => {
    const isCur  = i === curR;
    const isDone = r.status === 'finished';
    // Locked until all courts of the previous tour are finished
    const prevDone = i === 0 || group.rounds[i - 1].courts.every(c => c.status === 'finished');
    const isLocked = !prevDone && !isDone && !isCur;
    return `<button class="rnd-btn${isCur ? ' active' : ''}${isDone ? ' ipt-rnd-done' : ''}"
      ${isLocked ? 'disabled title="Завершите предыдущий тур"' : ''}
      onclick="setIPTRound(${gi},${i})"
    ><span class="rn-num">${i + 1}</span><span class="rn-lbl">ТУР</span></button>`;
  }).join('');

  // Courts
  const dispRound  = group.rounds[curR];
  const courtsHtml = dispRound.courts.map((c, cn) =>
    _renderIPTCourt(trn, ipt, group, dispRound, c, cn, db, gi)
  ).join('');

  // Action buttons
  const allCourtsFinished = dispRound.courts.every(c => c.status === 'finished');
  const isLastRound       = curR === group.rounds.length - 1;
  const allRoundsDone     = group.rounds.every(r => r.status === 'finished');
  const groupFinished     = group.status === 'finished';
  const allGroupsDone     = groups.every(g => g.status === 'finished');

  let actionHtml = '';
  if (trn.status !== 'finished') {
    const btnNext = allCourtsFinished && !isLastRound && dispRound.status !== 'finished'
      ? `<button class="ipt-btn-next" onclick="finishIPTRound('${escAttr(trnId)}',${gi})">▶ Следующий раунд</button>` : '';
    const btnFinishGroup = (allRoundsDone || (isLastRound && allCourtsFinished)) && !groupFinished
      ? `<button class="ipt-btn-finish-group" onclick="finishIPTRound('${escAttr(trnId)}',${gi})">🏁 Завершить ${esc(group.name)}</button>` : '';
    const btnFinish = allGroupsDone
      ? `<button class="ipt-btn-finish" onclick="finishIPT('${escAttr(trnId)}')">🏆 Завершить турнир</button>` : '';
    if (btnNext || btnFinishGroup || btnFinish)
      actionHtml = `<div class="ipt-actions">${btnNext}${btnFinishGroup}${btnFinish}</div>`;
  }

  const statusBadge = trn.status === 'finished' ? '<span class="ipt-status-done">🏆 ЗАВЕРШЁН</span>' : '';
  const groupDoneBadge = groupFinished ? '<span class="ipt-court-badge" style="margin-left:8px">✅</span>' : '';

  return `<div class="ipt-wrap">
    <div class="ipt-group-header">
      <span class="ipt-group-title">${esc(group.name)}</span>${groupDoneBadge}${statusBadge}
      <span class="ipt-meta-inline">⚡${ipt.pointLimit} · ${ipt.finishType === 'balance' ? '±2' : 'хард'}</span>
    </div>
    <div class="round-nav-inner">${roundNav}</div>
    <div class="ipt-courts-wrap">${courtsHtml}</div>
    ${_renderIPTCrossTable(group, ipt, db)}
    ${actionHtml}
  </div>`;
}

// ── Render finals for a division screen (HD/MD/etc.) ─────────
function renderIPTFinals(trn, finalsGroupIdx) {
  if (!trn?.ipt?.groups) return _iptEmptyHtml();
  _migrateIPTLegacy(trn);

  const ipt    = trn.ipt;
  const db     = loadPlayerDB();
  const groups = ipt.groups;

  // Collect top players from each group, sorted by standings
  // Finals bracket: top-N from each group compete together
  const numGroups = groups.length;

  // finalsGroupIdx 0 = Winners (top half), 1 = Losers (bottom half)
  const allStandings = groups.flatMap(g => {
    const st = calcIPTGroupStandings(g, ipt.pointLimit, ipt.finishType);
    return st.map((s, i) => ({ ...s, groupName: g.name, groupRank: i + 1 }));
  });

  const half    = Math.ceil(allStandings.length / 2);
  const bracket = finalsGroupIdx === 0
    ? allStandings.slice(0, half)
    : allStandings.slice(half);

  const title  = finalsGroupIdx === 0
    ? `🏆 Финал победителей (места 1–${half})`
    : `🥉 Финал проигравших (места ${half + 1}–${allStandings.length})`;

  const MEDALS = ['🥇', '🥈', '🥉'];
  const rows = bracket.map((s, i) => {
    const name    = db.find(p => p.id === s.playerId)?.name || '?';
    const medal   = MEDALS[finalsGroupIdx === 0 ? i : i + half] || `${finalsGroupIdx === 0 ? i + 1 : i + half + 1}`;
    const diffStr = s.diff >= 0 ? `+${s.diff}` : `${s.diff}`;
    const dCls    = s.diff > 0 ? 'pos' : s.diff < 0 ? 'neg' : '';
    const kFmt    = s.K >= 100 ? s.K.toFixed(0) : s.K.toFixed(2);
    return `<tr class="${i < 3 && finalsGroupIdx === 0 ? 'ipt-top3' : ''}">
      <td class="ipt-st-rank">${medal}</td>
      <td class="ipt-st-name">${esc(name)}</td>
      <td class="ipt-st-group">${esc(s.groupName)}</td>
      <td class="ipt-st-wins">${s.wins}</td>
      <td class="ipt-st-diff ${dCls}">${diffStr}</td>
      <td class="ipt-st-pk"><span class="ipt-pk-pts">${s.pts}</span><span class="ipt-pk-k">${kFmt}</span></td>
      <td class="ipt-st-diff">${s.balls}</td>
    </tr>`;
  }).join('');

  return `<div class="ipt-wrap">
    <div class="ipt-header">
      <div class="ipt-title-row"><span class="ipt-title">${title}</span></div>
      <div class="ipt-trnname">${esc(trn.name)}</div>
    </div>
    <div class="ipt-standings">
      <table class="ipt-standings-tbl">
        <thead><tr><th>#</th><th>Игрок</th><th>Гр.</th><th>В</th><th>±</th><th>P / K</th><th>Мячи</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${trn.status !== 'finished' ? `<div class="ipt-actions">
      <button class="ipt-btn-finish" onclick="finishIPT('${escAttr(trn.id)}')">🏆 Завершить турнир</button>
    </div>` : ''}
  </div>`;
}

// ── Court card ────────────────────────────────────────────────
function _renderIPTCourt(trn, ipt, group, round, court, cn, db, gi) {
  const trnId    = trn.id;
  const rn       = round.num;
  const finished = court.status === 'finished';
  const waiting  = court.status === 'waiting';
  // Round is read-only if the round itself is marked finished (completed tour)
  const roundDone = round.status === 'finished';
  const s1 = court.score1, s2 = court.score2;
  const winner   = finished ? (s1 > s2 ? 1 : s2 > s1 ? 2 : 0) : 0;

  const n1 = court.team1.map(id => esc(db.find(p => p.id === id)?.name || '?'));
  const n2 = court.team2.map(id => esc(db.find(p => p.id === id)?.name || '?'));

  const colors = ['#FFD700', '#4DA8DA', '#6ABF69', '#E87040'];
  const color  = colors[cn] || '#9B8EC4';
  const label  = ['🏅 КОРТ A', '🔷 КОРТ B', '🟢 КОРТ C', '🔶 КОРТ D'][cn] || `КОРТ ${cn + 1}`;

  const dis1m = s1 <= 0 || finished || waiting || roundDone ? 'disabled' : '';
  const dis1p = finished || waiting || roundDone ? 'disabled' : '';
  const dis2m = s2 <= 0 || finished || waiting || roundDone ? 'disabled' : '';
  const dis2p = finished || waiting || roundDone ? 'disabled' : '';

  const tid = escAttr(trnId);
  const teamHtml = (names, score, side, disM, disP, winnerSide) => {
    // Double-tap for manual entry — disabled on finished rounds and waiting courts
    const editable = !waiting && !roundDone;
    const scoreEl  = editable
      ? `<div class="ipt-score${winnerSide ? ' win' : winner && !winnerSide ? ' lose' : ''} ipt-score-tap"
            title="Двойной тап — ввод с клавиатуры"
            ondblclick="iptOpenEdit(this,'${tid}',${gi},${rn},${cn},${side})">${score}</div>`
      : `<div class="ipt-score${winnerSide ? ' win' : winner && !winnerSide ? ' lose' : ''}">${score}</div>`;
    return `
    <div class="ipt-team${winnerSide ? ' ipt-team-win' : ''}">
      <div class="ipt-team-names">${names.join('<span class="ipt-amp"> + </span>')}</div>
      <div class="ipt-score-row">
        <button class="ipt-score-btn ipt-minus" ${disM}
          onclick="iptApplyScore('${tid}',${gi},${rn},${cn},${side},-1)">−</button>
        ${scoreEl}
        <button class="ipt-score-btn ipt-plus" ${disP}
          onclick="iptApplyScore('${tid}',${gi},${rn},${cn},${side},1)">+</button>
      </div>
    </div>`;
  };

  return `<div class="ipt-court${finished ? ' ipt-court-done' : waiting ? ' ipt-court-wait' : ''}" style="--ipt-c:${color}">
    <div class="ipt-court-hdr">
      <span class="ipt-court-lbl">${label}</span>
      ${finished ? '<span class="ipt-court-badge">✅ ЗАВЕРШЕНО</span>' : ''}
      ${waiting  ? '<span class="ipt-court-badge wait">⏳ ОЖИДАНИЕ</span>' : ''}
      ${roundDone && !finished ? '<span class="ipt-court-badge">🔒 ТУР ЗАВЕРШЁН</span>' : ''}
    </div>
    <div class="ipt-matchup">
      ${teamHtml(n1, s1, 1, dis1m, dis1p, winner === 1)}
      <div class="ipt-vs"><span class="ipt-vs-lbl">VS</span></div>
      ${teamHtml(n2, s2, 2, dis2m, dis2p, winner === 2)}
    </div>
  </div>`;
}

// ── Cross-table standings: Игрок × Туры (Δ) + Итого(Δ) P K Мячи Победы Место ──
function _renderIPTCrossTable(group, ipt, db) {
  if (!db) db = loadPlayerDB();
  const rounds   = group.rounds || [];
  const players  = group.players || [];
  if (!players.length) return '';

  // Get Δ for a player in a specific round (null=not played, 'БЕН'=benched)
  const getDelta = (playerId, rIdx) => {
    const r = rounds[rIdx];
    if (!r) return null;
    for (const c of r.courts) {
      const inT1 = (c.team1 || []).includes(playerId);
      const inT2 = (c.team2 || []).includes(playerId);
      if (!inT1 && !inT2) continue;
      // Only show if at least one score entered
      if (c.score1 === 0 && c.score2 === 0) return null;
      return inT1 ? c.score1 - c.score2 : c.score2 - c.score1;
    }
    return 'БЕН'; // benched
  };

  const standings = calcIPTGroupStandings(group, ipt.pointLimit, ipt.finishType);
  const MEDALS = ['🥇', '🥈', '🥉'];
  const numR   = rounds.length;

  const tourHeaders = Array.from({ length: numR }, (_, i) =>
    `<th class="ipt-xt-rnd">Тур ${i + 1}</th>`
  ).join('');

  const rows = standings.map((s, rank) => {
    const name      = db.find(p => p.id === s.playerId)?.name || '?';
    const medal     = MEDALS[rank] || `<span class="ipt-rank-num">${rank + 1}</span>`;
    const totalDiff = s.diff >= 0 ? `+${s.diff}` : `${s.diff}`;
    const dCls      = s.diff > 0 ? 'pos' : s.diff < 0 ? 'neg' : '';
    const kFmt      = s.K >= 100 ? s.K.toFixed(0) : s.K.toFixed(2);

    const tourCells = Array.from({ length: numR }, (_, i) => {
      const d = getDelta(s.playerId, i);
      if (d === null)    return `<td class="ipt-xt-cell empty">—</td>`;
      if (d === 'БЕН')   return `<td class="ipt-xt-cell bench">—</td>`;
      const sign = d > 0 ? '+' : '';
      const cls  = d > 0 ? 'pos' : d < 0 ? 'neg' : '';
      return `<td class="ipt-xt-cell ipt-xt-delta ${cls}">${sign}${d}</td>`;
    }).join('');

    return `<tr class="${rank < 3 ? 'ipt-top3' : ''}">
      <td class="ipt-st-rank">${medal}</td>
      <td class="ipt-st-name">${esc(name)}</td>
      ${tourCells}
      <td class="ipt-xt-cell ipt-st-diff ${dCls}">${totalDiff}</td>
      <td class="ipt-xt-cell ipt-st-pk"><span class="ipt-pk-pts">${s.pts}</span><span class="ipt-pk-k">${kFmt}</span></td>
      <td class="ipt-xt-cell">${s.balls}</td>
      <td class="ipt-xt-cell">${s.wins}</td>
      <td class="ipt-xt-cell ipt-st-place">${rank + 1}</td>
    </tr>`;
  }).join('');

  return `<div class="ipt-standings">
    <div class="ipt-standings-ttl">📊 Таблица — ${esc(group.name)}</div>
    <div class="ipt-xt-scroll">
      <table class="ipt-standings-tbl ipt-xt-tbl">
        <thead><tr>
          <th>#</th><th class="ipt-xt-name-hdr">Игрок</th>
          ${tourHeaders}
          <th title="Суммарная разница мячей">Итого(Δ)</th>
          <th title="Очки (P) и Коэффициент (K)">P / K</th>
          <th title="Сумма набранных мячей">Мячи</th>
          <th title="Количество побед">В</th>
          <th title="Место на корте">М</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ── Round switch ──────────────────────────────────────────────
function setIPTRound(gi, roundNum) {
  const trnId = _iptActiveTrnId
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('kotc3_ipt_active') : null);
  if (!trnId) return;
  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn?.ipt) return;
  _migrateIPTLegacy(trn);
  const group = trn.ipt.groups[gi];
  if (!group) return;
  group.currentRound = roundNum;
  saveTournaments(arr);
  _iptRerender();
}

// ── Empty state ───────────────────────────────────────────────
function _iptEmptyHtml() {
  return `<div class="ipt-wrap"><div class="ipt-empty">
    <div style="font-size:3rem">🏐</div>
    <div>Нет активного IPT турнира</div>
    <button class="ipt-btn-back" onclick="switchTab('home')">← Список турниров</button>
  </div></div>`;
}

// ── Legacy: old renderIPT() kept as fallback for screen-ipt ──
function renderIPT() {
  return renderIPTGroup(0);
}
