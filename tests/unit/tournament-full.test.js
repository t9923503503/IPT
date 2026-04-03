/**
 * Комплексные unit-тесты полного цикла турнира (ThaiVolley32, 4 корта, ppc=4, nc=4).
 * Тестирует: thaiDiffToPts, thaiCalcK, hasRound5Score, getRanked, seedR2FromR1.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.cwd();

// ── VM loader (same pattern as _load-volley-scripts.js) ──────────────────────

function getVmCtx() {
  if (globalThis.__coreVmCtx) return globalThis.__coreVmCtx;
  globalThis.__coreVmCtx = vm.createContext(globalThis);
  return globalThis.__coreVmCtx;
}

function runScript(absPath, append = '') {
  const code = readFileSync(absPath, 'utf8');
  vm.runInContext(code + '\n' + append + '\n', getVmCtx(), { filename: absPath });
}

function loadCoreScripts() {
  if (globalThis.__coreTestLoaded) return;

  // Minimal browser stubs required by core.js
  if (!globalThis.showToast)   globalThis.showToast   = () => {};
  if (!globalThis.showConfirm) globalThis.showConfirm = async () => true;
  if (!globalThis.esc)         globalThis.esc         = (s) => String(s ?? '');
  if (!globalThis.escAttr)     globalThis.escAttr     = (s) => String(s ?? '');
  if (!globalThis.sbPush)      globalThis.sbPush      = () => {};

  // core.js references document.getElementById('dd-backdrop') at top level
  if (!document.getElementById('dd-backdrop')) {
    const el = document.createElement('div');
    el.id = 'dd-backdrop';
    document.body.appendChild(el);
  }

  // 1. Load app-state.js.
  //    The VM context accumulates top-level let/const bindings across runInContext
  //    calls (same as a REPL), so subsequent scripts (core.js) read those bindings
  //    directly — NOT globalThis properties.  Bridge mutable state via setter
  //    closures so tests can control what core.js functions see.
  runScript(path.join(ROOT, 'assets/js/state/app-state.js'), `
    globalThis.__setState = {
      // Mutable let variables — re-assigned via closure
      setScores:     (v) => { scores     = v; },
      getScores:     ()  => scores,
      setNc:         (v) => { nc         = v; },
      getNc:         ()  => nc,
      setPpc:        (v) => { ppc        = v; },
      setFixedPairs: (v) => { fixedPairs = v; },
      setDivScores:  (v) => { divScores  = v; },
      setDivRoster:  (v) => { divRoster  = v; },
      // ALL_COURTS is const — mutate elements in-place
      setAllCourts: (v) => {
        for (let i = 0; i < v.length; i++) ALL_COURTS[i] = v[i];
      },
      getAllCourts: () => ALL_COURTS,
      // Factory helpers
      makeBlankScores:    () => makeBlankScores(),
      makeBlankDivScores: () => makeBlankDivScores(),
      makeBlankDivRoster: () => makeBlankDivRoster(),
    };
    globalThis.activeDivKeys    = activeDivKeys;
    globalThis.calculateRanking = calculateRanking;
  `);

  // 2. Initialise test roster and blank state through the setter bridge
  globalThis.__setState.setAllCourts([
    { men: ['Жидков','Майлыбаев','Надымов','Мамедов',''],   women: ['Иванова','Петрова','Сидорова','Козлова',''] },
    { men: ['Паничкин','Микуляк','Никифоров','Обухов',''],   women: ['Загребина','Стрекалова','Привалова','Рогожкина',''] },
    { men: ['Привалов','Юшманов','Смирнов','Федоров',''],    women: ['Кузнецова','Новикова','Морозова','Волкова',''] },
    { men: ['Алексеев','Борисов','Васильев','Григорьев',''], women: ['Дмитриева','Егорова','Жукова','Захарова',''] },
  ]);
  globalThis.__setState.setScores(globalThis.__setState.makeBlankScores());
  globalThis.__setState.setDivScores(globalThis.__setState.makeBlankDivScores());
  globalThis.__setState.setDivRoster(globalThis.__setState.makeBlankDivRoster());

  // 3. Load core.js and bridge its pure functions to globalThis
  runScript(path.join(ROOT, 'assets/js/screens/core.js'), `
    globalThis.thaiDiffToPts  = thaiDiffToPts;
    globalThis.thaiCalcK      = thaiCalcK;
    globalThis.getRanked      = getRanked;
    globalThis.getAllRanked    = getAllRanked;
    globalThis.seedR2FromR1   = seedR2FromR1;
    globalThis.hasRound5Score = hasRound5Score;
  `);

  globalThis.__coreTestLoaded = true;
}

// ── Shared tournament fixture (4 courts × 4 players × 4 rounds) ─────────────
// scores[ci][mi][ri]  mi = player index, ri = round index

const SCORES_A = [
  [10, 10, 10, 10], // mi=0 Жидков
  [0,   8,  5,  0], // mi=1 Майлыбаев
  [8,   0,  0,  5], // mi=2 Надымов
  [0,   0,  0,  0], // mi=3 Мамедов
];
const SCORES_B = [
  [10, 10, 10, 10], // mi=0 Паничкин
  [0,   5,  8,  0], // mi=1 Микуляк
  [8,   0,  0,  5], // mi=2 Никифоров
  [0,   0,  0,  0], // mi=3 Обухов
];
const SCORES_C = [
  [10, 10, 10, 10], // mi=0 Привалов
  [0,   5,  8,  0], // mi=1 Юшманов
  [8,   0,  0,  5], // mi=2 Смирнов
  [0,   0,  0,  0], // mi=3 Федоров
];
const SCORES_D = [
  [10, 10, 10, 10], // mi=0 Алексеев
  [0,   5,  8,  0], // mi=1 Борисов
  [8,   0,  0,  5], // mi=2 Васильев
  [0,   0,  0,  0], // mi=3 Григорьев
];
const ALL_SCORES = [SCORES_A, SCORES_B, SCORES_C, SCORES_D];

function applyScores() {
  globalThis.__setState.setScores(
    ALL_SCORES.map(court => court.map(player => [...player]))
  );
}

function resetScores() {
  globalThis.__setState.setScores(globalThis.__setState.makeBlankScores());
}

// ════════════════════════════════════════════════════════════════════════════
// 1. thaiDiffToPts — pure math
// ════════════════════════════════════════════════════════════════════════════
describe('thaiDiffToPts', () => {
  beforeAll(() => loadCoreScripts());

  test('diff >= 7 → 3 pts', () => {
    expect(globalThis.thaiDiffToPts(7)).toBe(3);
    expect(globalThis.thaiDiffToPts(10)).toBe(3);
    expect(globalThis.thaiDiffToPts(100)).toBe(3);
  });

  test('diff >= 3 → 2 pts', () => {
    expect(globalThis.thaiDiffToPts(3)).toBe(2);
    expect(globalThis.thaiDiffToPts(5)).toBe(2);
    expect(globalThis.thaiDiffToPts(6)).toBe(2);
  });

  test('diff >= 1 → 1 pt', () => {
    expect(globalThis.thaiDiffToPts(1)).toBe(1);
    expect(globalThis.thaiDiffToPts(2)).toBe(1);
  });

  test('diff === 0 → 0 pts', () => {
    expect(globalThis.thaiDiffToPts(0)).toBe(0);
  });

  test('diff < 0 → 0 pts', () => {
    expect(globalThis.thaiDiffToPts(-1)).toBe(0);
    expect(globalThis.thaiDiffToPts(-5)).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. thaiCalcK — coefficient math
// ════════════════════════════════════════════════════════════════════════════
describe('thaiCalcK', () => {
  beforeAll(() => loadCoreScripts());

  test('zero diff → K = 1', () => {
    expect(globalThis.thaiCalcK(0)).toBeCloseTo(1.0, 9);
  });

  test('positive diff → K > 1', () => {
    const k = globalThis.thaiCalcK(10);
    // (60+10)/(60-10) = 70/50 = 1.4
    expect(k).toBeCloseTo(1.4, 5);
    expect(k).toBeGreaterThan(1);
  });

  test('negative diff → K < 1', () => {
    const k = globalThis.thaiCalcK(-10);
    // (60-10)/(60+10) = 50/70 ≈ 0.7143
    expect(k).toBeCloseTo(50 / 70, 5);
    expect(k).toBeLessThan(1);
  });

  test('denom near 0 (diff=60) → 999.99', () => {
    expect(globalThis.thaiCalcK(60)).toBe(999.99);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. hasRound5Score — division unlock gate (после фикса)
// ════════════════════════════════════════════════════════════════════════════
describe('hasRound5Score (после фикса)', () => {
  beforeAll(() => loadCoreScripts());
  beforeEach(() => resetScores());

  test('все null → false', () => {
    expect(globalThis.hasRound5Score()).toBe(false);
  });

  test('последний тур с нулями → true (краевой случай бага)', () => {
    // Fill last round (ri=3) of every court with 0
    const sc = globalThis.__setState.makeBlankScores();
    for (let ci = 0; ci < 4; ci++) {
      for (let mi = 0; mi < 4; mi++) {
        sc[ci][mi][3] = 0;
      }
    }
    globalThis.__setState.setScores(sc);
    expect(globalThis.hasRound5Score()).toBe(true);
  });

  test('последний тур частично заполнен → false', () => {
    // Only court 0, player 0 has a score in round 3
    const sc = globalThis.__setState.makeBlankScores();
    sc[0][0][3] = 5;
    globalThis.__setState.setScores(sc);
    expect(globalThis.hasRound5Score()).toBe(false);
  });

  test('последний тур полностью > 0 → true', () => {
    // Apply full scores (includes round 3 with positive values)
    applyScores();
    expect(globalThis.hasRound5Score()).toBe(true);
  });

  test('при nc=1: один корт заполнен полностью → true', () => {
    globalThis.__setState.setNc(1);
    const sc = globalThis.__setState.makeBlankScores();
    for (let mi = 0; mi < 4; mi++) {
      sc[0][mi][3] = mi * 3;  // could be 0
    }
    globalThis.__setState.setScores(sc);
    expect(globalThis.hasRound5Score()).toBe(true);
    globalThis.__setState.setNc(4); // restore
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. getRanked — корт А
// ════════════════════════════════════════════════════════════════════════════
describe('getRanked — корт А (ci=0)', () => {
  beforeAll(() => loadCoreScripts());
  beforeEach(() => applyScores());

  test('возвращает 4 игрока (ppc=4)', () => {
    const ranked = globalThis.getRanked(0, 'M');
    expect(ranked).toHaveLength(4);
  });

  test('Жидков (mi=0) на 1-м месте с wins=4', () => {
    const ranked = globalThis.getRanked(0, 'M');
    const first = ranked[0];
    expect(first.idx).toBe(0);
    expect(first.wins).toBe(4);
    expect(first.place).toBe(1);
  });

  test('Мамедов (mi=3) на последнем месте с wins=0', () => {
    const ranked = globalThis.getRanked(0, 'M');
    const last = ranked[ranked.length - 1];
    expect(last.idx).toBe(3);
    expect(last.wins).toBe(0);
    expect(last.place).toBe(4);
  });

  test('победитель имеет максимальные balls=40', () => {
    const ranked = globalThis.getRanked(0, 'M');
    expect(ranked[0].balls).toBe(40);
    expect(ranked[0].diff).toBe(40);
    expect(ranked[0].pts).toBe(12); // 4 rounds × 3 pts
  });

  test('сортировка: wins → diff → pts → K → balls', () => {
    const ranked = globalThis.getRanked(0, 'M');
    // Wins must be non-increasing
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].wins).toBeLessThanOrEqual(ranked[i - 1].wins);
    }
    // Among players with equal wins, diff must be non-increasing
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i].wins === ranked[i - 1].wins) {
        expect(ranked[i].diff).toBeLessThanOrEqual(ranked[i - 1].diff);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. seedR2FromR1 — seeding 4 дивизионов из 4 кортов
// ════════════════════════════════════════════════════════════════════════════
describe('seedR2FromR1', () => {
  beforeAll(() => loadCoreScripts());
  beforeEach(() => applyScores());

  function getNames(players) {
    return players.map(p => p.name);
  }

  test('возвращает все 4 зоны', () => {
    const seeded = globalThis.seedR2FromR1('M');
    expect(seeded).toHaveProperty('hard');
    expect(seeded).toHaveProperty('advance');
    expect(seeded).toHaveProperty('medium');
    expect(seeded).toHaveProperty('lite');
  });

  test('каждая зона содержит ровно 4 игрока', () => {
    const seeded = globalThis.seedR2FromR1('M');
    expect(seeded.hard).toHaveLength(4);
    expect(seeded.advance).toHaveLength(4);
    expect(seeded.medium).toHaveLength(4);
    expect(seeded.lite).toHaveLength(4);
  });

  test('HARD содержит победителей кортов 0,1,2 + лучшего 2-го', () => {
    const seeded = globalThis.seedR2FromR1('M');
    const names = getNames(seeded.hard);
    // Winners of courts A, B, C
    expect(names).toContain('Жидков');
    expect(names).toContain('Паничкин');
    expect(names).toContain('Привалов');
    // Best 2nd among courts A,B,C — Майлыбаев (Court A, smallest courtIndex, all tied)
    expect(names).toContain('Майлыбаев');
  });

  test('ADVANCE содержит всех игроков корта Г (ci=3)', () => {
    const seeded = globalThis.seedR2FromR1('M');
    const names = getNames(seeded.advance);
    expect(names).toContain('Алексеев');
    expect(names).toContain('Борисов');
    expect(names).toContain('Васильев');
    expect(names).toContain('Григорьев');
  });

  test('MEDIUM содержит оставшихся 2-х + лучших 3-х', () => {
    const seeded = globalThis.seedR2FromR1('M');
    const names = getNames(seeded.medium);
    // Remaining 2nds: Микуляк (B), Юшманов (C)
    expect(names).toContain('Микуляк');
    expect(names).toContain('Юшманов');
    // Best 2 thirds: Надымов (A, best diff=-2), Никифоров (B)
    expect(names).toContain('Надымов');
    expect(names).toContain('Никифоров');
  });

  test('LITE содержит оставшегося 3-го + всех 4-х с кортов 0,1,2', () => {
    const seeded = globalThis.seedR2FromR1('M');
    const names = getNames(seeded.lite);
    // Remaining 3rd: Смирнов (C)
    expect(names).toContain('Смирнов');
    // All 4ths from A,B,C
    expect(names).toContain('Мамедов');
    expect(names).toContain('Обухов');
    expect(names).toContain('Федоров');
  });

  test('в HARD нет игроков из корта Г (ci=3)', () => {
    const seeded = globalThis.seedR2FromR1('M');
    const names = getNames(seeded.hard);
    expect(names).not.toContain('Алексеев');
    expect(names).not.toContain('Борисов');
    expect(names).not.toContain('Васильев');
    expect(names).not.toContain('Григорьев');
  });

  test('итого 16 уникальных игроков среди всех зон', () => {
    const seeded = globalThis.seedR2FromR1('M');
    const allNames = [
      ...getNames(seeded.hard),
      ...getNames(seeded.advance),
      ...getNames(seeded.medium),
      ...getNames(seeded.lite),
    ];
    const unique = new Set(allNames);
    expect(unique.size).toBe(16);
  });
});
