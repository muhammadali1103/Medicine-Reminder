import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { AdherenceRing } from "@/components/AdherenceRing";
import { useAuth } from "@/hooks/useAuth";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { apiClient } from "@/lib/apiClient";
import { formatDistanceToNow, format } from "date-fns";
import {
  Users,
  Pill,
  Clock,
  Download,
  Eye,
  Search,
  Heart,
  Check,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";

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

export default function CaregiverPatients() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { links, loading: linksLoading, acceptLink, rejectLink } = useCaregiverLinks();
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);

  const caregiverName = profile?.full_name?.split(" ")[0] || "Doctor";

  const pendingInvitations = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "pending"),
    [links, user]
  );

  const activePatientLinks = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "active"),
    [links, user]
  );

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

          const taken = doseLogs?.filter((l) => l.status === "taken" || l.status === "late").length || 0;
          const missed = doseLogs?.filter((l) => l.status === "missed").length || 0;
          const pending = doseLogs?.filter((l) => l.status === "pending").length || 0;
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
    };

    fetchPatientData();
  }, [user, activePatientLinks.length]);

  const getStatusColor = (status: PatientData["status"]) => {
    switch (status) {
      case "excellent": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "good": return "bg-primary/10 text-primary border-primary/20";
      case "needs-attention": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "critical": return "bg-red-500/10 text-red-600 border-red-500/20";
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

  const generatePatientReport = async (patient: PatientData) => {
    setDownloadingReport(patient.id);
    
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 30);
      
      const { data: doseLogs } = await apiClient
        .from("dose_logs")
        .select("*, medications(name)")
        .eq("user_id", patient.id)
        .gte("scheduled_time", weekAgo.toISOString())
        .order("scheduled_time", { ascending: false });

      const doc = new jsPDF();
      
      doc.setFillColor(20, 184, 166);
      doc.rect(0, 0, 210, 40, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text("Patient Health Report", 20, 25);
      
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, 20, 35);
      
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(16);
      doc.text("Patient Information", 20, 55);
      
      doc.setFontSize(11);
      doc.text(`Name: ${patient.name}`, 20, 65);
      doc.text(`Active Medications: ${patient.medicationCount}`, 20, 72);
      doc.text(`Weekly Adherence: ${patient.adherenceScore}%`, 20, 79);
      doc.text(`Status: ${getStatusLabel(patient.status)}`, 20, 86);
      
      doc.setFontSize(16);
      doc.text("7-Day Adherence Summary", 20, 102);
      
      doc.setFontSize(11);
      doc.text(`Doses Taken: ${patient.recentDoses.taken}`, 20, 112);
      doc.text(`Doses Missed: ${patient.recentDoses.missed}`, 20, 119);
      doc.text(`Doses Pending: ${patient.recentDoses.pending}`, 20, 126);
      
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
      
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("This report is for informational purposes only.", 20, 280);
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

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-safe px-4 py-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6" />
          My Patients
        </h1>
        <p className="text-white/80 text-sm mt-1">
          {patients.length} patient{patients.length !== 1 ? "s" : ""} under your care
        </p>
      </header>

      <main className="px-4 py-4 space-y-4">
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
                    exit={{ opacity: 0, x: 20 }}
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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading || linksLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Loading patients...</p>
            </CardContent>
          </Card>
        ) : filteredPatients.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">
                {searchQuery ? "No patients found" : "No Patients Yet"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "When patients invite you, they'll appear here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-4 pr-2">
              {filteredPatients.map((patient, index) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center">
                            <span className="text-lg font-bold text-white">
                              {patient.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-foreground">{patient.name}</h3>
                              <Badge className={getStatusColor(patient.status)}>
                                {getStatusLabel(patient.status)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Pill className="w-3 h-3" />
                                {patient.medicationCount} meds
                              </span>
                              {patient.lastActivity && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDistanceToNow(patient.lastActivity, { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mt-4">
                          <div className="text-center p-2">
                            <AdherenceRing percentage={patient.adherenceScore} size={40} strokeWidth={4} showLabel={false} />
                          </div>
                          <div className="text-center p-2 rounded-lg bg-emerald-500/10">
                            <p className="text-lg font-bold text-emerald-600">{patient.recentDoses.taken}</p>
                            <p className="text-xs text-muted-foreground">Taken</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-red-500/10">
                            <p className="text-lg font-bold text-red-600">{patient.recentDoses.missed}</p>
                            <p className="text-xs text-muted-foreground">Missed</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-slate-500/10">
                            <p className="text-lg font-bold text-slate-600">{patient.recentDoses.pending}</p>
                            <p className="text-xs text-muted-foreground">Pending</p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border p-3 bg-muted/20 flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1">
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-gradient-primary text-primary-foreground hover:brightness-110"
                          onClick={() => generatePatientReport(patient)}
                          disabled={downloadingReport === patient.id}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Report
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        )}
      </main>

      <CaregiverBottomNav />
    </div>
  );
}
