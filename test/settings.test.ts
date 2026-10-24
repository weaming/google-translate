import { describe, expect, test } from 'bun:test';
import { browserLanguage, defaultSettings, normalizeSettings } from '../src/shared/settings';
import { getTranslateUrl, getImageTranslateUrl } from '../src/shared/urls';

describe('normalizeSettings', () => {
  test('空存储返回默认值', () => {
    expect(normalizeSettings({})).toEqual(defaultSettings());
  });

  test('合法值被采纳', () => {
    const settings = normalizeSettings({
      targetLang: 'ja',
      showBubble: '1',
      detectLanguage: false,
      addImageContextMenu: true,
    });

    expect(settings.targetLang).toBe('ja');
    expect(settings.showBubble).toBe('1');
    expect(settings.detectLanguage).toBe(false);
    expect(settings.addImageContextMenu).toBe(true);
  });

  test('非法 showBubble 回落到默认气泡形态', () => {
    expect(normalizeSettings({ showBubble: '9' }).showBubble).toBe(defaultSettings().showBubble);
    expect(normalizeSettings({ showBubble: 2 }).showBubble).toBe(defaultSettings().showBubble);
  });

  test('类型不符的字段被忽略', () => {
    const settings = normalizeSettings({ targetLang: 1, detectLanguage: 'yes' });
    expect(settings.targetLang).toBe(defaultSettings().targetLang);
    expect(settings.detectLanguage).toBe(defaultSettings().detectLanguage);
  });
});

describe('链接生成', () => {
  test('网页版翻译链接带 source 与编码文本', () => {
    expect(getTranslateUrl('auto', 'zh-CN', 'a b', 'gtx_c')).toBe(
      'https://translate.google.com/?source=gtx_c#auto/zh-CN/a%20b',
    );
  });

  test('图片翻译链接对图片地址编码', () => {
    const url = getImageTranslateUrl('auto', 'zh-CN', 'en', 'https://x.test/a.png?q=1');
    expect(url).toContain('sl=auto');
    expect(url).toContain('u=https%3A%2F%2Fx.test%2Fa.png%3Fq%3D1');
  });
});

describe('browserLanguage', () => {
  const original = globalThis.navigator;

  function stubLanguage(lang: string): void {
    Object.defineProperty(globalThis, 'navigator', { value: { language: lang }, configurable: true });
  }

  test('中文系映射到简繁', () => {
    stubLanguage('zh-TW');
    expect(browserLanguage()).toBe('zh-TW');
    stubLanguage('zh-Hant-HK');
    expect(browserLanguage()).toBe('zh-TW');
    stubLanguage('zh-CN');
    expect(browserLanguage()).toBe('zh-CN');
    stubLanguage('zh');
    expect(browserLanguage()).toBe('zh-CN');
  });

  test('其他语言去掉地区后缀', () => {
    stubLanguage('en-US');
    expect(browserLanguage()).toBe('en');
    stubLanguage('ja');
    expect(browserLanguage()).toBe('ja');
  });

  test('恢复原始 navigator', () => {
    Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
  });
});
