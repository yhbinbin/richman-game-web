export default class TurnManager {
  constructor(players) {
    this.players = players;
    this.currentIndex = 0;
  }

  getCurrentPlayer() {
    return this.players[this.currentIndex];
  }

  getCurrentPlayerIndex() {
    return this.currentIndex;
  }

  nextTurn() {
    const start = this.currentIndex;
    let next = this.currentIndex;
    for (let i = 0; i < this.players.length; i += 1) {
      next = (next + 1) % this.players.length;
      if (!this.players[next].isBankrupt) {
        this.currentIndex = next;
        return next <= start;
      }
    }
    return false;
  }

  rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }
}
