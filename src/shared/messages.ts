/** 各上下文（后台、内容脚本、弹窗、offscreen）之间的消息协议 */

import type { Settings, ShowBubbleValue } from './settings';

/** 内容脚本刷新本地选项副本 */
export interface SettingsChangedMessage {
  type: 'settingsChanged';
  settings: Settings;
}

/** 内容脚本请求后台调用 tabs.detectLanguage */
export interface DetectLanguageMessage {
  type: 'detectLanguage';
}

/** 后台检测完成后回传给内容脚本的检测结果 */
export interface DetectedLanguageMessage {
  type: 'detectedLanguage';
  lang: string;
}

/** 任一上下文请求播放音频（offscreen 承接） */
export interface PlayAudioMessage {
  type: 'playAudio';
  audioSrc: string;
  text: string;
}

/** 停止音频播放 */
export interface PauseAudioMessage {
  type: 'pauseAudio';
}

/** popup 请求内容脚本翻译整页 */
export interface TranslatePageMessage {
  type: 'translatePage';
}

/** popup 请求内容脚本还原整页 */
export interface RestorePageMessage {
  type: 'restorePage';
}

export type RuntimeMessage =
  | SettingsChangedMessage
  | DetectLanguageMessage
  | DetectedLanguageMessage
  | PlayAudioMessage
  | PauseAudioMessage
  | TranslatePageMessage
  | RestorePageMessage;

export const OFFSCREEN_PATH = 'offscreen.html';

/** 内容脚本悬挂点：它的存亡用于判断气泡是否还活着 */
export const BUBBLE_PORT_NAME = 'gtx-bubble';

export function sendRuntime(message: RuntimeMessage): void {
  try {
    chrome.runtime.sendMessage(message, () => {
      // 无接收方时会设置 lastError，这里主动消费避免未捕获告警
      void chrome.runtime.lastError;
    });
  } catch {
    // 扩展被重新加载或页面受限时 sendMessage 会同步抛出
  }
}

export function isShowBubbleValue(value: unknown): value is ShowBubbleValue {
  return value === '0' || value === '1' || value === '2';
}
