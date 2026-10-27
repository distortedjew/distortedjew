"""Activity feed (events outbox) and the notification center."""

from __future__ import annotations

import typing
from typing import Annotated

from fastapi import APIRouter, Query

from ...schemas import EventPage, EventType, MarkReadRequest, NotificationList, Severity
from .. import queries
from ..context import Ctx
from ..validation import csv_choices, normalize_symbol, validation_error
from .common import SymbolQuery

router = APIRouter(tags=["activity"])

EVENT_TYPES: tuple[str, ...] = typing.get_args(EventType)
SEVERITIES: tuple[str, ...] = typing.get_args(Severity)
MAX_MARK_READ_IDS = 1_000


@router.get("/events", response_model=EventPage)
def list_events(
    ctx: Ctx,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    before_id: Annotated[
        int | None, Query(ge=1, description="Page backwards: events with a lower id")
    ] = None,
    types: Annotated[list[str] | None, Query(description="Event types, repeated or comma-separated")] = None,
    severity: Annotated[
        list[str] | None, Query(description="Severities, repeated or comma-separated")
    ] = None,
    symbol: SymbolQuery = None,
) -> EventPage:
    """Events newest first; ``total`` counts every event matching the filters."""
    return queries.events_page(
        ctx.db,
        limit=limit,
        before_id=before_id,
        types=csv_choices(types, EVENT_TYPES, ("query", "types")),
        severities=csv_choices(severity, SEVERITIES, ("query", "severity")),
        symbol=normalize_symbol(symbol) if symbol else None,
    )


@router.get("/notifications", response_model=NotificationList)
def list_notifications(
    ctx: Ctx, limit: Annotated[int, Query(ge=1, le=200)] = 50, unread_only: bool = False
) -> NotificationList:
    """Newest first; ``unread_count`` is always over all notifications."""
    return queries.notification_list(ctx.db, limit=limit, unread_only=unread_only)


@router.post("/notifications/read", response_model=NotificationList)
def mark_notifications_read(
    body: MarkReadRequest,
    ctx: Ctx,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    unread_only: bool = False,
) -> NotificationList:
    """Mark the given ids (all when empty) as read; returns the updated list."""
    if len(body.ids) > MAX_MARK_READ_IDS:
        raise validation_error(("body", "ids"), f"At most {MAX_MARK_READ_IDS} ids per request", len(body.ids))
    queries.mark_notifications_read(ctx.db, body.ids)
    return queries.notification_list(ctx.db, limit=limit, unread_only=unread_only)
