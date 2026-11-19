import Phaser from 'phaser';
import TurnManager from './TurnManager.js';
import Player from './Player.js';
import Board from './Board.js';
import CardHandler from './handlers/CardHandler.js';
import BuildingHandler from './handlers/BuildingHandler.js';
import EventHandler from './handlers/EventHandler.js';
import NpcHandler from './handlers/NpcHandler.js';
import { formatFullDate } from './utils/TimeUtils.js';
import SavePanel from './save/SavePanel.js';
import { SAVE_MESSAGES, getLocalStorage, hasAnySlot } from './save/SaveManager.js';
import { createDevAutoSave, isDevMode } from './save/DevAutoSave.js';

export default class GameEngine extends Phaser.Scene {
  constructor() {
    super('GameEngine');
    this.board = null;
    this.players = [];
    this.turnManager = null;
    this.ui = {};
    this.isRolling = false;
    this.gameOver = false;
    this.diceValue = 1;
    this.diceFace = 1;
    this.bankruptcyOrder = [];
    this.gameDate = new Date();
    this.priceIndex = 1;
    this.targetPriceIndex = 1;
    this.turnsThisDay = 0;
    this.modalLock = false;
    this.savePanel = null;

    this.cardHandler = new CardHandler(this);
    this.buildingHandler = new BuildingHandler(this);
    this.eventHandler = new EventHandler(this);
    this.npcHandler = new NpcHandler(this);
  }

  preload() {
    this.load.json('board', '/data/board.json');
  }

  create() {
    this.resetMatchState();
    const boardData = this.cache.json.get('board');
    this.board = new Board(this, boardData);
    this.board.render();
    const bounds = this.board.getWorldBounds();
    this.centerCameraOnBoard(bounds);

    this.players = [
      new Player('🔴玩家1', 0xff6b6b),
      new Player('🔵玩家2', 0x4d96ff),
      new Player('🟢玩家3', 0x22c55e),
      new Player('🟠玩家4', 0xf59e0b),
    ];
    this.players.forEach((player, idx) => {
      const startIndex = Phaser.Math.Between(0, this.board.tiles.length - 1);
      player.money = 100000;
      player.points = 50;
      player.position = startIndex;
      player.isBankrupt = false;
      player.direction = Phaser.Math.Between(0, 1) === 0 ? 1 : -1;
      player.createToken(this, this.board.getTilePosition(startIndex), idx);
      player.startAssets = this.getTotalAssets(player);
    });

    this.turnManager = new TurnManager(this.players);

    this.createUI();
    this.savePanel = new SavePanel(this);

    this.giveInitialCards();
    this.renderCardSlots();
    this.updateUI();

    this.enableCameraDrag();
    this.centerCameraOnBoard(bounds);
    this.time.delayedCall(0, () => this.centerCameraOnBoard(bounds));

    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });
    if (hasAnySlot(getLocalStorage())) {
      this.log('检测到本地存档，可点击「读档」继续');
    }
    this.devAutoSave = createDevAutoSave(this, {
      dev: isDevMode(),
      storage: getLocalStorage(),
    });
    const restored = this.devAutoSave.restoreIfPresent();
    if (restored.ok) {
      if (!this.gameOver) this.log('已恢复开发自动存档');
      if (this.ui.notice) {
        this.ui.notice.setText('已恢复开发自动存档').setVisible(true);
        this.time.delayedCall(1200, () => {
          if (this.ui.notice) this.ui.notice.setVisible(false);
        });
      }
    } else if (restored.message) {
      this.log(`开发自动存档无法读取：${restored.message}`);
    }
    this.devAutoSave.arm();
    this.devAutoSave.bindLifecycle();
    this.devAutoSave.flush();
  }

  resetMatchState() {
    this.isRolling = false;
    this.gameOver = false;
    this.diceFace = 1;
    this.bankruptcyOrder = [];
    this.gameDate = new Date();
    this.priceIndex = 1;
    this.targetPriceIndex = 1;
    this.turnsThisDay = 0;
    this.modalLock = false;
    this.directionArrow = null;
    this.ui = {};
    this.savePanel = null;
    this.devAutoSave = null;
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;
    this.cameras.main.setSize(width, height);
    if (this.board) {
      const bounds = this.board.getWorldBounds();
      this.centerCameraOnBoard(bounds);
    }
    this.layoutUI(width, height);
  }

  getHudMetrics(width, height) {
    const top = 92;
    const bottom = 104;
    const side = width < 980 ? 0 : 232;
    return {
      top,
      bottom,
      side,
      play: {
        x: 20,
        y: top + 12,
        width: Math.max(160, width - 40 - side),
        height: Math.max(160, height - top - bottom - 24),
      },
    };
  }

  layoutUI(width, height) {
    const hud = this.getHudMetrics(width, height);
    const play = hud.play;
    if (this.ui.topBar) {
      this.ui.topBar.setPosition(width / 2, hud.top / 2).setSize(width, hud.top);
    }
    if (this.ui.bottomBar) {
      this.ui.bottomBar.setPosition(width / 2, height - hud.bottom / 2).setSize(width, hud.bottom);
    }
    if (this.ui.sidePanel) {
      const sideH = Math.min(240, Math.max(214, play.height * 0.42));
      this.ui.sidePanel
        .setPosition(width - hud.side / 2 - 12, hud.top + 16 + sideH / 2)
        .setSize(hud.side - 8, sideH)
        .setVisible(hud.side > 0);
    }

    if (this.ui.status) this.ui.status.setPosition(22, 12).setWordWrapWidth(Math.max(220, width - 390));
    if (this.ui.meta) this.ui.meta.setPosition(22, 38).setWordWrapWidth(Math.max(220, width - 390));
    if (this.ui.money) this.ui.money.setPosition(22, 62);
    if (this.ui.log) {
      this.ui.log.setPosition(22, hud.top + 4);
      this.ui.log.setWordWrapWidth(Math.max(240, play.width * 0.55));
    }
    if (this.ui.notice) this.ui.notice.setPosition(play.x + 24, play.y + 28);

    if (this.ui.dice) this.ui.dice.setPosition(width - 214, 26);
    if (this.ui.restartBtn) this.ui.restartBtn.setPosition(width - 360, 52);
    if (this.ui.rollBtn) this.ui.rollBtn.setPosition(width - 128, 46);

    const sideX = width - hud.side + 4;
    if (this.ui.rankTitle) this.ui.rankTitle.setPosition(sideX, hud.top + 26).setVisible(hud.side > 0);
    if (this.ui.rankList) this.ui.rankList.setPosition(sideX, hud.top + 50).setVisible(hud.side > 0);
    if (this.ui.saveBtn) this.ui.saveBtn.setPosition(sideX, hud.top + 168).setVisible(hud.side > 0);
    if (this.ui.loadBtn) this.ui.loadBtn.setPosition(sideX + 78, hud.top + 168).setVisible(hud.side > 0);

    const cardTitleY = height - hud.bottom + 10;
    const cardSlotY = height - 58;
    if (this.ui.cardTitle) this.ui.cardTitle.setPosition(22, cardTitleY);
    const slotW = Math.max(86, Math.min(118, Math.floor((width - 150) / 8) - 8));
    const slotH = 32;
    const gapX = 8;
    if (this.ui.cardSlots && this.ui.cardSlots.length) {
      for (let i = 0; i < 8; i += 1) {
        const x = 22 + i * (slotW + gapX);
        if (this.ui.cardSlots[i]) {
          this.ui.cardSlots[i].setPosition(x + slotW / 2, cardSlotY + slotH / 2);
          this.ui.cardSlots[i].setSize(slotW, slotH);
        }
        if (this.ui.cardTexts[i]) this.ui.cardTexts[i].setPosition(x + 8, cardSlotY + 8);
      }
    }
    if (this.ui.queryBtn) this.ui.queryBtn.setPosition(width - 92, cardSlotY);

    if (this.savePanel && this.savePanel.isOpen()) this.savePanel.layout();

    const dialogX = play.x + play.width / 2;
    const dialogY = height - hud.bottom - 78;
    this.ui.anchors = {
      buy: { x: dialogX - 150, y: dialogY + 18 },
      skip: { x: dialogX - 48, y: dialogY + 18 },
      skipWide: { x: dialogX + 150, y: dialogY + 18 },
    };
    if (this.ui.choiceBox) {
      this.ui.choiceBox.setPosition(dialogX, dialogY).setSize(460, 108);
      this.ui.choiceText.setPosition(dialogX - 210, dialogY - 38);
      this.ui.buyBtn.setPosition(this.ui.anchors.buy.x, this.ui.anchors.buy.y);
      this.ui.skipBtn.setPosition(this.ui.anchors.skip.x, this.ui.anchors.skip.y);
      if (this.ui.diceButtons) {
        this.ui.diceButtons.forEach((btn, i) => {
          btn.setPosition(dialogX - 190 + i * 58, dialogY + 16);
        });
      }
    }

    const cx = width / 2;
    const cy = height / 2;
    if (this.ui.summaryBox) {
      this.ui.summaryBox.setPosition(cx, cy);
      this.ui.summaryText.setPosition(cx - 420, cy - 230);
      this.ui.summaryClose.setPosition(cx + 380, cy - 230);
    }
  }

  createUI() {
    const hudDepth = 80;
    this.ui.topBar = this.add.rectangle(0, 0, 10, 10, 0xfffdf8)
      .setStrokeStyle(1, 0xe4d5c3)
      .setScrollFactor(0)
      .setDepth(hudDepth);
    this.ui.bottomBar = this.add.rectangle(0, 0, 10, 10, 0xfffdf8)
      .setStrokeStyle(1, 0xe4d5c3)
      .setScrollFactor(0)
      .setDepth(hudDepth);
    this.ui.sidePanel = this.add.rectangle(0, 0, 10, 10, 0xfffdf8)
      .setStrokeStyle(1, 0xe4d5c3)
      .setScrollFactor(0)
      .setDepth(hudDepth);

    this.ui.status = this.add.text(20, 16, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#2c2824',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(hudDepth + 2);

    this.ui.meta = this.add.text(20, 38, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#6e655c',
    }).setScrollFactor(0).setDepth(hudDepth + 2);

    this.ui.money = this.add.text(20, 62, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#2c2824',
    }).setScrollFactor(0).setDepth(hudDepth + 2);

    this.ui.log = this.add.text(20, 96, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#5c5146',
      wordWrap: { width: 420 },
    }).setScrollFactor(0).setDepth(hudDepth + 2);

    this.ui.dice = this.add.text(620, 16, `骰子 ${this.diceFace || 1}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#2c2824',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(hudDepth + 2);

    this.ui.rollBtn = this.add
      .text(620, 44, '掷骰子', {
        fontFamily: 'Arial',
        fontSize: '20px',
        backgroundColor: '#2f6f62',
        color: '#fffdf8',
        padding: { x: 14, y: 8 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(hudDepth + 3)
      .on('pointerdown', () => this.handleRoll());

    this.ui.rankTitle = this.add.text(1180, 16, '资产排名', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#2c2824',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(hudDepth + 2);
    this.ui.rankList = this.add.text(1180, 40, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#3f3832',
      lineSpacing: 6,
    }).setScrollFactor(0).setDepth(hudDepth + 2);

    this.ui.restartBtn = this.add
      .text(520, 44, '重新开始', {
        fontFamily: 'Arial',
        fontSize: '20px',
        backgroundColor: '#6d675f',
        color: '#fffdf8',
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(hudDepth + 3)
      .setVisible(false)
      .on('pointerdown', () => this.restartGame());

    this.ui.saveBtn = this.add
      .text(1180, 128, '存档', {
        fontFamily: 'Arial',
        fontSize: '16px',
        backgroundColor: '#2f6f62',
        color: '#fffdf8',
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(hudDepth + 3)
      .on('pointerdown', () => this.openSavePanel());
    this.ui.loadBtn = this.add
      .text(1260, 128, '读档', {
        fontFamily: 'Arial',
        fontSize: '16px',
        backgroundColor: '#3d6f9a',
        color: '#fffdf8',
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(hudDepth + 3)
      .on('pointerdown', () => this.openSavePanel());

    this.ui.choiceBox = this.add
      .rectangle(200, 560, 460, 108, 0xfffdf8)
      .setStrokeStyle(2, 0xcbbfa8)
      .setScrollFactor(0)
      .setDepth(2500)
      .setVisible(false);
    this.ui.choiceText = this.add.text(40, 525, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#2c2824',
    }).setVisible(false).setScrollFactor(0).setDepth(2501);
    this.ui.buyBtn = this.add
      .text(60, 565, '购买', {
        fontFamily: 'Arial',
        fontSize: '18px',
        backgroundColor: '#2f7d57',
        color: '#fffdf8',
        padding: { x: 12, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(2502)
      .setVisible(false);
    this.ui.skipBtn = this.add
      .text(160, 565, '跳过', {
        fontFamily: 'Arial',
        fontSize: '18px',
        backgroundColor: '#6d675f',
        color: '#fffdf8',
        padding: { x: 12, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(2502)
      .setVisible(false);

    this.ui.diceButtons = [];
    for (let i = 1; i <= 6; i += 1) {
      const btn = this.add
        .text(30 + (i - 1) * 55, 570, `${i}`, {
          fontFamily: 'Arial',
          fontSize: '18px',
          backgroundColor: '#2f6f62',
          color: '#fffdf8',
          padding: { x: 12, y: 6 },
        })
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(2502)
        .setVisible(false);
      this.ui.diceButtons.push(btn);
    }

    this.ui.cardTitle = this.add.text(20, 820, '当前玩家卡片', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#6e655c',
    }).setScrollFactor(0).setDepth(90);
    this.ui.cardSlots = [];
    this.ui.cardTexts = [];

    this.ui.queryBtn = this.add
      .text(1220, 820, '查询', {
        fontFamily: 'Arial',
        fontSize: '18px',
        backgroundColor: '#3d4f48',
        color: '#fffdf8',
        padding: { x: 12, y: 7 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(90)
      .on('pointerdown', () => this.openSummary());

    this.ui.summaryBox = this.add
      .rectangle(700, 450, 900, 520, 0xfffdf8)
      .setStrokeStyle(2, 0xcbbfa8)
      .setScrollFactor(0)
      .setDepth(3000)
      .setVisible(false);
    this.ui.summaryText = this.add.text(280, 220, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#222',
      lineSpacing: 4,
      wordWrap: { width: 840, useAdvancedWrap: true }
    }).setScrollFactor(0).setDepth(3001).setVisible(false);
    this.ui.summaryClose = this.add
      .text(1080, 220, '关闭', {
        fontFamily: 'Arial',
        fontSize: '16px',
        backgroundColor: '#2d3748',
        color: '#fff',
        padding: { x: 8, y: 4 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(3001)
      .setVisible(false)
      .on('pointerdown', () => this.closeSummary());

    this.ui.notice = this.add.text(460, 16, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#b91c1c',
      backgroundColor: '#fee2e2',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(200).setVisible(false);
  }

  enableCameraDrag() {
    let dragging = false;
    let start = { x: 0, y: 0, camX: 0, camY: 0 };
    this.input.on('pointerdown', (pointer) => {
      if (!pointer.rightButtonDown() && !pointer.middleButtonDown()) return;
      dragging = true;
      start = {
        x: pointer.x,
        y: pointer.y,
        camX: this.cameras.main.scrollX,
        camY: this.cameras.main.scrollY,
      };
    });
    this.input.on('pointerup', () => {
      dragging = false;
    });
    this.input.on('pointermove', (pointer) => {
      if (!dragging) return;
      const dx = pointer.x - start.x;
      const dy = pointer.y - start.y;
      this.cameras.main.scrollX = start.camX - dx;
      this.cameras.main.scrollY = start.camY - dy;
    });
  }

  centerCameraOnBoard(bounds) {
    const play = this.getHudMetrics(this.scale.width, this.scale.height).play;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const playCx = play.x + play.width / 2;
    const playCy = play.y + play.height / 2;
    this.cameras.main.setBounds(bounds.x - 240, bounds.y - 180, bounds.width + 480, bounds.height + 360);
    this.cameras.main.scrollX = cx - playCx;
    this.cameras.main.scrollY = cy - playCy;
  }

  async handleRoll() {
    if (this.savePanel && this.savePanel.isOpen()) return;
    if (this.isRolling || this.gameOver) return;

    this.isRolling = true;
    const currentPlayer = this.turnManager.getCurrentPlayer();
    if (currentPlayer.isBankrupt) {
      this.turnManager.nextTurn();
      this.updateUI();
      this.isRolling = false;
      return;
    }
    if (currentPlayer.hospitalTurns > 0) {
      await this.showHospitalWait(currentPlayer);
      currentPlayer.hospitalTurns -= 1;
      if (currentPlayer.hospitalTurns === 0) {
        this.log(`${currentPlayer.name} 出院，恢复行动`);
      }
      this.board.updateHospital(this.players);
      this.endTurn(true);
      this.isRolling = false;
      return;
    }

    let dice;
    if (currentPlayer.stayNextTurn) {
      dice = 0;
      currentPlayer.stayNextTurn = false;
      this.log(`${currentPlayer.name} 受到停留卡影响，原地不动`);
    } else {
      dice = await this.rollDiceAnimated();
    }
    
    await this.executeMove(currentPlayer, dice);
  }

  async executeMove(currentPlayer, dice) {
    if (dice > 0) {
      this.log(`${currentPlayer.name} 掷出 ${dice}`);
    }

    await this.movePlayer(currentPlayer, dice);
    await this.resolveTile(currentPlayer);

    if (this.checkBankruptcy()) {
      this.gameOver = true;
      this.isRolling = false;
      return;
    }

    this.endTurn(true);
    this.isRolling = false;
  }

  endTurn(countTurn) {
    if (countTurn) {
      this.turnsThisDay += 1;
      const active = this.players.filter((p) => !p.isBankrupt).length;
      if (this.turnsThisDay >= Math.max(1, active)) {
        this.turnsThisDay = 0;
        this.advanceDay();
      }
    }
    this.turnManager.nextTurn();
    this.updateUI();
    if (this.devAutoSave) this.devAutoSave.flush();
  }

  async movePlayer(player, steps) {
    if (this.directionArrow) this.directionArrow.setVisible(false);
    if (steps === 0) return;
    const path = this.board.getPath(player.position, steps, player.direction || 1);
    for (const tileIndex of path) {
      player.position = tileIndex;
      await player.moveTo(this, this.board.getTilePosition(tileIndex));
      if (this.board.hasBlocker(tileIndex)) {
        this.board.clearBlocker(tileIndex);
        this.log(`${player.name} 被路障拦下`);
        break;
      }
    }
  }

  async resolveTile(player) {
    const tile = this.board.getTile(player.position);

    if (this.board.hasMine(tile.index)) {
      this.board.clearMine(tile.index);
      if (tile.type === 'road' && tile.level > 0) {
        tile.level -= 1;
        this.board.setPlot(tile.index, tile.owner, tile.level, tile.buildingType);
      }
      this.sendToHospital(player, '踩到地雷');
      return;
    }

    if (tile.type === 'road') {
      const basePrice = Math.round(tile.price * this.priceIndex);
      let buildingValue = 0;
      if (!tile.owner && tile.level > 0) {
        const buildingBaseCost = 1000 + (tile.level - 1) * 500;
        buildingValue = Math.round(buildingBaseCost * this.priceIndex * 0.5);
      }
      const totalPrice = basePrice + buildingValue;

      if (!tile.owner) {
        if (player.money >= totalPrice) {
          const confirmed = await this.promptPurchase(player, tile, totalPrice);
          if (confirmed) {
            tile.owner = player;
            player.money -= totalPrice;
            this.board.setOwner(tile.index, player);
            this.board.setPlot(tile.index, player, tile.level, tile.buildingType);
            this.log(`${player.name} 购买 ${tile.name}，花费 ${totalPrice}`);
          } else {
            this.log(`${player.name} 放弃购买 ${tile.name}`);
          }
        } else {
          this.log(`${player.name} 资金不足，无法购买 ${tile.name}`);
        }
      } else if (tile.owner && tile.owner !== player) {
        const total = this.buildingHandler.calculateToll(tile, tile.owner);
        if (total > 0) {
          player.money -= total;
          tile.owner.money += total;
          this.log(`${player.name} 支付给 ${tile.owner.name} 租金 ${total}`);
        } else {
          this.log(`${player.name} 停留在 ${tile.owner.name} 的地盘，但无需支付租金`);
        }
      } else {
        if (tile.owner === player) {
          // 这里将改为调用 promptBlueprint
          await this.promptBlueprint(player, tile);
        }
      }
    } else {
      // 统一交由“特殊地点”事件处理器来执行各个非房地产逻辑
      await this.eventHandler.resolveEvent(player, tile);
    }

    this.updateUI();
    await this.wait(300);
  }

  checkBankruptcy() {
    this.players.forEach((p) => {
      if (!p.isBankrupt && p.money < 0) {
        p.markBankrupt();
        this.bankruptcyOrder.push(p);
        this.releaseProperties(p);
        this.log(`${p.name} 破产`);
      }
    });

    const alive = this.players.filter((p) => !p.isBankrupt);
    if (alive.length > 1) return false;
    this.presentGameOver();
    return true;
  }

  presentGameOver() {
    const alive = this.players.filter((p) => !p.isBankrupt);
    if (alive.length === 1) {
      const winner = alive[0];
      const ranking = [winner, ...this.bankruptcyOrder.slice().reverse()];
      const rankText = ranking.map((p, i) => `第${i + 1}名：${p.name}`).join('  |  ');
      this.ui.status.setText(`游戏结束：${winner.name} 获胜`);
      this.log(`排名：${rankText}`);
    } else {
      this.ui.status.setText('游戏结束：全部破产');
    }
    this.ui.restartBtn.setVisible(true);
  }

  isWorldIdle() {
    if (this.isRolling || this.modalLock) return false;
    if (this.ui.choiceBox && this.ui.choiceBox.visible) return false;
    return true;
  }

  openSavePanel() {
    if (!this.isWorldIdle()) {
      this.log(SAVE_MESSAGES.busy);
      return;
    }
    this.closeSummary();
    if (this.savePanel) this.savePanel.open();
  }

  onSnapshotApplied() {
    if (this.ui.dice) this.ui.dice.setText(`骰子 ${this.diceFace}`);
    this.hideChoiceUI();
    this.closeSummary();
    if (this.board) this.board.disablePlacement();
    document.querySelectorAll('.richman-overlay').forEach((node) => node.remove());
    this.updateUI();
    if (this.gameOver) this.presentGameOver();
    else if (this.ui.restartBtn) this.ui.restartBtn.setVisible(false);
    if (this.ui.notice) {
      this.ui.notice.setText('读档成功').setVisible(true);
      this.time.delayedCall(1200, () => {
        if (this.ui.notice) this.ui.notice.setVisible(false);
      });
    }
    if (!this.gameOver) this.log('已读取存档');
    if (this.devAutoSave) this.devAutoSave.flush();
  }

  hideChoiceUI() {
    if (!this.ui.choiceBox) return;
    this.ui.choiceBox.setVisible(false);
    this.ui.choiceText.setVisible(false);
    this.ui.buyBtn.setVisible(false);
    this.ui.skipBtn.setVisible(false);
    if (this.ui.diceButtons) {
      this.ui.diceButtons.forEach((btn) => btn.setVisible(false));
    }
  }

  updateUI() {
    const current = this.turnManager.getCurrentPlayer();
    this.updatePriceIndex();
    this.board.setPriceIndex(this.priceIndex);
    this.ui.status.setText(`当前回合：${current.name}`);
    if (this.ui.meta) {
      this.ui.meta.setText(`${formatFullDate(this.gameDate)}    物价 ${this.priceIndex.toFixed(1)}`);
    }
    this.ui.money.setText(`${current.money} 金钱    ${current.points} 点券`);
    if (this.ui.cardTexts && this.ui.cardTexts.length) {
      this.updateCardUI();
    }
    this.updateRankingUI();
    this.board.updateHospital(this.players);
    
    this.players.forEach(p => {
      p.setHighlight(p === current && !p.isBankrupt);
    });
    this.updateDirectionArrow(current);
    if (this.devAutoSave) this.devAutoSave.schedule();
  }

  updateDirectionArrow(player) {
    if (!this.directionArrow) {
      this.directionArrow = this.add.text(0, 0, '→', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#ff0000',
      }).setOrigin(0.5, 0.5);
      this.directionArrow.setDepth(120);
    }
    
    if (player.isBankrupt || player.hospitalTurns > 0) {
      this.directionArrow.setVisible(false);
      return;
    }

    this.directionArrow.setVisible(true);
    const pos = this.board.getTilePosition(player.position);
    let nextIdx = (player.position + player.direction) % this.board.tiles.length;
    if (nextIdx < 0) nextIdx += this.board.tiles.length;

    const currGrid = this.board.path[player.position];
    const nextGrid = this.board.path[nextIdx];
    const dx = nextGrid.x - currGrid.x;
    const dy = nextGrid.y - currGrid.y;
    let arrow = '→';
    if (Math.abs(dy) > Math.abs(dx)) {
      arrow = dy > 0 ? '↓' : '↑';
    } else if (Math.abs(dx) > 0) {
      arrow = dx > 0 ? '→' : '←';
    }

    this.directionArrow.setPosition(pos.x + player.tokenOffset.x, pos.y + player.tokenOffset.y - 12);
    this.directionArrow.setText(arrow);
    
    this.tweens.killTweensOf(this.directionArrow);
    this.tweens.add({
      targets: this.directionArrow,
      y: pos.y + player.tokenOffset.y - 16,
      duration: 500,
      yoyo: true,
      repeat: -1
    });
  }

  log(message) {
    this.ui.log.setText(message);
  }

  releaseProperties(player) {
    this.board.tiles.forEach((tile) => {
      if (tile.type !== 'road') return;
      if (tile.owner !== player) return;
      tile.owner = null;
      this.board.setOwner(tile.index, null);
      // keep building level; allow others to buy at price later
      this.board.setPlot(tile.index, null, tile.level, tile.buildingType);
    });
  }

  getOwnedProperties(player) {
    return this.board.tiles.filter((t) => t.type === 'road' && t.owner === player);
  }

  getPropertyValue(tile) {
    let cost = tile.price;
    if (tile.level > 0) {
      cost += 1000 + Math.max(0, tile.level - 1) * 500;
    }
    return Math.round(cost * this.priceIndex);
  }

  getTotalAssets(player) {
    const props = this.getOwnedProperties(player);
    const propValue = props.reduce((sum, t) => sum + this.getPropertyValue(t), 0);
    return player.money + propValue;
  }

  updateRankingUI() {
    const ranking = [...this.players].sort((a, b) => this.getTotalAssets(b) - this.getTotalAssets(a));
    const lines = ranking.map(
      (p, i) => `${i + 1}. ${p.name} 资产：${this.getTotalAssets(p)}`
    );
    this.ui.rankList.setText(lines.join('\n'));
  }

  openSummary() {
    const lines = [];
    this.players.forEach((p) => {
      const props = this.getOwnedProperties(p);
      const propList = props.length
        ? props.map((t) => `${t.name}(${t.level}级)`).join('、')
        : '无';
      const cardList = p.inventory.length
        ? p.inventory.map((c) => c.name).join('、')
        : '无';
      lines.push(
        `${p.name} | 金钱 ${p.money} | 点券 ${p.points} | 资产 ${this.getTotalAssets(p)}\n` +
          `地产：${propList}\n卡片：${cardList}`
      );
    });
    this.ui.summaryText.setText(lines.join('\n\n'));
    this.ui.summaryBox.setVisible(true);
    this.ui.summaryText.setVisible(true);
    this.ui.summaryClose.setVisible(true);
  }

  closeSummary() {
    this.ui.summaryBox.setVisible(false);
    this.ui.summaryText.setVisible(false);
    this.ui.summaryClose.setVisible(false);
  }

  restartGame() {
    if (this.devAutoSave) {
      this.devAutoSave.disarm();
      this.devAutoSave.clear();
    }
    this.scene.restart();
  }

  giveInitialCards() {
    const cards = [
      { type: 'remote', name: '遥控骰子' },
      { type: 'block', name: '路障' },
      { type: 'robot', name: '机器娃娃' },
      { type: 'mine', name: '地雷' },
    ];
    this.players.forEach((p) => {
      cards.forEach((c) => p.addCard({ ...c }));
    });
  }

  renderCardSlots() {
    const startX = 20;
    const startY = 850;
    const slotW = 120;
    const slotH = 30;
    const gapX = 8;

    this.ui.cardSlots = [];
    this.ui.cardTexts = [];
    for (let i = 0; i < 8; i += 1) {
      const x = startX + i * (slotW + gapX);
      const rect = this.add
        .rectangle(x + slotW / 2, startY + slotH / 2, slotW, slotH, 0xfffdf8)
        .setStrokeStyle(1, 0xd7c8b4)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(90);
      const text = this.add.text(x + 6, startY + 7, '', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#2c2824',
      }).setScrollFactor(0).setDepth(91);
      rect.on('pointerdown', () => this.useCard(i));
      this.ui.cardSlots.push(rect);
      this.ui.cardTexts.push(text);
    }

    this.updateCardUI();
  }

  updateCardUI() {
    const player = this.turnManager.getCurrentPlayer();
    this.ui.cardTitle.setText(`${player.name} 的卡片`);
    for (let i = 0; i < 8; i += 1) {
      const card = player.inventory[i];
      const text = this.ui.cardTexts[i];
      const rect = this.ui.cardSlots[i];
      if (card) {
        text.setText(card.name);
        rect.setFillStyle(0xfffdf8);
      } else {
        text.setText('空');
        rect.setFillStyle(0xf6f1e8);
      }
    }
  }

  useCard(slotIndex) {
    const current = this.turnManager.getCurrentPlayer();
    if (this.savePanel && this.savePanel.isOpen()) return;
    if (this.isRolling || this.gameOver) return;
    const card = current.inventory[slotIndex];
    if (!card) return;

    this.cardHandler.useCard(current, card, slotIndex);
  }

  findNextRoad(startIndex) {
    for (let i = 1; i <= this.board.tiles.length; i += 1) {
      const idx = (startIndex + i) % this.board.tiles.length;
      if (this.board.getTile(idx).type === 'road') return idx;
    }
    return null;
  }

  clearBlockersAhead(startIndex, count) {
    for (let i = 1; i <= count; i += 1) {
      const idx = (startIndex + i) % this.board.tiles.length;
      if (this.board.hasBlocker(idx)) this.board.clearBlocker(idx);
    }
  }

  getUpgradeCost(level) {
    const baseCost = level === 1 ? 1000 : 500;
    return Math.round(baseCost * this.priceIndex);
  }

  calculateStreetToll(streetId, owner) {
    const segments = this.board.tiles.filter(
      (t) => t.type === 'road' && t.streetId === streetId && t.owner === owner
    );
    let total = 0;
    segments.forEach((seg) => {
      if (seg.owner.hospitalTurns > 0) return;
      total += this.getRent(seg);
    });
    return Math.round(total * this.priceIndex);
  }

  getRent(tile) {
    if (tile.level === 0) return tile.price * 0.5;
    if (tile.level === 1) return tile.price;
    if (tile.level === 2) return tile.price * 2;
    if (tile.level === 3) return tile.price * 3.5;
    if (tile.level === 4) return tile.price * 5.5;
    if (tile.level === 5) return tile.price * 8;
    return tile.price;
  }

  updatePriceIndex() {
    const activePlayers = this.players.filter(p => !p.isBankrupt);
    if (activePlayers.length === 0) return;
    
    const activeStartAssets = activePlayers.reduce((sum, p) => sum + p.startAssets, 0);
    const currentTotal = activePlayers.reduce((sum, p) => sum + this.getTotalAssets(p), 0);
    
    const ratio = currentTotal / activeStartAssets;
    this.targetPriceIndex = Math.round(ratio * 10) / 10;
  }

  advanceDay() {
    // 缓步上涨物价指数，每天最多涨 0.1
    if (this.priceIndex < this.targetPriceIndex) {
      this.priceIndex = Math.min(this.priceIndex + 0.1, this.targetPriceIndex);
      this.priceIndex = Math.round(this.priceIndex * 10) / 10; // 防止浮点误差
      this.board.setPriceIndex(this.priceIndex);
      this.log(`【通货紧缩缓解】物价指数逐步上调至 ${this.priceIndex}`);
    }

    const prevMonth = this.gameDate.getMonth();
    this.gameDate.setDate(this.gameDate.getDate() + 1);
    const newMonth = this.gameDate.getMonth();
    if (newMonth !== prevMonth) {
      this.applyMonthlyInterest();
    }
  }

  applyMonthlyInterest() {
    this.players.forEach((p) => {
      if (p.isBankrupt) return;
      const interest = Math.round(p.money * 0.1);
      p.money += interest;
    });
    this.log('【利息】本月已发放 10% 利息');
    if (this.ui.notice) {
      this.ui.notice.setText('本月利息已发放（10%）').setVisible(true);
      this.time.delayedCall(1200, () => this.ui.notice.setVisible(false));
    }
  }

  promptPurchase(player, tile, price) {
    return new Promise((resolve) => {
      this.ui.choiceBox.setVisible(true);
      this.ui.choiceText
        .setText(`${player.name} 是否购买 ${tile.name}（${price}）？`)
        .setVisible(true);
      this.ui.buyBtn.setText('购买').setVisible(true);
      this.ui.skipBtn.setText('跳过').setVisible(true);

      const cleanup = () => {
        this.ui.choiceBox.setVisible(false);
        this.ui.choiceText.setVisible(false);
        this.ui.buyBtn.setVisible(false);
        this.ui.skipBtn.setVisible(false);
        this.ui.buyBtn.removeAllListeners();
        this.ui.skipBtn.removeAllListeners();
      };

      this.ui.buyBtn.once('pointerdown', () => {
        cleanup();
        resolve(true);
      });
      this.ui.skipBtn.once('pointerdown', () => {
        cleanup();
        resolve(false);
      });
    });
  }

  promptChooseDice() {
    return new Promise((resolve) => {
      this.ui.choiceBox.setVisible(true);
      this.ui.choiceText.setText('请选择 1-6 前进步数\n(右键取消)').setVisible(true);
      this.ui.buyBtn.setVisible(false);
      this.ui.skipBtn.setText('取消').setX(this.ui.anchors ? this.ui.anchors.skipWide.x : 320).setVisible(true);

      this.ui.diceButtons.forEach((btn) => btn.setVisible(true));

      let isCancelled = false;
      const cleanup = () => {
        this.input.off('pointerdown', rightClickListener);
        this.ui.choiceBox.setVisible(false);
        this.ui.choiceText.setVisible(false);
        this.ui.skipBtn.setVisible(false);
        this.ui.skipBtn.setText('跳过').setX(this.ui.anchors ? this.ui.anchors.skip.x : 160);
        this.ui.skipBtn.removeAllListeners();
        this.ui.diceButtons.forEach((btn) => {
          btn.setVisible(false);
          btn.removeAllListeners();
        });
      };

      const rightClickListener = (pointer) => {
        if (pointer.rightButtonDown() && !isCancelled) {
          isCancelled = true;
          cleanup();
          resolve(null);
        }
      };
      this.input.on('pointerdown', rightClickListener);

      this.ui.skipBtn.once('pointerdown', () => {
        if(isCancelled) return;
        isCancelled = true;
        cleanup();
        resolve(null);
      });

      this.ui.diceButtons.forEach((btn, index) => {
        btn.once('pointerdown', () => {
          if(isCancelled) return;
          isCancelled = true;
          cleanup();
          resolve(index + 1);
        });
      });
    });
  }

  startPlacement(kind, onPlaced, onCancel, currentPlayer, range = 4, customPredicate = null, ignoreEntitiesParams = false) {
    this.isRolling = true;
    let desc = '请选择目标位置\n(左键点击，右键取消)';
    if (kind === 'block') desc = '请选择放置路障的位置\n(右键或点击取消)';
    if (kind === 'mine') desc = '请选择放置地雷的位置\n(右键或点击取消)';
    if (kind === 'build') desc = '请选择要升级的房屋\n(右键或点击取消)';
    if (kind === 'demolish') desc = '请选择要拆除的房屋\n(右键或点击取消)';
    if (kind === 'store') desc = '请选择要开店的房屋\n(右键或点击取消)';
    if (kind === 'park') desc = '请选择要改建公园的房屋\n(右键或点击取消)';
    this.log(desc);

    this.ui.choiceBox.setVisible(true);
    this.ui.choiceText.setText(desc).setVisible(true);
    this.ui.buyBtn.setVisible(false);
    this.ui.skipBtn.setText('取消').setVisible(true);
    this.ui.diceButtons.forEach((btn) => btn.setVisible(false));

    let isCancelled = false;
    const cleanup = () => {
      this.board.disablePlacement();
      this.ui.choiceBox.setVisible(false);
      this.ui.choiceText.setVisible(false);
      this.ui.skipBtn.setVisible(false);
      this.ui.skipBtn.removeAllListeners();
      this.input.off('pointerdown', rightClickListener);
    };

    const rightClickListener = (pointer) => {
      if (pointer.rightButtonDown()) {
        isCancelled = true;
        cleanup();
        this.isRolling = false;
        this.log('取消操作');
        if (onCancel) onCancel();
      }
    };
    this.input.on('pointerdown', rightClickListener);

    this.ui.skipBtn.once('pointerdown', () => {
      isCancelled = true;
      cleanup();
      this.isRolling = false;
      this.log('取消操作');
      if (onCancel) onCancel();
    });

    let validPredicate = customPredicate;
    let ignoreEntities = ignoreEntitiesParams;
    if (currentPlayer && range > 0 && !customPredicate) {
      if (kind === 'build' || kind === 'demolish') {
        validPredicate = (index) => {
          const tile = this.board.getTile(index);
          const inRange = this.board.getGridDistance(currentPlayer.position, index) <= range;
          if (!inRange || tile.type !== 'road') return false;
          if (kind === 'build') return tile.owner === currentPlayer && tile.level < 5;
          if (kind === 'demolish') return tile.owner && tile.level > 0;
          return false;
        };
        ignoreEntities = true; // Build/Demolish ignores players/mines/blocks
      } else {
        validPredicate = (index) => this.board.getGridDistance(currentPlayer.position, index) <= range;
      }
    }

    this.board.enablePlacement((index) => {
      if (isCancelled) return;
      cleanup();
      if (kind === 'block') this.board.placeBlocker(index);
      if (kind === 'mine') this.board.placeMine(index);
      this.isRolling = false;
      onPlaced(index);
    }, this.players, validPredicate, ignoreEntities);
  }

  sendToHospital(player, reason) {
    player.hospitalTurns = 3;
    const hospitalIndex = this.board.hospitalIndex;
    if (hospitalIndex >= 0) {
      player.position = hospitalIndex;
      player.moveTo(this, this.board.getTilePosition(hospitalIndex));
    }
    this.board.updateHospital(this.players);
    this.log(`${player.name} ${reason}，住院 3 回合`);
  }

  showHospitalWait(player) {
    return new Promise((resolve) => {
      this.ui.choiceBox.setVisible(true);
      this.ui.choiceText
        .setText(`${player.name} 住院中，还剩 ${player.hospitalTurns} 回合`)
        .setVisible(true);
      this.ui.buyBtn.setText('确定').setVisible(true);
      this.ui.skipBtn.setVisible(false);

      const cleanup = () => {
        this.ui.choiceBox.setVisible(false);
        this.ui.choiceText.setVisible(false);
        this.ui.buyBtn.setVisible(false);
        this.ui.buyBtn.removeAllListeners();
      };

      this.ui.buyBtn.once('pointerdown', () => {
        cleanup();
        resolve();
      });
    });
  }

  promptBlueprint(player, tile) {
    return new Promise((resolve) => {
      // Create DOM overlay for Blueprint
      const container = document.createElement('div');
      container.className = 'richman-overlay';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100vw';
      container.style.height = '100vh';
      container.style.backgroundColor = 'transparent';
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.zIndex = '1000';
      container.style.pointerEvents = 'none'; // so clicks can pass through if we just removed background
      
      const modal = document.createElement('div');
      modal.style.backgroundColor = '#fff';
      modal.style.padding = '20px';
      modal.style.borderRadius = '10px';
      modal.style.textAlign = 'center';
      modal.style.minWidth = '300px';
      modal.style.pointerEvents = 'auto'; // Re-enable pointer events for the modal itself


      const title = document.createElement('h2');
      title.innerText = `蓝图: ${tile.name}`;
      title.style.marginBottom = '20px';
      modal.appendChild(title);
      
      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex';
      btnContainer.style.flexDirection = 'column';
      btnContainer.style.gap = '10px';
      
      const hasStoreCard = player.inventory.includes('开店卡');
      const hasParkCard = player.inventory.includes('公园卡');
      
      // Cleanup helper
      const cleanup = (result) => {
        container.remove();
        resolve(result);
      };
      
      // Upgrade House Check
      const currentLevel = tile.level;
      const currentType = tile.buildingType || 'house';
      
      if (currentType === 'house' && currentLevel < 5) {
        const upgradeHouseCost = this.getUpgradeCost(currentLevel + 1);
        const btnHouse = document.createElement('button');
        btnHouse.innerText = `升级住宅 (需要 ¥${upgradeHouseCost})`;
        btnHouse.style.padding = '10px';
        btnHouse.onclick = () => {
          if (player.money >= upgradeHouseCost) {
            player.money -= upgradeHouseCost;
            tile.level += 1;
            tile.buildingType = 'house';
            this.board.setPlot(tile.index, player, tile.level, tile.buildingType); // Need type update in setplot later
            this.log(`${player.name} 建造/升级了 ${tile.name} 为 ${tile.level} 级住宅`);
            cleanup(true);
          } else {
            console.log("金钱不足");
            alert("金钱不足");
          }
        };
        btnContainer.appendChild(btnHouse);
      }
      
      // Store Card Check
      if (hasStoreCard) {
        let upgradeStoreCost = 0;
        let canBuildStore = false;
        let nextStoreLevel = 1;
        
        if (currentType === 'store' && currentLevel < 3) {
           upgradeStoreCost = this.getUpgradeCost(currentLevel + 1);
           canBuildStore = true;
           nextStoreLevel = currentLevel + 1;
        } else if (currentType !== 'store') {
           upgradeStoreCost = this.getUpgradeCost(1);
           canBuildStore = true;
           nextStoreLevel = 1;
        }
        
        if (canBuildStore) {
          const btnStore = document.createElement('button');
          btnStore.innerText = `使用开店卡 建造/升级连锁店 (需要 ¥${upgradeStoreCost})`;
          btnStore.style.padding = '10px';
          btnStore.onclick = () => {
            if (player.money >= upgradeStoreCost) {
               player.money -= upgradeStoreCost;
               player.removeCard('开店卡');
               tile.level = nextStoreLevel;
               tile.buildingType = 'store';
               this.board.setPlot(tile.index, player, tile.level, tile.buildingType);
               this.log(`${player.name} 在 ${tile.name} 使用开店卡，建成了 ${tile.level} 级连锁店`);
               cleanup(true);
            } else {
               alert("金钱不足");
            }
          };
          btnContainer.appendChild(btnStore);
        }
      }
      
      // Park Card Check
      if (hasParkCard) {
         if (currentType !== 'park') {
            const btnPark = document.createElement('button');
            const parkCost = this.getUpgradeCost(1);
            btnPark.innerText = `使用公园卡 建设公园 (需要 ¥${parkCost})`;
            btnPark.style.padding = '10px';
            btnPark.onclick = () => {
               if (player.money >= parkCost) {
                 player.money -= parkCost;
                 player.removeCard('公园卡');
                 tile.level = 1;
                 tile.buildingType = 'park';
                 this.board.setPlot(tile.index, player, tile.level, tile.buildingType);
                 this.log(`${player.name} 在 ${tile.name} 使用公园卡，建成了公园`);
                 cleanup(true);
               } else {
                 alert("金钱不足");
               }
            };
            btnContainer.appendChild(btnPark);
         }
      }
      
      const btnCancel = document.createElement('button');
      btnCancel.innerText = '取消 / 跳过';
      btnCancel.style.padding = '10px';
      btnCancel.style.marginTop = '10px';
      btnCancel.style.backgroundColor = '#ccc';
      btnCancel.onclick = () => cleanup(false);
      btnContainer.appendChild(btnCancel);
      
      modal.appendChild(btnContainer);
      container.appendChild(modal);
      document.body.appendChild(container);
    });
  }

  promptChoosePlayer(currentPlayer, cardName, callback, targetPlayers = null) {
    this.modalLock = true;
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    
    if (!targetPlayers) targetPlayers = this.players;

    const uiElements = [];
    let isCancelled = false;
    
    // 背景
    const validCount = targetPlayers.length;
    const overlayHeight = Math.max(200, 100 + validCount * 50);
    const overlay = this.add.rectangle(cx, cy, 320, overlayHeight, 0xfffdf8)
      .setStrokeStyle(2, 0xcbbfa8).setScrollFactor(0).setDepth(2000);
    const title = this.add.text(cx, cy - overlayHeight/2 + 30, `选择${cardName}目标\n(右键取消)`, {
      fontFamily: 'Arial', fontSize: '20px', color: '#222', align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    
    uiElements.push(overlay, title);
    
    const cleanup = () => {
      this.modalLock = false;
      this.input.off('pointerdown', rightClickListener);
      uiElements.forEach(el => el.destroy());
    };

    const rightClickListener = (pointer) => {
      if (pointer.rightButtonDown() && !isCancelled) {
        isCancelled = true;
        cleanup();
        callback(null);
      }
    };
    this.input.on('pointerdown', rightClickListener);
    
    // 取消按钮
    const cancelBtn = this.add.text(cx, cy + overlayHeight/2 - 30, '取消', {
      fontFamily: 'Arial', fontSize: '18px', backgroundColor: '#e53e3e', color: '#fff',
      padding: { x: 20, y: 10 }, align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });
    
    cancelBtn.on('pointerdown', () => {
      if(isCancelled) return;
      isCancelled = true;
      cleanup();
      callback(null);
    });
    uiElements.push(cancelBtn);

    // 绘制玩家选项
    targetPlayers.forEach((p, idx) => {
      const btn = this.add.text(cx, cy - overlayHeight/2 + 90 + idx * 50, p.name, {
        fontFamily: 'Arial', fontSize: '20px', backgroundColor: p === currentPlayer ? '#a0aec0' : p.color, color: p === currentPlayer && p.color === '#ffffff' ? '#000': '#fff',
        padding: { x: 20, y: 10 }, align: 'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });
      
      btn.on('pointerdown', () => {
        if(isCancelled) return;
        isCancelled = true;
        cleanup();
        callback(p);
      });
      uiElements.push(btn);
    });
  }

  async openShop(player) {
    const items = [
      { type: 'remote', name: '遥控骰子', cost: 30 },
      { type: 'block', name: '路障', cost: 30 },
      { type: 'robot', name: '机器娃娃', cost: 20 },
      { type: 'mine', name: '地雷', cost: 20 },
      { type: 'turn', name: '转向卡', cost: 10 },
      { type: 'stay', name: '停留卡', cost: 20 },
      { type: 'build', name: '建屋卡', cost: 20 },
      { type: 'demolish', name: '拆屋卡', cost: 20 },
      { type: 'store', name: '开店卡', cost: 40 },
      { type: 'park', name: '公园卡', cost: 60 }
    ];

    return new Promise((resolve) => {
      const cx = this.cameras.main.width / 2;
      const cy = this.cameras.main.height / 2;
      
      const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x2c2824, 0.28)
        .setScrollFactor(0).setDepth(999).setInteractive();
      dim.on('pointerdown', (_pointer, _x, _y, event) => event.stopPropagation());
      const overlay = this.add.rectangle(cx, cy, 640, 520, 0xfffdf8)
        .setStrokeStyle(2, 0xcbbfa8).setScrollFactor(0).setDepth(1000);
      
      const title = this.add.text(cx, cy - 200, `卡片商店 (拥有点券: ${player.points})`, {
        fontFamily: 'Arial', fontSize: '24px', color: '#222'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

      const uiElements = [dim, overlay, title];
      const buttons = [];
      const purchased = new Set();

      const refreshButtons = () => {
        buttons.forEach((b, i) => {
          const item = items[i];
          const canAfford = player.points >= item.cost;
          const isBought = purchased.has(i);
          if (isBought || !canAfford) {
            b.btn.setBackgroundColor('#a0aec0');
            b.btn.disableInteractive();
            b.hoverFx.setVisible(false);
          } else {
            b.btn.setBackgroundColor('#38a169');
            b.btn.setInteractive({ useHandCursor: true });
          }
        });
      };

      items.forEach((item, i) => {
        const x = cx - 180 + (i % 3) * 180;
        const y = cy - 120 + Math.floor(i / 3) * 80;
        
        const btn = this.add.text(x, y, `${item.name}\n${item.cost} 点券`, {
          fontFamily: 'Arial', fontSize: '20px', backgroundColor: '#38a169', color: '#fff',
          padding: { x: 20, y: 10 }, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

        const hoverFx = this.add.rectangle(x, y, btn.width, btn.height, 0x000000, 0.1)
          .setOrigin(0.5).setScrollFactor(0).setDepth(1002).setVisible(false);

        btn.on('pointerdown', () => {
          if (player.inventory.length >= 8) {
            this.log(`${player.name} 卡槽已满`);
            return;
          }
          player.points -= item.cost;
          purchased.add(i);
          player.addCard({ type: item.type, name: item.name });
          this.updateCardUI();
          this.updateUI();
          title.setText(`卡片商店 (拥有点券: ${player.points})`);
          this.log(`${player.name} 购买 ${item.name} -${item.cost} 点券`);
          refreshButtons();
        });

        btn.on('pointerover', () => hoverFx.setVisible(true));
        btn.on('pointerout', () => hoverFx.setVisible(false));
        
        uiElements.push(btn, hoverFx);
        buttons.push({ btn, hoverFx });
      });

      refreshButtons();

      const leaveBtn = this.add.text(cx, cy + 200, '离开商店', {
        fontFamily: 'Arial', fontSize: '20px', backgroundColor: '#e53e3e', color: '#fff',
        padding: { x: 30, y: 10 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(1001);

      leaveBtn.on('pointerdown', () => {
        uiElements.forEach(el => el.destroy());
        leaveBtn.destroy();
        resolve();
      });
    });
  }

  rollDiceAnimated() {
    return new Promise((resolve) => {
      let ticks = 0;
      const maxTicks = 10;
      const timer = this.time.addEvent({
        delay: 70,
        loop: true,
        callback: () => {
          ticks += 1;
          const value = this.turnManager.rollDice();
          this.ui.dice.setText(`骰子 ${value}`);
          this.ui.dice.setScale(1);
          this.tweens.add({
            targets: this.ui.dice,
            scale: 1.2,
            duration: 50,
            yoyo: true,
          });

          if (ticks >= maxTicks) {
            timer.remove(false);
            const finalValue = this.turnManager.rollDice();
            this.diceFace = finalValue;
            this.ui.dice.setText(`骰子 ${finalValue}`);
            resolve(finalValue);
          }
        },
      });
    });
  }

  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
