import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_DIR = join(import.meta.dir, '..', 'src', '_locales');

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

function loadLocale(locale: string): Record<string, Entry> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
}

const locales = readdirSync(LOCALES_DIR);

describe('语言包占位符', () => {
  for (const locale of locales) {
    test(`${locale}: 所有 $ 占位符都已声明`, () => {
      const messages = loadLocale(locale);
      const problems: string[] = [];

      for (const [key, entry] of Object.entries(messages)) {
        // Chrome 只认 $NAME$ 写法，未声明的 $1 会被静默丢弃
        const bare = entry.message.match(/\$\d/g);
        if (bare) problems.push(`${key}: 使用了裸 ${bare.join(',')}，应改为 $NAME$`);

        for (const name of entry.message.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g)) {
          const declared = entry.placeholders ?? {};
          const hasKey = Object.keys(declared).some((k) => k.toLowerCase() === name[1]!.toLowerCase());
          if (!hasKey) problems.push(`${key}: 占位符 $${name[1]}$ 未在 placeholders 中声明`);
        }
      }

      expect(problems).toEqual([]);
    });
  }

  test('各语言的键集合一致', () => {
    const [first, ...rest] = locales.map((l) => Object.keys(loadLocale(l)).sort());
    for (const list of rest) expect(list).toEqual(first!);
  });

  test('占位符条目的 content 指向位置参数', () => {
    for (const locale of locales) {
      for (const [key, entry] of Object.entries(loadLocale(locale))) {
        for (const decl of Object.values(entry.placeholders ?? {})) {
          expect(decl.content).toMatch(/^\$\d$/);
        }
      }
    }
  });
});
