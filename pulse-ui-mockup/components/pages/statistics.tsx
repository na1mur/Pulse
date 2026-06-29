'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function StatisticsPage() {
  const dailyData = [
    { day: 'Mon', hours: 8.5 },
    { day: 'Tue', hours: 7.2 },
    { day: 'Wed', hours: 8.0 },
    { day: 'Thu', hours: 8.3 },
    { day: 'Fri', hours: 7.8 },
    { day: 'Sat', hours: 4.5 },
    { day: 'Sun', hours: 5.2 },
  ]

  const weeklyData = [
    { week: 'Week 1', hours: 40 },
    { week: 'Week 2', hours: 39.5 },
    { week: 'Week 3', hours: 42 },
    { week: 'Week 4', hours: 38.5 },
  ]

  const stats = [
    { label: 'Total Hours', value: '160h 30m' },
    { label: 'Weekly Hours', value: '40h 00m' },
    { label: 'Monthly Hours', value: '160h 30m' },
    { label: 'Average/Day', value: '7h 45m' },
    { label: 'Best Day', value: '8h 30m' },
    { label: 'Goal Achievement', value: '97.5%' },
  ]

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="p-6">
            <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
            <p className="text-3xl font-semibold text-foreground">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Daily Work Hours Chart */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4">Daily Work Hours</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--color-card) / 1)',
                border: `1px solid hsl(var(--color-border) / 1)`,
              }}
            />
            <Bar dataKey="hours" fill="currentColor" className="text-primary" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Weekly Trend Chart */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4">Weekly Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--color-card) / 1)',
                border: `1px solid hsl(var(--color-border) / 1)`,
              }}
            />
            <Bar dataKey="hours" fill="currentColor" className="text-primary" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
