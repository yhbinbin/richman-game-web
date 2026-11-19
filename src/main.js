import Phaser from 'phaser';
import GameEngine from './GameEngine.js';

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  backgroundColor: '#efe6d8',
  scene: [GameEngine],
};

new Phaser.Game(config);
