import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdherenceRing } from "@/components/AdherenceRing";
import { MedicationCard, Medication } from "@/components/MedicationCard";
import { UpcomingReminders } from "@/components/UpcomingReminders";
import { SafetyStatusCard, SafetyLevel } from "@/components/SafetyStatusCard";
import { BottomNav } from "@/components/BottomNav";
import { Icons } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthSummaryWidget, PatientDietTab, PatientVitalsTab } from "@/components/PatientHealthSection";
import { GoalAchievementModal, HealthGoalsOverviewCard, PatientGoalsTab } from "@/components/HealthGoalsSection";
import { HealthGoal } from "@/hooks/useHealth";
import { HealthReportExport } from "@/components/HealthReportExport";
import { PillIcon } from "@/components/PillIcon";
import { ScheduleSkeleton } from "@/components/ScheduleSkeleton";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useDrugInteractions } from "@/hooks/useDrugInteractions";
import { useAdherenceStats } from "@/hooks/useDoseLogging";
import { useDoseLogging } from "@/hooks/useDoseLogging";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import CaregiverDashboard from "./CaregiverDashboard";
import DoctorDashboard from "./DoctorDashboard";
import { cacheKey, readCachedData, writeCachedData } from "@/services/offlineCache";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading, isCaregiver, isDoctor } = useUserRole();
  const { stats: adherenceStats, loading: adherenceLoading, refresh: refreshAdherence } = useAdherenceStats();
  const { logDose } = useDoseLogging();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<Array<{
    id: string;
    medicationName: string;
    time: string;
    dosage: string;
    status: "taken" | "pending" | "upcoming" | "missed";
    medicationId?: string;
    rawTime?: string;
  }>>([]);
  const [lastMissedDate, setLastMissedDate] = useState<Date | null>(null);
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [celebrationGoal, setCelebrationGoal] = useState<HealthGoal | null>(null);
  const [doctorNotes, setDoctorNotes] = useState<Array<{ id: string; note: string; doctor_name?: string | null; is_read: boolean; created_at: string }>>([]);
  const [pendingDoctorInvites, setPendingDoctorInvites] = useState<Array<{ id: string; invite_token: string; doctor_name?: string | null; specialization?: string | null; created_at: string }>>([]);
  const {
    totalCount: interactionCount,
  } = useDrugInteractions(
    medications.map((med) => ({
      id: med.id,
      name: med.name,
      genericName: med.genericName,
      strength: med.strength,
      dosage: med.dosage,
      isActive: med.status === "active",
    }))
  );
  
  const userName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (authLoading) return;
    
    if (user) {
      fetchMedications();
      fetchLastMissedDose();
      fetchDoctorWidgets();
    } else {
      setLoading(false);
      setMedications([]);
      setReminders([]);
    }
  }, [user, authLoading]);

  const fetchDoctorWidgets = async () => {
    if (!user) return;
    try {
      const [notesResponse, invitesResponse] = await Promise.all([
        apiClient.request<{ data: Array<{ id: string; note: string; doctor_name?: string | null; is_read: boolean; created_at: string }> | null; error: any }>("/patient/doctor-notes"),
        apiClient.request<{ data: Array<{ id: string; invite_token: string; doctor_name?: string | null; specialization?: string | null; created_at: string }> | null; error: any }>("/doctor/invites/pending"),
      ]);
      setDoctorNotes(notesResponse.data || []);
      setPendingDoctorInvites(invitesResponse.data || []);
    } catch (error) {
      console.error("Error fetching doctor widgets:", error);
    }
  };

  const acceptDoctorInvite = async (token: string) => {
    const response = await apiClient.request<{ data: { success: boolean } | null; error: { message?: string } | null }>(`/doctor/accept/${token}`);
    if (response.error) {
      return toast.error(response.error.message || "Unable to accept doctor invite.");
    }
    toast.success("Doctor invite accepted.");
    await fetchDoctorWidgets();
  };

  const markDoctorNotesRead = async () => {
    await apiClient.request("/patient/doctor-notes/read", { method: "POST" });
    await fetchDoctorWidgets();
  };

  const fetchLastMissedDose = async () => {
    if (!user) return;
    try {
      const { data } = await apiClient
        .from("dose_logs")
        .select("scheduled_time")
        .eq("user_id", user.id)
        .eq("status", "missed")
        .order("scheduled_time", { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        setLastMissedDate(new Date(data[0].scheduled_time));
      }
    } catch (err) {
      console.error("Error fetching last missed dose:", err);
    }
  };

  const fetchMedications = async () => {
    if (!user) return;

    try {
      const key = cacheKey(user.id, "home-medications");
      const cached = readCachedData<Medication[]>(key);
      if (cached) {
        setMedications(cached.data);
        setLoading(false);
      }

      const { data, error } = await apiClient
        .from("medications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching medications:", error);
        return;
      }

      // Transform database records to Medication type
      const transformedMeds: Medication[] = (data || []).map((med) => {
        const schedule = med.schedule as { type?: string; times?: string[]; frequency?: string } | null;
        const frequencyMap: Record<string, string> = {
          once: "Once daily",
          twice: "Twice daily",
          three: "Three times daily",
          weekly: "Weekly",
          prn: "As needed",
        };

        return {
          id: med.id,
          name: med.name,
          genericName: med.generic_name || undefined,
          strength: med.strength || undefined,
          dosage: med.dosage || "1 tablet",
          frequency: frequencyMap[schedule?.frequency || "once"] || "Once daily",
          nextDose: getNextDoseTime(schedule?.times?.[0]),
          shape: (med.shape as "round" | "oval" | "capsule" | "tablet") || "round",
          color1: med.color || "#4CAF50",
          color2: lightenColor(med.color || "#4CAF50"),
          status: med.is_active ? "active" : "paused",
        };
      });

      setMedications(transformedMeds);
      writeCachedData(key, transformedMeds);

      // Generate reminders from medications
      const generatedReminders = transformedMeds.flatMap((med) => {
        const dbMed = data?.find((d) => d.id === med.id);
        const schedule = dbMed?.schedule as { times?: string[] } | null;
        const times = schedule?.times || ["08:00"];
        
        return times.map((time, idx) => ({
          id: `${med.id}-${idx}`,
          medicationName: `${med.name} ${med.strength || ""}`.trim(),
          time: formatTime(time),
          dosage: med.dosage || "1 tablet",
          status: getTimeStatus(time),
          medicationId: med.id,
          rawTime: time,
        }));
      });

      setReminders(generatedReminders);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getNextDoseTime = (time?: string): string | undefined => {
    if (!time) return undefined;
    const now = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    const doseTime = new Date();
    doseTime.setHours(hours, minutes, 0, 0);

    if (doseTime > now) {
      return `Today, ${formatTime(time)}`;
    } else {
      return `Tomorrow, ${formatTime(time)}`;
    }
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const getTimeStatus = (time: string): "taken" | "pending" | "upcoming" | "missed" => {
    const now = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    const doseTime = new Date();
    doseTime.setHours(hours, minutes, 0, 0);

    const diffMs = doseTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < -2) return "missed";
    if (diffHours < 0) return "pending";
    if (diffHours < 1) return "pending";
    return "upcoming";
  };

  const lightenColor = (hex: string): string => {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = 40;
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
  };
  
  const handleTaken = async (id: string) => {
    const reminder = reminders.find(r => r.id === id);
    if (reminder && reminder.medicationId) {
      // Parse the raw time to create scheduled time
      const rawTime = (reminder as any).rawTime || "08:00";
      const [hours, minutes] = rawTime.split(":").map(Number);
      const scheduledTime = new Date();
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      await logDose(reminder.medicationId, scheduledTime, "taken");
      await refreshAdherence();
    }
    
    setReminders(prev =>
      prev.map(r => (r.id === id ? { ...r, status: "taken" as const } : r))
    );
  };

  // Use real adherence stats from database
  const takenCount = adherenceStats.takenDoses + adherenceStats.lateDoses;
  const pendingCount = reminders.filter(r => r.status === "pending" || r.status === "upcoming").length;
  const adherenceScore = adherenceStats.weeklyScore;
  const overdueCount = reminders.filter(r => r.status === "missed").length;

  // Calculate safety level
  const safetyLevel: SafetyLevel = useMemo(() => {
    if (interactionCount > 0) return "danger";
    if (overdueCount > 0) return "warning";
    const hasTimingRisk = reminders.some((r) => {
      if (r.status !== "pending") return false;
      const [hours, minutes] = (r.rawTime || "08:00").split(":").map(Number);
      const doseTime = new Date();
      doseTime.setHours(hours, minutes, 0, 0);
      return differenceInMinutes(doseTime, new Date()) < 30 && differenceInMinutes(doseTime, new Date()) > -30;
    });
    if (hasTimingRisk) return "warning";
    return "safe";
  }, [interactionCount, overdueCount, reminders]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // If user is a caregiver, show the caregiver dashboard instead
  // This must be AFTER all hooks to satisfy React's rules of hooks
  if (!roleLoading && isCaregiver) {
    return <CaregiverDashboard />;
  }
  if (!roleLoading && isDoctor) {
    return <DoctorDashboard />;
  }

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <motion.p
                className="text-sm text-muted-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {getGreeting()},
              </motion.p>
              <motion.h1
                className="text-xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {userName} 👋
              </motion.h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" className="relative">
                <Icons.bell className="w-5 h-5" />
                {interactionCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1.5"
                  >
                    {interactionCount}
                  </Badge>
                )}
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => navigate("/profile")}>
                <Icons.settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6 space-y-6">
        {loading ? (
          <ScheduleSkeleton />
        ) : medications.length === 0 ? (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <PillIcon size="lg" className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Welcome to Smart Medicine Reminder</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Add your first medication to start tracking doses and get reminders
            </p>
            <Button size="lg" onClick={() => navigate("/add-medication")}>
              <Icons.plus className="w-5 h-5 mr-2" />
              Add Your First Medication
            </Button>
          </motion.div>
        ) : (
          <>
            <Tabs value={dashboardTab} onValueChange={setDashboardTab} className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
              >
                <TabsList className="grid w-full grid-cols-4 rounded-2xl">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="vitals">Vitals</TabsTrigger>
                  <TabsTrigger value="diet">Diet</TabsTrigger>
                  <TabsTrigger value="goals">Goals</TabsTrigger>
                </TabsList>
              </motion.div>

              <TabsContent value="overview" className="space-y-6">
                {/* Safety Status Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <SafetyStatusCard
                    level={safetyLevel}
                    interactions={interactionCount}
                    overdueCount={overdueCount}
                    timingRisk={reminders.some(r => r.status === "pending")}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                >
                  <HealthSummaryWidget onOpenVitals={() => setDashboardTab("vitals")} onOpenDiet={() => setDashboardTab("diet")} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.185 }}
                >
                  <HealthGoalsOverviewCard onOpenGoals={() => setDashboardTab("goals")} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.19 }}
                >
                  <div className="flex justify-end">
                    <HealthReportExport variant="button" />
                  </div>
                </motion.div>

                {pendingDoctorInvites.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.195 }}
                  >
                    <Card className="border-primary/15">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Doctor Invites</p>
                            <h3 className="text-lg font-bold text-foreground">Pending invitations</h3>
                          </div>
                          <Badge variant="status">{pendingDoctorInvites.length}</Badge>
                        </div>
                        {pendingDoctorInvites.map((invite) => (
                          <div key={invite.id} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                            <p className="font-semibold text-foreground">{invite.doctor_name || "Doctor Invite"}</p>
                            <p className="text-sm text-muted-foreground">{invite.specialization || "Medical specialist"}</p>
                            <Button className="mt-3" size="sm" onClick={() => acceptDoctorInvite(invite.invite_token)}>
                              Accept Invite
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {doctorNotes.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.198 }}
                  >
                    <Card className="border-blue-500/15 bg-gradient-to-br from-blue-500/5 via-background to-background">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Notes from Doctor</p>
                            <h3 className="text-lg font-bold text-foreground">Latest clinical note</h3>
                          </div>
                          {doctorNotes.some((note) => !note.is_read) && <Badge variant="status">Unread</Badge>}
                        </div>
                        <div className="rounded-2xl border border-blue-500/15 bg-background/80 p-4">
                          <p className="text-sm font-medium text-foreground">{doctorNotes[0]?.doctor_name || "Doctor"}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{doctorNotes[0]?.note}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(doctorNotes[0].created_at), { addSuffix: true })}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={markDoctorNotesRead}>
                            Mark as Read
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Enhanced Adherence Overview */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card variant="gradient" className="overflow-hidden">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-6">
                        <div className="rounded-full bg-primary-foreground/10 p-2 ring-1 ring-primary-foreground/20">
                          <AdherenceRing percentage={adherenceScore} size={100} strokeWidth={10} variant="hero" />
                        </div>
                        <div className="flex-1">
                          <h2 className="text-lg font-bold text-primary-foreground mb-1">
                            {adherenceScore >= 80 ? "Great Progress!" : adherenceScore >= 50 ? "Keep Going!" : "Let's Get Started!"}
                          </h2>
                          <p className="text-primary-foreground/80 text-sm mb-3">
                            {adherenceStats.totalDoses > 0 
                              ? `${takenCount} of ${adherenceStats.totalDoses} doses this week`
                              : `You have ${medications.length} active medication${medications.length !== 1 ? "s" : ""}`}
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-1.5">
                              <Icons.checkCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">{takenCount} taken</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Icons.clock className="w-4 h-4" />
                              <span className="text-sm font-medium">{pendingCount} pending</span>
                            </div>
                            {adherenceStats.missedDoses > 0 && (
                              <div className="flex items-center gap-1.5">
                                <Icons.xCircle className="w-4 h-4" />
                                <span className="text-sm font-medium">{adherenceStats.missedDoses} missed</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 pt-3 border-t border-primary-foreground/20 flex flex-wrap gap-4 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Icons.flame className="w-3.5 h-3.5" />
                              <span>{adherenceStats.streak || 0} day streak</span>
                            </div>
                            {lastMissedDate && (
                              <div className="flex items-center gap-1.5 text-primary-foreground/70">
                                <Icons.alertTriangle className="w-3.5 h-3.5" />
                                <span>Last missed: {formatDistanceToNow(lastMissedDate, { addSuffix: true })}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {reminders.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <UpcomingReminders reminders={reminders} onTaken={handleTaken} />
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <h2 className="text-lg font-bold text-foreground mb-3">Quick Actions</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <Card variant="interactive" onClick={() => navigate("/add-medication")}>
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-3">
                          <Icons.plus className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <span className="font-semibold text-foreground text-sm">Add Medication</span>
                      </CardContent>
                    </Card>
                    <Card variant="interactive" onClick={() => navigate("/medications")}>
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="relative mb-3">
                          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                            <PillIcon size="sm" />
                          </div>
                          {interactionCount > 0 && (
                            <Badge variant="destructive" className="absolute -right-2 -top-2 px-2 py-0.5">
                              {interactionCount}
                            </Badge>
                          )}
                        </div>
                        <span className="font-semibold text-foreground text-sm">My Medications</span>
                      </CardContent>
                    </Card>
                    <Card variant="interactive" onClick={() => navigate("/reminders")}>
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3">
                          <Icons.calendar className="w-6 h-6 text-primary" />
                        </div>
                        <span className="font-semibold text-foreground text-sm">Schedule</span>
                      </CardContent>
                    </Card>
                    <Card variant="interactive" onClick={() => navigate("/reports")}>
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3">
                          <Icons.trending className="w-6 h-6 text-primary" />
                        </div>
                        <span className="font-semibold text-foreground text-sm">Reports</span>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>

                {medications.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-foreground">Active Medications</h2>
                      <Button variant="link" size="sm" onClick={() => navigate("/medications")}>
                        View all
                        <Icons.chevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {medications.slice(0, 2).map((med) => (
                        <MedicationCard key={med.id} medication={med} variant="compact" />
                      ))}
                    </div>
                  </motion.div>
                )}
              </TabsContent>

              <TabsContent value="vitals">
                <PatientVitalsTab onGoalsAchieved={(goals) => setCelebrationGoal(goals[0] || null)} />
              </TabsContent>

              <TabsContent value="diet">
                <PatientDietTab />
              </TabsContent>

              <TabsContent value="goals">
                <PatientGoalsTab />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <GoalAchievementModal
        goal={celebrationGoal}
        open={Boolean(celebrationGoal)}
        onOpenChange={(open) => !open && setCelebrationGoal(null)}
        onSetNewGoal={() => {
          setCelebrationGoal(null);
          setDashboardTab("goals");
        }}
      />

      <BottomNav />
    </div>
  );
}
