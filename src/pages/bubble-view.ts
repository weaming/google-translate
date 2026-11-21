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

/** 原文或译文超过此字符数时切换为宽版阅读布局 */
const LONG_TEXT_CHARS = 200;

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 10;
const ICON_ANCHOR_GAP = 6;
const MIN_SIDE_HEIGHT = 180;
const ARROW_SIZE = 10;
const COPY_FEEDBACK_MS = 1500;

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; }
.gtx-box { position: absolute; display: flex; flex-direction: column;
  width: max-content; min-width: min(260px, calc(var(--gtx-view-width, 100vw) - 24px));
  max-width: min(440px, calc(var(--gtx-view-width, 100vw) - 24px));
  background: #fff; color: #202124; border: 1px solid rgba(60, 64, 67, .15); border-radius: 10px;
  box-shadow: 0 6px 24px rgba(60, 64, 67, .18), 0 1px 4px rgba(60, 64, 67, .08);
  font-size: 13px; line-height: 1.5;
  overflow-wrap: break-word; word-break: break-word; }
.gtx-box-icon { width: max-content; min-width: 0; max-width: none; border-radius: 8px;
  box-shadow: 0 2px 10px rgba(60, 64, 67, .22), 0 1px 3px rgba(60, 64, 67, .1); }
.gtx-box-long { width: min(680px, calc(var(--gtx-view-width, 100vw) - 24px));
  max-width: min(680px, calc(var(--gtx-view-width, 100vw) - 24px)); }
.gtx-arrow { position: absolute; width: 10px; height: 10px; background: #fff;
  border: 1px solid rgba(60, 64, 67, .15); transform: rotate(45deg); pointer-events: none; }
.gtx-arrow[hidden] { display: none; }
.gtx-arrow-top { top: -6px; border-right: 0; border-bottom: 0; }
.gtx-arrow-bottom { bottom: -6px; border-left: 0; border-top: 0; }

.gtx-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 7px 8px 6px 14px; border-bottom: 1px solid #f1f3f4; }
.gtx-box-long .gtx-header { padding: 10px 14px 8px 24px; }
.gtx-lang { color: #5f6368; font-size: 11px; font-weight: 500; letter-spacing: .2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gtx-close { flex-shrink: 0; width: 24px; height: 24px; padding: 0; border: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; background: transparent; color: #5f6368; cursor: pointer;
  transition: background-color .15s, color .15s; }
.gtx-close:hover { background: #f1f3f4; color: #202124; }

.gtx-body { position: relative; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 12px 14px 12px; }
.gtx-box-long .gtx-body { padding: 18px 24px 16px; }
.gtx-source { color: #5f6368; font-size: 12.5px; line-height: 1.55; margin: 0 0 10px;
  padding-bottom: 10px; border-bottom: 1px solid #f1f3f4;
  word-break: break-word; overflow-wrap: break-word; white-space: pre-wrap; }
.gtx-box-long .gtx-source { font-size: 14px; line-height: 1.7; margin: 0 0 16px; padding-bottom: 14px; }
.gtx-result { color: #202124; font-size: 15px; line-height: 1.6; margin: 0;
  word-break: break-word; white-space: pre-wrap; }
.gtx-box-long .gtx-result { font-size: 16px; line-height: 1.7; }

.gtx-loading-dots { display: inline-flex; align-items: center; gap: 5px; min-height: 22px; }
.gtx-loading-dots span { width: 6px; height: 6px; border-radius: 50%; background: #8ab4f8;
  animation: gtx-pulse 1.1s infinite ease-in-out; }
.gtx-loading-dots span:nth-child(2) { animation-delay: .18s; }
.gtx-loading-dots span:nth-child(3) { animation-delay: .36s; }
@keyframes gtx-pulse {
  0%, 80%, 100% { opacity: .35; transform: scale(.85); }
  40% { opacity: 1; transform: scale(1); }
}

.gtx-scroll-y { scrollbar-width: thin; scrollbar-color: #dadce0 transparent; }
.gtx-scroll-y::-webkit-scrollbar { width: 6px; }
.gtx-scroll-y::-webkit-scrollbar-track { background: transparent; }
.gtx-scroll-y::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 3px; }
.gtx-scroll-y::-webkit-scrollbar-thumb:hover { background: #bdc1c6; }

.gtx-sentences-wrap { margin-top: 12px; }
.gtx-box-long .gtx-sentences-wrap { margin-top: 16px; }
.gtx-sentences-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px 3px 2px;
  border-radius: 6px; color: #5f6368; font-size: 12px; font-weight: 500;
  cursor: pointer; list-style: none; user-select: none; transition: color .15s, background-color .15s; }
.gtx-sentences-toggle::-webkit-details-marker { display: none; }
.gtx-sentences-toggle:hover { color: #202124; background: #f8f9fa; }
.gtx-sentences-toggle::before { content: ""; width: 0; height: 0;
  border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
  transition: transform .15s; }
.gtx-sentences-wrap[open] .gtx-sentences-toggle::before { transform: rotate(90deg); }
.gtx-sentences { margin: 8px 0 0; padding-left: 12px; border-left: 2px solid #e8eaed; }
.gtx-line { padding: 6px 0; word-break: break-word; white-space: pre-wrap; }
.gtx-line + .gtx-line { border-top: 1px solid #f1f3f4; }
.gtx-box-long .gtx-line { padding: 8px 0; }
.gtx-line-orig { color: #80868b; font-size: 12px; line-height: 1.55; margin-bottom: 2px; }
.gtx-line-trans { color: #202124; font-size: 13px; line-height: 1.6; }
.gtx-box-long .gtx-line-orig { font-size: 14px; line-height: 1.7; }
.gtx-box-long .gtx-line-trans { font-size: 16px; line-height: 1.7; }

.gtx-error { color: #d93025; font-size: 13px; line-height: 1.5; margin: 0; }
.gtx-notice-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 8px 8px 14px; }
.gtx-notice { color: #5f6368; font-size: 12.5px; line-height: 1.5; }

.gtx-icon-wrap { padding: 3px; }
.gtx-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; border-radius: 6px; background: #fff; border: 0; padding: 0;
  transition: background-color .15s, transform .15s; }
.gtx-icon:hover { background: #f1f3f4; }
.gtx-icon:disabled { cursor: progress; }
.gtx-icon-loading svg { animation: gtx-pulse 1s infinite ease-in-out; }

.gtx-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px 14px; border-top: 1px solid #f1f3f4; padding: 7px 12px; }
.gtx-box-long .gtx-footer { padding: 9px 20px; }
.gtx-actions { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.gtx-action { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent;
  cursor: pointer; color: #5f6368; padding: 4px 7px; border-radius: 6px; font-size: 12px;
  transition: background-color .15s, color .15s; }
.gtx-action svg { flex: none; }
.gtx-action:hover:not(:disabled) { background: #f1f3f4; color: #1a73e8; }
.gtx-action-active { color: #188038; }
.gtx-action-disabled { color: #9aa0a6; cursor: not-allowed; }
.gtx-link { color: #1a73e8; font-size: 12px; text-decoration: none; cursor: pointer;
  white-space: nowrap; margin-left: auto; }
.gtx-link:hover { text-decoration: underline; }
`;

const ICON_SVG =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="#1a73e8"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

const CLOSE_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

const SPEAKER_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>';

const COPY_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

const CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

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

/** 将语言代码转成界面可读名称，不支持或异常时回退原代码 */
function formatLangLabel(code: string): string {
  if (!code || code === 'auto') return t('detectLanguage');

  try {
    const uiLang = globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || 'en';
    const names = new Intl.DisplayNames([uiLang], { type: 'language' });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

/** 多句时用折叠面板承载逐句对照，避免与上方整段原文/译文视觉重复 */
function buildSentences(sentences: Sentence[]): HTMLElement | null {
  const cleaned = cleanSentences(sentences);
  const meaningful = cleaned.filter((item) => item.orig && item.trans && item.orig !== item.trans);
  if (meaningful.length <= 1) return null;

  const details = el('details', 'gtx-sentences-wrap');
  details.appendChild(el('summary', 'gtx-sentences-toggle', t('sentenceCompare', meaningful.length)));

  const list = el('div', 'gtx-sentences');
  for (const item of meaningful) {
    const line = el('div', 'gtx-line');
    line.appendChild(el('div', 'gtx-line-orig', item.orig));
    line.appendChild(el('div', 'gtx-line-trans', item.trans));
    list.appendChild(line);
  }

  details.appendChild(list);
  return details;
}

function buildLoadingDots(): HTMLElement {
  const wrap = el('div', 'gtx-result gtx-loading-dots');
  wrap.appendChild(el('span'));
  wrap.appendChild(el('span'));
  wrap.appendChild(el('span'));
  return wrap;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 非安全上下文或权限受限时走降级复制
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand?.('copy') ?? false;
  textarea.remove();
  return ok;
}

export class BubbleView {
  private readonly host: HTMLElement;
  private readonly box: HTMLElement;
  private readonly arrow: HTMLElement;
  private mode: BubbleMode = 'bubble';
  private iconButton: HTMLButtonElement | null = null;
  private copyTimer = 0;

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
    this.clearCopyTimer();
    this.host.remove();
  }

  isMounted(): boolean {
    return this.host.isConnected;
  }

  /**
   * 优先放在选区下方，其次上方；两侧都放不下完整高度时，优先将最大高度限制在空间更大的一侧，
   * 尽量避免遮挡选中文本。仅在气泡真实位于选区正上方或正下方时显示小箭头。
   */
  position(anchor: DOMRect): void {
    this.mount();

    const docEl = document.documentElement;
    const viewWidth = docEl.clientWidth || window.innerWidth;
    const viewHeight = docEl.clientHeight || window.innerHeight;
    const fullMaxHeight = Math.max(0, viewHeight - VIEWPORT_MARGIN * 2);

    this.box.style.setProperty('--gtx-view-width', `${viewWidth}px`);
    this.box.style.maxHeight = `${fullMaxHeight}px`;

    const measured = this.box.getBoundingClientRect();
    const width = measured.width;
    let height = measured.height;
    const { scrollX: offsetX, scrollY: offsetY } = window;

    const left = Math.max(
      offsetX + VIEWPORT_MARGIN,
      Math.min(anchor.left + offsetX, offsetX + viewWidth - width - VIEWPORT_MARGIN),
    );

    const gap = this.mode === 'icon' ? ICON_ANCHOR_GAP : ANCHOR_GAP;
    const spaceBelow = viewHeight - anchor.bottom - gap - VIEWPORT_MARGIN;
    const spaceAbove = anchor.top - gap - VIEWPORT_MARGIN;

    let placement: 'below' | 'above' | 'overlay';
    if (height <= spaceBelow) {
      placement = 'below';
    } else if (height <= spaceAbove) {
      placement = 'above';
    } else {
      const bestSpace = Math.max(spaceBelow, spaceAbove);
      if (this.mode !== 'icon' && bestSpace >= MIN_SIDE_HEIGHT) {
        placement = spaceBelow >= spaceAbove ? 'below' : 'above';
        const clampedHeight = Math.floor(bestSpace);
        this.box.style.maxHeight = `${clampedHeight}px`;
        const resizedHeight = this.box.getBoundingClientRect().height;
        height = resizedHeight > 0 ? Math.min(resizedHeight, clampedHeight) : Math.min(height, clampedHeight);
      } else {
        placement = 'overlay';
      }
    }

    const minTop = offsetY + VIEWPORT_MARGIN;
    const maxTop = Math.max(minTop, offsetY + viewHeight - height - VIEWPORT_MARGIN);
    let preferredTop = minTop;
    if (placement === 'below') {
      preferredTop = anchor.bottom + offsetY + gap;
    } else if (placement === 'above') {
      preferredTop = anchor.top + offsetY - height - gap;
    }
    const top = Math.max(minTop, Math.min(preferredTop, maxTop));

    this.box.style.left = `${Math.round(left)}px`;
    this.box.style.top = `${Math.round(top)}px`;

    this.positionArrow(anchor, left, width, offsetX, placement);
  }

  /** 图标态：只显示可点击的小图标，点击后展开翻译 */
  renderIcon(): void {
    this.mode = 'icon';
    this.reset();
    this.box.classList.add('gtx-box-icon');
    this.arrow.hidden = true;

    const wrap = el('div', 'gtx-icon-wrap');
    const icon = el('button', 'gtx-icon');
    icon.type = 'button';
    icon.title = t('translate');
    icon.innerHTML = ICON_SVG;
    icon.addEventListener('click', (event) => {
      event.stopPropagation();
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

    this.box.appendChild(this.buildHeader(state));

    const body = el('div', 'gtx-body gtx-scroll-y');
    body.appendChild(el('div', 'gtx-source', cleanText(state.original)));
    body.appendChild(buildLoadingDots());
    this.box.appendChild(body);
  }

  renderResult(state: BubbleState): void {
    this.mode = 'bubble';
    this.reset();
    this.setReadingLayout(state);

    this.box.appendChild(this.buildHeader(state));

    const body = el('div', 'gtx-body gtx-scroll-y');
    const cleanedOriginal = cleanText(state.original);
    body.appendChild(el('div', 'gtx-source', cleanedOriginal));

    let translatedText = '';
    if (state.failed || !state.result || state.result.isError) {
      body.appendChild(el('div', 'gtx-error', t('translationError')));
    } else {
      const result = state.result;
      translatedText = cleanText(result.text) || cleanedOriginal;
      body.appendChild(el('div', 'gtx-result', translatedText));

      const sentences = buildSentences(result.sentences);
      if (sentences) body.appendChild(sentences);
    }

    this.box.appendChild(body);
    this.box.appendChild(this.buildFooter(state, translatedText));
  }

  /** 轻量提示气泡：只显示一条说明，用于选区被拒绝等场景 */
  renderNotice(message: string): void {
    this.mode = 'bubble';
    this.reset();

    const row = el('div', 'gtx-notice-row');
    row.appendChild(el('div', 'gtx-notice', message));
    row.appendChild(this.buildCloseButton());
    this.box.appendChild(row);
  }

  private positionArrow(
    anchor: DOMRect,
    boxLeft: number,
    boxWidth: number,
    offsetX: number,
    placement: 'below' | 'above' | 'overlay',
  ): void {
    const anchorLeft = anchor.left + offsetX;
    const anchorRight = anchorLeft + anchor.width;
    const hasHorizontalOverlap = anchorRight >= boxLeft && anchorLeft <= boxLeft + boxWidth;

    if (this.mode === 'icon' || placement === 'overlay' || !hasHorizontalOverlap) {
      this.arrow.hidden = true;
      return;
    }

    this.arrow.hidden = false;
    this.arrow.className = `gtx-arrow ${placement === 'below' ? 'gtx-arrow-top' : 'gtx-arrow-bottom'}`;

    const anchorCenter = anchorLeft + anchor.width / 2;
    const rawLeft = anchorCenter - boxLeft - ARROW_SIZE / 2;
    const minLeft = 12;
    const maxLeft = boxWidth - ARROW_SIZE - 12;
    const arrowLeft = maxLeft < minLeft ? (boxWidth - ARROW_SIZE) / 2 : Math.max(minLeft, Math.min(rawLeft, maxLeft));

    this.arrow.style.left = `${Math.round(arrowLeft)}px`;
  }

  private buildHeader(state: BubbleState): HTMLElement {
    const header = el('div', 'gtx-header');
    const sourceLabel = formatLangLabel(state.result?.sourceLang || state.sourceLang || 'auto');
    const targetLabel = formatLangLabel(state.result?.targetLang || state.targetLang);

    header.appendChild(el('span', 'gtx-lang', `${sourceLabel} → ${targetLabel}`));
    header.appendChild(this.buildCloseButton());
    return header;
  }

  private buildCloseButton(): HTMLButtonElement {
    const close = el('button', 'gtx-close');
    close.type = 'button';
    close.title = t('close');
    close.setAttribute('aria-label', t('close'));
    close.innerHTML = CLOSE_SVG;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.onClose();
    });

    return close;
  }

  /** 底部固定栏：左侧朗读与复制，右侧外链入口 */
  private buildFooter(state: BubbleState, translatedText: string): HTMLElement {
    const footer = el('div', 'gtx-footer');
    const actions = el('div', 'gtx-actions');

    if (!state.failed && state.result && !state.result.isError) {
      const result = state.result;
      const sourceButton = this.buildAudioButton(result.sourceLang, state.original, t('playOriginal'));
      if (sourceButton) actions.appendChild(sourceButton);

      const spokenTarget = result.text || state.original;
      if (spokenTarget !== state.original) {
        const targetButton = this.buildAudioButton(result.targetLang, spokenTarget, t('playTranslation'));
        if (targetButton) actions.appendChild(targetButton);
      }

      if (translatedText) actions.appendChild(this.buildCopyButton(translatedText));
    }

    if (actions.childElementCount > 0) footer.appendChild(actions);

    const more = el('a', 'gtx-link', t('openInTranslate'));
    more.href = getTranslateUrl(state.sourceLang || 'auto', state.targetLang, state.original, 'gtx');
    more.target = '_blank';
    more.rel = 'noreferrer';
    more.addEventListener('click', (event) => event.stopPropagation());
    footer.appendChild(more);

    return footer;
  }

  /** 朗读按钮：语言不支持时不显示；超长时置灰保留标签并在提示中说明原因 */
  private buildAudioButton(lang: string, text: string, label: string): HTMLButtonElement | null {
    const reason = speechBlockReason(lang, text);
    if (reason === 'empty' || reason === 'unsupportedLang') return null;

    const button = el('button', 'gtx-action');
    button.type = 'button';

    const textNode = el('span', undefined, label);
    button.innerHTML = SPEAKER_SVG;
    button.appendChild(textNode);

    if (reason === 'tooLong') {
      button.title = `${label} (${t('tooLongToSpeak', SPEECH_MAX_LENGTH)})`;
      button.disabled = true;
      button.classList.add('gtx-action-disabled');
      return button;
    }

    button.title = label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.onPlay(lang, text);
    });

    return button;
  }

  private buildCopyButton(text: string): HTMLButtonElement {
    const button = el('button', 'gtx-action gtx-copy');
    button.type = 'button';
    button.title = t('copyTranslation');

    const label = el('span', undefined, t('copyTranslation'));
    button.innerHTML = COPY_SVG;
    button.appendChild(label);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      void writeClipboard(text).then((ok) => {
        if (!ok || !button.isConnected) return;
        this.clearCopyTimer();
        button.classList.add('gtx-action-active');
        button.innerHTML = CHECK_SVG;
        label.textContent = t('copied');
        button.appendChild(label);

        this.copyTimer = window.setTimeout(() => {
          this.copyTimer = 0;
          if (!button.isConnected) return;
          button.classList.remove('gtx-action-active');
          button.innerHTML = COPY_SVG;
          label.textContent = t('copyTranslation');
          button.appendChild(label);
        }, COPY_FEEDBACK_MS);
      });
    });

    return button;
  }

  /** 原文或译文较长时采用宽版阅读布局，加载与结果保持同一判断规则 */
  private setReadingLayout(state: BubbleState): void {
    const textLength = Math.max(cleanText(state.original).length, cleanText(state.result?.text ?? '').length);
    this.box.classList.toggle('gtx-box-long', textLength > LONG_TEXT_CHARS);
  }

  private clearCopyTimer(): void {
    if (!this.copyTimer) return;
    window.clearTimeout(this.copyTimer);
    this.copyTimer = 0;
  }

  private reset(): void {
    this.clearCopyTimer();
    this.box.classList.remove('gtx-box-icon', 'gtx-box-long');
    this.arrow.hidden = false;
    this.iconButton = null;
    this.box.replaceChildren(this.arrow);
  }
}
