$ErrorActionPreference = "Stop"

$repoRoot = "E:\Coding\catalyst"
$pipelineRoot = Join-Path $repoRoot "code\backend\pipeline"

$env:PYTHONPATH = $pipelineRoot
$env:CATALYST_REPO_ROOT = $repoRoot

Set-Location $repoRoot
python -c "import uvicorn; uvicorn.run('catalyst.local_api:app', host='127.0.0.1', port=8766, reload=False)"
