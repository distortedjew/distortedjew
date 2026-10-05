import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { fieldControlClass } from "@/components/ui/field-styles";


export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  leftIcon?: LucideIcon;
  /** Element inside the right edge (unit, clear button, kbd hint). */
  rightSlot?: ReactNode;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Text input with optional leading icon and trailing slot. */
export function Input({ size = "md", leftIcon: LeftIcon, rightSlot, invalid, className, ref, ...props }: InputProps) {
  return (
    <div className={cn("relative flex w-full items-center", className)}>
      {LeftIcon ? (
        <LeftIcon className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" aria-hidden />
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldControlClass,
          size === "sm" ? "h-8 px-2.5 text-dense" : "h-9 px-3 text-sm",
          LeftIcon && (size === "sm" ? "pl-8" : "pl-8.5"),
          rightSlot ? "pr-12" : undefined,
        )}
        {...props}
      />
      {rightSlot ? (
        <div className="absolute right-2 flex items-center gap-1 text-xs text-fg-subtle">{rightSlot}</div>
      ) : null}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid, className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldControlClass, "min-h-20 px-3 py-2 text-sm leading-5", className)}
      {...props}
    />
  );
}
