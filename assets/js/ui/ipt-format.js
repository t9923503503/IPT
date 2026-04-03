'use strict'; // ── IPT Mixed — rotation schedule & scoring logic ──

// ════════════════════════════════════════════════════════════════
// Rotation schedule: 8 players (indices 0..7), 4 rounds, 2 courts
// IPT_SCHEDULE[round][court] = { t1: [idx,idx], t2: [idx,idx] }
// Properties: each player has 4 unique partners; opponents ≤ 2 times.
// ════════════════════════════════════════════════════════════════
// ── Стандартная ротация (М/М или Ж/Ж): индексы 0..7 ──────────
const IPT_SCHEDULE = [
  // Round 0
  [ { t1:[0,1], t2:[2,3] }, { t1:[4,5], t2:[6,7] } ],
  // Round 1
  [ { t1:[0,2], t2:[4,6] }, { t1:[1,3], t2:[5,7] } ],
  // Round 2
  [ { t1:[0,4], t2:[1,6] }, { t1:[2,7], t2:[3,5] } ],
  // Round 3
  [ { t1:[0,7], t2:[2,5] }, { t1:[1,4], t2:[3,6] } ],
];

// ── Mixed ротация (М/Ж): 0..3 = мужчины, 4..7 = женщины ─────
// Каждая пара = [Мi, Жj]. Каждый М играет с каждой Ж ровно 1 раз.
const IPT_SCHEDULE_MIXED = [
  // Round 0: M0+W0 vs M1+W1, M2+W2 vs M3+W3
  [ { t1:[0,4], t2:[1,5] }, { t1:[2,6], t2:[3,7] } ],
  // Round 1: M0+W1 vs M2+W3, M1+W2 vs M3+W0
  [ { t1:[0,5], t2:[2,7] }, { t1:[1,6], t2:[3,4] } ],
  // Round 2: M0+W2 vs M3+W1, M1+W3 vs M2+W0
  [ { t1:[0,6], t2:[3,5] }, { t1:[1,7], t2:[2,4] } ],
  // Round 3: M0+W3 vs M2+W1, M1+W0 vs M3+W2
  [ { t1:[0,7], t2:[2,5] }, { t1:[1,4], t2:[3,6] } ],
];

// ── Group names by division count ─────────────────────────────
const IPT_GROUP_NAMES = {
  1: ['IPT'],
  2: ['ХАРД', 'ЛАЙТ'],
  3: ['ХАРД', 'МЕДИУМ', 'ЛАЙТ'],
  4: ['ХАРД', 'АДВАНС', 'МЕДИУМ', 'ЛАЙТ'],
};
function getIPTGroupNames(n) {
  return IPT_GROUP_NAMES[n] || Array.from({ length: n }, (_, i) => `ГРУППА ${i + 1}`);
}

/**
 * Map 8 participant IDs to the rotation schedule.
 * @param {string[]} participants — exactly 8 player IDs
 * @param {boolean} mixed — true for М/Ж mode (uses IPT_SCHEDULE_MIXED)
 * @returns {Array} rounds array ready for a group
 */
function generateIPTRounds(participants, mixed) {
  var schedule = mixed ? IPT_SCHEDULE_MIXED : IPT_SCHEDULE;
  return schedule.map((roundDef, rn) => ({
    num: rn,
    status: rn === 0 ? 'active' : 'waiting',
    courts: roundDef.map(def => ({
      team1:  def.t1.map(i => participants[i]),
      team2:  def.t2.map(i => participants[i]),
      score1: 0,
      score2: 0,
      status: rn === 0 ? 'active' : 'waiting',
    })),
  }));
}

/**
 * Dynamic round generator for N players (N >= 4, any count).
 * Generates rounds so each player plays ≈ 4 matches.
 * Minimises partner repeats greedily.
 */
function generateDynamicIPTRounds(participants) {
  const n = participants.length;
  const courtsPerRound  = Math.floor(n / 4);
  const playersPerRound = courtsPerRound * 4;
  const benchSize       = n - playersPerRound;
  const numRounds       = Math.ceil(4 * n / playersPerRound);

  const pairKey  = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const partnerCount = {};
  const getPC    = (a, b) => partnerCount[pairKey(a, b)] || 0;
  const bumpPC   = (a, b) => { const k = pairKey(a, b); partnerCount[k] = (partnerCount[k] || 0) + 1; };
  const benchHistory = new Array(n).fill(0);

  return Array.from({ length: numRounds }, (_, r) => {
    let activeIdx;
    if (benchSize === 0) {
      activeIdx = participants.map((_, i) => i);
    } else {
      const sorted = participants.map((_, i) => i)
        .sort((a, b) => benchHistory[a] !== benchHistory[b]
          ? benchHistory[a] - benchHistory[b] : a - b);
      const benchSet = new Set(sorted.slice(0, benchSize));
      sorted.slice(0, benchSize).forEach(i => benchHistory[i]++);
      activeIdx = participants.map((_, i) => i).filter(i => !benchSet.has(i));
    }

    const active  = activeIdx.map(i => participants[i]);
    const shift   = (r * courtsPerRound) % active.length;
    const rotated = active.slice(shift).concat(active.slice(0, shift));

    const courts = Array.from({ length: courtsPerRound }, (_, c) => {
      const g    = rotated.slice(c * 4, c * 4 + 4);
      const opts = [
        { t1: [g[0], g[1]], t2: [g[2], g[3]] },
        { t1: [g[0], g[2]], t2: [g[1], g[3]] },
        { t1: [g[0], g[3]], t2: [g[1], g[2]] },
      ];
      const costs = opts.map(o => getPC(o.t1[0], o.t1[1]) + getPC(o.t2[0], o.t2[1]));
      const best  = opts[costs.indexOf(Math.min(...costs))];
      bumpPC(best.t1[0], best.t1[1]);
      bumpPC(best.t2[0], best.t2[1]);
      return { team1: best.t1, team2: best.t2, score1: 0, score2: 0,
               status: r === 0 ? 'active' : 'waiting' };
    });
    return { num: r, status: r === 0 ? 'active' : 'waiting', courts };
  });
}

/**
 * Compatibility wrapper used by app screens/tests.
 * For 8 players we keep the deterministic IPT schedule,
 * otherwise we fall back to the dynamic generator.
 */
function tryGenerateIPTRoundsDynamic(participants) {
  if (!Array.isArray(participants) || participants.length < 4) return [];
  if (participants.length === 8) return generateIPTRounds(participants);
  return generateDynamicIPTRounds(participants);
}

/**
 * Build partner/opponent history from rounds.
 */
function buildIPTMatchHistory(rounds) {
  const partners = {}, opponents = {};
  const pairKey = (a, b) => { const x = String(a), y = String(b); return x < y ? `${x}|${y}` : `${y}|${x}`; };
  const bump    = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
  (rounds || []).forEach(r => (r.courts || []).forEach(c => {
    const t1 = c.team1 || [], t2 = c.team2 || [];
    if (t1.length === 2) bump(partners, pairKey(t1[0], t1[1]));
    if (t2.length === 2) bump(partners, pairKey(t2[0], t2[1]));
    t1.forEach(a => t2.forEach(b => bump(opponents, pairKey(a, b))));
  }));
  return { partners, opponents };
}

/**
 * Generate all groups from the participants list.
 * Always splits into groups of 8 (last group may have remainder).
 * @param {string[]} participants
 * @param {string} gender — 'mixed'|'male'|'female'
 * @returns {Array} groups array for trn.ipt.groups
 */
function generateIPTGroups(participants, gender) {
  const n         = participants.length;
  const numGroups = Math.max(1, Math.floor(n / 8));
  const names     = getIPTGroupNames(numGroups);
  const isMixed   = gender === 'mixed';
  const db        = typeof loadPlayerDB === 'function' ? loadPlayerDB() : [];

  return names.map((name, gi) => {
    const start   = gi * 8;
    var players = gi < numGroups - 1
      ? participants.slice(start, start + 8)
      : participants.slice(start); // last group gets remainder

    // В mixed режиме — сортируем: сначала М (0..3), потом Ж (4..7)
    if (isMixed && players.length === 8) {
      var men   = [];
      var women = [];
      players.forEach(function(pid) {
        var p = db.find(function(d) { return d.id === pid; });
        var raw = String(p && p.gender || '').toLowerCase();
        if (raw === 'w' || raw === 'f' || raw === 'female') women.push(pid);
        else men.push(pid);
      });
      // 4М + 4Ж — идеальный mixed; если только один пол — оставляем как есть
      if (men.length > 0 && women.length > 0) {
        var mixed = men.slice(0, 4).concat(women.slice(0, 4));
        var rest = players.filter(function(id) { return mixed.indexOf(id) === -1; });
        players = mixed.concat(rest).slice(0, 8);
      }
      // иначе players остаётся как есть (все 8 одного пола)
    }

    const rounds  = players.length === 8
      ? generateIPTRounds(players, isMixed)
      : generateDynamicIPTRounds(players);
    return { name, players, currentRound: 0, status: 'active', rounds };
  });
}

/**
 * Migrate legacy flat ipt structure (ipt.rounds) to ipt.groups[].
 * Safe to call multiple times.
 */
function _migrateIPTLegacy(trn) {
  const ipt = trn?.ipt;
  if (!ipt || ipt.groups) return;
  if (!ipt.rounds) return;
  const players = ipt.rounds[0]?.courts.flatMap(c => [...(c.team1||[]), ...(c.team2||[])]) || [];
  ipt.groups = [{ name: 'IPT', players, currentRound: ipt.currentRound || 0,
                  status: trn.status === 'finished' ? 'finished' : 'active',
                  rounds: ipt.rounds }];
  ipt.currentGroup = 0;
}

/**
 * Primary score P for one match result.
 * @param {number} delta  own_score − opp_score
 * @returns {number} 0 | 10 | 11 | 12 | 13
 */
function calcIPTPrimaryScore(delta) {
  if (delta <= 0)  return 0;   // поражение
  if (delta === 1) return 10;
  if (delta === 2) return 11;
  if (delta <= 4)  return 12;
  return 13;                   // delta >= 5
}

/**
 * Коэффициент K = (60 + Σδ) / (60 − Σδ). Защита от деления на 0.
 * Константа 60 — базовое значение нормировки для пляжного волейбола (диапазон мячей).
 * @param {number} diffSum  суммарная разница мячей
 * @returns {number}
 */
const IPT_K_BASE = 60;
function calcIPTKoef(diffSum) {
  const denom = IPT_K_BASE - diffSum;
  if (Math.abs(denom) < 1e-9) return 999.99;
  return (IPT_K_BASE + diffSum) / denom;
}

/**
 * Check if a match is over given point limit and finish type.
 */
function iptMatchFinished(court, pointLimit, finishType) {
  const s1 = court.score1, s2 = court.score2;
  if (finishType === 'balance') {
    if (s1 < pointLimit && s2 < pointLimit) return false;
    return Math.abs(s1 - s2) >= 2;
  }
  return s1 >= pointLimit || s2 >= pointLimit;
}

/**
 * Compute standings for a single group using the hybrid P-score system.
 * Sorting: P↓ → K↓ → balls↓
 *
 * @param {object} group — { rounds, players }
 * @param {number} pointLimit
 * @param {string} finishType
 * @returns {Array<{playerId, wins, diff, pts, balls, K, matches, tourDeltas, wr}>} sorted
 */
function calcIPTGroupStandings(group, pointLimit, finishType) {
  const rounds  = group.rounds || [];
  const numR    = rounds.length;
  const stats   = {};

  const ensure = id => {
    if (!stats[id]) stats[id] = {
      playerId: id,
      wins: 0,
      diff: 0,
      pts: 0,       // P — primary score (10/11/12/13 per win)
      balls: 0,     // sum of own scored balls
      matches: 0,
      tourDeltas: new Array(numR).fill(null), // Δ per tour
    };
  };

  rounds.forEach((round, rIdx) => {
    (round.courts || []).forEach(court => {
      const { team1, team2, score1: s1, score2: s2 } = court;
      team1.forEach(ensure); team2.forEach(ensure);
      if (s1 === 0 && s2 === 0) return;
      const done  = iptMatchFinished(court, pointLimit, finishType);
      const d1    = s1 - s2;
      const d2    = s2 - s1;
      team1.forEach(id => {
        stats[id].balls += s1;
        stats[id].diff  += d1;
        stats[id].tourDeltas[rIdx] = d1;
        if (done) {
          stats[id].pts += calcIPTPrimaryScore(d1);
          if (d1 > 0) stats[id].wins++;
          stats[id].matches++;
        }
      });
      team2.forEach(id => {
        stats[id].balls += s2;
        stats[id].diff  += d2;
        stats[id].tourDeltas[rIdx] = d2;
        if (done) {
          stats[id].pts += calcIPTPrimaryScore(d2);
          if (d2 > 0) stats[id].wins++;
          stats[id].matches++;
        }
      });
    });
  });

  return Object.values(stats)
    .map(s => ({
      ...s,
      K:  calcIPTKoef(s.diff),
      wr: s.matches ? s.wins / s.matches : 0,
    }))
    .sort((a, b) => {
      if (b.pts   !== a.pts)  return b.pts  - a.pts;
      if (b.K     !== a.K)    return b.K    - a.K;
      return b.balls - a.balls;
    });
}

/**
 * Legacy wrapper: calcIPTStandings(trn) — returns standings for the current group.
 */
function calcIPTStandings(trn) {
  _migrateIPTLegacy(trn);
  const ipt = trn.ipt;
  const gi  = ipt.currentGroup || 0;
  const g   = ipt.groups[gi];
  return g ? calcIPTGroupStandings(g, ipt.pointLimit, ipt.finishType) : [];
}

/**
 * Apply score delta to a team in a specific group.
 * @param {string} trnId
 * @param {number} groupIdx
 * @param {number} roundNum
 * @param {number} courtNum
 * @param {1|2}    team
 * @param {1|-1}   delta
 */
/**
 * Прямая установка счёта (ввод с клавиатуры по двойному тапу).
 * Вызывается из inline-input в ipt.js после подтверждения.
 */
function iptSetScore(trnId, groupIdx, roundNum, courtNum, team, value) {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn?.ipt) return;
  _migrateIPTLegacy(trn);

  const group = trn.ipt.groups[groupIdx];
  if (!group) return;
  const round = group.rounds[roundNum];
  if (!round) return;
  const court = round.courts[courtNum];
  // Разрешаем редактировать даже завершённый корт — для ручного ввода
  if (!court) return;

  const v = Math.max(0, Math.min(99, parseInt(value, 10) || 0));
  court[team === 1 ? 'score1' : 'score2'] = v;

  // Пересчитываем статус: закрываем только если ОБА счёта введены (хотя бы 1 > 0)
  // и условие завершения выполнено
  const bothEntered = court.score1 > 0 || court.score2 > 0;
  const wasFinished = court.status === 'finished';

  if (bothEntered && iptMatchFinished(court, trn.ipt.pointLimit, trn.ipt.finishType)) {
    if (!wasFinished) showToast(`✅ Матч завершён: ${court.score1} : ${court.score2}`, 'success');
    court.status = 'finished';
  } else {
    // Если счёт уменьшили ниже лимита — переоткрываем корт
    court.status = 'active';
  }

  saveTournaments(arr);
  _iptRerender();
}

function iptApplyScore(trnId, groupIdx, roundNum, courtNum, team, delta) {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn?.ipt) return;
  _migrateIPTLegacy(trn);

  const group = trn.ipt.groups[groupIdx];
  if (!group) return;
  const round = group.rounds[roundNum];
  if (!round) return;
  const court = round.courts[courtNum];
  if (!court || court.status === 'finished') return;

  const key  = team === 1 ? 'score1' : 'score2';
  court[key] = Math.max(0, court[key] + delta);

  if (iptMatchFinished(court, trn.ipt.pointLimit, trn.ipt.finishType)) {
    court.status = 'finished';
    showToast(`✅ Матч завершён: ${court.score1} : ${court.score2}`, 'success');
    playScoreSound && playScoreSound(1);
  }

  saveTournaments(arr);
  _iptRerender();
}

/**
 * Mark current round of a group finished, activate next round.
 * @param {string} trnId
 * @param {number} groupIdx
 */
function finishIPTRound(trnId, groupIdx) {
  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn?.ipt) return;
  _migrateIPTLegacy(trn);

  const group = trn.ipt.groups[groupIdx];
  if (!group) return;
  const rn = group.currentRound;
  group.rounds[rn].status = 'finished';

  if (rn + 1 < group.rounds.length) {
    group.currentRound = rn + 1;
    group.rounds[rn + 1].status = 'active';
    group.rounds[rn + 1].courts.forEach(c => c.status = 'active');
    showToast(`▶ ${group.name} — Тур ${rn + 2} начат`, 'success');
  } else {
    group.status = 'finished';
    showToast(`🏁 Группа ${group.name} завершена!`, 'success');
  }

  saveTournaments(arr);

  // Если все группы завершены — посев R2 + разблокировать финалы и перейти на HD
  const allGroupsDone = trn.ipt.groups.every(g => g.status === 'finished');
  if (allGroupsDone) {
    // Автоматический посев R2
    const r2 = generateIPTR2Groups(
      trn.ipt.groups,
      trn.ipt.pointLimit,
      trn.ipt.finishType,
      trn.ipt.gender || trn.gender || 'mixed'
    );
    if (r2.length > 0) {
      trn.ipt.r2Groups = r2;
      saveTournaments(arr);
      showToast('🏆 Все туры завершены! Посев R2 сформирован.', 'success');
    } else {
      showToast('🏆 Все туры завершены!', 'success');
    }
    if (typeof syncDivLock === 'function') syncDivLock();
    setTimeout(() => {
      if (typeof switchTab === 'function') switchTab('hard');
    }, 800);
    return;
  }

  _iptRerender();
}

/**
 * Finalize IPT tournament: compute standings per group → write winners[] → mark finished.
 */
async function finishIPT(trnId) {
  const ok = await showConfirm('Завершить IPT турнир и зафиксировать результаты?');
  if (!ok) return;

  const arr = getTournaments();
  const trn = arr.find(t => t.id === trnId);
  if (!trn?.ipt) return;
  _migrateIPTLegacy(trn);

  const ipt = trn.ipt;
  // Mark all groups finished
  ipt.groups.forEach(g => { g.status = 'finished'; });

  // Build combined winners: per group, sorted by standings
  trn.winners = [];
  ipt.groups.forEach(group => {
    const standings = calcIPTGroupStandings(group, ipt.pointLimit, ipt.finishType);
    standings.forEach((s, i) => {
      trn.winners.push({
        place:     i + 1,
        group:     group.name,
        playerIds: [s.playerId],
        points:    calculateRanking(i + 1),
        iptStats:  { wins: s.wins, diff: s.diff, pts: s.pts, balls: s.balls, K: s.K, matches: s.matches, wr: s.wr },
      });
    });
  });

  trn.status = 'finished';
  trn.history = trn.history || [];
  trn.history.push({ action: 'finished', ts: Date.now(), by: 'ipt' });

  saveTournaments(arr);
  recalcAllPlayerStats(false);
  switchTab('home');
  showToast('🏆 IPT турнир завершён! Результаты записаны.', 'success');
}

/** Internal: re-render IPT screen if it's currently active */
function _iptRerender() {
  const trnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  if (!trnId) return;
  // IPT now lives on numeric court tabs (0, 1, 2...) — re-render the active one
  if (typeof activeTabId === 'number') {
    const s = document.getElementById(`screen-${activeTabId}`);
    if (s) s.innerHTML = renderIPTGroup(activeTabId);
  } else if (activeTabId === 'ipt') {
    const s = document.getElementById('screen-ipt');
    if (s) s.innerHTML = renderIPT();
  }
  // Обновить замок финальных кнопок
  if (typeof syncDivLock === 'function') syncDivLock();
}

// ════════════════════════════════════════════════════════════════
// R2 SEEDING
// ════════════════════════════════════════════════════════════════

/**
 * Fisher-Yates shuffle (in-place).
 */
function _iptShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate R2 groups from completed R1 groups using the seeding algorithm:
 *   - Rank all 8 players of each court by P↓ → K↓ → balls↓ (unified ranking)
 *   - Separate by role (Профи = men, Новичок = women) preserving unified order
 *   - 1st Профи + 1st Новичок from each of 4 courts → HARD (4+4=8)
 *   - 2nd → ADVANCE, 3rd → MEDIUM, 4th → LIGHT
 *   - Random draw within each zone (shuffle before generating rounds)
 *
 * @param {Array}  r1Groups  — completed ipt.groups array (4 courts)
 * @param {number} pointLimit
 * @param {string} finishType
 * @param {string} gender    — 'mixed'|'male'|'female'
 * @returns {Array} new groups array for ipt.r2Groups
 */
function generateIPTR2Groups(r1Groups, pointLimit, finishType, gender) {
  const db      = typeof loadPlayerDB === 'function' ? loadPlayerDB() : [];
  const isMixed = gender === 'mixed';

  // Zone names for R2
  const ZONE_NAMES = ['ХАРД', 'АДВАНС', 'МЕДИУМ', 'ЛАЙТ'];

  // Helpers to classify player by gender from DB
  const isWoman = id => {
    const p   = db.find(d => d.id === id);
    const raw = String(p?.gender || '').toLowerCase();
    return raw === 'w' || raw === 'f' || raw === 'female';
  };

  // For each R1 court, compute standings and extract top-4 Профи + top-4 Новичок
  // (or top-8 if not mixed)
  const courtSeeds = r1Groups.map(group => {
    const standings = calcIPTGroupStandings(group, pointLimit, finishType);
    if (!isMixed) {
      // Non-mixed: all players are the same role, take top-4 only as Профи
      return { pros: standings.slice(0, 4), novs: [] };
    }
    const pros = standings.filter(s => !isWoman(s.playerId)); // men = Профи
    const novs = standings.filter(s =>  isWoman(s.playerId)); // women = Новичок
    return { pros, novs };
  });

  // Build 4 zones: each gets rank-i Профи from every court + rank-i Новичок from every court
  const zones = ZONE_NAMES.map((name, rank) => {
    const prosInZone = courtSeeds
      .map(cs => cs.pros[rank])
      .filter(Boolean)
      .map(s => s.playerId);
    const novsInZone = isMixed
      ? courtSeeds.map(cs => cs.novs[rank]).filter(Boolean).map(s => s.playerId)
      : [];

    // Shuffle within Профи and Новичок separately (random draw within zone)
    _iptShuffle(prosInZone);
    if (isMixed) _iptShuffle(novsInZone);

    // For mixed: first 4 slots = Профи, next 4 = Новичок (IPT_SCHEDULE_MIXED layout)
    // For non-mixed: just the Профи list (up to 8)
    const players = isMixed
      ? [...prosInZone.slice(0, 4), ...novsInZone.slice(0, 4)]
      : prosInZone.slice(0, 8);

    if (players.length < 4) return null;

    const rounds = players.length === 8
      ? generateIPTRounds(players, isMixed)
      : generateDynamicIPTRounds(players);

    return { name, players, currentRound: 0, status: 'active', rounds };
  }).filter(Boolean);

  return zones;
}
