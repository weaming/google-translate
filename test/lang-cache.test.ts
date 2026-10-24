import { describe, expect, test, beforeEach } from 'bun:test';

let stored: Record<string, unknown> = {};

function installChromeStub(): void {
  stored = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored[key] }),
        set: async (values: Record<string, unknown>) => {
          stored = { ...stored, ...values };
        },
      },
    },
  };
}

beforeEach(installChromeStub);

describe('语言列表缓存', () => {
  test('首次读取无缓存返回 null', async () => {
    const { readCachedLanguages } = await import('../src/shared/translate-api');
    expect(await readCachedLanguages()).toBeNull();
  });

  test('写入后可立即读到', async () => {
    const { readCachedLanguages, writeCachedLanguages } = await import('../src/shared/translate-api');

    await writeCachedLanguages([{ code: 'en', name: 'English' }]);
    expect(await readCachedLanguages()).toEqual([{ code: 'en', name: 'English' }]);
  });

  test('缓存过期返回 null', async () => {
    const { readCachedLanguages } = await import('../src/shared/translate-api');

    // 手工写入一个两天前的缓存
    stored.cachedLanguages = {
      fetchedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      options: [{ code: 'en', name: 'English' }],
    };

    expect(await readCachedLanguages()).toBeNull();
  });

  test('缓存内容异常时返回 null，不抛错', async () => {
    const { readCachedLanguages } = await import('../src/shared/translate-api');

    stored.cachedLanguages = { fetchedAt: Date.now(), options: [] };
    expect(await readCachedLanguages()).toBeNull();

    stored.cachedLanguages = 'broken';
    expect(await readCachedLanguages()).toBeNull();
  });

  test('内置兜底列表包含常用语言', async () => {
    const { FALLBACK_LANGUAGES } = await import('../src/shared/translate-api');
    const codes = FALLBACK_LANGUAGES.map((item) => item.code);

    expect(codes).toContain('auto');
    expect(codes).toContain('en');
    expect(codes).toContain('zh-CN');
  });
});
