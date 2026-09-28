"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-card! text-card-foreground! border-border! rounded-xl! shadow-lg!",
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
