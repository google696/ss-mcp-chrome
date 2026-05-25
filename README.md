<p align="center">
  <img src="assets/logo.png" alt="ss-mcp-chrome 标志" width="160">
</p>

# ss-mcp-chrome

`ss-mcp-chrome` 是一套自有实现的 Chrome 自动化 MCP 服务。它通过本地 WebSocket 桥接 Chrome 扩展，把真实浏览器的标签页、页面内容、截图、点击、表单填写和脚本执行能力暴露给 MCP 客户端。

这个项目不是对其他项目的换皮复制，而是独立实现。项目目标是做一套属于自己的 Chrome MCP 工具，后续可以继续扩展 Native Messaging、网络抓包、流程录制回放和可视化控制台。

## 功能

- 列出 Chrome 窗口和标签页
- 控制当前标签页跳转，或打开新标签页
- 读取当前页面标题、网址、选中文本和可见正文
- 截取当前标签页可见区域，返回 PNG data URL
- 通过 CSS 选择器点击页面元素
- 通过 CSS 选择器填写输入框、文本域、下拉框和可编辑元素
- 在可信页面执行 JavaScript，用于调试和高级自动化
- 扩展端支持连接状态提示和自动重连

## 项目结构

```text
ss-mcp-chrome/
  assets/              项目 Logo
  extension/           Chrome MV3 扩展
  server/src/          MCP stdio 服务和 WebSocket 桥接
  docs/                架构文档
```

## 环境要求

- Node.js 20 或更高版本
- Google Chrome，或基于 Chromium 的浏览器
- 支持 stdio MCP 服务的客户端，例如 Codex、Claude Desktop 等

## 安装依赖

```bash
npm install
```

## 启动方式

手动调试时可以运行：

```bash
npm start
```

默认桥接地址是：

```text
ws://127.0.0.1:12307
```

手动调试接口默认监听：

```text
http://127.0.0.1:12308
```

可以通过环境变量改端口：

```bash
SS_MCP_CHROME_PORT=12308 npm start
```

如果不想开启调试 HTTP 接口：

```bash
SS_MCP_CHROME_DEBUG_HTTP=0 npm start
```

注意：如果你是通过 Codex 或其他 MCP 客户端使用本项目，通常不需要手动长期运行 `npm start`。MCP 客户端会按配置自己启动 `server/src/index.js`。如果你手动启动了一个进程占用 `12307`，MCP 客户端再启动时会发生端口冲突。

## 加载 Chrome 扩展

1. 打开 `chrome://extensions/`
2. 打开“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目的 `extension` 目录
5. 确认 MCP 服务已经启动
6. 点击扩展图标
7. 点击“连接”

如果弹窗显示 `无法连接 ws://127.0.0.1:12307`，说明本地 MCP 服务还没有启动，或者端口被其他进程占用。

## 调试接口

调试接口只监听 `127.0.0.1`，用于本地开发时快速验证扩展是否能控制 Chrome。

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

## MCP 客户端配置

示例配置：

```toml
[mcp_servers.ss-mcp-chrome]
command = "node"
args = ["D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"]
```

如果 MCP 客户端的运行环境找不到 `node`，请把 `command` 改成 Node 的绝对路径。

## 接入不同客户端

`ss-mcp-chrome` 是 stdio MCP 服务。无论接入 Codex、OpenClaw 还是 Hermes，核心都是让客户端启动下面这个命令：

```bash
node D:\mcp\ss-mcp-chrome\server\src\index.js
```

启动后，客户端会通过 stdio 调 MCP 工具；Chrome 扩展则通过 `ws://127.0.0.1:12307` 连接这个服务。

### Codex

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

如果 Codex 找不到 `node`，把 `command` 改成 Node 绝对路径，例如：

```toml
[mcp_servers.ss-mcp-chrome]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["D:\\mcp\\ss-mcp-chrome\\server\\src\\index.js"]
```

配置完成后重启 Codex。重启后先在 Chrome 扩展里点击“连接”，再让 Codex 调用 `browser_tabs`、`browser_read_page` 等工具。

注意：不要提前手动运行 `npm start` 占用 `12307`。Codex 会自己启动 MCP 服务。

### OpenClaw

你提供的 OpenClaw 配置使用的是 `streamable-http`，结构大致是：

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

下面的配置方式就是按这种 `openclaw.json` 结构适配的。

`ss-mcp-chrome` 也提供了同类 Streamable HTTP MCP 端点。先启动服务：

```bash
cd /d D:\mcp\ss-mcp-chrome
npm start
```

然后在 OpenClaw 的配置里添加：

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

如果你想直接替换原来的 `chrome` 服务名，也可以写成：

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

如果 OpenClaw 的配置界面是表单：

```text
名称：ss-mcp-chrome
传输方式：streamable-http
URL：http://127.0.0.1:12308/mcp
```

接管步骤：

1. 运行 `npm start`
2. 在 OpenClaw 里启用这个 MCP 服务
3. 打开 Chrome 扩展并点击“连接”
4. 在 OpenClaw 里调用浏览器工具，例如 `browser_status` 或 `browser_tabs`
5. 如果提示扩展未连接，检查 `ws://127.0.0.1:12307` 是否已连接

不同版本的 OpenClaw 配置文件路径可能不同，以你当前版本的 MCP 设置页为准。

### Hermes

Hermes 如果支持外部 MCP 服务，也按 stdio 方式接入：

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

接管步骤：

1. 在 Hermes 中添加 `ss-mcp-chrome` MCP 服务
2. 重启或刷新 Hermes 的 MCP 工具列表
3. 在 Chrome 扩展里点击“连接”
4. 让 Hermes 调用 `browser_status` 检查连接状态
5. 再调用 `browser_tabs`、`browser_navigate`、`browser_read_page`

如果 Hermes 和 Chrome 扩展不在同一台电脑，当前 WebSocket 方案不能直接跨机器使用；第一版只支持本机 `127.0.0.1`。

### 接管检查

无论哪个客户端，接管成功的最小检查流程都是：

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
| `browser_navigate` | 控制当前标签页或新标签页打开网址 |
| `browser_read_page` | 读取当前页面文字和元信息 |
| `browser_screenshot` | 截取当前标签页可见区域 |
| `browser_click` | 通过 CSS 选择器点击元素 |
| `browser_fill` | 通过 CSS 选择器填写表单 |
| `browser_eval` | 在当前标签页执行 JavaScript |
| `github_create_repository` | 在 GitHub 新建仓库页面填写并提交创建仓库表单 |
| `github_inspect_new_repository_page` | 检查 GitHub 新建仓库页面结构，用于调试自动提交 |

工具名保留英文是为了兼容 MCP 客户端、JSON Schema 和脚本调用。工具说明、界面和文档均使用中文。

## 安全说明

连接成功后，本项目可以控制你的真实 Chrome 页面。请只在本机使用，并保持 WebSocket 监听地址为 `127.0.0.1`。

`browser_eval` 能执行任意 JavaScript。只应该在可信页面和明确知道代码含义时使用。

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
