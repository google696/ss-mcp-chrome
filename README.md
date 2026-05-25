<p align="center">
  <img src="assets/logo.png" alt="ss-mcp-chrome 标志" width="160">
</p>

# ss-mcp-chrome

我是为了自己接管 Chrome 做了这个项目：`ss-mcp-chrome`。

它是一套本地 Chrome 自动化 MCP 服务，通过一个 Chrome MV3 扩展连接本机 WebSocket 桥接服务，再把真实浏览器的标签页、页面内容、截图、点击、表单填写和脚本执行能力暴露给 MCP 客户端。

我做它的目的很简单：我想有一套属于自己的 `mcp-chrome`，方便接入 Codex、OpenClaw、Hermes 这类工具，也方便后续继续扩展成更完整的浏览器控制台。

这个项目不是换皮复制。我按自己的使用需求重新实现了服务端、扩展端和 Streamable HTTP 接口，后面会继续补 Native Messaging、流程录制回放、网络抓包和可视化控制台。

## 功能

- 列出 Chrome 窗口和标签页
- 切换到指定标签页
- 控制当前标签页跳转，或打开新标签页
- 读取当前页面标题、网址、选中文本和可见正文
- 截取当前标签页可见区域，返回 PNG data URL
- 通过 CSS 选择器点击页面元素
- 通过 CSS 选择器填写输入框、文本域、下拉框和可编辑元素
- 在可信页面执行 JavaScript，用于调试和高级自动化
- 像 ScriptCat/Tampermonkey 一样安装和运行用户脚本
- 提供 GitHub 仓库创建、About 更新、删除等辅助动作
- 扩展端支持连接状态提示和自动重连
- 同时支持 stdio MCP 和 Streamable HTTP MCP

## 项目结构

```text
ss-mcp-chrome/
  assets/              项目 Logo
  extension/           Chrome MV3 扩展
  server/src/          MCP 服务和 WebSocket 桥接
  docs/                架构文档
```

## 环境要求

- Node.js 20 或更高版本
- Google Chrome，或基于 Chromium 的浏览器
- 支持 MCP 的客户端，例如 Codex、OpenClaw、Hermes 等

## 安装依赖

```bash
npm install
```

## 启动方式

手动调试时，我一般这样启动：

```bash
npm start
```

默认 WebSocket 桥接地址：

```text
ws://127.0.0.1:12307
```

默认调试 HTTP 地址：

```text
http://127.0.0.1:12308
```

如果你想改端口：

```bash
SS_MCP_CHROME_PORT=12308 npm start
```

如果你不想开启调试 HTTP 接口：

```bash
SS_MCP_CHROME_DEBUG_HTTP=0 npm start
```

注意：如果你是通过 Codex 这类 MCP 客户端使用，通常不需要长期手动运行 `npm start`。客户端会按配置自己启动 `server/src/index.js`。如果你手动占用了 `12307`，客户端再启动时可能会端口冲突。

## 加载 Chrome 扩展

1. 打开 `chrome://extensions/`
2. 打开“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目的 `extension` 目录
5. 确认 MCP 服务已经启动
6. 点击扩展图标
7. 点击“连接”

如果弹窗显示 `无法连接 ws://127.0.0.1:12307`，说明本地 MCP 服务还没启动，或者端口被其他进程占用了。

## 调试接口

我保留了一个只监听 `127.0.0.1` 的调试接口，方便本地开发时快速确认扩展是否能控制 Chrome。

查看状态：

```bash
curl http://127.0.0.1:12308/status
```

列出标签页：

```bash
curl -X POST http://127.0.0.1:12308/action ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"tabs.list\"}"
```

打开新标签页：

```bash
curl -X POST http://127.0.0.1:12308/action ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"tabs.navigate\",\"payload\":{\"url\":\"https://example.com\",\"newTab\":true}}"
```

## 用户脚本

我参考的是 ScriptCat 这类用户脚本管理器的使用方式：脚本里可以写 `==UserScript==` 元信息，用 `@match`、`@include`、`@exclude` 控制匹配页面。脚本安装后会保存在 Chrome 扩展的本地存储里，启用状态下会在匹配页面加载完成后自动运行。

这部分基于 Chrome 官方的 `chrome.userScripts` API，需要 Chrome 135 或更高版本。加载扩展后，如果 Chrome 提示新增了 `userScripts` 权限，请重新启用扩展；如果扩展详情页里有“允许用户脚本”开关，也要打开。

当前是轻量实现，不是完整 ScriptCat 兼容层。已支持：

- `@name`
- `@description`
- `@version`
- `@author`
- `@match`
- `@include`
- `@exclude`
- `@grant`
- `@run-at`
- `GM_info`
- `GM_getValue`
- `GM_setValue`
- `GM_deleteValue`
- `GM_addStyle`
- `GM_log`
- `GM_xmlhttpRequest`
- `unsafeWindow`

临时运行一段脚本：

```bash
curl -X POST http://127.0.0.1:12308/action ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"scripts.runCode\",\"payload\":{\"source\":\"GM_log(document.title); return document.title;\"}}"
```

安装一个用户脚本：

```javascript
// ==UserScript==
// @name         示例标题脚本
// @match        https://example.com/*
// @grant        GM_log
// ==/UserScript==

GM_log("当前标题", document.title);
```

安装后可以通过 MCP 工具 `script_list` 查看脚本 ID，再用 `script_run` 手动运行，或保持启用状态让它自动匹配运行。

扩展图标会打开 Chrome 右侧 Side Panel。里面有一个轻量脚本管理界面，可以直接新建、编辑、启停、运行和删除脚本。这个界面适合临时改脚本；复杂脚本我还是建议在本地编辑器里写好，再通过 MCP 工具安装。

## MCP 客户端配置

stdio MCP 的核心配置就是让客户端启动这个文件：

```bash
node D:\mcp\ss-mcp-chrome\server\src\index.js
```

TOML 示例：

```toml
[mcp_servers.ss-mcp-chrome]
command = "node"
args = ["D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"]
```

如果客户端找不到 `node`，把 `command` 改成 Node 的绝对路径。

## Codex 接管方式

Codex 使用 `~/.codex/config.toml` 配置 MCP 服务。Windows 下通常是：

```text
C:\Users\Administrator\.codex\config.toml
```

添加：

```toml
[mcp_servers.ss-mcp-chrome]
command = "node"
args = ["D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"]
```

如果 Codex 找不到 `node`：

```toml
[mcp_servers.ss-mcp-chrome]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"]
```

配置完成后重启 Codex。然后先在 Chrome 扩展里点“连接”，再让 Codex 调 `browser_status`、`browser_tabs`、`browser_read_page` 这些工具。

## OpenClaw 接管方式

我参考过 OpenClaw 的 `openclaw.json`，它使用的是 `streamable-http`，结构大概是：

```json
{
  "mcp": {
    "servers": {
      "chrome": {
        "url": "http://127.0.0.1:12306/mcp",
        "transport": "streamable-http"
      }
    }
  }
}
```

`ss-mcp-chrome` 也提供 Streamable HTTP MCP 端点。先启动服务：

```bash
cd /d D:\mcp\ss-mcp-chrome
npm start
```

然后在 OpenClaw 配置里添加：

```json
{
  "mcp": {
    "servers": {
      "ss-mcp-chrome": {
        "url": "http://127.0.0.1:12308/mcp",
        "transport": "streamable-http"
      }
    }
  }
}
```

如果你想直接替换原来的 `chrome` 服务名，也可以这样写：

```json
{
  "mcp": {
    "servers": {
      "chrome": {
        "url": "http://127.0.0.1:12308/mcp",
        "transport": "streamable-http"
      }
    }
  }
}
```

表单配置可以这样填：

```text
名称：ss-mcp-chrome
传输方式：streamable-http
URL：http://127.0.0.1:12308/mcp
```

接管顺序：

1. 运行 `npm start`
2. 在 OpenClaw 里启用这个 MCP 服务
3. 打开 Chrome 扩展并点击“连接”
4. 在 OpenClaw 里调用 `browser_status` 或 `browser_tabs`
5. 如果提示扩展未连接，检查 `ws://127.0.0.1:12307`

## Hermes 接管方式

如果 Hermes 支持外部 MCP 服务，可以按 stdio 方式接入：

```json
{
  "mcpServers": {
    "ss-mcp-chrome": {
      "command": "node",
      "args": [
        "D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"
      ]
    }
  }
}
```

如果 Hermes 使用表单配置：

```text
服务名：ss-mcp-chrome
传输方式：stdio
启动命令：node
启动参数：D:\mcp\ss-mcp-chrome\server\src\index.js
```

接管顺序：

1. 在 Hermes 中添加 `ss-mcp-chrome` MCP 服务
2. 重启或刷新 Hermes 的 MCP 工具列表
3. 在 Chrome 扩展里点击“连接”
4. 让 Hermes 调 `browser_status` 检查连接状态
5. 再调用 `browser_tabs`、`browser_navigate`、`browser_read_page`

当前版本只支持本机 `127.0.0.1`。如果 Hermes 和 Chrome 不在同一台电脑上，这个 WebSocket 方案暂时不能直接跨机器使用。

## 接管检查

无论用哪个客户端，我一般按这个顺序检查：

1. MCP 客户端能看到工具列表
2. Chrome 扩展显示“已连接”
3. `browser_status` 返回 `connected: true`
4. `browser_tabs` 能列出真实 Chrome 标签页
5. `browser_navigate` 能打开测试页面

## 工具列表

| 工具名 | 说明 |
| --- | --- |
| `browser_status` | 检查扩展是否已连接 |
| `browser_tabs` | 列出 Chrome 窗口和标签页 |
| `browser_switch_tab` | 切换到指定 Chrome 标签页 |
| `browser_navigate` | 控制当前标签页或新标签页打开网址 |
| `browser_read_page` | 读取当前页面文字和元信息 |
| `browser_screenshot` | 截取当前标签页可见区域 |
| `browser_click` | 通过 CSS 选择器点击元素 |
| `browser_fill` | 通过 CSS 选择器填写表单 |
| `browser_eval` | 在当前标签页执行 JavaScript |
| `script_list` | 列出扩展里保存的用户脚本 |
| `script_install` | 安装一段 UserScript 源码 |
| `script_remove` | 删除指定用户脚本 |
| `script_set_enabled` | 启用或停用指定用户脚本 |
| `script_run` | 手动运行已安装的用户脚本 |
| `script_run_code` | 临时运行一段 UserScript/JavaScript 源码 |
| `github_create_repository` | 在 GitHub 新建仓库页面填写并提交创建仓库表单 |
| `github_inspect_new_repository_page` | 检查 GitHub 页面结构，用于调试自动提交 |
| `github_update_repository_about` | 更新当前 GitHub 仓库的 About 描述和主页链接 |
| `github_delete_repository` | 删除指定 GitHub 仓库 |

工具名保留英文是为了兼容 MCP 客户端、JSON Schema 和脚本调用。界面、说明和文档我会尽量保持中文。

## 安全说明

连接成功后，这个项目可以控制你的真实 Chrome 页面。我建议只在本机使用，并保持 WebSocket 监听地址为 `127.0.0.1`。

`browser_eval` 能执行任意 JavaScript。我只建议在可信页面和明确知道代码含义时使用。

用户脚本同样能读写页面 DOM，也能发起网络请求。安装第三方脚本前要先看源码，不要把不可信脚本交给 MCP 客户端自动安装。

`github_delete_repository` 会真的删除 GitHub 仓库。这个工具是为了我自己的自动化流程准备的，不建议随便暴露给不可信客户端。

## 后续计划

- Native Messaging 安装器
- 扩展设置页
- 页面元素选择器
- 网络请求抓包
- 流程录制和回放
- 截图保存为本地文件
- GitHub Actions 自动打包发布

## 许可证

MIT
