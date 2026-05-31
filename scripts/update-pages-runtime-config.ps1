param(
  [string]$HostAlias = "mini",
  [string]$Repo = "Catalyst-Zero-Research/Catalyst",
  [switch]$NoDeploy
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

$secretValue = $config.apiBaseUrl
$secretValue | gh secret set CATALYST_API_BASE_URL --repo $Repo

if (-not $NoDeploy) {
  Run "gh workflow run pages.yml --repo $Repo --ref main"
  Write-Host "Updated CATALYST_API_BASE_URL and triggered GitHub Pages redeploy for $Repo."
} else {
  Write-Host "Updated CATALYST_API_BASE_URL. Deploy trigger skipped because -NoDeploy was set."
}
