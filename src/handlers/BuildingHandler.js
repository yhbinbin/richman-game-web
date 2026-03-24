// 建筑系统管理器
export default class BuildingHandler {
  constructor(engine) {
    this.engine = engine;
  }

  getUpgradeCost(tileType, level) {
    // 简化: 住宅和连锁店的升级花费规则相同，公园只有1级不需要升级费用
    const baseCost = level === 1 ? 1000 : 500;
    return Math.round(baseCost * this.engine.priceIndex);
  }

  getRent(tile) {
    const bType = tile.buildingType || 'house';
    if (bType === 'park') return 0; // 公园不收租金

    let baseRent = tile.price;
    if (tile.level === 0) baseRent = tile.price * 0.5;
    else if (tile.level === 1) baseRent = tile.price;
    else if (tile.level === 2) baseRent = tile.price * 2;
    else if (tile.level === 3) baseRent = tile.price * 3.5;
    else if (tile.level === 4) baseRent = tile.price * 5.5;
    else if (tile.level === 5) baseRent = tile.price * 8;
    return baseRent;
  }

  calculateToll(tile, owner) {
    if (owner.hospitalTurns > 0) return 0; // 医院中不收租

    const bType = tile.buildingType || 'house';
    let total = 0;

    if (bType === 'park') {
      return 0;
    }

    if (bType === 'store') {
      // 连锁店：全地图所有该玩家的连锁店租金总和
      const stores = this.engine.board.tiles.filter(
        (t) => t.type === 'road' && t.owner === owner && t.buildingType === 'store'
      );
      stores.forEach(s => {
        total += this.getRent(s);
      });
      return Math.round(total * this.engine.priceIndex);
    }

    // 默认住宅：同街道的住宅（不含商店和公园）相加，如果有公园则加成 10%
    const segments = this.engine.board.tiles.filter(
      (t) => t.type === 'road' && t.streetId === tile.streetId
    );

    let parkCount = 0;
    segments.forEach(seg => {
      // 这里的规则：花园可以使街道内所有住宅租金上涨10%
      if (seg.buildingType === 'park') parkCount++;
      
      // 只联合该玩家拥有的、且为住宅或空地(没有buildingType或为house)的租金
      const segType = seg.buildingType || 'house';
      if (seg.owner === owner && segType === 'house') {
        total += this.getRent(seg);
      }
    });

    const multiplier = 1 + (parkCount * 0.1);
    return Math.round(total * multiplier * this.engine.priceIndex);
  }
}
