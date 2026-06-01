param(
  [switch]$SkipNativeInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "SS MCP Chrome Windows installer" -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js 20+ is required. Install Node.js first, then run this script again."
}

$nodeVersion = (& node -p "process.versions.node").Trim()
$major = [int]($nodeVersion.Split(".")[0])
if ($major -lt 20) {
  throw "Node.js 20+ is required. Current version: $nodeVersion"
}

Write-Host "Node.js $nodeVersion detected"
Write-Host "Installing dependencies..."
npm install

Write-Host "Preparing Chrome extension..."
npm run extension:prepare

if (-not $SkipNativeInstall) {
  Write-Host "Registering Native Messaging host..."
  npm run native:install
}

Write-Host ""
Write-Host "Installation completed." -ForegroundColor Green
Write-Host "Open chrome://extensions/, enable Developer mode, then load this directory:"
Write-Host "  $Root\dist\ss-mcp-chrome-extension" -ForegroundColor Yellow
Write-Host ""
Write-Host "Run diagnostics any time with:"
Write-Host "  npm run doctor"
