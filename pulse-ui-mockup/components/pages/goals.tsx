'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Minus, Plus } from 'lucide-react'

interface GoalsPageProps {
  goalEnabled: boolean
  onGoalEnabledChange: (enabled: boolean) => void
  dailyGoalHours: number
  onDailyGoalHoursChange: (hours: number) => void
}

export default function GoalsPage({
  goalEnabled,
  onGoalEnabledChange,
  dailyGoalHours,
  onDailyGoalHoursChange,
}: GoalsPageProps) {
  const handleMinus = () => {
    onDailyGoalHoursChange(Math.max(1, dailyGoalHours - 1))
  }

  const handlePlus = () => {
    onDailyGoalHoursChange(dailyGoalHours + 1)
  }

  return (
    <div className="space-y-6">
      {/* Daily Goal */}
      <Card className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Checkbox
            id="goal-enabled"
            checked={goalEnabled}
            onCheckedChange={(checked) => onGoalEnabledChange(checked as boolean)}
            className="w-5 h-5"
          />
          <label
            htmlFor="goal-enabled"
            className="text-lg font-semibold text-foreground cursor-pointer"
          >
            Set Daily Goal
          </label>
        </div>

        {goalEnabled && (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-6 pt-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handleMinus}
                className="h-12 w-12"
              >
                <Minus className="w-5 h-5" />
              </Button>

              <div className="text-6xl font-light text-primary">{dailyGoalHours}</div>

              <Button
                variant="outline"
                size="icon"
                onClick={handlePlus}
                className="h-12 w-12"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            <div className="text-center text-sm text-muted-foreground">hours per day</div>
          </div>
        )}

        {!goalEnabled && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No daily goal set. Enable to start tracking.
          </div>
        )}
      </Card>

      {/* Progress Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Weekly Goal */}
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Weekly Goal</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-light text-primary">40</span>
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
            <Progress value={66} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>26.5h worked</span>
              <span>66%</span>
            </div>
          </div>
        </Card>

        {/* Monthly Goal */}
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Monthly Goal</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-light text-primary">160</span>
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
            <Progress value={60} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>96h worked</span>
              <span>60%</span>
            </div>
          </div>
        </Card>

        {/* Achievement */}
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Achievement</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-light text-primary">97.5%</span>
              <span className="text-xs text-muted-foreground">on track</span>
            </div>
            <Progress value={97.5} className="h-2" />
            <div className="text-xs text-muted-foreground">
              Great progress! Keep it up.
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
