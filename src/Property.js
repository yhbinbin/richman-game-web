import Tile from './Tile.js';

export default class Property extends Tile {
  constructor({ index, type, name, price, streetId, gridPos }) {
    super({ index, type, name, gridPos });
    this.price = price;
    this.streetId = streetId;
    this.level = 0;
    this.owner = null;
  }
}
