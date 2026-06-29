import { useState } from "react";
import { Calendar } from "lucide-react";
import type { SessionRange } from "@repo/types";
import {
  formatMinutes,
  formatRelativeDate,
  formatSessionClock,
} from "@repo/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSessions, useUserSettings } from "@/hooks/usePulseQueries";

const FILTERS: { label: string; value: SessionRange }[] = [
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

export function HistoryPage() {
  const [range, setRange] = useState<SessionRange>("week");
  const { data: sessions = [], isLoading } = useSessions(range);
  const { data: settings } = useUserSettings();
  const timezone = settings?.timezone ?? "UTC";

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={range === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" disabled>
          <Calendar className="w-4 h-4 mr-2" />
          Pick Date
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Start Time
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  End Time
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-sm text-muted-foreground"
                  >
                    Loading sessions...
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-sm text-muted-foreground"
                  >
                    No sessions found for this period.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                  const dateKey = session.startTime.split("T")[0] ?? "";
                  return (
                    <tr
                      key={session.id ?? session._id ?? session.startTime}
                      className="border-b border-border hover:bg-muted/30 transition-colors last:border-0"
                    >
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatRelativeDate(dateKey, timezone)}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatSessionClock(session.startTime, timezone)}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatSessionClock(session.endTime, timezone)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">
                        {formatMinutes(session.durationMinutes)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
