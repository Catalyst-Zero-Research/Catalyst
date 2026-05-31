from __future__ import annotations

import os

import uvicorn


if __name__ == "__main__":
    port = int(os.getenv("CATALYST_API_PORT", "8766"))
    uvicorn.run("catalyst.local_api:app", host="127.0.0.1", port=port, reload=False)
