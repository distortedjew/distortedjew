"""FastAPI gateway: REST endpoints, the WebSocket hub, auth and static dashboard serving.

The application lives in :mod:`tradebot.api.main` (``create_app``, ``main``). This package
init stays import-free on purpose: spawned backtest workers import
``tradebot.api.backtests`` and must not pay for the whole web stack.
"""
