# dsh-chat-shell

> 给 DeepSeek Harness 加一个 **Chat / Harness** 开关：
> 一键把整个窗口换成 DeepSeek、豆包或 ChatGPT 网页，再一键切回 Harness ——
> 会话、滚动位置、正在流式输出的回答全都不会丢。

<p>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20desktop-0ea5e9">
  <img alt="build" src="https://img.shields.io/badge/build-none%20(plain%20ES%20modules)-22c55e">
  <img alt="dsh" src="https://img.shields.io/badge/DSH-0.2.x%20desktop-4f46e5">
</p>

![一个标题栏里的 Chat 与 Harness](docs/titlebar.svg)

---

## 它做什么

DeepSeek Harness 是一个窗口、一套界面。这个插件在标题栏正中加了一个玻璃质感的
分段开关，旁边是站点按钮：

```
Harness                            Chat
┌────────────────────────────┐    ┌────────────────────────────┐
│  应用  编辑   Chat│Harness  │    │  应用  编辑  ⬤▾  Chat│Harness│
├────────────────────────────┤    ├────────────────────────────┤
│                            │    │                            │
│   原封不动的 Harness 界面   │ ⇄  │   一个真正的浏览器，打开    │
│   （会话、工具、任务）      │    │   chat.deepseek.com        │
│                            │    │   （或豆包 / ChatGPT）      │
└────────────────────────────┘    └────────────────────────────┘
```

两边常驻。切换是一次淡入淡出，不是一次页面加载：

* Harness 里的会话、滚动位置、正在跑的工具调用都不受影响；
* 每个 AI 网页只挂载一次，你切回 Harness 的时候，它那边的回答还在继续生成；
* 每个站点各自一个浏览器会话，三个账号的登录态互不覆盖。

## 功能

| | |
|---|---|
| **分段开关** | 标题栏正中的 `Chat \| Harness`。点标签切换，或者按住玻璃滑块拖到另一边松手。 |
| **站点按钮** | 真实品牌图标 + 小箭头，贴在开关左侧。点开选站点，或添加自己的站点。 |
| **三个预置站点** | DeepSeek、豆包、ChatGPT，各自独立的浏览器会话。 |
| **可添加任意网站** | 粘贴 URL 即可，名字取域名；自定义站点与预置站点并存。 |
| **秒切** | 站点只挂载一次，切换靠 CSS 显隐，不会销毁重建。 |
| **记住状态** | 上次的模式、上次的站点、站点列表，重载后都在。 |
| **跟随主题** | 从当前页面实时取色，App 换主题时自动重算，深色浅色都对。 |
| **优雅降级** | 浏览器版 DSH 没有桌面桥时，开关自己隐藏，不影响页面。 |

## 环境要求

* **DeepSeek Harness 桌面版** 0.2.x —— 内嵌浏览器由 Electron 外壳提供，`dsh web` 里没有。
* Windows（本插件的开发与测试平台）。

## 安装

### 通过插件市场 / CLI

```bash
dsh plugin add dsh-chat-shell
```

### 手动（本地目录）

1. 把本目录复制到 profile 的 `node_modules` 里：

   ```
   %USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-chat-shell
   ```

2. 在 `…\profiles\desktop\cordis.patch.yml` 里追加：

   ```yaml
   - insert:
       - id: chat-shell
         name: dsh-chat-shell
   ```

3. 保存。桌面端会热重载插件图，开关直接出现；若没出现，重启一次应用。

## 使用

* **切换** —— 点 `Chat` 或 `Harness`，或者拖动滑块。
* **换站点** —— 点开关左边那颗圆按钮。
* **添加站点** —— 打开菜单 → `＋ 添加 AI 网页` → 粘贴 URL → 回车。
* **回到 Harness** —— 一次点击，别的一切照旧。

插件只写一个本地偏好键：

```jsonc
// dsh-chat-shell:state
{
  "mode": "chat",                                  // "chat" | "harness"
  "active": "deepseek",                            // 当前站点的 id
  "sites": [{ "id": "deepseek", "label": "DeepSeek", "url": "https://chat.deepseek.com/" }]
}
```

想重置，在应用开发者工具里执行 `localStorage.removeItem("dsh-chat-shell:state")`
后重载即可。

## 保持登录状态（可选）

默认情况下内嵌浏览器使用的是**内存**会话分区，所以每次重启应用都要重新登录 ——
这是外壳的行为，不是插件的行为。

`scripts/patch-persistent-login.mjs` 用**一行改动**把它修好：改动打在解包出来的副本
上，原压缩包原样保留，随时可回滚。

```
- partition = `dsh-sidebar-browser-${randomUUID()}`;
+ partition = `persist:dsh-sidebar-browser-${createHash("sha1").update(workspace)…}`;
```

```bash
node scripts/patch-persistent-login.mjs status     # 外壳是否已打补丁
node scripts/patch-persistent-login.mjs build      # 解包 + 打补丁（不换文件）
node scripts/patch-persistent-login.mjs apply      # 准备换文件…
# …然后双击 apply-patch.cmd，并在应用里「应用 → 退出」
```

动手之前请先读 **[docs/persistent-login.md](docs/persistent-login.md)**：它会修改已安装
的应用、只支持 Windows，而且 DSH 升级会覆盖它（升级后重跑 `build` + `apply`）。
不打这个补丁，插件本身照常工作，只是重启后要重新登录。

## 已知限制

* **仅桌面版。** 开关依赖桌面桥 `dshDesktop.browser`，浏览器版 DSH 不提供；插件会
  检测到这一点并自动隐藏。
* **这个桥不是公开 API。** 它是 0.2.x 外壳里一个看起来稳定的内部契约，将来可能改名。
  真发生了，开关会隐藏自己，而不是把页面搞崩。
* **内嵌浏览器由外壳上锁** —— 不下载、不弹权限、不允许嵌套 webview、不弹 HTTP 认证框。
  这是刻意的，本插件不会去放松它。
* **站点可能识别内嵌浏览器。** DeepSeek、豆包、ChatGPT 目前都能正常渲染与输入；如果
  某个站点弹出自动化提示，那是它自己的策略，插件不应绕过。
* **不做多开分屏** —— 每个站点一个标签页。

## 卸载

1. 从 `cordis.patch.yml` 里删掉 `chat-shell` 那条（或 `dsh plugin remove dsh-chat-shell`）。
2. 删除 `…\profiles\desktop\node_modules\dsh-chat-shell`。
3. 如果打过可选的壳补丁，先执行 `node scripts/patch-persistent-login.mjs restore`。

## 实现要点

<details>
<summary>60 秒版本</summary>

* 这是一个**客户端插件**：`lib/client.js` 是被 `window.__ModuleLoader__.load({ id, factory })`
  包起来的普通 ES 模块；`lib/index.js` 之所以存在，是因为加载器要求每个包在 host 侧
  也有一个 `apply`。
* 挂载时它不往 slot 树里注册任何东西，而是往 `document.body` 里画三个元素 —— 全屏面板、
  站点按钮、开关 —— 用 `z-index` 盖在外壳之上，并用 `-webkit-app-region: no-drag`
  保证标题栏仍然可点。
* 每个站点是一个 `<webview>`，创建方式与内置侧栏浏览器完全一致：

  ```js
  const { lease, partition } = await window.dshDesktop.browser.acquire("chat-shell:" + site.id);
  const view = document.createElement("webview");
  view.setAttribute("name", lease);
  view.setAttribute("partition", partition);
  view.setAttribute("allowpopups", "");
  view.setAttribute("src", "about:blank#" + lease);
  view.addEventListener("dom-ready", () => view.loadURL(site.url));
  ```

  外壳只接受 `src` 为 `about:blank#<lease>` 的 webview，并会自己覆盖 web preferences，
  所以元素写错只会被拒绝，而不会悄悄用另一套权限跑起来。
* 配色从当前页面实时读取（`getComputedStyle`），折算成一组 CSS 自定义属性；App 换主题时
  通过 `MutationObserver`（`<html>`/`<body>`）与 `prefers-color-scheme` 重算。
* 没有构建步骤，没有依赖，自己也不发任何网络请求。

</details>

## 开发

纯 JavaScript，面向浏览器，没有编译环节：

```bash
node --check lib/client.js                    # 只做语法检查
node scripts/patch-persistent-login.mjs status
```

调试方式：直接改 profile `node_modules` 里的 `lib/client.js`，保存后桌面端会热重载插件图。
文件是 UTF-8 且内联中文标签 —— 请用能正确处理 UTF-8 的编辑器（PowerShell 的
`Set-Content` 会把它写坏）。

## 许可

[MIT](LICENSE)
