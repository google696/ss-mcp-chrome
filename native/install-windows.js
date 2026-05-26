#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const nodePath = process.execPath;
const hostScript = path.join(rootDir, "native", "host.js");
const launcherPath = path.join(rootDir, "native", "ss-mcp-chrome-native-host.cmd");
const manifestPath = path.join(rootDir, "native", "ss-mcp-chrome-native.json");
const extensionManifestPath = path.join(rootDir, "extension", "manifest.json");
const hostName = "com.google696.ss_mcp_chrome";
const extensionId = readArg("--extension-id") || process.env.SS_MCP_CHROME_EXTENSION_ID || readExtensionIdFromManifest();

if (process.platform !== "win32") {
  throw new Error("当前安装脚本只支持 Windows。");
}

if (!extensionId) {
  throw new Error("缺少扩展 ID。用法：npm run native:install -- --extension-id=<chrome扩展ID>");
}

fs.writeFileSync(launcherPath, `@echo off\r\n"${nodePath}" "${hostScript}"\r\n`, "utf8");
fs.writeFileSync(manifestPath, JSON.stringify({
  name: hostName,
  description: "SS MCP Chrome Native Host",
  path: launcherPath,
  type: "stdio",
  allowed_origins: [
    `chrome-extension://${extensionId}/`
  ]
}, null, 2), "utf8");

const registryKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
execFileSync("reg", ["add", registryKey, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  hostName,
  extensionId,
  manifestPath,
  launcherPath
}, null, 2));

function readArg(name) {
  const prefix = `${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

function readExtensionIdFromManifest() {
  if (!fs.existsSync(extensionManifestPath)) return "";
  const manifest = JSON.parse(fs.readFileSync(extensionManifestPath, "utf8"));
  if (!manifest.key) return "";
  const der = Buffer.from(manifest.key, "base64");
  const hex = createHash("sha256").update(der).digest("hex").slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + Number.parseInt(char, 16)));
}
