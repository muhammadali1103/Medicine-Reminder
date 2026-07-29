import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  Clock,
  Eye,
  Heart,
  Pill,
  Stethoscope,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { AdherenceRing } from "@/components/AdherenceRing";
import { CaregiverHealthPanel } from "@/components/PatientHealthSection";
import { HealthReportExport } from "@/components/HealthReportExport";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { useUserRole } from "@/hooks/useUserRole";
import { apiClient } from "@/lib/apiClient";

interface PatientData {
  id: string;
  name: string;
  adherenceScore: number;
  medicationCount: number;
  lastActivity: Date | null;
  recentDoses: {
    taken: number;
    missed: number;
    pending: number;
  };
  medications: Array<{
    name: string;
    dosage: string;
    schedule: string;
  }>;
  status: "excellent" | "good" | "needs-attention" | "critical";
}

interface NotificationItem {
  id: string;
  type: "invitation" | "missed_dose" | "low_adherence" | "health_alert";
  message: string;
  patientName: string;
  patientId?: string;
  timestamp: Date;
  read: boolean;
}

interface CaregiverHealthSummaryResponse {
  vitals: {
    systolic?: number | null;
    blood_sugar?: number | null;
  } | null;
}

export default function CaregiverDashboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { links, loading: linksLoading, acceptLink, rejectLink } = useCaregiverLinks();
  const { role } = useUserRole();
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);

  const caregiverName = profile?.full_name?.split(" ")[0] || "Doctor";

  const pendingInvitations = useMemo(
    () => links.filter((link) => link.caregiver_id === user?.id && link.status === "pending"),
    [links, user]
  );

  const activePatientLinks = useMemo(
    () => links.filter((link) => link.caregiver_id === user?.id && link.status === "active"),
    [links, user]
  );

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!user || activePatientLinks.length === 0) {
        setPatients([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const patientData: PatientData[] = [];
      const generatedNotifications: NotificationItem[] = [];

      for (const link of activePatientLinks) {
        try {
          const { data: meds } = await apiClient
            .from("medications")
            .select("*")
            .eq("user_id", link.patient_id)
            .eq("is_active", true);

          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const { data: doseLogs } = await apiClient
            .from("dose_logs")
            .select("status, scheduled_time")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const taken = doseLogs?.filter((entry) => entry.status === "taken" || entry.status === "late").length || 0;
          const missed = doseLogs?.filter((entry) => entry.status === "missed").length || 0;
          const pending = doseLogs?.filter((entry) => entry.status === "pending").length || 0;
          const total = doseLogs?.length || 0;
          const adherenceScore = total > 0 ? Math.round((taken / total) * 100) : 100;

          let status: PatientData["status"] = "excellent";
          if (adherenceScore < 50) status = "critical";
          else if (adherenceScore < 70) status = "needs-attention";
          else if (adherenceScore < 90) status = "good";

          const { data: lastLog } = await apiClient
            .from("dose_logs")
            .select("scheduled_time")
            .eq("user_id", link.patient_id)
            .order("scheduled_time", { ascending: false })
            .limit(1)
            .single();

          const medications = (meds || []).map((med) => {
            const schedule = med.schedule as { times?: string[] } | null;
            return {
              name: med.name,
              dosage: med.dosage || "1 tablet",
              schedule: schedule?.times?.join(", ") || "As needed",
            };
          });

          const patient: PatientData = {
            id: link.patient_id,
            name: link.patient_profile?.full_name || "Patient",
            adherenceScore,
            medicationCount: meds?.length || 0,
            lastActivity: lastLog ? new Date(lastLog.scheduled_time) : null,
            recentDoses: { taken, missed, pending },
            medications,
            status,
          };

          patientData.push(patient);

          if (missed > 0) {
            generatedNotifications.push({
              id: `missed-${patient.id}`,
              type: "missed_dose",
              message: `${patient.name} has missed ${missed} dose(s) this week`,
              patientName: patient.name,
              patientId: patient.id,
              timestamp: new Date(),
              read: false,
            });
          }

          if (adherenceScore < 70) {
            generatedNotifications.push({
              id: `adherence-${patient.id}`,
              type: "low_adherence",
              message: `${patient.name}'s adherence is at ${adherenceScore}%`,
              patientName: patient.name,
              patientId: patient.id,
              timestamp: new Date(),
              read: false,
            });
          }

          const healthSummary = await apiClient.request<{ data: CaregiverHealthSummaryResponse | null; error: { message?: string } | null }>(
            `/health/summary?patientId=${encodeURIComponent(patient.id)}`
          );
          const vitals = healthSummary.data?.vitals;

          if (vitals?.systolic && vitals.systolic > 160) {
            generatedNotifications.push({
              id: `bp-${patient.id}`,
              type: "health_alert",
              message: `${patient.name} has high blood pressure reading today`,
              patientName: patient.name,
              patientId: patient.id,
              timestamp: new Date(),
              read: false,
            });
          } else if (vitals?.blood_sugar && (vitals.blood_sugar > 300 || vitals.blood_sugar < 70)) {
            generatedNotifications.push({
              id: `sugar-${patient.id}`,
              type: "health_alert",
              message: `${patient.name} has a critical blood sugar reading today`,
              patientName: patient.name,
              patientId: patient.id,
              timestamp: new Date(),
              read: false,
            });
          }
        } catch (error) {
          console.error("Error fetching caregiver dashboard data:", error);
        }
      }

      for (const invitation of pendingInvitations) {
        generatedNotifications.push({
          id: `invite-${invitation.id}`,
          type: "invitation",
          message: `${invitation.patient_profile?.full_name || "A patient"} wants you to monitor their health`,
          patientName: invitation.patient_profile?.full_name || "Patient",
          timestamp: new Date(invitation.created_at),
          read: false,
        });
      }

      setPatients(patientData);
      setNotifications(generatedNotifications);
      setLoading(false);
    };

    fetchPatientData();
  }, [activePatientLinks, pendingInvitations, user]);

  const unreadNotifications = notifications.filter((item) => !item.read).length;

  const getStatusColor = (status: PatientData["status"]) => {
    switch (status) {
      case "excellent":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "good":
        return "bg-primary/10 text-primary border-primary/20";
      case "needs-attention":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "critical":
        return "bg-red-500/10 text-red-600 border-red-500/20";
    }
  };

  const getStatusLabel = (status: PatientData["status"]) => {
    switch (status) {
      case "excellent":
        return "Excellent";
      case "good":
        return "Good";
      case "needs-attention":
        return "Needs Attention";
      case "critical":
        return "Critical";
    }
  };

  const getNotificationIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "invitation":
        return Heart;
      case "missed_dose":
        return AlertTriangle;
      case "low_adherence":
        return TrendingDown;
      case "health_alert":
        return AlertTriangle;
    }
  };

  const getNotificationColor = (type: NotificationItem["type"]) => {
    switch (type) {
      case "invitation":
        return "text-pink-500 bg-pink-500/10";
      case "missed_dose":
        return "text-red-500 bg-red-500/10";
      case "low_adherence":
        return "text-amber-500 bg-amber-500/10";
      case "health_alert":
        return "text-red-500 bg-red-500/10";
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-safe">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white/80 text-sm">{getGreeting()},</p>
                <h1 className="text-xl font-bold text-white">Dr. {caregiverName}</h1>
              </div>
            </div>
            <div className="relative">
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/20">
                <Bell className="w-6 h-6" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadNotifications}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 pb-6">
          <div className="grid grid-cols-3 gap-3">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center">
              <Users className="w-6 h-6 text-white mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{patients.length}</p>
              <p className="text-xs text-white/70">Active Patients</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center">
              <Activity className="w-6 h-6 text-white mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">
                {patients.length > 0 ? Math.round(patients.reduce((sum, patient) => sum + patient.adherenceScore, 0) / patients.length) : 0}%
              </p>
              <p className="text-xs text-white/70">Avg Adherence</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-white mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">
                {patients.filter((patient) => patient.status === "critical" || patient.status === "needs-attention").length}
              </p>
              <p className="text-xs text-white/70">Need Attention</p>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="px-4 -mt-2 space-y-6">
        {pendingInvitations.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-primary">
                  <Heart className="w-5 h-5" />
                  Pending Invitations ({pendingInvitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvitations.map((invitation) => (
                  <motion.div key={invitation.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-3 bg-card rounded-xl border border-primary/15">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {(invitation.patient_profile?.full_name || "P").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{invitation.patient_profile?.full_name || "Patient"}</p>
                        <p className="text-xs text-muted-foreground">
                          Invited {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        disabled={processingInvite === invitation.id}
                        onClick={async () => {
                          setProcessingInvite(invitation.id);
                          await rejectLink(invitation.id);
                          setProcessingInvite(null);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-gradient-primary text-primary-foreground hover:brightness-110"
                        disabled={processingInvite === invitation.id}
                        onClick={async () => {
                          setProcessingInvite(invitation.id);
                          await acceptLink(invitation.id);
                          setProcessingInvite(null);
                        }}
                      >
                        {processingInvite === invitation.id ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Accept</>}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {notifications.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Recent Alerts
            </h2>
            <ScrollArea className="h-[180px]">
              <div className="space-y-2 pr-4">
                {notifications.filter((item) => item.type !== "invitation").slice(0, 5).map((notification) => {
                  const Icon = getNotificationIcon(notification.type);
                  return (
                    <Card key={notification.id} className="bg-card/80">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getNotificationColor(notification.type)}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{notification.message}</p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(notification.timestamp, { addSuffix: true })}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            My Patients
          </h2>

          {loading || linksLoading ? (
            <Card>
              <CardContent className="p-6 text-center">
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-12 h-12 bg-muted rounded-full mb-3" />
                  <div className="h-4 w-32 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ) : patients.length === 0 ? (
            <Card className="bg-gradient-card">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-accent mx-auto mb-4 flex items-center justify-center">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">No Patients Yet</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  When patients invite you as their healthcare provider, they'll appear here for monitoring.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {patients.map((patient, index) => (
                <motion.div key={patient.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardContent className="p-0">
                      <div className="p-4 border-b border-border/50">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
                            <span className="text-xl font-bold text-white">{patient.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-foreground text-lg truncate">{patient.name}</h3>
                              <Badge className={getStatusColor(patient.status)}>{getStatusLabel(patient.status)}</Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Pill className="w-4 h-4" />
                                {patient.medicationCount} medications
                              </span>
                              {patient.lastActivity && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {formatDistanceToNow(patient.lastActivity, { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1 p-3 bg-muted/30">
                        <div className="text-center p-2">
                          <div className="flex justify-center">
                            <AdherenceRing percentage={patient.adherenceScore} size={45} strokeWidth={4} showLabel={false} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Score</p>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-emerald-500/10">
                          <p className="text-xl font-bold text-emerald-600">{patient.recentDoses.taken}</p>
                          <p className="text-xs text-muted-foreground">Taken</p>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-red-500/10">
                          <p className="text-xl font-bold text-red-600">{patient.recentDoses.missed}</p>
                          <p className="text-xs text-muted-foreground">Missed</p>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-slate-500/10">
                          <p className="text-xl font-bold text-slate-600">{patient.recentDoses.pending}</p>
                          <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                      </div>

                      {patient.medications.length > 0 && (
                        <div className="px-4 py-3 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground mb-2">MEDICATIONS</p>
                          <div className="flex flex-wrap gap-2">
                            {patient.medications.slice(0, 3).map((medication, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {medication.name}
                              </Badge>
                            ))}
                            {patient.medications.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{patient.medications.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="border-t border-border p-3 bg-muted/20 flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedPatient(patient)}>
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                        <HealthReportExport
                          variant="button"
                          patientId={patient.id}
                          patientName={patient.name}
                          buttonLabel="Download Report"
                          className="flex-1 bg-gradient-primary text-primary-foreground hover:brightness-110"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      <AnimatePresence>
        {selectedPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setSelectedPatient(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="flex w-full max-w-lg flex-col rounded-t-3xl bg-background max-h-[85vh] overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-4 border-b border-border">
                <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-foreground">{selectedPatient.name}</h2>
                  <Badge className={getStatusColor(selectedPatient.status)}>{getStatusLabel(selectedPatient.status)}</Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="p-4 min-h-0">
                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2 rounded-2xl">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="health">Health</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <Card>
                        <CardContent className="p-4">
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Weekly Adherence
                          </h3>
                          <div className="flex items-center gap-4">
                            <AdherenceRing percentage={selectedPatient.adherenceScore} size={80} strokeWidth={8} />
                            <div className="flex-1 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Taken</span>
                                <span className="font-medium text-emerald-600">{selectedPatient.recentDoses.taken}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Missed</span>
                                <span className="font-medium text-red-600">{selectedPatient.recentDoses.missed}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Pending</span>
                                <span className="font-medium text-slate-600">{selectedPatient.recentDoses.pending}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Pill className="w-4 h-4 text-primary" />
                            Medications ({selectedPatient.medications.length})
                          </h3>
                          <div className="space-y-3">
                            {selectedPatient.medications.map((medication, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                                <div>
                                  <p className="font-medium text-foreground">{medication.name}</p>
                                  <p className="text-xs text-muted-foreground">{medication.dosage}</p>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {medication.schedule}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="health">
                      <CaregiverHealthPanel patientName={selectedPatient.name} patientId={selectedPatient.id} canManageGoals={role === "doctor"} />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>

              <div className="border-t border-border p-4">
                <HealthReportExport
                  variant="button"
                  patientId={selectedPatient.id}
                  patientName={selectedPatient.name}
                  buttonLabel="Download Full Health Report"
                  className="w-full bg-gradient-primary text-primary-foreground hover:brightness-110"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CaregiverBottomNav />
    </div>
  );
}
