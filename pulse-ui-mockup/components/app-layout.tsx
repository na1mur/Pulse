'use client'

import { LayoutDashboard, History, BarChart3, Target, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/theme-toggle'
import DashboardPage from '@/components/pages/dashboard'
import HistoryPage from '@/components/pages/history'
import StatisticsPage from '@/components/pages/statistics'
import GoalsPage from '@/components/pages/goals'

interface AppLayoutProps {
  currentPage: 'dashboard' | 'history' | 'statistics' | 'goals'
  onPageChange: (page: 'dashboard' | 'history' | 'statistics' | 'goals') => void
  goalEnabled: boolean
  onGoalEnabledChange: (enabled: boolean) => void
  dailyGoalHours: number
  onDailyGoalHoursChange: (hours: number) => void
}

const navItems = [
  { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'history' as const, icon: History, label: 'History' },
  { id: 'statistics' as const, icon: BarChart3, label: 'Statistics' },
  { id: 'goals' as const, icon: Target, label: 'Goals' },
]

export default function AppLayout({
  currentPage,
  onPageChange,
  goalEnabled,
  onGoalEnabledChange,
  dailyGoalHours,
  onDailyGoalHoursChange,
}: AppLayoutProps) {
  const pageTitle = {
    dashboard: 'Dashboard',
    history: 'History',
    statistics: 'Statistics',
    goals: 'Goals',
  }[currentPage]

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
              <div className="w-5 h-5 font-bold">P</div>
            </div>
            <div>
              <h1 className="font-semibold text-sidebar-foreground">Pulse</h1>
              <p className="text-xs text-muted-foreground">Time Tracker</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sidebar-accent">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">John Doe</p>
              <p className="text-xs text-muted-foreground truncate">john@example.com</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Account</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <header className="h-16 border-b border-border bg-background px-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">{pageTitle}</h2>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    JD
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background p-6">
          {currentPage === 'dashboard' && (
            <DashboardPage goalEnabled={goalEnabled} dailyGoalHours={dailyGoalHours} />
          )}
          {currentPage === 'history' && <HistoryPage />}
          {currentPage === 'statistics' && <StatisticsPage />}
          {currentPage === 'goals' && (
            <GoalsPage
              goalEnabled={goalEnabled}
              onGoalEnabledChange={onGoalEnabledChange}
              dailyGoalHours={dailyGoalHours}
              onDailyGoalHoursChange={onDailyGoalHoursChange}
            />
          )}
        </main>
      </div>
    </div>
  )
}
