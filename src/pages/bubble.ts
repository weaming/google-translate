/** 内容脚本入口：监听选区、判定语言、翻译并驱动气泡 */

import { BUBBLE_PORT_NAME, sendRuntime } from '../shared/messages';
import type { DetectedLanguageMessage, RuntimeMessage, SettingsChangedMessage } from '../shared/messages';
import { t } from '../shared/i18n';
import { MAX_SELECTION_LENGTH, selectionIssue } from '../shared/selection';
import { isTargetLang, normLang } from '../shared/lang';
import { hasPageTranslation, removePageTranslation, translatePage } from '../shared/page-translate';
import type { PageTranslateResult } from '../shared/page-translate';
import { defaultSettings, loadSettings, watchSettings } from '../shared/settings';
import type { Settings } from '../shared/settings';
import { fetchSpeech, translate } from '../shared/translate-api';
import { BubbleView } from './bubble-view';
import type { BubbleState } from './bubble-view';

const HOST_ID = 'gtx-trans';
const SHOW_DELAY_MS = 60;

let settings: Settings = defaultSettings();
const settingsReady = loadSettings().then((loaded) => {
  settings = loaded;
});

let view: BubbleView | null = null;
let pendingTimer = 0;
let lastMouseEvent: MouseEvent | null = null;
/** 当前已翻译或正在翻译的选区文本，避免重复请求 */
let activeText = '';
let isExpanded = false;

/** 输入框内的选择交给页面自身处理 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

function isInsideBubble(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => node instanceof HTMLElement && (node.id === HOST_ID || node.id === `${HOST_ID}-shadow`));
}

/** 选区包围盒，退化到鼠标坐标 */
function getAnchorRect(selection: Selection | null, event: MouseEvent | null): DOMRect {
  if (selection && selection.rangeCount > 0) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.width || rect.height) return rect;
  }

  return new DOMRect(event?.clientX ?? window.innerWidth / 2, event?.clientY ?? window.innerHeight / 2, 0, 0);
}

/** 页面 lang 属性给出的语言，没有则视为未知 */
export function detectPageLang(): string {
  return normLang(document.documentElement.lang || '');
}

/** 在当前设置下，该语言是否无需翻译 */
function isMyLanguage(lang: string): boolean {
  return isTargetLang(settings.targetLang, lang);
}

function disposeBubble(stopAudio = true): void {
  window.clearTimeout(pendingTimer);
  pendingTimer = 0;

  view?.unmount();
  view = null;
  activeText = '';
  isExpanded = false;

  if (stopAudio) sendRuntime({ type: 'pauseAudio' });
}

async function playAudio(lang: string, text: string): Promise<void> {
  const audioSrc = await fetchSpeech(lang, text);
  if (audioSrc) sendRuntime({ type: 'playAudio', audioSrc, text });
}

function ensureView(): BubbleView {
  if (view) return view;

  view = new BubbleView({
    onClose: () => disposeBubble(),
    onExpand: () => {
      isExpanded = true;
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? activeText;
      if (text) void runTranslate(text, selection, lastMouseEvent, true);
    },
    onPlay: (lang, text) => void playAudio(lang, text),
  });

  return view;
}

async function runTranslate(
  text: string,
  selection: Selection | null,
  event: MouseEvent | null,
  forceExpand = false,
): Promise<void> {
  await settingsReady;

  const anchor = getAnchorRect(selection, event);
  const sourceLang = detectPageLang();
  const bubble = ensureView();

  activeText = text;

  const state: BubbleState = {
    sourceLang,
    targetLang: settings.targetLang,
    original: text,
    result: null,
    failed: false,
  };

  // 图标模式：先只放图标，用户点击后才翻译
  if (!forceExpand && settings.showBubble === '1') {
    bubble.renderIcon();
    bubble.position(anchor);
    return;
  }

  // 从图标展开时保持图标尺寸，等结果回来再一次性展开，避免先闪一个空白气泡
  const isIconPending = forceExpand && bubble.getMode() === 'icon';
  if (!isIconPending) {
    bubble.renderLoading(state);
    bubble.position(anchor);
  }

  const result = await translate(text, sourceLang || 'auto', settings.targetLang, 'en');
  if (!view) return;

  bubble.renderResult({
    ...state,
    sourceLang: result.sourceLang || sourceLang || 'auto',
    result,
    failed: result.isError,
  });
  bubble.position(anchor);
}

function handleSelection(): void {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';

  const issue = selectionIssue(text, window.innerWidth);

  if (issue === 'tooLong') {
    // 超长时给出明确说明，而不是静默不弹
    const bubble = ensureView();
    bubble.renderNotice(t('selectionTooLong', MAX_SELECTION_LENGTH));
    bubble.position(getAnchorRect(selection, lastMouseEvent));
    activeText = text;
    return;
  }

  if (issue !== null) {
    disposeBubble();
    return;
  }

  if (text === activeText && view?.isMounted()) return;
  if (text === activeText && pendingTimer) return;

  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    pendingTimer = 0;
    void runTranslate(text, selection, lastMouseEvent);
  }, SHOW_DELAY_MS);
}

function onMouseUp(event: MouseEvent): void {
  if (event.button !== 0) return;
  if (isInsideBubble(event)) return;
  if (isEditableTarget(event.target)) {
    disposeBubble();
    return;
  }
  if (settings.showBubble === '0') return;

  lastMouseEvent = event;
  window.setTimeout(handleSelection, 10);
}

function onMouseDown(event: MouseEvent): void {
  if (!view?.isMounted()) return;
  if (isInsideBubble(event)) return;

  // 收尾：选区即将变化，先收起旧气泡
  disposeBubble();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && view?.isMounted()) disposeBubble();
}

function onScroll(event: Event): void {
  if (!view?.isMounted()) return;
  if (isInsideBubble(event)) return;

  disposeBubble(false);
}

/* ---------------- 消息 ---------------- */

/** 选项变更后立即生效：收起旧气泡，下次划词使用新的目标语言 */
function applySettings(next: Settings): void {
  const targetChanged = next.targetLang !== settings.targetLang;
  settings = next;

  if (targetChanged || next.showBubble === '0') disposeBubble();
}

function applyDetectedLanguage(lang: string): void {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (!text) return;

  const detected = normLang(lang);
  if (isMyLanguage(detected)) {
    disposeBubble();
    return;
  }

  void runTranslate(text, selection, lastMouseEvent, isExpanded);
}

function onRuntimeMessage(message: RuntimeMessage): void {
  switch (message.type) {
    case 'settingsChanged':
      applySettings((message as SettingsChangedMessage).settings);
      break;
    case 'detectedLanguage':
      applyDetectedLanguage((message as DetectedLanguageMessage).lang);
      break;
    case 'restorePage':
      removePageTranslation();
      break;
    default:
      break;
  }
}

/** 整页翻译：popup 触发，异步回传结果 */
async function handleTranslatePage(sendResponse: (response: PageTranslateResult) => void): Promise<void> {
  await settingsReady;

  if (hasPageTranslation()) {
    sendResponse({ ok: true, count: 0, alreadyDone: true });
    return;
  }

  try {
    const count = await translatePage({ targetLang: settings.targetLang });
    sendResponse({ ok: true, count, alreadyDone: false });
  } catch (error) {
    sendResponse({ ok: false, count: 0, alreadyDone: false, error: String(error) });
  }
}

/** 页面语言未知时，请后台用 chrome.tabs.detectLanguage 帮忙判断 */
function requestLanguageDetection(): boolean {
  const pageLang = detectPageLang();
  if (pageLang && pageLang !== 'und') return false;

  sendRuntime({ type: 'detectLanguage' });
  return true;
}

function attachBubblePort(): void {
  try {
    // 端口断开即代表页面卸载，后台据此停止音频
    chrome.runtime.connect({ name: BUBBLE_PORT_NAME });
  } catch {
    // 扩展重载后残留的内容脚本
  }
}

async function init(): Promise<void> {
  // popup 用它判断内容脚本是否已注入
  (globalThis as { __gtxInjected?: boolean }).__gtxInjected = true;

  await settingsReady;
  attachBubblePort();

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === 'translatePage') {
      void handleTranslatePage(sendResponse);
      return true; // 异步响应
    }

    onRuntimeMessage(message);
    return false;
  });

  // 不依赖后台广播：service worker 休眠时也能收到选项变更
  watchSettings(applySettings);

  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onScroll, true);

  // 页面语言未知时，首次划词前先请后台检测
  requestLanguageDetection();
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void init();
}
