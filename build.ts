/** 构建：TypeScript 打包为 IIFE，复制静态资源并生成 manifest */

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const SRC = join(ROOT, 'src');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const isWatch = process.argv.includes('--watch');

const MANIFEST = {
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDescription__',
  version: '1.0.0',
  default_locale: 'en',
  minimum_chrome_version: '116',
  permissions: ['activeTab', 'contextMenus', 'storage', 'offscreen', 'scripting'],
  icons: {
    16: 'icons/16.png',
    32: 'icons/32.png',
    48: 'icons/48.png',
    128: 'icons/128.png',
  },
  action: {
    default_icon: {
      19: 'icons/19.png',
      38: 'icons/38.png',
    },
    default_title: '__MSG_actionTitle__',
    default_popup: 'popup.html',
  },
  background: { service_worker: 'main.js' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['bubble.js'],
      all_frames: true,
    },
  ],
  options_page: 'options.html',
};

const ENTRIES = [
  { name: 'main', input: 'src/background/main.ts' },
  { name: 'bubble', input: 'src/pages/bubble.ts' },
  { name: 'popup', input: 'src/pages/popup.ts' },
  { name: 'options', input: 'src/pages/options.ts' },
  { name: 'offscreen', input: 'src/pages/offscreen.ts' },
] as const;

/** 构建单个入口为浏览器可直接加载的 IIFE 脚本 */
async function buildEntry(name: string, input: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(ROOT, input)],
    target: 'browser',
    format: 'iife',
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : 'none',
    naming: `${name}.js`,
    outdir: DIST,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`构建失败：${input}`);
  }
}

/** 复制静态资源：HTML、CSS、图标、语言包 */
async function copyStatic(): Promise<void> {
  // 页面脚本由 Bun 打包，这里只取 HTML
  const pageFiles = await readdir(join(SRC, 'pages'));
  await Promise.all(
    pageFiles
      .filter((file) => file.endsWith('.html'))
      .map((file) => cp(join(SRC, 'pages', file), join(DIST, file))),
  );

  for (const [from, to] of [
    ['styles/popup.css', 'popup.css'],
    ['styles/options.css', 'options.css'],
    ['_locales', '_locales'],
  ] as const) {
    await cp(join(SRC, from), join(DIST, to), { recursive: true });
  }

  if (existsSync(join(PUBLIC, 'icons'))) {
    await cp(join(PUBLIC, 'icons'), join(DIST, 'icons'), { recursive: true });
  }
}

async function buildOnce(): Promise<void> {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await Promise.all(ENTRIES.map((entry) => buildEntry(entry.name, entry.input)));
  await copyStatic();

  await writeFile(join(DIST, 'manifest.json'), JSON.stringify(MANIFEST, null, 2) + '\n');
  console.log(`已构建 → ${DIST}`);
}

await buildOnce();

if (isWatch) {
  const { watch } = await import('node:fs');
  console.log('监听源码变更…');

  let timer: ReturnType<typeof setTimeout> | null = null;
  watch(SRC, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void buildOnce().catch((error) => console.error(error));
    }, 150);
  });
}
