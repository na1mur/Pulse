import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { AuthGate } from "@/components/AuthGate";

export default function SettingsRoute() {
  return (
    <AuthGate>
      <SettingsScreen />
    </AuthGate>
  );
}
