import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Dot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Dropdown menu (Radix), styled.
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><IconButton icon={Ellipsis} label="Actions" /></DropdownMenuTrigger>
 *     <DropdownMenuContent align="end">
 *       <DropdownMenuItem icon={Download} onSelect={…}>Export CSV</DropdownMenuItem>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem icon={Trash2} tone="danger" onSelect={…}>Delete</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          "popper-motion surface-elevated z-50 min-w-44 overflow-hidden rounded-lg p-1",
          "origin-(--radix-dropdown-menu-content-transform-origin)",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClass = cn(
  "relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-dense text-fg-muted outline-none select-none",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-fg/[0.07] data-[highlighted]:text-fg",
  "[&_svg]:size-3.5 [&_svg]:shrink-0",
);

export function DropdownMenuItem({
  className,
  icon: Icon,
  shortcut,
  tone,
  children,
  ...props
}: ComponentProps<typeof Menu.Item> & { icon?: LucideIcon; shortcut?: ReactNode; tone?: "danger" }) {
  return (
    <Menu.Item
      className={cn(itemClass, tone === "danger" && "text-down data-[highlighted]:bg-down/10 data-[highlighted]:text-down", className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden className={tone === "danger" ? "" : "text-fg-subtle"} /> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="ml-4 text-xs text-fg-subtle">{shortcut}</span> : null}
    </Menu.Item>
  );
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(itemClass, "pl-7", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex">
        <Check className="text-accent" aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, "pl-7", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-1.5 inline-flex">
        <Dot className="size-5! text-accent" aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("label-caps px-2 pt-1.5 pb-1", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}
