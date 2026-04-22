import { useEffect, useMemo, useRef, useState } from "react";
import { format, isBefore, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useMedications } from "@/hooks/useMedications";
import { useProfile } from "@/hooks/useProfile";
import { useDoseLogging } from "@/hooks/useDoseLogging";
import { useVoiceReminder } from "@/hooks/useVoiceReminder";
import { Icons } from "@/components/icons";
import { toast } from "sonner";

interface ActiveReminder {
  key: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  scheduledTime: Date;
}

const STORAGE_PREFIX = "builtin-reminder";

function getReminderKey(userId: string, medicationId: string, dateKey: string, time: string) {
  return `${STORAGE_PREFIX}:${userId}:${medicationId}:${dateKey}:${time}`;
}

function readReminderState(key: string): { handled?: boolean; snoozedUntil?: string } {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeReminderState(key: string, value: { handled?: boolean; snoozedUntil?: string | null }) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function ReminderPopupManager() {
  const { user } = useAuth();
  const { medications } = useMedications();
  const { profile } = useProfile();
  const { logDose } = useDoseLogging();
  const { enabled: voiceEnabled, speak } = useVoiceReminder();
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);
  const announcedReminderKeyRef = useRef<string | null>(null);

  const enabled = useMemo(() => profile?.consent_notifications !== false, [profile?.consent_notifications]);

  useEffect(() => {
    if (!user || !enabled || activeReminder) {
      return;
    }

    const checkReminders = () => {
      const now = new Date();
      const todayKey = format(now, "yyyy-MM-dd");

      for (const med of medications) {
        if (!med.is_active) {
          continue;
        }

        const startDate = med.start_date ? parseISO(med.start_date) : null;
        const endDate = med.end_date ? parseISO(med.end_date) : null;

        if (startDate && isBefore(now, startDate)) {
          continue;
        }
        if (endDate && isBefore(endDate, now)) {
          continue;
        }

        const schedule = med.schedule as { times?: string[] } | null;
        const times = schedule?.times || ["08:00"];

        for (const time of times) {
          const reminderKey = getReminderKey(user.id, med.id, todayKey, time);
          const stored = readReminderState(reminderKey);
          if (stored.handled) {
            continue;
          }

          const [hours, minutes] = time.split(":").map(Number);
          const scheduledTime = new Date(now);
          scheduledTime.setHours(hours, minutes, 0, 0);

          const triggerTime = stored.snoozedUntil ? new Date(stored.snoozedUntil) : scheduledTime;
          const diff = now.getTime() - triggerTime.getTime();

          if (diff >= 0 && diff < 60 * 1000) {
            setActiveReminder({
              key: reminderKey,
              medicationId: med.id,
              medicationName: med.name,
              dosage: med.dosage || "1 dose",
              scheduledTime,
            });
            return;
          }
        }
      }
    };

    checkReminders();
    const intervalId = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(intervalId);
  }, [activeReminder, enabled, medications, user]);

  useEffect(() => {
    if (!activeReminder || announcedReminderKeyRef.current === activeReminder.key) {
      return;
    }

    announcedReminderKeyRef.current = activeReminder.key;

    toast("Medicine time", {
      description: `Take ${activeReminder.medicationName} ${activeReminder.dosage} now.`,
      duration: 12000,
    });

    if (!voiceEnabled) {
      return;
    }

    void speak({
      medicationName: activeReminder.medicationName,
      dosage: activeReminder.dosage,
    }).then((success) => {
      if (!success) {
        toast.error("Voice reminder could not be played.");
      }
    });
  }, [activeReminder, speak, voiceEnabled]);

  const closeAndMarkHandled = () => {
    if (!activeReminder) {
      return;
    }

    writeReminderState(activeReminder.key, { handled: true, snoozedUntil: null });
    setActiveReminder(null);
  };

  const handleTakeNow = async () => {
    if (!activeReminder) {
      return;
    }

    await logDose(activeReminder.medicationId, activeReminder.scheduledTime, "taken");
    writeReminderState(activeReminder.key, { handled: true, snoozedUntil: null });
    setActiveReminder(null);
    toast.success(`${activeReminder.medicationName} marked as taken.`);
  };

  const handleSnooze = () => {
    if (!activeReminder) {
      return;
    }

    const snoozedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    writeReminderState(activeReminder.key, { handled: false, snoozedUntil });
    setActiveReminder(null);
    toast.info(`Reminder snoozed until ${format(new Date(snoozedUntil), "h:mm a")}.`);
  };

  return (
    <Dialog open={!!activeReminder} onOpenChange={(open) => !open && closeAndMarkHandled()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.bell className="h-5 w-5 text-primary animate-pulse" />
            Medication Reminder
          </DialogTitle>
          <DialogDescription>
            Your medicine time has arrived. Please take {activeReminder?.medicationName} {activeReminder?.dosage} now.
          </DialogDescription>
        </DialogHeader>

        {activeReminder && (
          <div className="space-y-4">
            <div className="rounded-xl bg-primary/5 border border-primary/15 p-4">
              <p className="font-semibold text-foreground">{activeReminder.medicationName}</p>
              <p className="text-sm text-muted-foreground">{activeReminder.dosage}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled for {format(activeReminder.scheduledTime, "h:mm a")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" variant="success" onClick={handleTakeNow}>
                <Icons.checkCircle className="h-4 w-4 mr-2" />
                Take Now
              </Button>
              <Button className="flex-1" variant="outline" onClick={handleSnooze}>
                <Icons.timer className="h-4 w-4 mr-2" />
                Snooze 10 Min
              </Button>
            </div>

            <Button className="w-full" variant="ghost" onClick={closeAndMarkHandled}>
              Dismiss
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
