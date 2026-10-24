/** 选区过滤：决定一次选中是否值得弹气泡 */

/** 接口实测支持上万字符，这里只挡掉"整页全选"这类误操作 */
export const MAX_SELECTION_LENGTH = 5000;

/** 视口过窄时气泡无处安放 */
export const MIN_VIEW_WIDTH = 400;

const SYMBOL_ONLY_RE = /^[0-9!@#$€£%^&*()_+\-=[\]{};':"\\|,.<>/?\s]*$/;

export type SelectionIssue = 'empty' | 'tooLong' | 'symbolOnly' | 'narrow' | null;

/**
 * 按 UTF-16 码元计数（等同 JS 的 string.length）。
 *
 * 实测语音接口也以码元为准：纯 ASCII/中文上限 200，emoji 只有 100
 * （每个占 2 个码元），101 个 emoji 即 HTTP 400。
 */
export function textLength(text: string): number {
  return text.length;
}

/** 选区被拒绝的原因，可以翻译时返回 null */
export function selectionIssue(text: string, viewWidth: number): SelectionIssue {
  if (!text) return 'empty';
  if (textLength(text) > MAX_SELECTION_LENGTH) return 'tooLong';
  if (SYMBOL_ONLY_RE.test(text)) return 'symbolOnly';
  if (viewWidth <= MIN_VIEW_WIDTH) return 'narrow';

  return null;
}
