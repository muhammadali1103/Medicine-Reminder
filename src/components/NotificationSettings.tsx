import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import { useProfile } from "@/hooks/useProfile";
import { useMedications } from "@/hooks/useMedications";
import {
  fetchNotificationSettings,
  NotificationSettingsData,
  playReminderSound,
  ReminderSound,
  requestNotificationPermission,
  updateNotificationSettings,
} from "@/services/notificationEngine";
import { toast } from "sonner";

const soundOptions: Array<{ value: ReminderSound; label: string; description: string }> = [
  { value: "gentle", label: "Gentle", description: "Soft chime for the first reminder" },
  { value: "medium", label: "Medium", description: "Stronger follow-up reminder" },
  { value: "urgent", label: "Urgent", description: "High priority alarm for overdue doses" },
];

const defaultSettings: NotificationSettingsData = {
  first_reminder_sound: "gentle",
  second_reminder_sound: "medium",
  third_reminder_sound: "urgent",
  snooze_options: [10, 20, 30],
  medication_sound_overrides: {},
  escalate_to_caregiver: true,
  escalate_after_minutes: 30,
  quiet_hours_start: null,
  quiet_hours_end: null,
  vibrate_only: false,
};

export function NotificationSettings() {
  const { profile, updateProfile, refresh } = useProfile();
  const { medications } = useMedications();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [settings, setSettings] = useState<NotificationSettingsData>(defaultSettings);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const response = await fetchNotificationSettings();
      if (response.data) {
        setSettings(response.data);
        setQuietHoursEnabled(Boolean(response.data.quiet_hours_start && response.data.quiet_hours_end));
      }
      setLoading(false);
    };

    void load();
  }, []);

  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.is_active),
    [medications]
  );

  const saveSettings = async (nextSettings: NotificationSettingsData) => {
    setSaving(true);
    const response = await updateNotificationSettings(nextSettings);
    if (response.error || !response.data) {
      toast.error(response.error?.message || "Failed to save notification settings.");
      setSaving(false);
      return;
    }

    setSettings(response.data);
    toast.success("Notification settings saved.");
    setSaving(false);
  };

  const updateSetting = async <K extends keyof NotificationSettingsData>(key: K, value: NotificationSettingsData[K]) => {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
  };

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

    if (profile.consent_notifications !== false) {
      toast.message("Medication popups disabled.");
    } else {
      const permission = await requestNotificationPermission();
      if (permission === "denied") {
        toast.warning("Browser notifications are blocked, so alerts will stay inside the app.");
      }
      toast.success("Medication popups enabled.");
    }
  };

  const handlePreview = async (sound: ReminderSound) => {
    await playReminderSound(sound, false);
  };

  const handleMedicationSoundChange = async (medicationId: string, value: ReminderSound | "default") => {
    const overrides = { ...settings.medication_sound_overrides };
    if (value === "default") {
      delete overrides[medicationId];
    } else {
      overrides[medicationId] = value;
    }

    await updateSetting("medication_sound_overrides", overrides);
  };

  const toggleQuietHours = async (enabled: boolean) => {
    setQuietHoursEnabled(enabled);
    if (!enabled) {
      await saveSettings({
        ...settings,
        quiet_hours_start: null,
        quiet_hours_end: null,
      });
      return;
    }

    await saveSettings({
      ...settings,
      quiet_hours_start: settings.quiet_hours_start || "22:00",
      quiet_hours_end: settings.quiet_hours_end || "07:00",
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icons.bell className="w-4 h-4 text-primary" />
          Smart Notification Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground">Escalating built-in reminders</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Level 1 is gentle, level 2 gets stronger after 15 minutes, and level 3 becomes urgent and can notify a caregiver.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="medication-reminders">Medication Popups</Label>
            <p className="text-xs text-muted-foreground">
              Show in-app and browser alerts when medicine is due
            </p>
          </div>
          <Switch
            id="medication-reminders"
            checked={profile?.consent_notifications ?? true}
            onCheckedChange={handleToggleNotifications}
            disabled={saving}
          />
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Sound Settings</p>
            <p className="text-xs text-muted-foreground">
              Choose how each escalation level sounds. Preview plays instantly.
            </p>
          </div>

          {[1, 2, 3].map((level) => {
            const field = level === 1 ? "first_reminder_sound" : level === 2 ? "second_reminder_sound" : "third_reminder_sound";
            const selected = settings[field] as ReminderSound;

            return (
              <div key={level} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label>Reminder {level} sound</Label>
                  <Select
                    value={selected}
                    onValueChange={(value: ReminderSound) => void updateSetting(field, value)}
                    disabled={loading || saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {soundOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {soundOptions.find((option) => option.value === selected)?.description}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void handlePreview(selected)} disabled={loading}>
                  <Icons.volume className="mr-2 h-4 w-4" />
                  Preview
                </Button>
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="vibrate-only">Vibrate only</Label>
              <p className="text-xs text-muted-foreground">
                Use vibration without sound on supported devices
              </p>
            </div>
            <Switch
              id="vibrate-only"
              checked={settings.vibrate_only}
              onCheckedChange={(checked) => void updateSetting("vibrate_only", checked)}
              disabled={loading || saving}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Escalation Settings</p>
            <p className="text-xs text-muted-foreground">
              Control when caregiver alerts should be triggered for missed medication.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="escalate-to-caregiver">Escalate to caregiver if missed</Label>
              <p className="text-xs text-muted-foreground">
                Level 3 reminders can create caregiver alerts
              </p>
            </div>
            <Switch
              id="escalate-to-caregiver"
              checked={settings.escalate_to_caregiver}
              onCheckedChange={(checked) => void updateSetting("escalate_to_caregiver", checked)}
              disabled={loading || saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Escalate after</Label>
            <Select
              value={String(settings.escalate_after_minutes)}
              onValueChange={(value) => void updateSetting("escalate_after_minutes", Number(value))}
              disabled={loading || saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Quiet Hours</p>
              <p className="text-xs text-muted-foreground">
                Level 1 and 2 reminders stay quiet during these hours. Urgent level 3 still alerts.
              </p>
            </div>
            <Switch checked={quietHoursEnabled} onCheckedChange={toggleQuietHours} disabled={loading || saving} />
          </div>

          {quietHoursEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={settings.quiet_hours_start || "22:00"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, quiet_hours_start: event.target.value }))}
                  onBlur={() => void saveSettings(settings)}
                  disabled={loading || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={settings.quiet_hours_end || "07:00"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, quiet_hours_end: event.target.value }))}
                  onBlur={() => void saveSettings(settings)}
                  disabled={loading || saving}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Per Medication Sound</p>
            <p className="text-xs text-muted-foreground">
              Give a medication its own sound profile if you want certain medicines to stand out more.
            </p>
          </div>

          {activeMedications.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Add medications first to customize their sounds here.
            </div>
          ) : (
            <div className="space-y-3">
              {activeMedications.map((medication) => (
                <div key={medication.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_200px] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">{medication.name}</p>
                    <p className="text-xs text-muted-foreground">{medication.dosage || medication.strength || "Standard dose"}</p>
                  </div>
                  <Select
                    value={settings.medication_sound_overrides[medication.id] || "default"}
                    onValueChange={(value: ReminderSound | "default") => void handleMedicationSoundChange(medication.id, value)}
                    disabled={loading || saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Use level default</SelectItem>
                      {soundOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
