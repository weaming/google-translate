/** 工具栏弹窗：输入即翻译，支持语言切换与朗读 */

import { t } from '../shared/i18n';
import { sendRuntime } from '../shared/messages';
import { localizeLanguages } from '../shared/lang';
import type { PageTranslateResult } from '../shared/page-translate';
import {
  FALLBACK_LANGUAGES,
  SPEECH_MAX_LENGTH,
  fetchSpeech,
  fetchSupportedLanguages,
  readCachedLanguages,
  speechBlockReason,
  translate,
  writeCachedLanguages,
} from '../shared/translate-api';
import type { LanguageOption, Sentence, TranslationResult } from '../shared/translate-api';
import { loadSettingsWithBootstrap, saveSettings } from '../shared/settings';
import type { Settings } from '../shared/settings';
import { getTranslateUrl } from '../shared/urls';

const DEBOUNCE_MS = 400;
const AUTO_LANG = 'auto';

/** 用内联 SVG 取代符号字符，避免缺字字体把它渲染成方框或菱形 */
const RESET_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';

const SWAP_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>';

const SPEAKER_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>';

interface Elements {
  input: HTMLInputElement;
  reset: HTMLButtonElement;
  sourceSelect: HTMLSelectElement;
  swap: HTMLButtonElement;
  targetSelect: HTMLSelectElement;
  translation: HTMLElement;
  resultText: HTMLElement;
  resultSentences: HTMLElement;
  playAudio: HTMLButtonElement;
  translatePage: HTMLButtonElement;
  pageStatus: HTMLElement;
  optionsLink: HTMLAnchorElement;
}

function queryElements(): Elements {
  const pick = <T extends HTMLElement>(id: string): T => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`缺少元素 #${id}`);
    return node as T;
  };

  return {
    input: pick<HTMLInputElement>('text-input'),
    reset: pick<HTMLButtonElement>('new-translation'),
    sourceSelect: pick<HTMLSelectElement>('source-lang'),
    swap: pick<HTMLButtonElement>('swap-lang'),
    targetSelect: pick<HTMLSelectElement>('target-lang'),
    translation: pick('translation'),
    resultText: pick('result-text'),
    resultSentences: pick('result-sentences'),
    playAudio: pick<HTMLButtonElement>('play-audio'),
    translatePage: pick<HTMLButtonElement>('translate-page'),
    pageStatus: pick('page-status'),
    optionsLink: pick<HTMLAnchorElement>('options-link'),
  };
}

/** 图标 + 文字：避免用符号字符，也避免 SVG 被 textContent 清掉 */
function setIconLabel(node: HTMLElement, svg: string, label: string): void {
  node.replaceChildren();
  node.insertAdjacentHTML('afterbegin', svg);
  node.appendChild(document.createTextNode(label));
}

function fillSelect(select: HTMLSelectElement, options: LanguageOption[], selected: string): void {
  select.replaceChildren();

  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.code;
    node.textContent = option.name;
    if (option.code === selected) node.selected = true;
    select.appendChild(node);
  }
}

function renderSentences(sentences: Sentence[]): DocumentFragment | null {
  const meaningful = sentences.filter((item) => item.orig && item.trans && item.orig !== item.trans);
  if (meaningful.length <= 1) return null;

  const fragment = document.createDocumentFragment();
  for (const item of meaningful) {
    const line = document.createElement('div');
    line.className = 'gtx-line';

    const orig = document.createElement('div');
    orig.className = 'gtx-line-orig';
    orig.textContent = item.orig;

    const trans = document.createElement('div');
    trans.className = 'gtx-line-trans';
    trans.textContent = item.trans;

    line.append(orig, trans);
    fragment.appendChild(line);
  }

  return fragment;
}

/** 弹窗主控制器 */
class PopupController {
  private settings: Settings | null = null;
  private languages: LanguageOption[] = [];
  private timer = 0;
  private requestSeq = 0;
  private lastResult: TranslationResult | null = null;
  /** 当前页是否已翻译，决定按钮行为 */
  private pageTranslated = false;

  constructor(private readonly elements: Elements) {}

  async start(): Promise<void> {
    this.bindStaticText();
    this.bindEvents();
    this.settings = await loadSettingsWithBootstrap();

    await this.loadLanguages();
    await this.syncPageState();
    await this.focusActiveTabSelection();

    this.elements.input.focus();
  }

  private bindStaticText(): void {
    const { elements } = this;

    elements.input.placeholder = t('sourcePlaceholder');
    elements.reset.title = t('translate');
    elements.reset.innerHTML = RESET_SVG;
    elements.swap.innerHTML = SWAP_SVG;
    elements.translatePage.textContent = t('translatePage');
    elements.optionsLink.textContent = t('footerOptions');
    elements.swap.title = t('swapLanguages');
    setIconLabel(elements.playAudio, SPEAKER_SVG, t('playOriginal'));
  }

  private bindEvents(): void {
    const { elements } = this;

    elements.input.addEventListener('input', () => this.scheduleTranslate());

    elements.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        window.clearTimeout(this.timer);
        void this.doTranslate();
      }
    });

    elements.reset.addEventListener('click', () => {
      elements.input.value = '';
      this.clearResult();
      elements.input.focus();
    });

    elements.sourceSelect.addEventListener('change', () => void this.doTranslate());
    elements.targetSelect.addEventListener('change', () => void this.onTargetLangChange());
    elements.swap.addEventListener('click', () => this.swapLanguages());

    elements.playAudio.addEventListener('click', () => void this.playAudio());

    elements.translatePage.addEventListener('click', () => {
      // 单一入口按状态分派，避免 addEventListener 与 onclick 同时生效
      if (this.pageTranslated) void this.restoreActivePage();
      else void this.translateActivePage();
    });

    elements.optionsLink.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
      window.close();
    });

  }

  /**
   * 立即用缓存或内置列表填充下拉框，界面无需等待网络；
   * 随后在后台更新缓存，下次打开即可用上最新列表。
   */
  private async loadLanguages(): Promise<void> {
    const settings = this.settings ?? (await loadSettingsWithBootstrap());
    const detectLabel = t('detectLanguage');

    const cached = await readCachedLanguages();
    this.languages = localizeLanguages(cached ?? FALLBACK_LANGUAGES, detectLabel);
    this.renderLanguageSelects(settings.targetLang);

    // 后台刷新，不阻塞界面
    void fetchSupportedLanguages('zh_CN')
      .then(async (fresh) => {
        await writeCachedLanguages(fresh);
        this.languages = localizeLanguages(fresh, detectLabel);
        this.renderLanguageSelects(this.elements.targetSelect.value || settings.targetLang);
      })
      .catch(() => undefined);
  }

  /** 按当前语言列表重绘两个下拉框，尽量保留已选值 */
  private renderLanguageSelects(selectedTarget: string): void {
    const { sourceSelect, targetSelect } = this.elements;
    const currentSource = sourceSelect.value || 'auto';
    const currentTarget = targetSelect.value || selectedTarget;

    fillSelect(sourceSelect, this.languages, currentSource);
    fillSelect(targetSelect, this.languages.filter((item) => item.code !== 'auto'), currentTarget);
  }

  /** 若当前标签页有选中文本，作为初始查询 */
  private async focusActiveTabSelection(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;

    const results = await chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString().trim() ?? '',
      })
      .catch(() => []);

    const text = typeof results[0]?.result === 'string' ? results[0].result : '';
    if (!text) return;

    this.elements.input.value = text;
    await this.doTranslate();
  }

  private scheduleTranslate(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.doTranslate(), DEBOUNCE_MS);
  }

  /** 打开弹窗时同步页面是否已翻译，让按钮文案与页面状态一致 */
  private async syncPageState(): Promise<void> {
    const tabId = await this.activeTabId();
    if (tabId === null) return;

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => Boolean(document.querySelector('[data-gtx-done]')),
      });

      this.setPageTranslated(Boolean(result?.result));
    } catch {
      // 受限页面无法探测，保持默认文案
    }
  }

  /** 取当前活动标签页，拿不到 id 说明是不可注入的页面 */
  private async activeTabId(): Promise<number | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  }

  /**
   * 翻译或还原当前页面。
   * 先确认页面里已注入内容脚本，脚本不在时提示用户刷新。
   */
  private async translateActivePage(): Promise<void> {
    const tabId = await this.activeTabId();
    if (tabId === null) {
      this.showPageStatus(t('translatePageFail'), true);
      return;
    }

    const { translatePage } = this.elements;
    translatePage.disabled = true;

    try {
      const injected = await chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => Boolean((globalThis as { __gtxInjected?: boolean }).__gtxInjected),
        })
        .catch(() => []);

      if (!injected[0]?.result) {
        this.showPageStatus(t('pageNeedsReload'), true);
        return;
      }

      const result = (await chrome.tabs.sendMessage(tabId, { type: 'translatePage' })) as
        | PageTranslateResult
        | undefined;

      this.renderPageResult(result);
    } catch {
      this.showPageStatus(t('translatePageFail'), true);
    } finally {
      translatePage.disabled = false;
    }
  }

  private renderPageResult(result: PageTranslateResult | undefined): void {
    const { translatePage } = this.elements;

    if (!result || !result.ok) {
      this.showPageStatus(t('translatePageFail'), true);
      return;
    }

    if (result.alreadyDone) {
      this.setPageTranslated(true);
      this.showPageStatus(t('translatePageAlreadyDone'), false);
      return;
    }

    if (result.count === 0) {
      this.showPageStatus(t('translatePageEmpty'), false);
      return;
    }

    this.setPageTranslated(true);
    this.showPageStatus(t('translatePageDone', result.count), false);
  }

  /** 切换按钮文案与内部状态 */
  private setPageTranslated(translated: boolean): void {
    this.pageTranslated = translated;
    this.elements.translatePage.textContent = translated ? t('restorePage') : t('translatePage');
  }

  private async restoreActivePage(): Promise<void> {
    const tabId = await this.activeTabId();
    if (tabId === null) return;

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'restorePage' });
      this.showPageStatus(t('pageRestored'), false);
    } catch {
      this.showPageStatus(t('translatePageFail'), true);
    }

    this.setPageTranslated(false);
  }

  private showPageStatus(text: string, isError: boolean): void {
    const { pageStatus } = this.elements;
    pageStatus.textContent = text;
    pageStatus.classList.toggle('is-error', isError);
  }

  private currentSourceLang(): string {
    return this.elements.sourceSelect.value || AUTO_LANG;
  }

  private async doTranslate(): Promise<void> {
    const text = this.elements.input.value.trim();
    const target = this.settings?.targetLang ?? this.elements.targetSelect.value;

    if (!text) {
      this.clearResult();
      return;
    }

    const seq = ++this.requestSeq;
    this.elements.translation.hidden = false;
    this.elements.resultText.classList.remove('is-error');
    this.elements.resultText.textContent = '…';
    this.elements.resultSentences.replaceChildren();
    this.elements.playAudio.hidden = true;

    const result = await translate(text, this.currentSourceLang(), target, 'en');
    if (seq !== this.requestSeq) return;

    this.lastResult = result;
    this.renderResult(result, text);
  }

  private renderResult(result: TranslationResult, original: string): void {
    const { elements } = this;

    if (result.isError) {
      elements.resultText.classList.add('is-error');
      elements.resultText.textContent = t('translationError');
      elements.resultSentences.replaceChildren();
      elements.playAudio.hidden = true;
      return;
    }

    elements.resultText.classList.remove('is-error');
    elements.resultText.textContent = result.text || original;

    const sentences = renderSentences(result.sentences);
    if (sentences && result.text.trim() !== original.trim()) {
      elements.resultSentences.replaceChildren(sentences);
    } else {
      elements.resultSentences.replaceChildren();
    }

    this.updatePlayButton(result, original);
  }

  /** 朗读按钮：可朗读时可用，超长时置灰并说明原因 */
  private updatePlayButton(result: TranslationResult, original: string): void {
    const { playAudio } = this.elements;
    const reason = speechBlockReason(result.sourceLang, original);

    if (reason === 'empty' || reason === 'unsupportedLang') {
      playAudio.hidden = true;
      return;
    }

    playAudio.hidden = false;
    playAudio.disabled = reason === 'tooLong';
    setIconLabel(
      playAudio,
      SPEAKER_SVG,
      reason === 'tooLong'
        ? t('tooLongToSpeak', SPEECH_MAX_LENGTH)
        : t('playOriginal'),
    );
  }

  private clearResult(): void {
    const { elements } = this;

    elements.translation.hidden = true;
    elements.resultText.textContent = '';
    elements.resultSentences.replaceChildren();
    elements.playAudio.hidden = true;
    this.lastResult = null;
  }

  private async onTargetLangChange(): Promise<void> {
    if (!this.settings) return;

    this.settings = { ...this.settings, targetLang: this.elements.targetSelect.value };
    await saveSettings(this.settings);
    await this.doTranslate();
  }

  private swapLanguages(): void {
    const source = this.currentSourceLang();
    const target = this.settings?.targetLang ?? this.elements.targetSelect.value;
    if (source === AUTO_LANG) return;

    const translated = this.lastResult?.text ?? '';

    this.elements.sourceSelect.value = target;
    this.elements.targetSelect.value = source;
    if (translated) this.elements.input.value = translated;

    void this.onTargetLangChange();
  }

  private async playAudio(): Promise<void> {
    const result = this.lastResult;
    const text = this.elements.input.value.trim();
    if (!result || !text) return;

    const audioSrc = await fetchSpeech(result.sourceLang || 'auto', text);
    if (!audioSrc) return;

    sendRuntime({ type: 'playAudio', audioSrc, text });
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const controller = new PopupController(queryElements());
    void controller.start();
  });
}
