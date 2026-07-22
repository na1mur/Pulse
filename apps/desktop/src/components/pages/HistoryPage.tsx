import { useState } from "react";
import { Calendar } from "lucide-react";
import type { SessionRange, WorkSession } from "@repo/types";
import {
  formatDurationSeconds,
  formatRelativeDate,
  formatSessionClock,
  getLocalDateKeyFromIso,
  getSessionDurationSeconds,
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

function ExpandableSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className="text-sm text-muted-foreground text-left w-full max-w-md"
    >
      <span className={expanded ? "" : "line-clamp-1"}>{text}</span>
    </button>
  );
}

export function HistoryPage() {
  const [range, setRange] = useState<SessionRange>("today");
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSessions(range);
  const { data: settings } = useUserSettings();
  const timezone = settings?.timezone ?? "UTC";
  const sessions = data?.pages.flatMap((page) => page.sessions) ?? [];

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
                  Title
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
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-muted-foreground"
                  >
                    Loading sessions...
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-muted-foreground"
                  >
                    No sessions found for this period.
                  </td>
                </tr>
              ) : (
                sessions.map((session: WorkSession) => {
                  const dateKey = getLocalDateKeyFromIso(
                    session.startTime,
                    timezone,
                  );
                  return (
                    <tr
                      key={session.id ?? session._id ?? session.startTime}
                      className="border-b border-border hover:bg-muted/30 transition-colors last:border-0"
                    >
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatRelativeDate(dateKey, timezone)}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {session.title || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatSessionClock(session.startTime, timezone)}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatSessionClock(session.endTime, timezone)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">
                        {formatDurationSeconds(
                          getSessionDurationSeconds(session),
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground max-w-xs">
                        {session.summary ? (
                          <ExpandableSummary text={session.summary} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
