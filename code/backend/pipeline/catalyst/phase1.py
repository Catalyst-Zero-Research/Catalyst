from __future__ import annotations

import argparse
import json
from pathlib import Path

from catalyst.build_processed import build_processed
from catalyst.download import download_phase1_raw
from catalyst.util import find_repo_root


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Catalyst Phase 1: 10k MP cache + local processed dataset.")
    parser.add_argument("--repo-root", type=Path, default=find_repo_root(Path(__file__).resolve()))
    parser.add_argument("--limit", type=int, default=10_000)
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--process-only-version")
    args = parser.parse_args()

    if args.process_only_version:
        processed_manifest = build_processed(args.repo_root, args.process_only_version)
        print(json.dumps({"processed": processed_manifest}, indent=2, sort_keys=True))
        return

    raw_manifest = download_phase1_raw(args.repo_root, limit=args.limit, chunk_size=args.chunk_size)
    if args.download_only:
        print(json.dumps({"raw": raw_manifest}, indent=2, sort_keys=True))
        return

    processed_manifest = build_processed(args.repo_root, raw_manifest["mp_database_version"])
    print(json.dumps({"raw": raw_manifest, "processed": processed_manifest}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
