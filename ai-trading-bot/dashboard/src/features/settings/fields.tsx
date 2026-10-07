import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { BotSettings } from "@/types";
import { Card, CardBody, CardHeader, Field, NumberInput, Tooltip } from "@/components/ui";
import { BOUNDS, type SectionKey } from "@/features/settings/settings-form";

/** What every settings tab receives from the form controller. */
export interface TabProps {
  form: BotSettings;
  errors: Record<string, string>;
  dirty: ReadonlySet<string>;
  update: <S extends SectionKey, F extends keyof BotSettings[S]>(
    section: S,
    field: F,
    value: BotSettings[S][F],
  ) => void;
}

/** A group of settings in a card. */
export function SettingsSection({
  title,
  description,
  icon,
  info,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  info?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={description} icon={icon} info={info} actions={actions} />
      <CardBody className="pt-1">{children}</CardBody>
    </Card>
  );
}

/** Small "Modified" dot next to a field label while it differs from the saved value. */
export function ModifiedMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Tooltip content="Changed — not saved yet">
      <span tabIndex={0} className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        Modified
      </span>
    </Tooltip>
  );
}

export interface NumberSettingProps {
  path: string;
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number;
  decimals?: number;
  hint?: ReactNode;
  info?: ReactNode;
  error?: string;
  modified?: boolean;
  disabled?: boolean;
  className?: string;
}

/** NumberInput + Field wired to the schema bounds of `path` (shown in the hint). */
export function NumberSetting({
  path,
  label,
  value,
  onChange,
  unit,
  step = 1,
  decimals,
  hint,
  info,
  error,
  modified,
  disabled,
  className,
}: NumberSettingProps) {
  const bound = BOUNDS[path] ?? {};
  const id = `setting-${path.replace(/\./g, "-")}`;
  const range =
    bound.min !== undefined && bound.max !== undefined
      ? `${bound.min}–${bound.max}${unit ? ` ${unit}` : ""}`
      : bound.min !== undefined
        ? `≥ ${bound.min}${unit ? ` ${unit}` : ""}`
        : undefined;
  return (
    <Field
      label={label}
      htmlFor={id}
      info={info}
      error={error}
      className={className}
      aside={
        modified || range ? (
          <span className="flex items-center gap-2">
            <ModifiedMark show={Boolean(modified)} />
            {range ? <span className="num text-fg-subtle">{range}</span> : null}
          </span>
        ) : undefined
      }
      hint={hint}
    >
      <NumberInput
        id={id}
        aria-describedby={`${id}-hint`}
        value={value}
        onValueChange={(v) => onChange(v ?? bound.min ?? 0)}
        min={bound.min}
        max={bound.max}
        step={step}
        decimals={decimals}
        unit={unit}
        invalid={Boolean(error)}
        disabled={disabled}
      />
    </Field>
  );
}

/** Grid for fields inside a section. */
export function FieldGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-x-5 gap-y-4 sm:grid-cols-2", className)}>{children}</div>;
}

/** Radio-card group (strategy, order type): accessible as a radiogroup with arrow keys via native radios. */
export function ChoiceCards<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 3,
  disabled,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: {
    value: T;
    label: ReactNode;
    description?: ReactNode;
    icon?: LucideIcon;
    badge?: ReactNode;
    iconClassName?: string;
  }[];
  columns?: 2 | 3;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className={cn("grid gap-2.5", columns === 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const Icon = option.icon;
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent/70",
              checked
                ? "border-accent/60 bg-accent/[0.07]"
                : "border-line hover:border-line-strong hover:bg-fg/[0.025]",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="flex items-center gap-2">
              {Icon ? (
                <Icon
                  className={cn("size-4 shrink-0", option.iconClassName ?? "text-fg-muted")}
                  aria-hidden
                />
              ) : null}
              <span className="text-dense font-medium text-fg">{option.label}</span>
              {option.badge}
              <span
                aria-hidden
                className={cn(
                  "ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border",
                  checked ? "border-accent-solid bg-accent-solid" : "border-line-strong",
                )}
              >
                {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
              </span>
            </span>
            {option.description ? (
              <span className="text-xs leading-[1.125rem] text-fg-subtle">{option.description}</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
