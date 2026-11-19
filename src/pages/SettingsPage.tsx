import { Eye, EyeOff, KeyRound, Moon, Sun } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label } from '../components/ui/input.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { apiFetch } from '../lib/api.ts';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      toast.success('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Appearance preferences and account password security.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose Light or Dark theme for Hisaab</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Sun className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Light Mode</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Crisp high-contrast daylight</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Moon className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-semibold">Dark Mode</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Deep slate evening comfort</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Minimum 8 characters. Stored using bcrypt cryptographic hashing.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label htmlFor="set-cur-pw">Current Password</Label>
              <Input
                id="set-cur-pw"
                type={showPasswords ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="set-new-pw">New Password</Label>
              <Input
                id="set-new-pw"
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="set-conf-pw">Confirm New Password</Label>
              <Input
                id="set-conf-pw"
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPasswords ? 'Hide passwords' : 'Show passwords'}</span>
              </button>

              <Button type="submit" disabled={saving}>
                <KeyRound className="w-4 h-4" />
                <span>{saving ? 'Updating...' : 'Update Password'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
