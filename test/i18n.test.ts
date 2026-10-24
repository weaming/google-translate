import { describe, expect, test, beforeEach } from 'bun:test';

/**
 * 模拟 chrome.i18n：按 messages.json 的 placeholders 声明把 $NAME$ 替换为 $1..$9 位置参数。
 * 这正是不声明 placeholders 时 $1 会被吞掉的原因。
 */
type Entry = { message: string; placeholders?: Record<string, { content: string }> };

function installI18nStub(messages: Record<string, Entry>): void {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    i18n: {
      getMessage: (key: string, subs?: string[]) => {
        const entry = messages[key];
        if (!entry) return '';

        let text = entry.message;
        for (const [name, decl] of Object.entries(entry.placeholders ?? {})) {
          const slot = Number(decl.content.replace('$', '')) - 1;
          const value = subs?.[slot] ?? '';
          text = text.split(`$${name.toUpperCase()}$`).join(value);
        }

        // 未声明的 $1 会被 Chrome 直接丢弃
        return text.replace(/\$\d/g, '');
      },
    },
  };
}

beforeEach(() => {
  installI18nStub({});
});

describe('t', () => {
  test('无占位符时原样返回', async () => {
    installI18nStub({ translate: { message: '翻译' } });
    const { t } = await import('../src/shared/i18n');
    expect(t('translate')).toBe('翻译');
  });

  test('声明了 placeholders 时能填入字数', async () => {
    installI18nStub({
      tooLongToSpeak: {
        message: '超过$COUNT$字',
        placeholders: { count: { content: '$1' } },
      },
    });
    const { t } = await import('../src/shared/i18n');
    expect(t('tooLongToSpeak', 200)).toBe('超过200字');
  });

  test('未声明 placeholders 的 $1 会被吞掉（回归防护）', async () => {
    installI18nStub({ broken: { message: '超过 $1 字' } });
    const { t } = await import('../src/shared/i18n');
    expect(t('broken', 200)).toBe('超过  字');
  });

  test('无 chrome 时回退到键名', async () => {
    (globalThis as unknown as { chrome?: unknown }).chrome = undefined;
    const { t } = await import('../src/shared/i18n');
    expect(t('missingKey')).toBe('missingKey');
  });

  test('键不存在时回退到键名', async () => {
    installI18nStub({});
    const { t } = await import('../src/shared/i18n');
    expect(t('unknownKey')).toBe('unknownKey');
  });
});
