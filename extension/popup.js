const statusEl = document.querySelector("#status");
const detailEl = document.querySelector("#detail");
const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");
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
  statusEl.textContent = response.label || (response.connected ? "已连接" : "未连接");
  detailEl.textContent = response.detail || "";
  connectButton.disabled = response.state === "connecting";
  disconnectButton.disabled = !response.connected && response.state !== "connecting";
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
    meta.textContent = matched ? "当前页面匹配" : ((script.matches || []).join(", ") || "*://*/*");

    main.append(name, meta);

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

    row.append(checkbox, main, editButton, runButton);
    scriptListEl.append(row);
  }
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

connectButton.addEventListener("click", async () => {
  renderStatus({
    state: "connecting",
    label: "正在连接...",
    detail: "正在连接 ws://127.0.0.1:12307"
  });
  const response = await chrome.runtime.sendMessage({ type: "connect" });
  renderStatus(response);
});

disconnectButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "disconnect" });
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
  closeEditor();
  await refreshScripts();
});

await refreshStatus();
await refreshScripts();
