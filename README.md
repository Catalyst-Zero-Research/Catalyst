# Catalyst

Catalyst is an AI-native materials discovery workspace for moving from a rough
materials requirement to grounded candidates, graph context, evidence, and
agent-assisted inspection.

[Live demo](https://beside-plymouth-thats-away.trycloudflare.com) ·
[GitHub Pages UI](https://catalyst-zero-research.github.io/Catalyst/)

## What It Does

- Search and screen a local Materials Project snapshot with natural language.
- Open candidate materials in a graph workspace with neighbors and evidence.
- Inspect structures, thermodynamic/electronic/magnetic/mechanical details, and
  local provenance.
- Ask an agent to search, select, compare, and explain materials through
  tool-grounded backend actions.
- Compare candidates and export grounded subgraphs/candidate sets.

## Architecture

```text
code/frontend/             React + Vite scientific workspace UI
code/backend/pipeline/     FastAPI backend, local store, agent tools
data/local/agent/          Non-secret agent context/tool contract templates
docs/                      API, runbook, deployment, demo, submission notes
```

The public repository excludes the large processed data snapshot. The live demo
uses a hosted `v2025.09.25` Catalyst snapshot on the demo server.

## Quick Start

Clone the repo, then provide the processed data snapshot at:

```text
data/processed/catalyst/v2025.09.25/
```

Install backend runtime dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r code/backend/pipeline/requirements-runtime.txt
```

Run the backend:

```bash
export PYTHONPATH=code/backend/pipeline
export CATALYST_REPO_ROOT=$(pwd)
python -m catalyst.local_api
```

Run the frontend:

```bash
cd code/frontend
npm install
npm run dev
```

Default local URLs:

```text
Backend:  http://127.0.0.1:8766
Frontend: http://127.0.0.1:5173
```

## Verification

Backend contract tests:

```bash
export PYTHONPATH=code/backend/pipeline
export CATALYST_REPO_ROOT=$(pwd)
pytest -q code/backend/tests
```

Frontend build:

```bash
npm run build --prefix code/frontend
```

Ship check:

```bash
python code/backend/pipeline/scripts/check_ship_ready.py
```

## Data And Secrets

- `data/processed/` is intentionally ignored because the processed snapshot is
  large.
- Runtime logs, sessions, exports, and local settings are ignored.
- Real provider keys are never committed. Use `.env.example` as the template.
- GitHub Pages builds the static UI and connects to the hosted demo backend.
- The Pages UI reads `code/frontend/public/runtime-config.json` at startup for
  the backend URL. If the free Cloudflare quick tunnel changes, run:

```powershell
.\scripts\update-pages-runtime-config.ps1
```

The script reads the active tunnel URL from `mini`, commits the updated runtime
config, and pushes to trigger a Pages redeploy.

## Docs

- [Runbook](docs/RUNBOOK.md)
- [API contract](docs/API_CONTRACT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Demo prompts](docs/DEMO_PROMPTS.md)
- [Submission pack](docs/SUBMISSION_PACK.md)
