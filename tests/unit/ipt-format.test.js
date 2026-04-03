import { describe, test, expect, beforeAll } from 'vitest';
import { loadVolleyCoreWithBridges } from './_load-volley-scripts.js';

function ensureLoaded() {
  if (!globalThis.__volleyLoaded) loadVolleyCoreWithBridges(process.cwd());
}

describe('iptMatchFinished', () => {
  beforeAll(() => ensureLoaded());

  test('hard: матч завершён при достижении лимита любой командой', () => {
    expect(globalThis.iptMatchFinished({ score1: 21, score2: 0 }, 21, 'hard')).toBe(true);
    expect(globalThis.iptMatchFinished({ score1: 20, score2: 21 }, 21, 'hard')).toBe(true);
    expect(globalThis.iptMatchFinished({ score1: 20, score2: 20 }, 21, 'hard')).toBe(false);
  });

  test('balance: до разницы 2, без потолка', () => {
    // ещё не достигли лимита
    expect(globalThis.iptMatchFinished({ score1: 14, score2: 13 }, 15, 'balance')).toBe(false);
    // достигли лимита, но разница < 2
    expect(globalThis.iptMatchFinished({ score1: 15, score2: 14 }, 15, 'balance')).toBe(false);
    // классическая победа в 2
    expect(globalThis.iptMatchFinished({ score1: 16, score2: 14 }, 15, 'balance')).toBe(true);
    // продолжение после «дьюса» без потолка
    expect(globalThis.iptMatchFinished({ score1: 23, score2: 22 }, 21, 'balance')).toBe(false);
    expect(globalThis.iptMatchFinished({ score1: 24, score2: 22 }, 21, 'balance')).toBe(true);
  });
});

describe('buildIPTMatchHistory', () => {
  beforeAll(() => ensureLoaded());

  test('считает партнёров и оппонентов по courts', () => {
    const rounds = [
      { courts: [{ team1: ['a', 'b'], team2: ['c', 'd'], score1: 0, score2: 0 }] },
      { courts: [{ team1: ['a', 'c'], team2: ['b', 'd'], score1: 0, score2: 0 }] },
    ];
    const h = globalThis.buildIPTMatchHistory(rounds);
    expect(h.partners['a|b']).toBe(1);
    expect(h.partners['c|d']).toBe(1);
    expect(h.partners['a|c']).toBe(1);
    expect(h.partners['b|d']).toBe(1);
    // opponent pairs accumulate
    expect(h.opponents['a|c']).toBeGreaterThanOrEqual(1);
    expect(h.opponents['b|d']).toBeGreaterThanOrEqual(1);
  });
});

describe('generateIPTGroups', () => {
  beforeAll(() => {
    ensureLoaded();
    // stub loadPlayerDB to return 32 male players
    globalThis.loadPlayerDB = () =>
      Array.from({ length: 32 }, (_, i) => ({ id: `p${i}`, name: `Player${i}`, gender: 'm' }));
  });

  test('32 мужчины в mixed режиме → 4 группы по 8 игроков', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `p${i}`);
    const groups = globalThis.generateIPTGroups(ids, 'mixed');
    expect(groups.length).toBe(4);
    groups.forEach(g => {
      expect(g.players.length).toBe(8);
    });
  });

  test('32 мужчины в mixed режиме → каждая группа использует generateIPTRounds (4 тура)', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `p${i}`);
    const groups = globalThis.generateIPTGroups(ids, 'mixed');
    // generateIPTRounds produces 4 rounds for 8 players (IPT_SCHEDULE length)
    groups.forEach(g => {
      expect(g.rounds.length).toBe(4);
    });
  });

  test('явная передача numGroups=4 для 32 участников', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `p${i}`);
    const groups = globalThis.generateIPTGroups(ids, 'mixed', 4);
    expect(groups.length).toBe(4);
    groups.forEach(g => {
      expect(g.players.length).toBe(8);
    });
  });

  test('mixed с мужчинами и женщинами — сортировка по полу', () => {
    globalThis.loadPlayerDB = () => [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, name: `Man${i}`, gender: 'm' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, name: `Woman${i}`, gender: 'female' })),
    ];
    const ids = ['m0','m1','m2','m3','f0','f1','f2','f3'];
    const groups = globalThis.generateIPTGroups(ids, 'mixed');
    expect(groups.length).toBe(1);
    const players = groups[0].players;
    expect(players.length).toBe(8);
    // First 4 should be men, last 4 women
    expect(players.slice(0, 4).every(id => id.startsWith('m'))).toBe(true);
    expect(players.slice(4, 8).every(id => id.startsWith('f'))).toBe(true);
  });
});

