const DEFAULT_WS_URL = "ws://127.0.0.1:12307";
const AUTO_RECONNECT_DELAY_MS = 1200;

let socket = null;
let state = "disconnected";
let lastError = "";
let shouldReconnect = false;
let reconnectTimer = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "connect") {
    connect()
      .then(() => sendResponse(getStatus()))
      .catch((error) => sendResponse(getStatus(error.message || String(error))));
    return true;
  }

  if (message.type === "disconnect") {
    disconnect();
    sendResponse(getStatus());
    return true;
  }

  if (message.type === "status") {
    sendResponse(getStatus());
    return true;
  }

  return false;
});

function connect() {
  shouldReconnect = true;
  if (socket && socket.readyState === WebSocket.OPEN) {
    state = "connected";
    lastError = "";
    return Promise.resolve();
  }

  if (socket && socket.readyState === WebSocket.CONNECTING) {
    return waitForOpen(socket);
  }

  state = "connecting";
  lastError = "";
  socket = new WebSocket(DEFAULT_WS_URL);

  socket.addEventListener("open", () => {
    state = "connected";
    lastError = "";
  });
  socket.addEventListener("close", () => {
    if (state !== "disconnected") {
      lastError = "连接已断开。请确认 MCP 服务仍在运行。";
    }
    state = "disconnected";
    socket = null;
    scheduleReconnect();
  });
  socket.addEventListener("error", (event) => {
    state = "disconnected";
    lastError = "无法连接 ws://127.0.0.1:12307。请先启动 ss-mcp-chrome。";
  });
  socket.addEventListener("message", async (event) => {
    await handleBridgeMessage(event.data);
  });

  return waitForOpen(socket);
}

function disconnect() {
  shouldReconnect = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (socket) socket.close();
  socket = null;
  state = "disconnected";
  lastError = "";
}

function waitForOpen(targetSocket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (socket === targetSocket) {
        state = "disconnected";
        lastError = "连接超时。请先启动 MCP 服务，再点击连接。";
      }
      reject(new Error(lastError));
    }, 2500);

    targetSocket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });

    targetSocket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(lastError));
    }, { once: true });

    targetSocket.addEventListener("close", () => {
      clearTimeout(timer);
      reject(new Error(lastError || "连接已断开"));
    }, { once: true });
  });
}

function getStatus(error = "") {
  const connected = socket?.readyState === WebSocket.OPEN;
  if (connected) {
    return {
      connected: true,
      state: "connected",
      label: "已连接",
      detail: DEFAULT_WS_URL
    };
  }

  const detail = error || lastError || "请先启动 MCP 服务，然后点击连接。";
  return {
    connected: false,
    state,
    label: state === "connecting" ? "正在连接..." : "未连接",
    detail
  };
}

function scheduleReconnect() {
  if (!shouldReconnect || reconnectTimer || socket) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch(() => {});
  }, AUTO_RECONNECT_DELAY_MS);
}

async function handleBridgeMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }

  if (message.kind === "heartbeat") {
    return;
  }

  try {
    const result = await dispatchAction(message.action, message.payload || {});
    respond(message.id, true, result);
  } catch (error) {
    respond(message.id, false, null, error.message || String(error));
  }
}

function respond(id, ok, result, error) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ id, ok, result, error }));
}

async function dispatchAction(action, payload) {
  switch (action) {
    case "tabs.list":
      return await listTabs();
    case "tabs.navigate":
      return await navigate(payload);
    case "page.read":
      return await runInActiveTab(readPage);
    case "page.screenshot":
      return await screenshot();
    case "page.click":
      return await runInActiveTab(clickElement, [payload.selector]);
    case "page.fill":
      return await runInActiveTab(fillElement, [payload.selector, payload.value]);
    case "page.eval":
      return await runInActiveTab(evalCode, [payload.code]);
    default:
      throw new Error(`未知动作：${action}`);
  }
}

async function listTabs() {
  const windows = await chrome.windows.getAll({ populate: true });
  return {
    windowCount: windows.length,
    tabCount: windows.reduce((sum, window) => sum + (window.tabs?.length || 0), 0),
    windows: windows.map((window) => ({
      id: window.id,
      focused: window.focused,
      tabs: (window.tabs || []).map((tab) => ({
        id: tab.id,
        active: tab.active,
        title: tab.title,
        url: tab.url
      }))
    }))
  };
}

async function navigate({ url, newTab = false }) {
  if (newTab) {
    const tab = await chrome.tabs.create({ url, active: true });
    return { tabId: tab.id, url: tab.url };
  }

  const tab = await getActiveTab();
  await chrome.tabs.update(tab.id, { url });
  return { tabId: tab.id, url };
}

async function screenshot() {
  const tab = await getActiveTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return { tabId: tab.id, dataUrl };
}

async function runInActiveTab(func, args = []) {
  const tab = await getActiveTab();
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func,
    args
  });
  return { tabId: tab.id, result: result?.result };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前活动标签页");
  return tab;
}

function readPage() {
  return {
    title: document.title,
    url: location.href,
    text: document.body?.innerText?.replace(/\n{3,}/g, "\n\n").trim() || "",
    selection: getSelection()?.toString() || ""
  };
}

function clickElement(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`没有找到元素：${selector}`);
  element.scrollIntoView({ block: "center", inline: "center" });
  element.click();
  return { clicked: selector };
}

function fillElement(selector, value) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`没有找到元素：${selector}`);
  element.scrollIntoView({ block: "center", inline: "center" });

  if (element.tagName === "SELECT") {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { filled: selector, value };
  }

  if ("value" in element) {
    element.focus();
    element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { filled: selector, value };
  }

  if (element.isContentEditable) {
    element.focus();
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
    return { filled: selector, value };
  }

  throw new Error(`元素不可填写：${selector}`);
}

function evalCode(code) {
  const indirectEval = eval;
  return indirectEval(code);
}
