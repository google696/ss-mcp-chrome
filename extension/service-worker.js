const DEFAULT_WS_URL = "ws://127.0.0.1:12307";
const AUTO_RECONNECT_DELAY_MS = 1200;
const USER_SCRIPTS_KEY = "ssUserScripts";

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url || !isInjectableUrl(tab.url)) return;
  injectMatchingUserScripts(tabId, tab.url).catch(() => {});
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
  socket.addEventListener("error", () => {
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

  if (message.kind === "heartbeat") return;

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
    case "tabs.switch":
      return await switchTab(payload);
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
    case "scripts.list":
      return await listUserScripts();
    case "scripts.install":
      return await installUserScript(payload);
    case "scripts.remove":
      return await removeUserScript(payload);
    case "scripts.setEnabled":
      return await setUserScriptEnabled(payload);
    case "scripts.run":
      return await runUserScript(payload);
    case "scripts.runCode":
      return await runUserScriptCode(payload);
    case "github.createRepository":
      return await runInActiveTab(createGithubRepository, [payload]);
    case "github.inspectNewRepositoryPage":
      return await runInActiveTab(inspectGithubPage);
    case "github.updateRepositoryAbout":
      return await runInActiveTab(updateGithubRepositoryAbout, [payload]);
    case "github.deleteRepository":
      return await runInActiveTab(deleteGithubRepository, [payload]);
    default:
      throw new Error(`未知动作：${action}`);
  }
}

async function switchTab({ tabId }) {
  if (!Number.isInteger(tabId)) throw new Error("tabId 必须是整数");
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  return { tabId: tab.id, title: tab.title, url: tab.url };
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
  return await runInTab(tab.id, func, args);
}

async function runInTab(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });
  return { tabId, result: result?.result };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前活动标签页");
  return tab;
}

function isInjectableUrl(url) {
  return /^https?:\/\//i.test(url);
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

async function getStoredScripts() {
  const data = await chrome.storage.local.get(USER_SCRIPTS_KEY);
  return Array.isArray(data[USER_SCRIPTS_KEY]) ? data[USER_SCRIPTS_KEY] : [];
}

async function saveStoredScripts(scripts) {
  await chrome.storage.local.set({ [USER_SCRIPTS_KEY]: scripts });
}

async function listUserScripts() {
  const scripts = await getStoredScripts();
  return {
    count: scripts.length,
    scripts: scripts.map(toScriptSummary)
  };
}

async function installUserScript({ source, name = "", enabled = true }) {
  if (!source || typeof source !== "string") throw new Error("source 不能为空");

  const scripts = await getStoredScripts();
  const metadata = parseUserScriptMetadata(source);
  const id = createScriptId(name || metadata.name || "script");
  const now = new Date().toISOString();
  const script = {
    id,
    name: name || metadata.name || id,
    description: metadata.description || "",
    version: metadata.version || "",
    author: metadata.author || "",
    matches: metadata.match.length ? metadata.match : ["*://*/*"],
    includes: metadata.include,
    excludes: metadata.exclude,
    grants: metadata.grant,
    runAt: metadata["run-at"] || "document-idle",
    enabled,
    source,
    createdAt: now,
    updatedAt: now
  };

  scripts.push(script);
  await saveStoredScripts(scripts);
  return { installed: true, script: toScriptSummary(script) };
}

async function removeUserScript({ id }) {
  const scripts = await getStoredScripts();
  const next = scripts.filter((script) => script.id !== id);
  if (next.length === scripts.length) throw new Error(`没有找到脚本：${id}`);
  await saveStoredScripts(next);
  return { removed: true, id };
}

async function setUserScriptEnabled({ id, enabled }) {
  const scripts = await getStoredScripts();
  const script = scripts.find((item) => item.id === id);
  if (!script) throw new Error(`没有找到脚本：${id}`);
  script.enabled = Boolean(enabled);
  script.updatedAt = new Date().toISOString();
  await saveStoredScripts(scripts);
  return { updated: true, script: toScriptSummary(script) };
}

async function runUserScript({ id, tabId }) {
  const scripts = await getStoredScripts();
  const script = scripts.find((item) => item.id === id);
  if (!script) throw new Error(`没有找到脚本：${id}`);
  const targetTab = Number.isInteger(tabId) ? { id: tabId } : await getActiveTab();
  const result = await executeUserScript(targetTab.id, script);
  return { script: toScriptSummary(script), ...result };
}

async function runUserScriptCode({ source, name = "临时脚本", tabId }) {
  if (!source || typeof source !== "string") throw new Error("source 不能为空");
  const metadata = parseUserScriptMetadata(source);
  const script = {
    id: `temp-${Date.now()}`,
    name: name || metadata.name || "临时脚本",
    matches: metadata.match.length ? metadata.match : ["*://*/*"],
    includes: metadata.include,
    excludes: metadata.exclude,
    grants: metadata.grant,
    runAt: metadata["run-at"] || "document-idle",
    enabled: true,
    source
  };
  const targetTab = Number.isInteger(tabId) ? { id: tabId } : await getActiveTab();
  return await executeUserScript(targetTab.id, script);
}

async function injectMatchingUserScripts(tabId, url) {
  const scripts = await getStoredScripts();
  const matched = scripts.filter((script) => script.enabled && matchesUserScript(script, url));
  for (const script of matched) {
    await executeUserScript(tabId, script, { automatic: true });
  }
}

async function executeUserScript(tabId, script, options = {}) {
  ensureUserScriptsAvailable();
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || !isInjectableUrl(tab.url)) {
    throw new Error("当前标签页不支持注入脚本");
  }
  if (!options.ignoreMatch && !matchesUserScript(script, tab.url)) {
    return {
      tabId,
      skipped: true,
      reason: "当前网址不匹配脚本规则",
      url: tab.url
    };
  }

  const [result] = await chrome.userScripts.execute({
    target: { tabId },
    js: [{ code: buildUserScriptCode(script) }],
    injectImmediately: true,
    world: "USER_SCRIPT"
  });

  return {
    tabId,
    url: tab.url,
    automatic: Boolean(options.automatic),
    result: result?.result
  };
}

function parseUserScriptMetadata(source) {
  const metadata = {
    name: "",
    description: "",
    version: "",
    author: "",
    match: [],
    include: [],
    exclude: [],
    grant: []
  };
  const block = source.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!block) return metadata;

  for (const line of block[1].split(/\r?\n/)) {
    const item = line.match(/^\s*\/\/\s*@([A-Za-z0-9:_-]+)\s+(.+?)\s*$/);
    if (!item) continue;
    const key = item[1];
    const value = item[2];
    if (["match", "include", "exclude", "grant"].includes(key)) {
      metadata[key].push(value);
    } else {
      metadata[key] = value;
    }
  }
  return metadata;
}

function toScriptSummary(script) {
  return {
    id: script.id,
    name: script.name,
    description: script.description || "",
    version: script.version || "",
    author: script.author || "",
    enabled: Boolean(script.enabled),
    matches: script.matches || [],
    includes: script.includes || [],
    excludes: script.excludes || [],
    grants: script.grants || [],
    runAt: script.runAt || "document-idle",
    createdAt: script.createdAt || "",
    updatedAt: script.updatedAt || ""
  };
}

function createScriptId(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "script";
  return `${slug}-${Date.now().toString(36)}`;
}

function matchesUserScript(script, url) {
  const excludes = script.excludes || [];
  if (excludes.some((pattern) => matchesPattern(pattern, url))) return false;

  const includes = script.includes || [];
  if (includes.length && includes.some((pattern) => matchesPattern(pattern, url))) return true;

  const matches = script.matches?.length ? script.matches : ["*://*/*"];
  return matches.some((pattern) => matchesPattern(pattern, url));
}

function matchesPattern(pattern, url) {
  if (!pattern || pattern === "<all_urls>") return true;
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    return new RegExp(pattern.slice(1, -1)).test(url);
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(url);
}

function ensureUserScriptsAvailable() {
  if (!chrome.userScripts?.execute) {
    throw new Error("当前 Chrome 没有开放 chrome.userScripts.execute。请确认扩展已授予 userScripts 权限，并在 chrome://extensions 打开开发者模式。");
  }
}

function buildUserScriptCode(script) {
  return `
(async () => {
  const __script = ${JSON.stringify({ id: script.id, name: script.name })};
  const __logs = [];
  const __storagePrefix = "ss-mcp-chrome:" + __script.id + ":";
  const __serialize = (value) => {
    if (value === undefined) return null;
    try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
  };
  const __pushLog = (level, args) => {
    __logs.push({
      level,
      args: Array.from(args).map((item) => {
        try { return typeof item === "string" ? item : JSON.stringify(item); } catch { return String(item); }
      })
    });
  };
  const console = {
    log: (...args) => { __pushLog("log", args); globalThis.console.log(...args); },
    info: (...args) => { __pushLog("info", args); globalThis.console.info(...args); },
    warn: (...args) => { __pushLog("warn", args); globalThis.console.warn(...args); },
    error: (...args) => { __pushLog("error", args); globalThis.console.error(...args); }
  };
  const GM_info = { script: { name: __script.name, id: __script.id } };
  const GM_getValue = (key, defaultValue = undefined) => {
    const raw = localStorage.getItem(__storagePrefix + key);
    if (raw === null) return defaultValue;
    try { return JSON.parse(raw); } catch { return raw; }
  };
  const GM_setValue = (key, value) => localStorage.setItem(__storagePrefix + key, JSON.stringify(value));
  const GM_deleteValue = (key) => localStorage.removeItem(__storagePrefix + key);
  const GM_addStyle = (css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
    return style;
  };
  const GM_log = (...args) => console.log(...args);
  const GM_xmlhttpRequest = (details) => {
    const controller = new AbortController();
    fetch(details.url, {
      method: details.method || "GET",
      headers: details.headers,
      body: details.data,
      signal: controller.signal,
      credentials: details.anonymous ? "omit" : "include"
    })
      .then(async (response) => {
        const responseText = await response.text();
        details.onload?.({ status: response.status, statusText: response.statusText, responseText, finalUrl: response.url });
      })
      .catch((error) => details.onerror?.({ error: String(error) }));
    return { abort: () => controller.abort() };
  };
  try {
    const unsafeWindow = globalThis;
    const value = await (async () => {
${script.source}
//# sourceURL=ss-mcp-chrome-user-script-${script.id}.js
    })();
    return { ok: true, value: __serialize(value), logs: __logs };
  } catch (error) {
    return { ok: false, error: error.message || String(error), stack: error.stack || "", logs: __logs };
  }
})()
`;
}

function serializeScriptValue(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

async function updateGithubRepositoryAbout({ description = "", homepage = "" }) {
  const repoMatch = location.pathname.match(/^\/([^/]+)\/([^/]+)/);
  if (!repoMatch) throw new Error("当前页面不是 GitHub 仓库页面");

  const [, owner, repo] = repoMatch;
  const targetPath = `/${owner}/${repo}/settings/update_meta`;
  const editButton = [...document.querySelectorAll("button, a")]
    .find((element) => /edit/i.test(element.textContent || "") && element.closest("aside, .Layout-sidebar, [class*='sidebar']"));
  editButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 300));

  const descriptionInput = document.querySelector("#repo_description, input[name='repo_description']");
  const homepageInput = document.querySelector("#repo_homepage, input[name='repo_homepage']");
  const form = descriptionInput?.closest("form") || document.querySelector(`form[action$="${targetPath}"], form[action*="/settings/update_meta"]`);
  if (!form) throw new Error("没有找到 GitHub About 表单");

  const setValue = (element, value) => {
    if (!element) return;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  setValue(descriptionInput, description);
  setValue(homepageInput, homepage);

  const body = new FormData(form);
  body.set("repo_description", description);
  body.set("repo_homepage", homepage);

  const response = await fetch(form.action || targetPath, {
    method: "POST",
    body,
    credentials: "same-origin",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok && !response.redirected) {
    throw new Error(`GitHub About 保存失败：HTTP ${response.status}`);
  }

  location.href = `/${owner}/${repo}`;
  return {
    updated: true,
    owner,
    repo,
    description,
    homepage,
    status: response.status,
    redirected: response.redirected
  };
}

async function deleteGithubRepository({ fullName }) {
  if (!/^[-\w]+\/[-.\w]+$/.test(fullName || "")) {
    throw new Error("fullName 必须是 owner/repo 格式");
  }

  const [owner, repo] = fullName.split("/");
  const expectedSettingsPath = `/${owner}/${repo}/settings`;
  if (location.pathname !== expectedSettingsPath) {
    location.href = expectedSettingsPath;
    return { step: "navigating", fullName, url: location.href };
  }

  const clickButtonByText = (patterns) => {
    const button = [...document.querySelectorAll("button, input[type='submit'], [role='button']")]
      .find((element) => {
        const text = (element.innerText || element.value || element.getAttribute("aria-label") || "").trim();
        return patterns.some((pattern) => pattern.test(text));
      });
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return true;
  };

  const setInput = (selector, value) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const deleteForm = document.querySelector(`form[action$="/${owner}/${repo}/settings/delete"], form[action$="/settings/delete"]`);
  const visibleVerify = [...document.querySelectorAll("input[name='verify']:not([type='hidden']), input[aria-label], input[type='text']")]
    .find((element) => element.offsetParent !== null);
  if (visibleVerify) {
    setInput("input[name='verify']:not([type='hidden']), input[type='text']", fullName);
  }

  if (deleteForm) {
    const body = new FormData(deleteForm);
    body.set("verify", fullName);
    const response = await fetch(deleteForm.action, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    return {
      step: "submitted",
      fullName,
      status: response.status,
      redirected: response.redirected,
      finalUrl: response.url
    };
  }

  if (clickButtonByText([/^Delete this repository$/i, /^I want to delete this repository$/i, /^I have read and understand/i])) {
    return { step: "clicked", fullName };
  }

  return {
    step: "blocked",
    fullName,
    text: document.body.innerText.slice(0, 1500)
  };
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

function inspectGithubPage() {
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
