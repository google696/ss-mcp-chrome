<p align="center">
  <img src="assets/logo.png" alt="ss-mcp-chrome 标志" width="160">
</p>

# ss-mcp-chrome

`ss-mcp-chrome` 是一套面向 MCP 客户端的本地 Chrome 接管服务。项目由 Chrome MV3 扩展、本地 WebSocket 桥接服务和 MCP Server 组成，可将真实 Chrome 浏览器的标签页、页面内容、截图、点击、表单填写、脚本执行和用户脚本管理能力开放给支持 MCP 的客户端。

该项目适用于 Codex、OpenClaw、Hermes 等需要控制本机浏览器的自动化场景。所有浏览器控制链路默认只监听本机地址 `127.0.0.1`，用于降低跨设备暴露风险。

## 功能特性

- 查看 Chrome 窗口和标签页
- 切换到指定 Chrome 标签页
- 控制当前标签页跳转，或打开新标签页
- 读取当前页面标题、网址、选中文本和可见正文
- 截取当前标签页可见区域，返回 PNG data URL
- 通过 CSS 选择器点击页面元素
- 通过 CSS 选择器填写输入框、文本域、下拉框和可编辑元素
- 在可信页面执行 JavaScript
- 安装、编辑、启停、运行和删除用户脚本
- 支持类似 ScriptCat/Tampermonkey 的 `==UserScript==` 元信息
- 支持扩展侧边栏脚本管理界面
- 支持连接状态指示、手动连接、断开连接和自动重连
- 同时提供 stdio MCP 和 Streamable HTTP MCP 接入方式
- 提供 GitHub 仓库创建、About 更新、仓库删除等辅助自动化工具

## 项目结构

```text
ss-mcp-chrome/
  assets/              项目 Logo 和图标资源
  extension/           Chrome MV3 扩展
  server/src/          MCP 服务和 WebSocket 桥接服务
  docs/                架构说明和功能规划
```

## 环境要求

- Node.js 20 或更高版本
- Google Chrome，或基于 Chromium 的浏览器
- 支持 MCP 的客户端，例如 Codex、OpenClaw、Hermes

## 安装依赖

```bash
npm install
```

## 启动服务

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

修改 WebSocket 端口：

```bash
SS_MCP_CHROME_PORT=12308 npm start
```

关闭调试 HTTP 接口：

```bash
SS_MCP_CHROME_DEBUG_HTTP=0 npm start
```

通过 MCP 客户端使用 stdio 模式时，通常不需要长期手动运行 `npm start`。客户端会按照配置自动启动 `server/src/index.js`。如果手动进程占用了 `12307` 端口，客户端再次启动时可能出现端口冲突。

## 加载 Chrome 扩展

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目的 `extension` 目录
5. 确认本地 MCP 服务已经启动
6. 点击扩展图标打开右侧 Side Panel
7. 点击“连接”

如果界面显示无法连接 `ws://127.0.0.1:12307`，说明本地服务未启动，或端口被其他进程占用。

## 调试接口

项目提供仅监听 `127.0.0.1` 的调试 HTTP 接口，便于本地开发时确认扩展连接和浏览器控制状态。

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

`ss-mcp-chrome` 内置轻量用户脚本能力，支持通过 MCP 工具或扩展侧边栏管理脚本。脚本可以使用 `==UserScript==` 元信息，通过 `@match`、`@include`、`@exclude` 控制匹配页面，并在启用状态下自动运行。

该能力基于 Chrome 官方 `chrome.userScripts` API，需要 Chrome 135 或更高版本。加载扩展后，如果 Chrome 提示新增 `userScripts` 权限，请重新启用扩展；如果扩展详情页存在“允许用户脚本”开关，也需要打开。

当前支持的用户脚本字段和 API：

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

用户脚本示例：

```javascript
// ==UserScript==
// @name         示例标题脚本
// @match        https://example.com/*
// @grant        GM_log
// ==/UserScript==

GM_log("当前标题", document.title);
```

安装脚本后，可通过 MCP 工具 `script_list` 查看脚本 ID，再使用 `script_run` 手动运行，或保持启用状态让脚本按页面匹配规则自动运行。

扩展图标会打开 Chrome 右侧 Side Panel。侧边栏提供脚本列表、脚本详情、当前网址匹配高亮、新建、编辑、启停、运行和删除等操作。

## MCP 客户端配置

stdio MCP 的核心配置是让客户端启动以下文件：

```bash
node D:\mcp\ss-mcp-chrome\server\src\index.js
```

TOML 示例：

```toml
[mcp_servers.ss-mcp-chrome]
command = "node"
args = ["D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"]
```

如果客户端无法找到 `node`，请将 `command` 改为 Node.js 的绝对路径。

## Codex 接管方式

Codex 使用 `~/.codex/config.toml` 配置 MCP 服务。Windows 下通常位于：

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

配置完成后重启 Codex。随后在 Chrome 扩展侧边栏点击“连接”，再通过 Codex 调用 `browser_status`、`browser_tabs`、`browser_read_page` 等工具验证接管状态。

## OpenClaw 接管方式

OpenClaw 可使用 Streamable HTTP 方式接入。先启动本地服务：

```bash
cd /d D:\mcp\ss-mcp-chrome
npm start
```

然后在 OpenClaw 的 MCP 配置中添加：

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

如果需要直接替换原有 `chrome` 服务名，也可以使用：

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

表单配置可填写：

```text
名称：ss-mcp-chrome
传输方式：streamable-http
URL：http://127.0.0.1:12308/mcp
```

接管检查顺序：

1. 运行 `npm start`
2. 在 OpenClaw 中启用该 MCP 服务
3. 打开 Chrome 扩展侧边栏并点击“连接”
4. 在 OpenClaw 中调用 `browser_status` 或 `browser_tabs`
5. 如果提示扩展未连接，检查 `ws://127.0.0.1:12307`

## Hermes 接管方式

Hermes 如果支持外部 MCP 服务，可按 stdio 方式接入：

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
服务名称：ss-mcp-chrome
传输方式：stdio
启动命令：node
启动参数：D:\mcp\ss-mcp-chrome\server\src\index.js
```

接管检查顺序：

1. 在 Hermes 中添加 `ss-mcp-chrome` MCP 服务
2. 重启或刷新 Hermes 的 MCP 工具列表
3. 在 Chrome 扩展侧边栏点击“连接”
4. 让 Hermes 调用 `browser_status` 检查连接状态
5. 再调用 `browser_tabs`、`browser_navigate`、`browser_read_page`

当前版本仅支持本机 `127.0.0.1` 接入。如果 Hermes 与 Chrome 不在同一台电脑上，该 WebSocket 方案暂不支持直接跨设备使用。

## 接管检查

无论使用哪一种 MCP 客户端，建议按以下顺序排查：

1. MCP 客户端能够看到工具列表
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
| `script_list` | 列出扩展中保存的用户脚本 |
| `script_install` | 安装一段 UserScript 源码 |
| `script_remove` | 删除指定用户脚本 |
| `script_set_enabled` | 启用或停用指定用户脚本 |
| `script_run` | 手动运行已安装的用户脚本 |
| `script_run_code` | 临时运行一段 UserScript/JavaScript 源码 |
| `github_create_repository` | 在 GitHub 新建仓库页面填写并提交创建仓库表单 |
| `github_inspect_new_repository_page` | 检查 GitHub 页面结构，用于调试自动提交 |
| `github_update_repository_about` | 更新当前 GitHub 仓库的 About 描述和主页链接 |
| `github_delete_repository` | 删除指定 GitHub 仓库 |

工具名保留英文，用于兼容 MCP 客户端、JSON Schema 和脚本调用。

## 安全说明

连接成功后，MCP 客户端可以控制本机真实 Chrome 页面。建议仅在可信本机环境使用，并保持 WebSocket 和 HTTP 服务监听在 `127.0.0.1`。

`browser_eval` 可以执行 JavaScript。该工具应仅在可信页面和明确理解代码含义时使用。

用户脚本可以读写页面 DOM，也可以发起网络请求。安装第三方脚本前应先审查源码，不建议将不可信脚本交由 MCP 客户端自动安装。

`github_delete_repository` 会真实删除 GitHub 仓库。该工具应仅在明确确认目标仓库后使用。

## 后续规划

更完整的功能规划见 [docs/roadmap.md](docs/roadmap.md)。

- Native Messaging 安装器
- 扩展设置页
- 页面元素选择器
- 网络请求抓包
- 流程录制和回放
- 截图保存为本地文件
- GitHub Actions 自动打包发布

## 许可证

MIT
