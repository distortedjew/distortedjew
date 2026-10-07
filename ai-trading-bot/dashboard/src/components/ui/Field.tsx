import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

/** Form label (Radix): clicking focuses the control with the matching id. */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-dense font-medium text-fg select-none peer-disabled:opacity-50", className)}
      {...props}
    />
  );
}

export interface FieldProps {
  label: ReactNode;
  /** id of the control inside (for the label and aria-describedby). */
  htmlFor?: string;
  /** Helper text under the control. */
  hint?: ReactNode;
  /** Validation message; replaces the hint and turns red. */
  error?: ReactNode;
  /** Longer explanation in an ⓘ tooltip. */
  info?: ReactNode;
  required?: boolean;
  /** Right side of the label row (e.g. "Requires restart" badge, current value). */
  aside?: ReactNode;
  /** "stacked" (label above) or "inline" (label left, control right — for switches). */
  layout?: "stacked" | "inline";
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint/error. Give the control `id={htmlFor}` and
 * `aria-describedby={`${htmlFor}-hint`}` for screen readers.
 *
 *   <Field label="Risk per trade" htmlFor="risk" hint="Of equity, per position" error={errors["risk.risk_per_trade_pct"]}>
 *     <NumberInput id="risk" value={…} onValueChange={…} unit="%" />
 *   </Field>
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  info,
  required,
  aside,
  layout = "stacked",
  className,
  children,
}: FieldProps) {
  const message = error ?? hint;
  const messageNode = message ? (
    <p
      id={htmlFor ? `${htmlFor}-hint` : undefined}
      className={cn("text-xs leading-4", error ? "text-down" : "text-fg-subtle")}
      role={error ? "alert" : undefined}
    >
      {message}
    </p>
  ) : null;

  const labelRow = (
    <div className="flex min-w-0 items-center gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-down">*</span> : null}
      </Label>
      {info ? <InfoTooltip content={info} /> : null}
    </div>
  );

  if (layout === "inline") {
    return (
      <div className={cn("flex items-start justify-between gap-4", className)}>
        <div className="min-w-0 space-y-0.5">
          {labelRow}
          {messageNode}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        {labelRow}
        {aside ? <div className="shrink-0 text-xs text-fg-subtle">{aside}</div> : null}
      </div>
      {children}
      {messageNode}
    </div>
  );
}
