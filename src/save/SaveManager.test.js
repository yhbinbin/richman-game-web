import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Player from '../Player.js';
import { formatFullDate } from '../utils/TimeUtils.js';
import {
  SAVE_MESSAGES,
  applySnapshot,
  captureState,
  createMemoryStorage,
  describeSlot,
  exportFilename,
  fingerprintBoard,
  listSlots,
  parseSnapshotText,
  readSlot,
  removeSlot,
  validateSnapshot,
  writeSlot,
  describeEngine,
} from './SaveManager.js';

function tokenMock() {
  return {
    x: 0,
    y: 0,
    fill: null,
    alpha: 1,
    stroke: null,
    setPosition(x, y) {
      this.x = x;
      this.y = y;
    },
    setFillStyle(color) {
      this.fill = color;
    },
    setAlpha(alpha) {
      this.alpha = alpha;
    },
    setStrokeStyle(_width, color) {
      this.stroke = color;
    },
  };
}

function ringMock() {
  return {
    x: 0,
    y: 0,
    visible: true,
    setPosition(x, y) {
      this.x = x;
      this.y = y;
    },
    setVisible(visible) {
      this.visible = visible;
    },
  };
}

function makeEngine() {
  const path = [];
  const tiles = [];
  for (let index = 0; index < 8; index += 1) {
    path.push({ x: index, y: 0 });
    const isRoad = index % 2 === 0;
    tiles.push({
      index,
      type: isRoad ? 'road' : 'event',
      name: isRoad ? `路${index}` : `事件${index}`,
      price: isRoad ? 1000 + index * 100 : undefined,
      amount: isRoad ? undefined : 10,
      level: 0,
      owner: null,
    });
  }

  const blockers = new Set();
  const mines = new Set();
  const board = {
    grid: { width: 8, height: 2 },
    path,
    tiles,
    hasBlocker: (index) => blockers.has(index),
    placeBlocker: (index) => blockers.add(index),
    clearBlocker: (index) => blockers.delete(index),
    hasMine: (index) => mines.has(index),
    placeMine: (index) => mines.add(index),
    clearMine: (index) => mines.delete(index),
    setOwner(index, player) {
      this.ownerMarks = this.ownerMarks || {};
      this.ownerMarks[index] = player;
    },
    setPlot(index, player, level, buildingType) {
      this.plots = this.plots || {};
      this.plots[index] = { player, level, buildingType };
    },
    getTilePosition: (index) => ({ x: index * 10, y: 5 }),
    setPriceIndex(value) {
      this.priceIndex = value;
    },
    disablePlacement() {},
  };

  const names = ['🔴玩家1', '🔵玩家2', '🟢玩家3', '🟠玩家4'];
  const colors = [0xff6b6b, 0x4d96ff, 0x22c55e, 0xf59e0b];
  const players = names.map((name, index) => {
    const player = new Player(name, colors[index]);
    player.money = 100000;
    player.points = 50;
    player.position = index;
    player.direction = 1;
    player.startAssets = 100000;
    player.tokenOffset = { x: 1, y: 2 };
    player.token = tokenMock();
    player.highlightRing = ringMock();
    return player;
  });

  players[0].money = 80000;
  players[0].points = 40;
  players[0].position = 0;
  players[0].direction = 1;
  players[0].inventory = [
    { type: 'remote', name: '遥控骰子' },
    { type: 'mine', name: '地雷' },
  ];

  players[1].money = 120000;
  players[1].points = 10;
  players[1].position = 5;
  players[1].direction = -1;
  players[1].hospitalTurns = 2;

  players[2].money = 90000;
  players[2].points = 0;
  players[2].position = 2;
  players[2].stayNextTurn = true;
  players[2].remoteDice = true;

  players[3].money = -500;
  players[3].points = 3;
  players[3].position = 4;
  players[3].isBankrupt = true;

  tiles[0].owner = players[0];
  tiles[0].level = 2;
  tiles[0].buildingType = 'house';
  tiles[2].owner = players[1];
  tiles[2].level = 3;
  tiles[2].buildingType = 'store';
  tiles[4].owner = null;
  tiles[4].level = 1;
  tiles[4].buildingType = 'park';
  blockers.add(7);
  mines.add(5);

  const engine = {
    players,
    board,
    turnManager: {
      currentIndex: 1,
      getCurrentPlayerIndex() {
        return this.currentIndex;
      },
      setCurrentIndex(index) {
        this.currentIndex = index;
      },
    },
    gameDate: new Date(2026, 0, 31, 22, 30, 0),
    priceIndex: 1.4,
    targetPriceIndex: 1.6,
    turnsThisDay: 2,
    gameOver: false,
    bankruptcyOrder: [players[3]],
    diceFace: 5,
    isRolling: true,
    modalLock: true,
    tweens: { killTweensOf() {} },
    applied: 0,
    onSnapshotApplied() {
      this.applied += 1;
    },
  };
  return engine;
}

function scramble(engine) {
  engine.players.forEach((player, index) => {
    player.money = 1;
    player.points = 1;
    player.position = 0;
    player.inventory = [];
    player.hospitalTurns = 0;
    player.isBankrupt = false;
    player.direction = 1;
    player.stayNextTurn = false;
    player.startAssets = 1;
    player.remoteDice = false;
    player.token.setPosition(99, 99);
    player.token.setFillStyle(0x111111);
    player.token.setAlpha(0.2);
  });
  engine.board.tiles.forEach((tile) => {
    if (tile.type !== 'road') return;
    tile.owner = engine.players[0];
    tile.level = 5;
    tile.buildingType = 'house';
  });
  for (let index = 0; index < engine.board.tiles.length; index += 1) {
    engine.board.clearBlocker(index);
    engine.board.clearMine(index);
  }
  engine.board.placeBlocker(1);
  engine.board.placeMine(3);
  engine.gameDate = new Date(2030, 5, 1);
  engine.priceIndex = 9;
  engine.targetPriceIndex = 9;
  engine.turnsThisDay = 0;
  engine.gameOver = true;
  engine.bankruptcyOrder = [];
  engine.diceFace = 1;
  engine.turnManager.currentIndex = 0;
  engine.isRolling = true;
  engine.modalLock = true;
}

test('capture validates and round-trips the full match', () => {
  const engine = makeEngine();
  const snapshot = captureState(engine);
  const verdict = validateSnapshot(snapshot, describeEngine(engine));
  assert.equal(verdict.ok, true);
  assert.equal(snapshot.game.gameDate.y, 2026);
  assert.equal(snapshot.game.gameDate.m, 1);
  assert.equal(snapshot.game.gameDate.d, 31);
  assert.equal(snapshot.players[1].hospitalTurns, 2);
  assert.equal(snapshot.players[1].direction, -1);
  assert.equal(snapshot.players[2].stayNextTurn, true);
  assert.equal(snapshot.players[2].remoteDice, true);
  assert.deepEqual(snapshot.blockers, [7]);
  assert.deepEqual(snapshot.mines, [5]);
  assert.equal(snapshot.properties.find((item) => item.index === 4).buildingType, 'park');
  assert.equal(snapshot.properties.find((item) => item.index === 4).ownerIndex, null);
  assert.equal(snapshot.game.bankruptcyOrder[0], 3);

  const isolated = structuredClone(snapshot);
  isolated.players[0].inventory.push({ type: 'block', name: '路障' });
  assert.equal(engine.players[0].inventory.length, 2);
  assert.equal(snapshot.players[0].inventory.length, 2);

  scramble(engine);
  const applied = applySnapshot(engine, snapshot);
  assert.equal(applied.ok, true);
  assert.equal(engine.applied, 1);
  assert.equal(engine.players[0].money, 80000);
  assert.equal(engine.players[0].points, 40);
  assert.equal(engine.players[0].inventory.length, 2);
  assert.equal(engine.players[0].inventory[0].type, 'remote');
  assert.equal(engine.players[1].position, 5);
  assert.equal(engine.players[1].hospitalTurns, 2);
  assert.equal(engine.players[1].direction, -1);
  assert.equal(engine.players[2].stayNextTurn, true);
  assert.equal(engine.players[2].remoteDice, true);
  assert.equal(engine.players[2].points, 0);
  assert.equal(engine.players[3].isBankrupt, true);
  assert.equal(engine.players[3].money, -500);
  assert.equal(engine.players[3].token.alpha, 0.6);
  assert.equal(engine.players[0].token.alpha, 1);
  assert.equal(engine.players[0].token.fill, engine.players[0].color);
  assert.equal(engine.players[0].token.x, 1);
  assert.equal(engine.players[0].token.y, 7);
  assert.equal(engine.players[1].token.x, 51);
  assert.equal(engine.board.tiles[0].owner, engine.players[0]);
  assert.equal(engine.board.tiles[0].level, 2);
  assert.equal(engine.board.tiles[0].buildingType, 'house');
  assert.equal(engine.board.tiles[2].buildingType, 'store');
  assert.equal(engine.board.tiles[2].level, 3);
  assert.equal(engine.board.tiles[2].owner, engine.players[1]);
  assert.equal(engine.board.tiles[4].owner, null);
  assert.equal(engine.board.tiles[4].buildingType, 'park');
  assert.equal(engine.board.tiles[6].owner, null);
  assert.equal(engine.board.tiles[6].level, 0);
  assert.equal(engine.board.tiles[6].buildingType, undefined);
  assert.equal(engine.board.ownerMarks[0], engine.players[0]);
  assert.equal(engine.board.ownerMarks[4], null);
  assert.equal(engine.board.plots[2].buildingType, 'store');
  assert.equal(engine.board.hasBlocker(7), true);
  assert.equal(engine.board.hasBlocker(1), false);
  assert.equal(engine.board.hasMine(5), true);
  assert.equal(engine.board.hasMine(3), false);
  assert.equal(engine.turnManager.currentIndex, 1);
  assert.equal(engine.priceIndex, 1.4);
  assert.equal(engine.targetPriceIndex, 1.6);
  assert.equal(engine.turnsThisDay, 2);
  assert.equal(engine.gameOver, false);
  assert.equal(engine.diceFace, 5);
  assert.equal(engine.isRolling, false);
  assert.equal(engine.modalLock, false);
  assert.deepEqual(engine.bankruptcyOrder, [engine.players[3]]);
  assert.equal(formatFullDate(engine.gameDate), formatFullDate(new Date(2026, 0, 31)));
  assert.equal(engine.players[0].startAssets, 100000);
});

test('invalid snapshot does not change the match', () => {
  const engine = makeEngine();
  const snapshot = captureState(engine);
  snapshot.version = 2;
  const money = engine.players[0].money;
  const result = applySnapshot(engine, snapshot);
  assert.equal(result.ok, false);
  assert.equal(result.message, SAVE_MESSAGES.version);
  assert.equal(engine.players[0].money, money);
  assert.equal(engine.applied, 0);
  assert.equal(engine.priceIndex, 1.4);
});

test('rejects incompatible or inconsistent saves', () => {
  const engine = makeEngine();
  const context = describeEngine(engine);
  const base = captureState(engine);

  const badBoard = structuredClone(base);
  badBoard.board.pathHash += 1;
  assert.equal(validateSnapshot(badBoard, context).message, SAVE_MESSAGES.board);

  const badDate = structuredClone(base);
  badDate.game.gameDate = { y: 2026, m: 2, d: 31 };
  assert.equal(validateSnapshot(badDate, context).message, SAVE_MESSAGES.economy);

  const badMine = structuredClone(base);
  badMine.mines = [0];
  assert.equal(validateSnapshot(badMine, context).message, SAVE_MESSAGES.hazards);

  const stacked = structuredClone(base);
  stacked.blockers = [5];
  assert.equal(validateSnapshot(stacked, context).message, SAVE_MESSAGES.hazards);

  const badOwner = structuredClone(base);
  badOwner.properties.find((item) => item.index === 6).ownerIndex = 3;
  assert.equal(validateSnapshot(badOwner, context).message, SAVE_MESSAGES.properties);

  const badLevel = structuredClone(base);
  badLevel.properties.find((item) => item.index === 2).level = 4;
  assert.equal(validateSnapshot(badLevel, context).message, SAVE_MESSAGES.properties);

  const badCard = structuredClone(base);
  badCard.players[0].inventory[0].name = '地雷';
  assert.equal(validateSnapshot(badCard, context).message, SAVE_MESSAGES.players);

  const currentBankrupt = structuredClone(base);
  currentBankrupt.game.currentPlayerIndex = 3;
  assert.equal(validateSnapshot(currentBankrupt, context).message, SAVE_MESSAGES.turn);

  const dayOverflow = structuredClone(base);
  dayOverflow.game.turnsThisDay = 3;
  assert.equal(validateSnapshot(dayOverflow, context).message, SAVE_MESSAGES.turn);

  const notJson = parseSnapshotText('{');
  assert.equal(notJson.ok, false);
  assert.equal(parseSnapshotText('{"id":1}').ok, true);
  assert.equal(validateSnapshot(JSON.parse('{"id":1}'), context).message, SAVE_MESSAGES.invalid);
  assert.equal(parseSnapshotText('x'.repeat(256 * 1024 + 1)).message, SAVE_MESSAGES.tooLarge);
});

test('accepts a finished game whose current player is bankrupt', () => {
  const engine = makeEngine();
  const snapshot = captureState(engine);
  snapshot.players.forEach((player, index) => {
    if (index === 3) return;
    player.money = -100 - index;
    player.isBankrupt = true;
  });
  snapshot.properties.forEach((prop) => {
    if (prop.ownerIndex === 0 || prop.ownerIndex === 1) prop.ownerIndex = null;
  });
  snapshot.game.gameOver = true;
  snapshot.game.currentPlayerIndex = 0;
  snapshot.game.bankruptcyOrder = [3, 0, 1, 2];
  snapshot.mines = [];
  const verdict = validateSnapshot(snapshot, describeEngine(engine));
  assert.equal(verdict.ok, true);
  assert.equal(applySnapshot(engine, snapshot).ok, true);
  assert.equal(engine.gameOver, true);
  assert.deepEqual(engine.bankruptcyOrder.map((player) => engine.players.indexOf(player)), [3, 0, 1, 2]);
  assert.equal(engine.board.tiles[0].owner, null);
  assert.equal(engine.board.tiles[2].owner, null);
});

test('local slots survive a storage round-trip and ignore bad JSON', () => {
  const engine = makeEngine();
  const storage = createMemoryStorage();
  const snapshot = validateSnapshot(captureState(engine), describeEngine(engine)).snapshot;
  assert.equal(writeSlot(storage, 1, snapshot).ok, true);
  assert.equal(writeSlot(storage, 3, snapshot).ok, false);
  const listed = listSlots(storage);
  assert.equal(listed[0].occupied, false);
  assert.equal(listed[1].occupied, true);
  assert.equal(listed[1].currentPlayerIndex, 1);
  assert.match(describeSlot(listed[1]), /玩家2/);
  assert.match(describeSlot(listed[1]), /游戏日期 2026-01-31/);
  const loaded = readSlot(storage, 1);
  assert.equal(loaded.ok, true);
  assert.equal(applySnapshot(engine, loaded.snapshot).ok, true);

  storage.setItem('richman-game:save:slot:0', '{bad');
  const corrupt = listSlots(storage)[0];
  assert.equal(corrupt.corrupt, true);
  assert.equal(corrupt.occupied, true);
  assert.equal(readSlot(storage, 0).ok, false);
  assert.equal(removeSlot(storage, 0).ok, true);
  assert.equal(listSlots(storage)[0].occupied, false);
  assert.equal(describeSlot(listSlots(storage)[0]), '空');
  assert.match(exportFilename('slot2', snapshot), /^richman-save-slot2-/);
});

test('board fingerprint changes when map data changes', () => {
  const engine = makeEngine();
  const first = fingerprintBoard(engine.board);
  engine.board.tiles[0].price += 1;
  const second = fingerprintBoard(engine.board);
  assert.notEqual(first.pathHash, second.pathHash);
  engine.board.tiles[0].price -= 1;
  assert.equal(fingerprintBoard(engine.board).pathHash, first.pathHash);
});

test('real board map can be snapshotted', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../public/data/board.json', import.meta.url), 'utf8'));
  const tiles = data.path.map((pos, index) => {
    const cell = (data.cells[pos.y] && data.cells[pos.y][pos.x]) || { type: 'empty', name: '' };
    const tile = {
      index,
      type: cell.type,
      name: cell.name || `地块${index}`,
      level: 0,
      owner: null,
    };
    if (cell.price !== undefined) tile.price = cell.price;
    if (cell.amount !== undefined) tile.amount = cell.amount;
    return tile;
  });
  const players = [0, 1, 2, 3].map((index) => ({
    money: 100000 - index,
    points: 50,
    position: index,
    inventory: index === 0 ? [{ type: 'remote', name: '遥控骰子' }] : [],
    hospitalTurns: 0,
    isBankrupt: false,
    direction: index % 2 === 0 ? 1 : -1,
    stayNextTurn: false,
    startAssets: 100000,
    remoteDice: false,
  }));
  const engine = {
    players,
    board: {
      grid: { width: data.width, height: data.height },
      path: data.path,
      tiles,
      hasBlocker: () => false,
      hasMine: () => false,
    },
    turnManager: { currentIndex: 0, getCurrentPlayerIndex() { return 0; } },
    gameDate: new Date(2026, 10, 19),
    priceIndex: 1,
    targetPriceIndex: 1,
    turnsThisDay: 0,
    gameOver: false,
    bankruptcyOrder: [],
    diceFace: 1,
  };
  const snapshot = captureState(engine);
  const verdict = validateSnapshot(snapshot, describeEngine(engine));
  assert.equal(verdict.ok, true);
  assert.equal(snapshot.board.pathLength, data.path.length);
  assert.equal(snapshot.properties.length, tiles.filter((tile) => tile.type === 'road').length);
});

test('storage write failures are reported', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readSlot(storage, 0).message, SAVE_MESSAGES.storage);
  assert.equal(writeSlot(storage, 0, { id: 'richman-game' }).message, SAVE_MESSAGES.write);
  assert.equal(removeSlot(storage, 0).message, SAVE_MESSAGES.storage);
  assert.equal(listSlots(null)[0].unavailable, true);
});
