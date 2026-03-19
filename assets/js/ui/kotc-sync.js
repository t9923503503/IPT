'use strict';

// ═══════════════════════════════════════════════════════════════════
// KOTC AUTO-SYNC  (Вариант Б — автосинхронизация)
// localStorage ↔ PostgreSQL (PostgREST API)
//
// Стратегия хранения в БД:
//   - Каждый турнир → одна строка в таблице "tournaments"
//       id          = tournament.id  (TEXT PRIMARY KEY)
//       name        = tournament.name
//       date        = tournament.date
//       status      = tournament.status
//       game_state  = полный объект турнира (JSONB)
//       synced_at   = метка времени
//   - База игроков → строка с id='__playerdb__' в той же таблице
//       game_state  = { players: [...] }
//
// На загрузке: fetch из БД → мерж в localStorage (DB wins только новые записи)
// На изменении: debounce → upsert в БД
// ═══════════════════════════════════════════════════════════════════

const _SYNC_PLAYERDB_ID    = '__playerdb__';
const _SYNC_DEBOUNCE_TRN   = 2000;   // 2s после saveTournaments
const _SYNC_DEBOUNCE_PLR   = 3000;   // 3s после savePlayerDB
const _SYNC_RETRY_DELAY    = 30000;  // 30s retry при ошибке сети

let _syncEnabled     = false;
let _syncApiBase     = '';
let _syncHeaders     = {};
let _syncTrnTimer    = null;
let _syncPlrTimer    = null;
let _syncTrnPending  = false;
let _syncPlrPending  = false;
let _syncLastError   = 0;

// ── Инициализация ────────────────────────────────────────────────

function kotcSyncInit() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    // Нет конфига — работаем только локально
    return;
  }

  // PostgREST endpoint: supabaseUrl уже содержит /api (см. config.js на сервере)
  // Суффикс /rest/v1 добавляет Supabase-клиент, но мы работаем через fetch напрямую
  let base = cfg.supabaseUrl.replace(/\/$/, '');
  // Если URL оканчивается на /api — добавляем /rest/v1
  if (!base.endsWith('/rest/v1')) base = base + '/rest/v1';
  _syncApiBase = base;

  _syncHeaders = {
    'Content-Type': 'application/json',
    'apikey':        cfg.supabaseAnonKey,
    'Authorization': 'Bearer ' + cfg.supabaseAnonKey,
  };
  _syncEnabled = true;

  console.log('[kotc-sync] enabled →', _syncApiBase);

  // Патчим глобальные функции сохранения
  _patchSaveTournaments();
  _patchSavePlayerDB();

  // Загружаем данные из БД при старте
  setTimeout(() => {
    kotcSyncLoadFromDB().catch(e => console.warn('[kotc-sync] init load failed:', e));
  }, 1500); // небольшая задержка чтобы UI успел отрисоваться
}

// ── Патчинг функций сохранения ───────────────────────────────────

function _patchSaveTournaments() {
  const orig = globalThis.saveTournaments;
  if (typeof orig !== 'function') return;
  globalThis.saveTournaments = function kotcSaveTournaments(data) {
    orig(data);
    kotcSyncScheduleTournaments();
  };
}

function _patchSavePlayerDB() {
  const orig = globalThis.savePlayerDB;
  if (typeof orig !== 'function') return;
  globalThis.savePlayerDB = function kotcSavePlayerDB(db) {
    orig(db);
    kotcSyncSchedulePlayers();
  };
}

// ── Планировщики (debounce) ──────────────────────────────────────

function kotcSyncScheduleTournaments() {
  if (!_syncEnabled) return;
  _syncTrnPending = true;
  clearTimeout(_syncTrnTimer);
  _syncTrnTimer = setTimeout(_doSyncTournaments, _SYNC_DEBOUNCE_TRN);
}

function kotcSyncSchedulePlayers() {
  if (!_syncEnabled) return;
  _syncPlrPending = true;
  clearTimeout(_syncPlrTimer);
  _syncPlrTimer = setTimeout(_doSyncPlayers, _SYNC_DEBOUNCE_PLR);
}

// ── Загрузка из БД ───────────────────────────────────────────────

async function kotcSyncLoadFromDB() {
  if (!_syncEnabled) return;

  try {
    // Загружаем все записи из tournaments (включая специальную __playerdb__)
    const url = _syncApiBase + '/tournaments?select=id,game_state,synced_at&limit=500';
    const resp = await fetch(url, { headers: _syncHeaders });

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[kotc-sync] load failed:', resp.status, txt);
      return;
    }

    const rows = await resp.json();
    if (!Array.isArray(rows) || !rows.length) return;

    let trnChanged = false;
    let plrChanged = false;

    // Разделяем: специальная строка игроков vs реальные турниры
    const playerRow = rows.find(r => r.id === _SYNC_PLAYERDB_ID);
    const trnRows   = rows.filter(r => r.id !== _SYNC_PLAYERDB_ID && r.game_state);

    // Мерж турниров
    if (trnRows.length > 0) {
      const local = getTournaments();
      const localIds = new Set(local.map(t => t.id));
      let added = 0;

      trnRows.forEach(row => {
        if (!row.game_state || !row.game_state.id) return;
        if (!localIds.has(row.game_state.id)) {
          // Турнир есть в БД, но не локально → добавляем
          local.push(row.game_state);
          added++;
        }
        // Если уже есть локально — доверяем локальной версии (активная игра)
      });

      if (added > 0) {
        // Вызываем оригинальную saveTournaments чтобы не запускать sync loop
        const origSave = _getOrigSaveTournaments();
        origSave(local);
        trnChanged = true;
        console.log('[kotc-sync] added', added, 'tournaments from DB');
      }
    }

    // Мерж игроков
    if (playerRow && playerRow.game_state && Array.isArray(playerRow.game_state.players)) {
      const dbPlayers = playerRow.game_state.players;
      const local = loadPlayerDB();
      const localIds = new Set(local.map(p => String(p.id)));
      let added = 0;

      dbPlayers.forEach(p => {
        if (!p || !p.id) return;
        if (!localIds.has(String(p.id))) {
          const canonical = fromLocalPlayer(p);
          if (canonical && canonical.name) {
            local.push(canonical);
            added++;
          }
        }
      });

      if (added > 0) {
        const origSave = _getOrigSavePlayerDB();
        origSave(local);
        plrChanged = true;
        console.log('[kotc-sync] added', added, 'players from DB');
      }
    }

    if (trnChanged || plrChanged) {
      // Перерисовываем UI если функция доступна
      if (typeof buildAll === 'function') {
        try { buildAll(); } catch(e) { /* ignore */ }
      }
    }

  } catch(e) {
    console.warn('[kotc-sync] load error:', e);
  }
}

// ── Сохранение турниров в БД ─────────────────────────────────────

async function _doSyncTournaments() {
  if (!_syncEnabled) return;
  _syncTrnPending = false;

  const tournaments = getTournaments();
  if (!tournaments.length) return;

  // Формируем строки для upsert
  const rows = tournaments.map(t => ({
    id:         t.id,
    name:       (t.name || '').slice(0, 200),
    date:       t.date   || null,
    status:     t.status || 'open',
    format:     (t.format || '').slice(0, 100),
    game_state: t,
    synced_at:  new Date().toISOString(),
  }));

  await _upsert('tournaments', rows, 'tournaments');
}

// ── Сохранение игроков в БД ──────────────────────────────────────

async function _doSyncPlayers() {
  if (!_syncEnabled) return;
  _syncPlrPending = false;

  const players = loadPlayerDB();
  if (!players.length) return;

  // Сохраняем весь массив игроков как один JSONB-объект
  const row = {
    id:         _SYNC_PLAYERDB_ID,
    name:       '__playerdb__',
    date:       null,
    status:     'finished',
    format:     '',
    game_state: { players, synced_at: new Date().toISOString() },
    synced_at:  new Date().toISOString(),
  };

  await _upsert('tournaments', [row], 'players');
}

// ── HTTP helper ──────────────────────────────────────────────────

async function _upsert(table, rows, label) {
  // Пропускаем если недавно была ошибка (избегаем спама)
  if (Date.now() - _syncLastError < _SYNC_RETRY_DELAY) return;

  try {
    const resp = await fetch(_syncApiBase + '/' + table, {
      method: 'POST',
      headers: {
        ..._syncHeaders,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[kotc-sync] upsert ' + label + ' failed:', resp.status, txt);
      _syncLastError = Date.now();
      _showSyncError();
    } else {
      _syncLastError = 0;
      console.log('[kotc-sync] synced', label, '(' + rows.length + ' rows)');
      _showSyncOk(label);
    }
  } catch(e) {
    console.warn('[kotc-sync] network error syncing ' + label + ':', e.message);
    _syncLastError = Date.now();
  }
}

// ── Хелперы для получения оригинальных функций ───────────────────
// После патча globalThis.savePlayerDB — уже patched версия.
// Нам нужны оригиналы, чтобы не войти в бесконечный цикл при мерже из БД.

let _origSaveTournamentsFn = null;
let _origSavePlayerDBFn    = null;

// Вызывается ДО патча в kotcSyncInit
function _capturOriginals() {
  _origSaveTournamentsFn = globalThis.saveTournaments;
  _origSavePlayerDBFn    = globalThis.savePlayerDB;
}

function _getOrigSaveTournaments() {
  return _origSaveTournamentsFn || globalThis.saveTournaments;
}
function _getOrigSavePlayerDB() {
  return _origSavePlayerDBFn || globalThis.savePlayerDB;
}

// ── Индикатор синхронизации (топбар) ────────────────────────────

let _syncIndicatorTimer = null;

function _showSyncOk(label) {
  const topbar = document.getElementById('sync-topbar');
  if (!topbar) return;
  topbar.textContent = '☁ Синхронизировано';
  topbar.className = 'sync-topbar sync-ok';
  topbar.style.display = 'block';
  clearTimeout(_syncIndicatorTimer);
  _syncIndicatorTimer = setTimeout(() => {
    topbar.style.display = 'none';
  }, 2000);
}

function _showSyncError() {
  const topbar = document.getElementById('sync-topbar');
  if (!topbar) return;
  topbar.textContent = '⚠ Ошибка синхронизации';
  topbar.className = 'sync-topbar sync-err';
  topbar.style.display = 'block';
  clearTimeout(_syncIndicatorTimer);
  _syncIndicatorTimer = setTimeout(() => {
    topbar.style.display = 'none';
  }, 4000);
}

// ── Публичный API ────────────────────────────────────────────────

// Принудительная немедленная синхронизация (для кнопки «Синхронизировать»)
async function kotcSyncNow() {
  if (!_syncEnabled) {
    showToast('Синхронизация не настроена (нет config.js)');
    return;
  }
  try {
    await _doSyncTournaments();
    await _doSyncPlayers();
    showToast('☁ Синхронизировано с сервером');
  } catch(e) {
    showToast('⚠ Ошибка синхронизации: ' + e.message);
  }
}

// Инициализация: сохраняем оригиналы ДО патча, затем патчим
_capturOriginals();
kotcSyncInit();
