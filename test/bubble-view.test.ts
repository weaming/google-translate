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
    expect(root.querySelectorAll('.gtx-line')).toHaveLength(2);
    expect(root.querySelector('.gtx-footer a')).not.toBeNull();
  });
});
