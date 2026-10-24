import { describe, expect, test, beforeEach } from 'bun:test';
import { parseHTML } from 'linkedom';
import {
  applyTranslation,
  collectSegments,
  hasPageTranslation,
  removePageTranslation,
} from '../src/shared/page-translate';

/** 每个用例重建一个带全局 DOM 的运行环境 */
function setup(html: string): void {
  const { document, window, HTMLElement: HtmlElement, Node: DomNode, Text: DomText } = parseHTML(
    `<html><body>${html}</body></html>`,
  ) as unknown as Record<string, unknown> & { document: Document; window: unknown };

  const g = globalThis as unknown as Record<string, unknown>;
  g.document = document;
  g.window = window;
  g.HTMLElement = HtmlElement;
  g.Node = DomNode;
  g.Text = DomText;
  g.NodeFilter = { SHOW_TEXT: 4 };
  g.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
}

beforeEach(() => setup(''));

describe('collectSegments', () => {
  test('按块聚合同一段落内的多个文本节点', () => {
    setup('<p>Hello <b>world</b> again</p>');
    const segments = collectSegments();

    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe('Hello world again');
    expect(segments[0]?.nodes.length).toBe(3);
  });

  test('跳过脚本、代码等标签', () => {
    setup('<p>Hello</p><script>var a = 1</script><pre>code here</pre>');
    expect(collectSegments().map((s) => s.text)).toEqual(['Hello']);
  });

  test('跳过纯数字与纯符号', () => {
    setup('<p>12345</p><p>!!!</p><p>Real text</p>');
    expect(collectSegments().map((s) => s.text)).toEqual(['Real text']);
  });

  test('跳过过短的文本', () => {
    setup('<p>a</p><p>ok ok</p>');
    expect(collectSegments().map((s) => s.text)).toEqual(['ok ok']);
  });
});

describe('applyTranslation 替换模式', () => {
  test('译文直接替换元素内容，不额外插入兄弟节点', () => {
    setup('<p id="t">Hello world</p>');
    applyTranslation(collectSegments()[0]!, '你好世界');

    const p = document.querySelector('#t')!;
    expect(p.textContent).toBe('你好世界');
    expect(p.parentElement?.children.length).toBe(1);
  });

  test('保留元素自身与所有属性，排版天然兼容', () => {
    setup('<h2 id="t" class="title">Hello world</h2>');
    const before = document.querySelector('#t')!;
    applyTranslation(collectSegments()[0]!, '你好世界');

    const after = document.querySelector('#t')!;
    expect(after.tagName).toBe('H2');
    expect(after.id).toBe('t');
    expect(after.className).toContain('title');
  });

  test('标记 notranslate，避免被 Chrome 二次翻译', () => {
    setup('<p id="t">Hello world</p>');
    applyTranslation(collectSegments()[0]!, '你好世界');

    expect(document.querySelector('#t')!.className).toContain('notranslate');
  });

  test('不再插入对照块或多余节点', () => {
    setup('<p id="t">Hello world</p>');
    applyTranslation(collectSegments()[0]!, '你好世界');

    const p = document.querySelector('#t')!;
    expect(p.querySelectorAll('[data-gtx-translation]').length).toBe(0);
    expect(p.querySelectorAll('br').length).toBe(0);
    expect(p.querySelectorAll('span').length).toBe(0);
  });
});

describe('removePageTranslation 还原', () => {
  test('普通段落还原为原文', () => {
    setup('<p id="t">Hello world</p>');
    applyTranslation(collectSegments()[0]!, '你好世界');

    expect(hasPageTranslation()).toBe(true);
    removePageTranslation();

    expect(hasPageTranslation()).toBe(false);
    expect(document.querySelector('#t')!.textContent).toBe('Hello world');
  });

  test('内联标签结构完整还原', () => {
    setup('<p id="t">If a game has a <b>native</b> version, <a href="#">click</a> it.</p>');
    const originalHtml = document.querySelector('#t')!.innerHTML;

    applyTranslation(collectSegments()[0]!, '如果游戏有原生版本，点击它。');
    expect(document.querySelector('#t')!.textContent).toBe('如果游戏有原生版本，点击它。');

    removePageTranslation();
    expect(document.querySelector('#t')!.innerHTML).toBe(originalHtml);
  });

  test('还原后移除 notranslate 标记', () => {
    setup('<p id="t" class="body">Hello world</p>');
    applyTranslation(collectSegments()[0]!, '你好世界');
    removePageTranslation();

    const p = document.querySelector('#t')!;
    expect(p.className).not.toContain('notranslate');
    expect(p.className).toContain('body');
  });

  test('列表项还原后仍是列表项，不破坏列表结构', () => {
    setup('<ul><li id="t">First item</li></ul>');
    applyTranslation(collectSegments()[0]!, '第一项');
    removePageTranslation();

    expect(document.querySelectorAll('ul > li').length).toBe(1);
    expect(document.querySelector('#t')!.textContent).toBe('First item');
  });
});

describe('代码内容不翻译', () => {
  test('跳过 pre 与 code 代码块', () => {
    setup('<p>Real text here</p><pre><code>const a = 1;</code></pre><p>Inline <code>npm install</code> use</p>');
    // 行内代码本身被跳过，段落剩余文字仍保留
    expect(collectSegments().map((s) => s.text)).toEqual(['Real text here', 'Inline use']);
  });

  test('跳过行内代码，但保留同一段落里的普通文字', () => {
    setup('<p>Run <code>npm install</code> to start</p>');
    const segments = collectSegments();

    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe('Run to start');
  });

  test('跳过 highlight.js 的 div.highlight 代码块', () => {
    setup('<div class="highlight highlight-source-js"><span>const x = 1</span></div><p>Normal paragraph</p>');
    expect(collectSegments().map((s) => s.text)).toEqual(['Normal paragraph']);
  });

  test('跳过带 notranslate 的区域', () => {
    setup('<p class="notranslate">Do not translate me</p><p>Translate me please</p>');
    expect(collectSegments().map((s) => s.text)).toEqual(['Translate me please']);
  });

  test('跳过 kbd / samp / var 等代码语义标签', () => {
    setup('<p>Press <kbd>Ctrl</kbd> to continue</p><p>Use <var>x</var> value</p>');
    expect(collectSegments().map((s) => s.text)).toEqual(['Press to continue', 'Use value']);
  });
});

describe('GitHub 只翻译正文', () => {
  test('只取 .markdown-body 内的内容', async () => {
    setup(`
      <header class="AppHeader"><span>Sign in</span></header>
      <nav><a>Code</a><a>Issues</a></nav>
      <div class="markdown-body"><p>Real readme content here</p></div>
      <footer><span>Terms of service text</span></footer>
    `);

    const { findContentRoots } = await import('../src/shared/site-rules');
    const roots = findContentRoots('github.com');

    expect(roots).toHaveLength(1);
    expect(collectSegments(roots).map((s) => s.text)).toEqual(['Real readme content here']);
  });

  test('非 GitHub 站点没有正文规则，回退到整页', async () => {
    setup('<p>Any page content</p>');
    const { findContentRoots } = await import('../src/shared/site-rules');

    expect(findContentRoots('example.com')).toEqual([]);
  });

  test('GitHub 页面没有 .markdown-body 时返回空，由调用方回退', async () => {
    setup('<div class="react-code-view"><span>const x = 1</span></div>');
    const { findContentRoots } = await import('../src/shared/site-rules');

    expect(findContentRoots('github.com')).toEqual([]);
  });
});
