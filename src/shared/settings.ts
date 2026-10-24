/** 用户选项：集中读写 chrome.storage.local，并带内存缓存 */

/** 选中文本后的行为 */
export const ShowBubble = {
  NONE: '0',
  ICON: '1',
  BUBBLE: '2',
} as const;

export type ShowBubbleValue = (typeof ShowBubble)[keyof typeof ShowBubble];

export interface Settings {
  targetLang: string;
  showBubble: ShowBubbleValue;
  detectLanguage: boolean;
  /** 右键菜单是否包含图片翻译 */
  addImageContextMenu: boolean;
}

const STORAGE_KEYS = {
  targetLang: 'targetLang',
  showBubble: 'showBubble',
  detectLanguage: 'detectLanguage',
  addImageContextMenu: 'addImageContextMenu',
} as const;

/** 浏览器界面语言，去掉地区后缀，作为“我的主要语言”的初始值 */
export function browserLanguage(): string {
  const ui = globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? 'en';
  const normalized = ui.toLowerCase().replace('_', '-');

  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hant') || normalized.startsWith('zh-hk')) {
    return 'zh-TW';
  }
  if (normalized.startsWith('zh')) return 'zh-CN';

  const dash = normalized.indexOf('-');
  return dash >= 0 ? normalized.slice(0, dash) : normalized;
}

export function defaultSettings(): Settings {
  return {
    targetLang: browserLanguage(),
    showBubble: ShowBubble.BUBBLE,
    detectLanguage: true,
    addImageContextMenu: false,
  };
}

/** 把存储中的任意值收敛为合法选项 */
export function normalizeSettings(raw: Record<string, unknown>): Settings {
  const base = defaultSettings();

  if (typeof raw[STORAGE_KEYS.targetLang] === 'string') base.targetLang = raw[STORAGE_KEYS.targetLang] as string;

  const showBubble = raw[STORAGE_KEYS.showBubble];
  if (showBubble === ShowBubble.NONE || showBubble === ShowBubble.ICON || showBubble === ShowBubble.BUBBLE) {
    base.showBubble = showBubble;
  }

  if (typeof raw[STORAGE_KEYS.detectLanguage] === 'boolean') {
    base.detectLanguage = raw[STORAGE_KEYS.detectLanguage] as boolean;
  }
  if (typeof raw[STORAGE_KEYS.addImageContextMenu] === 'boolean') {
    base.addImageContextMenu = raw[STORAGE_KEYS.addImageContextMenu] as boolean;
  }


  return base;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(null);
  return normalizeSettings(stored as Record<string, unknown>);
}

/** 尚未保存过任何选项时，用浏览器语言作为主要语言 */
export async function loadSettingsWithBootstrap(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(null)) as Record<string, unknown>;
  const settings = normalizeSettings(stored);

  if (!(STORAGE_KEYS.targetLang in stored)) {
    settings.targetLang = browserLanguage();
    await saveSettings(settings);
  }

  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.targetLang]: settings.targetLang,
    [STORAGE_KEYS.showBubble]: settings.showBubble,
    [STORAGE_KEYS.detectLanguage]: settings.detectLanguage,
    [STORAGE_KEYS.addImageContextMenu]: settings.addImageContextMenu,
  });
}

/** 监听选项变更，变更后回调最新设置，用于各页面实时同步 */
export function watchSettings(onChange: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.keys(changes).some((key) => key in STORAGE_KEYS)) return;

    void loadSettings().then(onChange);
  });
}
