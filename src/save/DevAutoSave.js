import {
  SAVE_MESSAGES,
  applySnapshot,
  captureState,
  describeEngine,
  parseSnapshotText,
  validateSnapshot,
} from './SaveManager.js';

export const DEV_AUTOSAVE_KEY = 'richman-game:save:dev-autosave';
export const DEV_AUTOSAVE_DELAY = 400;

export function isDevMode() {
  return typeof import.meta !== 'undefined' && !!import.meta.env && import.meta.env.DEV === true;
}

export function createDevAutoSave(engine, options = {}) {
  const dev = options.dev === true;
  const storage = options.storage || null;
  const delay = Number.isFinite(options.delay) ? options.delay : DEV_AUTOSAVE_DELAY;
  let armed = false;
  let timer = null;
  let unbind = null;

  function cancelTimer() {
    if (!timer) return;
    if (typeof timer.remove === 'function') timer.remove(false);
    else clearTimeout(timer);
    timer = null;
  }

  const controller = {
    enabled: dev,

    arm() {
      if (dev) armed = true;
    },

    disarm() {
      armed = false;
      cancelTimer();
      if (unbind) {
        unbind();
        unbind = null;
      }
    },

    clear() {
      if (!dev || !storage) return { ok: true, skipped: true };
      try {
        storage.removeItem(DEV_AUTOSAVE_KEY);
        return { ok: true };
      } catch {
        return { ok: false, message: SAVE_MESSAGES.storage };
      }
    },

    flush() {
      if (!dev || !armed || !storage) return { ok: true, skipped: true };
      try {
        const snapshot = captureState(engine);
        const verdict = validateSnapshot(snapshot, describeEngine(engine));
        if (!verdict.ok) return verdict;
        storage.setItem(DEV_AUTOSAVE_KEY, JSON.stringify(verdict.snapshot));
        return { ok: true };
      } catch {
        return { ok: false, message: SAVE_MESSAGES.write };
      }
    },

    schedule() {
      if (!dev || !armed || !storage) return;
      cancelTimer();
      const run = () => {
        timer = null;
        controller.flush();
      };
      if (engine.time && typeof engine.time.delayedCall === 'function') {
        timer = engine.time.delayedCall(delay, run);
      } else {
        timer = setTimeout(run, delay);
      }
    },

    restoreIfPresent() {
      if (!dev) return { ok: false, skipped: true };
      if (!storage) return { ok: false, message: SAVE_MESSAGES.storage };
      let text = null;
      try {
        text = storage.getItem(DEV_AUTOSAVE_KEY);
      } catch {
        return { ok: false, message: SAVE_MESSAGES.storage };
      }
      if (!text) return { ok: false, empty: true };
      const parsed = parseSnapshotText(text);
      if (!parsed.ok) return parsed;
      return applySnapshot(engine, parsed.snapshot);
    },

    bindLifecycle() {
      if (!dev || typeof window === 'undefined' || unbind) return;
      const flushNow = () => {
        controller.flush();
      };
      window.addEventListener('pagehide', flushNow);
      unbind = () => window.removeEventListener('pagehide', flushNow);
    },
  };

  return controller;
}
