import { describe, expect, test } from 'bun:test';
import { isChineseLang, isTargetLang, normLang, splitChinese } from '../src/shared/lang';

describe('normLang', () => {
  test('中文变体归一', () => {
    expect(normLang('zh_CN')).toBe('zh-CN');
    expect(normLang('zh-Hant')).toBe('zh-TW');
    expect(normLang('zh-HK')).toBe('yue');
    expect(normLang('zh')).toBe('zh-CN');
  });

  test('带地区后缀的语言取主语言', () => {
    expect(normLang('en-US')).toBe('en');
    expect(normLang('pt_BR')).toBe('pt');
  });

  test('无后缀原样返回', () => {
    expect(normLang('JA')).toBe('ja');
  });
});

describe('isTargetLang', () => {
  test('英文页面在目标 en 时无需翻译', () => {
    expect(isTargetLang('en', 'en-US')).toBe(true);
  });

  test('英文页面在目标 zh-CN 时需要翻译', () => {
    expect(isTargetLang('zh-CN', 'en')).toBe(false);
  });

  test('简体与繁体互为不同语言', () => {
    expect(isTargetLang('zh-TW', 'zh-CN')).toBe(false);
    expect(isTargetLang('zh-TW', 'zh-Hant')).toBe(true);
    expect(isTargetLang('zh-CN', 'zh-TW')).toBe(false);
  });
});

describe('splitChinese', () => {
  test('把 Chinese 拆成简繁两项', () => {
    const result = splitChinese([
      { code: 'en', name: 'English' },
      { code: 'zh-CN', name: 'Chinese' },
    ]);

    expect(result.map((item) => item.code)).toEqual(['en', 'zh-CN', 'zh-TW']);
  });

  test('没有中文条目时原样返回', () => {
    const options = [{ code: 'en', name: 'English' }];
    expect(splitChinese(options)).toEqual(options);
  });
});

describe('isChineseLang', () => {
  test('识别中文系语言', () => {
    expect(isChineseLang('zh-CN')).toBe(true);
    expect(isChineseLang('zh_HK')).toBe(true);
    expect(isChineseLang('ja')).toBe(false);
  });
});
