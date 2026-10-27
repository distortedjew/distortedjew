import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { IconButton } from "@/components/ui/IconButton";

/** Dark / light switch (dark is the default; the choice is remembered). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={`Switch to ${next} mode`}
      onClick={toggleTheme}
      className={className}
    />
  );
}
