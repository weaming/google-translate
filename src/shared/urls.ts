/** 翻译相关的链接生成 */

export type TranslateSource = 'gtx_c' | 'gtx' | 'gtx_po';

/** 打开 Google 翻译网页版并预填文本 */
export function getTranslateUrl(
  sourceLang: string,
  targetLang: string,
  text: string,
  source: TranslateSource,
): string {
  return `https://translate.google.com/?source=${source}#${sourceLang}/${targetLang}/${encodeURIComponent(text)}`;
}

/** 图片翻译（整页图文对照） */
export function getImageTranslateUrl(
  sourceLang: string,
  targetLang: string,
  displayLang: string,
  imageUrl: string,
): string {
  const params = new URLSearchParams({
    sl: sourceLang,
    tl: targetLang,
    hl: displayLang,
    u: imageUrl,
  });

  return `https://translate.google.com/translate?${params.toString()}`;
}

/** 网页版首页 */
export const TRANSLATE_HOME_URL = 'https://translate.google.com/';

export const PRIVACY_URL = 'https://www.google.com/privacy.html';
