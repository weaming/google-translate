/** 语言代码归一与“是否我的语言”判断 */

import type { LanguageOption } from './translate-api';

/** 网络接口要求的规范语言码，例如 zh_CN → zh-CN，zh-Hant → zh-TW，zh-HK → yue */
export function normLang(raw: string): string {
  const code = raw.toLowerCase().replace('_', '-');
  if (code === 'zh-cn') return 'zh-CN';
  if (code === 'zh-tw' || code === 'zh-hant') return 'zh-TW';
  if (code === 'zh-hk') return 'yue';

  const dash = code.indexOf('-');
  const base = dash >= 0 ? code.slice(0, dash) : code;
  return base === 'zh' ? 'zh-CN' : base;
}

/** 是否属于中文：中文系语言共用同一检测结果，只按简体/繁体区分 */
export function isChineseLang(code: string): boolean {
  const norm = normLang(code);
  return norm === 'zh-CN' || norm === 'zh-TW' || norm === 'yue';
}

/**
 * 判断内容语言是否与目标语言相同，相同则无需翻译。
 * 简繁按语言码区分：目标 zh-TW 时 zh-CN 仍需翻译。
 */
export function isTargetLang(target: string, contentLang: string): boolean {
  return normLang(target) === normLang(contentLang);
}

/**
 * 语言列表只有 zh-CN（显示为 Chinese），繁体靠地区码表达。
 * 这里把中文拆成简繁两项，供下拉框直接选择。
 */
export function splitChinese(options: LanguageOption[]): LanguageOption[] {
  const result: LanguageOption[] = [];

  for (const option of options) {
    if (option.code !== 'zh-CN') {
      result.push(option);
      continue;
    }

    result.push({ code: 'zh-CN', name: '中文（简体）' });
    result.push({ code: 'zh-TW', name: '中文（繁體）' });
  }

  return result;
}
