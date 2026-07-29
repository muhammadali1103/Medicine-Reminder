import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useDoseLogging } from "@/hooks/useDoseLogging";
import { MedicationReminder } from "@/components/MedicationReminder";
import {
  createNotificationEngine,
  escalateDoseReminder,
  logNotificationAction,
  PendingReminder,
  playReminderSound,
  ReminderSound,
  showBrowserNotification,
  snoozeDoseReminder,
} from "@/services/notificationEngine";
import { toast } from "sonner";

interface SnoozeNotice {
  doseLogId: string;
  medicationName: string;
  snoozeMinutes: number;
  snoozedUntil: string;
}

export function ReminderPopupManager() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { updateDoseStatus } = useDoseLogging();
  const [queue, setQueue] = useState<PendingReminder[]>([]);
  const [snoozeSelection, setSnoozeSelection] = useState("10");
  const [snoozeNotice, setSnoozeNotice] = useState<SnoozeNotice | null>(null);
  const [timeLeftLabel, setTimeLeftLabel] = useState("");
  const engineRef = useRef<ReturnType<typeof createNotificationEngine> | null>(null);
  const escalatedDoseIdsRef = useRef<Set<string>>(new Set());

  const enabled = useMemo(() => profile?.consent_notifications !== false, [profile?.consent_notifications]);
  const activeReminder = queue[0] || null;

  const removeReminder = (notificationLogId: string) => {
    setQueue((prev) => prev.filter((item) => item.notification_log_id !== notificationLogId));
  };

  const pushReminder = async (reminder: PendingReminder) => {
    setQueue((prev) => {
      if (prev.some((item) => item.notification_log_id === reminder.notification_log_id)) {
        return prev;
      }

      return [...prev, reminder].sort((a, b) => {
        if (b.reminder_number !== a.reminder_number) {
          return b.reminder_number - a.reminder_number;
        }
        return new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime();
      });
    });

    await playReminderSound(reminder.sound as ReminderSound, reminder.vibrate_only);
    showBrowserNotification(reminder);

    if (reminder.reminder_number === 1) {
      toast("Medicine time", {
        description: `Take ${reminder.medication_name} ${reminder.dosage} now.`,
        duration: 6000,
      });
    } else if (reminder.reminder_number === 2) {
      toast.warning(`You still have not taken ${reminder.medication_name}.`, {
        duration: 10000,
      });
    } else {
      toast.error(`${reminder.medication_name} is now urgent.`, {
        duration: 12000,
      });
    }
  };

  useEffect(() => {
    if (!user || !enabled) {
      engineRef.current?.stop();
      engineRef.current = null;
      setQueue([]);
      return;
    }

    const engine = createNotificationEngine({
      onReminder: (reminder) => {
        void pushReminder(reminder);
      },
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [enabled, user]);

  useEffect(() => {
    if (!activeReminder) {
      return;
    }

    const defaultSnooze = activeReminder.snooze_options?.[0] || 10;
    setSnoozeSelection(String(defaultSnooze));
  }, [activeReminder?.notification_log_id]);

  useEffect(() => {
    if (!activeReminder || activeReminder.reminder_number !== 1) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      removeReminder(activeReminder.notification_log_id);
      if (user) {
        void logNotificationAction(user.id, activeReminder, "ignored");
      }
    }, 60 * 1000);

    return () => window.clearTimeout(timeoutId);
  }, [activeReminder, user]);

  useEffect(() => {
    if (!activeReminder || activeReminder.reminder_number !== 3 || escalatedDoseIdsRef.current.has(activeReminder.dose_log_id)) {
      return;
    }

    escalatedDoseIdsRef.current.add(activeReminder.dose_log_id);
    void escalateDoseReminder(activeReminder.dose_log_id).then((response) => {
      if (response.error) {
        toast.error(response.error.message || "Failed to alert caregiver.");
        return;
      }

      if (response.data?.caregiver_count) {
        toast.warning(`Caregiver notified for ${activeReminder.medication_name}.`);
      }
    });
  }, [activeReminder]);

  useEffect(() => {
    if (!snoozeNotice) {
      setTimeLeftLabel("");
      return;
    }

    const updateCountdown = () => {
      const diff = new Date(snoozeNotice.snoozedUntil).getTime() - Date.now();
      if (diff <= 0) {
        setSnoozeNotice(null);
        setTimeLeftLabel("");
        void engineRef.current?.refresh();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeftLabel(`${minutes}:${String(seconds).padStart(2, "0")}`);
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [snoozeNotice]);

  const handleTakeNow = async () => {
    if (!user || !activeReminder) {
      return;
    }

    const success = await updateDoseStatus(activeReminder.dose_log_id, "taken");
    if (!success) {
      toast.error("Failed to mark dose as taken.");
      return;
    }

    await playReminderSound("success", false);
    await logNotificationAction(user.id, activeReminder, "taken");
    removeReminder(activeReminder.notification_log_id);
    toast.success(`${activeReminder.medication_name} marked as taken.`);
  };

  const handleSnooze = async () => {
    if (!activeReminder) {
      return;
    }

    const minutes = Number(snoozeSelection);
    const response = await snoozeDoseReminder(activeReminder.dose_log_id, minutes);

    if (response.error || !response.data) {
      toast.error(response.error?.message || "Unable to snooze reminder.");
      return;
    }

    setSnoozeNotice({
      doseLogId: activeReminder.dose_log_id,
      medicationName: activeReminder.medication_name,
      snoozeMinutes: response.data.snooze_minutes,
      snoozedUntil: response.data.snoozed_until,
    });
    removeReminder(activeReminder.notification_log_id);
    toast.info(`${activeReminder.medication_name} snoozed for ${response.data.snooze_minutes} minutes.`);
  };

  const handleSkip = async () => {
    if (!user || !activeReminder) {
      return;
    }

    const success = await updateDoseStatus(activeReminder.dose_log_id, "skipped");
    if (!success) {
      toast.error("Failed to skip this dose.");
      return;
    }

    await logNotificationAction(user.id, activeReminder, "dismissed");
    removeReminder(activeReminder.notification_log_id);
    toast.message(`${activeReminder.medication_name} skipped.`);
  };

  const handleMarkMissed = async () => {
    if (!user || !activeReminder) {
      return;
    }

    const success = await updateDoseStatus(activeReminder.dose_log_id, "missed");
    if (!success) {
      toast.error("Failed to mark this dose as missed.");
      return;
    }

    await logNotificationAction(user.id, activeReminder, "ignored");
    removeReminder(activeReminder.notification_log_id);
    toast.error(`${activeReminder.medication_name} marked as missed.`);
  };

  return (
    <>
      {snoozeNotice && (
        <div className="fixed left-4 top-4 z-[75] max-w-sm rounded-2xl border border-primary/20 bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <span className="text-lg">💊</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {snoozeNotice.medicationName} snoozed
              </p>
              <p className="text-xs text-muted-foreground">
                Reminder returns in {snoozeNotice.snoozeMinutes} minutes.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="status">Countdown {timeLeftLabel}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void engineRef.current?.refresh()}
                >
                  Check now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeReminder && (
        <MedicationReminder
          reminder={activeReminder}
          snoozeSelection={snoozeSelection}
          onSnoozeSelectionChange={setSnoozeSelection}
          onTakeNow={handleTakeNow}
          onSnooze={handleSnooze}
          onSkip={handleSkip}
          onMarkMissed={handleMarkMissed}
        />
      )}
    </>
  );
}
