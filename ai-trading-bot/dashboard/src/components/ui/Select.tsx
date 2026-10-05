import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T | undefined;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  /** Content width follows the trigger by default; set e.g. "min-w-56" to widen. */
  contentClassName?: string;
  invalid?: boolean;
}

/**
 * Select (Radix). Item values must be non-empty strings — use a sentinel such as "all"
 * for an "All symbols" option and map it to `undefined` in your filter state.
 *
 *   <Select aria-label="Symbol" value={symbol} onValueChange={setSymbol}
 *     options={symbols.map((s) => ({ value: s, label: s }))} />
 */
export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  size = "md",
  disabled,
  id,
  className,
  contentClassName,
  invalid,
  ...aria
}: SelectProps<T>) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={aria["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn(
          "inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface-2 text-left text-fg transition-colors",
          "hover:border-fg/20 focus-visible:border-accent/60 focus-visible:outline-none data-[placeholder]:text-fg-subtle",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-down/60",
          size === "sm" ? "h-8 px-2.5 text-dense" : "h-9 px-3 text-sm",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "popper-motion surface-elevated z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg",
            "origin-(--radix-select-content-transform-origin)",
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectItem key={option.value} option={option} />
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem<T extends string>({ option }: { option: SelectOption<T> }) {
  const Icon = option.icon;
  return (
    <SelectPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-dense text-fg-muted outline-none select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-fg/[0.07] data-[highlighted]:text-fg data-[state=checked]:text-fg",
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden /> : null}
      <div className="min-w-0">
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        {option.description ? <div className="truncate text-xs text-fg-subtle">{option.description}</div> : null}
      </div>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex">
        <Check className="size-3.5 text-accent" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
