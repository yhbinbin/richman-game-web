// NPC/神仙管理器 - 预留多种地图上的NPC相遇事件拆分
export default class NpcHandler {
  constructor(engine) {
    this.engine = engine;
    this.npcs = []; // 当前场上的神仙/NPC列表
    
    // 预留类型策略
    this.npcStrategies = {
      'god_of_wealth': this.meetGodOfWealth.bind(this),
      'god_of_poverty': this.meetGodOfPoverty.bind(this),
      'angel': this.meetAngel.bind(this),
      'devil': this.meetDevil.bind(this),
      // ...
    };
  }

  // 未来可在格子结算前后调用此方法判断是否在当前格遇到了NPC
  async checkAndResolveNpcPhase(player) {
    // const npc = this.getNpcAt(player.position);
    // if (npc) {
    //   await this.resolveNpc(player, npc);
    // }
  }

  async resolveNpc(player, npc) {
    const handler = this.npcStrategies[npc.type];
    if (handler) {
      await handler(player, npc);
    } else {
      this.engine.log(`${player.name} 遇到了 ${npc.name}`);
    }
  }

  async meetGodOfWealth(player, npc) {
    this.engine.log(`${player.name} 遇到财神，接下来几回合免小额租金（预留未实装）`);
  }

  async meetGodOfPoverty(player, npc) {
    this.engine.log(`${player.name} 遇到穷神，破财（预留未实装）`);
  }

  async meetAngel(player, npc) {
    this.engine.log(`${player.name} 遇到天使，接下来几回合盖房屋免费（预留未实装）`);
  }

  async meetDevil(player, npc) {
    this.engine.log(`${player.name} 遇到恶魔，破坏停留处的建筑（预留未实装）`);
  }
}
