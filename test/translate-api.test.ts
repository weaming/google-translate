import { describe, expect, test } from 'bun:test';
import { canSpeak, parseTranslateResponse, speechBlockReason } from '../src/shared/translate-api';
import { textLength } from '../src/shared/selection';

describe('parseTranslateResponse', () => {
  test('解析真实接口返回结构', () => {
    const payload = [
      '你好世界',
      [['你好世界', 'Hello world']],
      null,
      null,
      [['en'], null, [0.76], ['en']],
      'en',
    ];

    const result = parseTranslateResponse(payload, 'zh-CN');
    expect(result.isError).toBe(false);
    expect(result.text).toBe('你好世界');
    expect(result.sourceLang).toBe('en');
    expect(result.targetLang).toBe('zh-CN');
    expect(result.sentences).toEqual([{ orig: 'Hello world', trans: '你好世界' }]);
  });

  test('多句返回逐句对照', () => {
    const payload = ['甲。乙。', [['甲。', 'A.'], ['乙。', 'B.']], null, null, null, 'en'];
    const result = parseTranslateResponse(payload, 'zh-CN');

    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[1]?.orig).toBe('B.');
  });

  test('缺少源语言时回退 auto', () => {
    const result = parseTranslateResponse(['hi', [['hi', 'hi']]], 'zh-CN');
    expect(result.sourceLang).toBe('auto');
  });

  test('首项不是字符串时从句子拼接', () => {
    const result = parseTranslateResponse([null, [['一', 'a'], ['二', 'b']], null, null, null, 'en'], 'zh-CN');
    expect(result.text).toBe('一二');
  });
});

describe('canSpeak', () => {
  test('支持的语言且在长度上限内', () => {
    expect(canSpeak('en', 'hello')).toBe(true);
    expect(canSpeak('zh-CN', '你好')).toBe(true);
  });

  test('超长文本或未支持语言不可朗读', () => {
    expect(canSpeak('en', 'a'.repeat(201))).toBe(false);
    expect(canSpeak('tlh', 'hello')).toBe(false);
    expect(canSpeak('en', '')).toBe(false);
  });
});

describe('语音响应解析', () => {
  test('数组形式响应取首项作为音频', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(['BASE64AUDIO']), { status: 200 })) as unknown as typeof fetch;

    const { fetchSpeech } = await import('../src/shared/translate-api');
    expect(await fetchSpeech('en', 'hello')).toBe('BASE64AUDIO');

    globalThis.fetch = original;
  });

  test('接口失败时返回 null', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('err', { status: 500 })) as unknown as typeof fetch;

    const { fetchSpeech } = await import('../src/shared/translate-api');
    expect(await fetchSpeech('en', 'hello')).toBeNull();

    globalThis.fetch = original;
  });
});

describe('speechBlockReason', () => {
  test('可朗读时返回 null', () => {
    expect(speechBlockReason('en', 'hello')).toBeNull();
    expect(speechBlockReason('zh-CN', '你好')).toBeNull();
    expect(speechBlockReason('zh-tw', '你好')).toBeNull();
  });

  test('200 字符是上限，201 即超长', () => {
    expect(speechBlockReason('en', 'a'.repeat(200))).toBeNull();
    expect(speechBlockReason('en', 'a'.repeat(201))).toBe('tooLong');
    expect(speechBlockReason('zh-CN', '好'.repeat(201))).toBe('tooLong');
  });

  test('空文本与不支持的语言', () => {
    expect(speechBlockReason('en', '   ')).toBe('empty');
    expect(speechBlockReason('auto', 'hello')).toBe('unsupportedLang');
    expect(speechBlockReason('tlh', 'hello')).toBe('unsupportedLang');
  });

  test('带地区后缀的受支持语言可朗读', () => {
    expect(speechBlockReason('en-US', 'hello')).toBeNull();
    expect(speechBlockReason('pt-BR', 'olá')).toBeNull();
  });
});

describe('朗读上限按 UTF-16 码元而非单词计数（二分法实测）', () => {
  test('200 个英文单词（999 字符）超限，40 个单词（199 字符）可读', () => {
    const words200 = Array.from({ length: 200 }, () => 'word').join(' ');
    const words40 = Array.from({ length: 40 }, () => 'word').join(' ');

    expect(words200.length).toBe(999);
    expect(speechBlockReason('en', words200)).toBe('tooLong');

    expect(words40.length).toBe(199);
    expect(speechBlockReason('en', words40)).toBeNull();
  });

  test('emoji 每个占两个码元，上限只有 100 个', () => {
    const emoji100 = '😀'.repeat(100);
    expect(emoji100.length).toBe(200);
    expect(textLength(emoji100)).toBe(200);
    expect(speechBlockReason('en', emoji100)).toBeNull();
  });

  test('101 个 emoji 即超限（实测 HTTP 400）', () => {
    expect(speechBlockReason('en', '😀'.repeat(101))).toBe('tooLong');
  });

  test('中文与 ASCII 都是 200 上限', () => {
    expect(speechBlockReason('zh-CN', '好'.repeat(200))).toBeNull();
    expect(speechBlockReason('zh-CN', '好'.repeat(201))).toBe('tooLong');
    expect(speechBlockReason('en', 'a'.repeat(200))).toBeNull();
    expect(speechBlockReason('en', 'a'.repeat(201))).toBe('tooLong');
  });

  test('中英混排按字符数计', () => {
    const mixed = 'Hello 世界 '.repeat(20);
    expect(textLength(mixed)).toBe(180);
    expect(speechBlockReason('en', mixed)).toBeNull();

    // 补到 201 个字符即超限
    const longer = mixed + 'x'.repeat(21);
    expect(speechBlockReason('en', longer)).toBe('tooLong');
  });
});
