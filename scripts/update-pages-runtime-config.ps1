param(
  [string]$HostAlias = "mini",
  [string]$Repo = "Catalyst-Zero-Research/Catalyst",
  [string]$ConfigPath = "code/frontend/public/runtime-config.json",
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

function Run($Command) {
  Write-Host "> $Command"
  Invoke-Expression $Command
}

$remoteCommand = @'
cd ~/catalyst-live
grep -hEo "https://[-a-zA-Z0-9]+\.trycloudflare\.com" data/local/logs/cloudflared.err.log data/local/logs/cloudflared.out.log 2>/dev/null | awk "END{print}"
'@

$tunnelUrl = (ssh $HostAlias $remoteCommand).Trim()
if (-not $tunnelUrl) {
  throw "No trycloudflare URL found on $HostAlias. Start/restart the Catalyst tunnel first."
}

Write-Host "Current tunnel: $tunnelUrl"

$config = [ordered]@{
  apiBaseUrl = $tunnelUrl
}
$json = $config | ConvertTo-Json -Depth 4
Set-Content -Path $ConfigPath -Value ($json + "`n") -Encoding UTF8

Run "git diff -- $ConfigPath"

$changed = (git status --short -- $ConfigPath)
if (-not $changed) {
  Write-Host "runtime-config.json is already current."
  exit 0
}

Run "git add $ConfigPath"
Run "git commit -m `"Update Pages runtime backend URL`""

if (-not $NoPush) {
  Run "git push origin main"
  Write-Host "Pushed. GitHub Pages will redeploy from $Repo."
} else {
  Write-Host "Committed locally. Push skipped because -NoPush was set."
}
