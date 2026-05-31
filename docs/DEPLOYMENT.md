# Catalyst Live Deployment

Goal: produce one public HTTPS demo URL without exposing secrets or opening
unnecessary inbound ports.

## Recommended Path

Use a single backend-hosted app on `mini` or `micro`, exposed through
Cloudflare Tunnel.

Why:

- Catalyst is not frontend-only; the UI needs the FastAPI backend and processed
  data.
- GitHub Pages can host static HTML/CSS/JS, but it cannot run the backend.
- Cloudflare Tunnel can publish a local service through outbound connections,
  so the server does not need public inbound app ports.
- The frontend can be built locally and uploaded, avoiding a heavy Node build on
  the 1 GB server.

## Deployment Shape

```text
browser
  -> https://catalyst.<domain>
  -> Cloudflare Tunnel
  -> server localhost:8766
  -> FastAPI backend
  -> static frontend build + data/processed
```

## Server Plan

1. Inspect both servers:

```bash
ssh micro "free -h; df -h; uname -a; ps aux --sort=-%mem | head"
ssh mini "free -h; df -h; uname -a; ps aux --sort=-%mem | head"
```

2. Pick the server with more free RAM/disk.

3. Build frontend locally:

```powershell
npm install --prefix code/frontend
npm run build --prefix code/frontend
```

4. Upload only the runtime package:

```text
code/backend/
code/frontend/dist/
data/processed/
data/local/settings.example.json
data/local/agent/agent_context.json
data/local/agent/tool_registry.json
README.md
docs/
.env.example
```

5. Create server `.env` from `.env.example`.

6. Run FastAPI on localhost only:

```bash
export PYTHONPATH=/opt/catalyst/code/backend/pipeline
export CATALYST_REPO_ROOT=/opt/catalyst
python -m catalyst.local_api
```

7. Put it behind Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:8766
```

For the final form, use a named tunnel/custom hostname instead of a temporary
quick tunnel if possible.

## Security Rules

- Do not push real `.env` or provider keys to GitHub.
- Bind the backend to `127.0.0.1` on the server.
- Expose only HTTPS through the tunnel.
- Keep `data/local/logs`, sessions, exports, and settings out of the public repo.
- If the repo is public, use Git LFS or an external artifact link for large
  processed data files.

## Fallbacks

- If Cloudflare setup is too slow: use a temporary Cloudflare quick tunnel for
  the demo video and form.
- If the server RAM is too tight: submit a GitHub/Drive package link plus a demo
  video, and host only a static landing/demo page.
- If GitHub Pages is used: it should host only the built frontend, with
  `VITE_API_BASE_URL` pointed at the tunneled backend.
