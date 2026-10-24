# Google 翻译扩展

参考 Google 翻译 Chrome 扩展（v2.0.18）用 TypeScript 复刻的 MV3 扩展：划词气泡翻译、工具栏弹窗、选项页、语音朗读。

## 结构

```
src/
  background/main.ts    Service Worker：右键菜单、语言检测、音频调度、选项广播
  pages/bubble.ts       内容脚本：选区监听与翻译流程
  pages/bubble-view.ts  Shadow DOM 气泡视图
  pages/popup.*         工具栏弹窗
  pages/options.*       选项页
  pages/offscreen.ts    音频播放文档
  shared/               接口、选项、语言、消息协议
```

## 使用

```sh
make up      # 构建并输出到 ~/chrome/google-translate
make dev     # 监听源码变更
make test    # 单元测试
```

在 `chrome://extensions` 开启开发者模式，加载 `~/chrome/google-translate`。

## 接口

翻译、语言列表、语音合成均走 `translate-pa.googleapis.com` 的 v1 接口：

| 用途 | 路径 |
|---|---|
| 文本翻译 | `/v1/translate` |
| 语言列表 | `/v1/supportedLanguages` |
| 语音合成 | `/v1/textToSpeech` |

## 选项

存储于 `chrome.storage.local`：

| 键 | 说明 |
|---|---|
| `targetLang` | 主要语言；首次安装取浏览器界面语言 |
| `showBubble` | `2` 直接弹气泡 / `1` 先显示图标 / `0` 不显示 |
| `detectLanguage` | 页面为目标语言时仍显示图标 |
| `addImageContextMenu` | 右键菜单包含图片翻译 |

语言列表接口只提供 `zh-CN`（显示为 Chinese），繁体由 `zh-TW` 表达，
界面下拉框把中文拆成「中文（简体）」「中文（繁體）」两项。
