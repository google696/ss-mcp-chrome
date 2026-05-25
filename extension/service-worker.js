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
    case "github.createRepository":
      return await runInActiveTab(createGithubRepository, [payload]);
    case "github.inspectNewRepositoryPage":
      return await runInActiveTab(inspectGithubNewRepositoryPage);
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
  try {
    return Function(`"use strict"; return (${code});`)();
  } catch {
    return Function(`"use strict"; ${code}`)();
  }
}

function createGithubRepository({ name, description = "", visibility = "public" }) {
  const setValue = (element, value) => {
    if (!element) return false;
    element.focus();
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
    return true;
  };

  const clickIfNeeded = (selector, checked) => {
    const element = document.querySelector(selector);
    if (element && element.checked !== checked) element.click();
  };

  const repoName = document.querySelector("#repository-name-input, #repository_name, input[name='repository[name]']");
  const repoDescription = document.querySelector("input[name='Description'], #repository_description, input[name='repository[description]']");
  setValue(repoName, name);
  setValue(repoDescription, description);

  if (visibility === "private") {
    clickIfNeeded("input[value='private'], #repository_visibility_private", true);
  } else {
    clickIfNeeded("input[value='public'], #repository_visibility_public", true);
  }

  clickIfNeeded("input[name='repository[auto_init]']", false);
  const gitignore = document.querySelector("select[name='repository[gitignore_template]']");
  if (gitignore) {
    gitignore.value = "";
    gitignore.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const license = document.querySelector("select[name='repository[license_template]']");
  if (license) {
    license.value = "";
    license.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const submitButton = [...document.querySelectorAll("button, input[type='submit'], [role='button']")]
    .find((element) => (element.innerText || element.value || "").trim() === "Create repository");

  if (!submitButton) {
    return {
      submitted: false,
      reason: "没有找到 GitHub 创建仓库按钮",
      url: location.href,
      text: document.body.innerText.slice(0, 1000)
    };
  }

  submitButton.scrollIntoView({ block: "center", inline: "center" });
  submitButton.focus();
  submitButton.click();

  return {
    submitted: true,
    repoName: repoName?.value || "",
    description: repoDescription?.value || "",
    disabled: submitButton.disabled,
    url: location.href
  };
}

function inspectGithubNewRepositoryPage() {
  const visibleText = (element) => (element.innerText || element.value || "").trim();
  return {
    url: location.href,
    title: document.title,
    inputs: [...document.querySelectorAll("input, textarea, select")].map((element, index) => ({
      index,
      tag: element.tagName,
      type: element.type,
      name: element.name,
      id: element.id,
      value: element.value,
      checked: element.checked,
      disabled: element.disabled,
      placeholder: element.placeholder,
      ariaLabel: element.getAttribute("aria-label"),
      testId: element.getAttribute("data-testid")
    })),
    buttons: [...document.querySelectorAll("button, input[type='submit'], [role='button']")].map((element, index) => ({
      index,
      tag: element.tagName,
      type: element.type,
      text: visibleText(element),
      disabled: element.disabled,
      ariaDisabled: element.getAttribute("aria-disabled"),
      id: element.id,
      name: element.name,
      className: String(element.className || ""),
      ariaLabel: element.getAttribute("aria-label"),
      testId: element.getAttribute("data-testid")
    })),
    forms: [...document.querySelectorAll("form")].map((element, index) => ({
      index,
      action: element.action,
      method: element.method,
      text: element.innerText.slice(0, 300)
    })),
    bodyText: document.body.innerText.slice(0, 1500)
  };
}
