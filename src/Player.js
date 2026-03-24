export default class Player {
  constructor(name, color) {
    this.name = name;
    this.color = color;
    this.money = 0;
    this.points = 0;
    this.position = 0;
    this.token = null;
    this.tokenOffset = { x: 0, y: 0 };
    this.inventory = [];
    this.remoteDice = false;
    this.hospitalTurns = 0;
    this.isBankrupt = false;
    this.direction = 1;
    this.stayNextTurn = false;
    this.highlightRing = null;
  }

  createToken(scene, position, offsetIndex) {
    const radius = 6;
    const offsets = [
      { x: -6, y: -6 },
      { x: 6, y: -6 },
      { x: -6, y: 6 },
      { x: 6, y: 6 },
    ];
    const offset = offsets[offsetIndex % offsets.length];
    this.tokenOffset = { x: offset.x, y: offset.y };
    this.token = scene.add.circle(
      position.x + this.tokenOffset.x,
      position.y + this.tokenOffset.y,
      radius,
      this.color
    );
    this.token.setStrokeStyle(1.5, 0xffffff);
    this.token.setDepth(110);
    this.highlightRing = scene.add.circle(
      position.x + this.tokenOffset.x,
      position.y + this.tokenOffset.y,
      radius + 3,
      0xffff00,
      0
    );
    this.highlightRing.setStrokeStyle(3, 0xffff00);
    this.highlightRing.setVisible(false);
    this.highlightRing.setDepth(109);
    
    scene.tweens.add({
      targets: this.highlightRing,
      alpha: 0.2,
      yoyo: true,
      repeat: -1,
      duration: 600
    });
  }

  setHighlight(active) {
    if (this.highlightRing) {
      this.highlightRing.setVisible(active);
    }
  }

  moveTo(scene, position) {
    return new Promise((resolve) => {
      scene.tweens.add({
        targets: [this.token, this.highlightRing],
        x: position.x + this.tokenOffset.x,
        y: position.y + this.tokenOffset.y,
        duration: 250,
        ease: 'Sine.easeInOut',
        onComplete: () => resolve(),
      });
    });
  }

  addCard(card) {
    if (this.inventory.length >= 8) return false;
    this.inventory.push(card);
    return true;
  }

  removeCard(index) {
    if (index < 0 || index >= this.inventory.length) return null;
    return this.inventory.splice(index, 1)[0];
  }

  markBankrupt() {
    this.isBankrupt = true;
    if (this.token) {
      this.token.setFillStyle(0x888888);
      this.token.setAlpha(0.6);
      this.token.setStrokeStyle(1.5, 0x555555);
    }
    if (this.highlightRing) {
      this.highlightRing.setVisible(false);
    }
  }
}
