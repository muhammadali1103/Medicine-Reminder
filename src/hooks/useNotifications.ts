import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

export interface NotificationPermission {
  granted: boolean;
  supported: boolean;
  loading: boolean;
  denied: boolean;
  swRegistration: ServiceWorkerRegistration | null;
}

interface ScheduledReminder {
  id: string;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export function useNotifications() {
  const scheduledReminders = useRef<Map<string, ScheduledReminder>>(new Map());

  const permission = useMemo<NotificationPermission>(
    () => ({
      granted: true,
      supported: true,
      loading: false,
      denied: false,
      swRegistration: null,
    }),
    []
  );

  const requestPermission = useCallback(async () => true, []);

  const sendNotification = useCallback((title: string, body: string) => {
    toast.info(title, {
      description: body,
      duration: 10000,
    });
    return null;
  }, []);

  const scheduleReminder = useCallback(
    (medicationId: string, medicationName: string, scheduledTime: Date) => {
      const now = new Date();
      const delay = scheduledTime.getTime() - now.getTime();

      if (delay <= 0) {
        return null;
      }

      const reminderId = `${medicationId}-${scheduledTime.getTime()}`;
      const existing = scheduledReminders.current.get(reminderId);
      if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId);
      }

      const timeoutId = setTimeout(() => {
        sendNotification("Medication reminder", `It's time to take ${medicationName}.`);
        scheduledReminders.current.delete(reminderId);
      }, delay);

      scheduledReminders.current.set(reminderId, {
        id: reminderId,
        timeoutId,
      });

      return reminderId;
    },
    [sendNotification]
  );

  const cancelReminder = useCallback((reminderId: string) => {
    const reminder = scheduledReminders.current.get(reminderId);
    if (reminder?.timeoutId) {
      clearTimeout(reminder.timeoutId);
    }
    scheduledReminders.current.delete(reminderId);
  }, []);

  const snoozeReminder = useCallback(
    (medicationId: string, medicationName: string, snoozeMinutes: number = 10) => {
      const snoozeTime = new Date(Date.now() + snoozeMinutes * 60 * 1000);
      scheduleReminder(medicationId, medicationName, snoozeTime);
      toast.info(`Reminder snoozed for ${snoozeMinutes} minutes`);
      return true;
    },
    [scheduleReminder]
  );

  const scheduleTodaysReminders = useCallback(async () => {}, []);

  return {
    permission,
    requestPermission,
    sendNotification,
    scheduleReminder,
    cancelReminder,
    snoozeReminder,
    scheduleTodaysReminders,
  };
}
