import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

export class DebugHttpServer {
  constructor({ bridge, port = 12308, createMcpServer } = {}) {
    this.bridge = bridge;
    this.port = port;
    this.createMcpServer = createMcpServer;
    this.server = null;
    this.transports = new Map();
  }

  start() {
    if (this.server) return;

    this.server = http.createServer(async (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      try {
        if (request.url === "/mcp") {
          await this.handleMcpRequest(request, response);
          return;
        }

        if (request.method === "GET" && request.url === "/status") {
          this.sendJson(response, 200, {
            ok: true,
            connected: this.bridge.isConnected(),
            websocket: `ws://127.0.0.1:${this.bridge.port}`
          });
          return;
        }

        if (request.method === "POST" && request.url === "/action") {
          const body = await readJson(request);
          if (!body.action) {
            this.sendJson(response, 400, { ok: false, error: "缺少 action 字段" });
            return;
          }

          const result = await this.bridge.send(body.action, body.payload || {});
          this.sendJson(response, 200, { ok: true, result });
          return;
        }

        this.sendJson(response, 404, { ok: false, error: "接口不存在" });
      } catch (error) {
        this.sendJson(response, 500, { ok: false, error: error.message || String(error) });
      }
    });

    this.server.listen(this.port, "127.0.0.1");
  }

  sendJson(response, statusCode, data) {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(data, null, 2));
  }

  async handleMcpRequest(request, response) {
    if (!this.createMcpServer) {
      this.sendJson(response, 500, { ok: false, error: "MCP 服务工厂未配置" });
      return;
    }

    const sessionIdHeader = request.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    let transport = sessionId ? this.transports.get(sessionId) : undefined;
    let parsedBody;

    if (request.method === "POST") {
      parsedBody = await readJson(request);
    }

    if (transport) {
      await transport.handleRequest(request, response, parsedBody);
      return;
    }

    if (request.method === "POST" && !sessionId && isInitializeRequest(parsedBody)) {
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableJsonResponse: true,
        onsessioninitialized: (initializedSessionId) => {
          this.transports.set(initializedSessionId, transport);
        }
      });

      transport.onclose = () => {
        if (transport?.sessionId) this.transports.delete(transport.sessionId);
      };

      const mcpServer = this.createMcpServer(this.bridge);
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
      return;
    }

    if (request.method === "GET" || request.method === "DELETE") {
      this.sendJson(response, 400, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "缺少有效的 MCP 会话 ID"
        },
        id: null
      });
      return;
    }

    this.sendJson(response, 405, { ok: false, error: "不支持的 MCP 请求方法" });
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
