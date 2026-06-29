import {
  LayoutDashboard,
  History,
  BarChart3,
  Target,
  LogOut,
  Settings,
} from "lucide-react";
import type { AppPage } from "@repo/types";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { HistoryPage } from "@/components/pages/HistoryPage";
import { StatisticsPage } from "@/components/pages/StatisticsPage";
import { GoalsPage } from "@/components/pages/GoalsPage";
import { SettingsPage } from "@/components/pages/SettingsPage";

interface AppLayoutProps {
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
  goalEnabled: boolean;
  onGoalEnabledChange: (enabled: boolean) => void;
  dailyGoalHours: number;
  onDailyGoalHoursChange: (hours: number) => void;
  weeklyGoalEnabled: boolean;
  onWeeklyGoalEnabledChange: (enabled: boolean) => void;
  weeklyGoalHours: number;
  onWeeklyGoalHoursChange: (hours: number) => void;
  monthlyGoalEnabled: boolean;
  onMonthlyGoalEnabledChange: (enabled: boolean) => void;
  monthlyGoalHours: number;
  onMonthlyGoalHoursChange: (hours: number) => void;
  userEmail: string;
  onLogout: () => void;
}

const navItems = [
  { id: "dashboard" as const, icon: LayoutDashboard, label: "Dashboard" },
  { id: "history" as const, icon: History, label: "History" },
  { id: "statistics" as const, icon: BarChart3, label: "Statistics" },
  { id: "goals" as const, icon: Target, label: "Goals" },
];

function getInitials(email: string) {
  const part = email.split("@")[0] ?? "U";
  return part.slice(0, 2).toUpperCase();
}

export function AppLayout({
  currentPage,
  onPageChange,
  goalEnabled,
  onGoalEnabledChange,
  dailyGoalHours,
  onDailyGoalHoursChange,
  weeklyGoalEnabled,
  onWeeklyGoalEnabledChange,
  weeklyGoalHours,
  onWeeklyGoalHoursChange,
  monthlyGoalEnabled,
  onMonthlyGoalEnabledChange,
  monthlyGoalHours,
  onMonthlyGoalHoursChange,
  userEmail,
  onLogout,
}: AppLayoutProps) {
  const pageTitle =
    currentPage === "settings"
      ? "Settings"
      : {
          dashboard: "Dashboard",
          history: "History",
          statistics: "Statistics",
          goals: "Goals",
        }[currentPage as "dashboard" | "history" | "statistics" | "goals"];

  const initials = getInitials(userEmail);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img
              src="/branding/logo-mark.png"
              alt=""
              className="w-10 h-10 rounded-lg"
            />
            <div>
              <h1 className="font-semibold text-sidebar-foreground">Pulse</h1>
              <p className="text-xs text-muted-foreground">Time Tracker</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sidebar-accent">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {userEmail.split("@")[0]}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {userEmail}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-background px-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">{pageTitle}</h2>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    {initials}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onPageChange("settings")}>
                  <Settings className="w-4 h-4 mr-2" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-background p-6">
          {currentPage === "dashboard" && (
            <DashboardPage
              goalEnabled={goalEnabled}
              dailyGoalHours={dailyGoalHours}
            />
          )}
          {currentPage === "history" && <HistoryPage />}
          {currentPage === "statistics" && <StatisticsPage />}
          {currentPage === "goals" && (
            <GoalsPage
              goalEnabled={goalEnabled}
              onGoalEnabledChange={onGoalEnabledChange}
              dailyGoalHours={dailyGoalHours}
              onDailyGoalHoursChange={onDailyGoalHoursChange}
              weeklyGoalEnabled={weeklyGoalEnabled}
              onWeeklyGoalEnabledChange={onWeeklyGoalEnabledChange}
              weeklyGoalHours={weeklyGoalHours}
              onWeeklyGoalHoursChange={onWeeklyGoalHoursChange}
              monthlyGoalEnabled={monthlyGoalEnabled}
              onMonthlyGoalEnabledChange={onMonthlyGoalEnabledChange}
              monthlyGoalHours={monthlyGoalHours}
              onMonthlyGoalHoursChange={onMonthlyGoalHoursChange}
            />
          )}
          {currentPage === "settings" && <SettingsPage onLogout={onLogout} />}
        </main>
      </div>
    </div>
  );
}
