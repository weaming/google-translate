import { describe, expect, test, beforeEach } from 'bun:test';
import { watchSettings } from '../src/shared/settings';
import type { Settings } from '../src/shared/settings';

/** 最小 chrome.storage 桩，可在测试里触发变更 */
type Listener = (changes: Record<string, unknown>, area: string) => void;

const listeners: Listener[] = [];
let stored: Record<string, unknown> = {};

function installChromeStub(): void {
  listeners.length = 0;

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({ ...stored }),
        set: async (values: Record<string, unknown>) => {
          stored = { ...stored, ...values };
        },
      },
      onChanged: {
        addListener: (fn: Listener) => listeners.push(fn),
      },
    },
  };
}

beforeEach(() => {
  stored = {};
  installChromeStub();
});

describe('watchSettings', () => {
  test('存储变更后回调最新设置', async () => {
    let received: Settings | null = null;
    watchSettings((settings) => {
      received = settings;
    });

    stored = { targetLang: 'ja', showBubble: '2', detectLanguage: true, addImageContextMenu: false };
    listeners.forEach((fn) => fn({ targetLang: { newValue: 'ja' } }, 'local'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(received).not.toBeNull();
    expect((received as unknown as Settings).targetLang).toBe('ja');
  });

  test('与设置无关的键不触发回调', async () => {
    let called = 0;
    watchSettings(() => {
      called += 1;
    });

    listeners.forEach((fn) => fn({ unrelated: { newValue: 1 } }, 'local'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(called).toBe(0);
  });

  test('非 local 存储区域不触发回调', async () => {
    let called = 0;
    watchSettings(() => {
      called += 1;
    });

    listeners.forEach((fn) => fn({ targetLang: { newValue: 'ja' } }, 'sync'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(called).toBe(0);
  });
});
