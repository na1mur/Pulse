import { View, ScrollView } from "react-native";
import { formatMinutes, minutesToHours } from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import {
  useStatsSummary,
  useWeekStats,
  useWeeklyTrend,
} from "@/hooks/usePulseQueries";
import { useTheme } from "@/hooks/useTheme";

function SimpleBarChart({
  data,
  labelKey,
  valueKey,
}: {
  data: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
}) {
  const { resolvedScheme } = useTheme();
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <View className="h-48 flex-row items-end justify-between gap-2 pt-4">
      {data.map((item, i) => {
        const value = Number(item[valueKey]) || 0;
        const barHeight = Math.max(8, (value / max) * 120);
        return (
          <View key={i} className="flex-1 items-center gap-2">
            <View
              className="w-full rounded-t-md"
              style={{
                height: barHeight,
                backgroundColor: resolvedScheme === "dark" ? "#d4d4d4" : "#262626",
              }}
            />
            <ThemedText className="text-xs text-neutral-500">
              {String(item[labelKey])}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

export function StatisticsScreen() {
  const { data: summary } = useStatsSummary();
  const { data: weekStats = [] } = useWeekStats();
  const { data: weeklyTrend = [] } = useWeeklyTrend();

  const stats = [
    { label: "Total Hours", value: formatMinutes(summary?.totalWorkedMinutes ?? 0) },
    { label: "Weekly Hours", value: formatMinutes(summary?.weeklyWorkedMinutes ?? 0) },
    { label: "Monthly Hours", value: formatMinutes(summary?.monthlyWorkedMinutes ?? 0) },
    { label: "Average/Day", value: formatMinutes(summary?.averageDailyMinutes ?? 0) },
    { label: "Best Day", value: formatMinutes(summary?.bestDayMinutes ?? 0) },
    { label: "Goal Achievement", value: `${summary?.goalAchievementPercent ?? 0}%` },
  ];

  const dailyData = weekStats.map((d) => ({
    day: d.day ?? d.date.slice(5),
    hours: minutesToHours(d.workedMinutes),
  }));

  const weeklyData = weeklyTrend.map((w) => ({
    week: w.week.replace("Week ", "W"),
    hours: w.hours,
  }));

  return (
    <View className="flex-1">
      <ScreenHeader title="Statistics" />
      <ScrollView className="flex-1 p-4" contentContainerClassName="gap-4 pb-8">
        <View className="flex-row flex-wrap gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4 min-w-[46%] flex-1 gap-1">
              <ThemedText className="text-sm text-neutral-500">{stat.label}</ThemedText>
              <ThemedText className="text-2xl font-semibold">{stat.value}</ThemedText>
            </Card>
          ))}
        </View>

        <Card className="p-4 gap-2">
          <ThemedText className="font-semibold">Daily Work Hours</ThemedText>
          <SimpleBarChart data={dailyData} labelKey="day" valueKey="hours" />
        </Card>

        <Card className="p-4 gap-2">
          <ThemedText className="font-semibold">Weekly Trend</ThemedText>
          <SimpleBarChart data={weeklyData} labelKey="week" valueKey="hours" />
        </Card>
      </ScrollView>
    </View>
  );
}
