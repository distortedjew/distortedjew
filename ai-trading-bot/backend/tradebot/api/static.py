"""Serves the built dashboard (``dashboard/dist``) from the API port, with an SPA fallback.

Existing files are served as they are (hashed ``assets/*`` cached for a year, everything
else revalidated); any other path that is not a file request gets ``index.html`` so
client-side routes survive a reload. ``/api/*`` and ``/ws`` are never shadowed: an
unknown API path stays a JSON 404.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from ..config import VERSION

_RESERVED = frozenset({"api", "ws"})
_IMMUTABLE = "public, max-age=31536000, immutable"


def mount_dashboard(app: FastAPI, dist: Path) -> bool:
    """Register the static routes when a build exists; returns whether it did."""
    root = dist.resolve()
    index = root / "index.html"
    if not index.is_file():
        _mount_placeholder(app)
        return False

    def dashboard(path: str) -> FileResponse:
        if path.split("/", 1)[0] in _RESERVED:
            raise HTTPException(status_code=404)
        if path:
            candidate = (root / path).resolve()
            if candidate.is_relative_to(root) and candidate.is_file():
                cache = _IMMUTABLE if path.startswith("assets/") else "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache})
            if "." in PurePosixPath(path).name:
                raise HTTPException(status_code=404)  # a missing asset, not a client-side route
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    app.add_api_route("/{path:path}", dashboard, methods=["GET", "HEAD"], include_in_schema=False)
    return True


def _mount_placeholder(app: FastAPI) -> None:
    def root() -> dict[str, str]:
        return {
            "name": "AI Trading Bot API",
            "version": VERSION,
            "docs": "/api/docs",
            "dashboard": "not built: run `npm run build` in dashboard/ (scripts/start.sh does) "
            "or use scripts/dev.sh for the Vite dev server",
        }

    app.add_api_route("/", root, methods=["GET"], include_in_schema=False)
