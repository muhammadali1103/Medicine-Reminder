import { apiClient } from "@/lib/apiClient";

export type ReminderSound = "gentle" | "medium" | "urgent" | "success";
export type ReminderAction = "taken" | "snoozed" | "dismissed" | "escalated" | "ignored";

export interface NotificationSettingsData {
  id?: string;
  user_id?: string;
  first_reminder_sound: ReminderSound;
  second_reminder_sound: ReminderSound;
  third_reminder_sound: ReminderSound;
  snooze_options: number[];
  medication_sound_overrides: Record<string, ReminderSound>;
  escalate_to_caregiver: boolean;
  escalate_after_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  vibrate_only: boolean;
}

export interface PendingReminder {
  notification_log_id: string;
  dose_log_id: string;
  medication_id: string;
  medication_name: string;
  dosage: string;
  scheduled_time: string;
  overdue_minutes: number;
  reminder_number: 1 | 2 | 3;
  sound: ReminderSound;
  snooze_options: number[];
  escalate_to_caregiver: boolean;
  escalate_after_minutes: number;
  vibrate_only: boolean;
  quiet_hours_active: boolean;
}

const DEFAULT_SETTINGS: NotificationSettingsData = {
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

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  return audioContext;
}

function soundProfile(sound: ReminderSound) {
  switch (sound) {
    case "gentle":
      return { frequencies: [523.25, 659.25], duration: 0.18, gain: 0.03 };
    case "medium":
      return { frequencies: [659.25, 784], duration: 0.24, gain: 0.05 };
    case "urgent":
      return { frequencies: [880, 880, 659.25], duration: 0.28, gain: 0.08 };
    case "success":
      return { frequencies: [659.25, 783.99, 1046.5], duration: 0.15, gain: 0.04 };
    default:
      return { frequencies: [523.25], duration: 0.18, gain: 0.03 };
  }
}

export async function playReminderSound(sound: ReminderSound, vibrateOnly = false) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const pattern = sound === "urgent" ? [200, 100, 200, 100, 300] : sound === "medium" ? [120, 80, 120] : [80];
    navigator.vibrate(pattern);
  }

  if (vibrateOnly) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const { frequencies, duration, gain } = soundProfile(sound);
  const start = context.currentTime;

  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = sound === "gentle" ? "sine" : sound === "medium" ? "triangle" : "square";
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.0001, start + index * duration);
    gainNode.gain.exponentialRampToValueAtTime(gain, start + index * duration + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + index * duration + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(start + index * duration);
    oscillator.stop(start + index * duration + duration + 0.02);
  });
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }

  return Notification.permission;
}

export function showBrowserNotification(reminder: PendingReminder) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const levelTitle =
    reminder.reminder_number === 3
      ? "Urgent medication reminder"
      : reminder.reminder_number === 2
        ? "Medication still overdue"
        : "Medication reminder";

  const notification = new Notification(levelTitle, {
    body: `${reminder.medication_name} ${reminder.dosage} is due now.`,
    tag: reminder.dose_log_id,
    renotify: reminder.reminder_number > 1,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

export async function fetchNotificationSettings() {
  const response = await apiClient.request<{ data: NotificationSettingsData | null; error: { message?: string } | null }>(
    "/notifications/settings"
  );

  return {
    data: response.data ? { ...DEFAULT_SETTINGS, ...response.data } : { ...DEFAULT_SETTINGS },
    error: response.error,
  };
}

export async function updateNotificationSettings(settings: Partial<NotificationSettingsData>) {
  return apiClient.request<{ data: NotificationSettingsData | null; error: { message?: string } | null }>(
    "/notifications/settings",
    {
      method: "PUT",
      body: JSON.stringify(settings),
    }
  );
}

export async function fetchPendingReminders() {
  return apiClient.request<{ data: PendingReminder[] | null; error: { message?: string } | null }>(
    "/notifications/pending"
  );
}

export async function snoozeDoseReminder(doseLogId: string, snoozeMinutes: number) {
  return apiClient.request<{ data: { snoozed_until: string; medication_name: string; snooze_minutes: number } | null; error: { message?: string } | null }>(
    "/notifications/snooze",
    {
      method: "POST",
      body: JSON.stringify({
        dose_log_id: doseLogId,
        snooze_minutes: snoozeMinutes,
      }),
    }
  );
}

export async function escalateDoseReminder(doseLogId: string) {
  return apiClient.request<{ data: { caregiver_count: number; already_sent?: boolean } | null; error: { message?: string } | null }>(
    "/notifications/escalate",
    {
      method: "POST",
      body: JSON.stringify({ dose_log_id: doseLogId }),
    }
  );
}

export async function logNotificationAction(userId: string, reminder: PendingReminder, action: ReminderAction) {
  return apiClient.from("notification_logs").insert({
    user_id: userId,
    medication_id: reminder.medication_id,
    dose_log_id: reminder.dose_log_id,
    reminder_number: reminder.reminder_number,
    action_taken: action,
    action_at: new Date().toISOString(),
  });
}

export function createNotificationEngine({
  onReminder,
}: {
  onReminder: (reminder: PendingReminder) => void;
}) {
  let intervalId: number | null = null;
  let polling = false;
  const deliveredIds = new Set<string>();

  const tick = async () => {
    if (polling) {
      return;
    }

    polling = true;
    try {
      await requestNotificationPermission();
      const { data } = await fetchPendingReminders();
      for (const reminder of data || []) {
        if (deliveredIds.has(reminder.notification_log_id)) {
          continue;
        }
        deliveredIds.add(reminder.notification_log_id);
        onReminder(reminder);
      }
    } finally {
      polling = false;
    }
  };

  return {
    start() {
      void tick();
      intervalId = window.setInterval(() => {
        void tick();
      }, 60 * 1000);
    },
    stop() {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    },
    refresh() {
      return tick();
    },
  };
}
