import { CircleCheck, Info, LoaderCircle, OctagonAlert, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/lib/theme";

/**
 * Themed toast host (sonner), mounted once in the app shell. Raise toasts anywhere with
 * `import { toast } from "sonner"`: toast.success("Settings saved"), toast.error(describeError(e)).
 */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      offset={{ bottom: 20, right: 20 }}
      mobileOffset={{ bottom: 76, left: 12, right: 12 }}
      visibleToasts={4}
      gap={8}
      closeButton
      icons={{
        success: <CircleCheck className="size-4 text-up" aria-hidden />,
        info: <Info className="size-4 text-info" aria-hidden />,
        warning: <TriangleAlert className="size-4 text-warning" aria-hidden />,
        error: <OctagonAlert className="size-4 text-down" aria-hidden />,
        loading: <LoaderCircle className="size-4 animate-spin text-fg-muted" aria-hidden />,
      }}
      style={
        {
          "--normal-bg": "var(--elevated)",
          "--normal-border": "var(--line-strong)",
          "--normal-text": "var(--fg)",
          "--border-radius": "12px",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!shadow-popover !font-sans !gap-2.5 !py-3 !px-3.5",
          title: "!text-dense !font-medium !text-fg",
          description: "!text-xs !text-fg-muted",
          closeButton: "!bg-elevated !border-line-strong !text-fg-subtle hover:!text-fg",
          actionButton: "!bg-accent-solid !text-accent-fg !rounded-md",
        },
      }}
    />
  );
}
