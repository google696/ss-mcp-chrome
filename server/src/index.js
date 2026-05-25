#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ChromeBridge } from "./bridge.js";
import { DebugHttpServer } from "./debug-http.js";
import { createMcpServer } from "./mcp-server.js";

const port = Number(process.env.SS_MCP_CHROME_PORT || 12307);
const debugHttpPort = Number(process.env.SS_MCP_CHROME_DEBUG_PORT || 12308);

if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ ok: true, port, debugHttpPort }, null, 2));
  process.exit(0);
}

const bridge = new ChromeBridge({ port });
bridge.start();

if (process.env.SS_MCP_CHROME_DEBUG_HTTP !== "0") {
  new DebugHttpServer({ bridge, port: debugHttpPort, createMcpServer }).start();
}

const server = createMcpServer(bridge);
const transport = new StdioServerTransport();
await server.connect(transport);
