"""Print the contract's JSON Schema (all models in tradebot.schemas) to stdout.

Used by dashboard/scripts/gen-types.mjs to generate src/types/api.ts, so the
dashboard's types always match what the API serializes.
"""

from __future__ import annotations

import json
import sys
import typing
from pathlib import Path

from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tradebot import schemas  # noqa: E402

# Named string unions worth exporting as TypeScript aliases.
ALIASES = [
    "Side",
    "Signal",
    "Timeframe",
    "Regime",
    "Trend",
    "EmaAlignment",
    "TradingMode",
    "StrategyName",
    "OrderType",
    "FeedKind",
    "FeedSetting",
    "AIProvider",
    "Severity",
    "HealthState",
    "BotState",
    "ExitReason",
    "TradeResult",
    "RiskStatus",
    "EvalStatus",
    "RiskMeterStatus",
    "EventType",
    "NotificationType",
    "PerformanceRange",
    "BacktestStatus",
    "ChartMarkerKind",
    "PriceLevelKind",
]
UNIONS = {"WsServerMessage": schemas.WsServerMessage, "WsClientMessage": schemas.WsClientMessage}


def build() -> dict:
    models = [
        obj
        for obj in vars(schemas).values()
        if isinstance(obj, type)
        and issubclass(obj, BaseModel)
        and obj is not schemas.Model
        and obj.__module__ == schemas.__name__
    ]
    models.sort(key=lambda m: m.__name__)
    _, top = models_json_schema([(m, "serialization") for m in models], ref_template="#/$defs/{model}")
    defs: dict = top["$defs"]
    for name in ALIASES:
        values = list(typing.get_args(getattr(schemas, name)))
        defs[name] = {"title": name, "type": "string", "enum": values}
    for name, union in UNIONS.items():
        members = typing.get_args(typing.get_args(union)[0])
        defs[name] = {"title": name, "oneOf": [{"$ref": f"#/$defs/{m.__name__}"} for m in members]}
    for definition in defs.values():
        _strip_titles(definition, keep=True)
    return {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "TradebotContract",
        "type": "object",
        "additionalProperties": False,
        "properties": {name: {"$ref": f"#/$defs/{name}"} for name in sorted(defs)},
        "$defs": defs,
    }


def _strip_titles(node: object, keep: bool = False) -> None:
    """Drop per-property titles; otherwise json2ts emits a type alias for every field."""
    if isinstance(node, dict):
        if not keep:
            node.pop("title", None)
        for key, value in node.items():
            if key == "properties" and isinstance(value, dict):
                for prop in value.values():
                    _strip_titles(prop)
            else:
                _strip_titles(value)
    elif isinstance(node, list):
        for item in node:
            _strip_titles(item)


if __name__ == "__main__":
    json.dump(build(), sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
