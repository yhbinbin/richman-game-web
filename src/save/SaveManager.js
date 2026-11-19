// 对局快照、校验与本地槽位。版本变更时需同步提升 SAVE_VERSION。
export const SAVE_ID = 'richman-game';
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
export const MAX_SNAPSHOT_CHARS = 256 * 1024;

const SLOT_PREFIX = 'richman-game:save:slot:';

export const CARD_CATALOG = {
  remote: '遥控骰子',
  block: '路障',
  robot: '机器娃娃',
  mine: '地雷',
  turn: '转向卡',
  stay: '停留卡',
  build: '建屋卡',
  demolish: '拆屋卡',
  store: '开店卡',
  park: '公园卡',
};

const BUILDING_TYPES = new Set(['house', 'store', 'park']);

export const SAVE_MESSAGES = {
  invalid: '存档无效或已损坏',
  version: '存档版本不兼容，无法读取',
  board: '存档与当前地图不匹配',
  players: '存档中的玩家数据无效',
  properties: '存档中的地产数据无效',
  hazards: '存档中的路障或地雷数据无效',
  turn: '存档中的回合数据无效',
  economy: '存档中的日期或物价数据无效',
  empty: '该槽位没有存档',
  storage: '浏览器无法使用本地存储',
  write: '存档写入失败，本地存储可能已满',
  busy: '请先完成当前操作，再存档或读档',
  tooLarge: '存档文件过大',
};

function fail(message) {
  return { ok: false, message };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeInteger(value) {
  return Number.isInteger(value) && Number.isSafeInteger(value);
}

function mixHash(hash, text) {
  let next = hash;
  for (let i = 0; i < text.length; i += 1) {
    next ^= text.charCodeAt(i);
    next = Math.imul(next, 16777619);
  }
  return next;
}

export function fingerprintBoard(board) {
  let hash = 2166136261;
  const width = board.grid.width;
  const height = board.grid.height;
  hash = mixHash(hash, `${width}x${height}`);
  board.path.forEach((pos, index) => {
    const tile = board.tiles[index];
    hash = mixHash(
      hash,
      `|${pos.x},${pos.y}:${tile?.type || ''}:${tile?.price ?? ''}:${tile?.amount ?? ''}:${tile?.name ?? ''}`
    );
  });
  return {
    width,
    height,
    pathLength: board.path.length,
    pathHash: hash >>> 0,
  };
}

export function describeEngine(engine) {
  const roadIndices = [];
  engine.board.tiles.forEach((tile, index) => {
    if (tile.type === 'road') roadIndices.push(index);
  });
  return {
    playerCount: engine.players.length,
    fingerprint: fingerprintBoard(engine.board),
    roadIndices,
    pathLength: engine.board.path.length,
  };
}

function slotKey(index) {
  return `${SLOT_PREFIX}${index}`;
}

export function isSlotIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < SLOT_COUNT;
}

export function captureState(engine) {
  const players = engine.players.map((player) => ({
    money: player.money,
    points: player.points,
    position: player.position,
    inventory: (player.inventory || []).map((card) => ({ type: card.type, name: card.name })),
    hospitalTurns: player.hospitalTurns,
    isBankrupt: !!player.isBankrupt,
    direction: player.direction,
    stayNextTurn: !!player.stayNextTurn,
    startAssets: player.startAssets,
    remoteDice: !!player.remoteDice,
  }));

  const properties = [];
  engine.board.tiles.forEach((tile, index) => {
    if (tile.type !== 'road') return;
    const ownerIndex = tile.owner ? engine.players.indexOf(tile.owner) : -1;
    properties.push({
      index,
      ownerIndex: ownerIndex >= 0 ? ownerIndex : null,
      level: tile.level || 0,
      buildingType: tile.buildingType || null,
    });
  });

  const blockers = [];
  const mines = [];
  for (let index = 0; index < engine.board.tiles.length; index += 1) {
    if (engine.board.hasBlocker(index)) blockers.push(index);
    if (engine.board.hasMine(index)) mines.push(index);
  }

  const date = engine.gameDate;
  return {
    id: SAVE_ID,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    board: fingerprintBoard(engine.board),
    game: {
      gameOver: !!engine.gameOver,
      gameDate: {
        y: date.getFullYear(),
        m: date.getMonth() + 1,
        d: date.getDate(),
      },
      priceIndex: engine.priceIndex,
      targetPriceIndex: engine.targetPriceIndex,
      turnsThisDay: engine.turnsThisDay,
      currentPlayerIndex: engine.turnManager.getCurrentPlayerIndex
        ? engine.turnManager.getCurrentPlayerIndex()
        : engine.turnManager.currentIndex,
      bankruptcyOrder: (engine.bankruptcyOrder || []).map((player) => engine.players.indexOf(player)),
      diceFace: Number.isInteger(engine.diceFace) ? engine.diceFace : 1,
    },
    players,
    properties,
    blockers,
    mines,
  };
}

function isValidLevel(buildingType, level) {
  if (!isSafeInteger(level) || level < 0) return false;
  if (buildingType === 'store') return level >= 1 && level <= 3;
  if (buildingType === 'park') return level === 1;
  if (buildingType === 'house' || buildingType === null) return level <= 5;
  return false;
}

function validatePlayers(players, pathLength) {
  if (!Array.isArray(players) || players.length !== 4) return fail(SAVE_MESSAGES.players);
  for (const player of players) {
    if (!isPlainObject(player)) return fail(SAVE_MESSAGES.players);
    if (!isSafeInteger(player.money) || player.money > 1e15 || player.money < -1e15) {
      return fail(SAVE_MESSAGES.players);
    }
    if (!isSafeInteger(player.points) || player.points < 0 || player.points > 1e9) {
      return fail(SAVE_MESSAGES.players);
    }
    if (!isSafeInteger(player.position) || player.position < 0 || player.position >= pathLength) {
      return fail(SAVE_MESSAGES.players);
    }
    if (!isSafeInteger(player.hospitalTurns) || player.hospitalTurns < 0 || player.hospitalTurns > 3) {
      return fail(SAVE_MESSAGES.players);
    }
    if (typeof player.isBankrupt !== 'boolean') return fail(SAVE_MESSAGES.players);
    if (player.isBankrupt !== player.money < 0) return fail(SAVE_MESSAGES.players);
    if (player.direction !== 1 && player.direction !== -1) return fail(SAVE_MESSAGES.players);
    if (typeof player.stayNextTurn !== 'boolean') return fail(SAVE_MESSAGES.players);
    if (typeof player.remoteDice !== 'boolean') return fail(SAVE_MESSAGES.players);
    if (!isSafeInteger(player.startAssets) || player.startAssets <= 0 || player.startAssets > 1e15) {
      return fail(SAVE_MESSAGES.players);
    }
    if (!Array.isArray(player.inventory) || player.inventory.length > 8) return fail(SAVE_MESSAGES.players);
    for (const card of player.inventory) {
      if (!isPlainObject(card)) return fail(SAVE_MESSAGES.players);
      if (!Object.prototype.hasOwnProperty.call(CARD_CATALOG, card.type)) return fail(SAVE_MESSAGES.players);
      if (card.name !== CARD_CATALOG[card.type]) return fail(SAVE_MESSAGES.players);
    }
  }
  return null;
}

function validateProperties(properties, roadIndices, players) {
  if (!Array.isArray(properties)) return fail(SAVE_MESSAGES.properties);
  const expected = new Set(roadIndices);
  const seen = new Set();
  for (const prop of properties) {
    if (!isPlainObject(prop)) return fail(SAVE_MESSAGES.properties);
    if (!isSafeInteger(prop.index) || !expected.has(prop.index) || seen.has(prop.index)) {
      return fail(SAVE_MESSAGES.properties);
    }
    seen.add(prop.index);
    const ownerIndex = prop.ownerIndex;
    if (ownerIndex !== null && (!isSafeInteger(ownerIndex) || ownerIndex < 0 || ownerIndex >= players.length)) {
      return fail(SAVE_MESSAGES.properties);
    }
    if (ownerIndex !== null && players[ownerIndex].isBankrupt) return fail(SAVE_MESSAGES.properties);
    if (prop.buildingType !== null && !BUILDING_TYPES.has(prop.buildingType)) {
      return fail(SAVE_MESSAGES.properties);
    }
    if (!isValidLevel(prop.buildingType, prop.level)) return fail(SAVE_MESSAGES.properties);
  }
  if (seen.size !== expected.size) return fail(SAVE_MESSAGES.properties);
  return null;
}

function validateIndexList(list, pathLength) {
  if (!Array.isArray(list)) return fail(SAVE_MESSAGES.hazards);
  const seen = new Set();
  for (const index of list) {
    if (!isSafeInteger(index) || index < 0 || index >= pathLength || seen.has(index)) {
      return fail(SAVE_MESSAGES.hazards);
    }
    seen.add(index);
  }
  return null;
}

function validateHazards(blockers, mines, pathLength, players) {
  const blockerResult = validateIndexList(blockers, pathLength);
  if (blockerResult) return blockerResult;
  const mineResult = validateIndexList(mines, pathLength);
  if (mineResult) return mineResult;
  const blockerSet = new Set(blockers);
  for (const index of mines) {
    if (blockerSet.has(index)) return fail(SAVE_MESSAGES.hazards);
  }
  const occupied = new Set();
  players.forEach((player) => {
    if (!player.isBankrupt && player.hospitalTurns === 0) occupied.add(player.position);
  });
  for (const index of blockers) {
    if (occupied.has(index)) return fail(SAVE_MESSAGES.hazards);
  }
  for (const index of mines) {
    if (occupied.has(index)) return fail(SAVE_MESSAGES.hazards);
  }
  return null;
}

function validateGame(game, players) {
  if (!isPlainObject(game)) return fail(SAVE_MESSAGES.turn);
  if (typeof game.gameOver !== 'boolean') return fail(SAVE_MESSAGES.turn);
  if (!isPlainObject(game.gameDate)) return fail(SAVE_MESSAGES.economy);
  const { y, m, d } = game.gameDate;
  if (!isSafeInteger(y) || !isSafeInteger(m) || !isSafeInteger(d)) return fail(SAVE_MESSAGES.economy);
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return fail(SAVE_MESSAGES.economy);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return fail(SAVE_MESSAGES.economy);
  }
  if (!Number.isFinite(game.priceIndex) || game.priceIndex < 1 || game.priceIndex > 1e7) {
    return fail(SAVE_MESSAGES.economy);
  }
  if (!Number.isFinite(game.targetPriceIndex) || game.targetPriceIndex < 0 || game.targetPriceIndex > 1e7) {
    return fail(SAVE_MESSAGES.economy);
  }
  if (!isSafeInteger(game.turnsThisDay) || game.turnsThisDay < 0 || game.turnsThisDay > players.length) {
    return fail(SAVE_MESSAGES.turn);
  }
  if (!isSafeInteger(game.currentPlayerIndex) || game.currentPlayerIndex < 0 || game.currentPlayerIndex >= players.length) {
    return fail(SAVE_MESSAGES.turn);
  }
  if (!Array.isArray(game.bankruptcyOrder)) return fail(SAVE_MESSAGES.turn);
  const bankrupt = [];
  players.forEach((player, index) => {
    if (player.isBankrupt) bankrupt.push(index);
  });
  if (game.bankruptcyOrder.length !== bankrupt.length) return fail(SAVE_MESSAGES.turn);
  const seen = new Set();
  for (const index of game.bankruptcyOrder) {
    if (!isSafeInteger(index) || !players[index] || !players[index].isBankrupt || seen.has(index)) {
      return fail(SAVE_MESSAGES.turn);
    }
    seen.add(index);
  }
  const alive = players.length - bankrupt.length;
  if (game.gameOver !== alive <= 1) return fail(SAVE_MESSAGES.turn);
  if (!game.gameOver && players[game.currentPlayerIndex].isBankrupt) return fail(SAVE_MESSAGES.turn);
  if (!game.gameOver && alive > 0 && game.turnsThisDay >= alive) return fail(SAVE_MESSAGES.turn);
  if (game.diceFace !== undefined && (!isSafeInteger(game.diceFace) || game.diceFace < 1 || game.diceFace > 6)) {
    return fail(SAVE_MESSAGES.turn);
  }
  return null;
}

function clonePlayers(players) {
  return players.map((player) => ({
    money: player.money,
    points: player.points,
    position: player.position,
    inventory: player.inventory.map((card) => ({ type: card.type, name: card.name })),
    hospitalTurns: player.hospitalTurns,
    isBankrupt: player.isBankrupt,
    direction: player.direction,
    stayNextTurn: player.stayNextTurn,
    startAssets: player.startAssets,
    remoteDice: player.remoteDice,
  }));
}

function cloneProperties(properties) {
  return properties.map((prop) => ({
    index: prop.index,
    ownerIndex: prop.ownerIndex,
    level: prop.level,
    buildingType: prop.buildingType,
  }));
}

export function validateSnapshot(raw, context) {
  if (!isPlainObject(raw) || !isPlainObject(context) || !isPlainObject(context.fingerprint)) {
    return fail(SAVE_MESSAGES.invalid);
  }
  if (raw.id !== SAVE_ID) return fail(SAVE_MESSAGES.invalid);
  if (raw.version !== SAVE_VERSION) return fail(SAVE_MESSAGES.version);
  if (typeof raw.savedAt !== 'string' || raw.savedAt.length > 40) return fail(SAVE_MESSAGES.invalid);
  if (!isPlainObject(raw.board)) return fail(SAVE_MESSAGES.board);
  const expected = context.fingerprint;
  const board = raw.board;
  if (
    board.width !== expected.width
    || board.height !== expected.height
    || board.pathLength !== expected.pathLength
    || board.pathHash !== expected.pathHash
  ) {
    return fail(SAVE_MESSAGES.board);
  }
  if (!Array.isArray(context.roadIndices) || context.pathLength !== expected.pathLength) {
    return fail(SAVE_MESSAGES.invalid);
  }

  const playerResult = validatePlayers(raw.players, expected.pathLength);
  if (playerResult) return playerResult;
  const propertyResult = validateProperties(raw.properties, context.roadIndices, raw.players);
  if (propertyResult) return propertyResult;
  const hazardResult = validateHazards(raw.blockers, raw.mines, expected.pathLength, raw.players);
  if (hazardResult) return hazardResult;
  const gameResult = validateGame(raw.game, raw.players);
  if (gameResult) return gameResult;

  return {
    ok: true,
    snapshot: {
      id: SAVE_ID,
      version: SAVE_VERSION,
      savedAt: raw.savedAt,
      board: {
        width: board.width,
        height: board.height,
        pathLength: board.pathLength,
        pathHash: board.pathHash,
      },
      game: {
        gameOver: raw.game.gameOver,
        gameDate: {
          y: raw.game.gameDate.y,
          m: raw.game.gameDate.m,
          d: raw.game.gameDate.d,
        },
        priceIndex: raw.game.priceIndex,
        targetPriceIndex: raw.game.targetPriceIndex,
        turnsThisDay: raw.game.turnsThisDay,
        currentPlayerIndex: raw.game.currentPlayerIndex,
        bankruptcyOrder: raw.game.bankruptcyOrder.slice(),
        diceFace: raw.game.diceFace === undefined ? 1 : raw.game.diceFace,
      },
      players: clonePlayers(raw.players),
      properties: cloneProperties(raw.properties),
      blockers: raw.blockers.slice(),
      mines: raw.mines.slice(),
    },
  };
}

function writeSnapshot(engine, snapshot) {
  snapshot.players.forEach((saved, index) => {
    const player = engine.players[index];
    player.money = saved.money;
    player.points = saved.points;
    player.position = saved.position;
    player.inventory = saved.inventory.map((card) => ({ type: card.type, name: card.name }));
    player.hospitalTurns = saved.hospitalTurns;
    player.isBankrupt = saved.isBankrupt;
    player.direction = saved.direction;
    player.stayNextTurn = saved.stayNextTurn;
    player.startAssets = saved.startAssets;
    player.remoteDice = saved.remoteDice;
    if (typeof player.resetTokenStyle === 'function') player.resetTokenStyle();
    const position = engine.board.getTilePosition(saved.position);
    if (typeof player.placeAt === 'function') player.placeAt(engine, position);
    if (player.isBankrupt && typeof player.markBankrupt === 'function') player.markBankrupt();
  });

  engine.board.tiles.forEach((tile) => {
    if (tile.type !== 'road') return;
    tile.owner = null;
    tile.level = 0;
    delete tile.buildingType;
    engine.board.setOwner(tile.index, null);
    engine.board.setPlot(tile.index, null, 0, 'house');
  });

  snapshot.properties.forEach((prop) => {
    const tile = engine.board.tiles[prop.index];
    const owner = prop.ownerIndex === null ? null : engine.players[prop.ownerIndex];
    tile.owner = owner;
    tile.level = prop.level;
    if (prop.buildingType) tile.buildingType = prop.buildingType;
    else delete tile.buildingType;
    engine.board.setOwner(tile.index, owner);
    engine.board.setPlot(tile.index, owner, tile.level, tile.buildingType || 'house');
  });

  for (let index = 0; index < engine.board.tiles.length; index += 1) {
    engine.board.clearBlocker(index);
    engine.board.clearMine(index);
  }
  snapshot.blockers.forEach((index) => engine.board.placeBlocker(index));
  snapshot.mines.forEach((index) => engine.board.placeMine(index));

  const game = snapshot.game;
  engine.gameOver = game.gameOver;
  engine.priceIndex = game.priceIndex;
  engine.targetPriceIndex = game.targetPriceIndex;
  engine.turnsThisDay = game.turnsThisDay;
  engine.diceFace = game.diceFace;
  engine.isRolling = false;
  engine.modalLock = false;
  engine.bankruptcyOrder = game.bankruptcyOrder.map((index) => engine.players[index]);
  engine.gameDate = new Date(game.gameDate.y, game.gameDate.m - 1, game.gameDate.d);
  if (typeof engine.turnManager.setCurrentIndex === 'function') {
    engine.turnManager.setCurrentIndex(game.currentPlayerIndex);
  } else {
    engine.turnManager.currentIndex = game.currentPlayerIndex;
  }
}

export function applySnapshot(engine, raw) {
  const verdict = validateSnapshot(raw, describeEngine(engine));
  if (!verdict.ok) return verdict;
  writeSnapshot(engine, verdict.snapshot);
  if (typeof engine.onSnapshotApplied === 'function') engine.onSnapshotApplied();
  return { ok: true };
}

export function parseSnapshotText(text) {
  if (typeof text !== 'string') return fail(SAVE_MESSAGES.invalid);
  if (text.length > MAX_SNAPSHOT_CHARS) return fail(SAVE_MESSAGES.tooLarge);
  try {
    return { ok: true, snapshot: JSON.parse(text) };
  } catch {
    return fail(SAVE_MESSAGES.invalid);
  }
}

export function getLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__richman_save_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function readStorageItem(storage, index) {
  try {
    return { ok: true, text: storage.getItem(slotKey(index)) };
  } catch {
    return fail(SAVE_MESSAGES.storage);
  }
}

export function readSlot(storage, index) {
  if (!storage) return fail(SAVE_MESSAGES.storage);
  if (!isSlotIndex(index)) return fail(SAVE_MESSAGES.invalid);
  const stored = readStorageItem(storage, index);
  if (!stored.ok) return stored;
  if (!stored.text) return { ...fail(SAVE_MESSAGES.empty), empty: true };
  const parsed = parseSnapshotText(stored.text);
  if (!parsed.ok) return { ...parsed, corrupt: true };
  return { ok: true, snapshot: parsed.snapshot };
}

export function writeSlot(storage, index, snapshot) {
  if (!storage) return fail(SAVE_MESSAGES.storage);
  if (!isSlotIndex(index) || !isPlainObject(snapshot)) return fail(SAVE_MESSAGES.invalid);
  try {
    storage.setItem(slotKey(index), JSON.stringify(snapshot));
    return { ok: true };
  } catch {
    return fail(SAVE_MESSAGES.write);
  }
}

export function removeSlot(storage, index) {
  if (!storage) return fail(SAVE_MESSAGES.storage);
  if (!isSlotIndex(index)) return fail(SAVE_MESSAGES.invalid);
  try {
    storage.removeItem(slotKey(index));
    return { ok: true };
  } catch {
    return fail(SAVE_MESSAGES.storage);
  }
}

export function listSlots(storage) {
  const slots = [];
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    if (!storage) {
      slots.push({
        index,
        occupied: false,
        unavailable: true,
        corrupt: false,
        savedAt: '',
        gameDate: null,
        currentPlayerIndex: null,
        gameOver: false,
      });
      continue;
    }
    const result = readSlot(storage, index);
    const snapshot = result.ok ? result.snapshot : null;
    slots.push({
      index,
      occupied: !!result.ok || !!result.corrupt,
      unavailable: false,
      corrupt: !!result.corrupt,
      savedAt: snapshot && typeof snapshot.savedAt === 'string' ? snapshot.savedAt : '',
      gameDate: snapshot && snapshot.game ? snapshot.game.gameDate : null,
      currentPlayerIndex: snapshot && snapshot.game ? snapshot.game.currentPlayerIndex : null,
      gameOver: !!(snapshot && snapshot.game && snapshot.game.gameOver),
    });
  }
  return slots;
}

export function hasAnySlot(storage) {
  return listSlots(storage).some((slot) => slot.occupied && !slot.corrupt);
}

export function formatSavedAt(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function formatGameDate(gameDate) {
  if (!isPlainObject(gameDate) || !isSafeInteger(gameDate.y)) return '';
  return `${gameDate.y}-${String(gameDate.m).padStart(2, '0')}-${String(gameDate.d).padStart(2, '0')}`;
}

export function describeSlot(slot) {
  if (!slot || slot.unavailable) return '本地存储不可用';
  if (!slot.occupied) return '空';
  if (slot.corrupt) return '存档已损坏';
  const when = formatSavedAt(slot.savedAt);
  const gameDate = formatGameDate(slot.gameDate);
  const who = Number.isInteger(slot.currentPlayerIndex) ? `玩家${slot.currentPlayerIndex + 1}` : '';
  const turn = slot.gameOver ? '对局已结束' : who;
  return [when, gameDate ? `游戏日期 ${gameDate}` : '', turn].filter(Boolean).join('  ·  ') || '未识别的存档';
}

export function exportFilename(slotLabel, snapshot) {
  const stamp = formatSavedAt(snapshot && snapshot.savedAt).replace(/[-: ]/g, '');
  const suffix = stamp || 'unsaved';
  return `richman-save-${slotLabel}-${suffix}.json`;
}

export function downloadSnapshot(snapshot, filename) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}
