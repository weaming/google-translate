import { describe, expect, test } from 'bun:test';
import { cleanSentences, cleanText } from '../src/shared/text';

describe('cleanText', () => {
  test('去掉零宽字符与软连字符', () => {
    expect(cleanText('hello\u200Bworld')).toBe('helloworld');
    expect(cleanText('Hy\u00ADphen')).toBe('Hyphen');
    expect(cleanText('a\uFEFFb')).toBe('ab');
  });

  test('去掉私有区字符（渲染成菱形的主因）', () => {
    expect(cleanText('text\uE000more')).toBe('textmore');
    expect(cleanText('\uF8FF')).toBe('');
  });

  test('折叠连续空白并去首尾', () => {
    expect(cleanText('  a \n\t b  ')).toBe('a b');
  });

  test('保留正常文本与 emoji', () => {
    expect(cleanText('这是一个测试')).toBe('这是一个测试');
    expect(cleanText('hello 😀 world')).toBe('hello 😀 world');
  });
});

describe('cleanSentences', () => {
  test('原文与译文都清洗', () => {
    const result = cleanSentences([{ orig: 'a\u200Bb', trans: 'x\uE000y' }]);
    expect(result).toEqual([{ orig: 'ab', trans: 'xy' }]);
  });
});
