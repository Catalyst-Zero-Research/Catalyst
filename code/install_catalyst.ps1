$ErrorActionPreference = "Stop"

$codeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$binRoot = Join-Path $codeRoot "bin"
New-Item -ItemType Directory -Force -Path $binRoot | Out-Null

$cmdPath = Join-Path $binRoot "catalyst.cmd"
$ps1Path = Join-Path $binRoot "catalyst.ps1"
$launcher = Join-Path $codeRoot "start_catalyst.ps1"

@"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "$launcher"
"@ | Set-Content -Path $cmdPath -Encoding ASCII

@"
& "$launcher"
"@ | Set-Content -Path $ps1Path -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (($userPath -split ";") -contains $binRoot)) {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binRoot", "User")
    Write-Host "Added Catalyst launcher to user PATH: $binRoot"
    Write-Host "Open a new terminal, then run: catalyst"
} else {
    Write-Host "Catalyst launcher already on user PATH: $binRoot"
}
