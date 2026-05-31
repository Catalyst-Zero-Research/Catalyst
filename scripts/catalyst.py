#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import platform
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv
import webbrowser
from pathlib import Path


REQUIRED_PYTHON = (3, 11)
REQUIRED_MODULES = ("duckdb", "fastapi", "uvicorn", "pandas", "pyarrow", "pymatgen", "pydantic")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def is_windows() -> bool:
    return os.name == "nt"


def venv_python(root: Path) -> Path:
    if is_windows():
        return root / ".venv" / "Scripts" / "python.exe"
    return root / ".venv" / "bin" / "python"


def npm_cmd() -> str:
    return "npm.cmd" if is_windows() else "npm"


def print_banner() -> None:
    print()
    print("Catalyst MVP Launcher")
    print("=====================")
    print("AI-native materials discovery workspace")
    print()


def status(label: str, state: str, detail: str = "") -> None:
    suffix = f"  {detail}" if detail else ""
    print(f"{label:<28} {state:<9}{suffix}")


def ask(question: str, yes: bool) -> bool:
    if yes:
        print(f"{question} yes")
        return True
    answer = input(f"{question} [y/N] ").strip().lower()
    return answer in {"y", "yes"}


def run(cmd: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    printable = " ".join(cmd)
    status("running", "...", printable)
    subprocess.run(cmd, cwd=str(cwd), env=env, check=True)


def check_url(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 200 <= response.status < 500
    except (OSError, urllib.error.URLError):
        return False


def wait_for_url(url: str, *, label: str, seconds: int = 60) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if check_url(url):
            status(label, "ok", url)
            return True
        time.sleep(1)
    status(label, "failed", url)
    return False


def ensure_python_version() -> None:
    if sys.version_info < REQUIRED_PYTHON:
        raise SystemExit(
            f"Python {REQUIRED_PYTHON[0]}.{REQUIRED_PYTHON[1]}+ is required. "
            f"Current: {platform.python_version()}"
        )
    status("python", "ok", platform.python_version())


def ensure_node() -> None:
    node = shutil.which("node")
    npm = shutil.which(npm_cmd())
    if not node or not npm:
        raise SystemExit("Node.js and npm are required. Install Node 20+ from https://nodejs.org, then rerun this.")
    status("node", "ok", node)
    status("npm", "ok", npm)


def ensure_venv(root: Path, yes: bool) -> Path:
    py = venv_python(root)
    if py.exists():
        status("python environment", "ok", str(py))
        return py
    if not ask("Create a local Python environment in .venv?", yes):
        raise SystemExit("Stopped before creating .venv.")
    status("python environment", "create", str(root / ".venv"))
    venv.EnvBuilder(with_pip=True).create(root / ".venv")
    return py


def modules_missing(py: Path, root: Path) -> list[str]:
    check = (
        "import importlib.util, sys; "
        f"missing=[m for m in {REQUIRED_MODULES!r} if importlib.util.find_spec(m) is None]; "
        "print('\\n'.join(missing)); sys.exit(1 if missing else 0)"
    )
    result = subprocess.run([str(py), "-c", check], cwd=str(root), text=True, capture_output=True)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def ensure_python_deps(root: Path, py: Path, yes: bool) -> None:
    missing = modules_missing(py, root)
    if not missing:
        status("python packages", "ok")
        return
    status("python packages", "missing", ", ".join(missing))
    if not ask("Install backend requirements into .venv?", yes):
        raise SystemExit("Stopped before installing Python requirements.")
    run([str(py), "-m", "pip", "install", "--upgrade", "pip"], cwd=root)
    run([str(py), "-m", "pip", "install", "-e", str(root / "code" / "backend" / "pipeline")], cwd=root)
    missing_after = modules_missing(py, root)
    if missing_after:
        raise SystemExit(f"Python dependencies still missing: {', '.join(missing_after)}")
    status("python packages", "ok")


def ensure_frontend_deps(root: Path, yes: bool) -> None:
    frontend = root / "code" / "frontend"
    node_modules = frontend / "node_modules"
    if node_modules.exists():
        status("frontend packages", "ok")
        return
    status("frontend packages", "missing", str(node_modules))
    if not ask("Run npm install for the frontend?", yes):
        raise SystemExit("Stopped before installing frontend requirements.")
    run([npm_cmd(), "install"], cwd=frontend)
    status("frontend packages", "ok")


def run_preflight(root: Path, py: Path, env: dict[str, str]) -> None:
    code = (
        "from pathlib import Path; "
        "from catalyst.preflight import run_preflight, print_preflight; "
        f"r=run_preflight(Path({str(root)!r}), check_ports=False); "
        "print_preflight(r); "
        "raise SystemExit(0 if r['status']=='ok' else 1)"
    )
    run([str(py), "-c", code], cwd=root, env=env)


def terminate(proc: subprocess.Popen[str] | None) -> None:
    if not proc or proc.poll() is not None:
        return
    if is_windows():
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def start_process(cmd: list[str], *, cwd: Path, env: dict[str, str], log: Path, err: Path) -> subprocess.Popen[str]:
    log.parent.mkdir(parents=True, exist_ok=True)
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if is_windows() else 0
    preexec_fn = None if is_windows() else os.setsid
    stdout = log.open("a", encoding="utf-8")
    stderr = err.open("a", encoding="utf-8")
    return subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=stdout,
        stderr=stderr,
        text=True,
        creationflags=creationflags,
        preexec_fn=preexec_fn,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Install, verify, and run the Catalyst MVP locally.")
    parser.add_argument("--yes", "-y", action="store_true", help="Approve local .venv/npm installs without prompting.")
    parser.add_argument("--check", action="store_true", help="Run install/preflight checks without starting services.")
    parser.add_argument("--install-only", action="store_true", help="Install missing requirements and exit.")
    parser.add_argument("--no-open", action="store_true", help="Do not open the browser after startup.")
    parser.add_argument("--api-port", type=int, default=int(os.getenv("CATALYST_API_PORT", "8766")))
    parser.add_argument("--ui-port", type=int, default=int(os.getenv("CATALYST_UI_PORT", "5173")))
    args = parser.parse_args()

    root = repo_root()
    pipeline = root / "code" / "backend" / "pipeline"
    frontend = root / "code" / "frontend"
    logs = root / "data" / "local" / "logs"
    api_url = f"http://127.0.0.1:{args.api_port}"
    ui_url = f"http://127.0.0.1:{args.ui_port}"

    print_banner()
    status("repo", "ok", str(root))
    ensure_python_version()
    ensure_node()
    py = ensure_venv(root, args.yes)
    ensure_python_deps(root, py, args.yes)
    ensure_frontend_deps(root, args.yes)

    env = os.environ.copy()
    env["PYTHONPATH"] = str(pipeline)
    env["CATALYST_REPO_ROOT"] = str(root)
    env["CATALYST_API_HOST"] = "127.0.0.1"
    env["CATALYST_API_PORT"] = str(args.api_port)
    env["CATALYST_UI_HOST"] = "127.0.0.1"
    env["CATALYST_UI_PORT"] = str(args.ui_port)
    env["VITE_CATALYST_API_BASE"] = api_url

    run_preflight(root, py, env)
    if args.check or args.install_only:
        status("ship checks", "ok")
        return 0

    backend_proc: subprocess.Popen[str] | None = None
    frontend_proc: subprocess.Popen[str] | None = None

    try:
        if check_url(f"{api_url}/health"):
            status("backend", "reuse", api_url)
        else:
            backend_proc = start_process(
                [str(py), "-m", "catalyst.local_api"],
                cwd=root,
                env=env,
                log=logs / "backend.log",
                err=logs / "backend.err.log",
            )
            status("backend", "start", api_url)
            if not wait_for_url(f"{api_url}/health", label="backend health", seconds=90):
                raise SystemExit(f"Backend did not become healthy. Check {logs / 'backend.err.log'}")

        if check_url(ui_url):
            status("frontend", "reuse", ui_url)
        else:
            frontend_proc = start_process(
                [npm_cmd(), "run", "dev", "--", "--host", "127.0.0.1", "--port", str(args.ui_port)],
                cwd=frontend,
                env=env,
                log=logs / "frontend.log",
                err=logs / "frontend.err.log",
            )
            status("frontend", "start", ui_url)
            if not wait_for_url(ui_url, label="frontend", seconds=90):
                raise SystemExit(f"Frontend did not become reachable. Check {logs / 'frontend.err.log'}")

        status("startup settle", "wait", "5 seconds")
        time.sleep(5)
        print()
        print("Catalyst is running")
        print(f"  Backend:  {api_url}")
        print(f"  Frontend: {ui_url}")
        print(f"  Logs:     {logs}")
        print("Press Ctrl+C to stop services started by this launcher.")
        if not args.no_open:
            webbrowser.open(ui_url)
        while True:
            if backend_proc and backend_proc.poll() is not None:
                raise SystemExit(f"Backend exited. Check {logs / 'backend.err.log'}")
            if frontend_proc and frontend_proc.poll() is not None:
                raise SystemExit(f"Frontend exited. Check {logs / 'frontend.err.log'}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping Catalyst...")
        return 0
    finally:
        terminate(frontend_proc)
        terminate(backend_proc)


if __name__ == "__main__":
    raise SystemExit(main())
