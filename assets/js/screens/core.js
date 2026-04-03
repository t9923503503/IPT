'use strict';

// ════════════════════════════════════════════════════════════
// 2. CORE MATH
// ════════════════════════════════════════════════════════════
function partnerW(mi, ri){ return fixedPairs ? mi : (mi + ri) % ppc; }
function partnerM(wi, ri){ return fixedPairs ? wi : ((wi - ri) % ppc + ppc) % ppc; }

function manRounds(ci, mi) {
  return Array.from({length:ppc}, (_,ri) => scores[ci]?.[mi]?.[ri] ?? null);
}
function womanRounds(ci, wi) {
  return Array.from({length:ppc}, (_,ri) => scores[ci]?.[partnerM(wi,ri)]?.[ri] ?? null);
}

// ThaiVolley32 (1903.md) — R1 helpers
// Points map for a single match by diff (ownBalls - oppBalls):
// >=7 → 3, 3–6 → 2, 1–2 → 1, <=0 → 0
function thaiDiffToPts(diff){
  if (diff >= 7) return 3;
  if (diff >= 3) return 2;
  if (diff >= 1) return 1;
  return 0;
}

// Deterministic perfect matching within a tour for ppc=4 (from 1903.md table).
// Returns pairs of team indices [miA, miB] that play each other at this tour (ri).
function iptMatchupsR1(ri){
  if (ppc !== 4) return [];
  if (ri === 0) return [[0,1],[2,3]];
  if (ri === 1) return [[0,2],[1,3]];
  if (ri === 2) return [[0,3],[1,2]];
  // ri === 3
  return [[0,3],[1,2]];
}

// Deterministic opponent within a tour for ppc=4.
// mi is "team index" in scores[ci][mi][ri] (man side).
function iptOppIdxR1(mi, ri){
  const pairs = iptMatchupsR1(ri);
  for (const [a, b] of pairs) {
    if (a === mi) return b;
    if (b === mi) return a;
  }
  return null;
}

// K = (60 + Σdiff) / (60 - Σdiff) with protection
function thaiCalcK(diffSum){
  const denom = 60 - diffSum;
  if (Math.abs(denom) < 1e-9) return 999.99;
  return (60 + diffSum) / denom;
}

// Returns sorted array for a single court+gender
// ThaiVolley32 R1 ranking sort:
// wins → diff → pts → K → balls
function getRanked(ci, gender) {
  const arr = [];
  for (let i = 0; i < ppc; i++) {
    let wins = 0;
    let diff = 0;
    let pts = 0;      // earned points (mapped from diff per match)
    let balls = 0;    // total ownBalls across tours
    let bestRound = 0; // max ownBalls across tours
    let rPlayed = 0;  // tours where we had both sides scores

    for (let ri = 0; ri < ppc; ri++) {
      let own = null;
      let opp = null;

      if (gender === 'M') {
        own = scores[ci]?.[i]?.[ri] ?? null;
        const oppMi = iptOppIdxR1(i, ri);
        opp = oppMi == null ? null : (scores[ci]?.[oppMi]?.[ri] ?? null);
      } else {
        // For a woman player i at tour ri, her team is man index partnerM(i,ri)
        const manIdx = partnerM(i, ri);
        own = scores[ci]?.[manIdx]?.[ri] ?? null;
        const oppMan = iptOppIdxR1(manIdx, ri);
        opp = oppMan == null ? null : (scores[ci]?.[oppMan]?.[ri] ?? null);
      }

      if (own === null || opp === null) continue;
      const d = own - opp;
      if (own > bestRound) bestRound = own;
      balls += own;
      diff += d;
      pts += thaiDiffToPts(d);
      if (d > 0) wins++;
      rPlayed++;
    }

    const K = thaiCalcK(diff);
    arr.push({ idx:i, pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort((a,b) => {
    if (b.wins  !== a.wins)  return b.wins  - a.wins;
    if (b.diff  !== a.diff)  return b.diff  - a.diff;
    if (b.pts   !== a.pts)   return b.pts   - a.pts;
    if (b.K     !== a.K)     return b.K     - a.K;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.idx - b.idx; // stable
  });

  // Assign place with tie marker: identical up to K and balls
  const EPS = 1e-9;
  arr.forEach((x, i, s) => {
    const prev = s[i - 1];
    const tied = !!prev &&
      prev.wins === x.wins &&
      prev.diff === x.diff &&
      prev.pts === x.pts &&
      Math.abs(prev.K - x.K) < EPS &&
      prev.balls === x.balls;
    x.place = tied ? prev.place : i + 1;
    x.tied = tied;
  });

  return arr;
}

// Global ranking across all active courts
function getAllRanked() {
  const out = { M:[], W:[] };
  for (const gender of ['M','W']) {
    const all = [];
    for (let ci = 0; ci < nc; ci++) {
      const ct   = ALL_COURTS[ci];
      const meta = COURT_META[ci];
      getRanked(ci, gender).forEach(r => {
        all.push({
          pts: r.pts,
          diff: r.diff,
          wins: r.wins,
          K: r.K,
          balls: r.balls,
          bestRound: r.bestRound,
          rPlayed: r.rPlayed,
          courtPlace: r.place,
          tied: r.tied,
          name:      gender==='M' ? ct.men[r.idx]   : ct.women[r.idx],
          courtName: meta.name, courtColor: meta.color,
          gender, genderIcon: gender==='M' ? '🏋️' : '👩',
          originalCourtIndex: ci * ppc + r.idx,
        });
      });
    }
    // Global sort with same tie-breaking
    all.sort((a,b) => {
      if (b.wins  !== a.wins)  return b.wins  - a.wins;
      if (b.diff  !== a.diff)  return b.diff  - a.diff;
      if (b.pts   !== a.pts)   return b.pts   - a.pts;
      if (b.K     !== a.K)     return b.K     - a.K;
      if (b.balls !== a.balls) return b.balls - a.balls;
      return a.originalCourtIndex - b.originalCourtIndex;
    });
    // Assign global rank (shared rank for equal pts)
    all.forEach((p,i,arr) => {
      const prev = arr[i - 1];
      const EPS = 1e-9;
      const tied = !!prev &&
        prev.wins === p.wins &&
        prev.diff === p.diff &&
        prev.pts === p.pts &&
        Math.abs(prev.K - p.K) < EPS &&
        prev.balls === p.balls;
      p.globalRank = tied ? prev.globalRank : i + 1;
      p.globalTied = tied;
    });
    out[gender] = all;
  }
  return out;
}

// R2 seeding (HARD/ADV/MED/LIGHT) from R1 courts (1903.md):
// - HARD: winners from courts 1..3 + best 2nd among courts 1..3
// - ADV: all players from court 4
// - MED: remaining 2nd among courts 1..3 + best 2 third among courts 1..3
// - LIGHT: remaining 3rd among courts 1..3 + all 4th from courts 1..3
function seedR2FromR1(gender){
  // Fallback to old slicing if config doesn't match Thai32 expectations
  if (ppc !== 4 || nc !== 4) {
    const ranked = getAllRanked();
    const keys = activeDivKeys();
    const result = {};
    keys.forEach((key, i) => {
      const start = i * ppc;
      const end = start + ppc;
      result[key] = ranked[gender].slice(start, end);
    });
    return result;
  }

  const courts = [0,1,2,3]; // 1..4 in docs
  const rankedByCourt = courts.map(ci => getRanked(ci, gender));

  const toPlayer = (ci, r) => {
    const ct = ALL_COURTS[ci];
    const meta = COURT_META[ci];
    return {
      idx: r.idx,
      name: gender === 'M' ? ct.men[r.idx] : ct.women[r.idx],
      pts: r.pts,
      diff: r.diff,
      wins: r.wins,
      K: r.K,
      balls: r.balls,
      bestRound: r.bestRound,
      rPlayed: r.rPlayed,
      courtPlace: r.place,
      tied: r.tied,
      gender,
      genderIcon: gender === 'M' ? '🏋️' : '👩',
      courtName: meta.name,
      courtColor: meta.color,
      originalCourtIndex: ci * ppc + r.idx,
    };
  };

  const secondCandidates = courts.slice(0,3).map(ci => toPlayer(ci, rankedByCourt[ci][1]));
  const thirdCandidates  = courts.slice(0,3).map(ci => toPlayer(ci, rankedByCourt[ci][2]));
  const fourthCandidates = courts.slice(0,3).map(ci => toPlayer(ci, rankedByCourt[ci][3]));

  const keySort = (a,b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    // K may be float — round for stable compares
    const kA = Math.round(a.K * 1e6);
    const kB = Math.round(b.K * 1e6);
    if (kB !== kA) return kB - kA;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.originalCourtIndex - b.originalCourtIndex;
  };

  const bestSecond = [...secondCandidates].sort(keySort)[0];

  const remainingSeconds = secondCandidates
    .filter(p => p.originalCourtIndex !== bestSecond.originalCourtIndex);

  const sortedThird = [...thirdCandidates].sort(keySort);
  const bestTwoThird = sortedThird.slice(0,2);
  const remainingThird = sortedThird[2];

  // Zones (each must have exactly ppc players)
  const hard = [
    toPlayer(0, rankedByCourt[0][0]),
    toPlayer(1, rankedByCourt[1][0]),
    toPlayer(2, rankedByCourt[2][0]),
    bestSecond,
  ];

  const advance = toPlayer(3, rankedByCourt[3][0]) && [
    ...rankedByCourt[3].slice(0,4).map((r) => toPlayer(3, r)),
  ];

  const medium = [
    ...remainingSeconds.sort((a,b)=>a.originalCourtIndex-b.originalCourtIndex),
    ...bestTwoThird, // already ordered by keySort (best first)
  ];

  const lite = [
    remainingThird,
    ...fourthCandidates.sort((a,b)=>a.originalCourtIndex-b.originalCourtIndex),
  ];

  return { hard, advance, medium, lite };
}

function getSvod() {
  const result = { hard:{M:[],W:[]}, advance:{M:[],W:[]}, medium:{M:[],W:[]}, lite:{M:[],W:[]} };
  const seededM = seedR2FromR1('M');
  const seededW = seedR2FromR1('W');
  DIV_KEYS.forEach(k => {
    if (!activeDivKeys().includes(k)) return;
    result[k].M = seededM[k] || [];
    result[k].W = seededW[k] || [];
  });
  return result;
}

// Division court helpers
function divPartnerW(mi, ri, Nd){ return (mi + ri) % Nd; }
function divPartnerM(wi, ri, Nd){ return ((wi - ri) % Nd + Nd) % Nd; }

function divManRounds(key, mi) {
  const Nd = divRoster[key].men.length;
  return Array.from({length:Nd}, (_,ri) => (divScores[key][mi]??[])[ri] ?? null);
}
function divWomanRounds(key, wi) {
  const Nd = divRoster[key].men.length;
  return Array.from({length:Nd}, (_,ri) => {
    const mi = divPartnerM(wi, ri, Nd);
    return (divScores[key][mi]??[])[ri] ?? null;
  });
}
function divGetRanked(key, gender) {
  const names = gender==='M' ? divRoster[key].men : divRoster[key].women;
  const Nd = names.length;
  if (!Nd) return [];

  const arr = [];
  for (let i = 0; i < Nd; i++) {
    let wins = 0;
    let diff = 0;
    let pts = 0;
    let balls = 0;
    let bestRound = 0;
    let rPlayed = 0;

    for (let ri = 0; ri < Nd; ri++) {
      let own = null;
      let opp = null;

      if (gender === 'M') {
        own = (divScores[key]?.[i] ?? [])[ri] ?? null;
        const oppMi = iptOppIdxR1(i, ri);
        opp = oppMi == null ? null : ((divScores[key]?.[oppMi] ?? [])[ri] ?? null);
      } else {
        const manIdx = divPartnerM(i, ri, Nd);
        own = (divScores[key]?.[manIdx] ?? [])[ri] ?? null;
        const oppMan = iptOppIdxR1(manIdx, ri);
        opp = oppMan == null ? null : ((divScores[key]?.[oppMan] ?? [])[ri] ?? null);
      }

      if (own === null || opp === null) continue;
      const d = own - opp;
      if (own > bestRound) bestRound = own;
      balls += own;
      diff += d;
      pts += thaiDiffToPts(d);
      if (d > 0) wins++;
      rPlayed++;
    }

    const K = thaiCalcK(diff);
    arr.push({ idx:i, name: names[i], pts, diff, wins, K, balls, bestRound, rPlayed });
  }

  arr.sort((a,b) => {
    if (b.wins  !== a.wins)  return b.wins  - a.wins;
    if (b.diff  !== a.diff)  return b.diff  - a.diff;
    if (b.pts   !== a.pts)   return b.pts   - a.pts;
    if (b.K     !== a.K)     return b.K     - a.K;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.idx - b.idx;
  });

  const EPS = 1e-9;
  arr.forEach((x, i, s) => {
    const prev = s[i - 1];
    const tied = !!prev &&
      prev.wins === x.wins &&
      prev.diff === x.diff &&
      prev.pts === x.pts &&
      Math.abs(prev.K - x.K) < EPS &&
      prev.balls === x.balls;
    x.place = tied ? prev.place : i + 1;
    x.tied = tied;
  });

  return arr;
}


// ════════════════════════════════════════════════════════════
// 2b. COMBINED STATS HELPER
// Returns all played round scores for a player across Stage 1 + Finals
// ════════════════════════════════════════════════════════════
function getAllRoundsForPlayer(p) {
  const allRounds = [];
  // Stage 1 rounds
  for (let ci = 0; ci < nc; ci++) {
    const arr = p.gender === 'M' ? ALL_COURTS[ci].men : ALL_COURTS[ci].women;
    const idx = arr.findIndex((n, i) => n === p.name &&
      (p.gender === 'M' ? manRounds(ci, i) : womanRounds(ci, i)).some(r => r !== null));
    if (idx >= 0) {
      const rds = (p.gender === 'M' ? manRounds(ci, idx) : womanRounds(ci, idx))
        .filter(r => r !== null);
      allRounds.push(...rds);
      break;
    }
  }
  // Finals rounds — search all divisions
  for (const key of activeDivKeys()) {
    const arr = p.gender === 'M' ? divRoster[key].men : divRoster[key].women;
    const idx = arr.indexOf(p.name);
    if (idx >= 0) {
      const rds = (p.gender === 'M' ? divManRounds(key, idx) : divWomanRounds(key, idx))
        .filter(r => r !== null);
      allRounds.push(...rds);
      break;
    }
  }
  return allRounds;
}

// ════════════════════════════════════════════════════════════
// 3. PERSISTENCE
// ════════════════════════════════════════════════════════════
function saveState() {
  try {
    localStorage.setItem('kotc_version',     '1.1');
    localStorage.setItem('kotc3_cfg',        JSON.stringify({ ppc, nc, fixedPairs }));
    localStorage.setItem('kotc3_scores',     JSON.stringify(scores));
    localStorage.setItem('kotc3_roster',     JSON.stringify(ALL_COURTS.map(c=>({men:[...c.men],women:[...c.women]}))));
    localStorage.setItem('kotc3_divscores',  JSON.stringify(divScores));
    localStorage.setItem('kotc3_divroster',  JSON.stringify(divRoster));
    localStorage.setItem('kotc3_meta',       JSON.stringify(tournamentMeta));
    localStorage.setItem('kotc3_eventlog',   JSON.stringify(tournamentHistory));
  } catch(e){ console.error('[saveState] Failed to persist state:', e); }
  sbPush(); // синхронизировать с Supabase
}

function loadState() {
  try {
    // Version migration: if old version or no version, clear scores to avoid corruption
    const ver = localStorage.getItem('kotc_version');
    const verNum = ver ? ver.split('.').map(Number).reduce((a, v, i) => a + v * Math.pow(100, 2 - i), 0) : 0;
    if (verNum < 101) {
      ['kotc3_scores','kotc3_divscores','kotc3_divroster'].forEach(k=>localStorage.removeItem(k));
      localStorage.setItem('kotc_version','1.1');
    }
    // ThaiVolley32 enforcement:
    // - ppc=4, nc=4
    // - fixedPairs must stay off to keep rotating partners
    // This "replace existing" mode should not depend on what was saved before.
    const cfg = localStorage.getItem('kotc3_cfg');
    if (cfg) {
      // Keep side effects (e.g., future migrations) but hard-clamp current mode.
      ppc = 4; nc = 4;
      _ppc = ppc; _nc = nc;
      fixedPairs = false;
    }
    const r = localStorage.getItem('kotc3_roster');
    if (r) {
      const pr = JSON.parse(r);
      if (Array.isArray(pr)) pr.forEach((ct,ci) => {
        if (ci < 4) {
          if (Array.isArray(ct.men))   ALL_COURTS[ci].men   = ct.men.slice(0,5);
          if (Array.isArray(ct.women)) ALL_COURTS[ci].women = ct.women.slice(0,5);
        }
      });
    }
    const sc = localStorage.getItem('kotc3_scores');
    if (sc) {
      const ps = JSON.parse(sc);
      if (Array.isArray(ps)) ps.forEach((court,ci) => {
        if (ci >= 4 || !Array.isArray(court)) return;
        court.forEach((row,mi) => {
          if (mi >= 5 || !Array.isArray(row)) return;
          row.forEach((val,ri) => {
            if (ri < ppc && scores[ci]?.[mi]) scores[ci][mi][ri] = (val === null || val === undefined) ? null : Number(val);
          });
        });
      });
    }
    const ds = localStorage.getItem('kotc3_divscores');
    if (ds) { const pd=JSON.parse(ds); if(pd) DIV_KEYS.forEach(k=>{if(pd[k]) divScores[k]=pd[k];}); }
    const dr = localStorage.getItem('kotc3_divroster');
    const mt = localStorage.getItem('kotc3_meta');
    if (mt) { try { tournamentMeta = JSON.parse(mt); } catch(e){} }
    if (dr) { const pd=JSON.parse(dr); if(pd) DIV_KEYS.forEach(k=>{if(pd[k]) divRoster[k]=pd[k];}); }
    const hs = localStorage.getItem('kotc3_eventlog');
    if (hs) { try { tournamentHistory = JSON.parse(hs) || []; } catch(e){ console.error('[loadState] eventlog parse error:', e); } }
  } catch(e){ console.error('[loadState] Failed to restore state:', e); }
}

// ── Finish & archive tournament ────────────────────────────
function validateThai32BeforeFinish() {
  // Highlight helper (inline styling to avoid CSS dependency)
  const highlight = (el) => {
    if (!el) return;
    el.style.outline = '2px solid #e94560';
    el.style.outlineOffset = '-2px';
    el.style.borderRadius = '8px';
  };

  const invalid = [];

  // R1: all courts × all tours must have all mi scores filled (null means "not entered")
  for (let ci = 0; ci < nc; ci++) {
    for (let ri = 0; ri < ppc; ri++) {
      for (let mi = 0; mi < ppc; mi++) {
        const v = scores[ci]?.[mi]?.[ri];
        if (v === null || v === undefined) invalid.push({ kind:'r1', ci, mi, ri });
      }
    }
  }

  // R2: validate only divisions that have started (any non-null value)
  activeDivKeys().forEach(key => {
    // Any score set?
    const hasAny = (divScores[key] || []).some((row, mi) =>
      (row || []).some((v, ri) => mi < ppc && ri < ppc && v !== null && v !== undefined)
    );
    if (!hasAny) return;

    for (let mi = 0; mi < ppc; mi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const v = (divScores[key]?.[mi] ?? [])[ri];
        if (v === null || v === undefined) invalid.push({ kind:'r2', key, mi, ri });
      }
    }
  });

  if (!invalid.length) return true;

  // Apply highlights for first batch only (avoid UI overload)
  invalid.slice(0, 64).forEach(it => {
    if (it.kind === 'r1') {
      highlight(document.getElementById(`card-${it.ci}-${it.mi}-${it.ri}`));
    } else {
      highlight(document.getElementById(`dcard-${it.key}-${it.mi}-${it.ri}`));
    }
  });

  showToast('❌ Нельзя завершить: есть неполные/некорректные данные (подсвечены карточки).', 'error');
  return false;
}

async function finishTournament() {
  const name = tournamentMeta.name.trim() || 'Без названия';
  const date = tournamentMeta.date || new Date().toISOString().split('T')[0];

  // Warn if temporary players are in the active roster
  const tempCount = (loadPlayerDB() || []).filter(p => p.status === 'temporary').length;
  const tempWarn  = tempCount > 0
    ? `\n\n⚠️ В базе ${tempCount} временных игрок(а). Перейдите в Ростер → Администрирование, чтобы слить их с реальными профилями.`
    : '';

  // ThaiVolley32 Zero-Sum validation (block save if incomplete)
  if (!validateThai32BeforeFinish()) return;

  const confirmed = await showConfirm(
    `Завершить турнир «${name}»?\n\nРезультаты сохранятся в архиве.\nТекущие очки и ростер останутся.${tempWarn}`
  );
  if (!confirmed) return;

  // Build snapshot
  const stage1 = getAllRanked();

  const metrics = new Map(); // key: `${gender}|${name}`
  const mkKey = (gender, name) => `${gender}|${name}`;

  const ensure = (gender, name, courtName) => {
    const k = mkKey(gender, name);
    if (!metrics.has(k)) {
      metrics.set(k, {
        name,
        gender,
        courtName: courtName || '',
        // Stage 1 (R1)
        wins1: 0, diff1: 0, pts1: 0, balls1: 0, matches1: 0,
        // Stage 2 (R2)
        wins2: 0, diff2: 0, pts2: 0, balls2: 0, matches2: 0,
      });
    }
    const m = metrics.get(k);
    if (courtName && !m.courtName) m.courtName = courtName;
    return m;
  };

  // Stage 1 metrics
  [...stage1.M, ...stage1.W].forEach(p => {
    const m = ensure(p.gender, p.name, p.courtName);
    m.wins1 = p.wins;
    m.diff1 = p.diff;
    m.pts1  = p.pts;
    m.balls1 = p.balls;
    m.matches1 = p.rPlayed;
  });

  // Stage 2 metrics from zones (HARD/ADV/MED/LITE)
  activeDivKeys().forEach(key => {
    const men = divGetRanked(key, 'M');
    const women = divGetRanked(key, 'W');
    men.forEach(p => {
      const m = ensure('M', p.name);
      m.wins2 = p.wins;
      m.diff2 = p.diff;
      m.pts2  = p.pts;
      m.balls2 = p.balls;
      m.matches2 = p.rPlayed;
    });
    women.forEach(p => {
      const m = ensure('W', p.name);
      m.wins2 = p.wins;
      m.diff2 = p.diff;
      m.pts2  = p.pts;
      m.balls2 = p.balls;
      m.matches2 = p.rPlayed;
    });
  });

  const players = Array.from(metrics.values()).map(m => {
    const wins = m.wins1 + m.wins2;
    const diff = m.diff1 + m.diff2;
    const pts = m.pts1 + m.pts2;
    const balls = m.balls1 + m.balls2;
    const matches = m.matches1 + m.matches2;
    // ThaiVolley32: коэффициент эффективности задаётся с фиксированной константой 60
    const K = thaiCalcK(diff);
    return { name: m.name, gender: m.gender, courtName: m.courtName, totalPts: pts, wins, diff, pts, balls, K, matchesTotal: matches };
  }).sort((a,b) => {
    if (b.wins  !== a.wins)  return b.wins - a.wins;
    if (b.diff  !== a.diff)  return b.diff - a.diff;
    if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
    if (b.K !== a.K) return b.K - a.K;
    if (b.balls !== a.balls) return b.balls - a.balls;
    return a.name.localeCompare(b.name, 'ru');
  });

  const totalScore = players.reduce((s,p)=>s+p.totalPts,0);
  const rPlayed = players.length
    ? (players.reduce((s,p)=>s+(p.matchesTotal||0),0) / players.length)
    : 0;

  // ── Compute highlights for snapshot ────────────────────────
  // Best individual round
  let bestRound = null;
  for (let ci = 0; ci < nc; ci++) {
    for (let mi = 0; mi < ppc; mi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const sc = scores[ci]?.[mi]?.[ri];
        if (sc != null && (!bestRound || sc > bestRound.score)) {
          bestRound = { name: ALL_COURTS[ci].men[mi], gender: 'M', score: sc, round: ri };
        }
      }
    }
    // Women scores are derived from men's — check partner mapping
    for (let wi = 0; wi < ppc; wi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const mi = partnerM(wi, ri);
        const sc = scores[ci]?.[mi]?.[ri];
        if (sc != null && (!bestRound || sc > bestRound.score)) {
          bestRound = { name: ALL_COURTS[ci].women[wi], gender: 'W', score: sc, round: ri };
        }
      }
    }
  }

  // Best pair (man + woman with highest combined score)
  const pairMap = {};
  for (let ci = 0; ci < nc; ci++) {
    const ct = ALL_COURTS[ci];
    for (let mi = 0; mi < ppc; mi++) {
      for (let ri = 0; ri < ppc; ri++) {
        const sc = scores[ci]?.[mi]?.[ri];
        if (!sc) continue;
        const man = ct.men[mi], woman = ct.women[partnerW(mi, ri)];
        if (!man || !woman) continue;
        const k = `${man}\x00${woman}`;
        pairMap[k] = (pairMap[k] || 0) + sc;
      }
    }
  }
  // Include division scores
  DIV_KEYS.forEach(dkey => {
    const men = divRoster[dkey].men, women = divRoster[dkey].women, Nd = men.length;
    if (!Nd) return;
    for (let mi = 0; mi < Nd; mi++) {
      for (let ri = 0; ri < Nd; ri++) {
        const sc = (divScores[dkey][mi] ?? [])[ri] ?? null;
        if (!sc) continue;
        const man = men[mi], woman = women[divPartnerW(mi, ri, Nd)];
        if (!man || !woman) continue;
        const k = `${man}\x00${woman}`;
        pairMap[k] = (pairMap[k] || 0) + sc;
      }
    }
  });
  let bestPair = null;
  for (const [key, pts] of Object.entries(pairMap)) {
    if (!bestPair || pts > bestPair.totalPts) {
      const [man, woman] = key.split('\x00');
      bestPair = { man, woman, totalPts: pts };
    }
  }

  // Court stats
  const courtStats = Array.from({length: nc}, (_, ci) => {
    const flat = scores[ci].flat().filter(x => x !== null);
    const total = flat.reduce((s, x) => s + x, 0);
    return {
      name: (COURT_META[ci] || {}).name || `Корт ${ci + 1}`,
      totalPts: total,
      avgPts: flat.length ? (total / flat.length).toFixed(1) : '0',
    };
  });

  const snapshot = {
    id:        Date.now(),
    name,
    date,
    ppc,
    nc,
    players,
    totalScore,
    rPlayed,
    savedAt:   new Date().toISOString(),
    mvpName:   players[0]?.name || '',
    avgScore:  players.length && rPlayed ? (totalScore / (players.length * rPlayed)).toFixed(1) : '0',
    bestRound,
    bestPair,
    courtStats,
  };

  // Load history, prepend, save
  let history = [];
  try { history = JSON.parse(localStorage.getItem('kotc3_history') || '[]'); } catch(e){}
  history.unshift(snapshot);
  localStorage.setItem('kotc3_history', JSON.stringify(history));

  showToast('🏆 Турнир сохранён в архиве!');
  // Recalc ratings first so sbPublishTournament sends up-to-date stats
  recalcAllPlayerStats(/*silent*/ true);
  // Sync players to database (legacy quick sync)
  syncPlayersFromTournament(players, date);
  // Publish results to Supabase (public — visible to all site visitors)
  if (sbEnsureClient()) {
    sbPublishTournament(snapshot).catch(e => console.warn('sbPublishTournament:', e));
  }
  // Auto-export to Google Sheets if connected
  if (gshIsConnected()) {
    gshExportTournament(snapshot, null).catch(()=>{});
  }
  // Refresh stats if currently open
  const statsScreen = document.getElementById('screen-stats');
  if (statsScreen && statsScreen.classList.contains('active')) {
    statsScreen.innerHTML = renderStats();
  }
}

async function resetTournament() {
  if (!await showConfirm('Сбросить ВСЕ результаты?\n\nРостер сохранится, все очки обнулятся.')) return;
  scores    = makeBlankScores();
  divScores = makeBlankDivScores();
  divRoster = makeBlankDivRoster();
  ['kotc3_scores','kotc3_divscores','kotc3_divroster'].forEach(k=>localStorage.removeItem(k));
  for (let i = 0; i < 8; i++) timerReset(i);
  buildAll();
  switchTab(0);
  showToast('🗑 Турнир сброшен');
}

// ════════════════════════════════════════════════════════════
// 4. DROPDOWN ENGINE
// ════════════════════════════════════════════════════════════
// Key design: .dropdown elements live in <body>,
// positioned via getBoundingClientRect() — never clipped by nav overflow.

let openDropdownId = null;

function openDropdown(id, anchorEl) {
  closeDropdown();
  const menu = document.getElementById(id);
  if (!menu) return;
  const rect = anchorEl.getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 170) + 'px';
  menu.style.top  = rect.bottom + 'px';
  menu.classList.add('open');
  anchorEl.classList.add('dd-open');
  document.getElementById('dd-backdrop').classList.add('open');
  openDropdownId = id;
}

function closeDropdown() {
  if (openDropdownId) {
    const m = document.getElementById(openDropdownId);
    if (m) m.classList.remove('open');
  }
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('dd-open'));
  document.getElementById('dd-backdrop').classList.remove('open');
  openDropdownId = null;
}

document.getElementById('dd-backdrop').addEventListener('click', closeDropdown);

function toggleDropdown(id, btn) {
  if (openDropdownId === id) { closeDropdown(); return; }
  openDropdown(id, btn);
}

// ════════════════════════════════════════════════════════════
// 5. NAVIGATION BUILD — pill buttons
// ════════════════════════════════════════════════════════════
function hasRound5Score() {
  const lastRi = ppc - 1;
  for (let ci = 0; ci < nc; ci++) {
    // Считаем корт завершённым если ВСЕ ppc ячеек последнего тура заполнены (включая 0)
    const allFilled = Array.from({length: ppc}, (_, mi) => {
      const v = scores[ci]?.[mi]?.[lastRi];
      return v !== null && v !== undefined;
    }).every(Boolean);
    if (allFilled) return true;
  }
  return false;
}

function syncDivLock() {
  // IPT режим: разблокируем финалы когда все группы завершены
  const _iptTrnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const _iptTrn   = _iptTrnId ? getTournaments().find(t => t.id === _iptTrnId) : null;
  const _iptGroups = _iptTrn?.ipt?.groups;
  const _rosterIsIPT = typeof _rosterFmt !== 'undefined' && _rosterFmt === 'ipt';

  if (_iptGroups || _rosterIsIPT) {
    const allDone = _iptGroups ? _iptGroups.every(g => g.status === 'finished') : false;
    document.querySelectorAll('.pill-div-btn').forEach(p => {
      p.classList.toggle('pill-div-locked', !allDone);
      p.title = allDone ? '' : 'Завершите все группы чтобы открыть финалы';
    });
    return;
  }

  // Стандартный режим
  const unlocked = hasRound5Score();
  const tip = `Заполните все пары в раунде ${ppc} хотя бы на одном корте, чтобы открыть`;
  document.querySelectorAll('.pill-div-btn').forEach(p => {
    p.classList.toggle('pill-div-locked', !unlocked);
    p.title = unlocked ? '' : tip;
  });
}

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';

  // ── Верхняя строка: лого + утилиты ──────────────────────
  const top = document.createElement('div');
  top.className = 'nav-top';

  const logo = document.createElement('div');
  logo.id = 'nav-logo';
  logo.className = 'nav-logo-container';
  logo.innerHTML = '<div class="brand-main">ЛЮТЫЕ ПЛЯЖНИКИ !!</div><div class="brand-sub">King of the Court</div>';
  logo.setAttribute('role', 'button');
  logo.setAttribute('title', 'На главную');
  logo.addEventListener('click', () => switchTab('home'));
  top.appendChild(logo);

  const spacer = document.createElement('div');
  spacer.className = 'nav-spacer';
  top.appendChild(spacer);


  [
    { label:'🏠',   tab:'home'    },
    { label:'👤',   tab:'players' },
    { label:'СВОД', tab:'svod'    },
    { label:'СТАТ', tab:'stats'   },
    { label:'👥',   tab:'rating'  },
    { label:'⚙️',   tab:'roster'  },
  ].forEach(({label,tab}) => {
    const b = document.createElement('button');
    b.className = 'nb'; b.dataset.tab = tab;
    b.textContent = label;
    b.addEventListener('click', ()=>switchTab(tab));
    top.appendChild(b);
  });
  nav.appendChild(top);

  // ── Ряд пиллов: корты + разделитель + дивизионы ─────────
  const row = document.createElement('div');
  row.className = 'nav-pills-row';

  // ── Определяем режим: IPT или стандарт ──────────────────────
  // Источник 1: активный IPT-турнир (уже запущен)
  const _iptNavTrnId  = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const _iptNavTrn    = _iptNavTrnId ? getTournaments().find(t => t.id === _iptNavTrnId) : null;
  const _iptNavGroups = _iptNavTrn?.ipt?.groups || null;

  // Источник 2: формат выбран в ростере (_rosterFmt / _iptCourts)
  const _rosterIsIPT  = typeof _rosterFmt !== 'undefined' && _rosterFmt === 'ipt';
  const _iptCourtsCnt = typeof _iptCourts  !== 'undefined' ? _iptCourts : 1;

  // Итоговый режим IPT
  const _isIPT = !!(_iptNavGroups || _rosterIsIPT);

  // Количество К-пиллов: из групп турнира → из настроек ростера → стандарт nc
  const courtCount = _iptNavGroups
    ? _iptNavGroups.length
    : (_rosterIsIPT ? _iptCourtsCnt : nc);

  // Имена групп для суб-лейблов
  const _IPT_NAMES = {1:['ХАРД'],2:['ХАРД','ЛАЙТ'],3:['ХАРД','МЕДИУМ','ЛАЙТ'],4:['ХАРД','АДВАНС','МЕДИУМ','ЛАЙТ']};

  const ALL_DIV_DEFS = {
    hard:    { icon:'🔥', main:'HD', sub:'ТОП',     color:'#e94560' },
    advance: { icon:'⚡', main:'AV', sub:'2-й ЭШ.', color:'#f5a623' },
    medium:  { icon:'⚙️', main:'MD', sub:'3-й ЭШ.', color:'#4DA8DA' },
    lite:    { icon:'🍀', main:'LT', sub:'4-й ЭШ.', color:'#6ABF69' },
  };

  for (let ci = 0; ci < courtCount; ci++) {
    const meta = COURT_META[ci] || COURT_META[0];
    const p = document.createElement('button');
    p.className = 'nav-pill'; p.dataset.tab = ci;
    p.style.setProperty('--pill-c', meta.color);
    // Суб-лейбл: из активного турнира → из имён групп IPT → КОРТ
    const subLabel = _iptNavGroups?.[ci]?.name
      || (_isIPT ? (_IPT_NAMES[courtCount]?.[ci] || 'КОРТ') : 'КОРТ');
    p.innerHTML = `<span class="pill-dot"></span><span class="pill-main">К${ci+1}</span><span class="pill-sub">${subLabel}</span>`;
    p.addEventListener('click', ()=>switchTab(ci));
    row.appendChild(p);
  }

  const sep = document.createElement('div');
  sep.className = 'nav-pill-sep';
  row.appendChild(sep);

  // IPT: финалы по кол-ву кортов (1→HD, 2→HD+LT, 3→HD+MD+LT, 4→все)
  const divKeys = _isIPT
    ? (typeof getIPTFinalsNavKeys === 'function' ? getIPTFinalsNavKeys(courtCount) : ['hard'])
    : activeDivKeys();

  divKeys.map(id => ({id, ...ALL_DIV_DEFS[id]})).forEach(({id,icon,main,sub,color}) => {
    const p = document.createElement('button');
    p.className = 'nav-pill pill-div-btn'; p.dataset.tab = id;
    p.style.setProperty('--pill-c', color);
    p.innerHTML = `<span class="pill-dot"></span><span class="pill-main">${icon} ${main}</span><span class="pill-sub">${sub}</span>`;
    p.addEventListener('click', ()=>switchTab(id));
    row.appendChild(p);
  });

  nav.appendChild(row);

  syncNavActive();
  syncDivLock();
}

function syncNavActive() {
  // Utility buttons (nb)
  document.querySelectorAll('.nb[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === String(activeTabId));
  });
  // Pill buttons
  document.querySelectorAll('.nav-pill[data-tab]').forEach(p => {
    p.classList.toggle('active', p.dataset.tab === String(activeTabId));
  });
  syncIPTNav();
}

/** Update court pill sub-labels when IPT active (К1→ХАРД etc.) */
function syncIPTNav() {
  const trnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const trn   = trnId ? getTournaments().find(t => t.id === trnId) : null;
  const groups = trn?.ipt?.groups;
  if (!groups) return;
  // Only update sub-labels of court pills (numeric tab) — NO rebuild to avoid loop
  document.querySelectorAll('.nav-pill:not(.pill-div-btn)[data-tab]').forEach(pill => {
    const tab = parseInt(pill.dataset.tab);
    if (isNaN(tab)) return;
    const subEl = pill.querySelector('.pill-sub');
    if (subEl) subEl.textContent = groups[tab] ? groups[tab].name : 'КОРТ';
  });
}

// ════════════════════════════════════════════════════════════
// 6. SCREENS BUILD
// ════════════════════════════════════════════════════════════
function buildScreens() {
  const sc = document.getElementById('screens');
  sc.innerHTML = '';

  // Corт screens (0..3, always created, hidden for ci >= nc)
  for (let ci = 0; ci < 4; ci++) {
    const s = document.createElement('div');
    s.className = 'screen'; s.id = `screen-${ci}`;
    s.innerHTML = ci < nc ? renderCourt(ci) : '';
    sc.appendChild(s);
  }

  // Named screens
  const named = ['home','players','svod','hard','advance','medium','lite','stats','rating','roster','ipt'];
  named.forEach(id => {
    const s = document.createElement('div');
    s.className = 'screen'; s.id = `screen-${id}`;
    sc.appendChild(s);
  });
}

function buildAll() {
  buildNav();
  buildScreens();
  updateDivisions();
  attachListeners();
  attachSwipe();
  // ── Roster FAB ──
  if (!document.getElementById('roster-fab')) {
    const fab = document.createElement('button');
    fab.id = 'roster-fab';
    fab.className = 'roster-fab';
    fab.title = 'Ростер';
    fab.textContent = '⚙️';
    fab.addEventListener('click', () => switchTab('roster'));
    document.body.appendChild(fab);
  }
}

// Перерисовка с сохранением позиции прокрутки и фокуса (debounced)
let _safeRenderRaf = null;
function safeRender() {
  if (_safeRenderRaf) return; // coalesce rapid calls
  _safeRenderRaf = requestAnimationFrame(() => {
    _safeRenderRaf = null;
    const _scrollPos = window.scrollY;
    const _focusId   = document.activeElement?.id;
    const _focusSel  = [document.activeElement?.selectionStart, document.activeElement?.selectionEnd];
    buildAll();
    switchTab(activeTabId != null ? activeTabId : 0);
    window.scrollTo(0, _scrollPos);
    if (_focusId) {
      const el = document.getElementById(_focusId);
      if (el) { el.focus(); try { el.setSelectionRange(_focusSel[0], _focusSel[1]); } catch(e){} }
    }
  });
}


// ════════════════════════════════════════════════════════════
// 7. TAB SWITCHING
// ════════════════════════════════════════════════════════════
let _switchTabBusy = false;
async function switchTab(id) {
  if (_switchTabBusy) return;
  _switchTabBusy = true;
  try { await _switchTabInner(id); } finally { _switchTabBusy = false; }
}
async function _switchTabInner(id) {
  closeDropdown();
  // Если запрошен неактивный дивизион — перенаправляем на первый активный
  if (typeof id === 'string' && DIV_KEYS.includes(id) && !activeDivKeys().includes(id)) {
    id = activeDivKeys()[0] || 0;
  }
  const prevTabId = activeTabId;
  activeTabId = id;

  // Hide all, show target
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const screen = document.getElementById(`screen-${id}`);
  if (!screen) return;

  // ── IPT mode: override court/division screens ─────────────
  const _iptTrnId = typeof _iptActiveTrnId !== 'undefined' ? _iptActiveTrnId : null;
  const _iptTrn   = _iptTrnId ? getTournaments().find(t => t.id === _iptTrnId) : null;
  if (_iptTrn?.ipt?.groups) {
    if (typeof id === 'number' && _iptTrn.ipt.groups[id]) {
      screen.innerHTML = renderIPTGroup(id);
      screen.classList.add('active');
      syncNavActive();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    // Finals tabs: только те что активны по getIPTFinalsNavKeys(groups.length)
    const _activeFinals = typeof getIPTFinalsNavKeys === 'function'
      ? getIPTFinalsNavKeys(_iptTrn.ipt.groups.length)
      : ['hard'];
    const _finalsIdxMap = { hard:0, advance:1, medium:2, lite:3 };
    if (_activeFinals.includes(id)) {
      const fi      = _finalsIdxMap[id];
      const groups  = _iptTrn.ipt.groups;
      const allDone = groups.every(g => g.status === 'finished');
      if (allDone && fi < groups.length) {
        screen.innerHTML = renderIPTFinals(_iptTrn, fi);
        screen.classList.add('active');
        syncNavActive();
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      // Группы не завершены → заглушка
      const _fNames = { hard:'ХАРД', advance:'АДВАНС', medium:'МЕДИУМ', lite:'ЛАЙТ' };
      screen.innerHTML = `<div class="ipt-wrap"><div class="ipt-finals-stub">
        <div style="font-size:2rem">🏆</div>
        <div style="font-size:1.1rem;font-weight:700;margin:.5rem 0">${_fNames[id]}</div>
        <div style="color:var(--muted);font-size:.85rem">Завершите все группы чтобы открыть финалы</div>
      </div></div>`;
      screen.classList.add('active');
      syncNavActive();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
  }

  // Re-render content on demand
  if (id === 'home')    screen.innerHTML = renderHome();
  if (id === 'players') { playersSearch=''; recalcAllPlayerStats(true); screen.innerHTML = renderPlayers(); }
  if (id === 'svod')    screen.innerHTML = renderSvod();
  if (id === 'roster') {
    if (hasRosterPassword() && !rosterUnlocked) {
      screen.classList.add('active');
      syncNavActive();
      const ok = await rosterRequestUnlock({ successMessage: '' });
      if (!ok) {
        activeTabId = prevTabId;
        switchTab(prevTabId != null ? prevTabId : 'svod');
        return;
      }
    }
    historyFilter = 'all'; // сбросить фильтр при открытии ростера
    screen.innerHTML = renderRoster();
  }
  if (id === 'stats')  screen.innerHTML = renderStats();
  if (id === 'ipt')    screen.innerHTML = renderIPT();
  if (id === 'rating') screen.innerHTML = renderRating();
  if (id === 'hard' || id === 'advance' || id === 'medium' || id === 'lite') {
    if (!hasRound5Score()) {
      showToast(`🔒 Заполните все пары в раунде ${ppc} хотя бы на одном корте`);
      activeTabId = prevTabId;
      syncNavActive();
      return;
    }
    updateDivisions();
  }

  screen.classList.add('active');
  syncNavActive();
  window.scrollTo({top:0, behavior:'auto'});
}
