import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { useProfile } from "@/hooks/useProfile";

export function NotificationSettings() {
  const { profile, updateProfile, refresh } = useProfile();
  const [saving, setSaving] = useState(false);

  const handleToggleNotifications = async () => {
    if (!profile) {
      return;
    }

    setSaving(true);
    await updateProfile({
      consent_notifications: !profile.consent_notifications,
    });
    await refresh();
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icons.bell className="w-4 h-4 text-primary" />
          Reminder Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground">Built-in popup alerts</p>
          <p className="text-xs text-muted-foreground mt-1">
            This app now uses only built-in popup reminders inside the app. SMS and message alerts have been removed.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="medication-reminders">Medication Popups</Label>
            <p className="text-xs text-muted-foreground">
              Show a popup when it is time to take your medicine
            </p>
          </div>
          <Switch
            id="medication-reminders"
            checked={profile?.consent_notifications ?? true}
            onCheckedChange={handleToggleNotifications}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="refill-alerts">Refill Alerts</Label>
            <p className="text-xs text-muted-foreground">
              Show low-stock reminders inside the app
            </p>
          </div>
          <Switch id="refill-alerts" defaultChecked />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="interaction-warnings">Interaction Warnings</Label>
            <p className="text-xs text-muted-foreground">
              Show warnings for possible drug interactions
            </p>
          </div>
          <Switch id="interaction-warnings" defaultChecked />
        </div>
      </CardContent>
    </Card>
  );
}
