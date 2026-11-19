import {
  SAVE_MESSAGES,
  applySnapshot,
  captureState,
  describeEngine,
  describeSlot,
  downloadSnapshot,
  exportFilename,
  getLocalStorage,
  listSlots,
  parseSnapshotText,
  readSlot,
  removeSlot,
  validateSnapshot,
  writeSlot,
} from './SaveManager.js';
import { isDevMode } from './DevAutoSave.js';

const DEPTH = 4000;

export default class SavePanel {
  constructor(engine) {
    this.engine = engine;
    this.openState = false;
    this.elements = [];
    this.pending = null;
    this.pendingImport = null;
    this.message = '';
  }

  isOpen() {
    return this.openState;
  }

  open() {
    this.pending = null;
    this.pendingImport = null;
    this.message = '';
    this.openState = true;
    this.render();
  }

  close() {
    this.openState = false;
    this.pending = null;
    this.pendingImport = null;
    this.destroyElements();
  }

  layout() {
    if (this.openState) this.render();
  }

  destroyElements() {
    this.elements.forEach((element) => {
      if (element && element.destroy) element.destroy();
    });
    this.elements = [];
  }

  render() {
    this.destroyElements();
    if (!this.openState) return;

    const engine = this.engine;
    const width = engine.scale.width;
    const height = engine.scale.height;
    const cx = width / 2;
    const cy = height / 2;
    const panelW = Math.min(820, Math.max(320, width - 40));
    const panelH = Math.min(460, Math.max(360, height - 24));

    const dimmer = engine.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.45)
      .setScrollFactor(0)
      .setDepth(DEPTH - 1)
      .setInteractive();
    dimmer.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
    });
    this.elements.push(dimmer);

    const panel = engine.add
      .rectangle(cx, cy, panelW, panelH, 0xfffdf8)
      .setStrokeStyle(2, 0xcbbfa8)
      .setScrollFactor(0)
      .setDepth(DEPTH);
    this.elements.push(panel);

    const left = cx - panelW / 2 + 28;
    const top = cy - panelH / 2 + 24;
    this.addText(left, top, '存档管理', { fontSize: '22px', color: '#2c2824', fontStyle: 'bold' });
    const intro = isDevMode()
      ? '三个槽位需要手动保存。开发模式会另外自动保存进度，刷新后继续；重新开始会清空这份自动存档。'
      : '存档保存在本机浏览器中，刷新页面后仍可读取。操作进行中时不能存读档。';
    this.addText(left, top + 32, intro, {
      fontSize: '13px',
      color: '#555',
      wordWrap: { width: panelW - 56 },
    });

    const storage = getLocalStorage();
    const slots = listSlots(storage);
    slots.forEach((slot, index) => {
      const y = top + 64 + index * 78;
      this.addText(left, y, `槽位 ${index + 1}`, { fontSize: '16px', color: '#222' });
      this.addSlotButtons(left, y - 6, slot, storage, panelW);
      this.addText(left, y + 32, describeSlot(slot), {
        fontSize: '13px',
        color: slot.corrupt ? '#b91c1c' : '#444',
        wordWrap: { width: panelW - 56 },
      });
    });

    const footerY = cy + panelH / 2 - 64;
    this.addActionButton(left, footerY, '导出当前对局', '#4a5568', () => this.exportCurrent());
    this.addActionButton(left + 160, footerY, '导入存档', '#2b6cb0', () => {
      this.beginImport();
    });
    this.addActionButton(cx + panelW / 2 - 110, footerY, '关闭', '#2d3748', () => this.close());

    const message = this.message || (storage ? '' : SAVE_MESSAGES.storage);
    if (message) {
      this.addText(left, footerY + 40, message, {
        fontSize: '14px',
        color: '#b91c1c',
        wordWrap: { width: panelW - 56 },
      });
    }
  }

  addText(x, y, text, style) {
    const node = this.engine.add.text(x, y, text, {
      fontFamily: 'Arial',
      ...style,
    }).setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(node);
    return node;
  }

  addActionButton(x, y, label, color, onClick, enabled = true) {
    const button = this.engine.add.text(x, y, label, {
      fontFamily: 'Arial',
      fontSize: '15px',
      backgroundColor: enabled ? color : '#a0aec0',
      color: '#fff',
      padding: { x: 10, y: 6 },
    }).setScrollFactor(0).setDepth(DEPTH + 2);
    if (enabled) {
      button.setInteractive({ useHandCursor: true });
      button.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.engine.time.delayedCall(0, () => {
          if (!this.openState) return;
          onClick();
        });
      });
    }
    this.elements.push(button);
    return button;
  }

  addSlotButtons(x, y, slot, storage, panelW) {
    const canRead = slot.occupied && !slot.corrupt && !slot.unavailable;
    const canWrite = !!storage;
    const buttons = [
      ['保存', '#2b6cb0', canWrite, () => this.requestSave(slot, storage)],
      ['读取', '#38a169', canRead, () => this.confirmOrRun('load', slot.index, () => this.loadSlot(slot.index, storage))],
      ['导出', '#4a5568', canRead, () => this.exportSlot(slot.index, storage)],
      ['清除', '#9b2c2c', canRead || slot.corrupt, () => this.confirmOrRun('clear', slot.index, () => this.clearSlot(slot.index, storage))],
    ];
    const gap = 74;
    const startX = x + panelW - 56 - gap * buttons.length;
    buttons.forEach(([label, color, enabled, action], index) => {
      this.addActionButton(startX + index * gap, y, label, color, action, enabled);
    });
  }

  samePending(action, slot) {
    return !!this.pending && this.pending.action === action && this.pending.slot === slot;
  }

  confirmOrRun(action, slot, run) {
    if (action !== 'import') this.pendingImport = null;
    if (this.samePending(action, slot)) {
      this.pending = null;
      this.message = '';
      run();
      return;
    }
    this.pending = { action, slot };
    if (action === 'load') this.message = '读取会覆盖当前对局，请再次点击该槽位的「读取」';
    if (action === 'clear') this.message = '请再次点击该槽位的「清除」';
    if (action === 'import') this.message = '导入会覆盖当前对局，请再次点击「导入存档」';
    this.render();
  }

  requestSave(slot, storage) {
    if (!this.engine.isWorldIdle()) {
      this.message = SAVE_MESSAGES.busy;
      this.pending = null;
      this.render();
      return;
    }
    if (slot.occupied && !this.samePending('save', slot.index)) {
      this.pendingImport = null;
      this.pending = { action: 'save', slot: slot.index };
      this.message = `槽位 ${slot.index + 1} 已有存档，请再次点击「保存」以覆盖`;
      this.render();
      return;
    }
    this.pending = null;
    this.pendingImport = null;
    const snapshot = captureState(this.engine);
    const verdict = validateSnapshot(snapshot, describeEngine(this.engine));
    if (!verdict.ok) {
      this.message = verdict.message;
      this.render();
      return;
    }
    const written = writeSlot(storage, slot.index, verdict.snapshot);
    this.message = written.ok ? `已保存到槽位 ${slot.index + 1}` : written.message;
    this.render();
  }

  loadSlot(index, storage) {
    if (!this.engine.isWorldIdle()) {
      this.message = SAVE_MESSAGES.busy;
      this.render();
      return;
    }
    const stored = readSlot(storage, index);
    if (!stored.ok) {
      this.message = stored.message;
      this.render();
      return;
    }
    this.applyLoaded(stored.snapshot);
  }

  applyLoaded(snapshot) {
    const result = applySnapshot(this.engine, snapshot);
    if (!result.ok) {
      this.message = result.message;
      this.pending = null;
      this.pendingImport = null;
      this.render();
      return;
    }
    this.close();
  }

  clearSlot(index, storage) {
    const result = removeSlot(storage, index);
    this.pending = null;
    this.message = result.ok ? `已清除槽位 ${index + 1}` : result.message;
    this.render();
  }

  exportSlot(index, storage) {
    const stored = readSlot(storage, index);
    if (!stored.ok) {
      this.message = stored.message;
      this.render();
      return;
    }
    downloadSnapshot(stored.snapshot, exportFilename(`slot${index + 1}`, stored.snapshot));
    this.pending = null;
    this.message = `已导出槽位 ${index + 1}`;
    this.render();
  }

  exportCurrent() {
    if (!this.engine.isWorldIdle()) {
      this.message = SAVE_MESSAGES.busy;
      this.render();
      return;
    }
    const snapshot = captureState(this.engine);
    const verdict = validateSnapshot(snapshot, describeEngine(this.engine));
    if (!verdict.ok) {
      this.message = verdict.message;
      this.render();
      return;
    }
    downloadSnapshot(verdict.snapshot, exportFilename('current', verdict.snapshot));
    this.pending = null;
    this.pendingImport = null;
    this.message = '已导出当前对局';
    this.render();
  }

  beginImport() {
    if (this.pendingImport) {
      const snapshot = this.pendingImport;
      this.pending = null;
      this.pendingImport = null;
      this.applyLoaded(snapshot);
      return;
    }
    this.pending = null;
    this.message = '';
    this.render();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      if (!file || !this.openState) return;
      this.readImport(file);
    }, { once: true });
    input.click();
  }

  async readImport(file) {
    if (file.size > 256 * 1024) {
      this.message = SAVE_MESSAGES.tooLarge;
      this.render();
      return;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      this.message = SAVE_MESSAGES.invalid;
      this.render();
      return;
    }
    if (!this.openState) return;
    const parsed = parseSnapshotText(text);
    if (!parsed.ok) {
      this.message = parsed.message;
      this.pending = null;
      this.pendingImport = null;
      this.render();
      return;
    }
    const verdict = validateSnapshot(parsed.snapshot, describeEngine(this.engine));
    if (!verdict.ok) {
      this.message = verdict.message;
      this.pending = null;
      this.pendingImport = null;
      this.render();
      return;
    }
    this.pendingImport = verdict.snapshot;
    this.pending = { action: 'import', slot: null };
    this.message = '文件校验通过。导入会覆盖当前对局，请再次点击「导入存档」';
    this.render();
  }
}
