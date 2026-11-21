import { beforeEach, describe, expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import { BubbleView, type BubbleState } from '../src/pages/bubble-view';

let view: BubbleView;
let root: ShadowRoot;

function makeState(original: string, translated = '译文'): BubbleState {
  return {
    original,
    sourceLang: 'en',
    targetLang: 'zh-CN',
    failed: false,
    result: {
      text: translated,
      sourceLang: 'en',
      targetLang: 'zh-CN',
      sentences: [],
      romanization: '',
      isError: false,
    },
  };
}

beforeEach(() => {
  const { document, window } = parseHTML('<html><body></body></html>');
  Object.assign(globalThis, { document, window });
  view = new BubbleView({ onClose: () => {}, onExpand: () => {}, onPlay: () => {} });
  view.mount();
  root = document.querySelector('#gtx-trans')!.shadowRoot!;
});

describe('长文阅读布局', () => {
  test('原文超过 200 字时，加载和结果都使用宽版', () => {
    const state = makeState('长'.repeat(201));
    view.renderLoading({ ...state, result: null });
    expect(root.querySelector('.gtx-box-long')).not.toBeNull();
    view.renderResult(state);
    expect(root.querySelector('.gtx-box-long')).not.toBeNull();
    expect(root.querySelector('.gtx-source')!.textContent).toBe(state.original);
  });

  test('译文较长时也会加宽，且不截断内容', () => {
    const translated = `${'译'.repeat(201)} 第二段`;
    view.renderResult(makeState('Original', translated));
    expect(root.querySelector('.gtx-box-long')).not.toBeNull();
    expect(root.querySelector('.gtx-result')!.textContent).toBe(translated);
  });

  test('200 字以内仍保持紧凑布局', () => {
    view.renderResult(makeState('短'.repeat(200)));
    expect(root.querySelector('.gtx-box-long')).toBeNull();
  });

  test('切换到短文、图标或提示时不残留宽版状态', () => {
    const renderCompact = [
      () => view.renderResult(makeState('short')),
      () => view.renderLoading(makeState('short')),
      () => view.renderIcon(),
      () => view.renderNotice('notice'),
    ];
    for (const render of renderCompact) {
      view.renderResult(makeState('长'.repeat(201)));
      render();
      expect(root.querySelector('.gtx-box-long')).toBeNull();
    }
    expect(root.querySelector('.gtx-box-icon')).toBeNull();
  });

  test('长文保留逐句对照和底部入口', () => {
    const state = makeState('长'.repeat(201));
    state.result!.sentences = [
      { orig: 'First.', trans: '第一句。' },
      { orig: 'Second.', trans: '第二句。' },
    ];
    view.renderResult(state);
    const details = root.querySelector<HTMLDetailsElement>('details.gtx-sentences-wrap');
    expect(details).not.toBeNull();
    expect(details!.hasAttribute('open')).toBe(false);
    expect(root.querySelectorAll('.gtx-line')).toHaveLength(2);
    expect(root.querySelector('.gtx-footer a')).not.toBeNull();
  });

  test('关闭按钮固定在顶栏外，主滚动区使用细滚动条', () => {
    view.renderResult(makeState('Hello world', '你好世界'));
    const header = root.querySelector('.gtx-header');
    const body = root.querySelector('.gtx-body');
    expect(header?.querySelector('.gtx-close')).not.toBeNull();
    expect(body?.querySelector('.gtx-close')).toBeNull();
    expect(body?.classList.contains('gtx-scroll-y')).toBe(true);
    expect(root.querySelector('.gtx-footer .gtx-copy')).not.toBeNull();
  });

  test('超长文本朗读禁用时保留原文与译文区分文案', () => {
    const longOrig = 'a'.repeat(201);
    const longTrans = '译'.repeat(201);
    view.renderResult(makeState(longOrig, longTrans));
    const disabledButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.gtx-action-disabled'));
    expect(disabledButtons).toHaveLength(2);
    expect(disabledButtons[0]!.textContent).not.toBe(disabledButtons[1]!.textContent);
    expect(disabledButtons[0]!.title).toContain('tooLongToSpeak');
  });
});

describe('浮层定位与小箭头', () => {
  function setupViewport(width: number, height: number, boxWidth: number, boxHeight: number): HTMLElement {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: height });
    Object.assign(window, { scrollX: 0, scrollY: 0 });
    const box = root.querySelector<HTMLElement>('.gtx-box')!;
    box.getBoundingClientRect = () =>
      ({ width: boxWidth, height: boxHeight, left: 0, top: 0, right: boxWidth, bottom: boxHeight }) as DOMRect;
    return box;
  }

  function makeRect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
  }

  test('下方空间充足时位于选区下方并显示顶部箭头', () => {
    view.renderResult(makeState('hello', '你好'));
    const box = setupViewport(1280, 800, 300, 140);
    view.position(makeRect(200, 100, 80, 20));

    const arrow = root.querySelector<HTMLElement>('.gtx-arrow')!;
    expect(box.style.top).toBe('130px');
    expect(arrow.hidden).toBe(false);
    expect(arrow.classList.contains('gtx-arrow-top')).toBe(true);
  });

  test('下方不足但上方充足时翻到上方并显示底部箭头', () => {
    view.renderResult(makeState('hello', '你好'));
    const box = setupViewport(1280, 800, 300, 140);
    view.position(makeRect(200, 700, 80, 20));

    const arrow = root.querySelector<HTMLElement>('.gtx-arrow')!;
    expect(box.style.top).toBe('550px');
    expect(arrow.hidden).toBe(false);
    expect(arrow.classList.contains('gtx-arrow-bottom')).toBe(true);
  });

  test('两侧都放不下完整高度时限制在较大一侧避免遮挡选区', () => {
    view.renderResult(makeState('长'.repeat(201), '译'.repeat(201)));
    const box = setupViewport(1280, 700, 680, 500);
    view.position(makeRect(200, 220, 120, 30));

    const arrow = root.querySelector<HTMLElement>('.gtx-arrow')!;
    // 下方可用空间 700 - 250 - 10 - 8 = 432，大于上方 202，应限制在下方不盖住选区
    expect(box.style.maxHeight).toBe('432px');
    expect(box.style.top).toBe('260px');
    expect(arrow.hidden).toBe(false);
    expect(arrow.classList.contains('gtx-arrow-top')).toBe(true);
  });

  test('上下两侧空间都不足以容纳最小高度时隐藏小箭头', () => {
    view.renderResult(makeState('长'.repeat(201), '译'.repeat(201)));
    setupViewport(1280, 400, 680, 350);
    view.position(makeRect(200, 100, 300, 220));

    const arrow = root.querySelector<HTMLElement>('.gtx-arrow')!;
    expect(arrow.hidden).toBe(true);
  });

  test('图标态始终隐藏小箭头', () => {
    view.renderIcon();
    setupViewport(1280, 800, 34, 34);
    view.position(makeRect(200, 200, 60, 20));

    const arrow = root.querySelector<HTMLElement>('.gtx-arrow')!;
    expect(arrow.hidden).toBe(true);
  });
});
