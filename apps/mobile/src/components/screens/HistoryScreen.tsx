import { useState } from "react";
import { View } from "react-native";
import type { SessionRange } from "@repo/types";
import {
  formatMinutes,
  formatRelativeDate,
  formatSessionClock,
} from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSessions, useUserSettings } from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";

const FILTERS: { label: string; value: SessionRange }[] = [
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

export function HistoryScreen() {
  const [range, setRange] = useState<SessionRange>("week");
  const { data: sessions = [], isLoading } = useSessions(range);
  const { data: settings } = useUserSettings();
  const timezone = settings?.timezone ?? "UTC";
  const colors = useThemeColors();

  return (
    <Screen>
      <ScreenHeader title="History" />
      <ScreenScroll>
        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              label={filter.label}
              size="sm"
              variant={range === filter.value ? "default" : "outline"}
              onPress={() => setRange(filter.value)}
            />
          ))}
        </View>

        <Card className="p-0 overflow-hidden">
          {isLoading ? (
            <ThemedText className="p-6 text-neutral-500">Loading...</ThemedText>
          ) : sessions.length === 0 ? (
            <ThemedText className="p-6 text-neutral-500">
              No sessions found.
            </ThemedText>
          ) : (
            sessions.map((session) => {
              const dateKey = session.startTime.split("T")[0] ?? "";
              return (
                <View
                  key={session.id ?? session._id ?? session.startTime}
                  className="p-4 gap-1"
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <ThemedText className="font-medium">
                    {formatRelativeDate(dateKey, timezone)}
                  </ThemedText>
                  <ThemedText className="text-sm text-neutral-500">
                    {formatSessionClock(session.startTime, timezone)} →{" "}
                    {formatSessionClock(session.endTime, timezone)} ·{" "}
                    {formatMinutes(session.durationMinutes)}
                  </ThemedText>
                </View>
              );
            })
          )}
        </Card>
      </ScreenScroll>
    </Screen>
  );
}
