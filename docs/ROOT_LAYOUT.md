# Catalyst Repository Layout

The shipping repository keeps source, data, docs, and launcher scripts at the
root:

```text
code/
data/
docs/
scripts/
catalyst.ps1
catalyst.sh
```

## data

Processed Catalyst Materials Project artifacts plus local runtime state.

Important processed release:

```text
data/processed/catalyst/v2025.09.25/
```

`data/local/` is recreated by the app for sessions, logs, settings, exports, and
research runs. Do not commit real runtime state or secrets.

## docs

Concise project documentation for running and submitting the app.

Start here:

```text
docs/README.md
docs/API_CONTRACT.md
docs/RUNBOOK.md
docs/DEMO_PROMPTS.md
docs/SUBMISSION_PACK.md
```

## code

Runnable source code.

```text
code/backend/pipeline/   Python pipeline, local store, FastAPI backend
code/backend/tests/      Backend contract and recovery tests
code/frontend/           Current React/Vite UI
```

Run backend from the repo root:

```powershell
$env:PYTHONPATH = "code/backend/pipeline"
$env:CATALYST_REPO_ROOT = (Get-Location).Path
python -m catalyst.local_api
```

Run frontend:

```powershell
cd code/frontend
npm run dev
```

Run checks:

```powershell
$env:PYTHONPATH = "code/backend/pipeline"
$env:CATALYST_REPO_ROOT = (Get-Location).Path
pytest -q code/backend/tests

cd code/frontend
npm run build
```
