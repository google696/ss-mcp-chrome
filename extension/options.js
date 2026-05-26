const wsUrlEl = document.querySelector("#wsUrl");
const debugHttpUrlEl = document.querySelector("#debugHttpUrl");
const nativeHostNameEl = document.querySelector("#nativeHostName");
const autoConnectEl = document.querySelector("#autoConnect");
const saveSettingsButton = document.querySelector("#saveSettings");
const copyConfigButton = document.querySelector("#copyConfig");
const toolMessageEl = document.querySelector("#toolMessage");

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
  await sendRuntimeMessage({
    type: "settings.save",
    settings: {
      wsUrl: wsUrlEl.value.trim(),
      debugHttpUrl: debugHttpUrlEl.value.trim(),
      nativeHostName: nativeHostNameEl.value.trim(),
      autoConnect: autoConnectEl.checked
    }
  });
  toolMessageEl.textContent = "设置已保存";
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

saveSettingsButton.addEventListener("click", async () => {
  try {
    await saveSettings();
  } catch (error) {
    toolMessageEl.textContent = error.message || String(error);
  }
});

copyConfigButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildClientConfig());
  toolMessageEl.textContent = "接入配置已复制";
});

await loadSettings();
