const statusEl = document.querySelector("#status");
const statusLightEl = document.querySelector("#statusLight");
const detailEl = document.querySelector("#detail");
const connectionButton = document.querySelector("#connectionButton");
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
    const row = document.createElement("div");
    row.className = matched ? "script-row matched" : "script-row";
    row.title = matched ? `当前页面命中：${activeUrl}` : "";

    const top = document.createElement("div");
    top.className = "script-row-top";

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
    editButton.textContent = "编辑";
    editButton.addEventListener("click", () => openEditor(script));

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "运行";
    runButton.addEventListener("click", async () => {
      setEditorMessage("正在运行...");
      const result = await sendAction("scripts.run", { id: script.id });
      setEditorMessage(result.result?.ok === false ? `运行失败：${result.result.error}` : "脚本已运行");
    });

    top.append(checkbox, main, expandButton, editButton, runButton);
    row.append(top);

    if (expanded) {
      row.append(createPatternDetails(script));
    }

    scriptListEl.append(row);
  }
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

function openEditor(script = null) {
  editingId = script?.id || "";
  editorTitleEl.textContent = editingId ? "编辑脚本" : "新建脚本";
  scriptNameEl.value = script?.name || "";
  scriptSourceEl.value = script?.source || DEFAULT_SOURCE;
  deleteScriptButton.hidden = !editingId;
  runScriptButton.textContent = editingId ? "运行" : "临时运行";
  setEditorMessage("");
  editorEl.hidden = false;
  scriptNameEl.focus();
}

function closeEditor() {
  editingId = "";
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

newScriptButton.addEventListener("click", () => openEditor());
closeEditorButton.addEventListener("click", closeEditor);

editorEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  setEditorMessage("正在保存...");
  if (editingId) {
    await sendAction("scripts.remove", { id: editingId });
  }
  const result = await sendAction("scripts.install", {
    name: scriptNameEl.value.trim(),
    source: scriptSourceEl.value,
    enabled: true
  });
  editingId = result.script.id;
  setEditorMessage("已保存");
  await refreshScripts();
  openEditor(scripts.find((script) => script.id === editingId));
});

runScriptButton.addEventListener("click", async () => {
  setEditorMessage("正在运行...");
  const result = editingId
    ? await sendAction("scripts.run", { id: editingId })
    : await sendAction("scripts.runCode", {
      name: scriptNameEl.value.trim() || "临时脚本",
      source: scriptSourceEl.value
    });
  setEditorMessage(result.result?.ok === false ? `运行失败：${result.result.error}` : "脚本已运行");
});

deleteScriptButton.addEventListener("click", async () => {
  if (!editingId) return;
  await sendAction("scripts.remove", { id: editingId });
  expandedScripts.delete(editingId);
  closeEditor();
  await refreshScripts();
});

await refreshStatus();
await refreshScripts();
