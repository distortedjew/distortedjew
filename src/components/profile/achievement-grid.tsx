import { Sparkles, Heart, Gamepad2, Globe, Flame, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACHIEVEMENTS_CATALOG } from "@/lib/gamification/achievements-catalog";
import { cn } from "@/lib/utils";

export interface AchievementView {
  key: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string;
}

const ICONS: Record<string, typeof Sparkles> = {
  sparkles: Sparkles,
  heart: Heart,
  gamepad: Gamepad2,
  globe: Globe,
  flame: Flame,
};

export function AchievementGrid({ achievements }: { achievements: AchievementView[] }) {
  const unlockedKeys = new Set(achievements.map((a) => a.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="size-4" /> Achievements
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACHIEVEMENTS_CATALOG.map((a) => {
            const unlocked = unlockedKeys.has(a.key);
            const Icon = ICONS[a.icon] ?? Award;
            return (
              <div
                key={a.key}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
                  unlocked
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/60 bg-card/40",
                )}
              >
                {/* Only the badge is dimmed when locked; the text stays readable. */}
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full bg-accent text-primary",
                    !unlocked && "opacity-50 grayscale",
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="text-xs font-medium">
                  {a.name}
                  {!unlocked && <span className="sr-only"> (locked)</span>}
                </div>
                <div className="text-xs text-muted-foreground">{a.description}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
