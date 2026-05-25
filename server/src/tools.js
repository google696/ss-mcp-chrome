import { z } from "zod";

export function registerTools(server, bridge) {
  server.tool(
    "browser_status",
    "检查 ss-mcp-chrome 扩展是否已经连接。",
    {},
    async () => textResult({
      connected: bridge.isConnected(),
      websocket: `ws://127.0.0.1:${bridge.port}`
    })
  );

  server.tool(
    "browser_tabs",
    "列出 Chrome 窗口和标签页。",
    {},
    async () => textResult(await bridge.send("tabs.list"))
  );

  server.tool(
    "browser_navigate",
    "让当前标签页或新标签页打开指定网址。",
    {
      url: z.string().url(),
      newTab: z.boolean().default(false)
    },
    async ({ url, newTab }) => textResult(await bridge.send("tabs.navigate", { url, newTab }))
  );

  server.tool(
    "browser_read_page",
    "读取当前标签页的标题、网址、选中文本和可见正文。",
    {},
    async () => textResult(await bridge.send("page.read"))
  );

  server.tool(
    "browser_screenshot",
    "截取当前标签页可见区域，返回 PNG data URL。",
    {},
    async () => textResult(await bridge.send("page.screenshot"))
  );

  server.tool(
    "browser_click",
    "通过 CSS 选择器点击当前标签页中的元素。",
    {
      selector: z.string().min(1)
    },
    async ({ selector }) => textResult(await bridge.send("page.click", { selector }))
  );

  server.tool(
    "browser_fill",
    "通过 CSS 选择器填写输入框、文本域、下拉框或可编辑元素。",
    {
      selector: z.string().min(1),
      value: z.string()
    },
    async ({ selector, value }) => textResult(await bridge.send("page.fill", { selector, value }))
  );

  server.tool(
    "browser_eval",
    "在当前标签页执行 JavaScript。仅用于可信页面和调试场景。",
    {
      code: z.string().min(1)
    },
    async ({ code }) => textResult(await bridge.send("page.eval", { code }))
  );
}

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }
    ]
  };
}
