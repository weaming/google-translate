/** 文本清洗：去掉会导致渲染异常或干扰翻译的不可见字符 */

/** 零宽字符、软连字符、私有区字符等，渲染时可能显示成方框或菱形 */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2028\u2029\u2060-\u2064\uFEFF\uFFF9-\uFFFB]/g;

/** 私有区（PUA）字符没有标准字形，多数字体会画成 ◆ */
const PRIVATE_USE_RE = /[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFD}]/gu;

/** 连续空白折叠为单个空格，并去掉首尾空白 */
const WHITESPACE_RE = /\s+/g;

export function cleanText(input: string): string {
  return input
    .replace(INVISIBLE_RE, '')
    .replace(PRIVATE_USE_RE, '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

/** 逐句文本同样需要清洗，服务端可能回传带控制符的原文 */
export function cleanSentences<T extends { orig: string; trans: string }>(items: T[]): T[] {
  return items.map((item) => ({ ...item, orig: cleanText(item.orig), trans: cleanText(item.trans) }));
}
