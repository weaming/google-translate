/**
 * 扩展 i18n 封装。
 *
 * 语言包里的占位符必须用 Chrome 的 `$NAME$` 语法，并在 `placeholders` 中声明，
 * 否则 Chrome 会把 `$1` 这类写法当成未声明的占位符直接删除。
 * 因此这里把参数交给 chrome.i18n.getMessage 处理，不再自行替换。
 */
export function t(key: string, ...subs: Array<string | number>): string {
  const api = globalThis.chrome?.i18n;
  if (!api) return key;

  const args = subs.map(String);
  const message = args.length > 0 ? api.getMessage(key, args) : api.getMessage(key);
  return message || key;
}
