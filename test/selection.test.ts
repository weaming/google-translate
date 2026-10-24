import { describe, expect, test } from 'bun:test';
import { MAX_SELECTION_LENGTH, selectionIssue } from '../src/shared/selection';

const WIDE = 1280;

/** 真实场景：576 字符的长段落，曾被旧的 500 上限挡掉 */
const LONG_TEXT = "If a game has a native macOS version as well as a Windows one, Steam will download the macOS version. To override this behavior, right click on the game, select Properties, select Compatibility. Enable 'Force the use of a specific Steam Play compatibility tool'. Select whichever version of CrossOver you want to do use. That will make Steam download the Windows version. Unchecking the 'Force the use...' box or selecting 'No Compatibility Tool' in the drop down list will revert to the macOS version of the game, with the specifics there varying based on your Steam version.";

describe('selectionIssue', () => {
  test('单词与长段落都可翻译', () => {
    expect(selectionIssue('hello', WIDE)).toBeNull();
    expect(LONG_TEXT.length).toBeGreaterThan(500);
    expect(selectionIssue(LONG_TEXT, WIDE)).toBeNull();
  });

  test('上限边界：等于上限可翻译，超出则拒绝', () => {
    expect(selectionIssue('a'.repeat(MAX_SELECTION_LENGTH), WIDE)).toBeNull();
    expect(selectionIssue('a'.repeat(MAX_SELECTION_LENGTH + 1), WIDE)).toBe('tooLong');
  });

  test('空选区与纯符号被拒绝', () => {
    expect(selectionIssue('', WIDE)).toBe('empty');
    expect(selectionIssue('123 !@# ...', WIDE)).toBe('symbolOnly');
  });

  test('含文字的短句不算纯符号', () => {
    expect(selectionIssue('OK', WIDE)).toBeNull();
    expect(selectionIssue('v2.0!', WIDE)).toBeNull();
  });

  test('窗口过窄时不弹气泡', () => {
    expect(selectionIssue('hello', 360)).toBe('narrow');
    expect(selectionIssue('hello', 401)).toBeNull();
  });
});
