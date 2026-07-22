import { useState } from "react";
import { View } from "react-native";
import type { SessionRange, WorkSession } from "@repo/types";
import {
  formatDurationSeconds,
  formatRelativeDate,
  formatSessionClock,
  getDisplayTimezone,
  getLocalDateKeyFromIso,
  getSessionDurationSeconds,
} from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { flattenSessionPages, useSessions } from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";
import { Pressable } from "react-native";

const FILTERS: { label: string; value: SessionRange }[] = [
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

function ExpandableSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => setExpanded((prev) => !prev)}>
      <ThemedText
        numberOfLines={expanded ? undefined : 1}
        className="text-sm text-neutral-500"
      >
        {text}
      </ThemedText>
    </Pressable>
  );
}

function HistorySessionRow({
  session,
  timezone,
  colors,
}: {
  session: WorkSession;
  timezone: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const dateKey = getLocalDateKeyFromIso(session.startTime, timezone);

  return (
    <View
      className="p-4 gap-1"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <ThemedText className="font-medium">
        {formatRelativeDate(dateKey, timezone)}
      </ThemedText>
      {session.title ? (
        <ThemedText className="font-semibold">{session.title}</ThemedText>
      ) : null}
      <ThemedText className="text-sm text-neutral-500">
        {formatSessionClock(session.startTime, timezone)} →{" "}
        {formatSessionClock(session.endTime, timezone)} ·{" "}
        {formatDurationSeconds(getSessionDurationSeconds(session))}
      </ThemedText>
      {session.summary ? <ExpandableSummary text={session.summary} /> : null}
    </View>
  );
}

export function HistoryScreen() {
  const [range, setRange] = useState<SessionRange>("today");
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSessions(range);
  const timezone = getDisplayTimezone();
  const colors = useThemeColors();
  const sessions = flattenSessionPages(data?.pages);

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
          ) : isError ? (
            <ThemedText className="p-6 text-red-500">
              Failed to load sessions. Please try again.
            </ThemedText>
          ) : sessions.length === 0 ? (
            <ThemedText className="p-6 text-neutral-500">
              No sessions found.
            </ThemedText>
          ) : (
            sessions.map((session) => (
              <HistorySessionRow
                key={session.id ?? session._id ?? session.startTime}
                session={session}
                timezone={timezone}
                colors={colors}
              />
            ))
          )}
        </Card>

        {hasNextPage ? (
          <Button
            label={isFetchingNextPage ? "Loading..." : "Load More"}
            variant="outline"
            onPress={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          />
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
