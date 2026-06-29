'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import ThemeToggle from '@/components/theme-toggle'
import { LogOut } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      {/* General Section */}
      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">General</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select defaultValue="est">
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
                <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
                <SelectItem value="mst">Mountain Standard Time (MST)</SelectItem>
                <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
                <SelectItem value="utc">Coordinated Universal Time (UTC)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Appearance Section */}
      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-2">
              <ThemeToggle />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Choose how Pulse looks on your device</p>
          </div>
        </div>
      </Card>

      {/* Account Section */}
      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Account</h3>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-sm text-foreground">john@example.com</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Change Password</Button>
          </div>
        </div>
      </Card>

      {/* Productivity Section */}
      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Productivity</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="daily-goal">Daily Goal</Label>
            <Select defaultValue="8">
              <SelectTrigger id="daily-goal">
                <SelectValue placeholder="Select daily goal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 hours</SelectItem>
                <SelectItem value="7">7 hours</SelectItem>
                <SelectItem value="8">8 hours</SelectItem>
                <SelectItem value="9">9 hours</SelectItem>
                <SelectItem value="10">10 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* About Section */}
      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">About</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-muted-foreground">App Version</span>
            <span className="text-sm font-medium text-foreground">1.0.0</span>
          </div>
          <Button variant="outline" className="w-full">
            Visit GitHub
          </Button>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="p-6 space-y-4 border-destructive/20">
        <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
        <Button variant="destructive" className="w-full">
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </Card>
    </div>
  )
}
