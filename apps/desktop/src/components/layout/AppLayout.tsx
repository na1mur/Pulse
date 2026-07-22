import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  History,
  BarChart3,
  Target,
  LogOut,
  Settings,
  ChevronsLeft,
  ChevronsRight,
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
  { id: "settings" as const, icon: Settings, label: "Settings" },
];

function getInitials(email: string) {
  const part = email.split("@")[0] ?? "U";
  return part.slice(0, 2).toUpperCase();
}

function getDisplayName(email: string) {
  const part = email.split("@")[0] ?? "there";
  return part.charAt(0).toUpperCase() + part.slice(1);
}

const SIDEBAR_COLLAPSED_KEY = "pulse-sidebar-collapsed";

const pageTitles: Record<string, string> = {
  dashboard: "Dashboard",
  history: "History",
  statistics: "Statistics",
  goals: "Goals",
  settings: "Settings",
};

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const displayName = getDisplayName(userEmail);
  const initials = getInitials(userEmail);
  const pageTitle = pageTitles[currentPage] ?? "Dashboard";

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={`${
          sidebarCollapsed ? "w-[72px]" : "w-64"
        } border-r border-sidebar-border bg-sidebar glass flex flex-col transition-all duration-300`}
      >
        <div className="p-4 border-b border-sidebar-border">
          <div
            className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary flex-shrink-0 glow-purple-sm flex items-center justify-center">
              <img
                src="./branding/logo-mark.png"
                alt="Pulse"
                className="w-6 h-6 object-contain"
              />
            </div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="font-semibold text-sidebar-accent-foreground">
                  Pulse
                </h1>
                <p className="text-xs text-muted-foreground">Time Tracker</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPage === item.id ||
              (item.id === "settings" && currentPage === "settings");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                title={item.label}
                className={`w-full flex items-center ${
                  sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } py-2.5 rounded-xl transition-all ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground glow-purple-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon
                  className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-primary" : ""}`}
                />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <button
            type="button"
            onClick={toggleSidebar}
            className={`w-full flex items-center ${
              sidebarCollapsed ? "justify-center" : "gap-3 px-3"
            } py-2.5 rounded-xl text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors`}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronsRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronsLeft className="w-5 h-5" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-auto min-h-16 border-b border-border bg-background/80 glass px-6 py-4 flex items-center justify-between">
          <div>
            {currentPage === "dashboard" ? (
              <>
                <h2 className="text-xl font-bold text-foreground">
                  Welcome back, {displayName} 👋
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Stay focused and keep building.
                </p>
              </>
            ) : (
              <h2 className="text-xl font-bold text-foreground">{pageTitle}</h2>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger className="relative size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors hover:bg-primary/90">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-accent-green border-2 border-background" />
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
