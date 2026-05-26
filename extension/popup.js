const statusEl = document.querySelector("#status");
const statusLightEl = document.querySelector("#statusLight");
const detailEl = document.querySelector("#detail");
const connectionButton = document.querySelector("#connectionButton");
const nativeStartButton = document.querySelector("#nativeStart");
const saveScreenshotButton = document.querySelector("#saveScreenshot");
const pickSelectorButton = document.querySelector("#pickSelector");
const toolMessageEl = document.querySelector("#toolMessage");
const wsUrlEl = document.querySelector("#wsUrl");
const debugHttpUrlEl = document.querySelector("#debugHttpUrl");
const nativeHostNameEl = document.querySelector("#nativeHostName");
const autoConnectEl = document.querySelector("#autoConnect");
const saveSettingsButton = document.querySelector("#saveSettings");
const copyConfigButton = document.querySelector("#copyConfig");
const runDiagnosticsButton = document.querySelector("#runDiagnostics");
const diagnosticsListEl = document.querySelector("#diagnosticsList");
const newScriptButton = document.querySelector("#newScript");
const scriptListEl = document.querySelector("#scriptList");
const editorEl = document.querySelector("#editor");
const editorTitleEl = document.querySelector("#editorTitle");
const closeEditorButton = document.querySelector("#closeEditor");
const scriptNameEl = document.querySelector("#scriptName");
const scriptSourceEl = document.querySelector("#scriptSource");
const editorMessageEl = document.querySelector("#editorMessage");
const runScriptButton = document.querySelector("#runScript");
const deleteScriptButton = document.querySelector("#deleteScript");

let scripts = [];
let editingId = "";
let activeUrl = "";
let connectionState = "disconnected";
const expandedScripts = new Set();

const DEFAULT_SOURCE = `// ==UserScript==
// @name         我的脚本
// @match        https://example.com/*
// @grant        GM_log
// ==/UserScript==

GM_log("当前标题", document.title);
`;

async function sendAction(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: "action", action, payload });
  if (!response?.ok) throw new Error(response?.error || "操作失败");
  return response.result;
}

async function sendRuntimeMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.ok === false) throw new Error(response.error || "操作失败");
  return response;
}

async function loadSettings() {
  const response = await sendRuntimeMessage({ type: "settings.get" });
  const settings = response.settings;
  wsUrlEl.value = settings.wsUrl;
  debugHttpUrlEl.value = settings.debugHttpUrl;
  nativeHostNameEl.value = settings.nativeHostName;
  autoConnectEl.checked = Boolean(settings.autoConnect);
}

async function saveSettings() {
  const response = await sendRuntimeMessage({
    type: "settings.save",
    settings: {
      wsUrl: wsUrlEl.value.trim(),
      debugHttpUrl: debugHttpUrlEl.value.trim(),
      nativeHostName: nativeHostNameEl.value.trim(),
      autoConnect: autoConnectEl.checked
    }
  });
  toolMessageEl.textContent = "设置已保存";
  return response.settings;
}

async function runDiagnostics() {
  diagnosticsListEl.textContent = "正在检查...";
  const response = await sendRuntimeMessage({ type: "diagnostics" });
  renderDiagnostics(response.result);
}

function renderDiagnostics(result) {
  diagnosticsListEl.textContent = "";
  for (const item of result.checks || []) {
    const row = document.createElement("div");
    row.className = item.ok ? "diagnostic-row ok" : "diagnostic-row bad";
    const light = document.createElement("span");
    const name = document.createElement("strong");
    const detail = document.createElement("small");
    name.textContent = item.name;
    detail.textContent = item.detail || "";
    row.append(light, name, detail);
    diagnosticsListEl.append(row);
  }
}

function buildClientConfig() {
  return `[mcp_servers.ss-mcp-chrome]
command = "node"
args = ["D:\\\\mcp\\\\ss-mcp-chrome\\\\server\\\\src\\\\index.js"]

OpenClaw Streamable HTTP:
http://127.0.0.1:12308/mcp

Native Host 安装:
npm run native:install -- --extension-id=${chrome.runtime.id}`;
}

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: "status" });
  renderStatus(response);
}

async function refreshActiveUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeUrl = tab?.url || "";
}

function renderStatus(response) {
  connectionState = response.connected ? "connected" : (response.state || "disconnected");
  if (connectionState !== "connecting" && connectionState !== "connected") {
    connectionState = "disconnected";
  }

  statusEl.textContent = response.label || (connectionState === "connected" ? "已连接" : "未连接");
  detailEl.textContent = response.detail || "";
  statusLightEl.className = `status-light ${connectionState}`;
  connectionButton.className = connectionState === "connected" ? "connected" : "disconnected";
  connectionButton.disabled = connectionState === "connecting";
  connectionButton.textContent = connectionState === "connected" ? "断开" : (connectionState === "connecting" ? "连接中..." : "连接");
}

async function refreshScripts() {
  await refreshActiveUrl();
  const result = await sendAction("scripts.list");
  scripts = result.scripts || [];
  renderScripts();
}

function renderScripts() {
  scriptListEl.textContent = "";
  if (!scripts.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有脚本";
    scriptListEl.append(empty);
    return;
  }

  for (const script of scripts) {
    const matched = isScriptMatched(script, activeUrl);
    const expanded = expandedScripts.has(script.id);
    const isEditing = editingId === script.id;
    const row = document.createElement("div");
    row.className = matched ? "script-row matched" : "script-row";
    row.title = matched ? `当前页面命中：${activeUrl}` : "";

    const checkbox = document.createElement("input");
    checkbox.className = "toggle";
    checkbox.type = "checkbox";
    checkbox.checked = script.enabled;
    checkbox.title = script.enabled ? "停用" : "启用";
    checkbox.addEventListener("change", async () => {
      await sendAction("scripts.setEnabled", { id: script.id, enabled: checkbox.checked });
      await refreshScripts();
    });

    const main = document.createElement("div");
    main.className = "script-main";

    const name = document.createElement("div");
    name.className = "script-name";
    name.textContent = script.name || script.id;

    const meta = document.createElement("div");
    meta.className = "script-meta";
    meta.textContent = matched ? "当前页面匹配" : getPrimaryPattern(script);

    main.append(name, meta);

    if (expanded) {
      main.append(createPatternDetails(script));
    }
    const inlineEditor = isEditing ? createInlineEditor(script) : null;

    const expandButton = document.createElement("button");
    expandButton.className = "expand-button";
    expandButton.type = "button";
    expandButton.textContent = expanded ? "收起" : "展开";
    expandButton.addEventListener("click", () => {
      if (expandedScripts.has(script.id)) {
        expandedScripts.delete(script.id);
      } else {
        expandedScripts.add(script.id);
      }
      renderScripts();
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = isEditing ? "收起" : "编辑";
    editButton.addEventListener("click", () => {
      editingId = isEditing ? "" : script.id;
      closeNewEditor();
      renderScripts();
    });

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "运行";
    runButton.addEventListener("click", async () => {
      const result = await sendAction("scripts.run", { id: script.id });
      if (editingId === script.id) {
        const message = document.querySelector(`#inlineMessage-${CSS.escape(script.id)}`);
        if (message) message.textContent = result.result?.ok === false ? `运行失败：${result.result.error}` : "脚本已运行";
      } else {
        setEditorMessage(result.result?.ok === false ? `运行失败：${result.result.error}` : "脚本已运行");
      }
    });

    row.append(checkbox, main, expandButton, editButton, runButton);
    if (inlineEditor) {
      row.append(inlineEditor);
    }
    scriptListEl.append(row);
  }
}

function createInlineEditor(script) {
  const form = document.createElement("form");
  form.className = "inline-editor";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "名称";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = script.name || "";
  nameInput.placeholder = "脚本名称";
  nameLabel.append(nameInput);

  const sourceLabel = document.createElement("label");
  sourceLabel.textContent = "源码";
  const sourceInput = document.createElement("textarea");
  sourceInput.spellcheck = false;
  sourceInput.value = script.source || "";
  sourceLabel.append(sourceInput);

  const message = document.createElement("p");
  message.id = `inlineMessage-${script.id}`;
  message.className = "inline-message";

  const actions = document.createElement("div");
  actions.className = "inline-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "保存";

  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.textContent = "运行";
  runButton.addEventListener("click", async () => {
    message.textContent = "正在运行...";
    const result = await sendAction("scripts.runCode", {
      name: nameInput.value.trim() || script.name || "临时脚本",
      source: sourceInput.value
    });
    message.textContent = result.result?.ok === false ? `运行失败：${result.result.error}` : "脚本已运行";
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", async () => {
    await sendAction("scripts.remove", { id: script.id });
    expandedScripts.delete(script.id);
    editingId = "";
    await refreshScripts();
  });

  actions.append(saveButton, runButton, deleteButton);
  form.append(nameLabel, sourceLabel, message, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "正在保存...";
    await sendAction("scripts.remove", { id: script.id });
    const result = await sendAction("scripts.install", {
      name: nameInput.value.trim(),
      source: sourceInput.value,
      enabled: true
    });
    editingId = result.script.id;
    message.textContent = "已保存";
    await refreshScripts();
  });

  return form;
}

function getPrimaryPattern(script) {
  return script.matches?.[0] || script.includes?.[0] || "*://*/*";
}

function createPatternDetails(script) {
  const details = document.createElement("div");
  details.className = "script-details";

  const groups = [
    ["匹配", script.matches || []],
    ["包含", script.includes || []],
    ["排除", script.excludes || []]
  ];

  for (const [label, patterns] of groups) {
    if (!patterns.length) continue;
    const group = document.createElement("div");
    group.className = "pattern-group";

    const title = document.createElement("span");
    title.className = "pattern-label";
    title.textContent = label;

    const list = document.createElement("div");
    list.className = "pattern-list";
    for (const pattern of patterns) {
      const item = document.createElement("code");
      item.textContent = pattern;
      list.append(item);
    }

    group.append(title, list);
    details.append(group);
  }

  if (!details.children.length) {
    const fallback = document.createElement("div");
    fallback.className = "pattern-group";
    fallback.textContent = "匹配：*://*/*";
    details.append(fallback);
  }

  return details;
}

function isScriptMatched(script, url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
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

function openNewEditor() {
  editingId = "";
  editorTitleEl.textContent = "新建脚本";
  scriptNameEl.value = "";
  scriptSourceEl.value = DEFAULT_SOURCE;
  deleteScriptButton.hidden = true;
  runScriptButton.textContent = "临时运行";
  setEditorMessage("");
  editorEl.hidden = false;
  scriptNameEl.focus();
  renderScripts();
}

function closeNewEditor() {
  editorEl.hidden = true;
  setEditorMessage("");
}

function setEditorMessage(message) {
  editorMessageEl.textContent = message;
}

connectionButton.addEventListener("click", async () => {
  if (connectionState === "connected") {
    const response = await chrome.runtime.sendMessage({ type: "disconnect" });
    renderStatus(response);
    return;
  }

  renderStatus({
    state: "connecting",
    label: "连接中...",
    detail: "正在连接 ws://127.0.0.1:12307"
  });
  const response = await chrome.runtime.sendMessage({ type: "connect" });
  renderStatus(response);
});

nativeStartButton.addEventListener("click", async () => {
  toolMessageEl.textContent = "正在启动本地服务...";
  try {
    const response = await sendRuntimeMessage({ type: "native.start" });
    toolMessageEl.textContent = response.result?.message || "本地服务启动请求已发送";
    await refreshStatus();
  } catch (error) {
    toolMessageEl.textContent = error.message || String(error);
  }
});

saveScreenshotButton.addEventListener("click", async () => {
  toolMessageEl.textContent = "正在保存截图...";
  try {
    const result = await sendAction("page.screenshot.save");
    toolMessageEl.textContent = `截图已保存：${result.filename}`;
  } catch (error) {
    toolMessageEl.textContent = error.message || String(error);
  }
});

pickSelectorButton.addEventListener("click", async () => {
  toolMessageEl.textContent = "请在当前页面点击一个元素...";
  try {
    const result = await sendAction("page.pickSelector");
    toolMessageEl.textContent = result.cancelled ? "已取消选择" : `选择器：${result.selector}`;
    if (!result.cancelled) await navigator.clipboard?.writeText(result.selector).catch(() => {});
  } catch (error) {
    toolMessageEl.textContent = error.message || String(error);
  }
});

saveSettingsButton.addEventListener("click", async () => {
  try {
    await saveSettings();
  } catch (error) {
    toolMessageEl.textContent = error.message || String(error);
  }
});

copyConfigButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildClientConfig());
  toolMessageEl.textContent = "配置已复制";
});

runDiagnosticsButton.addEventListener("click", async () => {
  try {
    await runDiagnostics();
  } catch (error) {
    diagnosticsListEl.textContent = error.message || String(error);
  }
});

newScriptButton.addEventListener("click", openNewEditor);
closeEditorButton.addEventListener("click", closeNewEditor);

editorEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  setEditorMessage("正在保存...");
  const result = await sendAction("scripts.install", {
    name: scriptNameEl.value.trim(),
    source: scriptSourceEl.value,
    enabled: true
  });
  setEditorMessage("已保存");
  editingId = result.script.id;
  closeNewEditor();
  await refreshScripts();
});

runScriptButton.addEventListener("click", async () => {
  setEditorMessage("正在运行...");
  const result = await sendAction("scripts.runCode", {
    name: scriptNameEl.value.trim() || "临时脚本",
    source: scriptSourceEl.value
  });
  setEditorMessage(result.result?.ok === false ? `运行失败：${result.result.error}` : "脚本已运行");
});

deleteScriptButton.addEventListener("click", async () => {
  closeNewEditor();
});

await loadSettings();
await refreshStatus();
await runDiagnostics();
await refreshScripts();
