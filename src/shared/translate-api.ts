/** Google 翻译公共接口：文本翻译、语言列表、语音合成 */

import { textLength } from './selection';

const TRANSLATE_BASE = 'https://translate.googleapis.com';
const ONE_PLATFORM_BASE = 'https://translate-pa.googleapis.com';
const API_KEY = 'AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA';
const CLIENT = 'gtx';
const REQUEST_TIMEOUT_MS = 15_000;

/** 需要的响应数据类型 */
export const DataType = {
  TRANSLATION: 'TRANSLATION',
  SENTENCE_SPLITS: 'SENTENCE_SPLITS',
  BILINGUAL_DICTIONARY: 'BILINGUAL_DICTIONARY_FULL',
  ROMANIZATION_TARGET: 'ROMANIZATION_TARGET',
  LANGUAGE_DETECTION: 'LANGUAGE_IDENTIFICATION_SOURCE',
} as const;

export type DataTypeValue = (typeof DataType)[keyof typeof DataType];

export interface Sentence {
  orig: string;
  trans: string;
}

export interface TranslationResult {
  /** 完整译文 */
  text: string;
  /** 源语言 */
  sourceLang: string;
  /** 目标语言（服务端回显） */
  targetLang: string;
  /** 逐句原文与译文，用于逐句对照展示 */
  sentences: Sentence[];
  /** 服务端给出的罗马音，无则为空 */
  romanization: string;
  /** 是否是错误兜底结果 */
  isError: boolean;
}

export interface LanguageOption {
  code: string;
  name: string;
}

/** 语音合成只支持这些语言，且单次文本有长度上限 */
const TTS_SUPPORTED = new Set([
  'af', 'ar', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'gu', 'hi',
  'hr', 'hu', 'id', 'is', 'it', 'ja', 'jw', 'km', 'kn', 'ko', 'la', 'lv', 'ml', 'mr', 'my', 'ne', 'nl', 'no',
  'pl', 'pt', 'ro', 'ru', 'si', 'sk', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'vi', 'uk',
  'ur', 'yue', 'zh', 'zh-cn', 'zh-tw',
]);
const TTS_MAX_LENGTH = 200;

function emptyResult(): TranslationResult {
  return { text: '', sourceLang: '', targetLang: '', sentences: [], romanization: '', isError: true };
}

function errorResult(): TranslationResult {
  return { ...emptyResult(), sourceLang: 'auto' };
}

/** 带超时的 fetch，避免请求悬挂导致界面卡死 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析 /v1/translate 的 protobuf-JSON 响应。
 * 结构：["译文", [["译","原"],...], ..., [语言检测], "源语言", ...]
 */
export function parseTranslateResponse(payload: unknown[], targetLang: string): TranslationResult {
  const sentences: Sentence[] = [];
  const splits = payload[1];

  if (Array.isArray(splits)) {
    for (const item of splits) {
      if (!Array.isArray(item)) continue;
      const trans = typeof item[0] === 'string' ? item[0] : '';
      const orig = typeof item[1] === 'string' ? item[1] : '';
      sentences.push({ orig, trans });
    }
  }

  const text = typeof payload[0] === 'string' ? payload[0] : sentences.map((s) => s.trans).join('');
  const sourceLang = typeof payload[5] === 'string' && payload[5] ? payload[5] : 'auto';

  return {
    text,
    sourceLang,
    targetLang,
    sentences,
    romanization: '',
    isError: false,
  };
}

/** 翻译文本；任何失败都返回 isError 结果而不抛出，便于界面直接呈现 */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
  displayLang: string,
  dataTypes: DataTypeValue[] = [DataType.TRANSLATION, DataType.SENTENCE_SPLITS],
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ...emptyResult(), isError: false };

  const params = new URLSearchParams();
  params.set('params.client', CLIENT);
  params.set('query.source_language', sourceLang || 'auto');
  params.set('query.target_language', targetLang);
  params.set('query.display_language', displayLang || 'en');
  params.set('query.text', trimmed);
  for (const type of dataTypes) params.append('data_types', type);
  params.set('key', API_KEY);

  try {
    const res = await fetchWithTimeout(`${ONE_PLATFORM_BASE}/v1/translate?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json+protobuf' },
    });
    if (!res.ok) return errorResult();

    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) return errorResult();

    return parseTranslateResponse(payload, targetLang);
  } catch {
    return errorResult();
  }
}

/** 拉取支持的语言列表，首项为“检测语言” */
export async function fetchSupportedLanguages(displayLang: string): Promise<LanguageOption[]> {
  const params = new URLSearchParams();
  params.set('client', CLIENT);
  params.set('display_language', displayLang || 'en');
  params.set('key', API_KEY);

  const res = await fetchWithTimeout(`${ONE_PLATFORM_BASE}/v1/supportedLanguages?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json+protobuf' },
  });
  if (!res.ok) throw new Error(`supportedLanguages HTTP ${res.status}`);

  const payload: unknown = await res.json();
  const groups: unknown = Array.isArray(payload) ? payload[0] : null;
  if (!Array.isArray(groups)) throw new Error('supportedLanguages 响应格式异常');

  const options: LanguageOption[] = [];
  for (const item of groups) {
    if (!Array.isArray(item)) continue;
    const [code, name] = item;
    if (typeof code === 'string' && typeof name === 'string') options.push({ code, name });
  }

  return options;
}

export function canSpeak(lang: string, text: string): boolean {
  return speechBlockReason(lang, text) === null;
}

export const SPEECH_MAX_LENGTH = TTS_MAX_LENGTH;

/**
 * 不能朗读的原因，能朗读时返回 null。
 * 长度上限是接口的硬限制：实测上限为 200 个 UTF-16 码元，
 * 纯 ASCII/中文可放 200 个，emoji 每个占 2 个码元所以只到 100 个。
 * 计的是字符而非单词，200 个英文单词共 999 字符同样会被拒绝。
 */
export function speechBlockReason(lang: string, text: string): 'empty' | 'tooLong' | 'unsupportedLang' | null {
  const trimmed = text.trim();

  if (!trimmed) return 'empty';
  if (textLength(trimmed) > TTS_MAX_LENGTH) return 'tooLong';

  const key = lang.toLowerCase();
  if (!key || key === 'auto') return 'unsupportedLang';
  if (!TTS_SUPPORTED.has(key.split('-')[0] ?? key) && !TTS_SUPPORTED.has(key)) return 'unsupportedLang';

  return null;
}

/** 语音接口不接受 auto，未知语言时回退英文 */
function speechLang(lang: string): string {
  const normalized = lang.toLowerCase();
  return !normalized || normalized === 'auto' ? 'en' : lang;
}

/** 获取 base64 编码的 MP3 音频；失败返回 null */
export async function fetchSpeech(lang: string, text: string): Promise<string | null> {
  const params = new URLSearchParams();
  params.set('client', CLIENT);
  params.set('language', speechLang(lang));
  params.set('text', text);
  params.set('voice_speed', '1');
  params.set('key', API_KEY);

  try {
    const res = await fetchWithTimeout(`${ONE_PLATFORM_BASE}/v1/textToSpeech?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json+protobuf' },
    });
    if (!res.ok) return null;

    // 响应形如 ["<base64 MP3>"]，不是对象
    const payload: unknown = await res.json();
    const content = Array.isArray(payload) ? payload[0] : (payload as { audioContent?: unknown })?.audioContent;
    return typeof content === 'string' && content ? content : null;
  } catch {
    return null;
  }
}

export const translateBaseUrl = TRANSLATE_BASE;

/* ---------------- 语言列表缓存 ---------------- */

const LANG_CACHE_KEY = 'cachedLanguages';
/** 缓存有效期：语言列表变动极少，一天足够 */
const LANG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface LanguageCache {
  fetchedAt: number;
  options: LanguageOption[];
}

/** 读缓存；过期或不存在返回 null */
export async function readCachedLanguages(): Promise<LanguageOption[] | null> {
  try {
    const stored = await chrome.storage.local.get(LANG_CACHE_KEY);
    const cache = stored[LANG_CACHE_KEY] as LanguageCache | undefined;
    if (!cache || !Array.isArray(cache.options) || cache.options.length === 0) return null;

    const isFresh = Date.now() - cache.fetchedAt < LANG_CACHE_TTL_MS;
    return isFresh ? cache.options : null;
  } catch {
    return null;
  }
}

/** 写入缓存，失败不抛错 */
export async function writeCachedLanguages(options: LanguageOption[]): Promise<void> {
  try {
    const cache: LanguageCache = { fetchedAt: Date.now(), options };
    await chrome.storage.local.set({ [LANG_CACHE_KEY]: cache });
  } catch {
    // 缓存失败不影响主流程
  }
}

/** 内置兜底列表：网络不可用时也能让下拉框立刻可用 */
export const FALLBACK_LANGUAGES: LanguageOption[] = [
  { code: 'auto', name: 'Detect language' },
  { code: 'en', name: 'English' },
  { code: 'zh-CN', name: 'Chinese' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'ru', name: 'Russian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
];
