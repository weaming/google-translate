/** 划词翻译气泡视图：图标态与展开态，全部使用 Shadow DOM 隔离页面样式 */

import { t } from '../shared/i18n';
import type { Sentence, TranslationResult } from '../shared/translate-api';
import { SPEECH_MAX_LENGTH, speechBlockReason } from '../shared/translate-api';
import { cleanSentences, cleanText } from '../shared/text';
import { getTranslateUrl } from '../shared/urls';

export interface BubbleCallbacks {
  onClose: () => void;
  onExpand: () => void;
  onPlay: (lang: string, text: string) => void;
}

export interface BubbleState {
  sourceLang: string;
  targetLang: string;
  original: string;
  result: TranslationResult | null;
  failed: boolean;
}

export type BubbleMode = 'icon' | 'bubble';

const HOST_ID = 'gtx-trans';

/** 超过这个长度才给原文单独加滚动区，短文本直接展开 */
const SOURCE_SCROLL_CHARS = 200;

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; }
.gtx-box { position: absolute; display: flex; flex-direction: column;
  width: max-content; min-width: min(240px, calc(var(--gtx-view-width, 100vw) - 24px));
  max-width: min(420px, calc(var(--gtx-view-width, 100vw) - 24px));
  background: #fff; color: #202124; border: 1px solid #dadce0; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(60,64,67,.25); font-size: 13px; line-height: 1.5;
  overflow-wrap: break-word; word-break: break-word; }
/* 图标态只占图标大小，展开后再回到气泡宽度 */
.gtx-box-icon { width: max-content; min-width: 0; max-width: none; }
.gtx-box-long { width: min(680px, calc(var(--gtx-view-width, 100vw) - 24px));
  max-width: min(680px, calc(var(--gtx-view-width, 100vw) - 24px)); }
.gtx-arrow { position: absolute; width: 12px; height: 12px; background: #fff; border: 1px solid #dadce0;
  transform: rotate(45deg); }
.gtx-arrow-top { top: -7px; border-right: 0; border-bottom: 0; }
.gtx-arrow-bottom { bottom: -7px; border-left: 0; border-top: 0; }
.gtx-body { position: relative; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 10px 12px 8px; }
.gtx-box-long .gtx-body { padding: 20px 24px 12px; }
.gtx-box-long .gtx-source { font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
.gtx-box-long .gtx-result { font-size: 16px; line-height: 1.7; margin: 0 0 16px; }
.gtx-box-long .gtx-source-scroll, .gtx-box-long .gtx-sentences {
  max-height: none; overflow-y: visible; scrollbar-gutter: auto; }
.gtx-box-long .gtx-line { padding: 8px 0; white-space: pre-wrap; }
.gtx-box-long .gtx-line-orig { font-size: 14px; line-height: 1.7; }
.gtx-box-long .gtx-line-trans { font-size: 16px; line-height: 1.7; }
/* 给右上角关闭按钮留位，避免文字被遮住 */
.gtx-source, .gtx-result { padding-right: 22px; }
.gtx-close { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; padding: 0; border: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: transparent; color: #5f6368; cursor: pointer; }
.gtx-close:hover { background: #f1f3f4; color: #202124; }
.gtx-source { color: #5f6368; font-size: 12px; margin: 2px 0 6px; word-break: break-word;
  overflow-wrap: break-word; white-space: pre-wrap; }
.gtx-source-scroll { max-height: 120px; overflow-y: auto; overscroll-behavior: contain;
  padding-right: 8px; }
/* 细滚动条：默认样式在气泡里过于笨重，且只在悬停时加深 */
.gtx-scroll-y { scrollbar-width: thin; scrollbar-color: #dadce0 transparent; }
/* 内部滚动区常驻 gutter，避免滚动条出现时文字宽度跳动 */
.gtx-scroll-gutter { scrollbar-gutter: stable; }
.gtx-scroll-y::-webkit-scrollbar { width: 6px; }
.gtx-scroll-y::-webkit-scrollbar-track { background: transparent; }
.gtx-scroll-y::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 3px; }
.gtx-scroll-y::-webkit-scrollbar-thumb:hover { background: #bdc1c6; }
.gtx-result { font-size: 15px; margin: 0 0 6px; word-break: break-word; white-space: pre-wrap; }
.gtx-sentences { margin: 0 0 6px; padding-left: 10px; border-left: 2px solid #e8eaed;
  max-height: 168px; overflow-y: auto; overscroll-behavior: contain; }
.gtx-line { padding: 2px 0; word-break: break-word; }
.gtx-line-orig { color: #80868b; font-size: 12px; }
.gtx-line-trans { font-size: 13px; }
.gtx-error { color: #d93025; font-size: 12px; margin: 0 0 8px; }
.gtx-notice { color: #5f6368; font-size: 12px; padding-right: 22px; }
.gtx-icon-wrap { padding: 2px; }
.gtx-icon { width: 30px; height: 28px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; border-radius: 4px; background: #fff; border: 0; padding: 0; }
.gtx-icon:hover { background: #f1f3f4; }
.gtx-icon:disabled { cursor: progress; }
.gtx-icon-loading { opacity: .5; }
.gtx-footer { flex-shrink: 0; display: flex; align-items: center; gap: 12px; border-top: 1px solid #f1f3f4; padding: 6px 12px; }
.gtx-link { color: #1a73e8; font-size: 11px; text-decoration: none; cursor: pointer;
  letter-spacing: .3px; text-transform: uppercase; }
.gtx-link:hover { text-decoration: underline; }
.gtx-audio-row { display: flex; gap: 14px; flex-wrap: wrap; padding: 2px 0 6px; }
.gtx-audio { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent;
  cursor: pointer; color: #1a73e8; padding: 0; font-size: 12px; }
.gtx-audio svg { flex: none; }
.gtx-audio:hover:not(:disabled) { text-decoration: underline; }
.gtx-audio-disabled { color: #9aa0a6; cursor: default; }
`;

const ICON_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="#1a73e8"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

/** 关闭与朗读用内联 SVG，避免符号字符在缺字字体下显示成方框或菱形 */
const CLOSE_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

const SPEAKER_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 原文完整展示，过长时限制高度并滚动，不再截断 */
function buildSource(text: string): HTMLElement {
  const node = el('div', 'gtx-source', text);
  if (text.length > SOURCE_SCROLL_CHARS) node.classList.add('gtx-source-scroll', 'gtx-scroll-y', 'gtx-scroll-gutter');
  return node;
}

/** 多句时逐句对照；只有一句则不需要重复展示 */
function buildSentences(sentences: Sentence[]): HTMLElement | null {
  const cleaned = cleanSentences(sentences);
  const meaningful = cleaned.filter((item) => item.orig && item.trans && item.orig !== item.trans);
  if (meaningful.length <= 1) return null;

  const list = el('div', 'gtx-sentences gtx-scroll-y gtx-scroll-gutter');
  for (const item of meaningful) {
    const line = el('div', 'gtx-line');
    line.appendChild(el('div', 'gtx-line-orig', item.orig));
    line.appendChild(el('div', 'gtx-line-trans', item.trans));
    list.appendChild(line);
  }

  return list;
}

export class BubbleView {
  private readonly host: HTMLElement;
  private readonly box: HTMLElement;
  private readonly arrow: HTMLElement;
  private mode: BubbleMode = 'bubble';
  private iconButton: HTMLButtonElement | null = null;

  constructor(private readonly callbacks: BubbleCallbacks) {
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.host.style.cssText =
      'all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';

    const root = this.host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLE;
    root.appendChild(style);

    this.box = el('div', 'gtx-box');
    this.arrow = el('div', 'gtx-arrow');
    this.box.appendChild(this.arrow);
    root.appendChild(this.box);
  }

  getMode(): BubbleMode {
    return this.mode;
  }

  mount(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  unmount(): void {
    this.host.remove();
  }

  isMounted(): boolean {
    return this.host.isConnected;
  }

  /** 放在选区下方，下方空间不足时翻到上方，并收进视口水平范围 */
  position(anchor: DOMRect): void {
    this.mount();

    const margin = 8;
    const docEl = document.documentElement;
    const viewWidth = docEl.clientWidth;
    const viewHeight = docEl.clientHeight;
    const maxHeight = Math.max(0, viewHeight - margin * 2);

    // 长句内容可能高于视口，先限制最大高度，否则会跑到屏幕外
    this.box.style.setProperty('--gtx-view-width', `${viewWidth}px`);
    this.box.style.maxHeight = `${maxHeight}px`;

    const { width, height } = this.box.getBoundingClientRect();
    const { scrollX: offsetX, scrollY: offsetY } = window;

    const left = Math.max(
      offsetX + margin,
      Math.min(anchor.left + offsetX, offsetX + viewWidth - width - margin),
    );

    const gap = 10;
    const fitsBelow = anchor.bottom + height + gap < viewHeight;
    const bottom = anchor.bottom + offsetY + gap;
    const above = anchor.top + offsetY - height - gap;

    // 下方放不下就翻到上方；上方也放不下时贴住视口顶部
    const preferred = fitsBelow ? bottom : above;
    const minTop = offsetY + margin;
    const maxTop = offsetY + viewHeight - height - margin;
    const top = Math.max(minTop, Math.min(preferred, maxTop));

    this.box.style.left = `${Math.round(left)}px`;
    this.box.style.top = `${Math.round(top)}px`;

    this.arrow.className = `gtx-arrow ${fitsBelow ? 'gtx-arrow-top' : 'gtx-arrow-bottom'}`;
    const arrowLeft = anchor.left + offsetX - left + anchor.width / 2 - 6;
    this.arrow.style.left = `${Math.round(Math.max(10, Math.min(arrowLeft, width - 22)))}px`;
  }

  /** 图标态：只显示可点击的小图标，点击后展开翻译 */
  renderIcon(): void {
    this.mode = 'icon';
    this.reset();
    this.box.classList.add('gtx-box-icon');

    const wrap = el('div', 'gtx-icon-wrap');
    const icon = el('button', 'gtx-icon');
    icon.type = 'button';
    icon.title = t('translate');
    icon.innerHTML = ICON_SVG;
    icon.addEventListener('click', (event) => {
      event.stopPropagation();
      // 点击后仍保持图标大小，结果回来再展开；等待期间禁用避免重复请求
      this.setIconLoading(true);
      this.callbacks.onExpand();
    });

    this.iconButton = icon;
    wrap.appendChild(icon);
    this.box.appendChild(wrap);
  }

  /** 图标态请求中：只改视觉与可点击性，不改变气泡尺寸 */
  setIconLoading(isLoading: boolean): void {
    if (!this.iconButton) return;
    this.iconButton.disabled = isLoading;
    this.iconButton.classList.toggle('gtx-icon-loading', isLoading);
  }

  renderLoading(state: BubbleState): void {
    this.mode = 'bubble';
    this.reset();
    this.setReadingLayout(state);

    const body = el('div', 'gtx-body');
    body.appendChild(this.buildHead());
    body.appendChild(buildSource(cleanText(state.original)));
    body.appendChild(el('div', 'gtx-result', '…'));
    this.box.appendChild(body);
  }

  renderResult(state: BubbleState): void {
    this.mode = 'bubble';
    this.reset();
    this.setReadingLayout(state);

    const body = el('div', 'gtx-body');
    body.appendChild(this.buildHead());
    body.appendChild(buildSource(cleanText(state.original)));

    if (state.failed || !state.result || state.result.isError) {
      body.appendChild(el('div', 'gtx-error', t('translationError')));
    } else {
      const result = state.result;
      body.appendChild(el('div', 'gtx-result', cleanText(result.text) || cleanText(state.original)));

      const sentences = buildSentences(result.sentences);
      if (sentences) body.appendChild(sentences);

      this.appendAudioRow(body, result, state.original);
    }

    this.box.appendChild(body);
    this.box.appendChild(this.buildFooter(state));
  }

  /** 轻量提示气泡：只显示一条说明，用于选区被拒绝等场景 */
  renderNotice(message: string): void {
    this.mode = 'bubble';
    this.reset();

    const body = el('div', 'gtx-body');
    body.appendChild(this.buildHead());
    body.appendChild(el('div', 'gtx-notice', message));
    this.box.appendChild(body);
  }

  /** 原文与译文各自的朗读按钮 */
  private appendAudioRow(body: HTMLElement, result: TranslationResult, original: string): void {
    const translated = result.text || original;
    const row = el('div', 'gtx-audio-row');

    const sourceButton = this.buildAudioButton(result.sourceLang, original, t('playOriginal'));
    if (sourceButton) row.appendChild(sourceButton);

    if (translated !== original) {
      const targetButton = this.buildAudioButton(result.targetLang, translated, t('playTranslation'));
      if (targetButton) row.appendChild(targetButton);
    }

    if (row.childElementCount > 0) body.appendChild(row);
  }

  /**
   * 朗读按钮：超长时置灰并说明原因，语言不支持时直接不显示。
   */
  private buildAudioButton(lang: string, text: string, label: string): HTMLButtonElement | null {
    const reason = speechBlockReason(lang, text);
    if (reason === 'empty' || reason === 'unsupportedLang') return null;

    const button = el('button', 'gtx-audio');
    button.type = 'button';

    const textNode = el('span');
    textNode.textContent = label;
    button.innerHTML = SPEAKER_SVG;
    button.appendChild(textNode);

    if (reason === 'tooLong') {
      const hint = t('tooLongToSpeak', SPEECH_MAX_LENGTH);
      textNode.textContent = hint;
      button.title = hint;
      button.disabled = true;
      button.classList.add('gtx-audio-disabled');
      return button;
    }

    button.title = label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.onPlay(lang, text);
    });

    return button;
  }

  private buildHead(): HTMLElement {
    // 关闭按钮绝对定位在右上角，不需要额外的头部容器
    const close = el('button', 'gtx-close');
    close.type = 'button';
    close.title = t('close');
    close.innerHTML = CLOSE_SVG;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.onClose();
    });

    return close;
  }

  private buildFooter(state: BubbleState): HTMLElement {
    const footer = el('div', 'gtx-footer');

    const more = el('a', 'gtx-link', t('openInTranslate'));
    more.href = getTranslateUrl(state.sourceLang || 'auto', state.targetLang, state.original, 'gtx');
    more.target = '_blank';
    more.rel = 'noreferrer';
    more.addEventListener('click', (event) => event.stopPropagation());
    footer.appendChild(more);

    return footer;
  }

  /** 原文或译文较长时采用宽版阅读布局，加载与结果保持同一判断规则 */
  private setReadingLayout(state: BubbleState): void {
    const textLength = Math.max(cleanText(state.original).length, cleanText(state.result?.text ?? '').length);
    this.box.classList.toggle('gtx-box-long', textLength > SOURCE_SCROLL_CHARS);
  }

  private reset(): void {
    this.box.classList.remove('gtx-box-icon', 'gtx-box-long');
    this.iconButton = null;
    this.box.replaceChildren(this.arrow);
  }
}
