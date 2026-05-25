const statusEl = document.querySelector("#status");
const detailEl = document.querySelector("#detail");
const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: "status" });
  renderStatus(response);
}

function renderStatus(response) {
  statusEl.textContent = response.label || (response.connected ? "已连接" : "未连接");
  detailEl.textContent = response.detail || "";
  connectButton.disabled = response.state === "connecting";
  disconnectButton.disabled = !response.connected && response.state !== "connecting";
}

connectButton.addEventListener("click", async () => {
  renderStatus({ state: "connecting", label: "正在连接...", detail: "正在连接 ws://127.0.0.1:12307" });
  const response = await chrome.runtime.sendMessage({ type: "connect" });
  renderStatus(response);
});

disconnectButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "disconnect" });
  renderStatus(response);
});

refreshStatus();
