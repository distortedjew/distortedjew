import {
  BrainCircuit,
  CircleCheck,
  KeyRound,
  LifeBuoy,
  Plus,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAiModels } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { AI_PROVIDER_META } from "@/lib/constants";
import {
  DASH,
  formatCompact,
  formatDateTime,
  formatInt,
  formatMs,
  formatNumber,
  formatPct,
  formatRelativeTime,
  formatTime,
  formatUsd,
} from "@/lib/format";
import { useNow } from "@/lib/time";
import type { AIModelInfo, AIModelOption } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Select,
  Skeleton,
  Slider,
  Switch,
  Tooltip,
} from "@/components/ui";
import { Sparkline } from "@/components/charts";
import {
  FieldGrid,
  ModifiedMark,
  NumberSetting,
  SettingsSection,
  type TabProps,
} from "@/features/settings/fields";
import { MAX_FALLBACK_MODELS, MODEL_ID_RE, errorFor } from "@/features/settings/settings-form";

const CUSTOM = "__custom__";
/** Fixed mask — never derived from key material. */
const KEY_MASK = "••••••••••••••••";

function priceLine(option: AIModelOption): string {
  const parts: string[] = [];
  if (option.prompt_price_per_mtok !== null && option.prompt_price_per_mtok !== undefined) {
    parts.push(
      `${formatUsd(option.prompt_price_per_mtok)} in / ${formatUsd(option.completion_price_per_mtok)} out per 1M tokens`,
    );
  }
  if (option.context_length) parts.push(`${formatCompact(option.context_length)} context`);
  return parts.join(" · ");
}

export function AiTab({ form, errors, dirty, update }: TabProps) {
  const models = useAiModels();
  const a = form.ai;
  const options = models.data?.options ?? [];
  const known = options.some((o) => o.id === a.model);
  const [customMode, setCustomMode] = useState(false);
  const showCustom = customMode || (!known && !models.isPending);
  const selected = options.find((o) => o.id === a.model);
  const [fallbackDraft, setFallbackDraft] = useState("");
  const fallbackId = fallbackDraft.trim();
  const fallbackError = !fallbackId
    ? undefined
    : !MODEL_ID_RE.test(fallbackId)
      ? "Use provider/model, e.g. openai/gpt-4o-mini"
      : fallbackId === a.model.trim() || a.fallback_models.includes(fallbackId)
        ? "Already in use"
        : a.fallback_models.length >= MAX_FALLBACK_MODELS
          ? `At most ${MAX_FALLBACK_MODELS}`
          : undefined;
  const addFallback = (id: string) => {
    if (
      !id ||
      a.fallback_models.includes(id) ||
      id === a.model ||
      a.fallback_models.length >= MAX_FALLBACK_MODELS
    )
      return;
    update("ai", "fallback_models", [...a.fallback_models, id]);
    setFallbackDraft("");
  };
  const suggestions = options
    .filter((o) => o.id !== a.model && !a.fallback_models.includes(o.id))
    .slice(0, 4);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <ApiKeyCard info={models.data} pending={models.isPending} />

        <SettingsSection
          title="Model"
          icon={BrainCircuit}
          description="The OpenRouter model the AI analyst asks on every decision"
          info="Any OpenRouter model id works. Prices are OpenRouter's list prices; the engine records the real cost of every request."
        >
          <div className="space-y-4">
            <Field
              label="AI model"
              htmlFor="setting-ai-model"
              error={showCustom ? undefined : errors["ai.model"]}
              aside={<ModifiedMark show={dirty.has("ai.model")} />}
              hint={selected ? priceLine(selected) : showCustom ? "Custom model id" : undefined}
            >
              {models.isPending ? (
                <Skeleton className="h-9 w-full rounded-lg" />
              ) : (
                <Select
                  id="setting-ai-model"
                  value={showCustom ? CUSTOM : a.model}
                  onValueChange={(v) => {
                    if (v === CUSTOM) setCustomMode(true);
                    else {
                      setCustomMode(false);
                      update("ai", "model", v);
                      if (a.fallback_models.includes(v)) {
                        update(
                          "ai",
                          "fallback_models",
                          a.fallback_models.filter((m) => m !== v),
                        );
                      }
                    }
                  }}
                  options={[
                    ...options.map((o) => ({
                      value: o.id,
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          {o.name}
                          {o.recommended ? (
                            <Badge tone="ai" size="xs">
                              Recommended
                            </Badge>
                          ) : null}
                        </span>
                      ),
                      description: `${o.id}${o.prompt_price_per_mtok !== null && o.prompt_price_per_mtok !== undefined ? ` · ${formatUsd(o.prompt_price_per_mtok)} / ${formatUsd(o.completion_price_per_mtok)} per 1M` : ""}`,
                    })),
                    {
                      value: CUSTOM,
                      label: "Custom model id…",
                      description: "Any provider/model on OpenRouter",
                    },
                  ]}
                  contentClassName="min-w-80"
                />
              )}
            </Field>
            {showCustom ? (
              <Field
                label="Custom model id"
                htmlFor="setting-ai-custom"
                error={errors["ai.model"]}
                hint="Exactly as listed on openrouter.ai/models"
              >
                <Input
                  id="setting-ai-custom"
                  className="num"
                  placeholder="provider/model, e.g. mistralai/mistral-small"
                  value={a.model}
                  invalid={Boolean(errors["ai.model"])}
                  onChange={(e) => update("ai", "model", e.target.value)}
                />
              </Field>
            ) : null}

            <Field
              label="Temperature"
              htmlFor="setting-ai-temperature"
              info="Randomness of the reply. Trading decisions should be repeatable: 0.1–0.3 is a good range."
              error={errors["ai.temperature"]}
              aside={
                <span className="flex items-center gap-2">
                  <ModifiedMark show={dirty.has("ai.temperature")} />
                  <span className="num text-fg-subtle">0–2</span>
                </span>
              }
              hint={
                a.temperature <= 0.3
                  ? "Focused and repeatable"
                  : a.temperature <= 0.8
                    ? "Balanced"
                    : "Creative — less consistent decisions"
              }
            >
              <Slider
                id="setting-ai-temperature"
                aria-label="Temperature"
                value={a.temperature}
                onValueChange={(v) => update("ai", "temperature", Number(v.toFixed(2)))}
                min={0}
                max={2}
                step={0.05}
                formatValue={(v) => formatNumber(v, 2)}
              />
            </Field>

            <FieldGrid className="lg:grid-cols-3">
              <NumberSetting
                path="ai.max_tokens"
                label="Max tokens"
                step={50}
                value={a.max_tokens}
                onChange={(v) => update("ai", "max_tokens", v)}
                hint="Reply length cap"
                info="The analysis JSON needs ~400–700 tokens. Too low truncates the reply and costs a retry."
                error={errors["ai.max_tokens"]}
                modified={dirty.has("ai.max_tokens")}
              />
              <NumberSetting
                path="ai.request_timeout_sec"
                label="Request timeout"
                unit="s"
                value={a.request_timeout_sec}
                onChange={(v) => update("ai", "request_timeout_sec", v)}
                hint="Per attempt"
                error={errors["ai.request_timeout_sec"]}
                modified={dirty.has("ai.request_timeout_sec")}
              />
              <NumberSetting
                path="ai.retry_count"
                label="Retry count"
                value={a.retry_count}
                onChange={(v) => update("ai", "retry_count", v)}
                hint="On 429 / 5xx / timeouts / bad JSON"
                info="Retries back off exponentially. After the last retry the fallback models are tried in order."
                error={errors["ai.retry_count"]}
                modified={dirty.has("ai.retry_count")}
              />
            </FieldGrid>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Fallbacks"
          icon={LifeBuoy}
          description="What answers when the main model fails"
        >
          <div className="space-y-5">
            <Field
              label="Fallback models"
              info="Tried in this order after the main model has exhausted its retries."
              error={errorFor(errors, "ai.fallback_models")}
              aside={
                <span className="flex items-center gap-2">
                  <ModifiedMark show={dirty.has("ai.fallback_models")} />
                  <span className="num text-fg-subtle">
                    {a.fallback_models.length} / {MAX_FALLBACK_MODELS}
                  </span>
                </span>
              }
            >
              {a.fallback_models.length ? (
                <ol className="space-y-1.5">
                  {a.fallback_models.map((id, i) => (
                    <li
                      key={id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
                        errors[`ai.fallback_models.${i}`] ? "border-down/50" : "border-line",
                      )}
                    >
                      <span className="num text-xs text-fg-subtle">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate num text-dense text-fg">{id}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${id}`}
                        onClick={() =>
                          update(
                            "ai",
                            "fallback_models",
                            a.fallback_models.filter((m) => m !== id),
                          )
                        }
                        className="rounded p-0.5 text-fg-subtle hover:bg-fg/[0.07] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent/70"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-fg-subtle">No fallback models — only the main model is asked.</p>
              )}
              <div className="mt-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    size="sm"
                    className="num"
                    placeholder="Add a model id"
                    aria-label="Add a fallback model"
                    value={fallbackDraft}
                    invalid={Boolean(fallbackError)}
                    onChange={(e) => setFallbackDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!fallbackError) addFallback(fallbackId);
                      }
                    }}
                  />
                  {fallbackError ? <p className="mt-1 text-xs text-down">{fallbackError}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={Plus}
                  disabled={!fallbackId || Boolean(fallbackError)}
                  onClick={() => addFallback(fallbackId)}
                >
                  Add
                </Button>
              </div>
              {suggestions.length && a.fallback_models.length < MAX_FALLBACK_MODELS ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-fg-subtle">Suggestions:</span>
                  {suggestions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => addFallback(o.id)}
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-line px-1.5 text-xs text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent/70"
                    >
                      <Plus className="size-3" aria-hidden />
                      {o.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </Field>
            <Field
              layout="inline"
              label="Heuristic fallback"
              htmlFor="setting-ai-heuristic"
              hint="When every model fails, the local heuristic analyst answers (marked with a fallback reason) instead of skipping the decision."
              aside={<ModifiedMark show={dirty.has("ai.heuristic_fallback")} />}
            >
              <Switch
                id="setting-ai-heuristic"
                checked={a.heuristic_fallback}
                onCheckedChange={(v) => update("ai", "heuristic_fallback", v)}
              />
            </Field>
          </div>
        </SettingsSection>
      </div>

      <div className="min-w-0">
        <UsagePanel
          info={models.data}
          pending={models.isPending}
          error={models.error}
          onRetry={() => void models.refetch()}
        />
      </div>
    </div>
  );
}

function ApiKeyCard({ info, pending }: { info: AIModelInfo | undefined; pending: boolean }) {
  const configured = info?.configured ?? false;
  return (
    <Card variant="default">
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              configured ? "bg-up/12 text-up" : "bg-fg/[0.05] text-fg-subtle",
            )}
            aria-hidden
          >
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="label-caps">OpenRouter API key</p>
            {pending ? (
              <Skeleton className="mt-1.5 h-4 w-56" />
            ) : configured ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="num text-sm tracking-[0.12em] text-fg" aria-label="API key hidden">
                  {info?.api_key_hint || KEY_MASK}
                </span>
                <span className="inline-flex items-center gap-1 text-dense font-medium text-up">
                  <CircleCheck className="size-3.5" aria-hidden />
                  Configured ✓
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-dense text-fg-muted">
                <span className="font-medium text-fg">Not configured</span> — set{" "}
                <span className="num text-fg">OPENROUTER_API_KEY</span> on the server
              </p>
            )}
          </div>
        </div>
        <p className="max-w-xs text-xs leading-[1.125rem] text-fg-subtle sm:text-right">
          {configured
            ? "The key lives in the server environment and is never sent to the browser."
            : "Until then the local heuristic analyst answers every decision. The key is never entered or shown here."}
        </p>
      </div>
    </Card>
  );
}

function UsagePanel({
  info,
  pending,
  error,
  onRetry,
}: {
  info: AIModelInfo | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const now = useNow();
  const u = info?.usage;
  const hourly = u?.hourly ?? [];
  const provider = info ? AI_PROVIDER_META[info.active_provider] : null;
  return (
    <Card className="xl:sticky xl:top-20">
      <CardHeader
        title="Usage today"
        icon={SlidersHorizontal}
        subtitle="OpenRouter requests since UTC midnight"
        info="Every LLM request is recorded by the engine, successful or not. Cost comes from OpenRouter's reported cost, else the price table."
      />
      <CardBody className="space-y-4">
        {error && !info ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : pending || !u || !info ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-line-subtle bg-surface-2/60 p-3">
              <p className="text-xs text-fg-subtle">Current model</p>
              <p className="mt-0.5 truncate num text-dense text-fg">{info.current_model}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                Answering now:
                {provider ? (
                  <Badge tone={provider.tone} icon={provider.icon} size="xs">
                    {provider.label}
                  </Badge>
                ) : null}
                <span className="truncate num">{u.model}</span>
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <KeyValue
                label="Requests today"
                value={formatInt(u.requests_today)}
                sub={`${formatInt(u.requests_total)} all time`}
              />
              <KeyValue
                label="Avg response"
                value={formatMs(u.avg_latency_ms)}
                sub={
                  u.p95_latency_ms !== null && u.p95_latency_ms !== undefined
                    ? `p95 ${formatMs(u.p95_latency_ms)}`
                    : "p95 —"
                }
                info="Average and 95th-percentile request latency today."
              />
              <KeyValue
                label="Cost today"
                value={formatUsd(u.cost_today_usd, { decimals: u.cost_today_usd < 1 ? 4 : 2 })}
                sub={`${formatUsd(u.cost_total_usd, { decimals: 2 })} all time`}
              />
              <KeyValue
                label="Est. monthly"
                value={formatUsd(u.est_monthly_cost_usd)}
                info="Today's spend rate projected over 30 days."
              />
              <KeyValue
                label="Tokens today"
                value={formatCompact(u.total_tokens_today)}
                sub={`${formatCompact(u.prompt_tokens_today)} in · ${formatCompact(u.completion_tokens_today)} out`}
              />
              <KeyValue
                label="Errors today"
                value={formatInt(u.errors_today)}
                tone={u.errors_today > 0 ? "down" : undefined}
                sub={`${formatPct(u.error_rate_pct, { decimals: 1 })} error rate`}
              />
            </dl>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs text-fg-subtle">
                <span>Requests per hour · 24 h</span>
                <span className="num">
                  {u.last_request_at
                    ? `Last ${formatRelativeTime(u.last_request_at, now)}`
                    : "No requests yet"}
                </span>
              </div>
              {hourly.length ? (
                <Sparkline
                  data={hourly.map((h) => h.requests)}
                  labels={hourly.map(
                    (h) => `${formatTime(h.hour, { seconds: false })} · ${formatInt(h.errors)} errors`,
                  )}
                  variant="bars"
                  tone="ai"
                  height={44}
                  formatValue={(v) => `${formatInt(v)} requests`}
                  aria-label="Requests per hour over the last 24 hours"
                />
              ) : (
                <p className="text-xs text-fg-subtle">{DASH}</p>
              )}
            </div>
            {u.last_error ? (
              <div className="rounded-lg border border-down/25 bg-down/[0.06] p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-down">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  Last error
                  {u.last_error_at ? (
                    <Tooltip content={formatDateTime(u.last_error_at)}>
                      <span tabIndex={0} className="font-normal text-fg-subtle">
                        · {formatRelativeTime(u.last_error_at, now)}
                      </span>
                    </Tooltip>
                  ) : null}
                </p>
                <p className="mt-1 break-words text-fg-muted">{u.last_error}</p>
              </div>
            ) : null}
            {!info.configured ? (
              <p className="text-xs leading-[1.125rem] text-fg-subtle">
                OpenRouter isn't configured, so these stay at zero: the local heuristic analyst (free,
                instant) is answering.
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
