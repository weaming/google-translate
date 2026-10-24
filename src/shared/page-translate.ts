/**
 * 整页翻译：按块收集文本、逐段请求译文并写回页面。
 *
 * 参考 kiss-translator 的做法：译文写进原文所在元素内部（而不是在外层另插一块），
 * 这样原文是 li / td / h2 时译文不会跑出列表项或单元格，也自然继承原排版。
 */

import { findContentRoots } from './site-rules';
import { cleanText } from './text';
import { translate } from './translate-api';

/** 单段最大字符数，避免把 JSON 之类的超长文本也送出去 */
const MAX_SEGMENT_LENGTH = 5000;
/** 太短的文本（单个标点、单位符号）没有翻译价值 */
const MIN_SEGMENT_LENGTH = 2;
/** 并发上限，避免瞬间打出大量请求 */
const CONCURRENCY = 4;
const DONE_ATTR = 'data-gtx-done';
/** 防止 Chrome 自带翻译二次处理译文 */
const NO_TRANSLATE_CLASS = 'notranslate';

/** 不参与翻译的标签：代码、公式、表单控件等 */
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT',
  'OPTION', 'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO', 'TEMPLATE', 'KBD',
  'SAMP', 'VAR', 'MATH', 'NOSCRIPT',
]);

/**
 * 代码容器与富文本编辑器的类名特征。
 * 各类站点的高亮代码块未必用 pre/code 包裹（如 highlight.js 的 div.highlight），
 * 也会带 notranslate 标记，这里一并排除。
 */
const SKIP_CLASS_RE = /(^|\s)(highlight|hljs|code-block|blob-code|notranslate)(\s|$)/;

/** 行内代码常见写法：等宽字体 + 底色，但没语义标签 */
const SKIP_ROLE_SELECTOR = '[role="textbox"], [contenteditable="true"], .monaco-editor, .CodeMirror';

/** 用来承载译文的块级标签 */
const BLOCK_SELECTOR = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, dd, dt, div';

/** 整页翻译的执行结果，用于 popup 显示反馈 */
export interface PageTranslateResult {
  ok: boolean;
  /** 成功翻译的段落数 */
  count: number;
  /** 页面已翻译过，本次未重复执行 */
  alreadyDone: boolean;
  error?: string;
}

export interface PageTranslateOptions {
  targetLang: string;
  onProgress?: (done: number, total: number) => void;
}

/** 一个待翻译单元：同一块级元素里的连续文本节点 */
export interface Segment {
  block: HTMLElement;
  text: string;
  nodes: Text[];
}

function isSkippable(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (SKIP_CLASS_RE.test(el.className)) return true;
  if (el.matches(SKIP_ROLE_SELECTOR)) return true;
  if (el.getAttribute('translate') === 'no') return true;

  const style = window.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** 文本节点自身是否落在需要跳过的祖先里 */
function hasSkippedAncestor(el: Element | null): boolean {
  for (let node = el; node; node = node.parentElement) {
    if (isSkippable(node)) return true;
  }

  return false;
}

/** 找到文本节点所属的最内层块级容器 */
function blockOf(node: Text): HTMLElement | null {
  const el = node.parentElement;
  if (!el) return null;

  const block = el.closest(BLOCK_SELECTOR);
  if (!(block instanceof HTMLElement)) return null;
  if (block.hasAttribute(DONE_ATTR)) return null;

  return block;
}

/**
 * 按块收集待翻译文本。
 * 同一块内的多个文本节点合并成一段，避免逐节点翻译把整句拆碎。
 */
export function collectSegments(roots: ParentNode | ParentNode[] = document.body): Segment[] {
  const list = Array.isArray(roots) ? roots : [roots];
  const byBlock = new Map<HTMLElement, Text[]>();

  for (const root of list) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as Text;
      const raw = cleanText(textNode.textContent ?? '');
      if (raw.length < MIN_SEGMENT_LENGTH) continue;

      const parent = textNode.parentElement;
      if (!parent) continue;

      // 逐级向上检查，代码块 / notranslate / 隐藏元素下的文本一律跳过
      if (hasSkippedAncestor(parent)) continue;

      const block = blockOf(textNode);
      if (!block) continue;

      // 块内还嵌套着别的块时，只取最内层块，避免重复翻译
      if (parent.closest(BLOCK_SELECTOR) !== block) continue;

      const bucket = byBlock.get(block) ?? [];
      bucket.push(textNode);
      byBlock.set(block, bucket);
    }
  }

  const segments: Segment[] = [];
  for (const [block, nodes] of byBlock) {
    const text = cleanText(nodes.map((n) => n.textContent ?? '').join(' '));
    if (text.length < MIN_SEGMENT_LENGTH || text.length > MAX_SEGMENT_LENGTH) continue;
    if (!/\p{L}/u.test(text)) continue;

    segments.push({ block, text, nodes });
  }

  return segments;
}

/** 并发池：任何时刻不超过 limit 个任务在跑 */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index] as T);
    }
  });

  await Promise.all(runners);
}

/** 原文备份：元素 → 原始子节点，用于还原 */
const originBackups = new WeakMap<HTMLElement, Node[]>();

/**
 * 把译文直接写进原元素，替换掉原有内容。
 *
 * 这样做的好处是与页面排版完全兼容：元素自身的字号、颜色、间距都不变，
 * 也不会额外插入会破坏列表 / 表格布局的节点。
 * 原内容在替换前备份，还原时原样放回。
 */
export function applyTranslation(segment: Segment, translation: string): void {
  const { block } = segment;
  const clean = translation.trim();
  if (!clean) return;

  // 备份原始子节点（保持引用，还原时可原样归位）
  if (!originBackups.has(block)) {
    originBackups.set(block, Array.from(block.childNodes));
  }

  block.setAttribute(DONE_ATTR, '1');
  block.classList.add(NO_TRANSLATE_CLASS);
  block.textContent = clean;
}

/** 移除页面上全部译文，恢复原状 */
export function removePageTranslation(): void {
  document.querySelectorAll(`[${DONE_ATTR}]`).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    const backup = originBackups.get(el);
    if (backup) {
      el.replaceChildren(...backup);
      originBackups.delete(el);
    }

    el.classList.remove(NO_TRANSLATE_CLASS);
    el.removeAttribute(DONE_ATTR);
  });
}

/** 页面是否已有译文 */
export function hasPageTranslation(): boolean {
  return document.querySelector(`[${DONE_ATTR}]`) !== null;
}

/** 翻译整页，返回成功段落数 */
export async function translatePage(options: PageTranslateOptions): Promise<number> {
  const { targetLang, onProgress } = options;

  // 站点有正文规则时只翻正文，避免把导航、工具栏也翻掉
  const contentRoots = findContentRoots();
  const segments = collectSegments(contentRoots.length > 0 ? contentRoots : document.body);
  if (segments.length === 0) return 0;

  let done = 0;
  let ok = 0;

  await runPool(segments, CONCURRENCY, async (segment) => {
    const result = await translate(segment.text, 'auto', targetLang, 'en', ['TRANSLATION']);

    if (!result.isError && result.text) {
      applyTranslation(segment, cleanText(result.text));
      ok += 1;
    }

    done += 1;
    onProgress?.(done, segments.length);
  });

  return ok;
}
