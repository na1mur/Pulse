import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMinutes, minutesToHours } from "@repo/utils";
import { Card } from "@/components/ui/card";
import {
  useStatsSummary,
  useWeekStats,
  useWeeklyTrend,
} from "@/hooks/usePulseQueries";

const chartAxisProps = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
  axisLine: { stroke: "var(--border)" },
  tickLine: { stroke: "var(--border)" },
};

const chartTooltipProps = {
  cursor: false as const,
  contentStyle: {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--foreground)" },
  itemStyle: { color: "var(--foreground)" },
  formatter: (value: number) => [`${value.toFixed(1)} hrs`, "Hours"],
};

export function StatisticsPage() {
  const { data: summary } = useStatsSummary();
  const { data: weekStats = [] } = useWeekStats();
  const { data: weeklyTrend = [] } = useWeeklyTrend();

  const stats = [
    {
      label: "Total Hours",
      value: formatMinutes(summary?.totalWorkedMinutes ?? 0),
    },
    {
      label: "Weekly Hours",
      value: formatMinutes(summary?.weeklyWorkedMinutes ?? 0),
    },
    {
      label: "Monthly Hours",
      value: formatMinutes(summary?.monthlyWorkedMinutes ?? 0),
    },
    {
      label: "Average/Day",
      value: formatMinutes(summary?.averageDailyMinutes ?? 0),
    },
    {
      label: "Best Day",
      value: formatMinutes(summary?.bestDayMinutes ?? 0),
    },
    {
      label: "Goal Achievement",
      value: `${summary?.goalAchievementPercent ?? 0}%`,
    },
  ];

  const dailyData = weekStats.map((d) => ({
    day: d.day ?? d.date,
    hours: minutesToHours(d.workedMinutes),
  }));

  const weeklyData = weeklyTrend.map((w) => ({
    week: w.week,
    hours: w.hours,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-6">
            <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
            <p className="text-3xl font-semibold text-foreground">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4">Daily Work Hours</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyData}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              opacity={0.35}
            />
            <XAxis dataKey="day" {...chartAxisProps} />
            <YAxis {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar
              dataKey="hours"
              fill="var(--primary)"
              radius={[8, 8, 0, 0]}
              activeBar={{ fill: "var(--primary)", opacity: 0.85 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4">Weekly Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              opacity={0.35}
            />
            <XAxis dataKey="week" {...chartAxisProps} />
            <YAxis {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar
              dataKey="hours"
              fill="var(--primary)"
              radius={[8, 8, 0, 0]}
              activeBar={{ fill: "var(--primary)", opacity: 0.85 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
