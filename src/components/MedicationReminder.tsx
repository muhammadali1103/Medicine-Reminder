import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import type { PendingReminder } from "@/services/notificationEngine";

interface MedicationReminderProps {
  reminder: PendingReminder;
  snoozeSelection: string;
  onSnoozeSelectionChange: (value: string) => void;
  onTakeNow: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onMarkMissed: () => void;
}

function getReminderAccent(level: number) {
  if (level === 3) {
    return {
      wrapper: "fixed inset-0 z-[90] flex items-center justify-center bg-background/95 px-4",
      card: "w-full max-w-xl border-destructive/40 bg-gradient-to-br from-destructive/10 via-background to-destructive/5 shadow-2xl",
      badge: "destructive" as const,
      title: "text-destructive",
      pulse: "animate-pulse",
    };
  }

  if (level === 2) {
    return {
      wrapper: "fixed inset-x-0 top-4 z-[80] flex justify-center px-4",
      card: "w-full max-w-3xl border-warning/40 bg-warning/10 shadow-xl",
      badge: "warning" as const,
      title: "text-warning-foreground",
      pulse: "",
    };
  }

  return {
    wrapper: "fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-md",
    card: "border-primary/20 bg-background/95 shadow-lg backdrop-blur",
    badge: "status" as const,
    title: "text-foreground",
    pulse: "",
  };
}

export function MedicationReminder({
  reminder,
  snoozeSelection,
  onSnoozeSelectionChange,
  onTakeNow,
  onSnooze,
  onSkip,
  onMarkMissed,
}: MedicationReminderProps) {
  const accent = getReminderAccent(reminder.reminder_number);
  const scheduled = format(new Date(reminder.scheduled_time), "h:mm a");

  return (
    <div className={accent.wrapper}>
      <Card className={accent.card}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${reminder.reminder_number === 3 ? "bg-destructive/15 text-destructive" : reminder.reminder_number === 2 ? "bg-warning/20 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
              <Icons.bell className={`h-6 w-6 ${accent.pulse}`} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`text-lg font-semibold ${accent.title} ${accent.pulse}`}>
                  {reminder.reminder_number === 3
                    ? "Urgent medication alert"
                    : reminder.reminder_number === 2
                      ? `Still haven't taken ${reminder.medication_name}?`
                      : "Medication reminder"}
                </h3>
                <Badge variant={accent.badge}>
                  Level {reminder.reminder_number}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {reminder.reminder_number === 3
                  ? `${reminder.medication_name} is ${reminder.overdue_minutes} minutes overdue. Please act now.`
                  : `Take ${reminder.medication_name} ${reminder.dosage} scheduled for ${scheduled}.`}
              </p>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${reminder.reminder_number === 3 ? "border-destructive/20 bg-destructive/5" : reminder.reminder_number === 2 ? "border-warning/20 bg-warning/10" : "border-primary/15 bg-primary/5"}`}>
            <p className={`text-xl font-bold ${accent.pulse}`}>{reminder.medication_name}</p>
            <p className="text-sm text-muted-foreground">{reminder.dosage}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Scheduled: {scheduled}</span>
              {reminder.reminder_number > 1 && <span>Overdue: {reminder.overdue_minutes} min</span>}
              {reminder.reminder_number === 3 && reminder.escalate_to_caregiver && (
                <Badge variant="destructive">Caregiver will be notified</Badge>
              )}
            </div>
          </div>

          {reminder.reminder_number < 3 && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Snooze</p>
                <Select value={snoozeSelection} onValueChange={onSnoozeSelectionChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose snooze time" />
                  </SelectTrigger>
                  <SelectContent>
                    {reminder.snooze_options.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={onSnooze}>
                <Icons.timer className="mr-2 h-4 w-4" />
                Snooze
              </Button>
            </div>
          )}

          <div className={`flex ${reminder.reminder_number === 3 ? "flex-col sm:flex-row" : "flex-col sm:flex-row"} gap-2`}>
            <Button className="flex-1" variant="success" onClick={onTakeNow}>
              <Icons.checkCircle className="mr-2 h-4 w-4" />
              Take Now
            </Button>

            {reminder.reminder_number === 3 ? (
              <Button variant="outline" onClick={onMarkMissed}>
                Mark as Missed
              </Button>
            ) : (
              <Button variant="ghost" onClick={onSkip}>
                Skip
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
