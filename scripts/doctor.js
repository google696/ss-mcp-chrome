#!/usr/bin/env node
import { createHash, createPublicKey } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, "extension", "manifest.json");
const nativeManifestPath = path.join(rootDir, "native", "ss-mcp-chrome-native.json");
const hostName = "com.google696.ss_mcp_chrome";

const checks = [];

await checkNode();
checkPackageInstall();
checkManifest();
const debugStatus = await httpStatus(12308);
await checkWebSocketPort(debugStatus);
checkDebugHttp(debugStatus);
checkNativeHostFiles();
checkWindowsNativeRegistry();

for (const check of checks) {
  const mark = check.ok ? "OK " : "BAD";
  console.log(`[${mark}] ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.log("");
  console.log(`Doctor found ${failed.length} problem(s).`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Doctor passed.");
}

async function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  add("Node.js 20+", major >= 20, process.versions.node);
}

function checkPackageInstall() {
  add("node_modules installed", fs.existsSync(path.join(rootDir, "node_modules")), "run npm install if missing");
  add("package-lock.json", fs.existsSync(path.join(rootDir, "package-lock.json")), "lockfile present");
}

function checkManifest() {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    add("extension manifest", true, manifestPath);
    add("manifest version", manifest.manifest_version === 3, `MV${manifest.manifest_version}`);
    const extensionId = getExtensionId(manifest);
    add("manifest key", Boolean(extensionId), extensionId || "missing key");
    add("nativeMessaging permission", manifest.permissions?.includes("nativeMessaging"), "required for one-click start");
    add("downloads permission", manifest.permissions?.includes("downloads"), "required for screenshot save");
  } catch (error) {
    add("extension manifest", false, error.message || String(error));
  }
}

async function checkWebSocketPort(debugStatus) {
  const free = await isPortFree(12307);
  if (free) {
    add("WebSocket port 12307", true, "available");
    return;
  }
  add("WebSocket port 12307", debugStatus.ok, debugStatus.ok ? "service appears to be running" : "already in use");
}

function checkDebugHttp(status) {
  if (!status.reachable) {
    add("debug HTTP 12308", true, "not running; this is OK before service start");
    return;
  }
  add("debug HTTP 12308", status.ok, status.detail);
}

function checkNativeHostFiles() {
  if (!fs.existsSync(nativeManifestPath)) {
    add("Native Host manifest", false, "run npm run native:install");
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(nativeManifestPath, "utf8"));
    const extensionId = getExtensionId(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    add("Native Host manifest", data.name === hostName, nativeManifestPath);
    add("Native Host allowed origin", data.allowed_origins?.includes(`chrome-extension://${extensionId}/`), extensionId);
    add("Native Host launcher", fs.existsSync(data.path), data.path || "missing path");
  } catch (error) {
    add("Native Host manifest", false, error.message || String(error));
  }
}

function checkWindowsNativeRegistry() {
  if (process.platform !== "win32") {
    add("Windows Native Host registry", true, "skipped on non-Windows");
    return;
  }

  const registryFile = path.join(os.homedir(), "AppData", "Local", "Temp", `ss-mcp-chrome-reg-${Date.now()}.txt`);
  try {
    execFileSync("reg", [
      "query",
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`,
      "/ve"
    ], { stdio: ["ignore", fs.openSync(registryFile, "w"), "ignore"] });
    const output = fs.readFileSync(registryFile, "utf8");
    add("Windows Native Host registry", output.includes(nativeManifestPath), nativeManifestPath);
  } catch {
    add("Windows Native Host registry", false, "run npm run native:install");
  } finally {
    fs.rmSync(registryFile, { force: true });
  }
}

function getExtensionId(manifest) {
  if (!manifest.key) return "";
  const der = Buffer.from(manifest.key, "base64");
  createPublicKey({ key: der, format: "der", type: "spki" });
  const hex = createHash("sha256").update(der).digest("hex").slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + Number.parseInt(char, 16)));
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function httpStatus(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/status", timeout: 600 }, (response) => {
      response.resume();
      resolve({ reachable: true, ok: response.statusCode === 200, detail: `HTTP ${response.statusCode}` });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ reachable: false, ok: false, detail: "timeout" });
    });
    request.on("error", () => resolve({ reachable: false, ok: false, detail: "not running" }));
  });
}

function add(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}
