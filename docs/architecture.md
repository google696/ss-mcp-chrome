# 架构说明

`ss-mcp-chrome` 运行时分成两部分：MCP 服务端和 Chrome 扩展端。

## MCP 服务端

服务端是一个 Node.js stdio MCP 服务。MCP 客户端会把它作为子进程启动。服务端注册一组浏览器工具，同时在本机 `127.0.0.1` 上开启 WebSocket 服务，等待 Chrome 扩展连接。

默认地址：

```text
ws://127.0.0.1:12307
```

开发调试时，服务端还会开启一个仅监听本机的 HTTP 调试接口：

```text
http://127.0.0.1:12308
```

这个接口不是 MCP 协议的一部分，只用于本地开发和验收。

## Chrome 扩展端

扩展是 Manifest V3 扩展。用户点击弹窗里的“连接”后，扩展的 service worker 会连接本地 WebSocket 桥接服务。

扩展收到 MCP 服务端发来的动作后，会调用 Chrome 扩展 API，或者向当前标签页注入脚本执行操作，然后把 JSON 结果返回给服务端。

## 消息格式

服务端发送给扩展：

```json
{
  "id": "1",
  "action": "tabs.list",
  "payload": {}
}
```

扩展返回给服务端：

```json
{
  "id": "1",
  "ok": true,
  "result": {}
}
```

错误返回：

```json
{
  "id": "1",
  "ok": false,
  "error": "没有找到元素"
}
```

## 为什么第一版使用 WebSocket

WebSocket 方案安装简单，不需要写注册表，也不需要 Native Messaging host 安装流程。它适合快速验证自有 MCP Chrome 的核心能力。

后续如果要做成更像正式桌面工具的体验，可以增加 Native Messaging 模式，让扩展自动拉起本地服务。
