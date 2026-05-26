#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "extension");
const distDir = path.join(rootDir, "dist");
const targetDir = path.join(distDir, "ss-mcp-chrome-extension");
const manifestPath = path.join(sourceDir, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  throw new Error(`缺少扩展清单：${manifestPath}`);
}

JSON.parse(fs.readFileSync(manifestPath, "utf8"));

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(JSON.stringify({
  ok: true,
  loadDirectory: targetDir,
  manifest: path.join(targetDir, "manifest.json")
}, null, 2));
