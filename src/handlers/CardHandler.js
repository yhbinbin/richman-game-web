// 卡片系统管理器
export default class CardHandler {
  constructor(engine) {
    this.engine = engine;
    this.cardStrategies = {
      'remote': this.useRemote.bind(this),
      'block': this.useBlock.bind(this),
      'robot': this.useRobot.bind(this),
      'mine': this.useMine.bind(this),
      'turn': this.useTurn.bind(this),
      'stay': this.useStay.bind(this),
      'build': this.useBuild.bind(this),
      'demolish': this.useDemolish.bind(this),
      'store': this.useStore.bind(this),
      'park': this.usePark.bind(this),
    };
  }

  useCard(player, card, slotIndex) {
    const handler = this.cardStrategies[card.type];
    if (handler) {
      handler(player, card, slotIndex);
    } else {
      console.warn(`未找到卡片处理器: ${card.type}`);
    }
  }

  async useRemote(player, card, slotIndex) {
    const dice = await this.engine.promptChooseDice();
    if (!dice) return; // 玩家取消

    player.removeCard(slotIndex);
    this.engine.updateCardUI();
    this.engine.log(`${player.name} 使用 遥控骰子 掷出 ${dice}`);
    
    this.engine.isRolling = true;
    await this.engine.executeMove(player, dice);
  }

  useBlock(player, card, slotIndex) {
    this.engine.startPlacement('block', () => {
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 放置 路障`);
    }, () => {}, player, 4);
  }

  async useRobot(player, card, slotIndex) {
    player.removeCard(slotIndex);
    this.engine.updateCardUI();
    this.engine.log(`${player.name} 使用 机器娃娃 清理前方路障和地雷`);
    
    this.engine.isRolling = true; // 锁定操作
    
    // 执行机器娃娃动画并清理前方10格
    const startIdx = player.position;
    const direction = player.direction || 1;
    const path = this.engine.board.getPath(startIdx, 10, direction);
    
    const startPos = this.engine.board.getTilePosition(startIdx);
    const robotIcon = this.engine.add.circle(startPos.x, startPos.y, 8, 0x00ff00).setDepth(200);

    for (const tileIndex of path) {
      const pos = this.engine.board.getTilePosition(tileIndex);
      await new Promise(resolve => {
        this.engine.tweens.add({
          targets: robotIcon,
          x: pos.x,
          y: pos.y,
          duration: 150,
          onComplete: () => {
            if (this.engine.board.hasBlocker(tileIndex)) {
              this.engine.board.clearBlocker(tileIndex);
              this.engine.log(`机器娃娃清除了路障`);
            }
            if (this.engine.board.hasMine(tileIndex)) {
              this.engine.board.clearMine(tileIndex);
              this.engine.log(`机器娃娃引爆并清除了地雷`);
            }
            resolve();
          }
        });
      });
    }
    robotIcon.destroy();
    this.engine.isRolling = false; // 解除锁定
  }

  useMine(player, card, slotIndex) {
    this.engine.startPlacement('mine', () => {
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 放置 地雷`);
    }, () => {}, player, 4);
  }

  useTurn(player, card, slotIndex) {
    const validPlayers = this.engine.players.filter(p => !p.isBankrupt && this.engine.board.getGridDistance(player.position, p.position) <= 4);
    if(validPlayers.length === 0) validPlayers.push(player);
    this.engine.promptChoosePlayer(player, '转向卡', async (targetPlayer) => {
      if (!targetPlayer) return;
      targetPlayer.direction = targetPlayer.direction === 1 ? -1 : 1;
      if (targetPlayer === this.engine.turnManager.getCurrentPlayer()) {
        this.engine.updateDirectionArrow(targetPlayer);
      }
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 对 ${targetPlayer.name} 使用了 转向卡！`);
    }, validPlayers);
  }

  useStay(player, card, slotIndex) {
    const validPlayers = this.engine.players.filter(p => !p.isBankrupt && this.engine.board.getGridDistance(player.position, p.position) <= 4);
    if(validPlayers.length === 0) validPlayers.push(player);
    this.engine.promptChoosePlayer(player, '停留卡', async (targetPlayer) => {
      if (!targetPlayer) return;
      targetPlayer.stayNextTurn = true;
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 对 ${targetPlayer.name} 使用了 停留卡！`);
    }, validPlayers);
  }

  useBuild(player, card, slotIndex) {
    this.engine.startPlacement('build', (tileIndex) => {
      const tile = this.engine.board.getTile(tileIndex);
      if (tile.type !== 'road' || !tile.owner || tile.owner !== player) return;
      if (tile.buildingType === 'park') {
        this.engine.log('不能在这个建筑上使用建屋卡');
        return;
      }
      
      let maxLevel = 5;
      if (tile.buildingType === 'store') maxLevel = 3;
      
      if (tile.level >= maxLevel) {
        this.engine.log('该建筑已达到最高等级');
        return;
      }
      
      tile.level = Math.min(tile.level + 1, maxLevel);
      
      this.engine.board.setPlot(tileIndex, tile.owner, tile.level, tile.buildingType);
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 使用建屋卡，升级了 ${tile.name} 到 ${tile.level} 级`);
    }, () => {}, player, 4);
  }

  useDemolish(player, card, slotIndex) {
    this.engine.startPlacement('demolish', (tileIndex) => {
      const tile = this.engine.board.getTile(tileIndex);
      if (tile.type !== 'road' || !tile.owner) return;
      
      if (tile.buildingType === 'park') {
        const cost = this.engine.getPropertyValue(1); 
        this.engine.log(`不能直接拆除公园建筑`);
        return;
      }
      
      tile.level = Math.max(tile.level - 1, 0);
      if (tile.level === 0) {
        tile.buildingType = 'house'; // Reset default
      }
      
      this.engine.board.setPlot(tileIndex, tile.owner, tile.level, tile.buildingType);
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 使用拆屋卡，降级了 ${tile.name} 至 ${tile.level} 级`);
    }, () => {}, player, 4);
  }

  useStore(player, card, slotIndex) {
    this.engine.startPlacement('store', (tileIndex) => {
      const tile = this.engine.board.getTile(tileIndex);
      if (tile.type !== 'road' || !tile.owner || tile.owner !== player) {
        this.engine.log('只能在自己拥有的地盘上开店！');
        return;
      }
      
      let newLevel = 1;
      if (tile.buildingType !== 'store') {
        newLevel = Math.min(tile.level, 3);
        if (newLevel <= 0) newLevel = 1;
      } else {
        newLevel = Math.min(tile.level + 1, 3);
      }

      tile.buildingType = 'store';
      tile.level = newLevel;
      this.engine.board.setPlot(tileIndex, tile.owner, tile.level, tile.buildingType);
      
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 使用开店卡，将 ${tile.name} 改建成了 ${tile.level} 级连锁店！`);
    }, () => {}, player, 4);
  }

  usePark(player, card, slotIndex) {
    this.engine.startPlacement('park', (tileIndex) => {
      const tile = this.engine.board.getTile(tileIndex);
      if (tile.type !== 'road' || !tile.owner) {
        this.engine.log('只能选择有主的建筑进行改建！');
        return;
      }

      tile.buildingType = 'park';
      tile.level = 1;
      this.engine.board.setPlot(tileIndex, tile.owner, tile.level, tile.buildingType);
      
      player.removeCard(slotIndex);
      this.engine.updateCardUI();
      this.engine.log(`${player.name} 使用公园卡，强制将 ${tile.name} 改建成了公园！`);
    }, () => {}, player, 4);
  }
}
