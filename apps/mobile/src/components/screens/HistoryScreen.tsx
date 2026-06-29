import { useState } from "react";
import { View, ScrollView } from "react-native";
import type { SessionRange } from "@repo/types";
import {
  formatMinutes,
  formatRelativeDate,
  formatSessionClock,
} from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSessions, useUserSettings } from "@/hooks/usePulseQueries";

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

  return (
    <View className="flex-1">
      <ScreenHeader title="History" />
      <ScrollView className="flex-1 p-4" contentContainerClassName="gap-4 pb-8">
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
                  className="p-4 border-b border-neutral-100 gap-1"
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
      </ScrollView>
    </View>
  );
}
