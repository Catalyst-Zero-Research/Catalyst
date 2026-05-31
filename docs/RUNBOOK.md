# Catalyst Runbook

Status: implementation target

## Final User Command

The final local command is:

```powershell
catalyst
```

The command should be installable by a local setup script and should work from
the repo root or any directory after PATH installation.

## Development Fallback Command

During implementation, this fallback is acceptable:

```powershell
.\code\start_catalyst.ps1
```

Repo-local command without PATH installation:

```powershell
.\code\bin\catalyst.cmd
```

## Expected Terminal Output

Main terminal output should be clean:

```text
Catalyst
Preflight: ok
Backend:   http://127.0.0.1:8766
Frontend:  http://127.0.0.1:5173
Logs:      data/local/logs/
Press Ctrl+C to stop.
```

Detailed backend/frontend logs go to:

```text
data/local/logs/
```

## Preflight Checks

Before starting services:

- verify Python version,
- verify required Python packages,
- verify Node/npm if UI target enabled,
- verify repo root,
- verify required data artifacts,
- verify resolver artifact,
- verify graph artifacts,
- verify settings file shape,
- verify configured ports are available,
- verify provider settings are syntactically valid,
- verify local write paths exist.

Preflight should fail early with a clear fix.

## Service Startup

Services:

- backend API on `127.0.0.1:8766`,
- UI target on `127.0.0.1:5173` by default,
- optional LiteLLM/proxy only if configured.

The launcher should stop child processes cleanly on Ctrl+C.

## Settings

Settings file:

```text
data/local/settings.json
```

Environment variables override settings where appropriate.

Required provider key names:

```text
GEMINI_API_KEY
GROQ_API_KEY
MISTRAL_API_KEY
NVIDIA_API_KEY
OLLAMA_API_KEY
OPENALEX_API_KEY
SEMANTIC_SCHOLAR_API_KEY
NCBI_API_KEY
GOOGLE_CUSTOM_SEARCH_API_KEY
GOOGLE_CUSTOM_SEARCH_CX
```

Keys must never be committed.

## Setup Script

Target setup command:

```powershell
.\code\install_catalyst.ps1
```

Responsibilities:

- create local virtual environment if needed,
- install backend dependencies,
- install frontend dependencies only if requested,
- create `data/local/` folders,
- create default settings file,
- add repo-local `catalyst` launcher to PATH or print exact PATH command.

Current implementation:

- `scripts/catalyst.py` is the cross-platform launcher for Windows, macOS, and
  Linux. It checks/install-prompts for local Python and frontend dependencies,
  starts services, waits for health checks, and opens the browser.
- `code/bin/catalyst.cmd` launches `code/start_catalyst.ps1`.
- `code/install_catalyst.ps1` adds `code/bin` to the user PATH so `catalyst`
  works in a new terminal.

## Production-Grade Local Standard

For this project, "production-grade local" means:

- deterministic startup,
- clear settings,
- no secret leakage,
- no hardcoded user-specific paths except repo root discovery,
- no noisy logs in the main terminal,
- predictable ports,
- clean shutdown,
- checked data artifacts,
- documented recovery path.
