/** 站点专属规则：部分站点只应翻译正文区域，避免翻译导航、工具栏等噪音 */

export interface SiteRule {
  /** 匹配的主机名，支持子域后缀匹配 */
  host: string;
  /** 正文容器的选择器；命中多个时逐个处理 */
  contentSelector: string;
}

/**
 * 目前只针对 GitHub。
 *
 * GitHub 的正文统一是 .markdown-body（README、Issue、PR 描述、评论），
 * 而导航、文件列表、代码查看器都不在这个容器里，天然被排除。
 */
const SITE_RULES: SiteRule[] = [
  { host: 'github.com', contentSelector: '.markdown-body' },
  { host: 'gist.github.com', contentSelector: '.markdown-body, .gist-blob' },
];

function hostMatches(current: string, ruleHost: string): boolean {
  return current === ruleHost || current.endsWith(`.${ruleHost}`);
}

/** 找出当前站点适用的正文容器；没有规则或未命中时返回空数组（表示整页） */
export function findContentRoots(host: string = location.hostname): HTMLElement[] {
  const rule = SITE_RULES.find((item) => hostMatches(host, item.host));
  if (!rule) return [];

  return Array.from(document.querySelectorAll<HTMLElement>(rule.contentSelector));
}
