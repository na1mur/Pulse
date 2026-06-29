'use client'

import { useState } from 'react'
import AuthPages from '@/components/auth-pages'
import AppLayout from '@/components/app-layout'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'history' | 'statistics' | 'goals'>('dashboard')
  const [goalEnabled, setGoalEnabled] = useState(false)
  const [dailyGoalHours, setDailyGoalHours] = useState(8)

  if (!isAuthenticated) {
    return <AuthPages onAuthSuccess={() => setIsAuthenticated(true)} />
  }

  return (
    <AppLayout
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      goalEnabled={goalEnabled}
      onGoalEnabledChange={setGoalEnabled}
      dailyGoalHours={dailyGoalHours}
      onDailyGoalHoursChange={setDailyGoalHours}
    />
  )
}
