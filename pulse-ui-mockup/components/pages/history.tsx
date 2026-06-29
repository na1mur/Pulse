'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Calendar } from 'lucide-react'

export default function HistoryPage() {
  const sessions = [
    { date: 'Today', startTime: '09:34 AM', endTime: '12:45 PM', duration: '3h 11m' },
    { date: 'Today', startTime: '01:00 PM', endTime: '02:14 PM', duration: '1h 14m' },
    { date: 'Yesterday', startTime: '08:30 AM', endTime: '05:00 PM', duration: '8h 15m' },
    { date: 'Yesterday', startTime: '05:30 PM', endTime: '06:15 PM', duration: '45m' },
    { date: 'Dec 27', startTime: '09:00 AM', endTime: '05:30 PM', duration: '8h 30m' },
    { date: 'Dec 26', startTime: '08:45 AM', endTime: '05:15 PM', duration: '8h 30m' },
    { date: 'Dec 25', startTime: '10:00 AM', endTime: '06:00 PM', duration: '8h 00m' },
  ]

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['Today', 'Week', 'Month', 'Year'].map((filter) => (
          <Button
            key={filter}
            variant={filter === 'Week' ? 'default' : 'outline'}
            size="sm"
          >
            {filter}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto">
          <Calendar className="w-4 h-4 mr-2" />
          Pick Date
        </Button>
      </div>

      {/* Sessions Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Start Time</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">End Time</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border hover:bg-muted/30 transition-colors last:border-0"
                >
                  <td className="px-6 py-4 text-sm text-foreground">{session.date}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{session.startTime}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{session.endTime}</td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{session.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
