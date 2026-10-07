import { ChevronDown, ListFilter, ScrollText, X } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { useSymbols } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/cn";
import { EVENT_TYPE_META, SEVERITY_META } from "@/lib/constants";
import { TONE_TEXT } from "@/lib/tones";
import type { EventType, Severity } from "@/types";
import { LiveTag } from "@/components/layout/LiveTag";
import {
  Button,
  Card,
  CardHeader,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SegmentedControl,
  Select,
  Switch,
} from "@/components/ui";
import { EventList } from "@/features/system/EventList";
import {
  ALL_EVENT_TYPES,
  EVENT_SCOPES,
  effectiveTypes,
  parseTypes,
  type EventScope,
} from "@/features/system/event-data";

const SEVERITIES: Severity[] = ["info", "success", "warning", "error"];

/**
 * Full event log for the System page: live WebSocket events on top of the REST history, type /
 * severity / symbol filters kept in the URL, pause-on-scroll and paging back through `before_id`.
 */
export function EventStream({
  className,
  maxHeight = 640,
}: {
  className?: string;
  maxHeight?: number | string;
}) {
  const [typesRaw, setTypesRaw] = useUrlState<string>("types", "");
  const [severity, setSeverity] = useUrlState<"all" | Severity>("severity", "all", ["all", ...SEVERITIES]);
  const [symbol, setSymbol] = useUrlState<string>("symbol", "all");
  const [market, setMarket] = useUrlState<"show" | "hide">("market", "show", ["show", "hide"]);
  const { symbols } = useSymbols();
  const selected = parseTypes(typesRaw);
  const types = effectiveTypes(selected, market === "hide");
  const sev = severity === "all" ? undefined : severity;
  const sym = symbol === "all" ? undefined : symbol;
  const filterKey = `${types?.join(",") ?? "*"}|${sev ?? "*"}|${sym ?? "*"}`;
  const filtered = selected.length > 0 || sev !== undefined || sym !== undefined || market === "hide";

  const toggleType = (type: EventType, on: boolean) => {
    const next = on ? [...selected, type] : selected.filter((t) => t !== type);
    setTypesRaw(ALL_EVENT_TYPES.filter((t) => next.includes(t)).join(","));
  };
  const clear = () => {
    setTypesRaw("");
    setSeverity("all");
    setSymbol("all");
    setMarket("show");
  };

  const symbolOptions = [
    { value: "all", label: "All symbols" },
    ...[...new Set([...symbols, ...(sym ? [sym] : [])])].map((s) => ({ value: s, label: s })),
  ];

  const toolbar = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={ListFilter}
            rightIcon={ChevronDown}
            aria-label="Filter by event type"
          >
            {selected.length === 0
              ? "All types"
              : selected.length === 1
                ? EVENT_TYPE_META[selected[0]].label
                : `${selected.length} types`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-60 overflow-y-auto">
          <DropdownMenuLabel>Event types</DropdownMenuLabel>
          {ALL_EVENT_TYPES.map((type) => {
            const meta = EVENT_TYPE_META[type];
            const Icon = meta.icon;
            return (
              <DropdownMenuCheckboxItem
                key={type}
                checked={selected.includes(type)}
                onCheckedChange={(on) => toggleType(type, on === true)}
                onSelect={(e) => e.preventDefault()}
              >
                <Icon className={cn("size-3.5", TONE_TEXT[meta.tone])} aria-hidden />
                <span className="flex-1">{meta.label}</span>
              </DropdownMenuCheckboxItem>
            );
          })}
          {selected.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={X} onSelect={() => setTypesRaw("")}>
                Show all types
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Select
        size="sm"
        aria-label="Severity"
        className="w-[132px]"
        value={severity}
        onValueChange={setSeverity}
        options={[
          { value: "all", label: "All severities" },
          ...SEVERITIES.map((s) => ({
            value: s,
            label: SEVERITY_META[s].label,
            icon: SEVERITY_META[s].icon,
          })),
        ]}
      />
      <Select
        size="sm"
        aria-label="Symbol"
        className="w-[132px]"
        value={symbol}
        onValueChange={setSymbol}
        options={symbolOptions}
      />
      <label className="inline-flex h-8 items-center gap-2 rounded-lg px-1.5 text-xs text-fg-muted">
        <Switch
          size="sm"
          checked={market === "show"}
          onCheckedChange={(on) => setMarket(on ? "show" : "hide")}
        />
        Market updates
      </label>
      {filtered ? (
        <Button size="sm" variant="ghost" leftIcon={X} onClick={clear}>
          Clear
        </Button>
      ) : null}
    </>
  );

  return (
    <Card className={className} id="events">
      <CardHeader
        title="Event stream"
        icon={ScrollText}
        badge={<LiveTag />}
        subtitle="Everything the engine does, as it happens — click an event for its details"
        info="Events arrive over the WebSocket the moment the engine writes them; history loads from the event log. Scrolling down pauses the feed so it stops moving; new events wait behind the pill."
      />
      <EventList
        key={filterKey}
        types={types}
        severity={sev}
        symbol={sym}
        paging
        maxHeight={maxHeight}
        toolbar={toolbar}
        className="pt-1"
      />
    </Card>
  );
}

/**
 * Overview widget: compact live activity feed (≈ last 30 events) with quick scopes.
 * Self-contained: fetches its own data and handles loading / empty / error.
 */
export function EventStreamCard({ className }: { className?: string }) {
  const [scope, setScope] = useState<EventScope>("all");
  const types = EVENT_SCOPES[scope].types;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Live activity"
        icon={ScrollText}
        badge={<LiveTag />}
        info="Market updates, AI decisions, risk checks, trades and warnings, streamed live. Scroll to pause; click an event for details."
        actions={
          <Button asChild size="xs" variant="ghost">
            <Link to="/system#events">All events</Link>
          </Button>
        }
      />
      <div className="px-4 pb-2">
        <SegmentedControl
          size="xs"
          aria-label="Event scope"
          value={scope}
          onValueChange={setScope}
          fullWidth
          options={(Object.keys(EVENT_SCOPES) as EventScope[]).map((key) => ({
            value: key,
            label: EVENT_SCOPES[key].label,
          }))}
        />
      </div>
      <EventList
        key={scope}
        types={types.length ? [...types] : undefined}
        compact
        headLimit={30}
        maxItems={30}
        maxHeight={420}
      />
    </Card>
  );
}
