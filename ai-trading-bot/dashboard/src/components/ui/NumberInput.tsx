import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type KeyboardEvent, type Ref } from "react";
import { cn } from "@/lib/cn";
import { fieldControlClass } from "@/components/ui/field-styles";

export interface NumberInputProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Fixed decimals for display (default: as typed / natural). */
  decimals?: number;
  /** Unit suffix shown inside the field: "%", "USDT", "min", "bps". */
  unit?: string;
  /** Allow clearing to null (default false → clamps to min or 0). */
  allowEmpty?: boolean;
  size?: "sm" | "md";
  id?: string;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  ref?: Ref<HTMLInputElement>;
  /** Show the ▲▼ stepper buttons (default true). */
  stepper?: boolean;
}

function clamp(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

function roundStep(value: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(value.toFixed(Math.min(10, decimals + 2)));
}

function display(value: number | null, decimals?: number): string {
  if (value === null || !Number.isFinite(value)) return "";
  return decimals === undefined ? String(value) : value.toFixed(decimals);
}

/**
 * Numeric field with unit suffix, min/max clamping on blur, ↑/↓ stepping (Shift = ×10)
 * and an out-of-range state. The value is a number (or null when `allowEmpty`).
 *
 *   <NumberInput value={risk} onValueChange={setRisk} min={0.1} max={5} step={0.1} unit="%" />
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  decimals,
  unit,
  allowEmpty = false,
  size = "md",
  invalid,
  className,
  stepper = true,
  disabled,
  ref,
  ...rest
}: NumberInputProps) {
  // While focused the raw text is kept, so partial input like "1." or "-" survives re-renders.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? display(value, decimals);
  const outOfRange =
    value !== null && ((min !== undefined && value < min) || (max !== undefined && value > max));

  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      onValueChange(allowEmpty ? null : clamp(min ?? 0, min, max));
    } else {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) onValueChange(clamp(parsed, min, max));
    }
    setDraft(null);
  };

  const nudge = (direction: 1 | -1, multiplier = 1) => {
    const base = value ?? min ?? 0;
    onValueChange(clamp(roundStep(base + direction * step * multiplier, step), min, max));
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      nudge(event.key === "ArrowUp" ? 1 : -1, event.shiftKey ? 10 : 1);
    } else if (event.key === "Enter") {
      commit(event.currentTarget.value);
    }
  };

  return (
    <div className={cn("group/num relative flex w-full items-center", className)}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={invalid || outOfRange || undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        role="spinbutton"
        className={cn(
          fieldControlClass,
          "num",
          size === "sm" ? "h-8 pl-2.5 text-dense" : "h-9 pl-3 text-sm",
          unit
            ? stepper
              ? "pr-[calc(1.75rem+var(--unit-w))]"
              : "pr-[calc(0.75rem+var(--unit-w))]"
            : stepper
              ? "pr-8"
              : "pr-3",
        )}
        style={{ ["--unit-w" as string]: unit ? `${unit.length * 0.5 + 0.5}rem` : "0rem" }}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = Number(next.trim().replace(",", "."));
          if (next.trim() !== "" && Number.isFinite(parsed)) onValueChange(parsed);
        }}
        onFocus={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        {...rest}
      />
      {unit ? (
        <span
          className={cn(
            "pointer-events-none absolute text-xs text-fg-subtle",
            stepper ? "right-7" : "right-3",
          )}
        >
          {unit}
        </span>
      ) : null}
      {stepper ? (
        <div className="absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r-[7px] border-l border-line opacity-70 transition-opacity group-hover/num:opacity-100">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Increase"
            disabled={disabled || (max !== undefined && value !== null && value >= max)}
            onClick={() => nudge(1)}
            className="flex flex-1 items-center justify-center text-fg-subtle hover:bg-fg/[0.06] hover:text-fg disabled:opacity-40"
          >
            <ChevronUp className="size-3" aria-hidden />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Decrease"
            disabled={disabled || (min !== undefined && value !== null && value <= min)}
            onClick={() => nudge(-1)}
            className="flex flex-1 items-center justify-center border-t border-line text-fg-subtle hover:bg-fg/[0.06] hover:text-fg disabled:opacity-40"
          >
            <ChevronDown className="size-3" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
