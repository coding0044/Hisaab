import { Mail, Phone, Save } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label } from '../components/ui/input.tsx';
import { MemberAvatar } from '../components/ui/member-avatar.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      await refreshUser();
      toast.success('WhatsApp phone number updated.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update phone number.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Member Profile
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your registered contact details used for WhatsApp Click-to-Chat reminders.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 flex items-center gap-4">
          <MemberAvatar name={user.full_name} avatarUrl={user.avatar_url} size="lg" />
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              {user.full_name}
            </h3>
            <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              <Mail className="w-4 h-4 shrink-0" />
              <span className="truncate">{user.email}</span>
            </p>
            <p className="flex items-center gap-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 mt-1">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp International: +{user.international_phone}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Update WhatsApp Phone Number</CardTitle>
          <CardDescription>
            Automatically normalized to +92 international format for WhatsApp links
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePhone} className="space-y-4">
            <div>
              <Label htmlFor="prof-phone">Pakistani Mobile / WhatsApp Number</Label>
              <Input
                id="prof-phone"
                type="tel"
                required
                className="font-mono"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="03332853138"
              />
            </div>

            <Button type="submit" disabled={saving}>
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Phone Number'}</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
