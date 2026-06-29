'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Clock, Pause } from 'lucide-react'

interface DashboardPageProps {
  goalEnabled: boolean
  dailyGoalHours: number
}

// Mock sessions data for today
const todaySessions = [
  { id: 1, start: '09:00 AM', end: '10:30 AM', duration: '1h 30m' },
  { id: 2, start: '11:00 AM', end: '12:45 PM', duration: '1h 45m' },
  { id: 3, start: '02:00 PM', end: '04:10 PM', duration: '2h 10m' },
]

export default function DashboardPage({ goalEnabled, dailyGoalHours }: DashboardPageProps) {
  const [showSessions, setShowSessions] = useState(false)

  const workedToday = 4.42 // 4h 25m in decimal
  const totalMinutesToday = Math.floor(workedToday * 60)
  const hoursToday = Math.floor(workedToday)
  const minutesToday = totalMinutesToday - hoursToday * 60

  const progressPercentage = goalEnabled ? Math.round((workedToday / dailyGoalHours) * 100) : 0
  const remainingHours = Math.max(0, dailyGoalHours - workedToday)

  return (
    <div className="space-y-6">
      {/* Main Timer Card */}
      <Card className="p-8 md:p-12 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Current Session</p>
          <div className="text-6xl md:text-7xl font-light text-primary">
            04:25:18
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-foreground">Currently Working</span>
          </div>
        </div>

        {/* Control Button */}
        <div className="flex justify-center pt-4">
          <Button size="lg" className="gap-2">
            <Pause className="w-4 h-4" />
            Pause
          </Button>
        </div>
      </Card>

      {/* Stats Grid - Responsive with 2-5 cards per row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Worked Today */}
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Worked Today</p>
          <div className="text-3xl font-semibold text-foreground">
            {hoursToday}h {minutesToday}m
          </div>
          {goalEnabled && (
            <p className="text-xs text-muted-foreground">Goal: {dailyGoalHours}h</p>
          )}
        </Card>

        {/* Progress - Only show if goal is enabled */}
        {goalEnabled && (
          <Card className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">Progress</p>
            <div className="space-y-2">
              <div className="text-3xl font-semibold text-primary">
                {progressPercentage}%
              </div>
              <Progress value={Math.min(progressPercentage, 100)} className="h-2" />
            </div>
          </Card>
        )}

        {/* Remaining - Only show if goal is enabled */}
        {goalEnabled && (
          <Card className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">Remaining</p>
            <div className="text-3xl font-semibold text-foreground">
              {Math.floor(remainingHours)}h {Math.round((remainingHours % 1) * 60)}m
            </div>
          </Card>
        )}

        {/* Sessions Today - Clickable */}
        <Card
          className="p-6 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setShowSessions(true)}
        >
          <p className="text-sm text-muted-foreground">Sessions Today</p>
          <div className="text-3xl font-semibold text-foreground">
            {todaySessions.length}
          </div>
          <p className="text-xs text-muted-foreground">Click to view all</p>
        </Card>

        {/* This Week */}
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">This Week</p>
          <div className="text-3xl font-semibold text-foreground">
            26h 30m
          </div>
        </Card>

        {/* Best Day */}
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Best Day</p>
          <div className="text-3xl font-semibold text-foreground">
            8h 15m
          </div>
        </Card>

        {/* Current Streak */}
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Current Streak</p>
          <div className="text-3xl font-semibold text-foreground">
            7 days
          </div>
        </Card>
      </div>

      {/* Sessions Modal */}
      {showSessions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl space-y-6 p-6 md:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-foreground">Sessions Today</h2>
              <Button
                variant="ghost"
                onClick={() => setShowSessions(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </Button>
            </div>

            {/* Sessions List */}
            <div className="space-y-3">
              {todaySessions.map((session) => (
                <div
                  key={session.id}
                  className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{session.start} - {session.end}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Duration: {session.duration}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowSessions(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
