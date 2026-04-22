import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { apiClient } from "@/lib/apiClient";
import { format, formatDistanceToNow } from "date-fns";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Users,
  TrendingUp,
  Activity,
  Calendar,
} from "lucide-react";

interface PatientReport {
  id: string;
  name: string;
  adherenceScore: number;
  medicationCount: number;
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
}

export default function CaregiverReports() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { links, loading: linksLoading } = useCaregiverLinks();
  const [patients, setPatients] = useState<PatientReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const caregiverName = profile?.full_name?.split(" ")[0] || "Doctor";

  const activePatientLinks = links.filter(
    (l) => l.caregiver_id === user?.id && l.status === "active"
  );

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!user || activePatientLinks.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const patientData: PatientReport[] = [];

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
            .select("status")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const taken = doseLogs?.filter((l) => l.status === "taken" || l.status === "late").length || 0;
          const missed = doseLogs?.filter((l) => l.status === "missed").length || 0;
          const pending = doseLogs?.filter((l) => l.status === "pending").length || 0;
          const total = doseLogs?.length || 0;
          const adherenceScore = total > 0 ? Math.round((taken / total) * 100) : 100;

          const medications = (meds || []).map((med) => {
            const schedule = med.schedule as { times?: string[] } | null;
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
            recentDoses: { taken, missed, pending },
            medications,
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

  const generatePatientReport = async (patient: PatientReport) => {
    setDownloadingReport(patient.id);
    
    try {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      
      const { data: doseLogs } = await apiClient
        .from("dose_logs")
        .select("*, medications(name)")
        .eq("user_id", patient.id)
        .gte("scheduled_time", monthAgo.toISOString())
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
      
      doc.setFontSize(16);
      doc.text("7-Day Adherence Summary", 20, 95);
      
      doc.setFontSize(11);
      doc.text(`Doses Taken: ${patient.recentDoses.taken}`, 20, 105);
      doc.text(`Doses Missed: ${patient.recentDoses.missed}`, 20, 112);
      doc.text(`Doses Pending: ${patient.recentDoses.pending}`, 20, 119);
      
      doc.setFontSize(16);
      doc.text("Active Medications", 20, 135);
      
      let yPos = 145;
      patient.medications.forEach((med, idx) => {
        doc.setFontSize(11);
        doc.text(`${idx + 1}. ${med.name}`, 20, yPos);
        doc.setFontSize(9);
        doc.text(`   Dosage: ${med.dosage} | Schedule: ${med.schedule}`, 20, yPos + 6);
        yPos += 14;
      });
      
      if (doseLogs && doseLogs.length > 0) {
        yPos += 10;
        doc.setFontSize(16);
        doc.text("Recent Dose History (Last 30 Days)", 20, yPos);
        yPos += 10;
        
        doc.setFontSize(9);
        const displayLogs = doseLogs.slice(0, 15);
        displayLogs.forEach((log) => {
          const status = log.status === "taken" ? "✓ Taken" : log.status === "missed" ? "✗ Missed" : "○ Pending";
          const medName = (log.medications as any)?.name || "Unknown";
          doc.text(
            `${format(new Date(log.scheduled_time), "MMM d, h:mm a")} - ${medName} - ${status}`,
            20,
            yPos
          );
          yPos += 6;
        });
      }
      
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("This report is for informational purposes only.", 20, 280);
      doc.text(`Prepared by: Dr. ${caregiverName} | Smart Medicine Reminder App`, 20, 286);
      
      doc.save(`${patient.name.replace(/\s+/g, "_")}_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Report downloaded!");
    } catch (err) {
      console.error("Error generating report:", err);
      toast.error("Failed to generate report");
    } finally {
      setDownloadingReport(null);
    }
  };

  const generateAllReports = async () => {
    for (const patient of patients) {
      await generatePatientReport(patient);
    }
  };

  const avgAdherence = patients.length > 0
    ? Math.round(patients.reduce((acc, p) => acc + p.adherenceScore, 0) / patients.length)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-safe px-4 py-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Patient Reports
        </h1>
        <p className="text-white/80 text-sm mt-1">
          Download health reports for your patients
        </p>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Summary Card */}
        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent border-primary/20">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Users className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{patients.length}</p>
                <p className="text-xs text-muted-foreground">Patients</p>
              </div>
              <div>
                <Activity className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{avgAdherence}%</p>
                <p className="text-xs text-muted-foreground">Avg Adherence</p>
              </div>
              <div>
                <Calendar className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{format(new Date(), "MMM d")}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {patients.length > 0 && (
          <Button
            className="w-full bg-gradient-primary text-primary-foreground hover:brightness-110"
            onClick={generateAllReports}
          >
            <Download className="w-4 h-4 mr-2" />
            Download All Reports
          </Button>
        )}

        {loading || linksLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Loading reports...</p>
            </CardContent>
          </Card>
        ) : patients.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">No Reports Available</h3>
              <p className="text-sm text-muted-foreground">
                You need active patients to generate reports.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="space-y-3 pr-2">
              {patients.map((patient, index) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                            <span className="text-sm font-bold text-white">
                              {patient.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{patient.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{patient.medicationCount} meds</span>
                              <span>•</span>
                              <span className={patient.adherenceScore >= 80 ? "text-emerald-600" : patient.adherenceScore >= 50 ? "text-amber-600" : "text-red-600"}>
                                {patient.adherenceScore}% adherence
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/30 text-primary hover:bg-accent"
                          onClick={() => generatePatientReport(patient)}
                          disabled={downloadingReport === patient.id}
                        >
                          {downloadingReport === patient.id ? (
                            <span className="animate-spin">⏳</span>
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
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
