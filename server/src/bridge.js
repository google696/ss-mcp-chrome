import { WebSocketServer } from "ws";

const DEFAULT_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 15000;

export class ChromeBridge {
  constructor({ port = 12307 } = {}) {
    this.port = port;
    this.wss = null;
    this.client = null;
    this.nextId = 1;
    this.pending = new Map();
    this.heartbeatTimer = null;
  }

  start() {
    if (this.wss) return;

    this.wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
    this.wss.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`端口 ${this.port} 已被占用。请关闭其他 ss-mcp-chrome 进程，或设置 SS_MCP_CHROME_PORT。`);
      } else {
        console.error(error);
      }
    });
    this.wss.on("connection", (socket) => {
      this.client = socket;
      this.startHeartbeat();

      socket.on("message", (raw) => this.handleMessage(raw));
      socket.on("close", () => {
        if (this.client === socket) this.client = null;
        this.stopHeartbeat();
      });
    });
  }

  isConnected() {
    return Boolean(this.client && this.client.readyState === this.client.OPEN);
  }

  async send(action, payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!this.isConnected()) {
      throw new Error("Chrome 扩展尚未连接。请加载扩展并点击“连接”。");
    }

    const id = String(this.nextId++);
    const message = JSON.stringify({ id, action, payload });

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`等待 Chrome 响应超时：${action}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      this.client.send(message, (error) => {
        if (!error) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Chrome 操作失败"));
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) {
        this.stopHeartbeat();
        return;
      }

      this.client.send(JSON.stringify({ kind: "heartbeat", timestamp: Date.now() }), () => {});
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
