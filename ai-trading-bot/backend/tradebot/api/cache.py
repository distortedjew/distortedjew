"""A small thread-safe TTL cache for expensive report builders."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Hashable
from typing import Generic, TypeVar

V = TypeVar("V")


class TTLCache(Generic[V]):
    """Caches one value per key for ``ttl`` seconds.

    Concurrent requests for the same key wait for a single computation instead of all
    recomputing it (no stampede after expiry); different keys compute in parallel.
    """

    def __init__(self, ttl: float):
        self.ttl = ttl
        self._values: dict[Hashable, tuple[float, V]] = {}
        self._locks: dict[Hashable, threading.Lock] = {}
        self._guard = threading.Lock()

    def get(self, key: Hashable, compute: Callable[[], V]) -> V:
        with self._guard:
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            cached = self._values.get(key)
            now = time.monotonic()
            if cached is not None and cached[0] > now:
                return cached[1]
            value = compute()
            self._values[key] = (time.monotonic() + self.ttl, value)
            return value

    def clear(self) -> None:
        with self._guard:
            self._values.clear()
