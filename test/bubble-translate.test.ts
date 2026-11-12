import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import type { RuntimeMessage } from '../src/shared/messages';

const GLOBAL_KEYS = ['document', 'window', 'HTMLElement', 'chrome', 'fetch'] as const;
const originalGlobals = new Map(
  GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
const requests: URL[] = [];
let selectedText = '';
let onMessage: (message: RuntimeMessage) => void;

async function waitForResult(): Promise<ShadowRoot> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const root = document.querySelector('#gtx-trans')?.shadowRoot;
    if (root?.querySelector('.gtx-result')?.textContent === '你好') return root;
    await Bun.sleep(10);
  }
  throw new Error('浮层未显示翻译结果');
}

beforeAll(async () => {
  const { document, window } = parseHTML('<html lang="zh-CN"><body><p>こんにちは</p></body></html>');
  Object.assign(globalThis, {
    document,
    window,
    HTMLElement: window.HTMLElement,
    chrome: {
      i18n: { getUILanguage: () => 'zh-CN', getMessage: (key: string) => key },
      storage: {
        local: { get: async () => ({ targetLang: 'zh-CN', showBubble: '2' }) },
        onChanged: { addListener: () => {} },
      },
      runtime: {
        id: 'test-extension',
        connect: () => ({}),
        sendMessage: () => {},
        onMessage: {
          addListener: (listener: typeof onMessage) => { onMessage = listener; },
        },
      },
    },
    fetch: async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      requests.push(url);
      const sourceLang = url.searchParams.get('query.source_language');
      const translated = sourceLang === 'auto' ? '你好' : selectedText;
      return new Response(JSON.stringify([translated, [[translated, selectedText]], null, null, null, 'ja']));
    },
  });
  Object.assign(window, {
    innerWidth: 1280,
    getSelection: () => ({
      toString: () => selectedText,
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ left: 20, top: 20, bottom: 40, width: 100, height: 20 }),
      }),
    }),
  });

  await import('../src/pages/bubble');
  await Bun.sleep(0);
});

afterAll(() => {
  for (const key of GLOBAL_KEYS) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe('浮层选区语言检测', () => {
  test('中文网页中的日语选区自动检测并翻译为中文', async () => {
    selectedText = 'こんにちは';
    const event = new window.Event('mouseup', { bubbles: true });
    Object.defineProperty(event, 'button', { value: 0 });
    document.querySelector('p')!.dispatchEvent(event);

    const root = await waitForResult();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get('query.source_language')).toBe('auto');
    expect(requests[0]!.searchParams.get('query.target_language')).toBe('zh-CN');
    expect(root.querySelector('.gtx-source')!.textContent).toBe('こんにちは');
    expect(root.querySelector('.gtx-footer a')!.getAttribute('href')).toContain('#ja/zh-CN/');
  });

  test('点击浮层图标展开时同样自动检测选区语言', async () => {
    onMessage({
      type: 'settingsChanged',
      settings: { targetLang: 'zh-CN', showBubble: '1', detectLanguage: true, addImageContextMenu: false },
    });
    document.querySelector('p')!.dispatchEvent(new window.Event('mousedown', { bubbles: true }));
    selectedText = 'こんにちは！';
    const event = new window.Event('mouseup', { bubbles: true });
    Object.defineProperty(event, 'button', { value: 0 });
    document.querySelector('p')!.dispatchEvent(event);

    for (let attempt = 0; attempt < 100; attempt++) {
      if (document.querySelector('#gtx-trans')?.shadowRoot?.querySelector('.gtx-icon')) break;
      await Bun.sleep(10);
    }
    const icon = document.querySelector('#gtx-trans')?.shadowRoot?.querySelector<HTMLButtonElement>('.gtx-icon');
    expect(icon).toBeDefined();
    expect(requests).toHaveLength(1);
    icon!.click();

    await waitForResult();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.searchParams.get('query.source_language')).toBe('auto');
    expect(requests[1]!.searchParams.get('query.target_language')).toBe('zh-CN');
  });
});
