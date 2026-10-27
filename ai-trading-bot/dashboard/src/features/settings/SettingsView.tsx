import { AnimatePresence, motion } from "framer-motion";
import {
  BellRing,
  BrainCircuit,
  CircleCheck,
  Coins,
  Hourglass,
  Power,
  RotateCcw,
  Save,
  ShieldCheck,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { toast } from "sonner";
import { useSaveSettings, useSettings } from "@/hooks/queries";
import { useBotStatus } from "@/hooks/live";
import { useUrlState } from "@/hooks/use-url-state";
import { ApiError, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { motionPresets } from "@/lib/motion";
import type { BotSettings, SettingsResponse } from "@/types";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  SkeletonCard,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { AiTab } from "@/features/settings/AiTab";
import { ExecutionTab } from "@/features/settings/ExecutionTab";
import { NotificationsTab } from "@/features/settings/NotificationsTab";
import { RiskTab } from "@/features/settings/RiskTab";
import { TradingTab } from "@/features/settings/TradingTab";
import type { TabProps } from "@/features/settings/fields";
import {
  SECTIONS,
  applyState,
  countBySection,
  diffSettings,
  normalizeForSave,
  sectionOf,
  setIn,
  validateSettings,
  type SectionKey,
} from "@/features/settings/settings-form";

const TABS: Record<SectionKey, { label: string; icon: LucideIcon }> = {
  trading: { label: "Trading", icon: Coins },
  risk: { label: "Risk", icon: ShieldCheck },
  execution: { label: "Execution", icon: Zap },
  ai: { label: "AI Model", icon: BrainCircuit },
  notifications: { label: "Notifications", icon: BellRing },
};

interface Draft {
  /** Server version the edits started from (to notice saves from elsewhere). */
  baseVersion: number;
  value: BotSettings;
}

interface SavedState {
  version: number;
  restartRequired: string[];
}

const LABELS: Record<string, string> = {
  "trading.symbols": "Symbols",
  "trading.primary_symbol": "Primary symbol",
  "trading.decision_timeframe": "Decision timeframe",
  "trading.strategy": "Strategy",
};

/**
 * Settings editor: one draft of the whole BotSettings, validated against the schema bounds, saved
 * with PUT /api/settings and then tracked until the engine reports it applied the new version.
 */
export function SettingsView() {
  const query = useSettings();
  const save = useSaveSettings();
  const bot = useBotStatus();
  const [tab, setTab] = useUrlState<SectionKey>("tab", "trading", SECTIONS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SavedState | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const server = query.data?.settings;
  const form = draft?.value ?? server;
  const dirtyPaths = server && draft ? diffSettings(server, draft.value) : [];
  const dirty = dirtyPaths.length > 0;
  const clientErrors = form ? validateSettings(form) : {};
  const errors = { ...serverErrors, ...clientErrors };
  const errorCount = Object.keys(errors).length;
  const dirtyBySection = countBySection(dirtyPaths);
  const errorsBySection = countBySection(Object.keys(errors));
  const conflict = Boolean(draft && server && dirty && server.version > draft.baseVersion);

  // Leaving the page (or the tab) with unsaved edits asks first.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-full max-w-xl skeleton-shimmer rounded-lg" aria-hidden />
        <div className="grid gap-4 xl:grid-cols-2">
          <SkeletonCard lines={5} className="xl:col-span-2" />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }
  if (!form || !server) {
    return (
      <div className="rounded-xl surface-card">
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Couldn't load the settings"
        />
      </div>
    );
  }

  const update: TabProps["update"] = (section, field, value) => {
    setDraft((d) => {
      const base = d?.value ?? server;
      return { baseVersion: d?.baseVersion ?? server.version, value: setIn(base, section, field, value) };
    });
    const prefix = `${section}.${String(field)}`;
    setServerErrors((e) => {
      const keys = Object.keys(e).filter((k) => k === prefix || k.startsWith(`${prefix}.`));
      if (!keys.length) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
    setSaved(null);
  };

  const discard = () => {
    setDraft(null);
    setServerErrors({});
    setShowErrors(false);
  };

  const submit = () => {
    if (!draft || !dirty) return;
    if (Object.keys(clientErrors).length) {
      setShowErrors(true);
      const first = sectionOf(Object.keys(clientErrors)[0]);
      if (first && first !== tab) setTab(first);
      toast.error(
        `Fix ${formatInt(Object.keys(clientErrors).length)} invalid ${Object.keys(clientErrors).length === 1 ? "field" : "fields"} before saving`,
      );
      return;
    }
    save.mutate(normalizeForSave(draft.value), {
      onSuccess: (response: SettingsResponse) => {
        setDraft(null);
        setServerErrors({});
        setShowErrors(false);
        setSaved({ version: response.settings.version, restartRequired: response.restart_required });
        toast.success(`Settings saved (v${response.settings.version})`);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 422) {
          const fields = error.fieldErrors();
          setServerErrors(fields);
          setShowErrors(true);
          const first = sectionOf(Object.keys(fields)[0] ?? "");
          if (first && first !== tab) setTab(first);
        }
        toast.error(describeError(error));
      },
    });
  };

  const engineApplied = query.data?.applied_version ?? bot.status?.engine?.settings_version ?? null;
  const engineOnline = bot.state === "online" || bot.state === "degraded";
  const savedState = saved ? applyState(saved.version, engineApplied, engineOnline) : null;
  // The latest response's restart list is the freshest view once the engine applied it.
  const restartRequired = saved
    ? savedState === "applied"
      ? (query.data?.restart_required ?? saved.restartRequired)
      : saved.restartRequired
    : [];
  const visibleErrors = showErrors ? errors : serverErrors;
  const tabProps = {
    form,
    errors: { ...visibleErrors, ...pickDirtyErrors(clientErrors, dirtyPaths) },
    dirty: new Set(dirtyPaths),
    update,
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-subtle">
        <span className="num">Version v{server.version}</span>
        <span>
          {engineApplied === null
            ? "Engine offline — saved settings apply when it starts"
            : engineApplied >= server.version
              ? `Engine running v${engineApplied}`
              : `Engine on v${engineApplied}, applying v${server.version}…`}
        </span>
        {(query.data?.restart_required.length ?? 0) > 0 && !saved ? (
          <Badge tone="warning" size="sm" icon={Power}>
            Restart needed: {query.data?.restart_required.map((p) => LABELS[p] ?? p).join(", ")}
          </Badge>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SectionKey)}>
        <TabsList className="mb-4" aria-label="Settings sections">
          {SECTIONS.map((key) => {
            const Icon = TABS[key].icon;
            const dirtyCount = dirtyBySection[key] ?? 0;
            const errorCountTab = showErrors ? (errorsBySection[key] ?? 0) : 0;
            return (
              <TabsTrigger key={key} value={key}>
                <Icon aria-hidden />
                {TABS[key].label}
                {errorCountTab ? (
                  <span
                    className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-down/15 px-1 num text-[10px] text-down"
                    aria-label={`${errorCountTab} errors`}
                  >
                    {errorCountTab}
                  </span>
                ) : dirtyCount ? (
                  <span
                    className="ml-0.5 size-1.5 rounded-full bg-accent"
                    aria-label={`${dirtyCount} unsaved changes`}
                  />
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="trading">
          <TradingTab {...tabProps} savedSymbols={server.trading.symbols} />
        </TabsContent>
        <TabsContent value="risk">
          <RiskTab {...tabProps} />
        </TabsContent>
        <TabsContent value="execution">
          <ExecutionTab {...tabProps} />
        </TabsContent>
        <TabsContent value="ai">
          <AiTab {...tabProps} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab {...tabProps} />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mt-4 sm:bottom-4">
        <AnimatePresence initial={false} mode="wait">
          {dirty ? (
            <motion.div
              key="dirty"
              {...motionPresets.fadeRise}
              className="flex flex-col gap-3 rounded-xl surface-glass px-4 py-3 shadow-[0_8px_30px_rgb(0_0_0/0.25)] sm:flex-row sm:items-center"
              role="region"
              aria-label="Unsaved changes"
            >
              <div className="min-w-0 flex-1 text-dense">
                <p className="font-medium text-fg">
                  {formatInt(dirtyPaths.length)} unsaved {dirtyPaths.length === 1 ? "change" : "changes"}
                  {showErrors && errorCount ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-down">
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {formatInt(errorCount)} to fix
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {conflict
                    ? `Settings were saved elsewhere (now v${server.version}). Saving overwrites those changes; Discard loads them.`
                    : "Validated by the API and applied by the engine on its next heartbeat (~2 s)."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={RotateCcw}
                  onClick={discard}
                  disabled={save.isPending}
                >
                  Discard
                </Button>
                <Button variant="primary" size="sm" leftIcon={Save} onClick={submit} loading={save.isPending}>
                  Save changes
                </Button>
              </div>
            </motion.div>
          ) : savedState && saved ? (
            <motion.div
              key={`saved-${saved.version}-${savedState}`}
              {...motionPresets.fadeRise}
              role="status"
              className={cn(
                "flex items-start gap-3 rounded-xl surface-glass px-4 py-3 shadow-[0_8px_30px_rgb(0_0_0/0.2)]",
                savedState === "applied"
                  ? "ring-1 ring-up/30"
                  : savedState === "offline"
                    ? "ring-1 ring-warning/30"
                    : "",
              )}
            >
              {savedState === "applied" ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-up" aria-hidden />
              ) : savedState === "waiting" ? (
                <Spinner className="mt-0.5 size-4 shrink-0 text-accent" />
              ) : (
                <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              )}
              <div className="min-w-0 flex-1 text-dense">
                <p className="font-medium text-fg">
                  {savedState === "applied"
                    ? `Saved v${saved.version} — Applied ✓`
                    : savedState === "waiting"
                      ? `Saved v${saved.version} — waiting for the engine to apply…`
                      : `Saved v${saved.version} — the engine is offline`}
                </p>
                <p className="text-xs text-fg-subtle">
                  {savedState === "applied"
                    ? "The engine is running with the new settings."
                    : savedState === "waiting"
                      ? "The engine picks up new settings on its next heartbeat."
                      : "They are stored and will be applied as soon as the engine starts."}
                </p>
                {restartRequired.length ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warning">
                    <Power className="size-3.5" aria-hidden />
                    Needs an engine restart to take effect:{" "}
                    {restartRequired.map((p) => LABELS[p] ?? p).join(", ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setSaved(null)}
                className="rounded p-1 text-fg-subtle hover:bg-fg/[0.07] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent/70"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title="Discard unsaved changes?"
        description={`You have ${formatInt(dirtyPaths.length)} unsaved ${dirtyPaths.length === 1 ? "change" : "changes"} in Settings. Leaving discards ${dirtyPaths.length === 1 ? "it" : "them"}.`}
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </>
  );
}

/** Errors on fields the user has changed are shown immediately, the rest after a save attempt. */
function pickDirtyErrors(
  errors: Record<string, string>,
  dirtyPaths: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(errors)) {
    if (dirtyPaths.some((d) => path === d || path.startsWith(`${d}.`))) out[path] = message;
  }
  return out;
}
