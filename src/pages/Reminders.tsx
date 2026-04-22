import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { Icons } from "@/components/icons";
import { MedicationCalendar, ScheduledDose } from "@/components/MedicationCalendar";
import { SnoozeDialog } from "@/components/SnoozeDialog";
import { NotificationSettings } from "@/components/NotificationSettings";
import { useMedications } from "@/hooks/useMedications";
import { useDoseLogging } from "@/hooks/useDoseLogging";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { cacheKey, formatLastSynced, readCachedData, writeCachedData } from "@/services/offlineCache";
import { toast } from "sonner";
import { format, isToday, isBefore, parseISO, addMinutes } from "date-fns";

interface TodayReminder {
  id: string;
  medicationId: string;
  medicationName: string;
  time: string;
  dosage: string;
  status: "pending" | "taken" | "missed" | "snoozed";
  snoozedUntil?: Date;
}

export default function Reminders() {
  const { medications, loading } = useMedications();
  const { user } = useAuth();
  const { logDose } = useDoseLogging();
  const { snoozeReminder, permission } = useNotifications();
  const [activeTab, setActiveTab] = useState("today");
  const [todayReminders, setTodayReminders] = useState<TodayReminder[]>([]);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<TodayReminder | null>(null);
  const [scheduleSyncedAt, setScheduleSyncedAt] = useState<string | null>(null);

  // Generate today's reminders from medications
  useEffect(() => {
    if (user) {
      const cached = readCachedData<TodayReminder[]>(cacheKey(user.id, "today-schedule"));
      if (cached) {
        setTodayReminders(
          cached.data.map((reminder) => ({
            ...reminder,
            snoozedUntil: reminder.snoozedUntil ? new Date(reminder.snoozedUntil) : undefined,
          }))
        );
        setScheduleSyncedAt(cached.savedAt);
      }
    }

    const activeMeds = medications.filter(m => m.is_active);
    const today = new Date();
    const reminders: TodayReminder[] = [];

    activeMeds.forEach(med => {
      const schedule = med.schedule as { times?: string[]; type?: string } | null;
      const times = schedule?.times || ["08:00"];
      
      // Check if medication is active today
      const startDate = med.start_date ? parseISO(med.start_date) : new Date();
      const endDate = med.end_date ? parseISO(med.end_date) : null;
      
      if (isBefore(today, startDate)) return;
      if (endDate && isBefore(endDate, today)) return;

      times.forEach((time, index) => {
        const [hours, minutes] = time.split(":").map(Number);
        const reminderTime = new Date();
        reminderTime.setHours(hours, minutes, 0, 0);

        const now = new Date();
        let status: TodayReminder["status"] = "pending";
        
        if (reminderTime < now) {
          // Past time - check if it's within 30 min grace period
          const gracePeriod = addMinutes(reminderTime, 30);
          if (now > gracePeriod) {
            status = "missed";
          }
        }

        reminders.push({
          id: `${med.id}-${time}-${index}`,
          medicationId: med.id,
          medicationName: med.name,
          time,
          dosage: med.dosage || "1 dose",
          status,
        });
      });
    });

    // Sort by time
    reminders.sort((a, b) => a.time.localeCompare(b.time));
    setTodayReminders(reminders);
    if (user) {
      writeCachedData(cacheKey(user.id, "today-schedule"), reminders);
      setScheduleSyncedAt(new Date().toISOString());
    }
  }, [medications, user]);

  const getScheduledTime = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);
    return scheduledTime;
  };

  const handleMarkTaken = async (reminderId: string) => {
    const reminder = todayReminders.find((item) => item.id === reminderId);
    if (reminder) {
      await logDose(reminder.medicationId, getScheduledTime(reminder.time), "taken");
    }

    setTodayReminders(prev =>
      prev.map(r =>
        r.id === reminderId ? { ...r, status: "taken" as const } : r
      )
    );
    toast.success("Medication marked as taken!");
  };

  const handleOpenSnooze = (reminder: TodayReminder) => {
    setSelectedReminder(reminder);
    setSnoozeDialogOpen(true);
  };

  const handleSnooze = (minutes: number) => {
    if (!selectedReminder) return;

    const snoozedUntil = addMinutes(new Date(), minutes);
    
    setTodayReminders(prev =>
      prev.map(r =>
        r.id === selectedReminder.id
          ? { ...r, status: "snoozed" as const, snoozedUntil }
          : r
      )
    );

    // Use service worker for background snooze (works even when app is closed)
    if (permission.granted) {
      snoozeReminder(selectedReminder.medicationId, selectedReminder.medicationName, minutes);
    } else {
      // Fallback for when notifications aren't enabled
      toast.info(`Reminder snoozed for ${minutes} minutes`, {
        description: `We'll remind you at ${format(snoozedUntil, "h:mm a")}`,
      });

      // Set timeout to update status after snooze period (only works while tab is open)
      setTimeout(() => {
        setTodayReminders(prev =>
          prev.map(r =>
            r.id === selectedReminder.id && r.status === "snoozed"
              ? { ...r, status: "pending" as const, snoozedUntil: undefined }
              : r
          )
        );
        toast.info(`Time to take ${selectedReminder.medicationName}!`, {
          duration: 10000,
        });
      }, minutes * 60 * 1000);
    }
  };

  const handleSkip = async () => {
    if (!selectedReminder) return;

    await logDose(selectedReminder.medicationId, getScheduledTime(selectedReminder.time), "skipped");
    
    setTodayReminders(prev =>
      prev.map(r =>
        r.id === selectedReminder.id ? { ...r, status: "missed" as const } : r
      )
    );
    toast.warning("Dose skipped");
  };

  const handleTakeFromDialog = () => {
    if (!selectedReminder) return;
    handleMarkTaken(selectedReminder.id);
  };

  const stats = useMemo(() => {
    const taken = todayReminders.filter(r => r.status === "taken").length;
    const total = todayReminders.length;
    const pending = todayReminders.filter(r => r.status === "pending" || r.status === "snoozed").length;
    const missed = todayReminders.filter(r => r.status === "missed").length;
    return { taken, total, pending, missed };
  }, [todayReminders]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date();
  const dates = weekDays.map((_, index) => {
    const date = new Date();
    date.setDate(today.getDate() - today.getDay() + 1 + index);
    return date.getDate();
  });
  const currentDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Reminders</h1>
              <p className="text-xs text-muted-foreground">{formatLastSynced(scheduleSyncedAt)}</p>
            </div>
            <Badge variant="status">{stats.taken}/{stats.total} taken</Badge>
          </div>

          {/* Quick Week View */}
          <div className="flex justify-between gap-1">
            {weekDays.map((day, index) => (
              <button
                key={day}
                className={`flex-1 flex flex-col items-center py-2 rounded-xl transition-all ${
                  currentDayIndex === index
                    ? "bg-gradient-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                <span className="text-[10px] font-medium opacity-80">{day}</span>
                <span className="text-lg font-bold">{dates[index]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today" className="flex items-center gap-2">
              <Icons.bell className="w-4 h-4" />
              Today
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Icons.calendar className="w-4 h-4" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Icons.settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="text-center">
                <CardContent className="p-3">
                  <p className="text-2xl font-bold text-success">{stats.taken}</p>
                  <p className="text-xs text-muted-foreground">Taken</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-3">
                  <p className="text-2xl font-bold text-warning">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-3">
                  <p className="text-2xl font-bold text-destructive">{stats.missed}</p>
                  <p className="text-xs text-muted-foreground">Missed</p>
                </CardContent>
              </Card>
            </div>

            {/* Today's Reminders */}
            {todayReminders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Icons.checkCircle className="w-16 h-16 mx-auto mb-4 text-success" />
                  <p className="text-lg font-medium text-foreground">No medications scheduled</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add medications to see your reminders here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {todayReminders.map((reminder, index) => (
                  <motion.div
                    key={reminder.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={reminder.status === "pending" ? "border-primary/30" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center ${
                            reminder.status === "taken" ? "bg-success/10" :
                            reminder.status === "missed" ? "bg-destructive/10" :
                            reminder.status === "snoozed" ? "bg-warning/10" :
                            "bg-accent"
                          }`}>
                            <Icons.clock className={`w-5 h-5 ${
                              reminder.status === "taken" ? "text-success" :
                              reminder.status === "missed" ? "text-destructive" :
                              reminder.status === "snoozed" ? "text-warning" :
                              "text-primary"
                            }`} />
                            <span className="text-xs font-bold mt-0.5">{reminder.time}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {reminder.medicationName}
                            </p>
                            <p className="text-sm text-muted-foreground">{reminder.dosage}</p>
                            {reminder.snoozedUntil && (
                              <p className="text-xs text-warning mt-1">
                                <Icons.timer className="w-3 h-3 inline mr-1" />
                                Snoozed until {format(reminder.snoozedUntil, "h:mm a")}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {reminder.status === "taken" ? (
                              <Badge variant="success">
                                <Icons.checkCircle className="w-3 h-3 mr-1" />
                                Taken
                              </Badge>
                            ) : reminder.status === "missed" ? (
                              <Badge variant="destructive">Missed</Badge>
                            ) : reminder.status === "snoozed" ? (
                              <Badge variant="warning">
                                <Icons.timer className="w-3 h-3 mr-1" />
                                Snoozed
                              </Badge>
                            ) : (
                              <div className="flex gap-1">
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  onClick={() => handleOpenSnooze(reminder)}
                                  title="Snooze"
                                >
                                  <Icons.timer className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => handleMarkTaken(reminder.id)}
                                >
                                  <Icons.check className="w-4 h-4 mr-1" />
                                  Take
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar">
            <MedicationCalendar 
              medications={medications}
              onDaySelect={(date, doses) => {
                console.log("Selected day:", date, doses);
              }}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <NotificationSettings />
          </TabsContent>
        </Tabs>
      </main>

      {/* Snooze Dialog */}
      <SnoozeDialog
        open={snoozeDialogOpen}
        onOpenChange={setSnoozeDialogOpen}
        medicationName={selectedReminder?.medicationName || ""}
        onSnooze={handleSnooze}
        onTakeNow={handleTakeFromDialog}
        onSkip={handleSkip}
      />

      <BottomNav />
    </div>
  );
}
