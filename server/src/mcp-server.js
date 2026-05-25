import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

export function createMcpServer(bridge) {
  const server = new McpServer({
    name: "ss-mcp-chrome",
    version: "0.1.0"
  });

  registerTools(server, bridge);
  return server;
}
