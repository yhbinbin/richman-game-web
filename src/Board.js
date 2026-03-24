import Tile from './Tile.js';
import Property from './Property.js';
import Street from './Street.js';

export default class Board {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;

    this.grid = {
      width: data.width,
      height: data.height,
      cells: data.cells,
    };
    this.path = data.path;

    this.tiles = [];
    this.positions = [];
    this.normals = [];
    this.nameTexts = [];
    this.ownerMarkers = [];
    this.plotRects = [];
    this.plotTexts = [];
    this.blockerMarkers = [];
    this.mineMarkers = [];
    this.placementOverlays = [];
    this.propertyCells = new Map(); // pathIndex -> {x,y}
    this.propertyByCell = new Map(); // "x,y" -> pathIndex
    this.propertyRects = [];
    this.propertyLevelTexts = [];
    this.propertyOwnerMarkers = [];
    this.priceIndex = 1;
    this.tooltipBox = this.scene.add
      .rectangle(0, 0, 10, 10, 0x000000, 0.75)
      .setVisible(false)
      .setScrollFactor(0)
      .setDepth(1000);
    this.tooltipText = this.scene.add.text(0, 0, '', {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: '#ffffff',
    }).setScrollFactor(0).setVisible(false).setDepth(1001);
    this.pathGridSet = new Set();
    this.pathIndexByCell = new Map();
    this.streets = new Map();
    this.hospitalIndex = -1;
    this.hospitalSlots = [];

    this.tileSize = 32;
    this.origin = { x: scene.scale.width / 2, y: scene.scale.height / 2 };

    this.path.forEach((p, i) => {
      const key = this.gridKey(p.x, p.y);
      this.pathGridSet.add(key);
      this.pathIndexByCell.set(key, i);
    });

    this.loadStreets();
    this.buildTiles();
    this.buildPositions();
    this.buildPropertyCells();
  }

  buildTiles() {
    this.tiles = this.path.map((pos, index) => {
      const cell = this.getCell(pos.x, pos.y) || { type: 'empty', name: '' };
      const payload = { ...cell, index, gridPos: { x: pos.x, y: pos.y } };
      if (cell.type === 'road') {
        return new Property(payload);
      }
      return new Tile(payload);
    });
    this.enforceContinuousStreets();
    this.hospitalIndex = this.tiles.findIndex((t) => t.type === 'hospital');
  }

  enforceContinuousStreets() {
    let currentId = 0;
    let inStreet = false;
    this.tiles.forEach((tile) => {
      if (tile.type !== 'road') {
        inStreet = false;
        return;
      }
      if (!inStreet) {
        currentId += 1;
        inStreet = true;
      }
      tile.streetId = currentId;
    });
  }

  buildPositions() {
    const widthPx = (this.grid.width - 1) * this.tileSize;
    const heightPx = (this.grid.height - 1) * this.tileSize;
    const startX = this.origin.x - widthPx / 2;
    const startY = this.origin.y - heightPx / 2;
    const center = { x: (this.grid.width - 1) / 2, y: (this.grid.height - 1) / 2 };

    this.path.forEach((pos, index) => {
      const px = startX + pos.x * this.tileSize;
      const py = startY + pos.y * this.tileSize;
      this.positions[index] = { x: px, y: py };

      const next = this.path[(index + 1) % this.path.length];
      const dir = {
        x: Math.sign(next.x - pos.x),
        y: Math.sign(next.y - pos.y),
      };
      let normal = { x: -dir.y, y: dir.x };
      const v = { x: pos.x - center.x, y: pos.y - center.y };
      if (normal.x * v.x + normal.y * v.y < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
      this.normals[index] = normal;
    });
  }

  render() {
    this.renderGrid();
    this.renderPropertyCells();
    this.tiles.forEach((tile, index) => {
      const pos = this.positions[index];
      const color = this.getTileColor(tile.type);
      const rect = this.scene.add
        .rectangle(pos.x, pos.y, this.tileSize - 4, this.tileSize - 4, color)
        .setStrokeStyle(2, 0x333333);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => this.showTooltip(tile.name || tile.type));
      rect.on('pointerout', () => this.hideTooltip());

      const emoji = this.getTileEmoji(tile);
      if (emoji) {
        this.scene.add.text(pos.x, pos.y, emoji, {
          fontFamily: 'Arial',
          fontSize: '14px',
          color: '#222',
        }).setOrigin(0.5, 0.5);
      }

      const ownerMarker = this.scene.add.circle(pos.x + 16, pos.y + 16, 6, 0x000000);
      ownerMarker.setVisible(false);
      this.ownerMarkers[index] = ownerMarker;

      const blocker = this.scene.add.text(pos.x - 6, pos.y - 10, '⛔', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#d64545',
      });
      blocker.setVisible(false);
      blocker.setDepth(100);
      this.blockerMarkers[index] = blocker;

      const mine = this.scene.add.text(pos.x - 6, pos.y + 2, '💣', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#222',
      });
      mine.setVisible(false);
      mine.setDepth(100);
      this.mineMarkers[index] = mine;

      const overlay = this.scene.add
        .rectangle(pos.x, pos.y, this.tileSize - 4, this.tileSize - 4, 0x33ff33, 0.3)
        .setStrokeStyle(2, 0x00ff00, 0.8)
        .setVisible(false)
        .setDepth(150)
        .setInteractive({ useHandCursor: true });
      this.placementOverlays[index] = overlay;
    });

    if (this.hospitalIndex >= 0) {
      const pos = this.positions[this.hospitalIndex];
      const normal = this.normals[this.hospitalIndex];
      const offset = this.tileSize * 0.9;
      for (let i = 0; i < 2; i += 1) {
        const slot = this.scene.add.circle(
          pos.x + normal.x * offset + i * 10 * (normal.y !== 0 ? 1 : 0),
          pos.y + normal.y * offset + i * 10 * (normal.x !== 0 ? 1 : 0),
          6,
          0x000000
        );
        slot.setVisible(false);
        this.hospitalSlots.push(slot);
      }
    }
  }

  renderGrid() {
    for (let y = 0; y < this.grid.height; y += 1) {
      for (let x = 0; x < this.grid.width; x += 1) {
        const pos = this.gridToWorld(x, y);
        const cell = this.getCell(x, y);
        const isPath = this.isPathCell(x, y);
        const base = cell ? this.getTileColor(cell.type) : 0xf0ece4;
        const color = isPath ? base : 0xf8f6f1;
        this.scene.add
          .rectangle(pos.x, pos.y, this.tileSize - 6, this.tileSize - 6, color)
          .setStrokeStyle(1, 0xd0ccc5);
      }
    }
  }

  renderPropertyCells() {
    this.propertyCells.forEach((pos, pathIndex) => {
      const world = this.gridToWorld(pos.x, pos.y);
      const rect = this.scene.add
        .rectangle(world.x, world.y, this.tileSize - 8, this.tileSize - 8, 0xb08968)
        .setStrokeStyle(1, 0x333333);
      const levelText = this.scene.add.text(world.x - 6, world.y - 6, '', {
        fontFamily: 'Arial',
        fontSize: '10px',
        color: '#1a1a1a',
      });
      const ownerMarker = this.scene.add.circle(world.x + 10, world.y + 10, 5, 0x000000);
      ownerMarker.setVisible(false);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => {
        const tile = this.tiles[pathIndex];
        const baseRent = tile.level === 0 ? tile.price / 2 : tile.price * tile.level;
        const rent = Math.round(baseRent * this.priceIndex);
        this.showTooltip(`${tile.name} 价格:${tile.price} 租金:${rent}`);
      });
      rect.on('pointerout', () => this.hideTooltip());
      this.propertyRects[pathIndex] = rect;
      this.propertyLevelTexts[pathIndex] = levelText;
      this.propertyOwnerMarkers[pathIndex] = ownerMarker;
    });
  }

  buildPropertyCells() {
    const streetToRoads = new Map();
    this.tiles.forEach((tile, index) => {
      if (tile.type !== 'road') return;
      if (!streetToRoads.has(tile.streetId)) streetToRoads.set(tile.streetId, []);
      streetToRoads.get(tile.streetId).push(index);
    });

    streetToRoads.forEach((indices, streetId) => {
      let street = this.streets.get(streetId);
      if (!street) {
        street = new Street({ id: streetId, direction: null, properties: [] });
        this.streets.set(streetId, street);
      }
      if (!street.direction) {
        street.direction = this.chooseStreetDirection(indices);
      }
      if (!street.direction) {
        console.warn(`Street ${streetId} has no valid property direction.`);
        return;
      }
      indices.forEach((pathIndex) => {
        const placement = this.getPropertyPlacement(pathIndex, street.direction);
        if (!placement) return;
        if (!this.isPlacementValid(pathIndex, placement.propertyPos, placement.expandPos)) return;
        const key = this.gridKey(placement.propertyPos.x, placement.propertyPos.y);
        if (this.propertyByCell.has(key)) return;
        this.propertyCells.set(pathIndex, placement.propertyPos);
        this.propertyByCell.set(key, pathIndex);
      });
    });
  }

  chooseStreetDirection(indices) {
    if (indices.length === 0) return null;
    const orient = this.getPathOrientation(indices[0]);
    const preferred = [];

    if (orient === 'horizontal') {
      preferred.push('up', 'down');
    } else if (orient === 'vertical') {
      const outward = this.getOutwardDirection(indices[0]);
      const inward = outward === 'left' ? 'right' : 'left';
      preferred.push(outward, inward);
    } else {
      preferred.push('up', 'down', 'left', 'right');
    }

    for (const side of preferred) {
      if (this.validateStreetPlacement(indices, side)) return side;
    }

    const fallback = ['up', 'down', 'left', 'right'];
    for (const side of fallback) {
      if (this.validateStreetPlacement(indices, side)) return side;
    }
    return null;
  }

  getPathOrientation(pathIndex) {
    const prev = this.path[(pathIndex - 1 + this.path.length) % this.path.length];
    const curr = this.path[pathIndex];
    const next = this.path[(pathIndex + 1) % this.path.length];
    if (prev.y === curr.y && next.y === curr.y) return 'horizontal';
    if (prev.x === curr.x && next.x === curr.x) return 'vertical';
    if (next.x !== curr.x) return 'horizontal';
    if (next.y !== curr.y) return 'vertical';
    return 'unknown';
  }

  getOutwardDirection(pathIndex) {
    const pos = this.path[pathIndex];
    const center = { x: (this.grid.width - 1) / 2, y: (this.grid.height - 1) / 2 };
    if (this.getPathOrientation(pathIndex) === 'vertical') {
      return pos.x < center.x ? 'left' : 'right';
    }
    return pos.y < center.y ? 'up' : 'down';
  }

  validateStreetPlacement(indices, side) {
    for (const pathIndex of indices) {
      const placement = this.getPropertyPlacement(pathIndex, side);
      if (!placement) return false;
      if (!this.isPlacementValid(pathIndex, placement.propertyPos, placement.expandPos)) {
        return false;
      }
    }
    return true;
  }

  getPropertyPlacement(pathIndex, side) {
    const propertyPos = this.getAdjacentCell(pathIndex, side);
    if (!propertyPos) return null;
    const delta = {
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
    }[side];
    if (!delta) return null;
    const expandPos = { x: propertyPos.x + delta.x, y: propertyPos.y + delta.y };
    return { propertyPos, expandPos };
  }

  isPlacementValid(pathIndex, propertyPos, expandPos) {
    if (!this.inBounds(propertyPos.x, propertyPos.y)) return false;
    if (!this.inBounds(expandPos.x, expandPos.y)) return false;
    if (this.isPathCell(propertyPos.x, propertyPos.y)) return false;
    if (this.isPathCell(expandPos.x, expandPos.y)) return false;
    if (this.getCell(propertyPos.x, propertyPos.y)) return false;
    if (this.getCell(expandPos.x, expandPos.y)) return false;

    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    const checkNeighbors = (pos) => {
      for (const d of dirs) {
        const nx = pos.x + d.x;
        const ny = pos.y + d.y;
        if (!this.inBounds(nx, ny)) continue;
        if (this.isPathCell(nx, ny)) {
          const idx = this.getPathIndexAt(nx, ny);
          if (idx !== pathIndex) return false;
        }
      }
      return true;
    };

    if (!checkNeighbors(propertyPos)) return false;
    if (!checkNeighbors(expandPos)) return false;
    return true;
  }

  getCell(x, y) {
    if (y < 0 || y >= this.grid.height) return null;
    if (x < 0 || x >= this.grid.width) return null;
    return this.grid.cells[y][x];
  }

  inBounds(x, y) {
    return x >= 0 && x < this.grid.width && y >= 0 && y < this.grid.height;
  }

  gridToWorld(x, y) {
    const widthPx = (this.grid.width - 1) * this.tileSize;
    const heightPx = (this.grid.height - 1) * this.tileSize;
    const startX = this.origin.x - widthPx / 2;
    const startY = this.origin.y - heightPx / 2;
    return { x: startX + x * this.tileSize, y: startY + y * this.tileSize };
  }

  getWorldBounds() {
    const widthPx = (this.grid.width - 1) * this.tileSize;
    const heightPx = (this.grid.height - 1) * this.tileSize;
    const startX = this.origin.x - widthPx / 2;
    const startY = this.origin.y - heightPx / 2;
    return {
      x: startX - this.tileSize,
      y: startY - this.tileSize,
      width: widthPx + this.tileSize * 2,
      height: heightPx + this.tileSize * 2,
    };
  }

  getPathWorldPosition(pathIndex) {
    const pos = this.path[pathIndex];
    if (!pos) return null;
    return this.gridToWorld(pos.x, pos.y);
  }

  gridKey(x, y) {
    return `${x},${y}`;
  }

  isPathCell(x, y) {
    return this.pathGridSet.has(this.gridKey(x, y));
  }

  getPathIndexAt(x, y) {
    const key = this.gridKey(x, y);
    return this.pathIndexByCell.has(key) ? this.pathIndexByCell.get(key) : -1;
  }

  isPropertyCell(x, y) {
    return this.propertyByCell.has(this.gridKey(x, y));
  }

  getAdjacentCell(pathIndex, side) {
    const pos = this.path[pathIndex];
    if (!pos) return null;
    const delta = {
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
    }[side];
    if (!delta) return null;
    const target = { x: pos.x + delta.x, y: pos.y + delta.y };
    if (!this.inBounds(target.x, target.y)) return null;
    return target;
  }


  getTileColor(type) {
    if (type === 'start') return 0x82c91e;
    if (type === 'event') return 0xfaad14;
    if (type === 'road') return 0x9e9e9e;
    if (type === 'hospital') return 0xe03131;
    return 0x74c0fc;
  }

  getTileEmoji(tile) {
    if (tile.type === 'start') return '🏁';
    if (tile.type === 'hospital') return '🏥';
    if (tile.type === 'shop') return '🛒';
    if (tile.type === 'gain_points') return `+${tile.amount || 10}`;
    if (tile.type === 'event') return '❓';
    if (tile.type === 'road') return '🛣️';
    return '';
  }

  setPriceIndex(value) {
    this.priceIndex = value;
  }

  showTooltip(text) {
    this.tooltipText.setText(text);
    const padding = 6;
    const w = this.tooltipText.width + padding * 2;
    const h = this.tooltipText.height + padding * 2;
    const x = this.scene.input.activePointer.x + 12;
    const y = this.scene.input.activePointer.y + 12;
    this.tooltipBox.setPosition(x + w / 2, y + h / 2);
    this.tooltipBox.setSize(w, h);
    this.tooltipText.setPosition(x + padding, y + padding);
    this.tooltipBox.setVisible(true);
    this.tooltipText.setVisible(true);
  }

  hideTooltip() {
    this.tooltipBox.setVisible(false);
    this.tooltipText.setVisible(false);
  }

  getTile(index) {
    return this.tiles[index];
  }

  getTilePosition(index) {
    return this.positions[index];
  }

  getPath(startIndex, steps, direction = 1) {
    const path = [];
    for (let i = 1; i <= steps; i += 1) {
      let idx = (startIndex + i * direction) % this.tiles.length;
      if (idx < 0) idx += this.tiles.length;
      path.push(idx);
    }
    return path;
  }

  setOwner(index, player) {
    const marker = this.propertyOwnerMarkers[index];
    if (!marker) return;
    if (!player) {
      marker.setVisible(false);
      return;
    }
    marker.setFillStyle(player.color);
    marker.setVisible(true);
  }

  setPlot(index, player, level, buildingType = 'house') {
    const text = this.propertyLevelTexts[index];
    const rect = this.propertyRects[index];
    if (!rect || !text) return;
    if (!player) {
      rect.setFillStyle(0xb08968);
      text.setText(level > 0 ? `${level}` : '');
      text.setColor('#ffffff');
      return;
    }
    rect.setFillStyle(player.color, 0.2);
    
    let displayStr = '';
    if (level === 0) {
       displayStr = '';
    } else {
       if (buildingType === 'house') {
          displayStr = `H${level}`;
       } else if (buildingType === 'store') {
          displayStr = `S${level}`;
          text.setColor('#FFA500'); // Orange for Store
       } else if (buildingType === 'park') {
          displayStr = `🌳`;
       }
    }
    
    text.setText(displayStr);
  }

  placeBlocker(index) {
    const marker = this.blockerMarkers[index];
    if (marker) marker.setVisible(true);
  }

  clearBlocker(index) {
    const marker = this.blockerMarkers[index];
    if (marker) marker.setVisible(false);
  }

  hasBlocker(index) {
    const marker = this.blockerMarkers[index];
    return marker ? marker.visible : false;
  }

  placeMine(index) {
    const marker = this.mineMarkers[index];
    if (marker) marker.setVisible(true);
  }

  clearMine(index) {
    const marker = this.mineMarkers[index];
    if (marker) marker.setVisible(false);
  }

  hasMine(index) {
    const marker = this.mineMarkers[index];
    return marker ? marker.visible : false;
  }

  getGridDistance(index1, index2) {
    const p1 = this.path[index1];
    const p2 = this.path[index2];
    if (!p1 || !p2) return Infinity;
    return Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
  }

  enablePlacement(onPick, players, validPredicate, ignoreEntities = false) {
    this.placementTweens = [];
    this.placementOverlays.forEach((overlay, index) => {
      if (!overlay) return;
      if (!ignoreEntities) {
        const hasBlocker = this.hasBlocker(index);
        const hasMine = this.hasMine(index);
        const hasPlayer = players.some(p => p.position === index && !p.isBankrupt && p.hospitalTurns === 0);
        if (hasBlocker || hasMine || hasPlayer) return;
      }
      if (validPredicate && !validPredicate(index)) return;
      
      overlay.setVisible(true);
      overlay.setAlpha(0.3);
      const tw = this.scene.tweens.add({
        targets: overlay,
        alpha: 0.6,
        yoyo: true,
        repeat: -1,
        duration: 800,
      });
      this.placementTweens.push(tw);

      overlay.removeAllListeners();
      overlay.once('pointerdown', () => {
        this.disablePlacement();
        onPick(index);
      });
    });
  }

  disablePlacement() {
    if (this.placementTweens) {
      this.placementTweens.forEach(tw => tw.stop());
      this.placementTweens = [];
    }
    this.placementOverlays.forEach((overlay) => {
      if (!overlay) return;
      overlay.setAlpha(0.3);
      overlay.setVisible(false);
      overlay.removeAllListeners();
    });
  }

  updateHospital(players) {
    if (this.hospitalIndex < 0) return;
    this.hospitalSlots.forEach((slot) => slot.setVisible(false));
    const hospitalized = players.filter((p) => p.hospitalTurns > 0);
    hospitalized.slice(0, this.hospitalSlots.length).forEach((p, i) => {
      const slot = this.hospitalSlots[i];
      slot.setFillStyle(p.color);
      slot.setVisible(true);
    });
  }

formatName(name) {
  if (!name) return '';
  return name.length > 4 ? `${name.slice(0, 4)}` : name;
}

loadStreets() {
    const list = Array.isArray(this.data.streets) ? this.data.streets : [];
    list.forEach((s) => {
      const street = new Street(s);
      this.streets.set(street.id, street);
    });
  }
}
