import Phaser from 'phaser';

// 非房地产性质的“特殊地点”统一处理器（事件点、获取点券、卡片商店、医院、起点等）
export default class EventHandler {
  constructor(engine) {
    this.engine = engine;
    this.eventStrategies = {
      'event': this.handleRandomEvent.bind(this),
      'gain_points': this.handleGainPoints.bind(this),
      'hospital': this.handleHospital.bind(this),
      'shop': this.handleShop.bind(this),
      'start': this.handleStart.bind(this),
      // 'bank': this.handleBank.bind(this),
      // 'magic_house': this.handleMagicHouse.bind(this),
      // 'lottery': this.handleLottery.bind(this),
    };
  }

  async resolveEvent(player, tile) {
    const handler = this.eventStrategies[tile.type];
    if (handler) {
      await handler(player, tile);
      return true;
    } else {
      console.warn(`未知的特殊地点类型: ${tile.type}`);
      return false;
    }
  }

  async handleRandomEvent(player, tile) {
    // 基础随机事件抛硬币，预留更复杂的事件表拆分
    const delta = Phaser.Math.Between(1, 10) * 500 * (Phaser.Math.Between(0, 1) ? 1 : -1);
    player.money += delta;
    this.engine.log(`${player.name} 触发命运/随机事件，资金变动 ${delta}`);
  }

  async handleGainPoints(player, tile) {
    const amount = tile.amount || 10;
    player.points += amount;
    this.engine.log(`${player.name} 意外惊喜，获得点券 ${amount}`);
  }

  async handleHospital(player, tile) {
    // 如果没有生病仅仅是路过停下，目前视为探病
    this.engine.log(`${player.name} 进入医院探病（休息）`);
  }

  async handleShop(player, tile) {
    await this.engine.openShop(player);
  }

  async handleStart(player, tile) {
    this.engine.log(`${player.name} 停留在起点，整装待发`);
  }
}
