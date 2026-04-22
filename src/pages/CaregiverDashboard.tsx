import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { AdherenceRing } from "@/components/AdherenceRing";
import { CaregiverHealthPanel } from "@/components/PatientHealthSection";
import { HealthReportExport } from "@/components/HealthReportExport";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { apiClient } from "@/lib/apiClient";
import { format, formatDistanceToNow } from "date-fns";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import {
  Bell,
  Heart,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  ArrowRight,
  User,
  Pill,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  Stethoscope,
  ClipboardList,
  Eye,
  Check,
  X,
} from "lucide-react";

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

interface Notification {
  id: string;
  type: "invitation" | "missed_dose" | "low_adherence" | "alert" | "health_alert";
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

interface ReportDoseLog {
  status: string;
  scheduled_time: string;
  medications?: {
    name?: string;
  } | null;
}

export default function CaregiverDashboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { links, loading: linksLoading, acceptLink, rejectLink } = useCaregiverLinks();
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);

  const caregiverName = profile?.full_name?.split(" ")[0] || "Doctor";

  // Filter pending invitations and active patients
  const pendingInvitations = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "pending"),
    [links, user]
  );

  const activePatientLinks = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "active"),
    [links, user]
  );

  // Fetch patient data
  useEffect(() => {
    const fetchPatientData = async () => {
      if (!user || activePatientLinks.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const patientData: PatientData[] = [];

      for (const link of activePatientLinks) {
        try {
          // Get medications
          const { data: meds } = await apiClient
            .from("medications")
            .select("*")
            .eq("user_id", link.patient_id)
            .eq("is_active", true);

          // Get recent dose logs (last 7 days)
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const { data: doseLogs } = await apiClient
            .from("dose_logs")
            .select("status, scheduled_time")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const taken = doseLogs?.filter((l) => l.status === "taken" || l.status === "late").length || 0;
          const missed = doseLogs?.filter((l) => l.status === "missed").length || 0;
          const pending = doseLogs?.filter((l) => l.status === "pending").length || 0;
          const total = doseLogs?.length || 0;
          const adherenceScore = total > 0 ? Math.round((taken / total) * 100) : 100;

          // Determine status
          let status: PatientData["status"] = "excellent";
          if (adherenceScore < 50) status = "critical";
          else if (adherenceScore < 70) status = "needs-attention";
          else if (adherenceScore < 90) status = "good";

          // Get last activity
          const { data: lastLog } = await apiClient
            .from("dose_logs")
            .select("scheduled_time")
            .eq("user_id", link.patient_id)
            .order("scheduled_time", { ascending: false })
            .limit(1)
            .single();

          // Transform medications for display
          const medications = (meds || []).map((med) => {
            const schedule = med.schedule as { times?: string[]; frequency?: string } | null;
            return {
              name: med.name,
              dosage: med.dosage || "1 tablet",
              schedule: schedule?.times?.join(", ") || "As needed",
            };
          });

          patientData.push({
            id: link.patient_id,
            name: link.patient_profile?.full_name || "Patient",
            adherenceScore,
            medicationCount: meds?.length || 0,
            lastActivity: lastLog ? new Date(lastLog.scheduled_time) : null,
            recentDoses: { taken, missed, pending },
            medications,
            status,
          });
        } catch (err) {
          console.error("Error fetching patient data:", err);
        }
      }

      setPatients(patientData);
      setLoading(false);

      // Generate notifications from missed doses and invitations
      const newNotifications: Notification[] = [];
      
      for (const patient of patientData) {
        if (patient.recentDoses.missed > 0) {
          newNotifications.push({
            id: `missed-${patient.id}`,
            type: "missed_dose",
            message: `${patient.name} has missed ${patient.recentDoses.missed} dose(s) this week`,
            patientName: patient.name,
            patientId: patient.id,
            timestamp: new Date(),
            read: false,
          });
        }
        if (patient.adherenceScore < 70) {
          newNotifications.push({
            id: `adherence-${patient.id}`,
            type: "low_adherence",
            message: `${patient.name}'s adherence is at ${patient.adherenceScore}%`,
            patientName: patient.name,
            patientId: patient.id,
            timestamp: new Date(),
            read: false,
          });
        }

        try {
          const healthSummary = await apiClient.request<{ data: CaregiverHealthSummaryResponse | null; error: { message?: string } | null }>(
            `/health/summary?patientId=${encodeURIComponent(patient.id)}`
          );
          const vitals = healthSummary.data?.vitals;

          if (vitals?.systolic && vitals.systolic > 160) {
            newNotifications.push({
              id: `bp-${patient.id}`,
              type: "health_alert",
              message: `${patient.name} has high blood pressure reading today`,
              patientName: patient.name,
              patientId: patient.id,
              timestamp: new Date(),
              read: false,
            });
          } else if (vitals?.blood_sugar && (vitals.blood_sugar > 300 || vitals.blood_sugar < 70)) {
            newNotifications.push({
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
          console.error("Error fetching health alerts:", error);
        }
      }

      // Add invitation notifications
      for (const inv of pendingInvitations) {
        newNotifications.push({
          id: `invite-${inv.id}`,
          type: "invitation",
          message: `${inv.patient_profile?.full_name || "A patient"} wants you to monitor their health`,
          patientName: inv.patient_profile?.full_name || "Patient",
          timestamp: new Date(inv.created_at),
          read: false,
        });
      }

      setNotifications(newNotifications);
    };

    fetchPatientData();
  }, [user, activePatientLinks, pendingInvitations]);

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
      case "excellent": return "Excellent";
      case "good": return "Good";
      case "needs-attention": return "Needs Attention";
      case "critical": return "Critical";
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "invitation": return Heart;
      case "missed_dose": return AlertTriangle;
      case "low_adherence": return TrendingDown;
      case "health_alert": return AlertTriangle;
      default: return Bell;
    }
  };

  const getNotificationColor = (type: Notification["type"]) => {
    switch (type) {
      case "invitation": return "text-pink-500 bg-pink-500/10";
      case "missed_dose": return "text-red-500 bg-red-500/10";
      case "low_adherence": return "text-amber-500 bg-amber-500/10";
      case "health_alert": return "text-red-500 bg-red-500/10";
      default: return "text-primary bg-primary/10";
    }
  };

  // Generate PDF report for a patient
  const generatePatientReport = async (patient: PatientData) => {
    setDownloadingReport(patient.id);
    
    try {
      // Fetch detailed dose logs
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 30);
      
      const { data: doseLogs } = await apiClient
        .from("dose_logs")
        .select("*, medications(name)")
        .eq("user_id", patient.id)
        .gte("scheduled_time", weekAgo.toISOString())
        .order("scheduled_time", { ascending: false });

      const doc = new jsPDF();
      
      // Header
      doc.setFillColor(20, 184, 166); // Teal
      doc.rect(0, 0, 210, 40, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text("Patient Health Report", 20, 25);
      
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, 20, 35);
      
      // Patient Info
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(16);
      doc.text("Patient Information", 20, 55);
      
      doc.setFontSize(11);
      doc.text(`Name: ${patient.name}`, 20, 65);
      doc.text(`Active Medications: ${patient.medicationCount}`, 20, 72);
      doc.text(`Weekly Adherence: ${patient.adherenceScore}%`, 20, 79);
      doc.text(`Status: ${getStatusLabel(patient.status)}`, 20, 86);
      
      // Adherence Summary
      doc.setFontSize(16);
      doc.text("7-Day Adherence Summary", 20, 102);
      
      doc.setFontSize(11);
      doc.text(`Doses Taken: ${patient.recentDoses.taken}`, 20, 112);
      doc.text(`Doses Missed: ${patient.recentDoses.missed}`, 20, 119);
      doc.text(`Doses Pending: ${patient.recentDoses.pending}`, 20, 126);
      
      // Medications List
      doc.setFontSize(16);
      doc.text("Active Medications", 20, 142);
      
      let yPos = 152;
      patient.medications.forEach((med, idx) => {
        doc.setFontSize(11);
        doc.text(`${idx + 1}. ${med.name}`, 20, yPos);
        doc.setFontSize(9);
        doc.text(`   Dosage: ${med.dosage} | Schedule: ${med.schedule}`, 20, yPos + 6);
        yPos += 14;
      });
      
      // Recent Dose History
      if (doseLogs && doseLogs.length > 0) {
        yPos += 10;
        doc.setFontSize(16);
        doc.text("Recent Dose History (Last 30 Days)", 20, yPos);
        yPos += 10;
        
        doc.setFontSize(9);
        const displayLogs = (doseLogs || []).slice(0, 15) as ReportDoseLog[];
        displayLogs.forEach((log) => {
          const status = log.status === "taken" ? "✓ Taken" : log.status === "missed" ? "✗ Missed" : "○ Pending";
          const medName = log.medications?.name || "Unknown";
          doc.text(
            `${format(new Date(log.scheduled_time), "MMM d, h:mm a")} - ${medName} - ${status}`,
            20,
            yPos
          );
          yPos += 6;
        });
      }
      
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("This report is for informational purposes only. Consult a healthcare provider for medical advice.", 20, 280);
      doc.text(`Prepared by: Dr. ${caregiverName} | Smart Medicine Reminder App`, 20, 286);
      
      doc.save(`${patient.name.replace(/\s+/g, "_")}_Health_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Report downloaded successfully!");
    } catch (err) {
      console.error("Error generating report:", err);
      toast.error("Failed to generate report");
    } finally {
      setDownloadingReport(null);
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      {/* Professional Header */}
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
              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/20"
              >
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

        {/* Stats Cards */}
        <div className="px-4 pb-6">
          <div className="grid grid-cols-3 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center"
            >
              <Users className="w-6 h-6 text-white mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{patients.length}</p>
              <p className="text-xs text-white/70">Active Patients</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center"
            >
              <Activity className="w-6 h-6 text-white mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">
                {patients.length > 0
                  ? Math.round(patients.reduce((acc, p) => acc + p.adherenceScore, 0) / patients.length)
                  : 0}%
              </p>
              <p className="text-xs text-white/70">Avg Adherence</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 text-center"
            >
              <AlertTriangle className="w-6 h-6 text-white mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">
                {patients.filter((p) => p.status === "critical" || p.status === "needs-attention").length}
              </p>
              <p className="text-xs text-white/70">Need Attention</p>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="px-4 -mt-2 space-y-6">
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-primary">
                  <Heart className="w-5 h-5" />
                  Pending Invitations ({pendingInvitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvitations.map((invitation) => (
                  <motion.div
                    key={invitation.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 bg-card rounded-xl border border-primary/15"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {(invitation.patient_profile?.full_name || "P").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {invitation.patient_profile?.full_name || "Patient"}
                        </p>
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
                        {processingInvite === invitation.id ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Accept
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Notifications Section */}
        {notifications.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Recent Alerts
            </h2>
            <ScrollArea className="h-[180px]">
              <div className="space-y-2 pr-4">
                {notifications.filter(n => n.type !== "invitation").slice(0, 5).map((notification) => {
                  const Icon = getNotificationIcon(notification.type);
                  return (
                    <Card key={notification.id} className="bg-card/80">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getNotificationColor(notification.type)}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </motion.div>
        )}

        {/* My Patients Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
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
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardContent className="p-0">
                      {/* Patient Header */}
                      <div className="p-4 border-b border-border/50">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
                            <span className="text-xl font-bold text-white">
                              {patient.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-foreground text-lg truncate">
                                {patient.name}
                              </h3>
                              <Badge className={getStatusColor(patient.status)}>
                                {getStatusLabel(patient.status)}
                              </Badge>
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

                      {/* Stats Grid */}
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

                      {/* Medications Preview */}
                      {patient.medications.length > 0 && (
                        <div className="px-4 py-3 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground mb-2">MEDICATIONS</p>
                          <div className="flex flex-wrap gap-2">
                            {patient.medications.slice(0, 3).map((med, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {med.name}
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

                      {/* Actions */}
                      <div className="border-t border-border p-3 bg-muted/20 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setSelectedPatient(patient)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-gradient-primary text-primary-foreground hover:brightness-110"
                          onClick={() => generatePatientReport(patient)}
                          disabled={downloadingReport === patient.id}
                        >
                          {downloadingReport === patient.id ? (
                            <span className="animate-spin mr-1">⏳</span>
                          ) : (
                            <Download className="w-4 h-4 mr-1" />
                          )}
                          Download Report
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      {/* Patient Details Modal */}
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
              className="w-full max-w-lg bg-background rounded-t-3xl max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-border">
                <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground">{selectedPatient.name}</h2>
                  <Badge className={getStatusColor(selectedPatient.status)}>
                    {getStatusLabel(selectedPatient.status)}
                  </Badge>
                </div>
              </div>
              
              <ScrollArea className="p-4 max-h-[60vh]">
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
                          {selectedPatient.medications.map((med, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                              <div>
                                <p className="font-medium text-foreground">{med.name}</p>
                                <p className="text-xs text-muted-foreground">{med.dosage}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {med.schedule}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="health">
                    <CaregiverHealthPanel patientName={selectedPatient.name} patientId={selectedPatient.id} />
                  </TabsContent>
                </Tabs>
              </ScrollArea>

              <div className="border-t border-border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <HealthReportExport
                    variant="button"
                    patientId={selectedPatient.id}
                    patientName={selectedPatient.name}
                    buttonLabel="Download Report"
                    className="w-full bg-gradient-primary text-primary-foreground hover:brightness-110"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      generatePatientReport(selectedPatient);
                      setSelectedPatient(null);
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Quick Summary PDF
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CaregiverBottomNav />
    </div>
  );
}
