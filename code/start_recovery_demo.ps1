$ErrorActionPreference = "Stop"

$codeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $codeRoot
$backendRoot = Join-Path $codeRoot "backend"
$pipelineRoot = Join-Path $backendRoot "pipeline"
$frontendRoot = Join-Path $codeRoot "frontend"

$env:PYTHONPATH = $pipelineRoot
$env:CATALYST_REPO_ROOT = $repoRoot
$env:CATALYST_SOURCE_RELEASE = "v2025.09.25"

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd `"$backendRoot`"; `$env:PYTHONPATH='$pipelineRoot'; `$env:CATALYST_REPO_ROOT='$repoRoot'; python -m catalyst.local_api"
)

Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd `"$frontendRoot`"; npm run dev"
)

Write-Host "Catalyst API:    http://127.0.0.1:8766"
Write-Host "Catalyst UI:     http://127.0.0.1:5173"

