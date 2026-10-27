"""Request validation shared by the routes: symbol format and 422 errors in FastAPI's shape."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from typing import Any

from fastapi.exceptions import RequestValidationError

SYMBOL_PATTERN = r"^[A-Z0-9]{2,12}/[A-Z0-9]{2,8}$"
# Query strings accept either case; values are upper-cased before use.
SYMBOL_QUERY_PATTERN = r"^[A-Za-z0-9]{2,12}/[A-Za-z0-9]{2,8}$"
_SYMBOL_RE = re.compile(SYMBOL_PATTERN)


def normalize_symbol(value: str) -> str:
    return value.strip().upper()


def is_symbol(value: str) -> bool:
    return bool(_SYMBOL_RE.fullmatch(value))


def error_item(loc: Sequence[str | int], msg: str, value: Any, type_: str = "value_error") -> dict[str, Any]:
    """One entry of a 422 ``detail`` list, shaped like FastAPI's own validation errors."""
    return {"type": type_, "loc": tuple(loc), "msg": msg, "input": value}


def validation_error(loc: Sequence[str | int], msg: str, value: Any) -> RequestValidationError:
    return RequestValidationError([error_item(loc, msg, value)])


def csv_choices(values: Iterable[str] | None, allowed: Sequence[str], loc: Sequence[str]) -> list[str]:
    """Accept repeated query parameters and/or comma-separated values, each one of ``allowed``.

    ``?types=A&types=B`` and ``?types=A,B`` are equivalent; order is kept, duplicates dropped.
    """
    out: list[str] = []
    for raw in values or ():
        for part in raw.split(","):
            item = part.strip()
            if not item:
                continue
            if item not in allowed:
                raise validation_error(loc, f"Input should be one of: {', '.join(allowed)}", item)
            if item not in out:
                out.append(item)
    return out
