export default class Street {
  constructor({ id, direction, properties = [] }) {
    this.id = id;
    this.direction = direction; // left | right | up | down
    this.properties = properties;
  }
}
