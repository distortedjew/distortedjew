import { navItem } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsView } from "@/features/settings";

export default function SettingsPage() {
  const nav = navItem("settings");
  return (
    <>
      <PageHeader
        title={nav.label}
        description="Trading, risk, execution, AI model and notification settings — validated by the API, applied by the engine"
        icon={nav.icon}
      />
      <SettingsView />
    </>
  );
}
