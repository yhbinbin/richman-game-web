export default class Tile {
  constructor({ index, type, name, gridPos, amount }) {
    this.index = index;
    this.type = type;
    this.gridPos = gridPos;
    this.name = name || `地块${index}`;
    if (amount !== undefined) {
      this.amount = amount;
    }
  }
}
