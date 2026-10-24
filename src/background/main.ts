/** 后台 service worker：右键菜单、语言检测中转、音频播放调度、选项变更广播 */

import { BUBBLE_PORT_NAME, OFFSCREEN_PATH, sendRuntime } from '../shared/messages';
import type { DetectedLanguageMessage, RuntimeMessage, SettingsChangedMessage } from '../shared/messages';
import { defaultSettings, loadSettings } from '../shared/settings';
import type { Settings } from '../shared/settings';
import { t } from '../shared/i18n';
import { getImageTranslateUrl, getTranslateUrl } from '../shared/urls';

const CONTEXT_MENU_ID = 'translate';
const AUDIO_TARGET = 'offscreen';

let settings: Settings = defaultSettings();
let settingsReady = loadSettings().then((loaded) => {
  settings = loaded;
});

/** 等选项加载完成，避免监听器在初始化竞态里读到默认值 */
async function getSettings(): Promise<Settings> {
  await settingsReady;
  return settings;
}

/** 逐字段比较，避免依赖键顺序 */
function isSettingsChanged(prev: Settings, next: Settings): boolean {
  return (
    prev.targetLang !== next.targetLang
    || prev.showBubble !== next.showBubble
    || prev.detectLanguage !== next.detectLanguage
    || prev.addImageContextMenu !== next.addImageContextMenu
  );
}

async function rebuildContextMenu(): Promise<void> {
  const current = await getSettings();
  const contexts: chrome.contextMenus.ContextType[] = ['selection'];

  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: t('translate'),
        contexts: current.addImageContextMenu ? [...contexts, 'image'] : contexts,
      },
      () => void chrome.runtime.lastError,
    );
  });
}

chrome.runtime.onInstalled.addListener(() => void rebuildContextMenu());
chrome.runtime.onStartup.addListener(() => void rebuildContextMenu());

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  if (settings.addImageContextMenu && info.mediaType === 'image' && info.srcUrl) {
    void chrome.tabs.create({
      url: getImageTranslateUrl('auto', settings.targetLang, 'en', info.srcUrl),
    });
    return;
  }

  if (!info.selectionText) return;

  void chrome.tabs.create({
    url: getTranslateUrl('auto', settings.targetLang, info.selectionText, 'gtx_c'),
  });
});

/* ---------------- offscreen 音频文档 ---------------- */

let creatingOffscreen: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

/** 保证 offscreen 文档存在，重复调用共享同一个创建流程 */
async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
      justification: 'Play TTS audio',
    })
    .catch((error: unknown) => {
      // 文档没建成时朗读会彻底无声，必须留痕
      console.error('[gtx] 创建 offscreen 文档失败', error);
    })
    .finally(() => {
      creatingOffscreen = null;
    });

  return creatingOffscreen;
}

function forwardToOffscreen(message: RuntimeMessage): void {
  chrome.runtime.sendMessage({ ...message, target: AUDIO_TARGET }, () => {
    const error = chrome.runtime.lastError;
    if (error) console.warn('[gtx] 音频消息未被 offscreen 接收：', error.message);
  });
}

/* ---------------- 消息路由 ---------------- */

async function detectLanguageForTab(tabId: number): Promise<void> {
  const lang = await chrome.tabs.detectLanguage(tabId).catch(() => 'und');
  const reply: DetectedLanguageMessage = { type: 'detectedLanguage', lang };
  chrome.tabs.sendMessage(tabId, reply, () => void chrome.runtime.lastError);
}

function broadcastSettings(): void {
  const message: SettingsChangedMessage = { type: 'settingsChanged', settings };

  chrome.tabs.query({}, (tabs) => {
    void chrome.runtime.lastError;
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      chrome.tabs.sendMessage(tab.id, message, () => void chrome.runtime.lastError);
    }
  });
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  // 带 target 的消息是发给 offscreen 的，后台不重复处理
  if ((message as { target?: string }).target === AUDIO_TARGET) return false;

  switch (message.type) {
    case 'detectLanguage':
      if (sender.tab?.id !== undefined) void detectLanguageForTab(sender.tab.id);
      break;
    case 'playAudio':
      void ensureOffscreenDocument().then(() => forwardToOffscreen(message));
      break;
    case 'pauseAudio':
      void ensureOffscreenDocument().then(() => forwardToOffscreen(message));
      break;
    default:
      break;
  }

  sendResponse({ ok: true });
  return false;
});

/** 气泡页面卸载时停止音频，避免声音残留 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== BUBBLE_PORT_NAME) return;
  port.onDisconnect.addListener(() => sendRuntime({ type: 'pauseAudio' }));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  void loadSettings().then((loaded) => {
    const menuChanged = loaded.addImageContextMenu !== settings.addImageContextMenu;
    const changed = isSettingsChanged(settings, loaded);
    settings = loaded;

    if (menuChanged) void rebuildContextMenu();
    if (changed) broadcastSettings();
  });
});
