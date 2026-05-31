$ErrorActionPreference = "Stop"

$codeRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $codeRoot
$pipelineRoot = Join-Path $codeRoot "backend\pipeline"
$frontendRoot = Join-Path $codeRoot "frontend"
$logsRoot = Join-Path $repoRoot "data\local\logs"

New-Item -ItemType Directory -Force -Path $logsRoot | Out-Null

$env:PYTHONPATH = $pipelineRoot
$env:CATALYST_REPO_ROOT = $repoRoot
$env:CATALYST_API_PORT = "8766"

Write-Host "Catalyst"
Write-Host "Running preflight..."

$apiUrl = "http://127.0.0.1:8766"
$frontendUrl = "http://127.0.0.1:5173"
$reuseBackend = $false
try {
    $health = Invoke-RestMethod -Method Get -Uri "$apiUrl/health" -TimeoutSec 2
    $reuseBackend = ($health.status -eq "ok" -and $health.backend)
} catch {
    $reuseBackend = $false
}

$checkPorts = if ($reuseBackend) { "False" } else { "True" }
$preflight = & python -c "import sys; from pathlib import Path; sys.path.insert(0, r'$pipelineRoot'); from catalyst.preflight import run_preflight, print_preflight; r=run_preflight(Path(r'$repoRoot'), check_ports=$checkPorts); print_preflight(r); raise SystemExit(0 if r['status']=='ok' else 1)"
if ($LASTEXITCODE -ne 0) {
    Write-Host $preflight
    exit $LASTEXITCODE
}
Write-Host $preflight
if ($reuseBackend) {
    Write-Host "  existing_backend: ok ($apiUrl)"
}

$backendLog = Join-Path $logsRoot "backend.log"
$backendErr = Join-Path $logsRoot "backend.err.log"
$frontendLog = Join-Path $logsRoot "frontend.log"
$frontendErr = Join-Path $logsRoot "frontend.err.log"
$pidFile = Join-Path $logsRoot "catalyst.pids.json"
$script:CatalystStop = $false
$script:CatalystChildPids = @()
$script:CatalystCancelSubscription = $null

function Stop-ProcessTree {
    param(
        [Parameter(Mandatory = $true)]
        [int]$RootPid
    )

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $RootPid" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -RootPid ([int]$child.ProcessId)
    }

    Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
}

function Stop-CatalystChildren {
    foreach ($procId in $script:CatalystChildPids) {
        Stop-ProcessTree -RootPid ([int]$procId)
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

$script:CatalystCancelSubscription = Register-ObjectEvent -InputObject ([Console]) -EventName CancelKeyPress -SourceIdentifier "CatalystCancelKeyPress" -Action {
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    $script:CatalystStop = $true
    Stop-CatalystChildren
}

$backend = $null
if (-not $reuseBackend) {
    $backend = Start-Process python -ArgumentList @("-m", "catalyst.local_api") -WorkingDirectory $repoRoot -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2
}

$frontend = $null
$reuseFrontend = $false
try {
    Invoke-RestMethod -Method Get -Uri $frontendUrl -TimeoutSec 2 | Out-Null
    $reuseFrontend = $true
} catch {
    $reuseFrontend = $false
}
if (-not $reuseFrontend) {
    $frontend = Start-Process npm.cmd -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") -WorkingDirectory $frontendRoot -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr -WindowStyle Hidden -PassThru
}

$script:CatalystChildPids = @()
if ($backend) { $script:CatalystChildPids += $backend.Id }
if ($frontend) { $script:CatalystChildPids += $frontend.Id }
@{
    backend = if ($backend) { $backend.Id } else { "existing" }
    frontend = if ($frontend) { $frontend.Id } else { "existing" }
} | ConvertTo-Json | Set-Content -Path $pidFile -Encoding ASCII

Write-Host "Preflight: ok"
Write-Host "Backend:   $apiUrl"
Write-Host "Frontend:  $frontendUrl"
Write-Host "Logs:      $logsRoot"
Write-Host "Press Ctrl+C to stop."

try {
    while (-not $script:CatalystStop) {
        Start-Sleep -Seconds 1
        if ($backend) {
            $backend.Refresh()
            if ($backend.HasExited) { break }
        }
        if ($frontend) {
            $frontend.Refresh()
            if ($frontend.HasExited) { break }
        }
    }
}
finally {
    Unregister-Event -SourceIdentifier "CatalystCancelKeyPress" -ErrorAction SilentlyContinue
    if ($script:CatalystCancelSubscription) {
        Remove-Job -Id $script:CatalystCancelSubscription.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-CatalystChildren
}
