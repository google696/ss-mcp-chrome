#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const serverEntry = path.join(rootDir, "server", "src", "index.js");

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  readMessages();
});

process.stdin.on("end", () => process.exit(0));

function readMessages() {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) return;
    const raw = buffer.slice(4, 4 + length).toString("utf8");
    buffer = buffer.slice(4 + length);
    handleMessage(JSON.parse(raw)).catch((error) => {
      send({ ok: false, error: error.message || String(error) });
    });
  }
}

async function handleMessage(message) {
  if (message.type !== "start") {
    send({ ok: false, error: `未知 Native Host 命令：${message.type || ""}` });
    return;
  }

  const port = parsePort(message.wsUrl, 12307);
  const debugPort = parsePort(message.debugHttpUrl, 12308);
  if (await isHttpAlive(debugPort)) {
    send({
      ok: true,
      alreadyRunning: true,
      message: `本地服务已在 http://127.0.0.1:${debugPort} 运行`
    });
    return;
  }

  const child = spawn(process.execPath, [serverEntry, "--bridge-only"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SS_MCP_CHROME_PORT: String(port),
      SS_MCP_CHROME_DEBUG_PORT: String(debugPort)
    }
  });
  child.unref();

  send({
    ok: true,
    started: true,
    pid: child.pid,
    message: `本地服务启动中：ws://127.0.0.1:${port}`
  });
}

function parsePort(value, fallback) {
  try {
    return Number(new URL(String(value)).port || fallback);
  } catch {
    return fallback;
  }
}

function isHttpAlive(port) {
  return new Promise((resolve) => {
    const request = http.get({
      host: "127.0.0.1",
      port,
      path: "/status",
      timeout: 500
    }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}
