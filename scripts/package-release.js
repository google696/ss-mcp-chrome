#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const releaseDir = path.join(distDir, "release");
const appDir = path.join(releaseDir, "ss-mcp-chrome-windows");
const extensionSource = path.join(distDir, "ss-mcp-chrome-extension");
const extensionZip = path.join(releaseDir, "ss-mcp-chrome-extension.zip");
const windowsZip = path.join(releaseDir, "ss-mcp-chrome-windows.zip");

run("node", [path.join(rootDir, "scripts", "prepare-extension.js")]);

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
fs.mkdirSync(appDir, { recursive: true });

copyProject(appDir);
copyDir(extensionSource, path.join(releaseDir, "ss-mcp-chrome-extension"));

zip(path.join(releaseDir, "ss-mcp-chrome-extension"), extensionZip);
zip(appDir, windowsZip);

console.log(JSON.stringify({
  ok: true,
  releaseDir,
  artifacts: [extensionZip, windowsZip]
}, null, 2));

function copyProject(target) {
  const includes = [
    "assets",
    "docs",
    "extension",
    "native",
    "scripts",
    "server",
    "install-windows.bat",
    "setup.ps1",
    "LICENSE",
    "package.json",
    "package-lock.json",
    "README.md"
  ];

  for (const item of includes) {
    const source = path.join(rootDir, item);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(target, item);
    if (fs.statSync(source).isDirectory()) copyDir(source, destination, true);
    else fs.copyFileSync(source, destination);
  }
}

function copyDir(source, destination, excludeBuildDirs = false) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (item) => {
      if (!excludeBuildDirs) return true;
      const normalized = item.replaceAll("\\", "/");
      return !/\/(node_modules|dist|\.git)\b/.test(normalized);
    }
  });
}

function zip(source, destination) {
  fs.rmSync(destination, { force: true });
  const ps = spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${source.replaceAll("'", "''")}\\*' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`
  ], { stdio: "inherit" });

  if (ps.status !== 0 || !fs.existsSync(destination)) {
    throw new Error(`Failed to create zip: ${destination}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}
