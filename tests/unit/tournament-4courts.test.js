import { describe, test, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────
// Isolated implementation of hasRound5Score logic from core.js
// Tests the fixed version: zero scores (not null) should unlock
// ─────────────────────────────────────────────────────────────

/**
 * Returns true when at least one court has ALL ppc pairs filled
 * in the last round (index ppc-1), including zeros.
 *
 * This is the fixed version — the original bug was `> 0` which
 * prevented divisions from unlocking when scores were exactly 0.
 */
function hasRound5Score(scores, ppc, nc) {
  const lastRi = ppc - 1;
  for (let ci = 0; ci < nc; ci++) {
    const allFilled = Array.from({ length: ppc }, (_, mi) => {
      const v = scores[ci]?.[mi]?.[lastRi];
      return v !== null && v !== undefined;
    }).every(Boolean);
    if (allFilled) return true;
  }
  return false;
}

/** Build a scores array: nc courts × ppc pairs × ppc rounds, all null */
function emptyScores(nc = 4, ppc = 4) {
  return Array.from({ length: nc }, () =>
    Array.from({ length: ppc }, () => Array(ppc).fill(null))
  );
}

describe('hasRound5Score — unit (isolated logic)', () => {
  const ppc = 4;
  const nc = 4;

  test('все null → false', () => {
    const scores = emptyScores(nc, ppc);
    expect(hasRound5Score(scores, ppc, nc)).toBe(false);
  });

  test('только первые три тура заполнены → false', () => {
    const scores = emptyScores(nc, ppc);
    // Fill rounds 0-2 for all courts/pairs, leave round 3 as null
    for (let ci = 0; ci < nc; ci++) {
      for (let mi = 0; mi < ppc; mi++) {
        scores[ci][mi][0] = 10;
        scores[ci][mi][1] = 8;
        scores[ci][mi][2] = 5;
        // scores[ci][mi][3] stays null
      }
    }
    expect(hasRound5Score(scores, ppc, nc)).toBe(false);
  });

  test('последний тур частично заполнен (не у всех пар) → false', () => {
    const scores = emptyScores(nc, ppc);
    // Only fill pair 0 in last round on court 0, leave others null
    scores[0][0][ppc - 1] = 10;
    scores[0][1][ppc - 1] = 8;
    // pairs 2 and 3 on court 0 remain null
    expect(hasRound5Score(scores, ppc, nc)).toBe(false);
  });

  test('последний тур заполнен нулями → true (краевой случай / основной баг)', () => {
    const scores = emptyScores(nc, ppc);
    // Court 0, all pairs have score 0 in last round
    for (let mi = 0; mi < ppc; mi++) {
      scores[0][mi][ppc - 1] = 0;
    }
    expect(hasRound5Score(scores, ppc, nc)).toBe(true);
  });

  test('последний тур заполнен ненулевыми очками → true', () => {
    const scores = emptyScores(nc, ppc);
    for (let mi = 0; mi < ppc; mi++) {
      scores[0][mi][ppc - 1] = 5 + mi;
    }
    expect(hasRound5Score(scores, ppc, nc)).toBe(true);
  });

  test('смешанный случай: нули и ненули в последнем туре → true', () => {
    const scores = emptyScores(nc, ppc);
    // Court 2: last round fully filled with mix of 0 and non-zero
    scores[2][0][ppc - 1] = 0;
    scores[2][1][ppc - 1] = 10;
    scores[2][2][ppc - 1] = 0;
    scores[2][3][ppc - 1] = 7;
    expect(hasRound5Score(scores, ppc, nc)).toBe(true);
  });

  test('4 корта × 4 пары × все раунды с нулями в 4-м → true', () => {
    // Scenario from the problem statement pseudocode
    const scores = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => [10, 8, 5, 0])
    );
    expect(hasRound5Score(scores, 4, 4)).toBe(true);
  });

  test('один корт заполнен полностью, остальные пустые → true', () => {
    const scores = emptyScores(nc, ppc);
    // Only court 3 has last round filled
    for (let mi = 0; mi < ppc; mi++) {
      scores[3][mi][ppc - 1] = mi * 2;
    }
    expect(hasRound5Score(scores, ppc, nc)).toBe(true);
  });
});
