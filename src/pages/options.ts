/** 选项页：目标语言、选中文本行为、语言检测开关 */

import { t } from '../shared/i18n';
import { localizeLanguages } from '../shared/lang';
import {
  FALLBACK_LANGUAGES,
  fetchSupportedLanguages,
  readCachedLanguages,
  writeCachedLanguages,
} from '../shared/translate-api';
import type { LanguageOption } from '../shared/translate-api';
import { defaultSettings, loadSettingsWithBootstrap, saveSettings } from '../shared/settings';
import type { Settings, ShowBubbleValue } from '../shared/settings';
import { PRIVACY_URL, TRANSLATE_HOME_URL } from '../shared/urls';

const STATUS_VISIBLE_MS = 2000;

interface Elements {
  targetSelect: HTMLSelectElement;
  detectLanguage: HTMLInputElement;
  imageMenu: HTMLInputElement;
  reset: HTMLButtonElement;
  status: HTMLElement;
}

function pick<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少元素 #${id}`);
  return node as T;
}

function queryElements(): Elements {
  return {
    targetSelect: pick<HTMLSelectElement>('targetLangSel'),
    detectLanguage: pick<HTMLInputElement>('detectLanguage'),
    imageMenu: pick<HTMLInputElement>('addImageContextMenu'),
    reset: pick<HTMLButtonElement>('resetBtn'),
    status: pick('saveStatus'),
  };
}

function localizedText(key: string): string {
  const api = globalThis.chrome?.i18n;
  return api?.getMessage(key) || key;
}

function fillTargetLanguages(select: HTMLSelectElement, languages: LanguageOption[], selected: string): void {
  select.replaceChildren();

  for (const language of languages) {
    if (language.code === 'auto') continue;
    const option = document.createElement('option');
    option.value = language.code;
    option.textContent = language.name;
    option.selected = language.code === selected;
    select.appendChild(option);
  }
}

function selectedShowBubble(): ShowBubbleValue {
  const checked = document.querySelector<HTMLInputElement>('input[name="showBubble"]:checked');
  const value = checked?.value;
  return value === '1' || value === '0' ? value : '2';
}

function checkShowBubble(value: ShowBubbleValue): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="showBubble"][value="${value}"]`);
  if (input) input.checked = true;
}

function applySettings(elements: Elements, settings: Settings): void {
  elements.targetSelect.value = settings.targetLang;
  elements.detectLanguage.checked = settings.detectLanguage;
  elements.imageMenu.checked = settings.addImageContextMenu;
  checkShowBubble(settings.showBubble);
}

function collectSettings(elements: Elements): Settings {
  return {
    targetLang: elements.targetSelect.value || defaultSettings().targetLang,
    showBubble: selectedShowBubble(),
    detectLanguage: elements.detectLanguage.checked,
    addImageContextMenu: elements.imageMenu.checked,
  };
}

function bindStaticText(): void {
  document.title = localizedText('optionsPageTitle');
  pick('options-title-heading').textContent = localizedText('optionsTitle');
  pick('lang-option').textContent = localizedText('optionsLang');
  pick('popup-option').textContent = localizedText('optionsPopupTitle');
  pick('popup-option-desc').textContent = localizedText('optionsPopupDesc');
  pick('popup-option-tip').textContent = localizedText('optionsPopupTip');
  pick('icon-option-desc').textContent = localizedText('optionsIconDesc');
  pick('none-option-desc').textContent = localizedText('optionsNoneDesc');
  pick('none-option-tip').textContent = localizedText('optionsNoneTip');
  pick('detect-language-option').textContent = localizedText('optionsAlwaysShowIcon');
  pick('image-menu-option').textContent = localizedText('optionsImageMenu');
  pick('resetBtn').textContent = localizedText('optionsReset');

  const homepage = pick<HTMLAnchorElement>('footer-homepage');
  homepage.textContent = localizedText('optionsFooterHomepage');
  homepage.href = TRANSLATE_HOME_URL;

  const privacy = pick<HTMLAnchorElement>('footer-privacy');
  privacy.textContent = localizedText('optionsFooterPrivacy');
  privacy.href = PRIVACY_URL;

  pick('year').textContent = String(new Date().getFullYear());
}

async function start(): Promise<void> {
  bindStaticText();

  const elements = queryElements();
  const settings = await loadSettingsWithBootstrap();

  const detectLabel = localizedText('detectLanguage');

  // 先用缓存立即渲染，页面不必等网络
  const cached = await readCachedLanguages();
  fillTargetLanguages(
    elements.targetSelect,
    localizeLanguages(cached ?? FALLBACK_LANGUAGES, detectLabel),
    settings.targetLang,
  );
  applySettings(elements, settings);

  // 后台刷新语言列表
  void fetchSupportedLanguages('zh_CN')
    .then(async (fresh) => {
      await writeCachedLanguages(fresh);
      const selected = elements.targetSelect.value || settings.targetLang;
      fillTargetLanguages(elements.targetSelect, localizeLanguages(fresh, detectLabel), selected);
    })
    .catch(() => undefined);

  bindAutoSave(elements);

  elements.reset.addEventListener('click', () => {
    const defaults = defaultSettings();
    applySettings(elements, defaults);
    void persist(elements, defaults);
  });
}

/** 任何选项变更即保存，不再需要保存按钮 */
function bindAutoSave(elements: Elements): void {
  const save = () => void persist(elements, collectSettings(elements));

  elements.targetSelect.addEventListener('change', save);
  elements.detectLanguage.addEventListener('change', save);
  elements.imageMenu.addEventListener('change', save);

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="showBubble"]')) {
    radio.addEventListener('change', save);
  }
}

let statusTimer = 0;

/** 保存并短暂显示“已保存”提示 */
async function persist(elements: Elements, settings: Settings): Promise<void> {
  await saveSettings(settings);

  elements.status.textContent = t('optionsSavedStatus');
  elements.status.hidden = false;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    elements.status.hidden = true;
  }, STATUS_VISIBLE_MS);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => void start());
}
