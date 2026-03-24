export default class Property {
  constructor({ position, attachTo, side, group }) {
    this.position = position; // {x, y}
    this.attachTo = attachTo; // path index
    this.side = side; // left | right | up | down
    this.group = group;
    this.owner = null;
    this.level = 0;
  }
}
