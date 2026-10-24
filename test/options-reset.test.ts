import { describe, expect, test, beforeEach } from 'bun:test';
import { ShowBubble } from '../src/shared/settings';

/** 复现选项页“重置 → 保存 → 重新加载”的完整流程 */

let stored: Record<string, unknown> = {};
const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];

function installChromeStub(): void {
  stored = {};
  listeners.length = 0;

  (globalThis as unknown as { chrome: unknown }).chrome = {
    i18n: { getUILanguage: () => 'zh-CN', getMessage: (k: string) => k },
    storage: {
      local: {
        get: async () => ({ ...stored }),
        set: async (values: Record<string, unknown>) => {
          stored = { ...stored, ...values };
          listeners.forEach((fn) => fn(values, 'local'));
        },
      },
      onChanged: { addListener: (fn: (c: Record<string, unknown>, a: string) => void) => listeners.push(fn) },
    },
  };
}

beforeEach(installChromeStub);

describe('重置后重新加载', () => {
  test('重置写入的默认 showBubble 能被重新读取', async () => {
    const { defaultSettings, loadSettingsWithBootstrap, saveSettings } = await import('../src/shared/settings');

    // 首次加载：应写入默认值
    const first = await loadSettingsWithBootstrap();
    expect(first.showBubble).toBe(ShowBubble.BUBBLE);

    // 用户改成“不显示”
    await saveSettings({ ...first, showBubble: ShowBubble.NONE });
    expect((await loadSettingsWithBootstrap()).showBubble).toBe(ShowBubble.NONE);

    // 点重置：写回默认
    const defaults = defaultSettings();
    await saveSettings(defaults);

    // 重新加载页面
    const reloaded = await loadSettingsWithBootstrap();
    expect(reloaded.showBubble).toBe(ShowBubble.BUBBLE);
    expect(stored.showBubble).toBe(ShowBubble.BUBBLE);
  });

  test('存储里只有 targetLang 时，showBubble 回落到默认 BUBBLE', async () => {
    const { loadSettingsWithBootstrap } = await import('../src/shared/settings');

    stored = { targetLang: 'en' };

    const settings = await loadSettingsWithBootstrap();
    expect(settings.showBubble).toBe(ShowBubble.BUBBLE);
    expect(settings.targetLang).toBe('en');
  });
});
