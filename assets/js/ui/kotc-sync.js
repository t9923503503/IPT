'use strict';

// ═══════════════════════════════════════════════════════════════════
// KOTC AUTO-SYNC  (Вариант Б — автосинхронизация)
// localStorage ↔ PostgreSQL (PostgREST API)
//
// Стратегия хранения в БД (таблица "tournaments"):
//   external_id  = tournament.id (наш локальный TEXT-ключ)
//   name         = tournament.name
//   date         = tournament.date
//   status       = tournament.status
//   game_state   = полный объект турнира (JSONB)
//   synced_at    = метка времени
//
// База игроков → строка с external_id='__playerdb__':
//   game_state = { players: [...] }
//
// На загрузке: fetch из БД → мерж только новых записей в localStorage
// На изменении: debounce → upsert в БД через external_id
// ═══════════════════════════════════════════════════════════════════

const _SYNC_PLAYERDB_ID  = '__playerdb__';
const _SYNC_DEBOUNCE_TRN = 2000;   // 2s после saveTournaments
const _SYNC_DEBOUNCE_PLR = 3000;   // 3s после savePlayerDB
const _SYNC_RETRY_DELAY  = 30000;  // 30s пауза после ошибки сети

let _syncEnabled    = false;
let _syncApiBase    = '';
let _syncHeaders    = {};
let _syncTrnTimer   = null;
let _syncPlrTimer   = null;
let _syncLastError  = 0;

// ── Инициализация ────────────────────────────────────────────────

function kotcSyncInit() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return; // нет конфига — только localStorage

  // supabaseUrl = 'https://sv-ugra.ru/api'  →  PostgREST = .../rest/v1
  let base = cfg.supabaseUrl.replace(/\/$/, '');
  if (!base.endsWith('/rest/v1')) base += '/rest/v1';
  _syncApiBase = base;

  _syncHeaders = {
    'Content-Type':  'application/json',
    'apikey':        cfg.supabaseAnonKey,
    'Authorization': 'Bearer ' + cfg.supabaseAnonKey,
  };
  _syncEnabled = true;

  console.log('[kotc-sync] ✓ enabled →', _syncApiBase);

  // Патчим глобальные функции сохранения
  _patchSaveTournaments();
  _patchSavePlayerDB();

  // Загружаем данные из БД при старте (после отрисовки UI)
  setTimeout(() => {
    kotcSyncLoadFromDB().catch(e => console.warn('[kotc-sync] init load:', e));
  }, 1500);
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
  clearTimeout(_syncTrnTimer);
  _syncTrnTimer = setTimeout(_doSyncTournaments, _SYNC_DEBOUNCE_TRN);
}

function kotcSyncSchedulePlayers() {
  if (!_syncEnabled) return;
  clearTimeout(_syncPlrTimer);
  _syncPlrTimer = setTimeout(_doSyncPlayers, _SYNC_DEBOUNCE_PLR);
}

// ── Загрузка из БД при старте ────────────────────────────────────

async function kotcSyncLoadFromDB() {
  if (!_syncEnabled) return;
  try {
    const url = _syncApiBase
      + '/tournaments?select=external_id,game_state,synced_at'
      + '&external_id=not.is.null&limit=500';
    const resp = await fetch(url, { headers: _syncHeaders });
    if (!resp.ok) {
      console.warn('[kotc-sync] load HTTP', resp.status);
      return;
    }
    const rows = await resp.json();
    if (!Array.isArray(rows) || !rows.length) return;

    // Строка с базой игроков
    const playerRow = rows.find(r => r.external_id === _SYNC_PLAYERDB_ID);
    // Строки с реальными турнирами
    const trnRows   = rows.filter(r => r.external_id !== _SYNC_PLAYERDB_ID && r.game_state);

    let anyChanged = false;

    // Мерж турниров: добавляем только те, которых нет локально
    if (trnRows.length) {
      const local    = getTournaments();
      const localSet = new Set(local.map(t => t.id));
      let added = 0;
      trnRows.forEach(row => {
        const t = row.game_state;
        if (!t || !t.id) return;
        if (!localSet.has(t.id)) { local.push(t); added++; }
      });
      if (added) {
        _origSaveTournamentsFn(local);
        anyChanged = true;
        console.log('[kotc-sync] +' + added + ' tournaments from DB');
      }
    }

    // Мерж игроков: добавляем только тех, кого нет локально
    if (playerRow && Array.isArray(playerRow.game_state?.players)) {
      const dbPlayers = playerRow.game_state.players;
      const local     = loadPlayerDB();
      const localSet  = new Set(local.map(p => String(p.id)));
      let added = 0;
      dbPlayers.forEach(p => {
        if (!p || !p.id) return;
        if (!localSet.has(String(p.id))) {
          const c = fromLocalPlayer(p);
          if (c && c.name) { local.push(c); added++; }
        }
      });
      if (added) {
        _origSavePlayerDBFn(local);
        anyChanged = true;
        console.log('[kotc-sync] +' + added + ' players from DB');
      }
    }

    if (anyChanged && typeof buildAll === 'function') {
      try { buildAll(); } catch(_) {}
    }
  } catch(e) {
    console.warn('[kotc-sync] load error:', e);
  }
}

// ── Upsert турниров ──────────────────────────────────────────────

async function _doSyncTournaments() {
  if (!_syncEnabled) return;
  const list = getTournaments();
  if (!list.length) return;

  const rows = list.map(t => ({
    external_id: t.id,
    name:        (t.name   || '').slice(0, 200),
    date:        t.date    || null,
    status:      t.status  || 'open',
    format:      (t.format || '').slice(0, 100),
    game_state:  t,
    synced_at:   new Date().toISOString(),
  }));

  await _upsert(rows, 'tournaments');
}

// ── Upsert базы игроков ──────────────────────────────────────────

async function _doSyncPlayers() {
  if (!_syncEnabled) return;
  const players = loadPlayerDB();
  if (!players.length) return;

  const row = {
    external_id: _SYNC_PLAYERDB_ID,
    name:        '__playerdb__',
    date:        null,
    status:      'finished',
    format:      '',
    game_state:  { players, synced_at: new Date().toISOString() },
    synced_at:   new Date().toISOString(),
  };

  await _upsert([row], 'players');
}

// ── HTTP upsert ──────────────────────────────────────────────────

async function _upsert(rows, label) {
  if (Date.now() - _syncLastError < _SYNC_RETRY_DELAY) return; // throttle после ошибки
  try {
    const resp = await fetch(
      _syncApiBase + '/tournaments?on_conflict=external_id',
      {
        method: 'POST',
        headers: {
          ..._syncHeaders,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      }
    );
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[kotc-sync] upsert ' + label + ':', resp.status, txt);
      _syncLastError = Date.now();
      _showSyncStatus('⚠ Ошибка синхронизации', 'sync-err', 4000);
    } else {
      _syncLastError = 0;
      _showSyncStatus('☁ Синхронизировано', 'sync-ok', 2000);
    }
  } catch(e) {
    console.warn('[kotc-sync] network:', e.message);
    _syncLastError = Date.now();
  }
}

// ── Индикатор ────────────────────────────────────────────────────

let _syncIndTimer = null;
function _showSyncStatus(msg, cls, ms) {
  const el = document.getElementById('sync-topbar');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'sync-topbar ' + cls;
  el.style.display = 'block';
  clearTimeout(_syncIndTimer);
  _syncIndTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

// ── Публичный API ────────────────────────────────────────────────

/** Принудительная немедленная синхронизация */
async function kotcSyncNow() {
  if (!_syncEnabled) { showToast('Синхронизация не настроена'); return; }
  clearTimeout(_syncTrnTimer);
  clearTimeout(_syncPlrTimer);
  try {
    await _doSyncTournaments();
    await _doSyncPlayers();
    showToast('☁ Синхронизировано с сервером');
  } catch(e) {
    showToast('⚠ Ошибка: ' + e.message);
  }
}

// ── Запуск ───────────────────────────────────────────────────────
// Сохраняем оригиналы ДО патча (чтобы не было loop при merge из БД)
let _origSaveTournamentsFn = globalThis.saveTournaments;
let _origSavePlayerDBFn    = globalThis.savePlayerDB;
kotcSyncInit();
